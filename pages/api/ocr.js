// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import sharp from 'sharp'
import { createWorker, PSM } from 'tesseract.js'
import pdfParse from 'pdf-parse'

export const config = {
  api: { bodyParser: false }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // inizializza il worker Tesseract con il core WASM servito da /public
  const worker = createWorker({
    corePath: '/tesseract-core-simd.wasm',
    logger: m => console.log(m),
  })
  await worker.load()
  await worker.loadLanguage('ita')
  await worker.initialize('ita')

  await new Promise((resolve) => {
    const form = new IncomingForm({ keepExtensions: true })

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('⚠️ parse error:', err)
        res.status(500).json({ step: 'parse', error: err.message })
        await worker.terminate()
        return resolve()
      }

      console.log('➡️ OCR fields:', fields)
      console.log('➡️ OCR files keys:', Object.keys(files))

      const fileList = files.images
      if (!fileList) {
        console.error('❌ Nessun file trovato in files.images')
        res.status(400).json({ step: 'no-file', error: 'files.images undefined' })
        await worker.terminate()
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
          await worker.terminate()
          return resolve()
        }

        // Se è un PDF, prova prima a estrarre testo nativo
        if (file.mimetype === 'application/pdf') {
          try {
            const dataBuffer = fs.readFileSync(imagePath)
            const pdfData = await pdfParse(dataBuffer)
            if (pdfData.text?.trim()) {
              console.log('✅ PDF native text:', pdfData.text.trim().slice(0, 100))
              combinedText += pdfData.text.trim() + '\n'
              fs.unlinkSync(imagePath)
              continue
            }
            console.log('ℹ️ PDF senza testo nativo, passeremo a OCR per immagine')
          } catch (pdfErr) {
            console.error('❌ errore pdf-parse:', pdfErr)
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
        }

        // OCR su immagine (preprocessed o originale)
        try {
          const sourcePath = fs.existsSync(preprocPath) ? preprocPath : imagePath
          const { data: { text } } = await worker.recognize(
            sourcePath,
            'ita',
            {
              tessedit_pageseg_mode: PSM.AUTO,
              tessedit_char_whitelist:
                '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,-/:€ '
            }
          )
          console.log('✅ OCR snippet:', text.trim().slice(0, 100))
          combinedText += text.trim() + '\n'
        } catch (ocrErr) {
          console.error('❌ OCR recognize error:', ocrErr)
          res.status(500).json({ step: 'recognize', error: String(ocrErr) })
          await worker.terminate()
          return resolve()
        } finally {
          // pulisco temporanei
          try { fs.unlinkSync(imagePath) } catch {}
          try { fs.unlinkSync(preprocPath) } catch {}
        }
      }

      res.status(200).json({ text: combinedText.trim() })
      await worker.terminate()
      resolve()
    })
  })
}
