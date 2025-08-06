// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import Tesseract from 'tesseract.js'
import fs from 'fs'

export const config = {
  api: {
    bodyParser: false,  // disabilita il parsing built-in di Next
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // parse form-data
  const form = new IncomingForm()
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error(err)
      return res.status(500).json({ error: 'Error parsing form' })
    }

    try {
      const imagePath = files.image.filepath
      // lancia Tesseract OCR
      const { data: { text } } = await Tesseract.recognize(
        imagePath,
        'ita',               // lingua italiana
        { logger: m => console.log(m) }
      )
      // restituisci il testo
      res.status(200).json({ text })
      // pulisci file temporaneo
      fs.unlinkSync(imagePath)
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: 'OCR failed' })
    }
  })
}
