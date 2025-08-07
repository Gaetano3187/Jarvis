// pages/api/ocr.js
export const config = {
  api: { bodyParser: false },
}

function buildSystemPrompt(text, filename) {
  return `
Sei Jarvis. Da questo testo OCR estrai **tutte** le righe di spesa, anche se ce ne sono più di una, **usando la data** presente sullo scontrino.

Per ciascuna voce estratta genera un oggetto con:
- puntoVendita: string
- dettaglio: string
- prezzoUnitario: number | null
- quantita: number
- prezzoTotale: number
- data: "YYYY-MM-DD"

Rispondi **solo** con JSON conforme a questo schema:
\`\`\`json
{ "type":"expense", "items":[ /* … */ ] }
\`\`\`

CONTENUTO OCR (${filename}):
${text}
`
}

async function doOcrOnFile(filepath, originalFilename) {
  // require dentro al serverless handler
  const fs = require('fs')
  const FormData = require('form-data')

  const buffer = fs.readFileSync(filepath)
  const form = new FormData()
  form.append('apikey', process.env.OCRSPACE_API_KEY || 'helloworld')
  form.append('language', 'ita')
  form.append('isOverlayRequired', 'false')
  form.append('file', buffer, { filename: originalFilename })

  const resp = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  })
  const json = await resp.json()
  if (json.IsErroredOnProcessing) {
    throw new Error(json.ErrorMessage?.join(', ') || 'Errore OCR')
  }
  return (json.ParsedResults || [])
    .map(r => r.ParsedText)
    .join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  // parsifica multipart/form-data
  let files
  try {
    const { IncomingForm } = require('formidable')
    files = await new Promise((y, n) => {
      const form = new IncomingForm({ keepExtensions: true })
      form.parse(req, (err, _fields, f) => (err ? n(err) : y(f)))
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }

  // raccogli tutte le immagini
  const imgs = []
  if (Array.isArray(files.images)) imgs.push(...files.images)
  else if (files.images) imgs.push(files.images)

  if (imgs.length === 0) {
    return res.status(400).json({ error: 'Campo "images" vuoto' })
  }

  try {
    let allItems = []
    for (const img of imgs) {
      // 1) OCR → testo
      const text = await doOcrOnFile(img.filepath, img.originalFilename)
      // cancello
      require('fs').unlinkSync(img.filepath)

      // 2) prompt ad Assistant
      const prompt = buildSystemPrompt(text, img.originalFilename)
      const assist = await fetch(`${process.env.BASE_URL || ''}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const { answer, error: e } = await assist.json()
      if (!assist.ok || e) throw new Error(e || `Assistant ${assist.status}`)

      const data = JSON.parse(answer)
      if (data.type === 'expense' && Array.isArray(data.items)) {
        allItems.push(...data.items)
      }
    }

    return res.status(200).json({ type: 'expense', items: allItems })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
