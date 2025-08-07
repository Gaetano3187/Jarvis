// pages/api/ocr.js

export const config = {
  api: { bodyParser: false },
};

// forza runtime Node (non Edge)
export const runtime = 'nodejs';

import fs from 'fs/promises';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // import dinamico: evita che webpack cerchi di bundlare "formidable" nel client
  const { IncomingForm } = await import('formidable');

  // 1) parse multipart/form-data
  let files;
  try {
    ({ files } = await new Promise((resolve, reject) => {
      const form = new IncomingForm({ keepExtensions: true });
      form.parse(req, (err, _fields, files) => {
        if (err) return reject(err);
        resolve({ files });
      });
    }));
  } catch (err) {
    console.error('parse error:', err);
    return res.status(500).json({ error: err.message });
  }

  // 2) prendi il primo file in files.images
  const upload = Array.isArray(files?.images) ? files.images[0] : files?.images;
  if (!upload) {
    return res.status(400).json({ error: 'Nessun file nel campo "images"' });
  }

  // 3) prepara il FormData nativo
  const formData = new FormData();
  formData.append('apikey', process.env.OCRSPACE_API_KEY ?? 'helloworld');
  formData.append('language', 'ita');
  formData.append('isOverlayRequired', 'false');

  try {
    const buffer = await fs.readFile(upload.filepath);
    const blob = new Blob([buffer]); // Blob & FormData sono nativi in Node 18+
    formData.append('file', blob, upload.originalFilename || 'upload');
  } catch (err) {
    console.error('file read error:', err);
    return res.status(500).json({ error: 'Impossibile leggere il file caricato' });
  }

  // 4) invoca l’API OCR.space
  let ocrJson;
  try {
    const resp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
    ocrJson = await resp.json();
  } catch (err) {
    console.error('fetch error:', err);
    return res.status(500).json({ error: err.message });
  }

  if (ocrJson.IsErroredOnProcessing) {
    console.error('OCR error:', ocrJson.ErrorMessage);
    return res.status(500).json({ error: ocrJson.ErrorMessage });
  }

  // 5) concatena tutti i testi trovati
  const text = (ocrJson.ParsedResults || [])
    .map(r => r.ParsedText)
    .join('\n')
    .trim();

  // 6) pulisci file temporaneo (best-effort)
  try { await fs.unlink(upload.filepath); } catch {}

  // 7) restituisci il risultato
  res.status(200).json({ text });
}
