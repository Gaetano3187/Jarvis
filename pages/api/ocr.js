// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { createWorker, PSM } from 'tesseract.js'

export const config = {
  api: { bodyParser: false }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // percorso assoluto al wasm in public/
  const wasmPath = path.join(process.cwd(), 'public', 'tesseract-core-simd.wasm')
  const worker = createWorker({
    corePath: `file://${wasmPath}`,
    logger: m => console.log(m),
  })

  // inizializza il worker
  await worker.load()
  await worker.loadLanguage('ita')
  await worker.initialize('ita')

  try {
    await new Promise(resolve => {
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

        const images = Array.isArray(fileList) ? fileList : [fileList]
        let combinedText = ''

        for (const file of images) {
          console.log('➡️ OCR file raw object:', file)
          const imagePath =
               file.filepath    // formidable v3
            || file.path        // versioni precedenti
            || file._writeStream?.path

          console.log('📂 OCR imagePath:', imagePath)
          if (!imagePath) {
            res.status(500).json({ step: 'no-path', error: 'imagePath undefined' })
            return resolve()
          }

          // 1) Preprocess: scala di grigi + binarizzazione
          const preprocPath = imagePath + '-pre.jpg'
          try {
            await sharp(imagePath)
              .grayscale()
              .threshold(140)
              .toFile(preprocPath)
          } catch (prepErr) {
            console.warn('❌ preprocessing error, uso originale:', prepErr)
          }

          // 2) OCR
          try {
            const src = fs.existsSync(preprocPath) ? preprocPath : imagePath
            const { data: { text } } = await worker.recognize(
              src,
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
            return resolve()
          } finally {
            try { fs.unlinkSync(imagePath) } catch {}
            try { fs.unlinkSync(preprocPath) } catch {}
          }
        }

        res.status(200).json({ text: combinedText.trim() })
        resolve()
      })
    })
  } finally {
    await worker.terminate()
  }
}
