// pages/api/ocr-generic.js
// Wrapper generico OCR — accetta FormData con campo "images"
// Compatibile con /api/ocr già esistente, serve per prodotti-tipici-vini.js
import multer from 'multer'
import Tesseract from 'tesseract.js'
import OpenAI from 'openai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

const writeFile = promisify(fs.writeFile)
const unlink    = promisify(fs.unlink)

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
  api: { bodyParser: false, externalResolver: true },
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' })
  }

  const tmpFiles = []

  try {
    await runMiddleware(req, res, upload.array('images', 10))

    const files = req.files || []
    if (!files.length) {
      return res.status(400).json({ error: 'Nessuna immagine ricevuta' })
    }

    let fullText = ''

    for (const file of files) {
      // Tenta Vision API se disponibile, altrimenti Tesseract
      if (openai) {
        try {
          const base64 = file.buffer.toString('base64')
          const mime   = file.mimetype || 'image/jpeg'
          const vRes   = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' },
                },
                {
                  type: 'text',
                  text: 'Trascrivi tutto il testo visibile in questa immagine. Mantieni la struttura originale, vai a capo dove necessario. Rispondi solo con il testo trascritto.',
                },
              ],
            }],
          })
          const chunk = vRes.choices?.[0]?.message?.content?.trim() || ''
          if (chunk) { fullText += chunk + '\n\n'; continue }
        } catch (e) {
          console.warn('[ocr-generic] Vision fallback a Tesseract:', e?.message)
        }
      }

      // Tesseract fallback
      const tmpPath = path.join(os.tmpdir(), `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)
      tmpFiles.push(tmpPath)
      await writeFile(tmpPath, file.buffer)
      const { data: { text } } = await Tesseract.recognize(tmpPath, 'ita+eng')
      if (text?.trim()) fullText += text.trim() + '\n\n'
    }

    const finalText = fullText.trim()
    if (!finalText) {
      return res.status(422).json({ error: 'Nessun testo riconosciuto' })
    }

    return res.status(200).json({ text: finalText })

  } catch (err) {
    console.error('[ocr-generic] error:', err?.message || err)
    return res.status(500).json({ error: 'Errore OCR: ' + (err?.message || 'errore sconosciuto') })
  } finally {
    for (const p of tmpFiles) {
      try { await unlink(p) } catch {}
    }
  }
}