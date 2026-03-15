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
      "packs": 1,
      "units_per_pack": 1,
      "unit_per_pack_label": "pz",
      "qty": 1,
      "unit": "pz",
      "unit_price": 0.00,
      "price": 0.00,
      "category_item": "alimentari",
      "expiry_date": null,
      "image_search_query": "nome prodotto marca per ricerca immagine"
    }
  ],
  "raw_text": "trascrizione fedele dell'intero scontrino",
  "confidence": "high"
}

REGOLE CRITICHE:

1. FORMATO QUANTITÀ — molti scontrini italiani stampano la quantità su una riga separata PRIMA del nome:
   Esempio:
     "2 x    1,95"        ← riga quantità: 2 pezzi a 1,95 l'uno
     "UOVA GRANDI X6      3,90"  ← nome prodotto + prezzo totale
   In questo caso: qty=2, unit_price=1.95, price=3.90, name="Uova grandi confezione da 6"
   
   Altri formati comuni:
     "6 x    1,95"        +  "#LATTE ZYMIL 1 LT   11,70" → qty=6, unit_price=1.95, price=11.70
     "4 x    1,00"        +  "#---ZUCCHERO 1KG    4,00"  → qty=4, unit_price=1.00, price=4.00
     "2.840x"             +  "PANE PASTICCERIA    2,84"  → qty=2.840 kg, unit="kg", price=2.84
     "1.00 / 33.370x"     +  "FORMAGGI SALUMI     33,37" → qty=33.370 kg al banco, unit="kg"
   
   REGOLA: se vedi una riga con formato "N x prezzo" o "N.NNNx" PRIMA di un nome prodotto,
   quella riga definisce qty e unit_price del prodotto che segue. NON creare una voce separata per quella riga.
   
   CAMPI QUANTITÀ — distinzione fondamentale:
   - packs = numero di CONFEZIONI acquistate (la "N x" prima del nome)
   - units_per_pack = unità dentro ogni confezione (il numero dopo "X" nel nome, es. "X6", "X2")
   - unit_per_pack_label = etichetta delle unità dentro la confezione ("uova", "bottiglie", "pz", ecc.)
   - qty = packs × units_per_pack (totale unità fisiche)
   - unit = unità di misura base ("pz", "kg", "l", "g", "ml")
   
   Esempi concreti dallo scontrino Orsini:
   "2 x 1,95 / UOVA GRANDI X6 / 3,90"
     → packs=2, units_per_pack=6, unit_per_pack_label="uova", qty=12, unit="pz", unit_price=1.95, price=3.90
   
   "2 x 4,00 / #COCA COLA 6X150ML / 8,00"  
     → packs=2, units_per_pack=6, unit_per_pack_label="lattine", qty=12, unit="pz", unit_price=4.00, price=8.00
   
   "2 x 1,20 / KINDER BUENO X2 / 2,40"
     → packs=2, units_per_pack=2, unit_per_pack_label="pz", qty=4, unit="pz", unit_price=1.20, price=2.40
   
   "6 x 1,95 / #LATTE ZYMIL 1LT / 11,70"
     → packs=6, units_per_pack=1, unit_per_pack_label="bottiglia", qty=6, unit="l", unit_price=1.95, price=11.70
   
   "1.00 / 33.370x / FORMAGGI SALUMI / 33,37"
     → packs=1, units_per_pack=1, unit_per_pack_label="kg", qty=33.370, unit="kg", unit_price=1.00, price=33.37
   
   "2.840x / PANE PASTICCERIA / 2,84"
     → packs=1, units_per_pack=1, unit_per_pack_label="kg", qty=2.840, unit="kg", unit_price=~1.00, price=2.84
   
   Se non c'è una riga "N x" prima del nome: packs=1, units_per_pack=1.

2. PRODOTTI AL BANCO (peso variabile):
   - Se qty ha 3 decimali (es. 2.840, 33.370, 0.450) → unit="kg"
   - Il prezzo al kg è sulla riga "N x prezzo" sopra il nome
   - Esempio: "1.00 / 33.370x" con "FORMAGGI SALUMI 33,37" → qty=33.370, unit="kg", unit_price=1.00, price=33.37

