// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import Tesseract from 'tesseract.js'

export const config = {
  api: {
    bodyParser: false,  // disabilitiamo il parser Next.js
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Mettiamo tutto in una Promise per far funzionare form.parse con async/await
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
      const file = files.image || Object.values(files)[0]
      if (!file) {
        console.error('❌ Nessun file OCR trovato in "files"')
        res.status(400).json({ step: 'no-file', error: 'files.image undefined' })
        return resolve()
      }

      // fallback tra path e filepath
      const imagePath = file.filepath || file.path
      console.log('📂 OCR imagePath:', imagePath)
      if (!imagePath) {
        res.status(500).json({ step: 'no-path', error: 'imagePath undefined', file })
        return resolve()
      }

      try {
        // riconoscimento con la funzione statica
        const { data: { text } } = await Tesseract.recognize(imagePath, 'ita')
        console.log('✅ OCR result:', text.trim().slice(0, 100), '…')
        res.status(200).json({ text })
      } catch (ocrErr) {
        console.error('❌ OCR recognize error:', ocrErr)
        res.status(500).json({ step: 'recognize', error: String(ocrErr) })
      } finally {
        // puliamo il file temporaneo
        try { fs.unlinkSync(imagePath) } catch {}
        return resolve()
      }
    })
  })
}
