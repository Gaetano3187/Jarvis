// pages/api/ocr.js 
import { IncomingForm } from 'formidable'
import fs from 'fs'
import { createWorker } from 'tesseract.js'

export const config = {
  api: {
    bodyParser: false, // disabilita il parsing built-in di Next
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new IncomingForm()
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('form parse error', err)
      return res.status(500).json({ error: 'Error parsing form' })
    }

    const imagePath = files.image.filepath
    // Crei un worker che carica il wasm da CDN
    const worker = createWorker({
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@2.3.0/tesseract-core-simd.wasm',
      logger: m => console.log(m),
    })

    try {
      await worker.load()
      await worker.loadLanguage('ita')
      await worker.initialize('ita')
      const { data: { text } } = await worker.recognize(imagePath)
      res.status(200).json({ text })
    } catch (e) {
      console.error('OCR error', e)
      res.status(500).json({ error: 'OCR failed' })
    } finally {
      await worker.terminate()
      // pulisci il file temporaneo
      fs.unlinkSync(imagePath)
    }
  })
}