3. SIMBOLI DA IGNORARE nel nome prodotto:
   - "#" iniziale → promozionale, rimuovilo dal nome
   - "---" → separatore, rimuovilo
   - Esempio: "#LATTE ZYMIL 1 LT" → "Latte Zymil 1L"
   - Esempio: "#---ZUCCHERO 1KG ERI" → "Zucchero 1kg"

4. NOMI PRODOTTI: normalizza le abbreviazioni in nomi commerciali reali italiani.
   - "LTTE INT BIO 1L" → "Latte intero biologico 1L"
   - "PRSC CRUDO 100G" → "Prosciutto crudo 100g"
   - "DET LAVATRICE" → "Detersivo lavatrice"
   - "ACQ MINERALE" → "Acqua minerale"
   - "BISCOT INTEG" → "Biscotti integrali"
   - "LIEVITAL LIEVITO X2" → "Lievito in polvere (confezione da 2)"
   - "VANILLINA PANEAN" → "Vanillina Paneangeli"
   - "FARINA DE CECCO" → "Farina De Cecco"
   - "KINDER BUENO X2" → "Kinder Bueno (confezione da 2)"
   Usa il contesto (marca, reparto, prezzo) per inferire il nome corretto.

5. CATEGORIA principale dello scontrino:
   - "casa" → supermercato, alimentari, pulizie, farmacia, ferramenta
   - "cene" → ristorante, bar, pizzeria, aperitivo, fast food
   - "vestiti" → abbigliamento, scarpe, accessori
   - "varie" → tabacchi, benzina, parcheggio, altro

6. CATEGORIA ITEM per ogni prodotto:
   - "alimentari" → cibo, bevande
   - "pulizia" → detergenti, carta, pulizia casa
   - "igiene" → saponi, shampoo, cura persona
   - "farmaco" → medicine, integratori
   - "altro" → tutto il resto

7. DATE:
   - purchase_date: leggi la data dallo scontrino, formato YYYY-MM-DD
   - expiry_date: solo se stampata esplicitamente sul prodotto (yogurt, latte fresco, ecc.)
     formato YYYY-MM-DD oppure null

8. PREZZI: usa sempre il punto decimale (es. 12.50, non 12,50).
   unit_price = prezzo per unità, price = prezzo riga totale (qty × unit_price).
   Se c'è sconto, usa il prezzo SCONTATO come price.

9. QUANTITÀ E UNITÀ:
   - unit: "pz" pezzi, "kg" chilogrammi, "l" litri, "g" grammi, "ml" millilitri
   - qty: numero float (es. 0.350 per 350g di affettato al banco)
   - Se la quantità non è specificata, usa qty=1

10. METODO PAGAMENTO:
    - "cash" se vedi "contante/i", "pagamento contante", "CONTANTI"
    - "card" se vedi "carta", "bancomat", "contactless", "POS"
    - "unknown" se non leggibile

11. confidence:
    - "high" → scontrino nitido, tutti i dati leggibili
    - "medium" → qualche campo incerto ma struttura chiara
    - "low" → immagine sfocata o scontrino parziale

12. Se lo scontrino è di un ristorante/bar, items può essere vuoto [] o con le portate principali.

13. Non inventare dati. Se un campo non è leggibile, usa null.

14. IMAGE SEARCH QUERY: per ogni prodotto genera una query di ricerca immagine in italiano
    chiara e specifica per trovare la foto della confezione reale:
    - "Latte Zymil intero 1L" → "Latte Zymil senza lattosio 1 litro"
    - "Coca Cola 6x150ml" → "Coca Cola lattine 150ml multipack"
    - "Kinder Bueno conf. 2" → "Kinder Bueno cioccolato confezione"
    - "Uova grandi conf. da 6" → "uova fresche confezione 6 pezzi"
    - "Farina De Cecco" → "Farina De Cecco tipo 00"
    Usa marca + nome prodotto + formato quando utile. Massimo 6 parole.`

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