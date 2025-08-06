// pages/api/ocr.js
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { createWorker } from 'tesseract.js';

export const config = {
  api: {
    bodyParser: false,  // disabilita il parser built-in
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new IncomingForm({ multiples: false, keepExtensions: true });
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('⚠️ parse error:', err);
      return res.status(500).json({ step: 'parse', error: err.message });
    }

    console.log('➡️ OCR fields:', fields);
    console.log('➡️ OCR files keys:', Object.keys(files));
    const imageFile = files.image;  // deve corrispondere a fd.append('image', …)
    if (!imageFile) {
      console.error('❌ Nessun files.image trovato');
      return res.status(400).json({ step: 'no-file', error: 'files.image undefined' });
    }

    const imagePath = imageFile.filepath || imageFile.path;
    console.log('📂 OCR imagePath:', imagePath);

    const worker = createWorker({
      logger: m => console.log('📊 OCR progress:', m),
    });

    try {
      await worker.load();
      await worker.loadLanguage('ita');
      await worker.initialize('ita');

      const { data: { text } } = await worker.recognize(imagePath);
      console.log('✅ OCR result:', text.trim().slice(0,100), '…');
      return res.status(200).json({ text });
    } catch (ocrErr) {
      console.error('❌ OCR recognize error:', ocrErr);
      return res.status(500).json({ step: 'recognize', error: String(ocrErr) });
    } finally {
      await worker.terminate();
      try { fs.unlinkSync(imagePath); } catch {}
    }
  });
}
