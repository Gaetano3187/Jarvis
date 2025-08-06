// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import Tesseract from 'tesseract.js'

// Disabilita il body parser integrato di Next
export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new IncomingForm()

  form.parse(req, async (err, _fields, files) => {
    if (err) {
      console.error('form.parse error:', err)
      return res.status(500).json({ error: 'Error parsing form data' })
    }

    const imageFile = files.image
    if (!imageFile) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const imagePath = imageFile.filepath || imageFile.path

    try {
      // esegue l’OCR
      const { data: { text } } = await Tesseract.recognize(
        imagePath,
        'ita',
        { logger: m => console.log(m) }
      )

      // restituisci solo il testo raw
      res.status(200).json({ text })
    } catch (e) {
      console.error('OCR failed:', e)
      res.status(500).json({ error: 'OCR failed' })
    } finally {
      // elimina sempre il file temporaneo
      try { fs.unlinkSync(imagePath) } catch (_) {}
    }
  })
}
