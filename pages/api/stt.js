// pages/api/stt.js
import multer from 'multer'
import { Readable } from 'stream'
import OpenAI from 'openai'

// In-memory storage per multer
const upload = multer({ storage: multer.memoryStorage() })

// Helper per usare multer senza next-connect
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
    bodyParser: false,      // disabilita il parser built-in per multipart
    externalResolver: true, // evita warning “API resolved senza inviare…”
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` })
  }

  try {
    // 1) multer per parsare il form
    await runMiddleware(req, res, upload.single('audio'))
    if (!req.file) {
      return res.status(400).json({ error: 'File audio mancante' })
    }

    // 2) creiamo uno stream a partire dal buffer
    const bufferStream = new Readable({
      read() {
        this.push(req.file.buffer)
        this.push(null)
      }
    })

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })

    // 3) invio a Whisper: qui openai-node genera un multipart corretto
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: bufferStream,
      filename: req.file.originalname,  // es. "voice.webm"
    })

    // 4) restituiamo solo il testo
    return res.status(200).json({ text: transcription.text })

  } catch (err) {
    console.error('STT API error:', err)
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}
