// pages/api/ocr.js
import formidable from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, _fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const file = files.ocrFile;
    const formData = new FormData();

    formData.append('file', fs.createReadStream(file.filepath));
    formData.append('apikey', process.env.OCR_SPACE_API_KEY);
    formData.append('language', 'ita');
    formData.append('OCREngine', '2');
    formData.append('isTable', 'true');           // rileva tabelle
    formData.append('detectOrientation', 'true'); // ruota automaticamente
    formData.append('scale', 'true');             // migliora risoluzione

    try {
      const ocrRes = await fetch('https://api.ocr.space/Parse/Image', {
        method: 'POST',
        headers: formData.getHeaders(),
        body: formData,
      });
      const data = await ocrRes.json();
      res.status(200).json(data);
    } catch (fetchErr) {
      res.status(500).json({ error: fetchErr.message });
    }
  });
}
