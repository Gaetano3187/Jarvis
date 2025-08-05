// pages/api/stt.js
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage() })

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
    bodyParser: false,
    externalResolver: true,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` })
  }

  try {
    // 1️⃣ multer per parsare multipart/form-data
    await runMiddleware(req, res, upload.single('audio'))
    if (!req.file) {
      return res.status(400).json({ error: 'File audio mancante' })
    }

    // 2️⃣ ricreiamo il FormData per la richiesta a OpenAI
    const fd = new FormData()
    fd.append('model', 'whisper-1')
    fd.append('file', new Blob([req.file.buffer]), req.file.originalname)

    // 3️⃣ fetch diretto a /v1/audio/transcriptions
    const openaiKey = process.env.OPENAI_API_KEY
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: fd,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      console.error('Whisper error:', response.status, err)
      return res.status(500).json({ error: 'Errore trascrizione', details: err })
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
