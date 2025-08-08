// pages/api/stt.js
import multer from 'multer'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import OpenAI from 'openai'

const writeFile = promisify(fs.writeFile)
const unlink   = promisify(fs.unlink)

// In‐memory storage per multer + limite dimensione (es. 25MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

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

  // Verifica API key prima di procedere
  if (!process.env.OPENAI_API_KEY) {
    console.error('[STT] OPENAI_API_KEY mancante')
    return res.status(500).json({ error: 'Configurazione STT mancante' })
  }

  let tmpPath // per cleanup in finally
  try {
    // 1) multer legge il file in memoria
    await runMiddleware(req, res, upload.single('audio'))
    if (!req.file) {
      console.log('[STT] no file in request')
      return res.status(400).json({ error: 'File audio mancante' })
    }
    console.log('[STT] multer:', req.file.originalname, req.file.mimetype, req.file.size)

    // 2) scrivi un file temporaneo (Vercel consente /tmp)
    const tmpDir  = os.tmpdir() || '/tmp'
    const safeName = (req.file.originalname || 'audio.webm').replace(/[^\w.\-]/g, '_')
    tmpPath = path.join(tmpDir, `${Date.now()}-${safeName}`)
    await writeFile(tmpPath, req.file.buffer)
    console.log('[STT] wrote temp file ->', tmpPath)

    // 3) invoca il modello STT (OpenAI SDK v4)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // ⬇️ CAMBIATO: modello consigliato per trascrizione
    const transcription = await openai.audio.transcriptions.create({
      model: 'gpt-4o-mini-transcribe',
      file: fs.createReadStream(tmpPath),
      response_format: 'json',
      language: 'it',
      // prompt: 'Contesto opzionale…', // se serve
    })

    const text = (transcription && transcription.text) ? transcription.text.trim() : ''
    if (!text) {
      console.warn('[STT] risposta vuota dal modello')
      return res.status(502).json({ error: 'Trascrizione vuota' })
    }

    // 4) restituisci la trascrizione
    return res.status(200).json({ text })
  } catch (err) {
    console.error('[STT] error →', err?.message || err)
    if (err?.response?.data) console.error('[STT] response error →', err.response.data)
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? (err?.message || String(err)) : undefined,
    })
  } finally {
    // 5) cleanup file temporaneo
    if (tmpPath) {
      try {
        await unlink(tmpPath)
        console.log('[STT] temp file removed')
      } catch (e) {
        console.warn('[STT] temp file removal failed:', e?.message || e)
      }
    }
  }
}
