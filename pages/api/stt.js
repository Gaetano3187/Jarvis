// pages/api/stt.js
import multer from 'multer'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import OpenAI from 'openai'

const writeFile = promisify(fs.writeFile)
const unlink = promisify(fs.unlink)

// In-memory storage con limite 25MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

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

  if (!process.env.OPENAI_API_KEY) {
    console.error('[STT] OPENAI_API_KEY mancante')
    return res.status(500).json({ error: 'Configurazione STT mancante' })
  }

  let tmpPath = null

  try {
    // 1) Leggi il file "audio" dal form-data
    await runMiddleware(req, res, upload.single('audio'))
    if (!req.file) {
      console.log('[STT] no file in request')
      return res.status(400).json({ error: 'File audio mancante' })
    }
    console.log('[STT] multer:', req.file.originalname, req.file.mimetype, req.file.size)

    const langField = req.body?.language
    const promptField = req.body?.prompt

    // 2) Scrivi su /tmp (Vercel/Node) con estensione coerente
    const mime = req.file.mimetype || ''
    const extByMime = {
      'audio/webm': '.webm',
      'audio/mp4':  '.mp4',
      'audio/mpeg': '.mp3',
      'audio/wav':  '.wav',
      'audio/ogg':  '.ogg',
    }
    const safeName = (req.file.originalname || 'audio').replace(/[^\w.\-]/g, '_')
    const base = path.basename(safeName, path.extname(safeName))
    const ext  = extByMime[mime] || path.extname(safeName) || '.webm'

    const tmpDir = os.tmpdir() || '/tmp'
    tmpPath = path.join(tmpDir, `${Date.now()}-${base}${ext}`)
    await writeFile(tmpPath, req.file.buffer)
    console.log('[STT] wrote temp file ->', tmpPath)

    // 3) Transcribe con OpenAI SDK v4
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const MODEL = process.env.STT_MODEL || 'whisper-1'

    // Prompt lessicale ampliato
    const defaultPrompt =
      'Lista spesa italiana. Termini comuni: ' +
      // Spesa base
      'latte, pasta, riso, olio, zucchero, sale, uova, acqua, scottex, detersivo pavimenti, detersivo piatti, detersivo lavatrice, ' +
      'ammorbidente, candeggina, biscotti, cereali, passata di pomodoro, pelati, yogurt, burro, mozzarella, parmigiano, tonno, pollo, prosciutto, frutta, verdura, ' +
      // Igiene personale
      'shampoo, balsamo, bagnoschiuma, sapone liquido, deodorante, dentifricio, spazzolino, lamette da barba, crema viso, crema corpo, cotton fioc, assorbenti, salviette umidificate, profumo, ' +
      // Manutenzioni
      'lampadine, pile, nastro isolante, viti, chiodi, cacciavite, martello, guanti da lavoro, ' +
      // Fai da te
      'vernice, pennelli, trapano, carta abrasiva, stucco, silicone, colla, ' +
      // Beverage
      'birra, vino, prosecco, spumante, liquore, amaro, gin, vodka, rum, whisky, cocktail, aperol, campari, succo di frutta, coca cola, aranciata, tè freddo.'

    const prompt = (promptField && String(promptField)) ? String(promptField).slice(0, 1500) : defaultPrompt
    const language = (langField && String(langField)) || 'it'

    const transcription = await openai.audio.transcriptions.create({
      model: MODEL,
      file: fs.createReadStream(tmpPath),
      response_format: 'json',
      language,
      temperature: 0,
      prompt,
    })

    const text = transcription?.text?.trim() || ''
    if (!text) {
      console.warn('[STT] risposta vuota dal modello')
      return res.status(502).json({ error: 'Trascrizione vuota' })
    }

    return res.status(200).json({ text })
  } catch (err) {
    console.error('[STT] error →', err?.message || err)
    if (err?.response?.data) console.error('[STT] response error →', err.response.data)
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? (err?.message || String(err)) : undefined,
    })
  } finally {
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
