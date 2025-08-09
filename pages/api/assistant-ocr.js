// pages/api/assistant-ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import OpenAI from 'openai'

export const config = {
  api: { bodyParser: false },
  runtime: 'nodejs', // evita Edge
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito (usa POST)` })
  }

  // 1) Parse multipart form (file + eventuali campi testuali)
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

  // 2) Raccogli le immagini da vari alias + supporto URL/Base64
  const uploads = []

  const addFromFilesKey = (k) => {
    const v = files?.[k]
    if (!v) return
    if (Array.isArray(v)) uploads.push(...v)
    else uploads.push(v)
  }

  ;['images', 'image', 'file', 'files', 'photo', 'upload'].forEach(addFromFilesKey)

  // imageUrl (scarica l'immagine remota)
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

  // imageBase64 (data URL o base64 nudo)
  const rawBase64 = (fields?.imageBase64 && String(fields.imageBase64)) || ''
  if (rawBase64) {
    try {
      let mime = 'image/jpeg'
      let b64 = rawBase64
      const m = rawBase64.match(/^data:(.+?);base64,(.+)$/)
      if (m) { mime = m[1]; b64 = m[2] }
      const buf = Buffer.from(b64, 'base64')
      uploads.push({
        buffer: buf,
        mimetype: mime,
        originalFilename: 'inline-base64.jpg',
      })
    } catch (e) {
      console.warn('[assistant-ocr] base64 parse warn:', e?.message || e)
    }
  }

  if (!uploads.length) {
    return res.status(400).json({
      error: 'Nessuna immagine trovata (usa uno dei campi: images/image/file/files/photo oppure imageUrl/imageBase64)',
    })
  }

  // 3) OCR (OCR.Space) – stessa logica del tuo ocr.js
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
      fd.append('file', blob, filename)

      const resp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: fd })
      const json = await resp.json()

      if (json?.IsErroredOnProcessing) {
        const msg = Array.isArray(json.ErrorMessage)
          ? json.ErrorMessage.join(' | ')
          : (json.ErrorMessage || 'OCR error')
        throw new Error(msg)
      }

      const text = (json?.ParsedResults || [])
        .map(r => r?.ParsedText || '')
        .join('\n')
        .trim()

      ocrResults.push({ name: filename, text })
    } catch (err) {
      console.error('[assistant-ocr] ocr error:', u?.originalFilename, err)
      ocrResults.push({ name: u?.originalFilename || 'upload.jpg', text: '', error: String(err?.message || err) })
    } finally {
      if (u?.filepath) fs.unlink(u.filepath, () => {})
    }
  }

  const rawText = ocrResults.map(r => (r.error ? '' : `### ${r.name}\n${r.text}`)).filter(Boolean).join('\n\n')
  if (!rawText) {
    return res.status(500).json({
      error: ocrResults.find(r => r.error)?.error || 'OCR fallito su tutti i file',
      ocr: ocrResults,
    })
  }

  // 4) (Opzionale) lista prodotti corrente passata dal frontend
  //    Può arrivare in JSON (["latte","pane"]) o come "latte, pane"
  const parseListField = (val) => {
    if (!val) return []
    const s = String(val).trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed.map(x => String(x).trim()).filter(Boolean)
    } catch (_) {
      // non JSON: prova split per virgole/righe
      return s.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean)
    }
    return []
  }

  const listaProdotti =
    parseListField(fields?.listaProdotti) ||
    parseListField(fields?.list) ||
    parseListField(fields?.lista)

  // 5) Prompt per il modello – stessa filosofia del tuo assistant.js
  const systemPrompt = `
Sei Jarvis, l’assistente per la finanza domestica.

Input che riceverai:
- "scontrino": il testo OCR grezzo di uno o più scontrini.
- "listaProdotti": (opzionale) l'elenco corrente della lista spesa dell'utente.

Obiettivo:
1) Riconoscere gli articoli acquistati dallo scontrino (nome, quantità se deducibile, prezzo totale voce).
2) Confrontare gli articoli riconosciuti con "listaProdotti".
   - Se un articolo acquistato è presente in "listaProdotti", va nella sezione "removeFromList".
   - Se un articolo acquistato NON è presente in "listaProdotti" (o se la lista non è fornita), va in "addToStock".
3) Restituisci **solo JSON** con lo schema seguente:

{
  "type": "ocr_actions",
  "removeFromList": [ "nomeProdotto1", "nomeProdotto2" ],
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

Note:
- "categoria" predefinita: "casa"; usa l'ID fisso "4cfaac74-aab4-4d96-b335-6cc64de59afc".
- Usa la data odierna se non riconosci la data nello scontrino.
- "quantita" deve essere un numero intero >= 1 (se non noto, 1).
- "prezzoTotale" è il totale della riga (numero). Se non noto, ometti o usa 0.
- "removeFromList" e "addToStock" devono contenere SOLO nomi sintetici (es: "latte", "pane"), niente testi lunghi.
- Nessun testo fuori dal JSON.
`

  const userPrompt = JSON.stringify({
    scontrino: rawText,
    listaProdotti,
  })

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
    // Prova a fare il parse del JSON prodotto dal modello
    let actions = null
    try {
      actions = JSON.parse(modelAnswer)
    } catch {
      // se non è JSON puro, prova ad estrarlo grezzamente
      const m = modelAnswer.match(/\{[\s\S]*\}$/)
      if (m) {
        try { actions = JSON.parse(m[0]) } catch (_) {}
      }
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
      ocr: ocrResults,    // elenco per-file (nome + preview testo)
      text: rawText,      // scontrino concatenato
      actions,            // JSON strutturato per rimuovere/aggiungere
      answer: modelAnswer // risposta raw del modello (debug)
    })
  } catch (err) {
    console.error('[assistant-ocr] OpenAI error:', err)
    return res.status(500).json({ error: 'Errore assistant-ocr', detail: String(err?.message || err), text: rawText })
  }
}
