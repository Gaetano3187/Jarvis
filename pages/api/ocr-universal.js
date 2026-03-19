// pages/api/ocr-universal.js
// ═══════════════════════════════════════════════════════════════════════
// API UNICA OCR INTELLIGENTE
// Riconosce automaticamente: scontrino | etichetta vino | fattura | altro
// Per scontrini determina categoria dal tipo di negozio:
//   supermercato/alimentari → "casa"
//   bar/ristorante/pizzeria → "cene"
//   boutique/scarpe         → "vestiti"
//   tutto il resto          → "varie"
// ═══════════════════════════════════════════════════════════════════════

import multer from 'multer'
import OpenAI from 'openai'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, r => r instanceof Error ? reject(r) : resolve(r))
  })
}

export const config = { api: { bodyParser: false, externalResolver: true } }

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

/* ─── Prompt master ──────────────────────────────────────────────────── */
const MASTER_PROMPT = `Sei Jarvis, assistente AI italiano per finanze e gestione casa.
Analizza questa immagine in due passi:

PASSO 1 — trascrivi FEDELMENTE tutto il testo visibile riga per riga,
  incluse righe come "2 x 1,95" o "33.370x" (quantità negli scontrini supermercato).

PASSO 2 — analizza il documento trascritto e restituisci JSON strutturato.

━━━ IDENTIFICA IL TIPO ━━━
- "receipt"    → scontrino di cassa
- "wine_label" → etichetta bottiglia vino
- "invoice"    → fattura/ricevuta fiscale
- "unknown"    → non identificabile

━━━ SE receipt ━━━
Determina la categoria dal nome/tipo del negozio:

"casa" → supermercati e GDO (Coop, Esselunga, Conad, Carrefour, Lidl, Aldi, Eurospin,
  Penny, Pam, Interspar, Spar, Sigma, NaturaSì, Bennet, Unes, Famila, Tigros, Despar,
  Iper, Prix, Dok, Il Gigante, Simply, Orsini, qualsiasi minimarket/alimentari),
  norcinerie, macellerie, pescherie, panetterie, fruttivendoli,
  negozi pulizia/ferramenta/arredo/elettrodomestici,
  delivery alimentare (Deliveroo, Glovo, Just Eat, Uber Eats), bollette

"cene" → ristoranti, trattorie, osterie, pizzerie, bracerie, sushi bar,
  bar, caffetterie, pub, birrerie, enoteche, cocktail bar,
  gelaterie, pasticcerie (consumo sul posto), qualsiasi locale food&drink

"vestiti" → abbigliamento, scarpe, boutique, accessori moda, gioiellerie

"varie" → farmacia, parrucchiere, tabaccheria, benzinaio/carburante,
  elettronica, sport, libreria, cinema, taxi/parcheggio, banca,
  veterinario, e tutto il resto non classificabile sopra

Formato JSON per receipt:
{
  "doc_type": "receipt",
  "store": "nome negozio",
  "store_type": "supermercato|ristorante|bar|pizzeria|abbigliamento|farmacia|tabaccheria|benzina|altro",
  "store_address": "indirizzo o null",
  "purchase_date": "YYYY-MM-DD",
  "price_total": 12.50,
  "payment_method": "cash|card|unknown",
  "categoria": "casa|cene|vestiti|varie",
  "confidence": "high|medium|low",
  "items": [
    {
      "name": "nome prodotto",
      "brand": "marca o null",
      "packs": 1,
      "units_per_pack": 1,
      "unit_per_pack_label": "pz|uova|bottiglie|lattine|kg",
      "qty": 1.0,
      "unit": "pz|kg|l|g|ml",
      "unit_price": 1.50,
      "price": 1.50,
      "category_item": "alimentari|pulizia|igiene|farmaco|altro",
      "expiry_date": "YYYY-MM-DD o null"
    }
  ],
  "raw_text": "testo trascritto"
}

Regole quantità scontrini supermercato:
- Riga "N x P,PP" prima del prodotto → packs=N, unit_price=P,PP
- "X6" o "6X" nel nome → units_per_pack=6
- qty = packs × units_per_pack
- Prodotti al banco "33.370x" → qty=33.370, unit="kg"
- Per scontrini categoria "cene": items=[] (lista vuota, non serve inventario)

Scadenze automatiche prodotti freschi:
- Affettati/salumi freschi aperti, formaggi freschi (mozzarella, ricotta, stracchino) → oggi+2gg
- Formaggi stagionati (parmigiano, pecorino, grana, caciocavallo, provolone) → null
- Carne/pesce fresco → oggi+1gg | Pane fresco → oggi+2gg | Confezionato → null

━━━ SE wine_label ━━━
{
  "doc_type": "wine_label",
  "name": "denominazione es. Montepulciano d'Abruzzo",
  "winery": "nome cantina completo",
  "locality": "città e provincia es. Vasto (CH)",
  "region": "regione italiana",
  "vintage": 2021,
  "alcohol": 13.5,
  "denomination": "DOC|DOCG|IGT ecc.",
  "grapes": ["vitigno"],
  "style": "rosso|bianco|rosé|frizzante|fortificato",
  "volume_ml": 750,
  "website": "url o null"
}

━━━ SE invoice ━━━
{
  "doc_type": "invoice",
  "store": "fornitore",
  "store_address": "indirizzo o null",
  "purchase_date": "YYYY-MM-DD",
  "price_total": 0.00,
  "payment_method": "cash|card|transfer|unknown",
  "categoria": "casa|vestiti|cene|varie",
  "description": "descrizione servizio",
  "invoice_number": "numero o null",
  "confidence": "high|medium|low"
}

━━━ SE unknown ━━━
{ "doc_type": "unknown", "raw_text": "testo leggibile" }

RISPOSTA: SOLO JSON valido, nessun testo extra, nessun markdown.`

