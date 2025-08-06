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

      // prendo files.images (potrebbero essercene più di uno)
      const fileList = files.images
      if (!fileList) {
        console.error('❌ Nessun file trovato in files.images')
        res.status(400).json({ step: 'no-file', error: 'files.images undefined' })
        return resolve()
      }

      const images = Array.isArray(fileList) ? fileList : [fileList]
      let combinedText = ''

      for (const file of images) {
        console.log('➡️ OCR file raw object:', file)

        const imagePath =
          file.filepath    // formidable v3
          || file.path     // versioni precedenti
          || file._writeStream?.path

        console.log('📂 OCR imagePath:', imagePath)
        if (!imagePath) {
          res.status(500).json({ step: 'no-path', error: 'imagePath undefined' })
          return resolve()
        }

        try {
          const {
            data: { text }
          } = await Tesseract.recognize(
            imagePath,
            'ita',
            {
              // PSM 3 = segmentazione automatica del layout
              tessedit_pageseg_mode: 3,
              // whitelist di caratteri per i valori tipici degli scontrini
              tessedit_char_whitelist:
                '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,-/:€ '
            }
          )

          console.log('✅ OCR result snippet:', text.trim().slice(0, 100))
          combinedText += text.trim() + '\n'
        } catch (ocrErr) {
          console.error('❌ OCR recognize error:', ocrErr)
          res.status(500).json({ step: 'recognize', error: String(ocrErr) })
          return resolve()
        } finally {
          // pulisco il file temporaneo
          try { fs.unlinkSync(imagePath) } catch { /* ignore */ }
        }
      }

      // restituisco il testo concatenato di tutte le immagini
      res.status(200).json({ text: combinedText.trim() })
      resolve()
    })
  })
}
