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
      return resolve(result)
    })
  })
}

export const config = {
  api: {
    bodyParser: false,      // disabilita il parser built-in per multipart
    externalResolver: true, // evita warning “API resolved without sending…”
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` })
  }

  try {
    // Parsiamo il multipart/form-data per estrarre "audio"
    await runMiddleware(req, res, upload.single('audio'))

    if (!req.file) {
      return res.status(400).json({ error: 'File audio mancante' })
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    })

    // Trasformiamo il Buffer in uno Readable stream
    const bufferStream = new Readable()
    bufferStream.push(req.file.buffer)
    bufferStream.push(null)

    // Invio a Whisper per la trascrizione
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: bufferStream,
      filename: req.file.originalname,
    })

    // Ritorniamo solo il testo trascritto
    return res.status(200).json({ text: transcription.text })
  } catch (err) {
    console.error('STT API error:', err)
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}
