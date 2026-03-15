// pages/api/ocr-smart.js
// Flusso unico: immagine/PDF → GPT-4o Vision → JSON strutturato completo
// Sostituisce la catena ocr.js → assistant.js per gli scontrini

import OpenAI from 'openai'
import formidable from 'formidable'
import fs from 'fs/promises'

export const config = { api: { bodyParser: false } }

const SYSTEM_PROMPT = `Sei un motore di analisi scontrini italiano di precisione assoluta.
Il tuo unico output è JSON valido. Zero testo aggiuntivo, zero markdown, zero commenti.`

const USER_PROMPT = `Analizza questo scontrino italiano con la massima precisione.

Restituisci ESCLUSIVAMENTE questo JSON (nessun testo prima o dopo):

{
  "categoria": "casa",
  "store": "Nome insegna del negozio",
  "store_address": "indirizzo se leggibile oppure null",
  "purchase_date": "YYYY-MM-DD",
  "price_total": 0.00,
  "payment_method": "cash|card|unknown",
  "items": [
    {
      "name": "Nome prodotto commerciale normalizzato e leggibile",
      "brand": "marca se leggibile oppure null",
      "qty": 1,
      "unit": "pz",
      "unit_price": 0.00,
      "price": 0.00,
      "category_item": "alimentari",
      "expiry_date": null
    }
  ],
  "raw_text": "trascrizione fedele dell'intero scontrino",
  "confidence": "high"
}

REGOLE CRITICHE:

1. NOMI PRODOTTI: normalizza le abbreviazioni in nomi commerciali reali italiani.
   - "LTTE INT BIO 1L" → "Latte intero biologico 1L"
   - "PRSC CRUDO 100G" → "Prosciutto crudo 100g"
   - "DET LAVATRICE" → "Detersivo lavatrice"
   - "ACQ MINERALE" → "Acqua minerale"
   - "BISCOT INTEG" → "Biscotti integrali"
   - "BNNA" → "Banane"
   - "MOZZ BUFF" → "Mozzarella di bufala"
   Usa il contesto (marca, reparto, prezzo) per inferire il nome corretto.

2. CATEGORIA principale dello scontrino:
   - "casa" → supermercato, alimentari, pulizie, farmacia, ferramenta
   - "cene" → ristorante, bar, pizzeria, aperitivo, fast food
   - "vestiti" → abbigliamento, scarpe, accessori
   - "varie" → tabacchi, benzina, parcheggio, altro

3. CATEGORIA ITEM per ogni prodotto:
   - "alimentari" → cibo, bevande
   - "pulizia" → detergenti, carta, pulizia casa
   - "igiene" → saponi, shampoo, cura persona
   - "farmaco" → medicine, integratori
   - "altro" → tutto il resto

4. DATE:
   - purchase_date: leggi la data dallo scontrino, formato YYYY-MM-DD
   - expiry_date: solo se stampata esplicitamente sul prodotto (yogurt, latte fresco, ecc.)
     formato YYYY-MM-DD oppure null

5. PREZZI: usa sempre il punto decimale (es. 12.50, non 12,50).
   unit_price = prezzo per unità, price = prezzo riga totale (qty × unit_price).
   Se c'è sconto, usa il prezzo SCONTATO come price.

6. QUANTITÀ E UNITÀ:
   - unit: "pz" pezzi, "kg" chilogrammi, "l" litri, "g" grammi, "ml" millilitri
   - qty: numero float (es. 0.350 per 350g di affettato al banco)

7. METODO PAGAMENTO:
   - "cash" se contanti, "card" se carta/bancomat/contactless, "unknown" se non leggibile

8. confidence:
   - "high" → scontrino nitido, tutti i dati leggibili
   - "medium" → qualche campo incerto ma struttura chiara
   - "low" → immagine sfocata o scontrino parziale

9. Se lo scontrino è di un ristorante/bar, items può essere vuoto [] o con le portate principali.

10. Non inventare dati. Se un campo non è leggibile, usa null.`

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
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
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
    .map(i => ({
      name:          String(i.name || 'Prodotto').trim(),
      brand:         i.brand ? String(i.brand).trim() : null,
      qty:           sanitizeFloat(i.qty) || 1,
      unit:          sanitizeUnit(i.unit),
      unit_price:    sanitizeFloat(i.unit_price),
      price:         sanitizeFloat(i.price),
      category_item: sanitizeCategoryItem(i.category_item),
      expiry_date:   sanitizeDate(i.expiry_date),
    }))
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