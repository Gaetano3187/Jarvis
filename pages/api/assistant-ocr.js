// pages/api/ocr.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';

export const config = { api: { bodyParser: false } }; // indispensabile per form-data

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
    // --- parse multipart form ---
    const { files } = await new Promise((resolve, reject) => {
      const form = formidable({ multiples: true, keepExtensions: true });
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });

    // raccogli TUTTI i possibili campi di file
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

    // se l’uploader usa altri nomi, prendi comunque tutto
    if (!fileList.length) {
      fileList = Object.values(files || {}).flat().filter(Boolean);
    }
    if (!fileList.length) {
      return res.status(400).json({ error: 'Nessun file ricevuto' });
    }

    const texts = [];

    for (const f of fileList) {
      const filepath = f.filepath || f.path;
      const mimetype = (f.mimetype || '').toLowerCase();
      const orig = f.originalFilename || '';

      const buf = await fs.readFile(filepath);

      // --- PDF: usa pdf-parse ---
      if (mimetype.includes('pdf') || /\.pdf$/i.test(orig)) {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(buf);
        const t = String(parsed?.text || '').trim();
        if (t) texts.push(t);
        continue;
      }

      // --- Immagini: OpenAI Vision ---
      const b64 = buf.toString('base64');
      const dataUrl = `data:${mimetype || 'image/jpeg'};base64,${b64}`;

      const resp = await client.chat.completions.create({
        model: process.env.OCR_VISION_MODEL || 'gpt-4o',
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Trascrivi esattamente tutto il testo leggibile nello scontrino. ' +
                  'Mantieni l’ordine riga-per-riga. Nessuna spiegazione, solo testo puro.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      });

      const t = String(resp?.choices?.[0]?.message?.content || '').trim();
      if (t) texts.push(t);
    }

    const text = texts.join('\n').trim();
    return res.status(200).json({ ok: true, text });
  } catch (err) {
    console.error('[OCR] fail', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
