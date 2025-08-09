// pages/api/assistant-ocr.js
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import formidable from 'formidable'

export const config = {
  api: { bodyParser: false }, // necessario per leggere multipart/form-data
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
})

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: false, keepExtensions: true })
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err)
      resolve({ fields, files })
    })
  })
}

function safeJson(text) {
  // prova a estrarre il primo blocco JSON valido
  try { return JSON.parse(text) } catch (_) {}
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    const slice = text.slice(first, last + 1)
    try { return JSON.parse(slice) } catch (_) {}
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito (usa POST)` })
  }

  try {
    const { fields, files } = await parseForm(req)
    const userId = (fields.userId && String(fields.userId)) || null

    // il file può essere nel campo 'file' o 'image'
    const fileObj = files.file || files.image
    if (!fileObj) {
      return res.status(400).json({ error: 'File immagine mancante' })
    }

    const buf = await readFile(fileObj.filepath)
    const b64 = buf.toString('base64')
    const dataUrl = `data:${fileObj.mimetype || 'image/jpeg'};base64,${b64}`

    // Prompt: estrai prodotti dallo scontrino e proponi due liste:
    // 1) quelli da rimuovere dalla lista prodotti (perché acquistati)
    // 2) quelli da aggiungere a stato scorte se non erano in lista
    const systemPrompt = `
Sei Jarvis, assistente per la spesa. Hai un'immagine di uno scontrino.
Estrai le voci acquistate e restituisci SOLO JSON con questo schema:

{
  "removeFromList": [ "nomeProdotto1", "nomeProdotto2", ... ],
  "addToInventory": [
    { "name": "nomeProdotto", "quantity": 1, "unit": "pz", "category": "casa" }
  ]
}

Regole:
- Normalizza i nomi (minuscolo, niente caratteri speciali inutili).
- Se la quantità si evince (es. "x3", "3kg", "2 pz"), valorizza quantity e unit ("pz","kg","g","l","ml").
- Metti in addToInventory tutti gli articoli acquistati; quelli che sicuramente sono già nella lista della spesa mettili anche in removeFromList (niente duplicati).
- NON aggiungere testo fuori dal JSON.
`

    const userPrompt = `Estrai i prodotti acquistati da questo scontrino e genera le due liste richieste.`

    // Chiamata multi-modale (testo + immagine)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt.trim() },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: dataUrl },
          ],
        },
      ],
    })

    const text = completion.choices?.[0]?.message?.content ?? ''
    const parsed = safeJson(text)

    if (!parsed || typeof parsed !== 'object') {
      return res.status(502).json({
        error: 'OCR parsing fallito',
        raw: text?.slice?.(0, 500),
      })
    }

    // Struttura attesa
    const removeFromList = Array.isArray(parsed.removeFromList) ? parsed.removeFromList : []
    const addToInventory = Array.isArray(parsed.addToInventory) ? parsed.addToInventory : []

    // Operazioni DB opzionali (solo se Supabase e userId presenti)
    let db = { removed: 0, upserted: 0, skipped: 0 }
    if (supabase && userId) {
      // 1) Rimuovi voci dalla tabella lista_prodotti che corrispondono ai nomi
      //    (fuzzy: usa ilike %nome%)
      if (removeFromList.length) {
        for (const name of removeFromList) {
          const { error, count } = await supabase
            .from('lista_prodotti')
            .delete({ count: 'exact' })
            .ilike('nome', `%${name}%`)
            .eq('user_id', userId)

          if (!error) db.removed += (count || 0)
        }
      }

      // 2) Aggiungi/aggiorna in stato_scorte
      if (addToInventory.length) {
        // normalizza record per upsert
        const rows = addToInventory.map((r) => ({
          user_id: userId,
          nome: r.name,
          quantita: r.quantity ?? 1,
          unita: r.unit ?? 'pz',
          categoria: r.category ?? 'casa',
          // opzionale: updated_at lato db
        }))

        const { error, data } = await supabase
          .from('stato_scorte')
          .upsert(rows, { onConflict: 'user_id,nome', ignoreDuplicates: false })

        if (!error) db.upserted = data?.length ?? rows.length
      }
    } else {
      // se manca supabase/userId segnala che il JSON è pronto ma non è stato applicato al DB
      db.skipped = removeFromList.length + addToInventory.length
    }

    return res.status(200).json({
      ok: true,
      actions: {
        removeFromList,
        addToInventory,
      },
      db,
    })
  } catch (err) {
    console.error('[assistant-ocr] error', err)
    return res.status(500).json({ error: err?.message || 'Errore interno' })
  }
}
