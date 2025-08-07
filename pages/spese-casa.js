// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import fetch from 'node-fetch'

export const config = {
  api: { bodyParser: false },
}

function buildSystemPrompt(userText, fileName) {
  return `
Sei Jarvis. Da questo testo OCR estrai **tutte** le righe di spesa, anche se ce ne sono più di una, **usando la data** presente sullo scontrino.

Per ciascuna voce estratta genera un oggetto con:
- puntoVendita: string
- dettaglio: string
- prezzoUnitario: number | null
- quantita: number
- prezzoTotale: number
- data: "YYYY-MM-DD" (estratta direttamente dal testo)

Rispondi **solo** con JSON conforme a questo schema:
\`\`\`json
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Supermercato Rossi",
      "dettaglio": "2 confezioni di pane",
      "prezzoUnitario": 1.50,
      "quantita": 2,
      "prezzoTotale": 3.00,
      "data": "2025-08-06"
    }
    /* … */
  ]
}
\`\`\`

CONTENUTO OCR (${fileName}):
${userText}
`
}

async function doOcr(upload) {
  // leggi buffer e crea blob-like
  const buffer = fs.readFileSync(upload.filepath)
  const formData = new globalThis.FormData()
  formData.append('apikey', process.env.OCRSPACE_API_KEY ?? 'helloworld')
  formData.append('language', 'ita')
  formData.append('isOverlayRequired', 'false')
  formData.append('file', new Blob([buffer]), upload.originalFilename)

  const resp = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: formData,
  })
  const ocrJson = await resp.json()
  if (ocrJson.IsErroredOnProcessing) {
    throw new Error(ocrJson.ErrorMessage?.join?.(', ') || 'Errore OCR')
  }
  // concateno i testi
  return (ocrJson.ParsedResults || [])
    .map(r => r.ParsedText)
    .join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 1) parse multipart
  let files
  try {
    ;({ files } = await new Promise((resolve, reject) => {
      const form = new IncomingForm({ keepExtensions: true })
      form.parse(req, (err, _fields, files) => {
        if (err) return reject(err)
        resolve({ files })
      })
    }))
  } catch (err) {
    console.error('parse error:', err)
    return res.status(500).json({ error: err.message })
  }

  // 2) raccogli gli upload
  const uploads = Array.isArray(files.images)
    ? files.images
    : files.images
      ? [files.images]
      : []

  if (uploads.length === 0) {
    return res.status(400).json({ error: 'Nessun file nel campo "images"' })
  }

  try {
    // 3) per ogni immagine: OCR → testo → prompt → assistant
    let allItems = []
    for (const up of uploads) {
      const rawText = await doOcr(up)
      // pulisco file temporaneo
      fs.unlink(up.filepath, () => {})

      const prompt = buildSystemPrompt(rawText, up.originalFilename)
      const assistRes = await fetch(`${process.env.BASE_URL || ''}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const { answer, error: asErr } = await assistRes.json()
      if (!assistRes.ok || asErr) {
        throw new Error(asErr || `Assistant error ${assistRes.status}`)
      }
      const data = JSON.parse(answer)
      if (data.type === 'expense' && Array.isArray(data.items)) {
        allItems = allItems.concat(data.items)
      }
    }

    // 4) restituisci direttamente il JSON da inserire nelle righe della tabella
    return res.status(200).json({ type: 'expense', items: allItems })
  } catch (err) {
    console.error('OCR+Assistant error:', err)
    return res.status(500).json({ error: err.message })
  }
}
