// pages/api/ocr-generic.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';
import crypto from 'crypto';

export const config = {
  // disabilitiamo il bodyParser (usiamo formidable) e alziamo limite a monte
  api: { bodyParser: false, sizeLimit: '16mb' },
};

const MODEL_VISION = (process.env.OCR_VISION_MODEL || 'gpt-4o-mini').trim();

// === util ===
function asDataUrl(buf, mime = 'image/jpeg') {
  const b64 = Buffer.from(buf).toString('base64');
  return `data:${mime};base64,${b64}`;
}
function isPdf(f) {
  return (f?.mime || '').includes('pdf') || /\.pdf$/i.test(f?.name || '');
}
function pick(arr, n) {
  return Array.isArray(arr) && arr.length > n ? arr.slice(0, n) : arr;
}
function extFromMime(m = '') {
  try { return m.split('/')[1] || 'jpg'; } catch { return 'jpg'; }
}

// riduzione server-side (se sharp è disponibile)
async function downscaleBuffer(buf, mime) {
  try {
    const sharp = (await import('sharp')).default;
    const MAX_SIDE = 1600;
    const QUALITY  = 72;
    const img = sharp(buf, { failOn: false });
    const meta = await img.metadata();
    const w = meta.width || 0, h = meta.height || 0;
    const side = Math.max(w, h);
    let pipe = img.rotate(); // autorotate EXIF

    // HEIC/HEIF → JPEG
    const isHeic = /heic|heif/i.test(meta.format || mime || '');
    if (isHeic) {
      pipe = pipe.jpeg({ quality: QUALITY });
    }

    if (side > MAX_SIDE) {
      const scale = MAX_SIDE / side;
      const W = Math.max(1, Math.round((w || MAX_SIDE) * scale));
      const H = Math.max(1, Math.round((h || MAX_SIDE) * scale));
      pipe = pipe.resize(W, H, { fit: 'inside' });
    }

    // output JPEG per essere sicuri
    const out = await pipe.jpeg({ quality: QUALITY }).toBuffer();
    return { buf: out, mime: 'image/jpeg' };
  } catch {
    // se sharp non c'è o fallisce, restituisci originale
    return { buf, mime: mime && mime.startsWith('image/') ? mime : 'image/jpeg' };
  }
}

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
      // nomi più comuni
      ['images', 'image', 'files', 'file', 'images[]'].forEach(take);
      // ultima chance: prendi tutto
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
  // prompts: [{ dataUrl } | { remoteUrl }]
  const content = [
    {
      type: 'text',
      text: 'Trascrivi integralmente tutto il testo visibile. Mantieni l’ordine naturale di lettura. Nessun commento.',
    },
  ];
  for (const p of prompts) {
    if (p.remoteUrl) content.push({ type: 'image_url', image_url: { url: p.remoteUrl } });
    else if (p.dataUrl) content.push({ type: 'image_url', image_url: { url: p.dataUrl } });
  }
  const r = await client.chat.completions.create({
    model: MODEL_VISION,
    temperature: 0,
    messages: [{ role: 'user', content }],
  });
  return String(r?.choices?.[0]?.message?.content || '').trim();
}

export default async function handler(req, res) {
  // CORS/Preflight (Safari può fare OPTIONS anche se same-origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let pages = 0;
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY mancante' });
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const ct = String(req.headers['content-type'] || '').toLowerCase();
    const items = []; // { buf, mime, name } | { remoteUrl }

    // 1) JSON
    if (ct.includes('application/json')) {
      const body = await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); }
        });
        req.on('error', reject);
      });

      const pushDataUrl = (du) => {
        const m = /^data:(.*?);base64,(.*)$/i.exec(du || '');
        if (m) {
          const mime = (m[1] || 'image/jpeg').toLowerCase();
          const buf = Buffer.from(m[2], 'base64');
          items.push({ buf, mime, name: 'upload.' + extFromMime(mime) });
        }
      };

      if (body?.dataUrl) pushDataUrl(body.dataUrl);
      if (Array.isArray(body?.dataUrls)) body.dataUrls.forEach(pushDataUrl);
      if (body?.imageUrl) items.push({ remoteUrl: body.imageUrl });
    } else {
      // 2) multipart
      const { files } = await parseMultipart(req);

      // limite immagini per prevenire 413 lato piattaforma
      const MAX_FILES = 6;
      const limited = pick(files || [], MAX_FILES);

      const seen = new Set();
      for (const f of limited) {
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

    if (!items.length) {
      return res.status(400).json({ ok: false, error: 'Nessun file immagine/PDF ricevuto' });
    }

    const textChunks = [];

    // PDF → testo
    for (const it of items) {
      if (isPdf(it)) {
        const t = await pdfToText(it.buf);
        if (t) textChunks.push(t);
      }
    }

    // IMMAGINI → downscale + Vision
    const imagePrompts = [];
    for (const it of items) {
      if (isPdf(it)) continue;

      if (it.remoteUrl) {
        imagePrompts.push({ remoteUrl: it.remoteUrl });
      } else {
        // riduci server-side (se possibile)
        const { buf: small, mime } = await downscaleBuffer(it.buf, it.mime);
        imagePrompts.push({ dataUrl: asDataUrl(small, mime) });
      }
    }

    if (imagePrompts.length) {
      // batch da 3 per stare larghi con token/latency
      const BATCH = 3;
      for (let i = 0; i < imagePrompts.length; i += BATCH) {
        const slice = imagePrompts.slice(i, i + BATCH);
        const visionText = await runVision(client, slice);
        if (visionText) textChunks.push(visionText);
        pages += slice.length;
      }
    }

    const fullText = textChunks.map(s => String(s || '').trim()).filter(Boolean).join('\n').trim();

    return res.status(200).json({
      ok: true,
      text: fullText,
      pages: pages || undefined,
      model: MODEL_VISION,
    });
  } catch (err) {
    console.error('[ocr-generic] fail:', err);
    // messaggi più leggibili in client
    const msg = err?.message || String(err);
    // alcuni provider rispondono con 413/405 lato edge: riflettilo
    if (/413|payload too large/i.test(msg)) {
      return res.status(413).json({ ok: false, error: 'Payload troppo grande' });
    }
    return res.status(500).json({ ok: false, error: msg, text: '' });
  }
}
