// pages/api/ocr-smart.js
// Flusso unico: immagine/PDF → GPT-4o Vision → JSON strutturato completo
// Sostituisce la catena ocr.js → assistant.js per gli scontrini

import OpenAI from 'openai'
import formidable from 'formidable'
import fs from 'fs/promises'

export const config = { api: { bodyParser: false } }

const SYSTEM_PROMPT = `Sei un motore di analisi scontrini italiano di precisione assoluta.
Il tuo unico output è JSON valido. Zero testo aggiuntivo, zero markdown, zero commenti.`

const USER_PROMPT = `Sei un parser di scontrini italiani. Restituisci SOLO JSON valido, zero testo aggiuntivo.

━━━ SCHEMA OUTPUT ━━━
{
  "categoria": "casa|cene|vestiti|varie",
  "store": "string",
  "store_address": "string|null",
  "purchase_date": "YYYY-MM-DD",
  "price_total": 0.00,
  "payment_method": "cash|card|unknown",
  "items": [{
    "name": "string",
    "brand": "string|null",
    "packs": 1,
    "units_per_pack": 1,
    "unit_per_pack_label": "pz|uova|bottiglie|lattine|kg",
    "qty": 1.0,
    "unit": "pz|kg|l|g|ml",
    "unit_price": 0.00,
    "price": 0.00,
    "category_item": "alimentari|pulizia|igiene|farmaco|altro",
    "expiry_date": "YYYY-MM-DD|null",
    "image_search_query": "string"
  }],
  "raw_text": "string",
  "confidence": "high|medium|low"
}

━━━ REGOLA FONDAMENTALE: COME LEGGERE LE QUANTITÀ ━━━

Gli scontrini italiani stampano la quantità su una riga SEPARATA prima del nome prodotto.
Devi SEMPRE abbinare la riga quantità al prodotto che la segue immediatamente.

FORMATO RIGA QUANTITÀ:
  "N x  P,PP"          → N confezioni a P,PP ciascuna
  "N.NNNx"             → N.NNN kg (prodotto al banco pesato)
  "P,PP / N.NNNx"      → prezzo/kg P,PP × N.NNN kg al banco

COME LEGGERE packs, units_per_pack, qty:
  - packs          = il numero N nella riga "N x P,PP" (confezioni fisiche acquistate)
  - units_per_pack = il numero dopo "X" nel NOME del prodotto (es. "X6", "X2", "6X150ML")
  - qty            = packs × units_per_pack (totale pezzi/unità)
  - unit_price     = P,PP dalla riga quantità
  - price          = prezzo totale riga (colonna destra dello scontrino)

━━━ ESEMPIO COMPLETO (scontrino Orsini reale → output atteso) ━━━

TESTO SCONTRINO:
  2 x    1,95
  UOVA GRANDI X6          10,00%    3,90
  2 x    4,00
  #COCA COLA 6X150ML      22,00%    8,00
  2 x    1,20
  KINDER BUENO X2         10,00%    2,40
  2 x    0,50
  LIEVITAL LIEVITO X2     10,00%    1,00
  2 x    1,00
  #FARINA DE CECCO         4,00%    2,00
  VANILLINA PANEAN        22,00%    0,65
  ZUCCHERO PANEANGEL      22,00%    0,90
  4 x    1,00
  #---ZUCCHERO 1KG ERI    10,00%    4,00
  6 x    1,95
  #LATTE ZYMIL 1 LT        4,00%   11,70
  1.00
  33.370x
  FORMAGGI SALUMI         10,00%   33,37
  2.840x
  PANE PASTICCERIA         4,00%    2,84

OUTPUT JSON ATTESO:
[
  {"name":"Uova grandi","brand":null,"packs":2,"units_per_pack":6,"unit_per_pack_label":"uova","qty":12,"unit":"pz","unit_price":1.95,"price":3.90,"category_item":"alimentari","expiry_date":null,"image_search_query":"uova fresche confezione 6"},
  {"name":"Coca Cola 150ml","brand":"Coca Cola","packs":2,"units_per_pack":6,"unit_per_pack_label":"lattine","qty":12,"unit":"pz","unit_price":4.00,"price":8.00,"category_item":"alimentari","expiry_date":null,"image_search_query":"Coca Cola lattine 150ml multipack"},
  {"name":"Kinder Bueno","brand":"Kinder","packs":2,"units_per_pack":2,"unit_per_pack_label":"pz","qty":4,"unit":"pz","unit_price":1.20,"price":2.40,"category_item":"alimentari","expiry_date":null,"image_search_query":"Kinder Bueno confezione doppia"},
  {"name":"Lievito in polvere","brand":"Lievital","packs":2,"units_per_pack":2,"unit_per_pack_label":"bustine","qty":4,"unit":"pz","unit_price":0.50,"price":1.00,"category_item":"alimentari","expiry_date":null,"image_search_query":"Lievital lievito bustine"},
  {"name":"Farina","brand":"De Cecco","packs":2,"units_per_pack":1,"unit_per_pack_label":"pz","qty":2,"unit":"pz","unit_price":1.00,"price":2.00,"category_item":"alimentari","expiry_date":null,"image_search_query":"Farina De Cecco tipo 00"},
  {"name":"Vanillina","brand":"Paneangeli","packs":1,"units_per_pack":1,"unit_per_pack_label":"bustine","qty":1,"unit":"pz","unit_price":0.65,"price":0.65,"category_item":"alimentari","expiry_date":null,"image_search_query":"Paneangeli vanillina bustine"},
  {"name":"Zucchero semolato","brand":"Paneangeli","packs":1,"units_per_pack":1,"unit_per_pack_label":"pz","qty":1,"unit":"pz","unit_price":0.90,"price":0.90,"category_item":"alimentari","expiry_date":null,"image_search_query":"Paneangeli zucchero semolato"},
  {"name":"Zucchero 1kg","brand":null,"packs":4,"units_per_pack":1,"unit_per_pack_label":"pz","qty":4,"unit":"pz","unit_price":1.00,"price":4.00,"category_item":"alimentari","expiry_date":null,"image_search_query":"zucchero semolato 1kg"},
  {"name":"Latte Zymil 1L","brand":"Zymil","packs":6,"units_per_pack":1,"unit_per_pack_label":"bottiglia","qty":6,"unit":"l","unit_price":1.95,"price":11.70,"category_item":"alimentari","expiry_date":null,"image_search_query":"Latte Zymil senza lattosio 1 litro"},
  {"name":"Formaggi e salumi","brand":null,"packs":1,"units_per_pack":1,"unit_per_pack_label":"kg","qty":33.370,"unit":"kg","unit_price":1.00,"price":33.37,"category_item":"alimentari","expiry_date":null,"image_search_query":"formaggi salumi banco taglio"},
  {"name":"Pane pasticceria","brand":null,"packs":1,"units_per_pack":1,"unit_per_pack_label":"kg","qty":2.840,"unit":"kg","unit_price":1.00,"price":2.84,"category_item":"alimentari","expiry_date":null,"image_search_query":"pane pasticceria sfuso"}
]

━━━ REGOLE AGGIUNTIVE ━━━

PRODOTTI SENZA RIGA QUANTITÀ PRECEDENTE (es. VANILLINA, ZUCCHERO PANEANGEL):
  → packs=1, units_per_pack=1, qty=1

PRODOTTI AL BANCO con "N.NNNx":
  → qty=N.NNN, unit="kg", unit_price=prezzo/kg dalla riga sopra

NOMI: rimuovi "#", "---" iniziali. Normalizza abbreviazioni in italiano leggibile.

CATEGORIE scontrino: "casa"=supermercato/alimentari, "cene"=ristorante/bar, "vestiti"=abbigliamento, "varie"=altro

PAGAMENTO: "cash"=contanti/CONTANTI, "card"=carta/bancomat/POS, "unknown"=non leggibile

━━━ ORA ANALIZZA LO SCONTRINO ALLEGATO ━━━`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY non configurata' })
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const { files } = await new Promise((resolve, reject) => {
      const form = formidable({ multiples: false, keepExtensions: true, maxFileSize: 20 * 1024 * 1024 })
      form.parse(req, (err, fields, files) =>
        err ? reject(err) : resolve({ fields, files })
      )
    })

    const pick = (k) => { const v = files?.[k]; return v ? (Array.isArray(v) ? v[0] : v) : null }
    const file = pick('image') || pick('file') || Object.values(files || {})[0]

    if (!file) return res.status(400).json({ error: 'Nessun file ricevuto' })

    const filepath = file.filepath || file.path
    const mimetype = (file.mimetype || '').toLowerCase()
    const origName = file.originalFilename || ''
    const buf      = await fs.readFile(filepath)

    if (mimetype.includes('pdf') || /\.pdf$/i.test(origName)) {
      const pdfParse = (await import('pdf-parse')).default
      const parsed   = await pdfParse(buf)
      const pdfText  = String(parsed?.text || '').trim()
      if (!pdfText) return res.status(422).json({ error: 'PDF vuoto o non leggibile' })
      const result = await callGptText(client, pdfText)
      return res.status(200).json(result)
    }

    const b64     = buf.toString('base64')
    const dataUrl = `data:${mimetype || 'image/jpeg'};base64,${b64}`
    const result  = await callGptVision(client, dataUrl)
    return res.status(200).json(result)

  } catch (err) {
    console.error('[OCR-SMART] fail', err)
    return res.status(500).json({ error: err?.message || String(err) })
  }
}

