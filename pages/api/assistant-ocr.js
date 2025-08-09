// pages/api/assistant-ocr.js
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import formidable from 'formidable'

// Consenti anche JSON: useremo formidable solo per multipart
export const config = {
  api: { bodyParser: false },
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
})

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: false, keepExtensions: true })
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err)
      resolve({ fields, files })
    })
  })
}

async function parseJson(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

function safeJson(text) {
  try { return JSON.parse(text) } catch (_) {}
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    const slice = text.slice(first, last + 1)
    try { return JSON.parse(slice) } catch (_) {}
  }
  return null
}

async function getImageDataUrl({ files, fields, json }) {
  // 1) Se c’è un file multipart (campo 'file' o 'image')
  const fileObj = files?.file || files?.image
  if (fileObj?.filepath) {
    const buf = await readFile(fileObj.filepath)
    const b64 = buf.toString('base64')
    const mime = fileObj.mimetype || 'image/jpeg'
    return `data:${mime};base64,${b64}`
  }

  // 2) Se c’è una URL in multipart fields o nel JSON
  const imageUrl =
    (fields && (fields.imageUrl || fields.url || fields.image)) ||
    (json && (json.imageUrl || json.url || json.image))

  if (imageUrl) {
    // fetch server-side della URL e converto in data URL
    const r = await fetch(imageUrl)
    if (!r.ok) throw new Error(`Impossibile scaricare l'immagine (${r.status})`)
    const mime = r.headers.get('content-type') || 'image/jpeg'
    const arrBuf = await r.arrayBuffer()
    const b64 = Buffer.from(arrBuf).toString('base64')
    return `data:${mime};base64,${b64}`
  }

  // 3) Se nel JSON arriva già un dataURL/base64
  const dataUrl =
    (json && (json.dataUrl || json.imageDataUrl || json.base64)) ||
    (fields && (fields.dataUrl || fields.imageDataUrl || fields.base64))
  if (dataUrl && String(dataUrl).startsWith('data:')) return String(dataUrl)

  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito (usa POST)` })
  }

  try {
    const isJson = (req.headers['content-type'] || '').includes('application/json')

    let fields = {}, files = {}, json = {}
    if (isJson) {
      json = await parseJson(req)
    } else {
      ({ fields, files } = await parseMultipart(req))
    }

    const userId = String(fields.userId || json.userId || '').trim() || null
    const dataUrl = await getImageDataUrl({ files, fields, json })
    if (!dataUrl) {
      return res.status(400).json({ error: 'File/URL immagine mancante' })
    }

    const systemPrompt = `
Sei Jarvis, assistente per la spesa. Hai un'immagine di uno scontrino.
Estrai le voci acquistate e restituisci SOLO JSON con questo schema:

{
  "removeFromList": [ "nomeProdotto1", "nomeProdotto2" ],
  "addToInventory": [
    { "name": "nomeProdotto", "quantity": 1, "unit": "pz", "category": "casa" }
  ]
}

Regole:
- Normalizza i nomi (minuscolo).
- quantity/unit quando possibile ("pz","kg","g","l","ml").
- Metti TUTTI gli acquistati in addToInventory; se plausibili in lista, includili anche in removeFromList.
- Niente testo fuori dal JSON.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt.trim() },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Estrai prodotti e genera le due liste richieste.' },
            { type: 'image_url', image_url: dataUrl },
          ],
        },
      ],
    })

    const text = completion.choices?.[0]?.message?.content ?? ''
    const parsed = safeJson(text)
    if (!parsed || typeof parsed !== 'object') {
      return res.status(502).json({ error: 'OCR parsing fallito', raw: text?.slice?.(0, 500) })
    }

    const removeFromList = Array.isArray(parsed.removeFromList) ? parsed.removeFromList : []
    const addToInventory = Array.isArray(parsed.addToInventory) ? parsed.addToInventory : []

    let db = { removed: 0, upserted: 0, skipped: 0 }
    if (supabase && userId) {
      // elimina dalla lista_prodotti
      for (const name of removeFromList) {
        const { error, count } = await supabase
          .from('lista_prodotti')
          .delete({ count: 'exact' })
          .ilike('nome', `%${name}%`)
          .eq('user_id', userId)
        if (!error) db.removed += count || 0
      }

      // upsert in stato_scorte
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
        if (!error) db.upserted = data?.length ?? rows.length
      }
    } else {
      db.skipped = removeFromList.length + addToInventory.length
    }

    return res.status(200).json({ ok: true, actions: { removeFromList, addToInventory }, db })
  } catch (err) {
    console.error('[assistant-ocr] error', err)
    return res.status(500).json({ error: err?.message || 'Errore interno' })
  }
}
