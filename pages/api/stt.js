// pages/api/stt.js
import multer from 'multer'
import FormData from 'form-data'
import fetch from 'node-fetch'

// multer in‐memory
const upload = multer({ storage: multer.memoryStorage() })

// wrapper per multer senza next-connect
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (resul) => {
      if (resul instanceof Error) return reject(resul)
      resolve(resul)
    })
  })
}

export const config = {
  api: {
    bodyParser: false,      // disabilitiamo il bodyParser integrato
    externalResolver: true, // per evitare warning su Vercel
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

    // 2) ricreiamo un FormData con form-data
    const form = new FormData()
    form.append('model', 'whisper-1')
    form.append('file',
      req.file.buffer,
      { filename: req.file.originalname, contentType: req.file.mimetype }
    )

    // 3) inviamo direttamente all’endpoint REST di Whisper
    const openaiKey = process.env.OPENAI_API_KEY
    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          ...form.getHeaders(),
        },
        body: form,
      }
    )

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      console.error('Whisper trascrizione fallita:', response.status, errJson)
      return res.status(500).json({ error: 'Errore trascrizione', details: errJson })
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
