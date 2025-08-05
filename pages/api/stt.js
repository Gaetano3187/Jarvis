// pages/api/stt.js
import multer from 'multer'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import OpenAI from 'openai'

const writeFile = promisify(fs.writeFile)
const unlink   = promisify(fs.unlink)

// In‐memory storage per multer
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
    // 1) multer legge il file in memoria
    await runMiddleware(req, res, upload.single('audio'))
    if (!req.file) {
      console.log('[STT] no file in request')
      return res.status(400).json({ error: 'File audio mancante' })
    }
    console.log('[STT] multer done:', req.file.originalname, req.file.mimetype, req.file.size)

    // 2) scriviamo un file temporaneo
    const tmpDir  = os.tmpdir()
    const tmpPath = path.join(tmpDir, `${Date.now()}-${req.file.originalname}`)
    await writeFile(tmpPath, req.file.buffer)
    console.log('[STT] wrote temp file to', tmpPath)

    // 3) invochiamo Whisper tramite OpenAI SDK
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
    console.log('[STT] calling Whisper…')
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(tmpPath),
      response_format: 'json',
      language: 'it',
    })
    console.log('[STT] whisper response=', transcription)

    // 4) cancelliamo il file temporaneo
    await unlink(tmpPath)
    console.log('[STT] removed temp file')

    // 5) restituiamo la trascrizione
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
