// pages/api/ocr.js
import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: { bodyParser: false },   // necessario per multipart
  runtime: 'nodejs',            // evita Edge
};

const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';

/* ===================== helpers ===================== */

/** parse multipart (Pages API) */
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      multiples: true,
      keepExtensions: true,
      maxFileSize: 15 * 1024 * 1024,   // 15MB per file
      maxTotalFileSize: 60 * 1024 * 1024,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

/** fetch con timeout */
async function fetchWithTimeout(url, opts = {}, ms = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** opzionale: HEIC → JPEG (se 'sharp' presente) */
async function maybeConvertHeic(filepath, mimetype, originalFilename) {
  const isHeic =
    /heic|heif/i.test(mimetype || '') || /\.hei[cf]$/i.test(originalFilename || '');
  if (!isHeic) return { filepath, mimetype, originalFilename };

  try {
    const sharp = (await import('sharp')).default;
    const buf = await fs.promises.readFile(filepath);
    const out = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
    const outPath = filepath + '.jpg';
    await fs.promises.writeFile(outPath, out);

    try { await fs.promises.unlink(filepath); } catch {}
    const outName =
      (originalFilename ? path.parse(originalFilename).name : 'upload') + '.jpg';

    return { filepath: outPath, mimetype: 'image/jpeg', originalFilename: outName };
  } catch {
    // se fallisce, proseguiamo col file originale
    return { filepath, mimetype, originalFilename };
  }
}

/** invio singolo file a OCR.space (mai throw hard: ritorna {text:'' , error}) */
async function ocrOneFile(localFile) {
  const stream = fs.createReadStream(localFile.filepath);
  const fd = new FormData();

  const apiKey = process.env.OCRSPACE_API_KEY || 'helloworld'; // demo key: molto limitata
  fd.append('apikey', apiKey);
  fd.append('language', 'ita');
  fd.append('isOverlayRequired', 'false');
  fd.append('OCREngine', '2');

  const filename = localFile.originalFilename || 'upload.jpg';
  fd.append('file', stream, filename);

  let resp;
  let raw;
  try {
    resp = await fetchWithTimeout(OCR_ENDPOINT, { method: 'POST', body: fd }, 45000);
    raw = await resp.text();
  } catch (e) {
    return { name: filename, text: '', error: `OCR fetch error: ${e?.message || e}` };
  }

  if (!resp.ok) {
    // NON alziamo eccezione: lasciamo al chiamante gestire il fallback
    return { name: filename, text: '', error: `HTTP ${resp.status} ${resp.statusText} — ${raw?.slice(0, 200) || ''}` };
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return { name: filename, text: '', error: raw?.slice(0, 200) || 'Risposta non JSON dal servizio OCR' };
  }

  if (json?.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join(' | ')
      : json.ErrorMessage || 'Errore durante l’elaborazione OCR';
    return { name: filename, text: '', error: msg };
  }

  const text = (json?.ParsedResults || [])
    .map((r) => r?.ParsedText || '')
    .join('\n')
    .trim();

  return { name: filename, text };
}

/* ===================== handler ===================== */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { files } = await parseForm(req);

    // accetta "images" (array) e/o "file" singolo
    const candidates = [];
    const img = files?.images;
    const single = files?.file;
    if (Array.isArray(img)) candidates.push(...img);
    else if (img) candidates.push(img);
    if (Array.isArray(single)) candidates.push(...single);
    else if (single) candidates.push(single);

    if (!candidates.length) {
      // ritorna comunque 200 per non far fallire il client
      return res.status(200).json({ ok: true, text: '' });
    }

    // normalizza + HEIC→JPEG se possibile
    const prepared = [];
    for (const f of candidates) {
      const base = {
        filepath: f.filepath,
        mimetype: f.mimetype || 'application/octet-stream',
        originalFilename: f.originalFilename || 'upload',
      };
      prepared.push(await maybeConvertHeic(base.filepath, base.mimetype, base.originalFilename));
    }

    // OCR tutti i file (non interrompere su errori)
    const results = [];
    for (const f of prepared) {
      try {
        const r = await ocrOneFile(f);
        results.push(r);
      } finally {
        // pulizia temp
        if (f?.filepath) fs.unlink(f.filepath, () => {});
      }
    }

    const okAny = results.some((r) => r.text);
    if (!okAny) {
      const firstErr = results.find((r) => r.error)?.error || 'OCR: nessun testo';
      console.warn('[api/ocr] nessun testo estratto:', firstErr);
      // mai 502: il client farà fallback (AI parsing “busta” ecc.)
      return res.status(200).json({ ok: true, text: '', results, warning: firstErr });
    }

    const joined = results
      .map((r) => (r.error ? '' : `### ${r.name}\n${r.text}`))
      .filter(Boolean)
      .join('\n\n');

    return res.status(200).json({ ok: true, text: joined, results });
  } catch (err) {
    console.error('OCR handler error:', err);
    return res.status(200).json({ ok: true, text: '', error: String(err?.message || err) });
  }
}
