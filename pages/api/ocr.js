// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import { FormData, fileFromSync } from 'undici'

export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 1) parse multipart/form-data
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

  // 2) prendi il primo file in files.images
  const upload = Array.isArray(files.images) ? files.images[0] : files.images
  if (!upload) {
    return res.status(400).json({ error: 'Nessun file in images' })
  }

  // 3) prepara il FormData per OCR.Space
  const formData = new FormData()
  formData.append('apikey', process.env.OCRSPACE_API_KEY || 'helloworld')
  formData.append('language', 'ita')
  formData.append('isOverlayRequired', 'false')
  formData.append(
    'file',
    // allega il file dal path temporaneo
    fileFromSync(upload.filepath, upload.originalFilename)
  )

  // 4) invoca l’API
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

  // 5) concatena tutti i ParsedText
  const text = (ocrJson.ParsedResults || [])
    .map(r => r.ParsedText)
    .join('\n')
    .trim()

  // 6) pulisci il file temporaneo
  try { fs.unlinkSync(upload.filepath) } catch {}

  // 7) restituisci il testo
  res.status(200).json({ text })
}
