// pages/api/stt.js

import multer from 'multer'
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
    // 1️⃣ Applichiamo multer per parsare l’audio
    await runMiddleware(req, res, upload.single('audio'))
    if (!req.file) {
      return res.status(400).json({ error: 'File audio mancante' })
    }

    // 2️⃣ Inizializziamo il client OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })

    // 3️⃣ Chiediamo la trascrizione a Whisper passandogli direttamente il Buffer
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: req.file.buffer,
      filename: req.file.originalname,  // es. "voice.webm"
    })

    // 4️⃣ Restituiamo solo il testo trascritto
    return res.status(200).json({ text: transcription.text })
  } catch (err) {
    console.error('STT API error:', err)
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}
