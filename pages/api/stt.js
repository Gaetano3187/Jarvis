// pages/api/stt.js
import multer from 'multer'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import OpenAI from 'openai'

const writeFile = promisify(fs.writeFile)
const unlink    = promisify(fs.unlink)

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

/* ─── Estensione sicura dal mimeType ────────────────────────────────────────
   Safari/iOS può mandare:
     audio/mp4, audio/x-m4a, audio/aac, video/mp4, audio/mp4;codecs=aac
   Chrome/Firefox mandano:
     audio/webm, audio/webm;codecs=opus, audio/ogg;codecs=opus
   Whisper accetta: mp3, mp4, m4a, wav, ogg, webm, mpeg, flac
   ─────────────────────────────────────────────────────────────────────── */
function resolveExtension(mimetype = '', originalname = '') {
  // Normalizza: prendi solo la parte prima di ";" e togli spazi
  const mime = String(mimetype || '').split(';')[0].trim().toLowerCase()

  const MAP = {
    'audio/webm':   '.webm',
    'audio/ogg':    '.ogg',
    'audio/mp4':    '.mp4',   // Safari standard
    'audio/x-m4a':  '.m4a',   // Safari alternativo
    'audio/m4a':    '.m4a',
    'audio/aac':    '.m4a',   // AAC → rinomina .m4a (Whisper lo accetta)
    'audio/x-aac':  '.m4a',
    'video/mp4':    '.mp4',   // iOS a volte usa video/mp4 per audio
    'audio/mpeg':   '.mp3',
    'audio/mp3':    '.mp3',
    'audio/wav':    '.wav',
    'audio/x-wav':  '.wav',
    'audio/flac':   '.flac',
  }

  if (MAP[mime]) return MAP[mime]

  // Fallback: estensione dal nome file originale
  const ext = path.extname(originalname || '').toLowerCase()
  if (ext && ext !== '.') return ext

  // Ultimo fallback: se contiene "mp4" o "m4a" nel mime → .mp4
  if (mime.includes('mp4') || mime.includes('m4a')) return '.mp4'
  if (mime.includes('ogg')) return '.ogg'
  if (mime.includes('aac')) return '.m4a'

  // Default: webm (Chrome/Firefox)
  return '.webm'
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

    console.log('[STT] file ricevuto:', {
      originalname: req.file.originalname,
      mimetype:     req.file.mimetype,
      size:         req.file.size,
    })

    // Controllo minimo dimensione (< 500 byte = registrazione vuota)
    if (req.file.size < 500) {
      return res.status(400).json({ error: 'Audio troppo corto, riprova' })
    }

    const langField   = req.body?.language
    const promptField = req.body?.prompt

    // 2) Scrivi su /tmp con estensione coerente al mime reale
    const ext     = resolveExtension(req.file.mimetype, req.file.originalname)
    const tmpDir  = os.tmpdir() || '/tmp'
    tmpPath       = path.join(tmpDir, `stt-${Date.now()}${ext}`)

    await writeFile(tmpPath, req.file.buffer)
    console.log('[STT] temp file scritto →', tmpPath, `(${req.file.size} bytes, ext=${ext})`)

    // 3) Transcribe con OpenAI Whisper
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const MODEL  = process.env.STT_MODEL || 'whisper-1'

    const defaultPrompt =
      'Trascrizione in italiano. Frasi tipiche: "ho incassato", "ho guadagnato", "mi ha pagato", ' +
      '"stipendio", "rimborso", "fattura", "bonif\u00edco", "mille euro", "cinquecento euro", ' +
      '"oggi", "ieri", "questo mese", ' +
      'lista spesa: latte, pasta, riso, olio, zucchero, sale, uova, acqua, scottex, detersivo, ' +
      'ammorbidente, biscotti, yogurt, burro, mozzarella, parmigiano, tonno, pollo, prosciutto, ' +
      'frutta, verdura, shampoo, dentifricio, birra, vino, coca cola.'

    const prompt   = promptField ? String(promptField).slice(0, 1500) : defaultPrompt
    const language = langField   ? String(langField) : 'it'

    const transcription = await openai.audio.transcriptions.create({
      model:           MODEL,
      file:            fs.createReadStream(tmpPath),
      response_format: 'json',
      language,
      temperature:     0,
      prompt,
    })

    const text = transcription?.text?.trim() || ''
    console.log('[STT] testo trascritto:', text || '(vuoto)')

    if (!text) {
      return res.status(502).json({ error: 'Trascrizione vuota — parla più vicino al microfono' })
    }

    return res.status(200).json({ text })

  } catch (err) {
    console.error('[STT] error →', err?.message || err)
    if (err?.response?.data) console.error('[STT] response error →', err.response.data)

    // Errore specifico OpenAI: formato non supportato
    const msg = String(err?.message || '')
    if (msg.includes('Invalid file format') || msg.includes('audio') || msg.includes('format')) {
      return res.status(422).json({
        error: 'Formato audio non supportato dal dispositivo. Riprova o usa un altro browser.',
      })
    }

    return res.status(500).json({
      error:   'Errore STT',
      details: process.env.NODE_ENV === 'development' ? (err?.message || String(err)) : undefined,
    })
  } finally {
    if (tmpPath) {
      try   { await unlink(tmpPath); console.log('[STT] temp file rimosso') }
      catch (e) { console.warn('[STT] temp file removal failed:', e?.message || e) }
    }
  }
}