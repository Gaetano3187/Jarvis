// pages/api/ocr.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';
import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

const MODEL_VISION = process.env.OCR_VISION_MODEL || 'gpt-4o-mini';

function sanitize(text=''){
  // toglie eventuali messaggi “di rifiuto” superflui
  const BAD = /(mi\s*dispiace|non\s*posso\s*aiut|cannot\s*assist|i\s*can't|policy|trascrizion)/i;
  return String(text)
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !BAD.test(s))
    .join('\n');
}

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
    // 1) Parse multipart
    const { files } = await new Promise((resolve, reject) => {
      const form = formidable({ multiples: true, keepExtensions: true });
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });

    // raccogli TUTTE le possibili chiavi
    const grab = k => {
      const v = files?.[k];
      return v ? (Array.isArray(v) ? v : [v]) : [];
    };
    let fileList = [
      ...grab('images'), ...grab('files'), ...grab('file'), ...grab('image'),
    ];
    if (!fileList.length) fileList = Object.values(files || {}).flat().filter(Boolean);
    if (!fileList.length) return res.status(400).json({ error: 'Nessun file ricevuto' });

    // 2) Dedup per hash
    const seen = new Set();
    const uniq = [];
    for (const f of fileList) {
      const p = f.filepath || f.path;
      const buf = await fs.readFile(p);
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      if (seen.has(h)) continue;
      seen.add(h);
      uniq.push({ buf, mime: (f.mimetype || '').toLowerCase(), name: f.originalFilename || '' });
    }

    let textChunks = [];
    let structuredItems = [];

    // 3) Per ogni file: PDF → testo; Immagini → testo + tentativo “items”
    for (const f of uniq) {
      // PDF
      if (f.mime.includes('pdf') || /\.pdf$/i.test(f.name)) {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(f.buf);
        const t = String(parsed?.text || '').trim();
        if (t) textChunks.push(t);
        continue;
      }

      // IMMAGINE
      const b64 = f.buf.toString('base64');
      const dataUrl = `data:${f.mime || 'image/jpeg'};base64,${b64}`;

      // 3a) OCR puro (testo)
      const txtResp = await client.chat.completions.create({
        model: MODEL_VISION,
        temperature: 0,
        messages: [
          { role: 'system', content: 'Sei un motore OCR. Estrai SOLO il testo leggibile. Nessun commento.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Trascrivi tutto il testo dello scontrino, riga per riga. Solo testo.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      });
      const rawText = String(txtResp?.choices?.[0]?.message?.content || '').trim();
      const cleanText = sanitize(rawText);
      if (cleanText) textChunks.push(cleanText);

      // 3b) Estrattore strutturato “light” (items) — facoltativo
      try {
        const itemsResp = await client.chat.completions.create({
          model: MODEL_VISION,
          temperature: 0,
          messages: [
            { role: 'system', content: 'Sei un estrattore strutturato da foto scontrino. Rispondi SOLO JSON valido.' },
            {
              role: 'user',
              content: [
                { type: 'text', text:
`Estrai le voci di acquisto in JSON con schema:
{ "items":[
  {"name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","priceEach":0,"priceTotal":0,"currency":"EUR"}
]}
Regole:
- NON usare pesi/volumi come quantità.
- Quantità solo se compaiono pattern: "2x6", "2 conf da 6", "6 bottiglie", "30 pz", ecc.
- Ignora "TOTALE/IVA/OFFERTA/RESTO" e linee pagamento.
- brand breve (se deducibile), altrimenti "".` },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        });
        const raw = String(itemsResp?.choices?.[0]?.message?.content || '').trim();
        try {
          const parsed = JSON.parse(raw);
          const arr = Array.isArray(parsed?.items) ? parsed.items : [];
          if (arr.length) structuredItems.push(...arr);
        } catch { /* noop */ }
      } catch { /* best-effort */ }
    }

    const fullText = sanitize(textChunks.join('\n').trim());
    return res.status(200).json({
      ok: true,
      text: fullText,
      items: structuredItems, // può essere []
    });
  } catch (err) {
    console.error('[OCR] fail', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
