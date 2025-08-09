// pages/api/assistant-ocr.js
import formidable from 'formidable';
import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

export const config = { api: { bodyParser: false } };

/* -------------------------- utils -------------------------- */
function parseForm(req) {
  const form = formidable({ multiples: true, maxFileSize: 20 * 1024 * 1024 });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
  });
}
function ensureArray(x) { return !x ? [] : Array.isArray(x) ? x : [x]; }
function safeParseJSON(s, fallback = null) { try { return JSON.parse(s); } catch { return fallback; } }
function castQty(n) {
  const v = Number(String(n).replace(',', '.'));
  return !Number.isFinite(v) || v <= 0 ? 1 : Math.max(1, Math.round(v));
}
function coercePurchases(raw) {
  const out = [];
  for (const p of raw || []) {
    const name = String(p?.name || '').trim();
    if (!name) continue;
    out.push({ name, brand: String(p?.brand || '').trim(), qty: castQty(p?.qty || 1) });
  }
  return out;
}

// mini mappa MIME senza pacchetti esterni
function extToMime(filename = '') {
  const ext = path.extname(String(filename).toLowerCase());
  switch (ext) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png':  return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif':  return 'image/gif';
    case '.heic': return 'image/heic';
    case '.heif': return 'image/heif';
    case '.pdf':  return 'application/pdf';
    default:      return 'application/octet-stream';
  }
}

async function fileToDataURL(fileObj) {
  const fp = fileObj.filepath || fileObj.path;
  const buf = await fs.readFile(fp);
  const type = fileObj.mimetype || extToMime(fileObj.originalFilename || fileObj.newFilename || '');
  const b64 = buf.toString('base64');
  return `data:${type};base64,${b64}`;
}

/* --------------------- prompt builders --------------------- */
function buildSystemPrompt() {
  return [
    'Sei un assistente che legge SCONTRINI DI SUPERMERCATO.',
    'Estrai SOLO gli articoli acquistati nel JSON:',
    '{ "purchases":[ { "name":"latte", "brand":"Parmalat", "qty":2 } ] }',
    'Regole:',
    '- Rispondi SOLO con JSON valido.',
    '- name: prodotto leggibile (es. "pasta", "latte intero").',
    '- brand: opzionale, vuoto se non riconosciuto.',
    '- qty: numero pezzi (default 1).',
    '- Ignora prezzi, totali, sconti, reparti, servizi, buste.',
  ].join('\n');
}
function buildUserPrompt({ hints }) {
  const lines = [
    'Estrai la lista prodotti acquistati dalle immagini di scontrino.',
    'Esempio: "2 x Latte Parmalat" => { name:"latte", brand:"Parmalat", qty:2 }.'
  ];
  if (hints?.lexicon?.length) {
    lines.push('Lessico di riferimento: ' + hints.lexicon.slice(0, 200).join(', '));
  }
  return lines.join('\n');
}

/* --------------------------- handler --------------------------- */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, data: null, error: 'Method Not Allowed' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, data: null, error: 'Missing OPENAI_API_KEY' });
  }

  let fields, files;
  try {
    ({ fields, files } = await parseForm(req));
  } catch (e) {
    return res.status(400).json({ ok: false, data: null, error: 'Bad multipart form: ' + (e?.message || e) });
  }

  const hints = safeParseJSON(fields?.hints, null);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // compat: accetta "files" o "images"
    const fileList = [
      ...ensureArray(files?.files),
      ...ensureArray(files?.images),
    ];
    if (!fileList.length) {
      return res.status(200).json({ ok: true, data: { purchases: [] }, warning: 'No files received' });
    }

    // converti tutti i file in data URL per Vision
    const imageContents = [];
    for (const f of fileList) {
      try {
        const dataUrl = await fileToDataURL(f);
        imageContents.push({ type: 'input_image', image_url: dataUrl });
      } catch { /* salta file corrotti */ }
    }
    if (!imageContents.length) {
      return res.status(200).json({ ok: true, data: { purchases: [] }, warning: 'Files unreadable' });
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({ hints });

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [{ type: 'text', text: userPrompt }, ...imageContents] },
      ],
      max_tokens: 900,
    });

    const content = resp?.choices?.[0]?.message?.content || '{}';
    let parsed; try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const purchases = coercePurchases(parsed?.purchases);

    // rispondi sempre con JSON consistente
    return res.status(200).json({ ok: true, data: { purchases } });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      data: { purchases: [] },
      error: e?.message || 'OCR error',
    });
  }
}
