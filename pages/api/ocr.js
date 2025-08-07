// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import FormData from 'form-data'

export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Parse multipart/form-data senza usare require()
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
    console.error('⚠️ parse error:', err)
    return res.status(500).json({ error: err.message })
  }

  // Prendi il primo file (o l'unico) in files.images
  const upload = Array.isArray(files.images) ? files.images[0] : files.images
  if (!upload) {
    return res.status(400).json({ error: 'Nessun file in images' })
  }

  // Prepara la richiesta a OCR.Space
  const formData = new FormData()
  formData.append('apikey', process.env.OCRSPACE_API_KEY || 'helloworld')
  formData.append('language', 'ita')
  formData.append('isOverlayRequired', 'false')
  formData.append('file', fs.createReadStream(upload.filepath), upload.originalFilename)

  // Chiama l’API
  let ocrJson
  try {
    const resp = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    })
    ocrJson = await resp.json()
  } catch (err) {
    console.error('⚠️ fetch error:', err)
    return res.status(500).json({ error: err.message })
  }

  if (ocrJson.IsErroredOnProcessing) {
    console.error('❌ OCR error:', ocrJson.ErrorMessage)
    return res.status(500).json({ error: ocrJson.ErrorMessage })
  }

  // Estrai tutto il testo riconosciuto
  const text = (ocrJson.ParsedResults || [])
    .map(r => r.ParsedText)
    .join('\n')
    .trim()

  // Elimina il file temporaneo
  try { fs.unlinkSync(upload.filepath) } catch {}

  res.status(200).json({ text })
}
