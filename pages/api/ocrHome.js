// pages/api/ocrHome.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';

export const config = { api: { bodyParser: false } };

// Modello OCR/vision
const MODEL = (process.env.OCR_VISION_MODEL || 'gpt-4o-mini').trim();

const asDataUrl = (buf, mime='image/jpeg') =>
  `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;

// --- Classificazione semplice dal testo (fallback) ---
function classifyFromText(raw='') {
  const s = String(raw || '').toLowerCase();
  const Y = (k)=> (s.includes(k) ? 1 : 0);

  const rec = Y('documento commerciale')+Y('scontrino')+Y('totale')+Y('subtotale')+Y('iva')+Y('contanti')+Y('pagamento')+Y('€')+Y('euro')+Y('cassa')+Y('p.iva');
  const lab = Y('docg')+Y('doc')+Y('igt')+Y('denominazione')+Y('% vol')+Y('alc')+Y('imbottigliato da')+Y('cantina');

  const rows = s.split(/\r?\n/).filter(Boolean);
  const yearRows = rows.filter(l => /\b(19|20)\d{2}\b/.test(l)).length;
  const euroRows = rows.filter(l => /€\s?\d/.test(l)).length;
  const wineWords = rows.filter(l => /\b(barolo|nebbiolo|chianti|amarone|etna|franciacorta|vermentino|greco|fiano|sagrantino|montepulciano|nero d'avola)\b/.test(l)).length;
  const listScore = yearRows + euroRows + wineWords;

  if (listScore >= 6) return 'wine_list';
  if (lab >= 3 && lab > rec) return 'wine_label';
  if (rec >= 3) return 'receipt';
  return 'unknown';
}

// --- Parse multipart con formidable ---
async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, keepExtensions: true });
    form.parse(req, async (err, fields, files) => {
      if (err) return reject(err);
      const picks = [];
      for (const k of ['images','files','file','image']) {
        const v = files?.[k];
        if (!v) continue;
        if (Array.isArray(v)) picks.push(...v);
        else picks.push(v);
      }
      const images = [];
      for (const f of picks) {
        const buf = await fs.readFile(f.filepath);
        const mime = f.mimetype || 'image/jpeg';
        images.push({ dataUrl: asDataUrl(buf, mime), mime, name: f.originalFilename || 'upload.jpg' });
      }
      resolve({ fields, images });
    });
  });
}

// ---- OpenAI wrappers: Responses API (nuovo) + fallback Chat (vecchio) ----
async function llmExtractText(openai, images) {
  // Costruisci contenuto multimodale
  const contentResponses = [
    { type: 'input_text', text: 'Trascrivi soltanto il testo delle immagini. Nessun commento, nessun extra. Se più immagini, separa con "\\n---\\n".' },
    ...images.map(img => ({ type: 'input_image', image_url: img.dataUrl }))
  ];

  // 1) Responses API (preferita)
  try {
    const r = await openai.responses.create({
      model: MODEL,
      input: [{ role: 'user', content: contentResponses }],
      temperature: 0
    });
    // Node SDK v4 espone .output_text
    const text = (r?.output_text || '').trim();
    if (text) return text;
  } catch (_) { /* fallback sotto */ }

  // 2) Chat Completions fallback
  const contentChat = [
    { type: 'text', text: 'Trascrivi soltanto il testo delle immagini. Nessun commento, nessun extra. Se più immagini, separa con "\\n---\\n".' },
    ...images.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl } }))
  ];
  const c = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [{ role: 'user', content: contentChat }]
  });
  return (c?.choices?.[0]?.message?.content || '').trim();
}

async function llmJSON(openai, prompt) {
  // 1) Responses
  try {
    const r = await openai.responses.create({
      model: MODEL,
      input: [{ role: 'user', content: [{ type:'input_text', text: prompt }] }],
      temperature: 0
    });
    const txt = (r?.output_text || '').trim();
    if (txt) { try { return JSON.parse(txt); } catch {} }
  } catch (_) { /* fallback sotto */ }

  // 2) Chat
  const r2 = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [{ role:'user', content: [{ type:'text', text: prompt }] }]
  });
  const ans = (r2?.choices?.[0]?.message?.content || '').trim();
  try { return JSON.parse(ans); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ error:'Method not allowed' }); }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY non configurata' });
  }

  try {
    const { images } = await parseMultipart(req);
    if (!images?.length) return res.status(400).json({ error:'Nessuna immagine' });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1) OCR testo grezzo (unificato)
    const rawText = await llmExtractText(openai, images);
    if (!rawText) return res.status(200).json({ ok:false, kind:'unknown', text:'', reason:'NO_TEXT' });

    // 2) Classificazione
    let kindGuess = classifyFromText(rawText);

    // 3) Estrazione strutturata in JSON
    let out = { ok:true, kind: kindGuess, text: rawText };

    if (kindGuess === 'receipt') {
      const prompt = [
        'Sei un estrattore di SCONTRINI. Rispondi SOLO JSON con lo schema:',
        '{ "store":"", "purchaseDate":"", "totalPaid":0, "currency":"EUR", "purchases":[{"name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","priceEach":0,"priceTotal":0,"currency":"EUR","expiresAt":""}] }',
        'Regole:',
        '- Non interpretare pesi/volumi come quantità.',
        '- "packs" e "unitsPerPack" solo se espliciti (es. 2x6, 2 conf da 6).',
        '- purchaseDate formato YYYY-MM-DD se presente.',
        '- priceEach/priceTotal numeri (virgole → punti).',
        '--- TESTO ---',
        rawText,
        '--- FINE ---'
      ].join('\n');

      const j = await llmJSON(openai, prompt);
      if (j && typeof j === 'object') {
        out = { ok:true, kind:'receipt', ...j, text: rawText };
      }
    } else if (kindGuess === 'wine_label') {
      const prompt = [
        'Sei un estrattore di ETICHETTE VINO. Rispondi SOLO JSON:',
        '{ "wine":{"name":"","winery":"","denomination":"","region":"","vintage":"","alcohol_pct":0,"format_ml":0,"grape":"","notes":""} }',
        'Note: vintage può essere "", alcohol_pct numero, format_ml numero (es. 750).',
        '--- TESTO ---',
        rawText,
        '--- FINE ---'
      ].join('\n');
      const j = await llmJSON(openai, prompt);
      if (j && typeof j === 'object') {
        out = { ok:true, kind:'wine_label', ...j, text: rawText };
      }
    } else if (kindGuess === 'wine_list') {
      const prompt = [
        'Sei un estrattore di CARTA VINI. Rispondi SOLO JSON:',
        '{ "entries":[{"name":"","winery":"","denomination":"","region":"","vintage":"","price_eur":0}]}',
        'Inserisci più righe possibili (max 80). Prezzi come numeri senza simbolo.',
        '--- TESTO ---',
        rawText,
        '--- FINE ---'
      ].join('\n');
      const j = await llmJSON(openai, prompt);
      if (j && typeof j === 'object') {
        out = { ok:true, kind:'wine_list', ...j, text: rawText };
      }
    }

    // Se la strutturazione è fallita, almeno ritorna il testo + guess
    return res.status(200).json(out);

  } catch (e) {
    // Log utile su Vercel
    console.error('[ocrHome] error', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
