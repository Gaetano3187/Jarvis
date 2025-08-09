// pages/api/assistant-ocr.js
import formidable from 'formidable';
import fs from 'fs';
import OpenAI from 'openai';

export const config = {
  api: { bodyParser: false }, // necessario per file upload
};

const ocrSystemPrompt = `
Sei un assistente OCR di scontrini.
Estrai e restituisci **SOLO** JSON con questo schema:

{
  "purchases": [{"name":"", "brand":"", "qty":1, "expiresAt":""}],
  "expiries": [{"name":"", "expiresAt":""}],
  "stock": [{"name":"", "brand":"", "qty":1, "expiresAt":""}]
}

- "expiresAt" se non presente lascia "".
- "qty" numero intero >= 1.
- Non aggiungere testo fuori dal JSON.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // 1) parse form-data
    const form = formidable({ multiples: true });
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, flds, fls) => (err ? reject(err) : resolve({ fields: flds, files: fls })));
    });

    const hints = fields.hints ? JSON.parse(fields.hints) : {};
    const intent = fields.intent || 'general';
    const item = fields.item ? JSON.parse(fields.item) : null;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const purchases = [];
    const expiries = [];
    const stock = [];

    // 2) normalizza i file (formidable può dare singolo/array)
    const fileList = Object.values(files).flatMap(v => (Array.isArray(v) ? v : [v]));

    for (const f of fileList) {
      const filePath = f.filepath || f.path;
      const mime = f.mimetype || 'application/octet-stream';

      // 📄 Leggi il file
      const buf = fs.readFileSync(filePath);

      // 3) Costruisci messaggi: se immagine/pdf passa come data URL, altrimenti testo
      const userContent = [
        { type: 'text', text: `OCR scontrino. Intent: ${intent}. Hints: ${JSON.stringify(hints)}. Item: ${JSON.stringify(item)}` },
      ];

      // Proviamo a passare come immagine/pdf (base64 data url).
      const asDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      userContent.push({ type: 'image_url', image_url: { url: asDataUrl } });

      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ocrSystemPrompt },
          { role: 'user', content: userContent },
        ],
      });

      let parsed = {};
      try {
        parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
      } catch (_) {
        parsed = {};
      }

      if (Array.isArray(parsed.purchases)) purchases.push(...parsed.purchases);
      if (Array.isArray(parsed.expiries)) expiries.push(...parsed.expiries);
      if (Array.isArray(parsed.stock)) stock.push(...parsed.stock);
    }

    return res.status(200).json({ data: { purchases, expiries, stock } });
  } catch (err) {
    console.error('[assistant-ocr] error', err);
    return res.status(500).json({ error: 'OCR processing failed' });
  }
}
