// pages/api/ocr-universal.js
// OCR intelligente: riconosce il tipo di documento e applica la logica corretta
import multer from 'multer'
import OpenAI from 'openai'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, r => r instanceof Error ? reject(r) : resolve(r))
  })
}

export const config = { api: { bodyParser: false, externalResolver: true } }

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

/* ─── Prompt universale ─────────────────────────────────────────── */
const PROMPT = `Sei Jarvis, assistente AI per la gestione casa e finanze.
Analizza l'immagine e determina il tipo di documento.

TIPI:
1. "receipt" — scontrino di cassa
2. "wine_label" — etichetta bottiglia vino
3. "invoice" — fattura/ricevuta formale
4. "unknown" — non riconoscibile

FORMATO RISPOSTA per "receipt":
{
  "doc_type": "receipt",
  "store": "nome negozio",
  "store_type": "supermercato|farmacia|ristorante|bar|benzinaio|tabaccheria|abbigliamento|norcineria|macelleria|panetteria|pizzeria|altro",
  "store_address": "indirizzo o null",
  "purchase_date": "YYYY-MM-DD",
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
      "unit_price": 1.50,
      "price": 1.50,
      "category_item": "alimentari|pulizia|igiene|farmaco|altro",
      "expiry_date": "YYYY-MM-DD o null"
    }
  ],
  "raw_text": "testo grezzo"
}

FORMATO per "wine_label":
{
  "doc_type": "wine_label",
  "name": "es. Montepulciano d'Abruzzo",
  "winery": "nome cantina",
  "locality": "es. Vasto (CH)",
  "region": "regione italiana",
  "vintage": 2021,
  "alcohol": 13.5,
  "denomination": "DOC|DOCG|IGT",
  "grapes": ["vitigno"],
  "style": "rosso|bianco|rosé|frizzante|fortificato",
  "volume_ml": 750,
  "website": null
}

FORMATO per "invoice":
{
  "doc_type": "invoice",
  "store": "fornitore",
  "store_address": null,
  "purchase_date": "YYYY-MM-DD",
  "price_total": 0.00,
  "payment_method": "cash|card|transfer|unknown",
  "categoria": "casa|vestiti|cene|varie",
  "description": "descrizione servizio",
  "confidence": "high|medium|low"
}

FORMATO per "unknown": { "doc_type": "unknown", "raw_text": "testo leggibile" }

REGOLE CATEGORIA:
- "casa": supermercato, cibo (INCLUSO pizza asporto, take-away, delivery a domicilio), pulizia, detersivi, bollette, affitto, manutenzioni, arredo, ferramenta, elettrodomestici, norcinerie, macellerie, panetterie per casa
- "vestiti": abbigliamento, scarpe, accessori moda, gioielli
- "cene": consumo fisico fuori casa — ristorante, bar al banco, pizzeria mangiata lì, aperitivo, colazione al bar
- "varie": farmacia, parrucchiere, tabaccheria, benzinaio, regali, elettronica, sport, cinema, taxi, parcheggio, veterinario, tutto il resto

REGOLE EXPIRY_DATE per prodotti freschi:
- Affettati, salumi aperti, prosciutto cotto/crudo affettato, bresaola: oggi + 2 giorni
- Formaggi freschi (mozzarella, ricotta, stracchino, crescenza, robiola): oggi + 2 giorni
- Formaggi STAGIONATI (parmigiano, pecorino, caciocavallo, grana padano, camoscio d'oro, pecorino grattugiato, provolone, scamorza, emmental, fontina): expiry_date = null (si consumano gradualmente)
- Carne fresca, pesce fresco: oggi + 1 giorno
- Frutta e verdura fresca: oggi + 5 giorni
- Pane fresco: oggi + 2 giorni
- Prodotti confezionati chiusi: null (lunga conservazione)

Estrai TUTTI i prodotti. Rispondi SOLO JSON valido.`

/* ─── Helpers classificazione ───────────────────────────────────── */
function categorizeExpense(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(supermercat|spesa|alimentar|cibo|frutta|verdura|carne|pesce|salumer|norcineria|macelleria|panetteria|pane|latte|uova|pasta|riso|olio|acqua|bibite|bevande|detersiv|pulizia|ammorbident|candeggina|bolletta|luce|gas|internet|affitto|manutenzione|arredo|ferramenta|elettrodomest|asporto|take.?away|porta.?via|deliveroo|glovo|just.?eat)\b/.test(s)) return 'casa'
  if (/\b(vestit|abbigliam|scarpe|moda|borsa|gioiell|orologio)\b/.test(s)) return 'vestiti'
  if (/\b(ristorante|pizzeria|trattoria|osteria|braceria|sushi|kebab|hamburgeria|bistrot|pub|birreria|enoteca|bar|caffe|colazione|pranzo|cena|aperitiv|gelato|pasticceria)\b/.test(s)) return 'cene'
  return 'varie'
}

