// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import { promises as fs } from 'fs'
import { createWorker } from 'tesseract.js'
import coreWasm from 'tesseract.js-core/tesseract-core-simd.wasm'

export const config = {
  api: {
    bodyParser: false, // disabilita il parser built-in di Next.js
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    console.log('→ /api/ocr ricevuta richiesta'); {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 1) parse multipart/form-data
  let files
  try {
    ;({ files } = await new Promise((resolve, reject) => {
      const form = new IncomingForm()
      form.parse(req, (err, _fields, files) =>
        err ? reject(err) : resolve({ files })
      )
    }))
    console.log('OCR: files:', files);
  } catch (err) {
    console.error('OCR parse error:', err)
    return res.status(500).json({ error: 'Error parsing form' })
  }

  const imagePath = files.image.filepath

  // 2) istanzio Tesseract con corePath corretta
  const worker = createWorker({
    corePath: coreWasm,
    logger: m => console.log('OCR:', m),
    gzip: false,
  })

  try {
    await worker.load()
    await worker.loadLanguage('ita')
    await worker.initialize('ita')

    const {
      data: { text },
    } = await worker.recognize(imagePath)

    // 3) termina il worker e cancella il file temporaneo
    await worker.terminate()
    await fs.unlink(imagePath)

    return res.status(200).json({ text })
  } catch (err) {
    console.error('OCR failed:', err)
    // assicuriamoci sempre di terminare e pulire
    try { await worker.terminate() } catch {}
    try { await fs.unlink(imagePath) } catch {}
    return res.status(500).json({ error: 'OCR failed' })
  }
}
