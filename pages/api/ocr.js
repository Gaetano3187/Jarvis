// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import Tesseract from 'tesseract.js'
import fs from 'fs'
import path from 'path'

export const config = {
  api: {
    bodyParser: false, // disabilita il parser built-in
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new IncomingForm()
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err)
      return res.status(500).json({ error: 'Error parsing form' })
    }

    const file = files.image
    if (!file) {
      return res.status(400).json({ error: 'No image uploaded' })
    }

    const imagePath = file.filepath || file.path || file.file; // a seconda della versione di formidable

    try {
      console.log('OCR: starting recognition on', imagePath)
      const { data: { text } } = await Tesseract.recognize(
        imagePath,
        'ita',
        { logger: m => console.log('OCR progress:', m) }
      )
      console.log('OCR: got text', text.trim().slice(0, 50) + '…')
      res.status(200).json({ text })
    } catch (e) {
      console.error('OCR error:', e)
      res.status(500).json({ error: 'OCR failed', details: String(e) })
    } finally {
      // rimuovi il file temporaneo
      try {
        fs.unlinkSync(imagePath)
      } catch (_) {}
    }
  })
}
