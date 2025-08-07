// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import sharp from 'sharp'
import { createWorker, PSM } from 'tesseract.js'

export const config = {
  api: { bodyParser: false }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // inizializzo il worker caricando il core wasm dalla CDN
  const worker = createWorker({
    corePath: 'https://unpkg.com/tesseract.js-core@4.0.2/tesseract-core-simd.wasm',
    logger: m => console.log('[Tesseract]', m),
  })
  await worker.load()
  await worker.loadLanguage('ita')
  await worker.initialize('ita')

  await new Promise(resolve => {
    const form = new IncomingForm({ keepExtensions: true })

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('⚠️ parse error:', err)
        res.status(500).json({ step: 'parse', error: err.message })
        return resolve()
      }

      const fileList = files.images
      if (!fileList) {
        res.status(400).json({ step: 'no-file', error: 'files.images undefined' })
        return resolve()
      }

      const images = Array.isArray(fileList) ? fileList : [fileList]
      let combinedText = ''

      for (const file of images) {
        const imagePath = file.filepath || file.path || file._writeStream?.path
        if (!imagePath) {
          res.status(500).json({ step: 'no-path', error: 'imagePath undefined' })
          return resolve()
        }

        // preprocessing: scala di grigi + binarizzazione
        const preprocPath = imagePath + '-pre.jpg'
        try {
          await sharp(imagePath)
            .grayscale()
            .threshold(140)
            .toFile(preprocPath)
        } catch (prepErr) {
          console.warn('⚠️ preprocessing failed, proceeding on original:', prepErr)
        }

        try {
          const target = fs.existsSync(preprocPath) ? preprocPath : imagePath
          const { data: { text } } = await worker.recognize(target, {
            tessedit_pageseg_mode: PSM.AUTO,
            tessedit_char_whitelist:
              '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,-/:€ '
          })
          combinedText += text.trim() + '\n'
        } catch (ocrErr) {
          console.error('❌ OCR error:', ocrErr)
          res.status(500).json({ step: 'recognize', error: String(ocrErr) })
          return resolve()
        } finally {
          try { fs.unlinkSync(imagePath) } catch {}
          try { fs.unlinkSync(preprocPath) } catch {}
        }
      }

      // termina il worker solo dopo aver processato tutte le immagini
      await worker.terminate()
      res.status(200).json({ text: combinedText.trim() })
      resolve()
    })
  })
}
