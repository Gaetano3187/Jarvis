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
    // multer
    await runMiddleware(req, res, upload.single('audio'))
    console.log('[STT] multer done, file=', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
    })
    if (!req.file) {
      console.log('[STT] no file in request')
      return res.status(400).json({ error: 'File audio mancante' })
    }

    // crea stream
    const bufferStream = new Readable()
    bufferStream.push(req.file.buffer)
    bufferStream.push(null)

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
    console.log('[STT] calling Whisper…')
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: bufferStream,
      response_format: 'json',  // formato semplice
      language: 'it'            // forza l'italiano
    })
    console.log('[STT] whisper response=', transcription)

    return res.status(200).json({ text: transcription.text })
  } catch (err) {
    console.error('[STT] error →', err)
    // se disponibile, logghiamo anche la risposta di rete
    if (err.response) console.error('[STT] response error →', err.response.data)
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}
