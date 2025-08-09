// pages/api/assistant-ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import OpenAI from 'openai'

export const config = {
  api: { bodyParser: false },
  runtime: 'nodejs', // evitare Edge
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
})

function pick(a, b) {
  return a !== undefined && a !== null ? a : b
}

async function doOcrSpaceUpload(file) {
  const buf = await fs.promises.readFile(file.filepath)
  const blob = new Blob([buf], { type: file.mimetype || 'application/octet-stream' })

  const fd = new FormData()
  fd.append('apikey', process.env.OCRSPACE_API_KEY ?? 'helloworld')
  fd.append('language', 'ita')
  fd.append('isOverlayRequired', 'false')
  // engine 2 è spesso più robusto sugli scontrini
  fd.append('OCREngine', '2')
  fd.append('file', blob, file.originalFilename || 'upload.jpg')

  const resp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: fd })
  const json = await resp.json()

  if (json?.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join(' | ') : (json.ErrorMessage || 'OCR error')
    throw new Error(msg)
  }

  const text = (json?.ParsedResults || [])
    .map(r => r?.ParsedText || '')
    .join('\n')
    .trim()

  return { name: file.originalFilename || 'upload.jpg', text }
}

function toDataUrl(buf, mime = 'image/jpeg') {
  return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito (usa POST)` })
  }

  // ---- parse multipart (immagini + campi opzionali) ----
  let files, fields
  try {
    ({ files, fields } = await new Promise((resolve, reject) => {
      const form = new IncomingForm({ multiples: true, keepExtensions: true })
      form.parse(req, (err, flds, fls) => {
        if (err) return reject(err)
        resolve({ files: fls, fields: flds })
      })
    }))
  } catch (err) {
    console.error('[assistant-ocr] parse error:', err)
    return res.status(500).json({ error: String(err.message || err) })
  }

  // normalizza input immagini
  const uploads = []
  const input = files?.images
  if (Array.isArray(input)) uploads.push(...input)
  else if (input) uploads.push(input)

  if (uploads.length === 0) {
    return res.status(400).json({ error: 'Nessun file nel campo "images"' })
  }

  // context opzionale passato dal frontend
  let ctx = { listaProdotti: [], scorte: [] }
  if (fields?.context) {
    try {
      ctx = JSON.parse(Array.isArray(fields.context) ? fields.context[0] : fields.context)
    } catch (_) {
      // ignora context malformato
    }
  }

  // ---- OCR principale (OCR.space) ----
  const ocrResults = []
  for (const f of uploads) {
    try {
      const r = await doOcrSpaceUpload(f)
      ocrResults.push({ ...r, ok: true })
    } catch (e) {
      console.error('[assistant-ocr] ocr error for', f?.originalFilename, e)
      ocrResults.push({ name: f?.originalFilename || 'upload.jpg', text: '', ok: false, error: String(e.message || e) })
    }
  }

  let rawText = ocrResults
    .map(r => (r.text ? `### ${r.name}\n${r.text}` : ''))
    .filter(Boolean)
    .join('\n\n')
    .trim()

  // ---- Fallback Vision se OCR vuoto ----
  if (!rawText) {
    try {
      const visionContents = [{ type: 'text', text: 'Estrarre TUTTO il testo leggibile degli scontrini. Restituisci SOLO testo grezzo.' }]
      for (const f of uploads) {
        let b = null
        try { b = await fs.promises.readFile(f.filepath) } catch {}
        if (b) {
          visionContents.push({
            type: 'input_image',
            image_url: { url: toDataUrl(b, f.mimetype || 'image/jpeg') },
          })
        }
      }

      const vis = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{ role: 'user', content: visionContents }],
      })

      const visText = vis?.choices?.[0]?.message?.content?.trim() || ''
      if (!visText) {
        return res.status(502).json({
          error: 'Risposta vuota dal servizio OCR',
          ocr: ocrResults,
          vision: 'empty',
        })
      }

      rawText = uploads
        .map((u, i) => `### ${u.originalFilename || `img_${i + 1}.jpg`}\n${visText}`)
        .join('\n\n')
    } catch (e) {
      console.error('[assistant-ocr] Vision fallback error:', e)
      return res.status(502).json({
        error: 'Risposta vuota dal servizio OCR',
        detail: 'Fallback Vision fallito',
        ocr: ocrResults,
      })
    }
  }

  // ---- Prompt: calcolo azioni su lista/scorte ----
  const today = new Date().toISOString().slice(0, 10)
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
`

  const userMsg = `
=== TESTO SCONTRINO ===
${rawText}

=== LISTA PRODOTTI (da rimuovere se acquistati) ===
${JSON.stringify(pick(ctx.listaProdotti, []), null, 2)}

=== SCORTE ATTUALI (solo contesto, non obbligatorio) ===
${JSON.stringify(pick(ctx.scorte, []), null, 2)}
`

  let actionsJson = null
  try {
    const comp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
    })
    const text = comp?.choices?.[0]?.message?.content?.trim() || ''
    actionsJson = JSON.parse(text)
  } catch (e) {
    console.error('[assistant-ocr] parsing actions error:', e)
    return res.status(500).json({ error: 'Errore nel parsing delle azioni dal modello', detail: String(e.message || e) })
  } finally {
    // pulizia tmp
    for (const u of uploads) {
      if (u?.filepath) fs.unlink(u.filepath, () => {})
    }
  }

  // risposta finale
  return res.status(200).json({
    ocrText: rawText,
    receipt: actionsJson?.receipt || null,
    actions: actionsJson?.actions || { removeFromList: [], addToInventory: [] },
  })
}
