// pages/api/ocr.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';
import crypto from 'crypto';

export const config = {
  api: { bodyParser: false }, // lasciamo disattivato per supportare multipart
};

const MODEL_VISION = process.env.OCR_VISION_MODEL || 'gpt-4o-mini';

function sanitize(text = '') {
  const BAD = /(mi\s*dispiace|non\s*posso\s*aiut|cannot\s*assist|i\s*can't|policy)/i;
  return String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !BAD.test(s))
    .join('\n')
    .trim();
}

async function bufferFromDataUrl(dataUrl) {
  const m = /^data:(.*?);base64,(.*)$/i.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1] || 'image/jpeg';
  const buf = Buffer.from(m[2], 'base64');
  return { buf, mime, name: 'upload.' + (mime.split('/')[1] || 'jpg') };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY non configurata' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // ================== 1) Ingresso: JSON o multipart ==================
    let files = [];
    let fields = {};

    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      // JSON: ci aspettiamo dataUrl (base64) o imageUrl pubblico
      const body = await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
          try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); }
        });
        req.on('error', reject);
      });

      const { dataUrl, imageUrl } = body || {};
      if (!dataUrl && !imageUrl) return res.status(400).json({ error: 'Provide dataUrl (base64) or imageUrl' });

      if (dataUrl) {
        const f = await bufferFromDataUrl(dataUrl);
        if (!f) return res.status(400).json({ error: 'dataUrl non valido' });
        files = [f];
      } else {
        // imageUrl remoto: non scarichiamo, lo passiamo direttamente al modello
        files = [{ remoteUrl: imageUrl }];
      }
    } else {
      // multipart: come nel tuo codice originale
      const parsed = await new Promise((resolve, reject) => {
        const form = formidable({ multiples: true, keepExtensions: true });
        form.parse(req, (err, flds, f) => (err ? reject(err) : resolve({ fields: flds, files: f })));
      });
      fields = parsed.fields || {};
      const grab = (k) => {
        const v = parsed.files?.[k];
        return v ? (Array.isArray(v) ? v : [v]) : [];
        };
      let fileList = [
        ...grab('images'), ...grab('files'), ...grab('file'), ...grab('image'),
      ];
      if (!fileList.length) fileList = Object.values(parsed.files || {}).flat().filter(Boolean);

      // de-dup per hash
      const seen = new Set();
      for (const f of fileList) {
        const p = f.filepath || f.path;
        const buf = await fs.readFile(p);
        const h = crypto.createHash('sha256').update(buf).digest('hex');
        if (seen.has(h)) continue;
        seen.add(h);
        files.push({ buf, mime: (f.mimetype || '').toLowerCase(), name: f.originalFilename || '' });
      }
    }

    if (!files.length) return res.status(400).json({ error: 'Nessun file immagine ricevuto' });

    // ================== 2) OCR / estrazione testo ==================
    let textChunks = [];

    for (const f of files) {
      // PDF → testo (best-effort)
      if ((f.mime && f.mime.includes('pdf')) || /\.pdf$/i.test(f.name || '')) {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(f.buf);
        const t = String(parsed?.text || '').trim();
        if (t) textChunks.push(t);
        continue;
      }

      // IMMAGINE → OpenAI Vision
      let imagePart;
      if (f.remoteUrl) {
        imagePart = { type: 'image_url', image_url: { url: f.remoteUrl } };
      } else {
        const mime = f.mime || 'image/jpeg';
        const b64 = f.buf.toString('base64');
        const dataUrl = `data:${mime};base64,${b64}`;
        imagePart = { type: 'image_url', image_url: { url: dataUrl } };
      }

      const basePrompt =
        'Trascrivi TUTTO il testo stampato visibile dell’immagine (etichette vino, formaggi/salumi, scontrini). ' +
        'Mantieni l’ordine dall’alto al basso. Niente commenti, solo testo puro.';

      // primo pass
      let ocrTxt = '';
      try {
        const r1 = await client.chat.completions.create({
          model: MODEL_VISION,
          temperature: 0,
          messages: [{ role: 'user', content: [{ type: 'text', text: basePrompt }, imagePart] }],
        });
        ocrTxt = sanitize(r1?.choices?.[0]?.message?.content || '');
      } catch (e) {
        // fallback: tenta ancora con istruzioni più “forti”
        const r2 = await client.chat.completions.create({
          model: MODEL_VISION,
          temperature: 0,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: basePrompt + ' Leggi anche testo in piccolo, curvo o con contrasto basso. Usa capoversi separati.' },
              imagePart
            ],
          }],
        });
        ocrTxt = sanitize(r2?.choices?.[0]?.message?.content || '');
      }

      if (ocrTxt) textChunks.push(ocrTxt);
    }

    const fullText = sanitize(textChunks.join('\n').trim());
    return res.status(200).json({ ok: true, text: fullText });
  } catch (err) {
    console.error('[OCR] fail', err);
    return res.status(500).json({ error: err?.message || String(err), text: '' });
  }
}
