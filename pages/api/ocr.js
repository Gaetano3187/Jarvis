// pages/api/ocr.js
export const config = { api: { bodyParser: false } };
export const runtime = 'nodejs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { IncomingForm } = await import('formidable');
  const fs = await import('fs/promises');

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
    return res.status(500).json({ error: err.message });
  }

  const upload = Array.isArray(files?.images) ? files.images[0] : files?.images;
  if (!upload) return res.status(400).json({ error: 'Nessun file nel campo "images"' });

  const formData = new FormData();
  formData.append('apikey', process.env.OCRSPACE_API_KEY ?? 'helloworld');
  formData.append('language', 'ita');
  formData.append('isOverlayRequired', 'false');

  const buffer = await fs.readFile(upload.filepath);
  formData.append('file', new Blob([buffer]), upload.originalFilename || 'upload');

  let ocrJson;
  try {
    const resp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
    ocrJson = await resp.json();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (ocrJson.IsErroredOnProcessing) {
    return res.status(500).json({ error: ocrJson.ErrorMessage });
  }

  const text = (ocrJson.ParsedResults || []).map(r => r.ParsedText).join('\n').trim();
  try { await fs.unlink(upload.filepath); } catch {}

  res.status(200).json({ text });
}