async function callGptVision(client, dataUrl) {
  const resp = await client.chat.completions.create({
    model: process.env.OCR_VISION_MODEL || 'gpt-4o',
    temperature: 0,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: USER_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
        ],
      },
    ],
  })
  return parseGptResponse(resp?.choices?.[0]?.message?.content || '{}')
}

async function callGptText(client, text) {
  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${USER_PROMPT}\n\nSCONTRINO (testo estratto da PDF):\n${text}` },
    ],
  })
  return parseGptResponse(resp?.choices?.[0]?.message?.content || '{}')
}

function parseGptResponse(raw) {
  let clean = raw.trim()
  const fence = clean.match(/```json\s*([\s\S]*?)```/i) || clean.match(/```([\s\S]*?)```/)
  if (fence) clean = fence[1].trim()
  if (!/^\s*\{/.test(clean)) {
    const m = clean.match(/\{[\s\S]*\}/)
    clean = m ? m[0] : '{}'
  }

  let parsed
  try { parsed = JSON.parse(clean) }
  catch { return { ok: false, error: 'Risposta GPT non parsabile', raw_text: raw } }

  const today = new Date().toISOString().slice(0, 10)

  const result = {
    ok:             true,
    categoria:      sanitizeCategoria(parsed.categoria),
    store:          String(parsed.store || 'Punto vendita').trim(),
    store_address:  parsed.store_address || null,
    purchase_date:  sanitizeDate(parsed.purchase_date) || today,
    price_total:    sanitizeFloat(parsed.price_total),
    payment_method: sanitizePayment(parsed.payment_method),
    items:          sanitizeItems(parsed.items),
    raw_text:       String(parsed.raw_text || '').slice(0, 2000),
    confidence:     ['high','medium','low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
  }

  if (!result.price_total && result.items.length) {
    result.price_total = parseFloat(
      result.items.reduce((t, i) => t + (i.price || 0), 0).toFixed(2)
    )
  }

  return result
}

function sanitizeCategoria(v) {
  return ['casa','vestiti','cene','varie'].includes(v) ? v : 'varie'
}
function sanitizeDate(v) {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null
}
function sanitizeFloat(v) {
  const n = parseFloat(String(v || '0').replace(',', '.'))
  return isNaN(n) ? 0 : parseFloat(n.toFixed(2))
}
function sanitizePayment(v) {
  const s = String(v || '').toLowerCase()
  if (s.includes('cash') || s.includes('contanti')) return 'cash'
  if (s.includes('card') || s.includes('carta') || s.includes('bancomat') || s.includes('contactless')) return 'card'
  return 'unknown'
}
function sanitizeItems(items) {
  if (!Array.isArray(items)) return []
  return items
    .filter(i => i && typeof i === 'object')
    .map(i => {
      const packs         = sanitizeFloat(i.packs) || 1
      const unitsPerPack  = sanitizeFloat(i.units_per_pack) || 1
      const qty           = sanitizeFloat(i.qty) || (packs * unitsPerPack)
      return {
        name:               String(i.name || 'Prodotto').trim(),
        brand:              i.brand ? String(i.brand).trim() : null,
        packs,
        units_per_pack:     unitsPerPack,
        unit_per_pack_label:String(i.unit_per_pack_label || 'pz').trim(),
        qty,
        unit:               sanitizeUnit(i.unit),
        unit_price:         sanitizeFloat(i.unit_price),
        price:              sanitizeFloat(i.price),
        category_item:      sanitizeCategoryItem(i.category_item),
        expiry_date:        sanitizeDate(i.expiry_date),
        image_search_query: i.image_search_query ? String(i.image_search_query).trim() : null,
      }
    })
    .filter(i => i.name && i.price >= 0)
}
function sanitizeUnit(v) {
  const valid = ['pz','kg','l','g','ml']
  const s = String(v || 'pz').toLowerCase().trim()
  return valid.includes(s) ? s : 'pz'
}
function sanitizeCategoryItem(v) {
  const valid = ['alimentari','pulizia','igiene','farmaco','altro']
  return valid.includes(v) ? v : 'alimentari'
}