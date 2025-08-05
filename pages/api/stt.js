// pages/api/stt.js
import multer from 'multer'
import { Readable } from 'stream'
import OpenAI from 'openai'

// In-memory storage per multer
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
  console.log('[STT] handler start, method=', req.method)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` })
  }

  try {
    // 1) multer legge il file
    await runMiddleware(req, res, upload.single('audio'))
    console.log('[STT] multer done, file=', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
    })
    if (!req.file) {
      return res.status(400).json({ error: 'File audio mancante' })
    }

    // 2) trasformiamo il buffer in Readable stream
    const bufferStream = new Readable()
    bufferStream.push(req.file.buffer)
    bufferStream.push(null)

    // 3) invochiamo Whisper tramite OpenAI SDK
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
    console.log('[STT] calling Whisper…')
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: bufferStream,                     // stream vero, non buffer grezzo
      fileName: req.file.originalname,        // la N maiuscola è importante
      response_format: 'json',
      language: 'it',
    })
    console.log('[STT] whisper response=', transcription)

    // 4) torniamo il testo trascritto
    return res.status(200).json({ text: transcription.text })
  } catch (err) {
    console.error('[STT] error →', err)
    if (err.response) console.error('[STT] response error →', err.response.data)
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}
