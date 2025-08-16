// pages/api/ocr.js
import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: { bodyParser: false },
  runtime: 'nodejs',
};

const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';

/** helper: parse multipart con formidable */
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      multiples: true,
      keepExtensions: true,
      maxFileSize: 15 * 1024 * 1024, // 15MB per file
      maxTotalFileSize: 60 * 1024 * 1024,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

/** helper: timeout per fetch */
async function fetchWithTimeout(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** opzionale: HEIC → JPEG (solo se 'sharp' è disponibile) */
async function maybeConvertHeic(filepath, mimetype, originalFilename) {
  const isHeic = /heic|heif/i.test(mimetype || '') || /\.hei[c|f]$/i.test(originalFilename || '');
  if (!isHeic) return { filepath, mimetype, originalFilename };

  try {
    // import dinamico: non obbliga ad avere sharp in dipendenze
    const sharp = (await import('sharp')).default;
    const buf = await fs.promises.readFile(filepath);
    const out = await sharp(buf).jpeg({ quality: 90 }).toBuffer();

    const outPath = filepath + '.jpg';
    await fs.promises.writeFile(outPath, out);
    // elimina l'originale HEIC per non sporcare /tmp
    try { await fs.promises.unlink(filepath); } catch {}
    const outName =
      (originalFilename ? path.parse(originalFilename).name : 'upload') + '.jpg';

    return { filepath: outPath, mimetype: 'image/jpeg', originalFilename: outName };
  } catch (e) {
    // se la conversione fallisce, continuiamo con l'originale (OCR.space potrebbe non supportarlo)
    return { filepath, mimetype, originalFilename };
  }
}

/** invio singolo file a OCR.space */
async function ocrOneFile(localFile) {
  const stream = fs.createReadStream(localFile.filepath);
  const fd = new FormData();

  const apiKey = process.env.OCRSPACE_API_KEY || 'helloworld'; // test key: molto limitata
  fd.append('apikey', apiKey);
  fd.append('language', 'ita');
  fd.append('isOverlayRequired', 'false');
  // puoi sperimentare: 2=engine recente, 1=classico; alcuni scontrini vanno meglio con 2
  fd.append('OCREngine', '2');

  // nome leggibile
  const filename = localFile.originalFilename || 'upload.jpg';
  fd.append('file', stream, filename);

  const resp = await fetchWithTimeout(OCR_ENDPOINT, { method: 'POST', body: fd }, 45000);
  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  const raw = await resp.text();

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${raw?.slice(0, 200) || ''}`);
  }

  let json;
  try {
    json = ct.includes('application/json') ? JSON.parse(raw) : JSON.parse(raw);
  } catch {
    throw new Error(raw?.slice(0, 200) || 'Risposta non JSON dal servizio OCR');
  }

  if (json?.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join(' | ')
      : json.ErrorMessage || 'Errore durante l’elaborazione OCR';
    throw new Error(msg);
  }

  const text = (json?.ParsedResults || [])
    .map((r) => r?.ParsedText || '')
    .join('\n')
    .trim();

  return { name: filename, text };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { files } = await parseForm(req);

    // accetta sia "images" (array) che "file" singolo
    const candidates = [];
    const img = files?.images;
    const single = files?.file;
    if (Array.isArray(img)) candidates.push(...img);
    else if (img) candidates.push(img);
    if (Array.isArray(single)) candidates.push(...single);
    else if (single) candidates.push(single);

    if (!candidates.length) {
      return res.status(400).json({ error: 'Nessun file nel campo "images" (o "file")' });
    }

    // normalizza in array di { filepath, mimetype, originalFilename }
    const prepared = [];
    for (const f of candidates) {
      const base = {
        filepath: f.filepath,
        mimetype: f.mimetype || 'application/octet-stream',
        originalFilename: f.originalFilename || 'upload',
      };
      // HEIC → JPEG se possibile
      const converted = await maybeConvertHeic(
        base.filepath,
        base.mimetype,
        base.originalFilename
      );
      prepared.push(converted);
    }

    const results = [];
    for (const f of prepared) {
      try {
        const r = await ocrOneFile(f);
        results.push(r);
      } catch (err) {
        console.error('OCR error for', f.originalFilename, err);
        results.push({
          name: f.originalFilename || 'upload',
          text: '',
          error: String(err?.message || err),
        });
      } finally {
        // pulizia file locali
        if (f?.filepath) {
          fs.unlink(f.filepath, () => {});
        }
      }
    }

    // se tutti errori → 502 con primo messaggio utile
    const okAny = results.some((r) => r.text);
    if (!okAny) {
      const firstErr = results.find((r) => r.error)?.error || 'OCR fallito su tutti i file';
      return res.status(502).json({ error: firstErr, results });
    }

    // output sia aggregato "text" che dettaglio per-file (utile per debug front-end)
    const joined = results
      .map((r) => (r.error ? '' : `### ${r.name}\n${r.text}`))
      .filter(Boolean)
      .join('\n\n');

    return res.status(200).json({ text: joined, results });
  } catch (err) {
    console.error('OCR handler error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
