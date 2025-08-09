// pages/api/assistant-ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import OpenAI from 'openai'

export const config = {
  api: { bodyParser: false },
  runtime: 'nodejs',
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito (usa POST)` })
  }

  // ---- parse multipart (files + fields) ----
  let fields, files
  try {
    ;({ fields, files } = await new Promise((resolve, reject) => {
      const form = new IncomingForm({ multiples: true, keepExtensions: true })
      form.parse(req, (err, flds, fls) => {
        if (err) return reject(err)
        resolve({ fields: flds, files: fls })
      })
    }))
  } catch (err) {
    console.error('[assistant-ocr] parse error:', err)
    return res.status(500).json({ error: String(err?.message || err) })
  }

  // ---- raccogli immagini da più alias + URL/Base64 ----
  const uploads = []
  const addFromFilesKey = (k) => {
    const v = files?.[k]
    if (!v) return
    if (Array.isArray(v)) uploads.push(...v)
    else uploads.push(v)
  }
  ;['images', 'image', 'file', 'files', 'photo', 'upload'].forEach(addFromFilesKey)

  const rawImageUrl = (fields?.imageUrl && String(fields.imageUrl).trim()) || ''
  if (rawImageUrl) {
    try {
      const resp = await fetch(rawImageUrl)
      if (!resp.ok) throw new Error(`fetch ${rawImageUrl} -> ${resp.status}`)
      const arrayBuf = await resp.arrayBuffer()
      uploads.push({
        buffer: Buffer.from(arrayBuf),
        mimetype: resp.headers.get('content-type') || 'image/jpeg',
        originalFilename: rawImageUrl.split('/').pop() || 'remote.jpg',
      })
    } catch (e) {
      console.warn('[assistant-ocr] imageUrl fetch warn:', e?.message || e)
    }
  }

  const rawBase64 = (fields?.imageBase64 && String(fields.imageBase64)) || ''
  if (rawBase64) {
    try {
      let mime = 'image/jpeg'
      let b64 = rawBase64
      const m = rawBase64.match(/^data:(.+?);base64,(.+)$/)
      if (m) { mime = m[1]; b64 = m[2] }
      const buf = Buffer.from(b64, 'base64')
      uploads.push({ buffer: buf, mimetype: mime, originalFilename: 'inline-base64.jpg' })
    } catch (e) {
      console.warn('[assistant-ocr] base64 parse warn:', e?.message || e)
    }
  }

  if (!uploads.length) {
    return res.status(400).json({
      error: 'Nessuna immagine trovata (usa images/image/file/files/photo oppure imageUrl/imageBase64)',
    })
  }

  // ---- OCR (OCR.space) con robustezza e fallback su "vuoto" ----
  const ocrResults = []
  for (const u of uploads) {
    try {
      let buf, mime, filename
      if (u.buffer) {
        buf = u.buffer
        mime = u.mimetype || 'application/octet-stream'
        filename = u.originalFilename || 'upload.jpg'
      } else {
        buf = await fs.promises.readFile(u.filepath)
        mime = u.mimetype || 'application/octet-stream'
        filename = u.originalFilename || 'upload.jpg'
      }

      const blob = new Blob([buf], { type: mime })
      const fd = new FormData()
      fd.append('apikey', process.env.OCRSPACE_API_KEY ?? 'helloworld')
      fd.append('language', 'ita')
      fd.append('isOverlayRequired', 'false')
      fd.append('scale', 'true')
      fd.append('detectOrientation', 'true')
      // puoi forzare un motore via env (1 o 2 normalmente; 3 è enterprise)
      if (process.env.OCRSPACE_ENGINE) fd.append('OCREngine', process.env.OCRSPACE_ENGINE)
      fd.append('file', blob, filename)

      const resp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: fd })
      const json = await resp.json()

      if (json?.IsErroredOnProcessing) {
        const msg = Array.isArray(json.ErrorMessage)
          ? json.ErrorMessage.join(' | ')
          : (json.ErrorMessage || 'OCR error')
        throw new Error(msg)
      }

      const texts = (json?.ParsedResults || []).map(r => r?.ParsedText || '')
      const text = texts.join('\n').trim()

      if (!text) {
        // Tratta il "vuoto" come errore esplicito per vedere raw
        const detail = json?.ParsedResults?.length ? 'ParsedText vuoto' : 'ParsedResults assente'
        const err = new Error(`Risposta vuota dal servizio OCR (${detail})`)
        err.rawOcr = json
        throw err
      }

      ocrResults.push({ name: filename, text })
    } catch (err) {
      console.error('[assistant-ocr] ocr error:', u?.originalFilename, err)
      ocrResults.push({
        name: u?.originalFilename || 'upload.jpg',
        text: '',
        error: String(err?.message || err),
        raw: err?.rawOcr ?? undefined,
      })
    } finally {
      if (u?.filepath) fs.unlink(u.filepath, () => {})
    }
  }

  const okChunks = ocrResults.filter(r => !r.error && r.text)
  const rawText = okChunks.map(r => `### ${r.name}\n${r.text}`).join('\n\n')

  if (!rawText) {
    // tutti falliti o vuoti: ritorna 502 con raw per debug a frontend
    return res.status(502).json({
      error: 'Risposta vuota dal servizio OCR',
      ocr: ocrResults,
    })
  }

  // ---- opzionale: lista prodotti dal frontend ----
  const parseListField = (val) => {
    if (!val) return []
    const s = String(val).trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed.map(x => String(x).trim()).filter(Boolean)
    } catch (_) {
      return s.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean)
    }
    return []
  }

  const listaProdotti =
    parseListField(fields?.listaProdotti) ||
    parseListField(fields?.list) ||
    parseListField(fields?.lista)

  // ---- prompt modello (come assistant.js ma con le azioni OCR) ----
  const systemPrompt = `
Sei Jarvis, l’assistente per la finanza domestica.

Input:
- "scontrino": testo OCR di uno o più scontrini.
- "listaProdotti": (opzionale) lista spesa corrente.

Obiettivo:
1) Estrai articoli acquistati (nome sintetico, quantità se deducibile, prezzo riga).
2) Confronta con "listaProdotti":
   - se articolo è nella lista: aggiungilo a "removeFromList".
   - se non c'è: aggiungilo a "addToStock".
3) Rispondi SOLO con JSON:

{
  "type": "ocr_actions",
  "removeFromList": [ "nomeProdotto1" ],
  "addToStock": [
    { "nome": "prodotto", "quantita": 1, "categoria": "casa" }
  ],
  "itemsParsed": [
    {
      "dettaglio": "descrizione riga",
      "quantita": 1,
      "prezzoTotale": 0.00,
      "puntoVendita": "",
      "data": "YYYY-MM-DD",
      "categoria": "casa",
      "category_id": "4cfaac74-aab4-4d96-b335-6cc64de59afc"
    }
  ]
}

Regole:
- categoria default: "casa"; category_id fisso: "4cfaac74-aab4-4d96-b335-6cc64de59afc".
- se data non trovata: usa quella odierna.
- quantita: intero >= 1 (default 1).
- remove/add: nomi sintetici (es: "latte", "pane").
- NIENTE testo fuori dal JSON.
`

  const userPrompt = JSON.stringify({ scontrino: rawText, listaProdotti })

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const modelAnswer = completion?.choices?.[0]?.message?.content?.trim() || ''
    let actions = null
    try {
      actions = JSON.parse(modelAnswer)
    } catch {
      const m = modelAnswer.match(/\{[\s\S]*\}$/)
      if (m) { try { actions = JSON.parse(m[0]) } catch {} }
    }

    if (!actions || typeof actions !== 'object') {
      return res.status(200).json({
        ocr: ocrResults,
        text: rawText,
        answer: modelAnswer,
        warning: 'Risposta modello non in JSON parseable',
      })
    }

    return res.status(200).json({
      ocr: ocrResults,
      text: rawText,
      actions,
      answer: modelAnswer,
    })
  } catch (err) {
    console.error('[assistant-ocr] OpenAI error:', err)
    return res.status(500).json({ error: 'Errore assistant-ocr', detail: String(err?.message || err), text: rawText })
  }
}
