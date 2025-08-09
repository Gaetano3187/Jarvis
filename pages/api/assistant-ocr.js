// pages/api/assistant-ocr.js
import formidable from 'formidable';
import fs from 'fs/promises';
import mime from 'mime';
import OpenAI from 'openai';

export const config = {
  api: { bodyParser: false }, // necessario per multipart/form-data
};

/* -------------------------- utils -------------------------- */
function parseForm(req) {
  const form = formidable({ multiples: true, maxFileSize: 20 * 1024 * 1024 }); // 20MB
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
  });
}

function ensureArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

async function fileToDataURL(fileObj) {
  // formidable v2/v3 compat: { filepath } o { path }
  const fp = fileObj.filepath || fileObj.path;
  const buf = await fs.readFile(fp);
  const type =
    fileObj.mimetype ||
    mime.getType(fileObj.originalFilename || fileObj.newFilename || '') ||
    'application/octet-stream';
  const b64 = buf.toString('base64');
  return `data:${type};base64,${b64}`;
}

function safeParseJSON(s, fallback = null) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function castQty(n) {
  const v = Number(String(n).replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return 1;
  // niente decimali nelle qty: arrotonda
  return Math.max(1, Math.round(v));
}

function coercePurchases(raw) {
  const out = [];
  for (const p of raw || []) {
    const name = String(p?.name || '').trim();
    if (!name) continue;
    out.push({
      name,
      brand: String(p?.brand || '').trim(),
      qty: castQty(p?.qty || 1),
    });
  }
  return out;
}

/* --------------------- prompt builders --------------------- */
function buildSystemPrompt() {
  return [
    'Sei un assistente che LEGGE SCONTRINI DI SUPERMERCATO.',
    'Devi estrarre SOLO gli articoli acquistati nel seguente JSON valido:',
    '{ "purchases":[ { "name":"latte", "brand":"Parmalat", "qty":2 } ] }',
    'Regole:',
    '- Rispondi SOLO con JSON (nessun testo fuori dal JSON).',
    '- name: nome/prodotto leggibile (es. "pasta", "latte intero", "passata di pomodoro").',
    '- brand: opzionale se riconoscibile (es. "Barilla", "Parmalat"), altrimenti stringa vuota.',
    '- qty: numero pezzi acquistati. Se non evidente, usa 1.',
    '- Ignora prezzi, totale, sconti, reparti e righe non-prodotto.',
    '- Non includere spese di servizio, buste, cauzioni, ticket.',
  ].join('\n');
}

function buildUserPrompt({ hints }) {
  const lines = [
    'Estrai la lista prodotti acquistati da queste immagini di scontrino.',
    'Se nello scontrino una riga appare tipo "2 x Latte Parmalat", allora qty=2, name="latte", brand="Parmalat".',
    'Se un brand non è chiaro, lascia brand="".',
  ];
  if (hints?.lexicon?.length) {
    lines.push('Lessico di riferimento (aiuta a interpretare i nomi): ' + hints.lexicon.slice(0, 200).join(', '));
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

  // compat con il tuo front-end: assistantId (ignorato), hints (lexicon) ecc.
  const hints = safeParseJSON(fields?.hints, null);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // supporta più file: "files" (come nel tuo codice) o "images"
    const fileList = [
      ...ensureArray(files?.files),
      ...ensureArray(files?.images),
    ];
    if (!fileList.length) {
      return res.status(200).json({ ok: true, data: { purchases: [] }, warning: 'No files received' });
    }

    // Converte ogni file in dataURL per Vision
    const imageContents = [];
    for (const f of fileList) {
      try {
        const dataUrl = await fileToDataURL(f);
        imageContents.push({ type: 'input_image', image_url: dataUrl });
      } catch {
        // se un file fallisce, proseguiamo con gli altri
      }
    }
    if (!imageContents.length) {
      return res.status(200).json({ ok: true, data: { purchases: [] }, warning: 'Files unreadable' });
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({ hints });

    // Vision chat completion (multimodale) — JSON garantito
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            ...imageContents,
          ],
        },
      ],
      max_tokens: 900,
    });

    const rawText = resp?.choices?.[0]?.message?.content || '{}';
    let json;
    try { json = JSON.parse(rawText); } catch { json = {}; }

    const purchases = coercePurchases(json?.purchases);
    return res.status(200).json({ ok: true, data: { purchases } });
  } catch (e) {
    // fallback: mai HTML/empty, sempre JSON
    return res.status(200).json({
      ok: false,
      data: { purchases: [] },
      error: e?.message || 'OCR error',
    });
  }
}
