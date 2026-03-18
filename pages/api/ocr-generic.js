// pages/api/ocr-generic.js
// Accetta FormData con campo "images" + campo opzionale "mode"
// mode=wine_label  → estrae JSON strutturato per etichette vino
// mode=text (default) → restituisce testo grezzo per sommelier OCR
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

/* ── Prompt dedicato etichetta vino ─────────────────────────────── */
const WINE_LABEL_PROMPT = `Sei un esperto di vini italiani. Analizza questa etichetta e restituisci SOLO un oggetto JSON con questi campi:
{
  "name": "denominazione del vino es. Montepulciano d'Abruzzo",
  "winery": "nome completo della cantina/azienda agricola",
  "locality": "città e provincia es. Vasto (CH)",
  "region": "regione italiana es. Abruzzo",
  "vintage": 2004,
  "alcohol": 13.0,
  "denomination": "es. DOC, DOCG, IGT con nome",
  "grapes": ["vitigno1", "vitigno2"],
  "style": "rosso|bianco|rosé|frizzante|fortificato",
  "volume_ml": 750,
  "website": "url se visibile o null"
}
Regole:
- Estrai ESATTAMENTE ciò che è scritto, non inventare.
- "name" è la denominazione del vino (es. "Montepulciano d'Abruzzo"), NON il nome della cantina.
- "winery" è il produttore/cantina (es. "Azienda Agricola Jasci Donatello").
- "locality" è la città dove ha sede la cantina (es. "Vasto (CH)").
- Se un campo non è visibile nell'etichetta, usa null.
- Rispondi SOLO JSON valido, nessun testo extra.`

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

    // Leggi mode dal body (multer lo mette in req.body dopo array())
    const mode = req.body?.mode || 'text'

    /* ══ MODE: wine_label — JSON strutturato via GPT Vision ══ */
    if (mode === 'wine_label' && openai) {
      const file   = files[0] // usa solo la prima immagine
      const base64 = file.buffer.toString('base64')
      const mime   = file.mimetype || 'image/jpeg'

      try {
        const vRes = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 800,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' },
              },
              { type: 'text', text: WINE_LABEL_PROMPT },
            ],
          }],
        })

        const raw  = vRes.choices?.[0]?.message?.content || '{}'
        const data = JSON.parse(raw)

        // Normalizza i tipi
        const wine = {
          name:        String(data.name        || '').trim() || null,
          winery:      String(data.winery      || '').trim() || null,
          locality:    String(data.locality    || '').trim() || null,
          region:      String(data.region      || '').trim() || null,
          vintage:     data.vintage  ? Number(data.vintage)  : null,
          alcohol:     data.alcohol  ? Number(data.alcohol)  : null,
          denomination:String(data.denomination|| '').trim() || null,
          grapes:      Array.isArray(data.grapes) ? data.grapes.map(String).filter(Boolean) : [],
          style:       ['rosso','bianco','rosé','frizzante','fortificato'].includes(data.style) ? data.style : 'rosso',
          volume_ml:   data.volume_ml ? Number(data.volume_ml) : 750,
          website:     data.website  ? String(data.website).trim() : null,
        }

        // Testo grezzo come fallback per altri usi
        const textFallback = [wine.name, wine.winery, wine.locality, wine.vintage].filter(Boolean).join(', ')

        return res.status(200).json({ wine, text: textFallback, mode: 'wine_label' })

      } catch (e) {
        console.error('[ocr-generic] wine_label GPT error:', e?.message)
        // Fallback a testo grezzo se GPT fallisce
      }
    }

    /* ══ MODE: text — testo grezzo per sommelier OCR ══ */
    let fullText = ''

    for (const file of files) {
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

    return res.status(200).json({ text: finalText, mode: 'text' })

  } catch (err) {
    console.error('[ocr-generic] error:', err?.message || err)
    return res.status(500).json({ error: 'Errore OCR: ' + (err?.message || 'errore sconosciuto') })
  } finally {
    for (const p of tmpFiles) {
      try { await unlink(p) } catch {}
    }
  }
}