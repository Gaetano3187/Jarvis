// pages/api/ocr.js
import fetch from 'node-fetch'
import FormData from 'form-data'
import fs from 'fs'

export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // recupera il file caricato da formidable
  const { fields, files } = await new Promise((resolve, reject) => {
    const formidable = require('formidable')
    const form = new formidable.IncomingForm({ keepExtensions: true })
    form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }))
  })

  const upload = Array.isArray(files.images) ? files.images[0] : files.images
  if (!upload) {
    return res.status(400).json({ error: 'Nessun file in images' })
  }

  // prepara il form-data per OCR Space
  const formData = new FormData()
  formData.append('apikey', 'helloworld')         // API key free
  formData.append('language', 'ita')               // italiano
  formData.append('isOverlayRequired', 'false')
  formData.append('file', fs.createReadStream(upload.filepath), upload.originalFilename)

  // chiama OCR Space
  const ocrResp = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: formData,
  })
  const ocrJson = await ocrResp.json()
  if (ocrJson.IsErroredOnProcessing) {
    return res.status(500).json({ error: ocrJson.ErrorMessage })
  }

  // estrae il testo
  const text = ocrJson.ParsedResults
    .map(r => r.ParsedText)
    .join('\n')
    .trim()

  // pulisci
  fs.unlinkSync(upload.filepath)

  res.status(200).json({ text })
}
