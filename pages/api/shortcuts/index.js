// pages/api/shortcuts/index.js
import { supabase } from '@/lib/supabaseClient'
import { runQueryFromTextLocal } from '@/lib/brainHub'   // riuso parser già fatto

// ------------------------ Utility di base ------------------------
function ok(res, data) { return res.status(200).json(data) }
function bad(res, msg, code = 400) { return res.status(code).json({ ok: false, error: msg }) }
function norm(s = '') { return String(s).trim() }
function toNumber(n, def = 0) { const v = Number(n); return Number.isFinite(v) ? v : def }
function fmtEur(n) { return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) }

async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user?.id || null
}

// qty/unit parser: "latte x2", "pane 2 pz", "zucchero 500 g"
function parseItemLine(line) {
  const s = norm(line)
  const m1 = s.match(/^(.*?)(?:\s*[x×]\s*|\s+)(\d+(?:[.,]\d+)?)(?:\s*([a-zA-Z]+))?$/) // nome qty unit?
  if (m1) {
    return {
      name: norm(m1[1]),
      qty: toNumber(m1[2], 1),
      unit: m1[3] ? m1[3].toLowerCase() : null
    }
  }
  return { name: s, qty: 1, unit: null }
}

// Multiple “righe” separate da virgole/andare-a-capo
function parseBulk(text) {
  return norm(text)
    .split(/[,;\n]+/)
    .map(t => parseItemLine(t))
    .filter(x => x.name.length)
}

// ----------- Liste: provo più tabelle per compatibilità -----------
const LIST_TABLE_CANDIDATES = [
  // 1) shopping_list: [{id,user_id,name,qty,unit,is_done,created_at,store_name}]
  { table: 'shopping_list', columns: { name: 'name', qty: 'qty', unit: 'unit', done: 'is_done' } },
  // 2) list_items: puoi avere una colonna list_id: qui salvo in "default"
  { table: 'list_items', columns: { name: 'title', qty: 'quantity', unit: 'unit', done: 'done', listId: 'list_id' } },
  // 3) grocery_lists: variante
  { table: 'grocery_lists', columns: { name: 'item', qty: 'qty', unit: 'unit', done: 'done' } },
]

// Torna il primo schema tabellare esistente tra i candidati
async function pickListTable() {
  for (const c of LIST_TABLE_CANDIDATES) {
    const { error } = await supabase.from(c.table).select('count', { count: 'exact', head: true })
    if (!error) return c
  }
  return null
}

// Cerca una riga simile per nome
async function findListRow(userId, name) {
  const t = await pickListTable()
  if (!t) throw new Error('Tabella lista non trovata (shopping_list/list_items/grocery_lists)')

  const nameCol = t.columns.name
  let q = supabase.from(t.table).select('id,' + nameCol).eq('user_id', userId).ilike(nameCol, `%${name}%`).limit(1)
  if (t.columns.listId) q = q.eq(t.columns.listId, 'default')
  const { data, error } = await q
  if (error) throw error
  return data?.[0] || null
}

// Inserisce 1 voce
async function insertListRow(userId, { name, qty, unit }) {
  const t = await pickListTable()
  if (!t) throw new Error('Tabella lista non trovata (shopping_list/list_items/grocery_lists)')

  const row = { user_id: userId }
  row[t.columns.name] = name
  if (t.columns.qty) row[t.columns.qty] = qty || 1
  if (t.columns.unit) row[t.columns.unit] = unit || null
  if (t.columns.done) row[t.columns.done] = false
  if (t.columns.listId) row[t.columns.listId] = 'default'

  const { data, error } = await supabase.from(t.table).insert(row).select().single()
  if (error) throw error
  return data
}

async function markBoughtRow(userId, name) {
  const t = await pickListTable()
  if (!t) throw new Error('Tabella lista non trovata')
  const row = await findListRow(userId, name)
  if (!row) return { ok: true, updated: 0 }

  const upd = {}
  if (t.columns.done) upd[t.columns.done] = true
  const { error } = await supabase.from(t.table).update(upd).eq('id', row.id).eq('user_id', userId)
  if (error) throw error
  return { ok: true, updated: 1 }
}

async function clearDone(userId) {
  const t = await pickListTable()
  if (!t) throw new Error('Tabella lista non trovata')
  if (!t.columns.done) return { ok: true, cleared: 0 }
  const { error, count } = await supabase.from(t.table).delete({ count: 'exact' }).eq(t.columns.done, true).eq('user_id', userId)
  if (error) throw error
  return { ok: true, cleared: count || 0 }
}

