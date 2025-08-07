// pages/api/ocr.js 
import { IncomingForm } from 'formidable'
import fs from 'fs'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

export const config = {
  api: { bodyParser: false }
}

// inizializza il worker una sola volta
const workerPromise = (async () => {
  const worker = createWorker({
    corePath: '/tesseract-core-simd.wasm',  // ora servito da public/
    logger: m => console.log(m),
  })
  await worker.load()
  await worker.loadLanguage('ita')
  await worker.initialize('ita')
  return worker
})()

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let worker
  try {
    worker = await workerPromise
  } catch (err) {
    console.error('❌ Worker initialization error:', err)
    return res
      .status(500)
      .json({ error: 'OCR worker failed to initialize', detail: err.message })
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
        res.status(400).json({ step: 'no-file', error: 'files.images undefined' })
        return resolve()
      }

      const uploads = Array.isArray(fileList) ? fileList : [fileList]
      let combinedText = ''

      for (const file of uploads) {
        const imagePath = file.filepath || file.path || file._writeStream?.path
        if (!imagePath) {
          res.status(500).json({ step: 'no-path', error: 'imagePath undefined' })
          return resolve()
        }

        // 1) Preprocessing: scala di grigi + binarizzazione
        const preproc = imagePath + '-pre.jpg'
        try {
          await sharp(imagePath)
            .grayscale()
            .threshold(140)
            .toFile(preproc)
        } catch {
          // ignoro e userò l'originale
        }

        // 2) OCR sul file preprocessato (o sull'originale)
        const src = fs.existsSync(preproc) ? preproc : imagePath
        try {
          const { data: { text } } = await worker.recognize(src)
          combinedText += text.trim() + '\n'
        } catch (ocrErr) {
          console.error('❌ OCR error:', ocrErr)
          res.status(500).json({ step: 'recognize', error: String(ocrErr) })
          return resolve()
        } finally {
          // pulisco i temporanei
          try { fs.unlinkSync(imagePath) } catch {}
          try { fs.unlinkSync(preproc) } catch {}
        }
      }

      res.status(200).json({ text: combinedText.trim() })
      resolve()
    })
  })
}

