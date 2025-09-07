// pages/api/ocr-generic.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';
import crypto from 'crypto';

export const config = {
  api: { bodyParser: false }, // necessario per multipart
};

const MODEL_VISION = (process.env.OCR_VISION_MODEL || 'gpt-4o-mini').trim();

function asDataUrl(buf, mime='image/jpeg') {
  const b64 = Buffer.from(buf).toString('base64');
  return `data:${mime};base64,${b64}`;
}
function isPdf(f){ return (f?.mime || '').includes('pdf') || /\.pdf$/i.test(f?.name || ''); }

async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      const picks = [];
      const take = (k) => {
        const v = files?.[k];
        if (!v) return;
        (Array.isArray(v) ? v : [v]).forEach(x => picks.push(x));
      };
      // nomi comuni degli input
      ['images','image','file','files'].forEach(take);
      if (picks.length === 0) {
        Object.values(files || {}).forEach(v => (Array.isArray(v) ? v : [v]).forEach(x => picks.push(x)));
      }
      resolve({ fields, files: picks });
    });
  });
}

async function pdfToText(nodeBuffer) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const out = await pdfParse(nodeBuffer);
    return String(out?.text || '').trim();
  } catch {
    return '';
  }
}

async function runVision(client, prompts) {
  // prompts: array di { dataUrl } o { remoteUrl }
  const content = [
    {
      type: 'text',
      text: 'Trascrivi integralmente tutto il testo visibile. Mantieni l’ordine naturale di lettura. Nessun commento.'
    }
  ];
  for (const p of prompts) {
    if (p.remoteUrl) content.push({ type:'image_url', image_url:{ url: p.remoteUrl }});
    else if (p.dataUrl) content.push({ type:'image_url', image_url:{ url: p.dataUrl }});
  }
  const r = await client.chat.completions.create({
    model: MODEL_VISION,
    temperature: 0,
    messages: [{ role:'user', content }]
  });
  return String(r?.choices?.[0]?.message?.content || '').trim();
}

export default async function handler(req, res) {
  let pages = 0;
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok:false, error:'Method not allowed' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok:false, error:'OPENAI_API_KEY mancante' });
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const ct = String(req.headers['content-type'] || '').toLowerCase();
    let items = []; // { buf, mime, name } oppure { remoteUrl }

    if (ct.includes('application/json')) {
      // JSON: { dataUrl?, imageUrl? }
      const body = await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', c => raw += c);
        req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch(e){ reject(e); }});
        req.on('error', reject);
      });
      if (body?.dataUrl) {
        const m = /^data:(.*?);base64,(.*)$/i.exec(body.dataUrl);
        if (m) {
          const mime = m[1] || 'image/jpeg';
          const buf = Buffer.from(m[2], 'base64');
          items.push({ buf, mime, name:'upload.' + (mime.split('/')[1] || 'jpg') });
        }
      } else if (body?.imageUrl) {
        items.push({ remoteUrl: body.imageUrl });
      }
    } else {
      // multipart
      const { files } = await parseMultipart(req);
      const seen = new Set();
      for (const f of files) {
        const path = f.filepath || f.path;
        const buf = await fs.readFile(path);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        if (seen.has(hash)) continue;
        seen.add(hash);
        items.push({
          buf,
          mime: (f.mimetype || 'application/octet-stream').toLowerCase(),
          name: f.originalFilename || f.newFilename || 'upload.bin',
        });
      }
    }

    if (items.length === 0) {
      return res.status(400).json({ ok:false, error:'Nessun file immagine/PDF ricevuto' });
    }

    const textChunks = [];

    // 1) PDF → testo
    for (const it of items) {
      if (isPdf(it)) {
        const t = await pdfToText(it.buf);
        if (t) textChunks.push(t);
      }
    }

    // 2) IMMAGINI → Vision
    const imagePrompts = [];
    for (const it of items) {
      if (isPdf(it)) continue;
      if (it.remoteUrl) imagePrompts.push({ remoteUrl: it.remoteUrl });
      else {
        const mime = it.mime?.startsWith('image/') ? it.mime : 'image/jpeg';
        imagePrompts.push({ dataUrl: asDataUrl(it.buf, mime) });
      }
    }
    if (imagePrompts.length) {
      const visionText = await runVision(client, imagePrompts);
      if (visionText) textChunks.push(visionText);
      pages += imagePrompts.length;
    }

    const fullText = textChunks.map(s => String(s || '').trim()).filter(Boolean).join('\n').trim();

    return res.status(200).json({
      ok: true,
      text: fullText,
      pages: pages || undefined,
      model: MODEL_VISION,
    });
  } catch (err) {
    console.error('[OCR-generic] fail:', err);
    return res.status(500).json({
      ok:false,
      error: err?.message || String(err),
      text: '',
    });
  }
}