async function fetchShoppingList(userId, storeFilter = null) {
  const t = await pickListTable()
  if (!t) throw new Error('Tabella lista non trovata')
  const nameCol = t.columns.name
  let q = supabase.from(t.table).select(`id,${nameCol},${t.columns.qty||'qty'},${t.columns.unit||'unit'},${t.columns.done||'is_done'},store_name`).eq('user_id', userId)
  if (storeFilter) q = q.ilike('store_name', `%${storeFilter}%`)
  if (t.columns.listId) q = q.eq(t.columns.listId, 'default')
  const { data, error } = await q.order(nameCol, { ascending: true })
  if (error) throw error
  return data || []
}

// ------------------------ Scorte / Finanze quick ------------------------
async function scorteLowOrExpiring(userId, { low = false, expiresIn = null } = {}) {
  // richiede la view scorte_view (già usata nel brainHub)
  const sel = 'id,name,qty,unit,fill_pct,consumed_pct_calc,status,days_to_expiry'
  let q = supabase.from('scorte_view').select(sel).eq('user_id', userId)
  if (low) q = q.eq('status', 'low')
  const { data, error } = await q
  if (error) throw error
  let rows = data || []
  if (expiresIn != null) rows = rows.filter(r => r.days_to_expiry != null && Number(r.days_to_expiry) <= Number(expiresIn))
  return rows.map(r => ({ name: r.name, qty: r.qty, unit: r.unit, status: r.status, days_to_expiry: r.days_to_expiry }))
}

async function scorteConsume(userId, { text, delta = -1 }) {
  // Esempio: sottraggo 1 alla riga più simile (se hai una funzione server per mutare, usa quella)
  const { data, error } = await supabase.from('scorte_view').select('id,name,qty').eq('user_id', userId).ilike('name', `%${text}%`).limit(1)
  if (error) throw error
  const hit = data?.[0]
  if (!hit) return { ok: true, updated: 0 }

  // NB: scorte_view è una view -> qui dovresti aggiornare la tabella “sorgente” delle scorte.
  // Se la tua tabella base si chiama “inventory”, fai un update lì:
  const { error: e2 } = await supabase.from('inventory').update({ qty: Math.max(0, (Number(hit.qty) || 0) + Number(delta)) }).eq('id', hit.id).eq('user_id', userId)
  if (e2) throw e2
  return { ok: true, updated: 1 }
}

// ------------------------ Contante (pocket) ------------------------
async function pocketGetOrCreate(userId) {
  const { data, error } = await supabase.from('pocket_cash').select('id,balance').eq('user_id', userId).limit(1)
  if (error) throw error
  if (data?.length) return data[0]
  const { data: ins, error: e2 } = await supabase.from('pocket_cash').insert({ user_id: userId, balance: 0 }).select().single()
  if (e2) throw e2
  return ins
}

async function pocketMove(userId, delta, note = null) {
  const row = await pocketGetOrCreate(userId)
  const newBal = (Number(row.balance) || 0) + Number(delta)
  const { error } = await supabase.from('pocket_cash').update({ balance: newBal }).eq('id', row.id).eq('user_id', userId)
  if (error) throw error
  await supabase.from('pocket_cash_log').insert({ user_id: userId, amount: delta, note })
  return { ok: true, balance: newBal }
}

// ------------------------ Vini / Luoghi ------------------------
async function findWine(userId, text) {
  const { data, error } = await supabase.from('wines').select('id,name,winery,vintage').eq('user_id', userId).ilike('name', `%${text}%`).limit(1)
  if (error) throw error
  return data?.[0] || null
}

