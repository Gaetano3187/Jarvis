// pages/api/stt.js
import multer from 'multer'
import { Readable } from 'stream'

// multer in-memory
const upload = multer({ storage: multer.memoryStorage() })

// helper per multer senza next-connect
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result)
      resolve(result)
    })
  })
}

export const config = {
  api: {
    bodyParser: false,      // disabilita il parser integrato
    externalResolver: true, // sopprime warning su Vercel
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` })
  }

  try {
    // 1) multer per parsare multipart/form-data
    await runMiddleware(req, res, upload.single('audio'))
    if (!req.file) {
      return res.status(400).json({ error: 'File audio mancante' })
    }

    // 2) ricreo un FormData nativo
    const form = new FormData()
    form.append('model', 'whisper-1')
    // Blob nativo di Node 18+
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype })
    form.append('file', blob, req.file.originalname)

    // 3) invio alla REST API di OpenAI
    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          // le boundary di FormData verranno aggiunte da form.getHeaders(), ma con fetch nativo
          // non serve: fetch le gestisce automaticamente
        },
        body: form,
      }
    )

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      console.error('Whisper error:', response.status, errBody)
      return res.status(500).json({ error: 'Errore trascrizione', details: errBody })
    }

    const { text } = await response.json()
    return res.status(200).json({ text })
  } catch (err) {
    console.error('STT API error:', err)
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}
