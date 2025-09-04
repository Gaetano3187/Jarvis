// pages/api/assistant/vision.js
export const config = { api: { bodyParser: false, sizeLimit: '16mb' } };

import formidable from 'formidable';
import fs from 'fs/promises';

/* ---------- CORS ---------- */
function setCORS(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/* ---------- Form/multipart: accetta 1..N immagini ---------- */
async function readMultipart(req) {
  const form = formidable({
    multiples: true,
    maxFiles: 6,
    allowEmptyFiles: false,
  });

  const { fields, files } = await new Promise((ok, ko) => {
    form.parse(req, (err, fields, files) => (err ? ko(err) : ok({ fields, files })));
  });

  const pick = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const all = [
    ...pick(files.images),
    ...pick(files.image),
    ...pick(files.file),
  ].filter(Boolean);

  if (!all.length) throw new Error('Nessuna immagine ricevuta');

  const prompt =
    (fields?.prompt && (Array.isArray(fields.prompt) ? fields.prompt[0] : fields.prompt)) || '';

  return { files: all.slice(0, 6), prompt };
}

/* ---------- File → dataURL ---------- */
async function filesToDataUrls(fileList) {
  const toDataUrl = async (f) => {
    const p = f.filepath || f._writeStream?.path || f.path;
    const buf = await fs.readFile(p);
    const mime = f.mimetype || 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  };
  return Promise.all(fileList.map(toDataUrl));
}

/* ---------- Prompt scontrino (schema rigido) ---------- */
function buildReceiptPrompt(userPrompt = '') {
  const extra = userPrompt ? `\nNota utente: ${userPrompt}\n` : '';
  return [
    'Sei Jarvis. Hai 1..N foto di UNO SCONTRINO.',
    'RISPONDI SOLO JSON valido con schema ESATTO:',
    '{',
    '  "store":"",',
    '  "purchaseDate":"",',
    '  "purchases":[ {',
    '    "name":"", "brand":"", "packs":0, "unitsPerPack":0, "unitLabel":"",',
    '    "priceEach":0, "priceTotal":0, "currency":"EUR", "expiresAt":""',
    '  } ]',
    '}',
    '',
    'Regole:',
    '- NON normalizzare/riscrivere i nomi: mantieni esattamente quelli sullo scontrino.',
    '- Quantità SOLO se esplicite (es.: "2x6", "2 confezioni da 6", "6 bottiglie").',
    '- Pesi/volumi/dimensioni (g, kg, ml, L, cm, …) NON sono quantità: non usarli per packs/unitsPerPack.',
    '- Se non appare il prezzo unitario, priceEach=0; se non appare il totale riga, priceTotal=0.',
    '- purchaseDate in formato YYYY-MM-DD se presente.',
    '- currency "EUR" se non specificato.',
    extra
  ].join('\n');
}

/* ---------- Call OpenAI Vision (chat.completions) ---------- */
async function callOpenAIVision({ dataUrls, prompt }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY mancante');

  const content = [
    { type: 'text', text: buildReceiptPrompt(prompt) },
    ...dataUrls.map((u) => ({ type: 'image_url', image_url: { url: u } })),
  ];

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Rispondi solo con JSON valido.' },
        { role: 'user', content },
      ],
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Vision HTTP ${r.status}`);

  // Il modello dovrebbe già restituire JSON puro; in caso contrario, prova a "ripulire".
  const text = data?.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}$/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Risposta Vision non in JSON.');
  }
}

/* ---------- Handler ---------- */
export default async function handler(req, res) {
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, info: 'vision alive' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { files, prompt } = await readMultipart(req);
    const dataUrls = await filesToDataUrls(files);
    const json = await callOpenAIVision({ dataUrls, prompt });

    // Normalizza chiavi minime se mancanti
    const out = {
      store: String(json?.store || '').trim(),
      purchaseDate: String(json?.purchaseDate || '').trim(),
      purchases: Array.isArray(json?.purchases) ? json.purchases : [],
    };

    return res.status(200).json({ ok: true, data: out });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
