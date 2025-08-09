// pages/api/assistant-ocr.js
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: true } }

// ====== CONFIGURA QUI SE SERVE ======
const MAP = {
  // Tabella e colonne per la "lista prodotti" (da cui cancelliamo)
  lista: { table: 'lista_prodotti', nameCol: 'nome', userCol: 'user_id', idCol: 'id' },
  // Tabella e colonne per "stato scorte" (dove inseriamo)
  scorte: { table: 'scorte', nameCol: 'nome', qtyCol: 'quantita', userCol: 'user_id', dateCol: 'data' },
}
// ====================================

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })

// Supabase server-side (usare SERVICE_ROLE in produzione)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
)

function pick(a, b) { return a ?? b }
function normalizeName(s='') {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function firstToken(s='') {
  const n = normalizeName(s)
  return n.split(' ')[0] || n
}

export default async function handler(req, res) {
  // CORS & preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` })
  }

  try {
    const q = req.query ?? {}
    const b = (req.body && typeof req.body === 'object') ? req.body : {}

    const imageUrl = pick(b.imageUrl, q.imageUrl)
    const userId   = pick(b.userId, q.userId)
    const hints    = pick(b.hints, q.hints) || ''

    if (!imageUrl) return res.status(400).json({ error: 'imageUrl mancante' })
    if (!userId)   return res.status(400).json({ error: 'userId mancante' })

    const today = new Date().toISOString().slice(0, 10)

    // ---- OCR (estrai voci di spesa come JSON) ----
    const systemPrompt =
      'Sei Jarvis, l’assistente per la finanza domestica. ' +
      'Leggi lo scontrino nell’immagine e restituisci SOLO JSON valido con questo schema: ' +
      '{ "type":"expense", "items":[ { "puntoVendita":"...", "dettaglio":"...", "prezzoTotale":0.00, "quantita":1, "data":"YYYY-MM-DD", "categoria":"casa", "category_id":"4cfaac74-aab4-4d96-b335-6cc64de59afc" } ] }. ' +
      `Usa "${today}" se la data non è presente. ` +
      'prezzoTotale è un numero con punto decimale. Se quantità mancante usa 1. ' +
      (hints ? `Suggerimenti: ${hints}` : '')

    const ai = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Estrai le voci di spesa in JSON.' },
            { type: 'input_image', image_url: imageUrl },
          ],
        },
      ],
      temperature: 0,
    })

    const raw = ai?.output_text ?? ai?.content?.[0]?.text ?? ''
    let payload
    try { payload = JSON.parse(raw) } catch {
      const m = String(raw).match(/\{[\s\S]*\}$/); if (m) payload = JSON.parse(m[0])
    }
    if (!payload || !Array.isArray(payload.items)) {
      return res.status(502).json({ error: 'OCR non parsabile', raw: String(raw).slice(0, 1500) })
    }

    // ---- CARICO lista prodotti dell’utente ----
    const { table: T_LISTA, nameCol: C_NAME_L, userCol: C_USER_L, idCol: C_ID_L } = MAP.lista
    const listResp = await supabase
      .from(T_LISTA)
      .select(`${C_ID_L}, ${C_NAME_L}`)
      .eq(C_USER_L, userId)

    if (listResp.error) throw listResp.error
    const lista = listResp.data ?? []

    // Indici rapidi per match
    const byNormName = new Map()
    for (const r of lista) {
      const k = normalizeName(r[C_NAME_L])
      if (!byNormName.has(k)) byNormName.set(k, [])
      byNormName.get(k).push(r)
    }

    // ---- MATCH articoli OCR con lista ----
    const toDeleteIds = new Set()
    const toScorte = [] // voci non presenti in lista -> scorte

    for (const it of payload.items) {
      const det = it?.dettaglio || ''
      const qty = Number(it?.quantita ?? 1) || 1
      const norm = normalizeName(det)
      const tok  = firstToken(det)

      // tentativi di match: nome intero, token iniziale, startsWith
      let matchedRows = byNormName.get(norm) || []
      if (!matchedRows.length) {
        // fallback: cerca nel vettore lista con startsWith/contains (grezzo ma efficace)
        matchedRows = lista.filter(r => {
          const n = normalizeName(r[C_NAME_L])
          return n === tok || n.startsWith(tok + ' ') || n.includes(' ' + tok + ' ')
        })
      }

      if (matchedRows.length) {
        matchedRows.forEach(r => toDeleteIds.add(r[C_ID_L]))
      } else {
        toScorte.push({
          nome: det,
          quantita: qty,
          data: it?.data || today,
        })
      }
    }

    // ---- CANCELLA dalla lista prodotti ----
    let removed = 0
    if (toDeleteIds.size) {
      const ids = Array.from(toDeleteIds)
      const del = await supabase.from(T_LISTA).delete().in(MAP.lista.idCol, ids).eq(MAP.lista.userCol, userId)
      if (del.error) throw del.error
      removed = del.count ?? ids.length
    }

    // ---- INSERISCI in stato scorte le voci non in lista ----
    const { table: T_SCORTE, nameCol: C_NAME_S, qtyCol: C_QTY_S, userCol: C_USER_S, dateCol: C_DATE_S } = MAP.scorte
    let inserted = 0
    if (toScorte.length) {
      // Mappa alle colonne reali
      const rows = toScorte.map(r => ({
        [C_NAME_S]: r.nome,
        [C_QTY_S]: r.quantita,
        [C_DATE_S]: r.data,
        [C_USER_S]: userId,
      }))
      const ins = await supabase.from(T_SCORTE).insert(rows)
      if (ins.error) throw ins.error
      inserted = rows.length
    }

    // Ritorno anche i dati OCR per eventuale log
    return res.status(200).json({
      ok: true,
      ocr: payload,
      actions: {
        removed_from_lista_prodotti: removed,
        added_to_scorte: inserted,
      },
      details: {
        deleted_ids: Array.from(toDeleteIds),
        scorte_preview: toScorte,
      },
    })
  } catch (err) {
    console.error('[assistant-ocr] error', err)
    return res.status(500).json({ error: err?.message || 'Errore interno' })
  }
}
