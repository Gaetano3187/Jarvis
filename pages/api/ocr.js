// pages/api/ocr.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';
import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY non configurata' });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // ——— Parse multipart
    const { files } = await new Promise((resolve, reject) => {
      const form = formidable({ multiples: true, keepExtensions: true });
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });

    // Raccogli TUTTI i campi possibili
    const pick = (k) => {
      const v = files?.[k];
      return v ? (Array.isArray(v) ? v : [v]) : [];
    };
    let fileList = [
      ...pick('images'),
      ...pick('files'),
      ...pick('file'),
      ...pick('image'),
    ];
    if (!fileList.length) {
      // fallback: prendi tutto quello che c'è
      fileList = Object.values(files || {}).flat().filter(Boolean);
    }
    if (!fileList.length) {
      return res.status(400).json({ error: 'Nessun file ricevuto' });
    }

    // Dedup per hash contenuto (evita doppie chiamate se hai inviato con alias multipli)
    const seen = new Set();
    const uniq = [];
    for (const f of fileList) {
      const p = f.filepath || f.path;
      const buf = await fs.readFile(p);
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      if (seen.has(h)) continue;
      seen.add(h);
      uniq.push({ buf, mime: (f.mimetype || '').toLowerCase(), name: f.originalFilename || '' });
    }

    const texts = [];
    for (const f of uniq) {
      // PDF via pdf-parse
      if (f.mime.includes('pdf') || /\.pdf$/i.test(f.name)) {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(f.buf);
        const t = String(parsed?.text || '').trim();
        if (t) texts.push(t);
        continue;
      }

      // Immagini via OpenAI Vision
      const b64 = f.buf.toString('base64');
      const dataUrl = `data:${f.mime || 'image/jpeg'};base64,${b64}`;

      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Trascrivi esattamente tutto il testo dello scontrino, riga per riga. Solo testo.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      });

      const t = String(resp?.choices?.[0]?.message?.content || '').trim();
      if (t) texts.push(t);
    }

    const text = texts.join('\n').trim();

    if (!text) {
      return res.status(422).json({
        error: 'OCR_EMPTY',
        info: {
          files_received: uniq.length,
          note: 'Verifica qualità immagine e che l’endpoint stia ricevendo correttamente il multipart.',
        },
      });
    }

    return res.status(200).json({ ok: true, text });
  } catch (err) {
    console.error('[OCR] fail', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
