// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import { recognize } from 'tesseract.js'

export const config = {
  api: {
    bodyParser: false, // disabilito il bodyParser built-in di Next
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const form = new IncomingForm()
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('form parse error:', err)
      return res.status(500).json({ error: 'Error parsing form' })
    }

    const imagePath = files.image.filepath
    try {
      // estraggo direttamente il testo (lingua italiana)
      const {
        data: { text },
      } = await recognize(imagePath, 'ita')
      res.status(200).json({ text })
    } catch (e) {
      console.error('OCR failed:', e)
      res.status(500).json({ error: 'OCR failed' })
    } finally {
      // pulisco il file temporaneo
      fs.unlink(imagePath, () => {})
    }
  })
}
