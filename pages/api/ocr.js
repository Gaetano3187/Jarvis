// pages/api/ocr.js
import formidable from 'formidable'
import fs from 'fs'
import { FormData } from 'undici'

export const config = {
  api: {
    bodyParser: false, // disabilitiamo il body parser di Next.js per gestire i file
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // 1. Parse multipart/form-data con formidable
  const form = new formidable.IncomingForm({ keepExtensions: true })
  let files
  try {
    const parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, _fields, files) => {
        if (err) reject(err)
        else resolve(files)
      })
    })
    // immagini caricate come campo "images"
    files = Array.isArray(parsed.images) ? parsed.images : [parsed.images]
  } catch (err) {
    console.error('formidable error:', err)
    return res.status(500).json({ error: 'Errore nel parsing del form' })
  }

  // 2. Prepara la richiesta a OCR.space (puoi sostituire con la tua API)
  const formData = new FormData()
  for (const file of files) {
    formData.append('file', fs.createReadStream(file.filepath), file.originalFilename)
  }
  formData.append('language', 'ita')
  formData.append('isOverlayRequired', 'false')

  try {
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: process.env.OCR_SPACE_API_KEY,
      },
      body: formData,
    })
    const ocrJson = await ocrResponse.json()
    if (ocrJson.IsErroredOnProcessing) {
      throw new Error(ocrJson.ErrorMessage?.join(', ') || 'OCR fallito')
    }
    // concateniamo tutti i ParsedText
    const text = ocrJson.ParsedResults.map(r => r.ParsedText).join('\n')
    return res.status(200).json({ text })
  } catch (err) {
    console.error('OCR API error:', err)
    return res.status(500).json({ error: err.message || 'OCR API failed' })
  }
}
