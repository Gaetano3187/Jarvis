// pages/api/ocr-universal.js
// OCR intelligente: riconosce il tipo di documento e restituisce
// il dato strutturato corretto per ogni sezione dell'app
import multer from 'multer'
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
    fn(req, res, result => result instanceof Error ? reject(result) : resolve(result))
  })
}

export const config = {
  api: { bodyParser: false, externalResolver: true },
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

/* ─── Prompt universale ─────────────────────────────────────────── */
const UNIVERSAL_PROMPT = `Sei Jarvis, un assistente AI per la gestione della casa e delle finanze personali.
Analizza questa immagine e determina PRIMA di tutto che tipo di documento o oggetto è.

TIPI RICONOSCIBILI:
1. "receipt" — scontrino di cassa (supermercato, farmacia, negozio, bar, ristorante, benzinaio, tabaccheria, ecc.)
2. "wine_label" — etichetta di bottiglia di vino
3. "invoice" — fattura o ricevuta formale
4. "product" — etichetta prodotto generico o confezione
5. "unknown" — non riconoscibile

Rispondi SOLO con JSON valido nel formato seguente, scegliendo la struttura in base al tipo:

--- SE "receipt" ---
{
  "doc_type": "receipt",
  "store": "nome negozio",
  "store_type": "supermercato|farmacia|ristorante|bar|benzinaio|tabaccheria|abbigliamento|altro",
  "store_address": "indirizzo o null",
  "purchase_date": "YYYY-MM-DD o null",
  "price_total": 12.50,
  "payment_method": "cash|card|unknown",
  "categoria": "casa|vestiti|cene|varie",
  "confidence": "high|medium|low",
  "items": [
    {
      "name": "nome prodotto",
      "brand": "marca o null",
      "qty": 1,
      "unit": "pz|kg|l|g",
      "packs": 1,
      "units_per_pack": 1,
      "unit_price": 1.50,
      "price": 1.50,
      "category_item": "alimentari|pulizia|igiene|farmaco|altro",
      "expiry_date": "YYYY-MM-DD o null"
    }
  ],
  "raw_text": "testo grezzo dello scontrino"
}

--- SE "wine_label" ---
{
  "doc_type": "wine_label",
  "name": "denominazione vino es. Montepulciano d'Abruzzo",
  "winery": "nome cantina/azienda agricola",
  "locality": "città e provincia es. Vasto (CH)",
  "region": "regione italiana",
  "vintage": 2021,
  "alcohol": 13.5,
  "denomination": "DOC|DOCG|IGT ecc.",
  "grapes": ["vitigno1"],
  "style": "rosso|bianco|rosé|frizzante|fortificato",
  "volume_ml": 750,
  "website": "url o null"
}

--- SE "invoice" ---
{
  "doc_type": "invoice",
  "store": "fornitore",
  "store_address": "indirizzo o null",
  "purchase_date": "YYYY-MM-DD o null",
  "price_total": 0.00,
  "payment_method": "cash|card|transfer|unknown",
  "categoria": "casa|vestiti|cene|varie",
  "description": "descrizione servizio/prodotto",
  "invoice_number": "numero fattura o null",
  "confidence": "high|medium|low"
}

--- SE "unknown" ---
{
  "doc_type": "unknown",
  "raw_text": "tutto il testo leggibile"
}

REGOLE CATEGORIA per receipt e invoice:
- "casa": supermercato, alimentari, pulizia, detersivi, bollette, ferramenta, arredo, elettrodomestici
- "vestiti": abbigliamento, scarpe, accessori moda
- "cene": ristorante, bar, pizzeria, aperitivo, colazione, gelato, pasticceria, delivery
- "varie": farmacia, parrucchiere, tabaccheria, benzinaio, regali, elettronica, sport, cinema, taxi, parcheggio, veterinario, altro

Estrai TUTTI i prodotti visibili nello scontrino. Sii preciso sui prezzi.
Rispondi SOLO JSON valido, nessun testo extra.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })
  if (!openai) return res.status(500).json({ error: 'OpenAI non configurato' })

  const tmpFiles = []

  try {
    await runMiddleware(req, res, upload.single('image'))
    if (!req.file) return res.status(400).json({ error: 'Nessuna immagine ricevuta' })
    if (req.file.size < 100) return res.status(400).json({ error: 'Immagine troppo piccola' })

    const base64 = req.file.buffer.toString('base64')
    const mime   = req.file.mimetype || 'image/jpeg'

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' },
          },
          { type: 'text', text: UNIVERSAL_PROMPT },
        ],
      }],
    })

    const raw  = response.choices?.[0]?.message?.content || '{}'
    let parsed

    try {
      parsed = JSON.parse(raw)
    } catch {
      return res.status(422).json({ error: 'Risposta GPT non valida', raw })
    }

    const docType = parsed.doc_type || 'unknown'

    // Normalizza categoria per receipt/invoice
    if (docType === 'receipt' || docType === 'invoice') {
      parsed.ok = true
      parsed.categoria = normalizeCategory(parsed.categoria || parsed.store_type || '')
      // Fix purchase_date se mancante
      if (!parsed.purchase_date) parsed.purchase_date = new Date().toISOString().slice(0, 10)
      // Assicura items array
      if (!Array.isArray(parsed.items)) parsed.items = []
    }

    if (docType === 'wine_label') {
      parsed.ok = true
      if (!parsed.style || !['rosso','bianco','rosé','frizzante','fortificato'].includes(parsed.style))
        parsed.style = 'rosso'
    }

    if (docType === 'unknown') {
      parsed.ok = false
      parsed.error = 'Documento non riconosciuto'
    }

    return res.status(200).json(parsed)

  } catch (err) {
    console.error('[ocr-universal]', err?.message || err)
    return res.status(500).json({ error: 'Errore OCR: ' + (err?.message || 'errore sconosciuto') })
  } finally {
    for (const p of tmpFiles) try { await unlink(p) } catch {}
  }
}

function normalizeCategory(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(supermercat|spesa|alimentar|cibo|pulizia|detersiv|bolletta|luce|gas|internet|affitto|manutenzione|arredo|ferramenta|elettrodomest)\b/.test(s)) return 'casa'
  if (/\b(vestit|abbigliam|scarpe|moda|borsa|gioiell)\b/.test(s)) return 'vestiti'
  if (/\b(ristorante|pizzeria|bar|caffe|colazione|cena|pranzo|aperitiv|gelato|pasticceria|delivery|pub|enoteca)\b/.test(s)) return 'cene'
  return 'varie'
}