// ------------------------ Handler principale ------------------------
export default async function handler(req, res) {
  try {
    const userId = await getUserId()
    if (!userId) return bad(res, 'Utente non autenticato', 401)

    const action = (req.query.action || req.body.action || '').toString()

    switch (action) {

      /* ===== LISTE ===== */
      case 'add-list-bulk': {
        // body: { items: ["latte", "pane x2", ...] } oppure { text: "latte, pane x2" }
        const items = Array.isArray(req.body.items) ? req.body.items : parseBulk(req.body.text || '')
        if (!items.length) return bad(res, 'Nessun elemento')
        const t = await pickListTable()
        if (!t) return bad(res, 'Tabella lista non trovata')
        for (const r of items) await insertListRow(userId, r)
        return ok(res, { ok: true, added: items.length })
      }
      case 'mark-bought': {
        // body: { text: "latte" }
        const name = norm(req.body.text || '')
        const out = await markBoughtRow(userId, name)
        return ok(res, { ok: true, ...out })
      }
      case 'clear-done': {
        const out = await clearDone(userId)
        return ok(res, out)
      }
      case 'shopping-list': {
        // GET ?store=esselunga
        const store = req.query.store ? String(req.query.store) : null
        const rows = await fetchShoppingList(userId, store)
        return ok(res, { ok: true, rows })
      }

      /* ===== SCORTE ===== */
      case 'inventory': {
        // GET ?low=true&expires_in=3
        const low = String(req.query.low || '').toLowerCase() === 'true'
        const ex = req.query.expires_in != null ? Number(req.query.expires_in) : null
        const rows = await scorteLowOrExpiring(userId, { low, expiresIn: ex })
        return ok(res, { ok: true, rows })
      }
      case 'inventory-consume': {
        // POST { text:"latte", delta:-1 }
        const { text, delta } = req.body
        const r = await scorteConsume(userId, { text, delta: delta ?? -1 })
        return ok(res, r)
      }
      case 'inventory-add': {
        // POST { name, qty, unit } -> se usi una tabella base “inventory”
        const name = norm(req.body.name || '')
        const qty = toNumber(req.body.qty, 1)
        const unit = req.body.unit || null
        const { data, error } = await supabase.from('inventory').insert({ user_id: userId, name, qty, unit }).select().single()
        if (error) throw error
        return ok(res, { ok: true, row: data })
      }
      case 'cook-suggest': {
        // risposta minimale: prendo 3 articoli diversi e propongo 2-3 piatti dummy
        const { data, error } = await supabase.from('scorte_view').select('name').eq('user_id', userId).limit(50)
        if (error) throw error
        const names = (data || []).map(r => r.name.toLowerCase())
        const has = (s) => names.some(n => n.includes(s))
        const ideas = []
        if (has('pasta') && has('pomodoro')) ideas.push('Pasta al pomodoro')
        if (has('riso') && has('zucchine')) ideas.push('Risotto zucchine')
        if (has('uova') && has('tonno')) ideas.push('Frittata al tonno')
        return ok(res, { ok: true, ideas })
      }

      /* ===== FINANZE (via brainHub) ===== */
      case 'spend-total': {
        // GET ?period=yesterday|week|month|prevmonth&category=casa|cene|vestiti|varie
        const p = (req.query.period || 'month').toString()
        const cat = req.query.category ? ` per ${req.query.category}` : ''
        let phrase = 'quanto ho speso '
        if (p === 'yesterday') phrase += 'ieri'
        else if (p === 'week') phrase += 'questa settimana'
        else if (p === 'prevmonth') phrase += 'mese scorso'
        else phrase += 'questo mese'
        phrase += cat
        const out = await runQueryFromTextLocal(phrase)
        return ok(res, out.result || out)
      }
      case 'spend-add': {
        // POST { amount:12, store:"bar", note:"caffè", category:"cene" }
        const { amount, store, note, category } = req.body
        const row = {
          user_id: userId,
          amount: toNumber(amount, 0),
          description: store ? `[${store}] ${note || ''}`.trim() : (note || ''),
          spent_at: new Date().toISOString(),
          payment_method: 'cash', // opzionale
          card_label: null,
        }
        // TODO(mappa DB): se vuoi assegnare id categoria reale, usa resolveCategoryIds e prendi il primo
        const { data, error } = await supabase.from('finances').insert(row).select().single()
        if (error) throw error
        return ok(res, { ok: true, row: data })
      }
      case 'top-spend': {
        // GET ?category=casa
        const cat = req.query.category ? ` per ${req.query.category}` : ''
        const phrase = `in quali prodotti spendo di più${cat}?`
        const out = await runQueryFromTextLocal(phrase)
        return ok(res, out.result || out)
      }
      case 'budget-check': {
        // GET ?category=casa&cap=300
        const cat = (req.query.category || '').toString()
        const cap = Number(req.query.cap || 0)
        const phrase = `quanto ho speso questo mese per ${cat}`
        const out = await runQueryFromTextLocal(phrase)
        const tot = out?.result?.totale || out?.totale || 0
        const over = tot > cap
        return ok(res, { ok: true, category: cat, totale: tot, cap, over, msg: over ? `⚠️ Sei a ${fmtEur(tot)}, sopra il budget di ${fmtEur(cap)}` : `✅ Sei a ${fmtEur(tot)} entro il budget di ${fmtEur(cap)}` })
      }

      /* ===== POCKET CASH ===== */
      case 'pocket-balance': {
        const row = await pocketGetOrCreate(userId)
        return ok(res, { ok: true, balance: row.balance, balance_fmt: fmtEur(row.balance) })
      }
      case 'pocket-move': {
        // POST { delta: -20, note:"aperitivo" }
        const { delta, note } = req.body
        const out = await pocketMove(userId, Number(delta || 0), note || null)
        return ok(res, { ok: true, balance: out.balance, balance_fmt: fmtEur(out.balance) })
      }
      case 'pocket-log': {
        // POST { amount: -50, note:"prelievo" } (solo log, no balance)
        const { amount, note } = req.body
        await supabase.from('pocket_cash_log').insert({ user_id: userId, amount: Number(amount || 0), note: note || null })
        return ok(res, { ok: true })
      }

      /* ===== VINI & CANTINA ===== */
      case 'wine-add': {
        // POST { name, winery, vintage, rating }
        const { name, winery, vintage, rating } = req.body
        const { data, error } = await supabase.from('wines').insert({ user_id: userId, name, winery: winery || null, vintage: vintage ? Number(vintage) : null, rating_5: rating ? Number(rating) : null }).select().single()
        if (error) throw error
        return ok(res, { ok: true, wine: data })
      }
      case 'wine-rate': {
        // POST { text:"barolo", rating:5 }
        const { text, rating } = req.body
        const w = await findWine(userId, text)
        if (!w) return ok(res, { ok: false, msg: 'Vino non trovato' })
        const { error } = await supabase.from('wines').update({ rating_5: Number(rating || 0) }).eq('id', w.id).eq('user_id', userId)
        if (error) throw error
        return ok(res, { ok: true, wine_id: w.id })
      }
      case 'wine-place': {
        // POST { text:"barolo negretti", kind:"purchase|origin", lat, lng, place_name }
        const { text, kind, lat, lng, place_name } = req.body
        const w = await findWine(userId, text)
        if (!w) return ok(res, { ok: false, msg: 'Vino non trovato' })
        const { error } = await supabase.from('product_places').insert({
          user_id: userId,
          item_type: 'wine', item_id: w.id,
          kind: (kind === 'origin' ? 'origin' : 'purchase'),
          lat: Number(lat), lng: Number(lng),
          place_name: place_name || null, is_primary: true
        })
        if (error) throw error
        return ok(res, { ok: true })
      }
      case 'cellar-count': {
        const { data, error } = await supabase.from('cellar').select('id').eq('user_id', userId)
        if (error) throw error
        const total = data?.length || 0
        return ok(res, { ok: true, bottles: total })
      }
      case 'pairing': {
        // GET ?dish=brasato
        const dish = (req.query.dish || '').toString()
        const out = await runQueryFromTextLocal(`che vino abbino a ${dish}?`)
        return ok(res, out.result || out)
      }

      /* ===== OCR wrapper & Brief ===== */
      case 'ingest-ocr': {
        // POST immagine/e da Shortcuts: passale come URL a /api/ocr direttamente;
        // qui accetto pure { dataUrl:"..." } per comodità
        if (req.body?.dataUrl) {
          const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/ocr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: req.body.dataUrl }) })
          const j = await r.json()
          return ok(res, { ok: true, text: j.text || '' })
        }
        return bad(res, 'Manda i file direttamente a /api/ocr', 400)
      }
      case 'daily-brief': {
        const inv = await scorteLowOrExpiring(userId, { low: true })
        const out = await runQueryFromTextLocal('quanto ho speso questo mese?')
        const toBuy = await fetchShoppingList(userId, null).then(rows => rows.filter(r => !r.is_done && !r.done).slice(0, 5).map(r => r.name || r.title || r.item))
        return ok(res, {
          ok: true,
          text: `Hai ${inv.length} articoli in esaurimento. Spesa mese: ${fmtEur(out?.result?.totale || out?.totale || 0)}. Da comprare: ${toBuy.join(', ') || '—'}.`
        })
      }

      default:
        return bad(res, `Azione non riconosciuta: ${action}`)
    }

  } catch (e) {
    console.error(e)
    return bad(res, e.message || String(e), 500)
  }
}
