import { IncomingForm } from 'formidable'
import fs from 'fs'
import { createWorker } from 'tesseract.js'

export const config = {
  api: {
    bodyParser: false, // disabilitiamo il parsing built-in
  },
}

export default async function handler(req, res) {
  console.log('→ [OCR API] Ricevuta richiesta:', req.method)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new IncomingForm()
  form.parse(req, async (err, fields, files) => {
    console.log('→ [OCR API] form.parse callback, err:', err)
    console.log('→ [OCR API] files:', files)

    if (err) {
      console.error('→ [OCR API] Errore parsing form:', err)
      return res.status(500).json({ error: 'Error parsing form', detail: err.message })
    }

    const file = files.image
    if (!file) {
      console.error('→ [OCR API] Nessun file ricevuto')
      return res.status(400).json({ error: 'No image file provided' })
    }

    const imagePath = file.filepath
    let worker
    try {
      worker = createWorker({
        logger: m => console.log('   [OCR]', m),
      })
      console.log('→ [OCR API] Inizializzo worker')
      await worker.load()
      await worker.loadLanguage('ita')
      await worker.initialize('ita')

      console.log('→ [OCR API] Riconoscimento in corso…')
      const {
        data: { text },
      } = await worker.recognize(imagePath)
      console.log('→ [OCR API] Testo estratto:', text.trim().slice(0, 100), '…')
      res.status(200).json({ text })
    } catch (e) {
      console.error('→ [OCR API] Errore OCR:', e)
      res.status(500).json({ error: 'OCR failed', detail: e.message })
    } finally {
      if (worker) {
        console.log('→ [OCR API] Terminazione worker')
        await worker.terminate()
      }
      try {
        fs.unlinkSync(imagePath)
        console.log('→ [OCR API] File temporaneo rimosso')
      } catch (e) {
        console.warn('→ [OCR API] Impossibile rimuovere file temporaneo:', e)
      }
    }
  })
}
