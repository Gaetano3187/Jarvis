// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import path from 'path'
import { createWorker } from 'tesseract.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const form = new IncomingForm()
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[OCR API] parse error', err)
      return res.status(500).json({ error: 'Error parsing form' })
    }

    const imagePath = files.image.filepath
    console.log('[OCR API] imagePath:', imagePath)

    // crea il worker
    const worker = createWorker({
      logger: m => console.log('OCR:', m),
      corePath: '/tesseract-core-simd.wasm',      // ← serve dal public/
      workerPath: path.dirname(require.resolve('tesseract.js')) + '/dist/worker.min.js',
      langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@2.1.5/lang/',
    })

    try {
      await worker.load()
      await worker.loadLanguage('ita')
      await worker.initialize('ita')
      const { data: { text } } = await worker.recognize(imagePath)
      console.log('[OCR API] testo:', text)
      res.status(200).json({ text })
    } catch (e) {
      console.error('[OCR API] riconoscimento failed', e)
      res.status(500).json({ error: 'OCR failed' })
    } finally {
      await worker.terminate()
      fs.unlinkSync(imagePath)
    }
  })
}
