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
    // Esegui multer per parsare il corpo multipart/form-data
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

    // Crea un Readable stream dal buffer
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: req.file.buffer,               // il buffer grezzo
      fileName: req.file.originalname,     // N maiuscola
      response_format: 'json',
      language: 'it'
    })
    console.log('[STT] whisper response=', transcription)

    // Restituisci il testo trascritto
    return res.status(200).json({ text: transcription.text })
  } catch (err) {
    console.error('[STT] error →', err)
    // Se la risposta di rete è disponibile, loggala
    if (err.response) console.error('[STT] response error →', err.response.data)
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}
