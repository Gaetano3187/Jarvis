// pages/api/assistant-v2.js
// Jarvis — agente vocale completo con accesso dati reali
// Gestisce: domande su scorte, saldi, prezzi, liste + azioni (aggiungi spesa, entrata, prodotto)
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role per leggere i dati lato server
)

/* ─── Carica contesto dati dell'utente ──────────────────────────── */
async function loadUserContext(userId) {
  const today = new Date().toISOString().slice(0, 10)
  const [y, m] = today.split('-')
  const monthStart = `${y}-${m}-01`

  const [
    { data: scorte },
    { data: lista },
    { data: prezzi },
    { data: saldo },
    { data: entrate },
    { data: uscite },
    { data: carrover },
    { data: vini },
  ] = await Promise.all([
    // Scorte in esaurimento o scadenza
    supabase.from('inventory')
      .select('product_name, qty, initial_qty, consumed_pct, expiry_date, avg_price, store, unit, perishable_type')
      .eq('user_id', userId)
      .order('expiry_date', { ascending: true, nullsFirst: false }),

    // Lista della spesa
    supabase.from('shopping_list')
      .select('name, qty, unit_label, list_type, store, price')
      .eq('user_id', userId)
      .eq('purchased', false),

    // Storico prezzi per prodotto e negozio
    supabase.from('v_price_history')
      .select('product_name, brand, store, avg_unit_price, min_unit_price, times_purchased, last_purchased')
      .eq('user_id', userId)
      .order('times_purchased', { ascending: false })
      .limit(50),

    // Tasca contanti
    supabase.from('pocket_cash')
      .select('delta, moved_at, note')
      .eq('user_id', userId)
      .order('moved_at', { ascending: false })
      .limit(30),

    // Entrate del mese
    supabase.from('incomes')
      .select('source, amount, received_at')
      .eq('user_id', userId)
      .gte('received_at', `${monthStart}T00:00:00`)
      .order('received_at', { ascending: false }),

    // Uscite del mese
    supabase.from('expenses')
      .select('category, store, amount, purchase_date, payment_method')
      .eq('user_id', userId)
      .gte('purchase_date', monthStart)
      .order('purchase_date', { ascending: false }),

    // Carryover mese corrente
    supabase.from('carryovers')
      .select('amount, month_key')
      .eq('user_id', userId)
      .order('month_key', { ascending: false })
      .limit(1),

    // Vini recenti
    supabase.from('wines')
      .select('name, winery, region, vintage, rating_5, style')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // Calcola saldo contanti
  const pocketBalance = (saldo || []).reduce((t, r) => t + Number(r.delta || 0), 0)
  const totEntrate = (entrate || []).reduce((t, r) => t + Number(r.amount || 0), 0)
  const totUscite  = (uscite  || []).reduce((t, r) => t + Number(r.amount || 0), 0)
  const carryAmount = Number(carrover?.[0]?.amount || 0)
  const saldoDisponibile = totEntrate + carryAmount - totUscite

  // Scorte in alert
  const in10 = new Date(); in10.setDate(in10.getDate() + 10)
  const scorteAlert = (scorte || []).filter(item => {
    const pct = item.consumed_pct ?? (item.initial_qty > 0 ? ((item.initial_qty - item.qty) / item.initial_qty) * 100 : 0)
    const expiry = item.expiry_date ? new Date(item.expiry_date) : null
    return pct >= 80 || (expiry && expiry <= in10)
  })

  return {
    oggi: today,
    scorte: scorte || [],
    scorteAlert,
    lista: lista || [],
    prezzi: prezzi || [],
    pocketBalance: pocketBalance.toFixed(2),
    saldoDisponibile: saldoDisponibile.toFixed(2),
    totEntrate: totEntrate.toFixed(2),
    totUscite: totUscite.toFixed(2),
    carryAmount: carryAmount.toFixed(2),
    entrate: entrate || [],
    uscite: uscite || [],
    vini: vini || [],
  }
}

/* ─── System prompt ─────────────────────────────────────────────── */
function buildSystemPrompt(ctx) {
  return `Sei Jarvis, l'assistente AI personale dell'utente.
Oggi è ${ctx.oggi}. Hai accesso ai dati reali dell'utente.

DATI FINANZIARI:
- Saldo disponibile: €${ctx.saldoDisponibile}
- Soldi in tasca (contanti): €${ctx.pocketBalance}
- Entrate questo mese: €${ctx.totEntrate}
- Uscite questo mese: €${ctx.totUscite}
- Carryover mese precedente: €${ctx.carryAmount}

SCORTE IN ESAURIMENTO/SCADENZA (${ctx.scorteAlert.length}):
${ctx.scorteAlert.slice(0, 10).map(s => `- ${s.product_name}: ${s.consumed_pct >= 80 ? 'consumato ' + Math.round(s.consumed_pct) + '%' : 'scade ' + s.expiry_date}`).join('\n') || 'Nessuna'}

LISTA DELLA SPESA (${ctx.lista.length} prodotti):
${ctx.lista.slice(0, 15).map(p => `- ${p.name} x${p.qty} [${p.list_type}]${p.store ? ' @ ' + p.store : ''}`).join('\n') || 'Lista vuota'}

STORICO PREZZI (ultimi acquisti):
${ctx.prezzi.slice(0, 20).map(p => `- ${p.product_name}${p.brand ? ' (' + p.brand + ')' : ''}: €${Number(p.avg_unit_price).toFixed(2)}/u @ ${p.store} (${p.times_purchased}x acquistato)`).join('\n') || 'Nessuno storico'}

SCORTE COMPLETE (${ctx.scorte.length} prodotti):
${ctx.scorte.slice(0, 25).map(s => {
  const pct = Math.round(s.consumed_pct || 0)
  const tipo = s.perishable_type === 'fresh' ? '[FRESCO]' : s.perishable_type === 'aged' ? '[STAGIONATO]' : ''
  const scad = s.expiry_date ? ` scade ${s.expiry_date}` : ''
  return `- ${s.product_name}${tipo ? ' ' + tipo : ''}: ${s.qty} ${s.unit || 'pz'}, consumato ${pct}%${scad}`
}).join('\n') || 'Nessuna scorta'}

VINI RECENTI (${ctx.vini.length}):
${ctx.vini.slice(0, 10).map(v => `- ${v.name}${v.winery ? ' · ' + v.winery : ''}${v.vintage ? ' ' + v.vintage : ''}${v.rating_5 ? ' ★'.repeat(v.rating_5) : ''}`).join('\n') || 'Nessun vino'}

ISTRUZIONI DI RISPOSTA:
- Rispondi sempre in italiano, in modo conciso e utile
- Per domande sui dati, usa i dati reali sopra
- Prodotti [FRESCO]: affettati, formaggi freschi, pesce/carne fresca → scadono automaticamente in 2 giorni dall'acquisto
- Prodotti [STAGIONATO]: pecorino, parmigiano, caciocavallo, ecc. → vanno a consumo progressivo, non hanno scadenza automatica

━━━ REGISTRAZIONE SPESA VOCALE ━━━
Quando l'utente descrive un acquisto, estrai add_expense con QUESTI CAMPI OBBLIGATORI:

• "amount": importo totale numerico (OBBLIGATORIO)
• "store": nome esatto del negozio/locale come detto dall'utente. MAI null se menzionato.
  Es: "Tabaccheria Casacchia", "Ferramenta Balzano", "Bar Porta Napoli", "Farmacia Rossi"
• "description": prodotto/i acquistati in forma breve. Se non specificato usa il nome negozio.
  Es: "3 pacchetti sigarette", "Viti 3mm", "Colazione", "Caffè e cornetto"
• "category": SOLO uno di: "casa" | "cene" | "vestiti" | "varie"
  ┌─ casa:    supermercato, alimentari, frutta/verdura, carne/pesce, pane, latte, uova,
  │           pasta, riso, olio, acqua, bevande, detersivi, pulizia, bollette, affitto,
  │           manutenzioni, arredo, elettrodomestici, ferramenta, materiali, giardinaggio,
  │           asporto/delivery (pizza, cinese, kebab a casa), materiali edili/fai da te
  ├─ cene:    ristorante, pizzeria, trattoria, bar (consumo sul posto), caffè, colazione al bar,
  │           aperitivo, pub, birreria, gelateria, pasticceria (consumo), pranzo/cena fuori
  ├─ vestiti: abbigliamento, scarpe, borse, accessori moda, gioielli, orologi
  └─ varie:   farmacia, tabaccheria, benzinaio, parrucchiere, barbiere, regali, libri,
              elettronica, sport, cinema, teatro, taxi, parcheggio, assicurazione,
              veterinario, hobby, cartoleria, ottico, qualsiasi cosa non classificabile sopra

• "items": array dei prodotti acquistati (anche da descrizione vocale). Ogni item:
  { "name": "nome prodotto", "qty": numero, "unit": "pz|kg|l|m|conf", "unit_price": prezzo_unitario }
  Se l'utente dice "3 pacchetti sigarette a 20€ totali" → items: [{"name":"Sigarette","qty":3,"unit":"conf","unit_price":6.67}]
  Se non dice la quantità → qty:1

• "payment_method": "cash" se dice contanti/ho pagato in contanti, "card" se dice carta/bancomat/pos, default "cash"
• "date": YYYY-MM-DD (oggi se non specificata)

━━━ ESEMPI REALI ━━━

"ho comprato 3 pacchetti di sigarette alla tabaccheria casacchia a 20 euro"
→ { "type":"add_expense", "amount":20, "store":"Tabaccheria Casacchia", "description":"3 pacchetti sigarette", "category":"varie", "items":[{"name":"Sigarette","qty":3,"unit":"conf","unit_price":6.67}], "payment_method":"cash" }

"ho comprato le viti da 3mm alla ferramenta balzano a 2 euro"
→ { "type":"add_expense", "amount":2, "store":"Ferramenta Balzano", "description":"Viti 3mm", "category":"casa", "items":[{"name":"Viti 3mm","qty":1,"unit":"conf","unit_price":2}], "payment_method":"cash" }

"ho fatto colazione al bar porta napoli"
→ { "type":"add_expense", "amount":2.50, "store":"Bar Porta Napoli", "description":"Colazione", "category":"cene", "items":[{"name":"Colazione","qty":1,"unit":"pz","unit_price":2.50}], "payment_method":"cash" }
(se non dice l'importo, stima ragionevole basata sul contesto: caffè ~1.20€, colazione ~2.50€, pranzo al bar ~8€, sigarette ~5-7€/pacchetto)

"ho speso 35 euro al supermercato"
→ { "type":"add_expense", "amount":35, "store":"Supermercato", "description":"Spesa alimentare", "category":"casa", "items":[], "payment_method":"cash" }

"ho pagato con carta 120 euro dal meccanico"
→ { "type":"add_expense", "amount":120, "store":"Meccanico", "description":"Riparazione auto", "category":"varie", "items":[], "payment_method":"card" }

━━━ STIMA IMPORTO ━━━
Se l'utente NON dice l'importo ma descrive prodotti/luogo:
- Caffè al bar: 1.20-1.50€ | Colazione (caffè+cornetto): 2.00-2.50€
- Sigarette (1 pacchetto): 5.50-6.50€ | Giornale: 1.50€
- Pranzo al bar/tavola calda: 7-10€ | Aperitivo: 5-8€
Indica nella "text" che hai stimato l'importo e chiedi conferma.

━━━ LISTA SPESA ━━━
- Per add_to_list: "name" (OBBLIGATORIO), "qty" (default 1), "unit" (default "pz"), "list_type" ("supermercato"|"online")

━━━ ENTRATE ━━━
- Per add_income: "amount", "source" (es. "Stipendio", "Freelance"), "description", "date"

FORMATO RISPOSTA (sempre JSON):
{
  "type": "answer" | "action" | "navigation",
  "text": "risposta naturale all'utente (conferma cosa hai registrato con tutti i dettagli)",
  "action": null | { "type": "add_expense"|"add_income"|"add_to_list"|"add_wine", ...campi },
  "navigate": null | "/percorso-pagina"
}
`
}

/* ─── Normalizza categoria spesa ──────────────────── */
/* --- Normalizza categoria spesa --- */
function normalizeCategory(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(supermercat|spesa|alimentar|cibo|frutta|verdura|carne|pesce|pane|latte|uova|pasta|riso|olio|acqua|bibite|bevande|detersiv|pulizia|ammorbident|candeggina|scottex|bolletta|luce|gas|internet|affitto|mutuo|condomin|manutenzione|riparazione|arredo|mobile|divano|sedia|tavolo|letto|cucina|elettrodomest|lavatrice|frigorifero|forno|aspirapolvere|utensili|stoviglie|tende|coperte|lampadine|ferramenta|giardinaggio|asporto|porta.?via|take.?away|deliveroo|glovo|just.?eat)\b/.test(s)) return 'casa'
  if (/\b(vestit|abbigliam|scarpe|camicia|pantalon|maglion|giacca|cappotto|borsa|cintura|cravatta|calze|intimo|pigiama|costume|sciarpa|guanti|cappello|gioiell|orologio|zaino|valigia|moda)\b/.test(s)) return 'vestiti'
  if (/\b(ristorante|pizzeria|trattoria|osteria|braceria|sushi|kebab|hamburgeria|bistrot|pub|birreria|enoteca|bar|caffe|caffetteria|colazione|pranzo|cena|aperitiv|spritz|cocktail|digestivo|gelato|gelateria|pasticceria|panetteria|paninoteca|fast.?food)\b/.test(s)) return 'cene'
  return 'varie'
}

/* ─── Handler ───────────────────────────────────────────────────── */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { prompt = '', userId, conversationHistory = [] } = req.body || {}
    if (!prompt.trim()) return res.status(400).json({ error: 'Prompt mancante' })
    if (!userId) return res.status(400).json({ error: 'userId mancante' })

    // Carica contesto dati reali
    const ctx = await loadUserContext(userId)
    const systemPrompt = buildSystemPrompt(ctx)

    // Costruisce la history (max 6 turni per contenere i token)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6),
      { role: 'user', content: prompt },
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages,
    })

    const raw = completion.choices?.[0]?.message?.content || '{}'
    let parsed

    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = { type: 'answer', text: raw, action: null, navigate: null }
    }

    // Assicura campi minimi
    parsed.type     = parsed.type     || 'answer'
    parsed.text     = parsed.text     || 'Non ho capito, puoi ripetere?'
    parsed.action   = parsed.action   || null
    parsed.navigate = parsed.navigate || null

    return res.status(200).json({
      ...parsed,
      // Includi anche l'answer legacy per compatibilità
      answer: parsed.text,
    })

  } catch (err) {
    console.error('[assistant-v2]', err?.message)
    return res.status(500).json({
      type: 'answer',
      text: 'Si è verificato un errore. Riprova tra un momento.',
      answer: 'Errore interno',
      action: null,
      navigate: null,
    })
  }
}