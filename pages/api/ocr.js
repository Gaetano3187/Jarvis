// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs/promises'
import { Blob } from 'buffer'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // 1) parse multipart con formidable
  const form = new IncomingForm({ keepExtensions: true })
  let files
  try {
    const parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, _fields, files) => (err ? reject(err) : resolve(files)))
    })
    files = Array.isArray(parsed.images) ? parsed.images : [parsed.images]
  } catch (err) {
    console.error('Formidable error:', err)
    return res.status(500).json({ error: 'Errore nel parsing del form' })
  }

  // 2) costruisco FormData usando Blob
  const fd = new FormData()
  for (const file of files) {
    const buffer = await fs.readFile(file.filepath)
    const blob = new Blob([buffer], { type: file.mimetype })
    fd.append('file', blob, file.originalFilename)
  }
  fd.append('language', 'ita')
  fd.append('isOverlayRequired', 'false')

  // 3) invoco OCR.space
  try {
    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: process.env.OCR_SPACE_API_KEY,
        // NOTA: Content-Type lo mette FormData automaticamente
      },
      body: fd,
    })
    const ocrJson = await ocrRes.json()
    if (ocrJson.IsErroredOnProcessing) {
      const msg = Array.isArray(ocrJson.ErrorMessage)
        ? ocrJson.ErrorMessage.join(', ')
        : ocrJson.ErrorMessage || 'OCR fallito'
      throw new Error(msg)
    }
    const text = ocrJson.ParsedResults.map(r => r.ParsedText).join('\n')
    return res.status(200).json({ text })
  } catch (err) {
    console.error('OCR API error:', err)
    return res.status(500).json({ error: err.message || 'OCR API failed' })
  }
}
