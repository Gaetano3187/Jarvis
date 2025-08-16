// pages/api/assistant-ocr.js
import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

export const config = {
  api: { bodyParser: false },
  runtime: 'nodejs', // evitare Edge
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';

/* ============ helpers ============ */

function pick(a, b) {
  return a !== undefined && a !== null ? a : b;
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      multiples: true,
      keepExtensions: true,
      maxFileSize: 15 * 1024 * 1024, // 15MB/file
      maxTotalFileSize: 60 * 1024 * 1024,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

async function fetchWithTimeout(url, opts = {}, ms = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** opzionale: HEIC → JPEG (solo se 'sharp' è disponibile) */
async function maybeConvertHeic(filepath, mimetype, originalFilename) {
  const isHeic =
    /heic|heif/i.test(mimetype || '') || /\.hei[cf]$/i.test(originalFilename || '');
  if (!isHeic) return { filepath, mimetype, originalFilename };

  try {
    const sharp = (await import('sharp')).default;
    const buf = await fs.promises.readFile(filepath);
    const out = await sharp(buf).jpeg({ quality: 90 }).toBuffer();

    const outPath = filepath + '.jpg';
    await fs.promises.writeFile(outPath, out);

    // elimina l'originale HEIC
    try { await fs.promises.unlink(filepath); } catch {}

    const outName =
      (originalFilename ? path.parse(originalFilename).name : 'upload') + '.jpg';

    return { filepath: outPath, mimetype: 'image/jpeg', originalFilename: outName };
  } catch {
    // se fallisce, continuiamo col file originale
    return { filepath, mimetype, originalFilename };
  }
}

/** OCR.space upload via stream */
async function doOcrSpaceUpload(file) {
  const stream = fs.createReadStream(file.filepath);
  const fd = new FormData();

  fd.append('apikey', process.env.OCRSPACE_API_KEY ?? 'helloworld'); // chiave demo molto limitata
  fd.append('language', 'ita');
  fd.append('isOverlayRequired', 'false');
  fd.append('OCREngine', '2');
  fd.append('file', stream, file.originalFilename || 'upload.jpg');

  const resp = await fetchWithTimeout(OCR_ENDPOINT, { method: 'POST', body: fd }, 45000);
  const raw = await resp.text();
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${raw?.slice(0, 200) || ''}`);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(raw?.slice(0, 200) || 'Risposta non JSON dal servizio OCR');
  }

  if (json?.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join(' | ')
      : json.ErrorMessage || 'Errore OCR';
    throw new Error(msg);
  }

  const text = (json?.ParsedResults || [])
    .map((r) => r?.ParsedText || '')
    .join('\n')
    .trim();

  return { name: file.originalFilename || 'upload.jpg', text };
}

function toDataUrl(buf, mime = 'image/jpeg') {
  return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
}

/* ============ handler ============ */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res
      .status(405)
      .json({ error: `Metodo ${req.method} non consentito (usa POST)` });
  }

  let files, fields;
  try {
    ({ files, fields } = await parseForm(req));
  } catch (err) {
    console.error('[assistant-ocr] parse error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }

  // normalizza input immagini: supporta "images" e "file"
  const uploads = [];
  const inImages = files?.images;
  const inFile = files?.file;
  if (Array.isArray(inImages)) uploads.push(...inImages);
  else if (inImages) uploads.push(inImages);
  if (Array.isArray(inFile)) uploads.push(...inFile);
  else if (inFile) uploads.push(inFile);

  if (uploads.length === 0) {
    return res.status(400).json({ error: 'Nessun file nel campo "images" (o "file")' });
  }

  // context opzionale
  let ctx = { listaProdotti: [], scorte: [] };
  if (fields?.context) {
    try {
      const raw = Array.isArray(fields.context) ? fields.context[0] : fields.context;
      ctx = JSON.parse(raw);
    } catch {
      // ignora context malformato
    }
  }

  // prepara file (HEIC→JPEG se possibile)
  const prepared = [];
  for (const f of uploads) {
    const base = {
      filepath: f.filepath,
      mimetype: f.mimetype || 'application/octet-stream',
      originalFilename: f.originalFilename || 'upload',
    };
    prepared.push(await maybeConvertHeic(base.filepath, base.mimetype, base.originalFilename));
  }

  // ---- OCR principale (OCR.space) ----
  const ocrResults = [];
  for (const f of prepared) {
    try {
      const r = await doOcrSpaceUpload(f);
      ocrResults.push({ ...r, ok: true });
    } catch (e) {
      console.error('[assistant-ocr] OCR error for', f?.originalFilename, e);
      ocrResults.push({
        name: f?.originalFilename || 'upload.jpg',
        text: '',
        ok: false,
        error: String(e?.message || e),
      });
    } finally {
      // pulizia file locali (anche quelli convertiti)
      if (f?.filepath) fs.unlink(f.filepath, () => {});
    }
  }

  let rawText = ocrResults
    .map((r) => (r.text ? `### ${r.name}\n${r.text}` : ''))
    .filter(Boolean)
    .join('\n\n')
    .trim();

  // ---- Fallback Vision se OCR vuoto ----
  if (!rawText) {
    try {
      const visionContents = [
        {
          type: 'text',
          text:
            'Estrai TUTTO il testo leggibile degli scontrini. Restituisci SOLO testo grezzo.',
        },
      ];

      // rileggiamo i file originali (non convertiti: li abbiamo rimossi; usiamo quelli uploadati)
      for (const f of uploads) {
        try {
          const b = await fs.promises.readFile(f.filepath);
          visionContents.push({
            type: 'input_image',
            image_url: { url: toDataUrl(b, f.mimetype || 'image/jpeg') },
          });
        } catch {
          // se non più disponibile, saltiamo
        }
      }

      const vis = await Promise.race([
        openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0,
          messages: [{ role: 'user', content: visionContents }],
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('OpenAI Vision timeout')), 45000)
        ),
      ]);

      const visText = vis?.choices?.[0]?.message?.content?.trim() || '';
      if (!visText) {
        return res.status(502).json({
          error: 'Risposta vuota dal servizio OCR',
          ocr: ocrResults,
          vision: 'empty',
        });
      }

      rawText = uploads
        .map((u, i) => `### ${u.originalFilename || `img_${i + 1}.jpg`}\n${visText}`)
        .join('\n\n');
    } catch (e) {
      console.error('[assistant-ocr] Vision fallback error:', e);
      return res.status(502).json({
        error: 'Risposta vuota dal servizio OCR',
        detail: 'Fallback Vision fallito',
        ocr: ocrResults,
      });
    }
  }

  // ---- Prompt: calcolo azioni su lista/scorte ----
  const today = new Date().toISOString().slice(0, 10);
  const system = `
Sei Jarvis, l’assistente per la spesa domestica.

OBIETTIVO
1) Leggi lo scontrino testuale (può contenere prezzi, quantità, codici, subtotali, IVA).
2) Crea un oggetto "receipt" normalizzato con le righe acquistate.
3) Crea "actions":
   - removeFromList: rimuovi gli articoli presenti nello scontrino che combaciano (anche fuzzy) con i nomi in "listaProdotti".
   - addToInventory: aggiungi in "stato scorte" TUTTI gli articoli acquistati (anche quelli NON presenti in lista), con quantità stimate se non espresse.

REGOLE
- Confronto fuzzy: ignora maiuscole/minuscole, accenti, plurali semplici, abbreviazioni comuni (es. "latte ps" ~ "latte parzialmente scremato").
- quantity: se mancante nello scontrino, usa 1.
- unit: se intuibile (kg, g, lt, pz), indicarla; altrimenti "pz".
- priceEach: se vedi "x kg a €/kg", calcola priceEach = totale/quantità.
- date: ${today} se non indicata.
- NON inventare prodotti: usa solo ciò che deduci dal testo.
- Output SOLO JSON valido senza commenti.

SCHEMA DI OUTPUT
{
  "receipt": {
    "store": "...",
    "date": "YYYY-MM-DD",
    "lines": [
      { "name":"...", "quantity": 1, "unit":"pz", "total": 0.00 }
    ],
    "totalGuess": 0.00
  },
  "actions": {
    "removeFromList": [
      { "name":"...", "matchedBy":"exact|fuzzy" }
    ],
    "addToInventory": [
      { "name":"...", "quantity":1, "unit":"pz", "category": "casa", "priceEach": 0.00, "total": 0.00 }
    ]
  }
}
`.trim();

  const userMsg = `
=== TESTO SCONTRINO ===
${rawText}

=== LISTA PRODOTTI (da rimuovere se acquistati) ===
${JSON.stringify(pick(ctx.listaProdotti, []), null, 2)}

=== SCORTE ATTUALI (solo contesto, non obbligatorio) ===
${JSON.stringify(pick(ctx.scorte, []), null, 2)}
`.trim();

  let actionsJson = null;
  try {
    const comp = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
      }),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('OpenAI completion timeout')), 45000)
      ),
    ]);

    const text = comp?.choices?.[0]?.message?.content?.trim() || '';
    actionsJson = JSON.parse(text);
  } catch (e) {
    console.error('[assistant-ocr] parsing actions error:', e);
    return res.status(500).json({
      error: 'Errore nel parsing delle azioni dal modello',
      detail: String(e?.message || e),
      ocrText: rawText,
    });
  } finally {
    // pulizia tmp originale (se ancora presenti)
    for (const u of uploads) {
      if (u?.filepath) fs.unlink(u.filepath, () => {});
    }
  }

  // risposta finale
  return res.status(200).json({
    ocrText: rawText,
    receipt: actionsJson?.receipt || null,
    actions: actionsJson?.actions || { removeFromList: [], addToInventory: [] },
  });
}
