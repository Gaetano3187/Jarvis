// pages/api/ocr.js
import formidable from 'formidable'
import fs from 'fs'
import Tesseract from 'tesseract.js'

export const config = {
  api: {
    bodyParser: false, // disabilita il parsing built-in di Next.js
  },
}

// helper per trasformare formidable in promise
const parseForm = req =>
  new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm()
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err)
      resolve({ fields, files })
    })
  })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // 1) parsing multipart/form-data
    const { files } = await parseForm(req)

    // 2) recupera il file (potrebbe essere array o singolo)
    const fileData = Array.isArray(files.image) ? files.image[0] : files.image
    if (!fileData) {
      return res.status(400).json({ error: 'No image file provided' })
    }
    const imagePath = fileData.filepath || fileData.path

    // 3) lancia Tesseract OCR
    const {
      data: { text },
    } = await Tesseract.recognize(imagePath, 'ita', {
      logger: m => console.log('OCR progress:', m),
    })

    // 4) rispondi con il testo e pulisci il file
    res.status(200).json({ text })
    fs.unlink(imagePath, err => {
      if (err) console.error('Failed to delete temp file:', err)
    })
  } catch (err) {
    console.error('OCR handler error:', err)
    res.status(500).json({ error: 'OCR failed' })
  }
}
