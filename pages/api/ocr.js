// pages/api/ocr.js
export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // importa SOLO lato server quando serve
  const { IncomingForm } = await import('formidable')
  const fs = await import('fs')
  const { Blob } = await import('buffer')

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

  const upload = Array.isArray(files.images) ? files.images[0] : files.images
  if (!upload) {
    return res.status(400).json({ error: 'Nessun file nel campo "images"' })
  }

  const formData = new FormData()
  formData.append('apikey', process.env.OCRSPACE_API_KEY ?? 'helloworld')
  formData.append('language', 'ita')
  formData.append('isOverlayRequired', 'false')

  try {
    const buffer = await fs.promises.readFile(upload.filepath)
    const blob = new Blob([buffer])
    formData.append('file', blob, upload.originalFilename)
  } catch (err) {
    console.error('file read error:', err)
    return res.status(500).json({ error: 'Impossibile leggere il file caricato' })
  }

  let ocrJson
  try {
    const resp = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    })
    ocrJson = await resp.json()
  } catch (err) {
    console.error('fetch error:', err)
    return res.status(500).json({ error: err.message })
  }

  if (ocrJson.IsErroredOnProcessing) {
    console.error('OCR error:', ocrJson.ErrorMessage)
    return res.status(500).json({ error: ocrJson.ErrorMessage })
  }

  const text = (ocrJson.ParsedResults || [])
    .map(r => r.ParsedText)
    .join('\n')
    .trim()

  fs.unlink(upload.filepath, () => {})

  res.status(200).json({ text })
}