// Classifica il tipo di deperibilità di un prodotto
function classifyPerishable(name, brand = '') {
  const s = (name + ' ' + brand).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Formaggi stagionati → consumo graduale, NO scadenza automatica
  if (/\b(parmigian|grana|pecorino|caciocavallo|provolone|scamorza|emmental|fontina|camoscio.?d.?oro|asiago|groviera|pecorino.?grattugiato|parmigiano.?grattugiato)\b/.test(s))
    return 'cheese_aged'

  // Affettati e salumi freschi aperti
  if (/\b(prosciutto|bresaola|salame|mortadella|speck|coppa|pancetta|affettat|salumi)\b/.test(s))
    return 'deli_sliced'

  // Formaggi freschi
  if (/\b(mozzarella|ricotta|stracchino|crescenza|robiola|mascarpone|primo.?sale|quark|cottage|burrata)\b/.test(s))
    return 'cheese_fresh'

  // Carne fresca
  if (/\b(pollo|manzo|maiale|agnello|tacchino|bistecca|fettina|hamburger|polpette|salsiccia|braciola|carne.?macinata|filetto)\b/.test(s))
    return 'meat_fresh'

  // Pesce fresco
  if (/\b(salmone|tonno.?fresco|orata|branzino|merluzzo|gamberi|vongole|cozze|pesce)\b/.test(s))
    return 'fish_fresh'

  // Frutta e verdura
  if (/\b(mela|pera|banana|arancia|limone|fragola|uva|pomodoro|insalata|lattuga|zucchina|carota|patata|cipolla|aglio|spinaci|broccoli|cavolfiore|frutta|verdura)\b/.test(s))
    return 'produce'

  // Pane fresco
  if (/\b(pane|baguette|focaccia|ciabatta|rosetta|michetta)\b/.test(s))
    return 'bread'

  return 'shelf_stable' // prodotto confezionato stabile
}

// Calcola la data di scadenza automatica basata sul tipo
function autoExpiryDate(perishableType, purchaseDateStr) {
  if (perishableType === 'cheese_aged' || perishableType === 'shelf_stable') return null

  const base = purchaseDateStr ? new Date(purchaseDateStr) : new Date()
  const daysMap = {
    deli_sliced:  2,
    cheese_fresh: 2,
    meat_fresh:   1,
    fish_fresh:   1,
    produce:      5,
    bread:        2,
  }
  const days = daysMap[perishableType]
  if (!days) return null

  const expiry = new Date(base)
  expiry.setDate(expiry.getDate() + days)
  return expiry.toISOString().slice(0, 10)
}

// Categorizza il prodotto per inventory
function categorizeProduct(name, brand = '') {
  const s = (name + ' ' + brand).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(detersiv|ammorbident|candeggina|scottex|carta.?igienica|spugna|scopino|secchio|guanti.?gomma|lavastoviglie.?pastiglia)\b/.test(s)) return 'pulizia'
  if (/\b(shampo|balsamo|dentifricio|sapone|bagnoschiuma|deodorante|rasoi|cotton|assorbenti|pannolini|crema)\b/.test(s)) return 'igiene'
  if (/\b(aspirina|tachipirina|antibiotico|vitamina|integratore|farmaco|medicina|sciroppo|cerotto|garza)\b/.test(s)) return 'farmaco'
  return 'alimentari'
}

/* ─── Handler ───────────────────────────────────────────────────── */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })
  if (!openai) return res.status(500).json({ error: 'OpenAI non configurato' })

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
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } },
          { type: 'text', text: PROMPT },
        ],
      }],
    })

    const raw = response.choices?.[0]?.message?.content || '{}'
    let parsed
    try { parsed = JSON.parse(raw) }
    catch { return res.status(422).json({ error: 'Risposta GPT non valida', raw }) }

    const docType = parsed.doc_type || 'unknown'
    const purchaseDate = parsed.purchase_date || new Date().toISOString().slice(0, 10)

    if (docType === 'receipt' || docType === 'invoice') {
      parsed.ok = true
      // Categoria: usa store_type + categoria GPT + nome negozio per massima precisione
      const catInput = [parsed.categoria, parsed.store_type, parsed.store].filter(Boolean).join(' ')
      parsed.categoria = categorizeExpense(catInput)
      if (!parsed.purchase_date) parsed.purchase_date = purchaseDate
      if (!Array.isArray(parsed.items)) parsed.items = []

      // Arricchisce ogni prodotto
      parsed.items = parsed.items.map(item => {
        const perishable = classifyPerishable(item.name || '', item.brand || '')
        const catItem    = categorizeProduct(item.name || '', item.brand || '')
        // Usa expiry_date da GPT se disponibile, altrimenti calcola automaticamente
        const expiry = item.expiry_date || autoExpiryDate(perishable, purchaseDate)
        return {
          ...item,
          perishable_type: perishable,
          category_item:   catItem,
          expiry_date:     expiry,
        }
      })
    }

    if (docType === 'wine_label') {
      parsed.ok = true
      if (!parsed.style || !['rosso','bianco','rosé','frizzante','fortificato'].includes(parsed.style))
        parsed.style = 'rosso'
    }

    if (docType === 'unknown') {
      parsed.ok = false
      parsed.error = 'Documento non riconoscibile'
    }

    return res.status(200).json(parsed)

  } catch (err) {
    console.error('[ocr-universal]', err?.message || err)
    return res.status(500).json({ error: 'Errore OCR: ' + (err?.message || 'errore sconosciuto') })
  }
}