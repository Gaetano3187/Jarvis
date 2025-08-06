// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import Tesseract from 'tesseract.js'

export const config = {
  api: {
    bodyParser: false, // disabilita il parsing built-in di Next.js
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const form = new IncomingForm()
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err)
      return res.status(500).json({ error: 'Error parsing form data' })
    }

    const imageFile = files.image
    if (!imageFile) {
      return res.status(400).json({ error: 'No image uploaded' })
    }

    try {
      const {
        data: { text },
      } = await Tesseract.recognize(
        imageFile.filepath,
        'ita',            // lingua italiana
        { logger: (m) => console.log(m) }
      )
      res.status(200).json({ text })
    } catch (e) {
      console.error('OCR failed:', e)
      res.status(500).json({ error: 'OCR processing failed' })
    } finally {
      // pulizia del file temporaneo
      fs.unlink(imageFile.filepath, (unlinkErr) => {
        if (unlinkErr) console.warn('Temp file cleanup failed:', unlinkErr)
      })
    }
  })
}
