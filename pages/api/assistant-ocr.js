// pages/api/assistant-ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: { bodyParser: false },
  runtime: 'nodejs', // evita Edge per usare formidable/OCR
}

// --- OpenAI & Supabase ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
})

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null

function safeParseJson(text) {
  try { return JSON.parse(text) } catch (_) {}
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a !== -1 && b !== -1 && b > a) {
    try { return JSON.parse(text.slice(a, b + 1)) } catch (_) {}
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito (usa POST)` })
  }

  // --- parse form-data: images (+ opzionale userId) ---
  let files, fields
  try {
    ({ files, fields } = await new Promise((resolve, reject) => {
      const form = new IncomingForm({ multiples: true, keepExtensions: true })
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err)
        resolve({ fields, files })
      })
    }))
  } catch (err) {
    console.error('[assistant-ocr] parse error:', err)
    return res.status(500).json({ error: String(err.message || err) })
  }

  const imgs = []
  const input = files?.images
  if (Array.isArray(input)) imgs.push(...input)
  else if (input) imgs.push(input)

  if (!imgs.length) {
    return res.status(400).json({ error: 'Nessun file nel campo "images"' })
  }

  // --- OCR via OCR.Space (come nel tuo ocr.js) ---
  const results = []
  for (const u of imgs) {
    try {
      const buf = await fs.promises.readFile(u.filepath)
      const blob = new Blob([buf], { type: u.mimetype || 'application/octet-stream' })
      const fd = new FormData()
      fd.append('apikey', process.env.OCRSPACE_API_KEY ?? 'helloworld')
      fd.append('language', 'ita')
      fd.append('isOverlayRequired', 'false')
      fd.append('file', blob, u.originalFilename || 'upload.jpg')

      const resp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: fd })
      const json = await resp.json()

      if (json?.IsErroredOnProcessing) {
        const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join(' | ') : (json.ErrorMessage || 'OCR error')
        throw new Error(msg)
      }

      const text = (json?.ParsedResults || [])
        .map(r => r?.ParsedText || '')
        .join('\n')
        .trim()

      results.push({ name: u.originalFilename || 'upload.jpg', text })
    } catch (err) {
      console.error('[assistant-ocr] ocr error:', u?.originalFilename, err)
      results.push({ name: u?.originalFilename || 'upload.jpg', text: '', error: String(err.message || err) })
    } finally {
      if (u?.filepath) fs.unlink(u.filepath, () => {})
    }
  }

  const joined = results
    .map(r => (r.error ? '' : `### ${r.name}\n${r.text}`))
    .filter(Boolean)
    .join('\n\n')

  if (!joined) {
    return res.status(500).json({ error: results.find(r => r.error)?.error || 'OCR fallito su tutti i file' })
  }

  // --- Prompt OpenAI: da scontrino -> azioni ---
  const systemPrompt = `
Sei Jarvis. Ricevi il TESTO OCR di uno scontrino.
Devi restituire **solo** JSON con questo schema:

{
  "removeFromList": ["nomeProdotto1", "nomeProdotto2"],
  "addToInventory": [
    { "name": "nomeProdotto", "quantity": 1, "unit": "pz", "category": "casa" }
  ]
}

Regole:
- Normalizza i nomi (minuscolo, rimuovi parole inutili tipo "offerta", "promo", brand non essenziali).
- quantity/unit quando presenti nello scontrino (pz, kg, g, l, ml); se ignote: quantity=1, unit="pz".
- Metti TUTTI gli acquistati in addToInventory.
- Se un articolo è tipicamente nella lista della spesa, includilo anche in removeFromList (usa buon senso).
- Nessun testo fuori dal JSON.
`.trim()

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `TESTO SCONTRINO:\n${joined}` },
      ],
    })

    const raw = completion.choices?.[0]?.message?.content ?? ''
    const parsed = safeParseJson(raw)

    if (!parsed || typeof parsed !== 'object') {
      return res.status(502).json({ error: 'Parsing modello fallito', raw: raw.slice?.(0, 600) })
    }

    const removeFromList = Array.isArray(parsed.removeFromList) ? parsed.removeFromList : []
    const addToInventory = Array.isArray(parsed.addToInventory) ? parsed.addToInventory : []

    // --- Applica su Supabase se disponibile e se ci passi userId ---
    const userId = String(fields?.userId || '').trim() || null
    const db = { removed: 0, upserted: 0, skipped: 0 }

    if (supabase && userId) {
      // 1) rimuovi dalla lista_prodotti (match parziale per nome, case-insensitive)
      for (const name of removeFromList) {
        const { error, count } = await supabase
          .from('lista_prodotti')
          .delete({ count: 'exact' })
          .ilike('nome', `%${name}%`)
          .eq('user_id', userId)
        if (error) console.error('[assistant-ocr] delete lista_prodotti error:', error)
        else db.removed += count || 0
      }

      // 2) upsert in stato_scorte
      if (addToInventory.length) {
        const rows = addToInventory.map(r => ({
          user_id: userId,
          nome: r.name,
          quantita: r.quantity ?? 1,
          unita: r.unit ?? 'pz',
          categoria: r.category ?? 'casa',
        }))
        const { error, data } = await supabase
          .from('stato_scorte')
          .upsert(rows, { onConflict: 'user_id,nome', ignoreDuplicates: false })
        if (error) console.error('[assistant-ocr] upsert stato_scorte error:', error)
        else db.upserted = data?.length ?? rows.length
      }
    } else {
      db.skipped = removeFromList.length + addToInventory.length
    }

    return res.status(200).json({
      ok: true,
      text: joined, // utile per debug
      actions: { removeFromList, addToInventory },
      db,
    })
  } catch (err) {
    console.error('[assistant-ocr] error:', err)
    return res.status(500).json({ error: err?.message || 'Errore interno assistant-ocr' })
  }
}
