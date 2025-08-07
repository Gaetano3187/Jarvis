// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import sharp from 'sharp'
import Tesseract from 'tesseract.js'
import pdfParse from 'pdf-parse'

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

      const fileList = files.images
      if (!fileList) {
        console.error('❌ Nessun file trovato in files.images')
        res.status(400).json({ step: 'no-file', error: 'files.images undefined' })
        return resolve()
      }

      const uploads = Array.isArray(fileList) ? fileList : [fileList]
      let combinedText = ''

      for (const file of uploads) {
        console.log('➡️ OCR file raw object:', file)

        const imagePath =
             file.filepath    // formidable v3
          || file.path        // versioni precedenti
          || file._writeStream?.path

        if (!imagePath) {
          res.status(500).json({ step: 'no-path', error: 'imagePath undefined' })
          return resolve()
        }

        // Se è un PDF, prima proviamo a estrarre testo nativo
        if (file.mimetype === 'application/pdf') {
          try {
            const dataBuffer = fs.readFileSync(imagePath)
            const pdfData = await pdfParse(dataBuffer)
            if (pdfData.text && pdfData.text.trim()) {
              console.log('✅ PDF native text:', pdfData.text.trim().slice(0, 100))
              combinedText += pdfData.text.trim() + '\n'
              // cancelliamo il file PDF e passiamo al prossimo
              fs.unlinkSync(imagePath)
              continue
            }
            // altrimenti cadremo sul OCR delle immagini sottostanti
            console.log('ℹ️ PDF senza testo nativo, passeremo a OCR per immagine')
          } catch (pdfErr) {
            console.error('❌ errore pdf-parse:', pdfErr)
            // proseguiamo comunque con OCR
          }
        }

        // Preprocessing immagine
        const preprocPath = imagePath + '-pre.jpg'
        try {
          await sharp(imagePath)
            .grayscale()
            .threshold(140)
            .toFile(preprocPath)
        } catch (prepErr) {
          console.error('❌ preprocessing error:', prepErr)
          // se fallisce, useremo l'originale
        }

        // OCR su immagine (preprocessed o originale)
        try {
          const sourcePath = fs.existsSync(preprocPath) ? preprocPath : imagePath
          const { data: { text } } = await Tesseract.recognize(
            sourcePath,
            'ita',
            {
              tessedit_pageseg_mode: Tesseract.PSM.AUTO,
              tessedit_char_whitelist:
                '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,-/:€ '
            }
          )
          console.log('✅ OCR snippet:', text.trim().slice(0, 100))
          combinedText += text.trim() + '\n'
        } catch (ocrErr) {
          console.error('❌ OCR recognize error:', ocrErr)
          res.status(500).json({ step: 'recognize', error: String(ocrErr) })
          return resolve()
        } finally {
          // pulisco temporanei
          try { fs.unlinkSync(imagePath) } catch {}
          try { fs.unlinkSync(preprocPath) } catch {}
        }
      }

      res.status(200).json({ text: combinedText.trim() })
      resolve()
    })
  })
}
