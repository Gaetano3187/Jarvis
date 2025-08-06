// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import Tesseract from 'tesseract.js'

// Disabilitiamo il bodyParser di Next.js per gestire multipart via formidable
export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = new IncomingForm()
  form.parse(req, async (err, _fields, files) => {
    if (err) {
      console.error('form.parse error:', err)
      return res.status(500).json({ error: 'Error parsing form data' })
    }

    const imageFile = files.image
    if (!imageFile) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const imagePath = imageFile.filepath || imageFile.path

    try {
      const { data: { text } } = await Tesseract.recognize(
        imagePath,
        'ita',
        {
          logger: m => console.log('OCR:', m),
          // prendi il core wasm dal CDN
          corePath:
            'https://unpkg.com/tesseract.js-core@2.1.5/tesseract-core.wasm.js',
          // punti al repo ufficiale dei traineddata
          langPath:
            'https://raw.githubusercontent.com/tesseract-ocr/tessdata/main',
        }
      )

      // restituisco il testo grezzo estratto
      return res.status(200).json({ text })
    } catch (e) {
      console.error('OCR failed:', e)
      return res.status(500).json({ error: e.message || 'OCR failed' })
    } finally {
      // pulisco sempre il file temporaneo
      try { fs.unlinkSync(imagePath) } catch (_){}
    }
  })
}
