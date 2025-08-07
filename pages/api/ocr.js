// pages/api/ocr.js
import formidable from 'formidable'
import fs from 'fs'
import FormData from 'form-data'

export const config = {
  api: {
    bodyParser: false, // disabilitiamo il parser di Next per usare formidable
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const form = new formidable.IncomingForm({ multiples: true })
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err)
      return res.status(500).json({ error: err.message })
    }

    // Prendi il primo file di images
    const imageFile = Array.isArray(files.images)
      ? files.images[0]
      : files.images

    if (!imageFile) {
      return res.status(400).json({ error: 'Nessuna immagine inviata' })
    }

    // Leggi il buffer
    const buffer = await fs.promises.readFile(imageFile.filepath)

    // Prepara la richiesta a OCR.Space
    const ocrForm = new FormData()
    ocrForm.append('apikey', process.env.OCR_SPACE_API_KEY)
    ocrForm.append('language', 'ita')
    ocrForm.append('isOverlayRequired', 'false')
    ocrForm.append('file', buffer, {
      filename: imageFile.originalFilename,
      contentType: imageFile.mimetype,
    })

    try {
      const ocrRes = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: ocrForm.getHeaders(),
        body: ocrForm,
      })
      const json = await ocrRes.json()

      if (json.IsErroredOnProcessing) {
        console.error('OCR.Space error:', json.ErrorMessage)
        return res.status(500).json({ error: json.ErrorMessage })
      }

      // Unisci tutti i testi estratti
      const text = json.ParsedResults
        .map(r => r.ParsedText)
        .filter(Boolean)
        .join('\n')

      return res.status(200).json({ text })
    } catch (fetchErr) {
      console.error('Fetch OCR.Space failed:', fetchErr)
      return res.status(500).json({ error: fetchErr.message })
    }
  })
}
