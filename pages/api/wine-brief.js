// pages/api/wine-brief.js
// Restituisce annate migliori e abbinamento per un vino dato
// GET /api/wine-brief?q=Barolo+Giacomo+Conterno+Nebbiolo
import OpenAI from 'openai'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

// Cache in-memory 30 minuti
const cache = new Map()
const TTL   = 30 * 60 * 1000

const SYSTEM = `Sei un sommelier esperto di vini italiani.
Dato il nome di un vino (con eventuale cantina/denominazione/regione), rispondi SOLO con JSON:
{
  "best_vintages": ["2016","2019","2021"],
  "pairing": "Abbinamento ideale in una frase concisa"
}
- best_vintages: 3-5 annate recenti considerate eccellenti per questo vino.
- pairing: 1 frase breve (max 12 parole), specifica e utile.
- Se non conosci il vino, restituisci best_vintages:[] e pairing generico basato sul tipo.
Rispondi SOLO JSON valido.`

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const q = String(req.query?.q || '').trim().slice(0, 200)
  if (!q) return res.status(400).json({ error: 'Query mancante' })

  // Cache hit
  const cached = cache.get(q)
  if (cached && Date.now() - cached.t < TTL) {
    return res.status(200).json(cached.data)
  }

  // Fallback statico se OpenAI non è configurato
  if (!openai) {
    const fallback = { best_vintages: [], pairing: 'Abbinamento non disponibile (API non configurata)' }
    return res.status(200).json(fallback)
  }

  try {
    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: q },
      ],
    })

    const raw  = resp.choices?.[0]?.message?.content || '{}'
    const data = JSON.parse(raw)

    // Normalizza
    const result = {
      best_vintages: Array.isArray(data.best_vintages)
        ? data.best_vintages.slice(0, 6).map(String)
        : [],
      pairing: String(data.pairing || '').slice(0, 200),
    }

    cache.set(q, { t: Date.now(), data: result })
    return res.status(200).json(result)

  } catch (err) {
    console.error('[wine-brief] error:', err?.message)
    return res.status(200).json({ best_vintages: [], pairing: '' })
  }
}