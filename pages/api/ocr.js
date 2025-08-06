// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import Tesseract from 'tesseract.js'

export const config = {
  api: { bodyParser: false }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  await new Promise((resolve) => {
    const form = new IncomingForm({ keepExtensions: true })

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('⚠️ parse error:', err)
        res.status(500).json({ step: 'parse', error: err.message })
        return resolve()
      }

      console.log('➡️ OCR fields:', fields)
      console.log('➡️ OCR files keys:', Object.keys(files))

      // files.image può essere un array (se il form ha name="image" più volte)
      let file = files.image
      if (Array.isArray(file)) file = file[0]

      if (!file) {
        console.error('❌ Nessun file trovato in files.image')
        res.status(400).json({ step: 'no-file', error: 'files.image undefined' })
        return resolve()
      }

      console.log('➡️ OCR file raw object:', file)

      // fallback sul path reale del file temporaneo
      const imagePath =
           file.filepath    // formidable v3
        || file.path        // versioni precedenti
        || file._writeStream?.path

      console.log('📂 OCR imagePath:', imagePath)
      if (!imagePath) {
        res.status(500).json({ step: 'no-path', error: 'imagePath undefined' })
        return resolve()
      }

      try {
        const {
          data: { text }
        } = await Tesseract.recognize(imagePath, 'ita')

        console.log('✅ OCR result snippet:', text.trim().slice(0, 100))
        res.status(200).json({ text })
      } catch (ocrErr) {
        console.error('❌ OCR recognize error:', ocrErr)
        res.status(500).json({ step: 'recognize', error: String(ocrErr) })
      } finally {
        // pulizia file temporaneo
        try { fs.unlinkSync(imagePath) } catch { /* ignore */ }
        resolve()
      }
    })
  })
}
