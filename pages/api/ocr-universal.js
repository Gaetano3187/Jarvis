// pages/api/ocr-universal.js — VERSIONE COMPLETA AGGIORNATA
// Riconosce automaticamente TUTTI i tipi di scontrino per tutte le pagine:
//   "casa"    → supermercati, alimentari, delivery, bollette, ferramenta
//   "cene"    → ristoranti, bar, caffè (cappuccino/cornetto), pizzerie, aperitivi
//   "vestiti" → abbigliamento, scarpe, boutique, lavanderia, sartoria
//   "varie"   → farmacia, benzina, parrucchiere, tabacchi, elettronica, sport, etc.
// Fix: payment_method "card" SOLO con keyword POS/Visa/Bancomat esplicite
// Fix: scontrini ristorante/bar → estrae ogni piatto/bevanda come item

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

/* ─── Prompt master completo ─────────────────────────────────────────── */
const MASTER_PROMPT = `Sei Jarvis, assistente AI italiano per finanze e gestione casa.
Analizza questa immagine e restituisci un JSON strutturato.

━━━ PASSO 1 — IDENTIFICA IL TIPO DI DOCUMENTO ━━━

- "receipt"    → scontrino di cassa (supermercato, bar, ristorante, negozio, ecc.)
- "wine_label" → etichetta bottiglia vino
- "invoice"    → fattura/ricevuta fiscale
- "unknown"    → non identificabile

━━━ PASSO 2 — SE "receipt": DETERMINA LA CATEGORIA ━━━

Leggi attentamente il nome del negozio, i prodotti acquistati, e classifica in UNA delle seguenti categorie:

────────────────────────────────────────────────────────────
CATEGORIA "casa" — Spese domestiche e alimentari
────────────────────────────────────────────────────────────
Negozi GDO e supermercati (SEMPRE "casa"):
  Coop, Esselunga, Conad, Carrefour, Lidl, Aldi, Eurospin, Penny, Pam,
  Interspar, Spar, Sigma, NaturaSì, Bennet, Unes, Famila, Tigros, Despar,
  Iper, IperCoop, Prix, Dok, Il Gigante, Simply, Mercatone, Tuodì, Orsini,
  MD, Dì per Dì, Carrefour Express, U2, Tosano, Cadoro, Emisfero,
  qualsiasi minimarket/alimentari/drogheria

Prodotti tipici "casa":
  cibo, frutta, verdura, carne, pesce, pane, latte, uova, pasta, riso,
  farina, olio, aceto, conserve, bevande, acqua, vino da supermercato,
  birra, succhi, detersivi, saponi, pulizia casa, carta igienica,
  sacchi spazzatura, ammorbidente, candeggina, pastiglie lavastoviglie

Altri negozi "casa":
  ferramenta, bricolage, Leroy Merlin, Brico, OBI, Castorama,
  IKEA, Zara Home, arredo casa, elettrodomestici, Mediaworld, Unieuro,
  Expert, Trony (solo grandi elettrodomestici per la casa)

Servizi "casa":
  bollette luce/gas/acqua, Enel, A2A, Hera, Iren, Edison,
  Internet/telefono fisso, affitto, condominio, manutenzione

Delivery alimentare:
  Deliveroo, Glovo, Just Eat, Uber Eats (cibo a domicilio),
  Esselunga a Casa, Amazon Fresh

────────────────────────────────────────────────────────────
CATEGORIA "cene" — Ristorazione e consumo fuori casa
────────────────────────────────────────────────────────────
Riconosci "cene" da: presenza di COPERTO, TAVOLO N, "pax", "RIEPILOGO PARZIALE",
piatti tipici da menù, ordini al banco, colazione al bar, ecc.

Bar e caffetteria (SEMPRE "cene"):
  cappuccino, caffè, caffè macchiato, caffè americano, caffè d'orzo,
  latte macchiato, cioccolata calda, tè, infuso,
  cornetto, brioche, croissant, bombolone, ciambella, sfogliata,
  tramezzino, toast, panino bar, club sandwich,
  succo di frutta al banco, acqua minerale al bar,
  colazione al bar, merenda al bar

Aperitivi e drink:
  Spritz, Negroni, Aperol Spritz, Campari, Bellini, Prosecco,
  cocktail, long drink, gin tonic, mojito, margarita,
  birra alla spina, birra in bottiglia, calice di vino al bar,
  consumazione, aperitivo con stuzzichini, happy hour

Ristoranti, trattorie, osterie, pizzerie:
  antipasto, primo piatto, secondo piatto, contorno, dolce, dessert,
  coperto, pane, acqua da tavola, vino da ristorante, birra al ristorante,
  pizza, pasta al ristorante, risotto, carne, pesce al ristorante,
  tagliere, bruschette, fritto misto, tiramisù, panna cotta

Fast food e locali moderni:
  McDonald's, Burger King, KFC, Subway, Domino's, Old Wild West,
  Roadhouse, sushi bar, poke bowl, kebab, hamburgeria, fish & chips,
  birreria, pub, enoteca, wine bar, cocktail bar,
  gelateria, pasticceria (consumo sul posto), paninoteca, tavola calda

────────────────────────────────────────────────────────────
CATEGORIA "vestiti" — Abbigliamento e moda
────────────────────────────────────────────────────────────
Negozi di abbigliamento:
  Zara, H&M, Primark, Benetton, OVS, Coin, Rinascente,
  Reserved, Pull&Bear, Mango, Massimo Dutti, Calzedonia,
  Intimissimi, Tezenis, Yamamay, Nike Store, Adidas Store, Puma Store,
  Geox, Hogan, Tod's, Timberland, UGG, Dr. Martens,
  Liu Jo, Pinko, Patrizia Pepe, Max Mara, Marella, Motivi, Sisley

Prodotti abbigliamento:
  pantaloni, jeans, camicia, gonna, vestito, abito, maglione, felpa,
  giacca, blazer, cappotto, piumino, impermeabile, tuta, leggings,
  scarpe, stivali, sneakers, sandali, mocassini, décolleté, espadrillas,
  borsa, zaino, valigia, portafoglio, cintura, cravatta, foulard,
  sciarpa, guanti, cappello, beretto, cuffia,
  calze, collant, intimo, reggiseno, boxer, slip, costume da bagno,
  pigiama, accappatoio, vestaglia

Accessori e gioielleria:
  gioielli, collana, bracciale, orecchini, anello,
  Pandora, Swarovski, orologio, watch, bijoux,
  occhiali da sole, occhiali da vista, lenti, ottica (Salmoiraghi, GrandVision)

Servizi abbigliamento:
  lavanderia, stireria, sartoria, riparazione scarpe, calzolaio, tintoria

────────────────────────────────────────────────────────────
CATEGORIA "varie" — Tutto il resto
────────────────────────────────────────────────────────────
Farmacia e salute:
  farmacia, parafarmacia, medicinali, Tachipirina, aspirina, antibiotici,
  cerotti, bende, disinfettante, vitamina C, D3, B12, integratori,
  omeopatia, lenti a contatto (solo lenti, non occhiali da vista),
  visita medica, dentista, fisioterapia, analisi del sangue

Benzina e auto:
  ENI, IP, TotalEnergies, Q8, Agip, Shell, Esso, Tamoil, Kuwait,
  benzinaio, gasolio, benzina verde/premium, GPL, metano,
  ricarica auto elettrica (Enel X, Be Charge, Ionity),
  autolavaggio, revisione, meccanico, gommista, officina,
  parcheggio, autostrada, Telepass, bollo auto, assicurazione auto RC

Parrucchiere e bellezza:
  parrucchiere, barbiere, taglio capelli, piega, colorazione, meches,
  make-up, truccatore, estetista, centro benessere, nail artist, unghie,
  ceretta, epilazione laser, massaggio, centro estetico, SPA, beauty center,
  profumeria, Sephora, Kiko, Douglas, prodotti capelli, shampoo professionale

Tabacchi e svago:
  tabaccheria, sigarette, tabacco, sigari, sigarette elettroniche,
  gratta e vinci, Lotto, Superenalotto, Totocalcio, Win for Life,
  giornali, riviste, quotidiani, libri, fumetti

Elettronica e tecnologia:
  smartphone, telefono, tablet, PC, laptop, notebook, cuffie, Airpods,
  caricatore, cover, accessori tech, Apple Store, Samsung Experience,
  Unieuro (solo elettronica piccola), Euronics, Conrad,
  videogiochi, console PlayStation, Xbox, Nintendo Switch,
  abbonamenti digitali: Netflix, Spotify, Amazon Prime, Disney+, DAZN

Sport e hobby:
  palestra, piscina, campo sportivo, tennis, padel, calcetto, pilates, yoga,
  abbonamento fitness, personal trainer, Virgin Active, Technogym,
  Decathlon (solo attrezzi sportivi, non abbigliamento sportivo),
  bici, monopattino, sci, attrezzatura sportiva,
  libraio, libreria Feltrinelli, Mondadori Store, cartolibreria, cancelleria

Servizi vari:
  cinema, teatro, concerti, mostre, musei, biglietti eventi, Ticketmaster,
  taxi, Uber, Bolt, BlaBlaCar, NCC, Flixbus,
  biglietti treno (Trenitalia, Italo), aereo, autobus, ATM Milano, ATAC Roma,
  banca, commissioni bancarie, bonifico, prelievo ATM,
  assicurazioni (vita, casa, viaggio), notaio, commercialista, avvocato,
  veterinario, petshop, negozio animali, crocchette, toelettatura,
  fiorista, piante, vivaio, regalo, giocattoli

━━━ REGOLA FONDAMENTALE: payment_method ━━━
Assegna "card" SOLO se nel testo dello scontrino appaiono ESPLICITAMENTE:
  VISA, MASTERCARD, MAESTRO, BANCOMAT, CONTACTLESS, POS,
  PAGAMENTO CARTA, DEBIT CARD, CREDIT CARD, CHIP, PIN, APPROVED,
  TRANSAZIONE APPROVATA, CARTA DI CREDITO, CARTA DI DEBITO.
Se queste parole NON appaiono → usa "cash" o "unknown".
Scontrini bar/ristorante senza indicazione POS → "unknown", NON "card".

━━━ FORMATO JSON per receipt ━━━
{
  "doc_type": "receipt",
  "store": "nome negozio",
  "store_type": "supermercato|ristorante|bar|caffetteria|pizzeria|farmacia|abbigliamento|benzina|tabaccheria|parrucchiere|elettronica|sport|altro",
  "store_address": "indirizzo o null",
  "purchase_date": "YYYY-MM-DD",
  "price_total": 12.50,
  "payment_method": "cash|card|unknown",
  "categoria": "casa|cene|vestiti|varie",
  "confidence": "high|medium|low",
  "items": [...vedi sotto...],
  "raw_text": "testo trascritto fedelmente"
}

━━━ ITEMS per SUPERMERCATO (categoria "casa") ━━━
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
Regole quantità supermercato:
- Riga "N x P,PP" prima del prodotto → packs=N, unit_price=P,PP
- "X6" o "6X" nel nome → units_per_pack=6, qty=packs*6
- Prodotti al banco "33.370x" → qty=33.370, unit="kg"
Scadenze automatiche: salumi/formaggi freschi →+2gg | carne/pesce →+1gg | confezionato → null

━━━ ITEMS per BAR/CAFFETTERIA (categoria "cene", store_type "bar|caffetteria") ━━━
Estrai ogni consumazione/prodotto come item separato:
{
  "name": "Cappuccino | Caffè espresso | Cornetto | Tramezzino | Succo d'arancia | Birra | Spritz",
  "brand": null,
  "packs": 1, "units_per_pack": 1, "unit_per_pack_label": "pz",
  "qty": 1, "unit": "pz",
  "unit_price": 1.40, "price": 1.40,
  "category_item": "bar",
  "expiry_date": null
}
Se stessa consumazione ripetuta (es. "2 caffè") → qty=2, price=totale.

━━━ ITEMS per RISTORANTE/OSTERIA/PIZZERIA (categoria "cene", store_type "ristorante|pizzeria|osteria") ━━━
Estrai OGNI voce del menù come item separato (coperto, acqua, vino, dolce compresi):
{
  "name": "Coperto | Pallotte Cacio e Ova | Fettuccina al Capriolo | Etna Graci | Acqua naturale",
  "brand": null,
  "packs": 1, "units_per_pack": 1, "unit_per_pack_label": "pz",
  "qty": 1, "unit": "pz",
  "unit_price": 16.00, "price": 16.00,
  "category_item": "ristorante",
  "expiry_date": null
}
- "2 x 16.00" → qty=2, unit_price=16.00, price=32.00
- "COPERTO 2 x 2.50" → qty=2, unit_price=2.50, price=5.00
- Vino (es. "Etna Graci 40,00") → item separato price=40.00

━━━ ITEMS per FARMACIA (categoria "varie") ━━━
{ "name": "Tachipirina 500mg", "brand": "Angelini", "category_item": "farmaco", "price": 4.50, ... }

━━━ ITEMS per ABBIGLIAMENTO (categoria "vestiti") ━━━
{ "name": "Pantaloni chino beige", "brand": "Zara", "category_item": "abbigliamento", "price": 29.99, ... }

━━━ ITEMS per VARIE (benzina, parrucchiere, ecc.) ━━━
{ "name": "Benzina verde 95", "brand": "ENI", "category_item": "altro", "price": 55.00, ... }

━━━ SE wine_label ━━━
{
  "doc_type": "wine_label",
  "name": "denominazione es. Montepulciano d'Abruzzo",
  "winery": "nome cantina completo",
  "locality": "città e provincia",
  "region": "regione italiana",
  "vintage": 2021,
  "alcohol": 13.5,
  "denomination": "DOC|DOCG|IGT",
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

/* ─── Keyword per rilevare pagamento carta ─────────────────────────── */
const CARTA_REGEX = /\b(visa|mastercard|maestro|bancomat|contactless|pos|pagamento\s+carta|debit\s+card|credit\s+card|chip|approved|transazione\s+approvata|carta\s+di\s+(credito|debito))\b/i

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

      // Normalizza categoria
      parsed.categoria = normCategory(parsed.categoria, parsed.store_type, parsed.store)

      // Data fallback
      if (!parsed.purchase_date) parsed.purchase_date = new Date().toISOString().slice(0, 10)

      // Items
      if (!Array.isArray(parsed.items)) parsed.items = []

      // ── FIX payment_method: carta SOLO con evidenza POS ──────────────
      const rawText = String(parsed.raw_text || '')
      if (parsed.payment_method === 'card') {
        if (!CARTA_REGEX.test(rawText)) {
          parsed.payment_method = 'unknown'
        }
      }

      // Sanitize items in base alla categoria
      const isCene = parsed.categoria === 'cene'
      if (isCene) {
        parsed.items = parsed.items
          .filter(i => i && i.name && String(i.name).trim())
          .map(i => sanitizeCeneItem(i, parsed.store_type))
          .filter(Boolean)
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

/* ─── Normalizza categoria con 3 livelli di fallback ─────────────────── */
function normCategory(categoria, storeType, storeName) {
  const all = [categoria, storeType, storeName]
    .map(s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .join(' ')

  // CENE — priorità assoluta (bar, caffetteria, ristoranti, fast food)
  if (/\b(cene|ristorante|pizzeria|trattoria|osteria|braceria|sushi|kebab|hamburgeria|bistrot|pub|birreria|enoteca|wine.?bar|bar\b|caffe\b|caffetteria|gelateria|pasticceria|paninoteca|tavola.?calda|fast.?food|aperitiv|mcdonald|burger.?king|kfc|subway|domino|old.?wild|roadhouse)\b/.test(all))
    return 'cene'

  // VESTITI — abbigliamento, moda, scarpe, lavanderia
  if (/\b(vestiti|abbigliam|scarpe|moda|boutique|gioielleria|accessori.?moda|lavanderia|tintoria|sartoria|calzolaio|zara\b|h&m|primark|benetton|ovs\b|coin\b|intimissimi|calzedonia|tezenis|yamamay|geox|hogan|liu.?jo|pinko|marella|sisley|ottica|occhiali.?da.?sole|occhiali.?da.?vista)\b/.test(all))
    return 'vestiti'

  // VARIE — farmacia, benzina, parrucchiere, elettronica, sport, tabacchi, ecc.
  if (/\b(farmacia|parafarmacia|medicinali|tabaccheria|tabacchi|benzina|gasolio|benzinaio|eni\b|ip\b|q8\b|agip\b|totalenerg|shell\b|tamoil|parrucchiere|barbiere|estetista|beauty|spa\b|palestra|piscina|cinema|teatro|taxi\b|uber\b|bolt\b|trenitalia|italo\b|atm\b|banca|assicurazione|veterinario|fiorista|giocattoli|libreria|feltrinelli|mondadori|cartolibreria|sephora|kiko\b|douglas\b|profumeria|elettronica|smartphone|iphone|samsung|apple.?store)\b/.test(all))
    return 'varie'

  // CASA — GDO e supermercati noti
  if (/\b(orsini|coop\b|esselunga|conad\b|carrefour|lidl\b|aldi\b|eurospin|penny\b|pam\b|interspar|spar\b|sigma\b|naturasi|bennet\b|unes\b|famila\b|tigros\b|despar\b|iper\b|ipercoop|prix\b|dok\b|gigante\b|simply\b|mercatone|tuodi\b|md\b|cadoro\b|tosano|emisfero|dì.?per.?dì)\b/.test(all))
    return 'casa'
  if (/\b(supermercat|alimentar|norcineria|macelleria|pescheria|fruttivendolo|panetteria|minimarket|drogheria|spesa|detersiv|bolletta|ferramenta|brico\b|leroy.?merlin|obi\b|ikea\b|arredo|elettrodomest|deliveroo|glovo|just.?eat|uber.?eat|amazon.?fresh)\b/.test(all))
    return 'casa'

  // Usa valore GPT se già valido
  if (['casa','vestiti','cene','varie'].includes(String(categoria || '').trim()))
    return String(categoria).trim()

  return 'varie'
}

/* ─── Sanitize item bar/ristorante (categoria "cene") ────────────────── */
function sanitizeCeneItem(i, storeType) {
  if (!i || typeof i !== 'object') return null
  const name = String(i.name || '').trim()
  if (!name) return null

  const qty = Math.max(1, pn(i.qty) || 1)
  const unitPrice = pn(i.unit_price) > 0 ? pn(i.unit_price) : pn(i.price)
  const price = pn(i.price) > 0 ? pn(i.price) : (qty * unitPrice)

  const isBar = /bar|caffetteria|caffe/i.test(storeType || '')
  const catItem = isBar ? 'bar' : 'ristorante'

  return {
    name,
    brand:               null,
    packs:               qty,
    units_per_pack:      1,
    unit_per_pack_label: 'pz',
    qty,
    unit:                'pz',
    unit_price:          parseFloat((unitPrice || price).toFixed(2)),
    price:               parseFloat(price.toFixed(2)),
    category_item:       i.category_item || catItem,
    expiry_date:         null,
  }
}

/* ─── Sanitize item standard (supermercato/farmacia/abbigliamento/varie) */
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

  const priceRow     = pn(i.price)
  const unitPriceVal = pn(i.unit_price)
  const finalPrice   = priceRow > 0 ? priceRow : packs * unitPriceVal
  const finalUnitPrice = unitPriceVal > 0
    ? unitPriceVal
    : (packs > 1 && finalPrice > 0 ? parseFloat((finalPrice / packs).toFixed(2)) : finalPrice)

  return {
    name,
    brand:               i.brand ? String(i.brand).trim() : null,
    packs,
    units_per_pack:      unitsPerPack,
    unit_per_pack_label: String(i.unit_per_pack_label || 'pz').trim(),
    qty:                 parseFloat(qty.toFixed(3)),
    unit:                finalUnit,
    unit_price:          finalUnitPrice,
    price:               parseFloat(finalPrice.toFixed(2)),
    category_item:       sci(i.category_item),
    expiry_date:         sd(i.expiry_date),
  }
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function pn(v) {
  const n = parseFloat(String(v || '0').replace(',', '.'))
  return isNaN(n) ? 0 : parseFloat(n.toFixed(3))
}
function su(v) {
  const s = String(v || 'pz').toLowerCase().trim()
  return ['pz','kg','l','g','ml'].includes(s) ? s : 'pz'
}
function sci(v) {
  return ['alimentari','pulizia','igiene','farmaco','altro','ristorante','bar','abbigliamento'].includes(v)
    ? v : 'alimentari'
}
function sd(v) {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}