/* ─── Handler ────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!openai) return res.status(500).json({ error: 'OpenAI non configurato' })

  try {
    await runMiddleware(req, res, upload.single('image'))
    const file = req.file
    if (!file) return res.status(400).json({ error: 'Nessuna immagine ricevuta' })
    if (file.size < 100) return res.status(400).json({ error: 'Immagine troppo piccola' })

    const base64 = file.buffer.toString('base64')
    const mime   = file.mimetype || 'image/jpeg'

    const resp = await openai.chat.completions.create({
      model:       'gpt-4o',
      temperature: 0,
      max_tokens:  4000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text',      text: MASTER_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } }
        ]
      }]
    })

    const raw = resp.choices?.[0]?.message?.content || '{}'
    let parsed
    try { parsed = JSON.parse(raw) }
    catch { return res.status(422).json({ error: 'Risposta GPT non valida', raw }) }

    const docType = parsed.doc_type || 'unknown'

    if (docType === 'receipt' || docType === 'invoice') {
      parsed.ok = true

      // Normalizza categoria con fallback a 3 livelli
      parsed.categoria = normCategory(parsed.categoria, parsed.store_type, parsed.store)

      // Data fallback
      if (!parsed.purchase_date) parsed.purchase_date = new Date().toISOString().slice(0, 10)

      // Items
      if (!Array.isArray(parsed.items)) parsed.items = []

      // Cene: nessun inventario
      if (parsed.categoria === 'cene') {
        parsed.items = []
      } else {
        parsed.items = parsed.items.map(sanitizeItem).filter(Boolean)
      }

      // Totale calcolato se assente
      if (!parsed.price_total && parsed.items.length)
        parsed.price_total = parseFloat(parsed.items.reduce((t, i) => t + (i.price || 0), 0).toFixed(2))
    }

    if (docType === 'wine_label') {
      parsed.ok = true
      if (!['rosso','bianco','rosé','frizzante','fortificato'].includes(parsed.style))
        parsed.style = 'rosso'
    }

    if (docType === 'unknown') {
      parsed.ok   = false
      parsed.error = 'Documento non riconosciuto'
    }

    return res.status(200).json(parsed)

  } catch (err) {
    console.error('[ocr-universal]', err?.message || err)
    return res.status(500).json({ error: 'Errore OCR: ' + (err?.message || 'errore sconosciuto') })
  }
}

/* ─── Normalizza categoria — 3 livelli di fallback ───────────────────── */
function normCategory(categoria, storeType, storeName) {
  const all = [categoria, storeType, storeName]
    .map(s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .join(' ')

  // CENE — ha priorità su tutto (evita che "bar" finisca in varie)
  if (/\b(cene|ristorante|pizzeria|trattoria|osteria|braceria|sushi|kebab|hamburgeria|bistrot|pub|birreria|enoteca|bar\b|caffe|caffetteria|gelateria|pasticceria|tavola.?calda|fast.?food|aperitiv)\b/.test(all))
    return 'cene'

  // CASA — catene GDO prima, poi parole chiave
  if (/\b(orsini|coop|esselunga|conad|carrefour|lidl|aldi|eurospin|penny|pam|interspar|spar|sigma|naturasi|bennet|unes|famila|tigros|despar|iper|ipercoop|prix|dok|il.?gigante|simply|mercatone|tuodi)\b/.test(all))
    return 'casa'
  if (/\b(casa|supermercat|alimentar|norcineria|macelleria|pescheria|fruttivendolo|panetteria|minimarket|drogheria|spesa|detersiv|bolletta|ferramenta|arredo|elettrodomest|deliveroo|glovo|just.?eat|uber.?eat)\b/.test(all))
    return 'casa'

  // VESTITI
  if (/\b(vestiti|abbigliam|scarpe|moda|boutique|gioielleria|accessori.?moda)\b/.test(all))
    return 'vestiti'

  // Valore GPT già valido
  if (['casa','vestiti','cene','varie'].includes(String(categoria || '').trim()))
    return String(categoria).trim()

  return 'varie'
}

/* ─── Sanitize item ──────────────────────────────────────────────────── */
function sanitizeItem(i) {
  if (!i || typeof i !== 'object') return null
  const name = String(i.name || '').trim()
  if (!name) return null

  const packs        = Math.max(1, pn(i.packs) || 1)
  const unitsPerPack = Math.max(1, pn(i.units_per_pack) || 1)
  const rawQty       = pn(i.qty)
  const qty          = rawQty > 0 ? rawQty : packs * unitsPerPack
  const unit         = su(i.unit)
  const finalUnit    = (qty !== Math.round(qty) && qty > 1 && unit === 'pz') ? 'kg' : unit

  return {
    name,
    brand:               i.brand ? String(i.brand).trim() : null,
    packs,
    units_per_pack:      unitsPerPack,
    unit_per_pack_label: String(i.unit_per_pack_label || 'pz').trim(),
    qty:                 parseFloat(qty.toFixed(3)),
    unit:                finalUnit,
    unit_price:          pn(i.unit_price),
    price:               pn(i.price),
    category_item:       sci(i.category_item),
    expiry_date:         sd(i.expiry_date),
  }
}

function pn(v)  { const n = parseFloat(String(v || '0').replace(',', '.')); return isNaN(n) ? 0 : parseFloat(n.toFixed(3)) }
function su(v)  { const s = String(v || 'pz').toLowerCase().trim(); return ['pz','kg','l','g','ml'].includes(s) ? s : 'pz' }
function sci(v) { return ['alimentari','pulizia','igiene','farmaco','altro'].includes(v) ? v : 'alimentari' }
function sd(v)  {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}