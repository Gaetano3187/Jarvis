// pages/api/finances/analytics.js
// Endpoint unico per la chat (Finanze + Scorte + Liste).
// Risponde SEMPRE con stringhe pronte: { ok: true, result: "..." }
//
// Richiede .env con:
//   NEXT_PUBLIC_SUPABASE_URL=...
//   SUPABASE_SERVICE_ROLE_KEY=...   (service role)
//
// NOTE: mappa aggiornata sul tuo schema reale (vedi constants qui sotto).

import { createClient } from '@supabase/supabase-js';

/* ========== MAPPATURA SCHEMA (ADERENTE AL TUO PROGETTO) ========== */

// --- FINANZE ---
const TBL_EXPENSES     = 'finances';
const COL_EXP_ID       = 'id';
const COL_EXP_AMOUNT   = 'amount';
const COL_EXP_DATE     = 'spent_at';
const COL_EXP_CATEGORY = 'category_id';
const COL_EXP_DESC     = 'description';
// Non usi un campo merchant dedicato:
const COL_EXP_MERCHANT = null; // useremo la description per ricerche testuali

// Categorie note (UUID dal tuo repo)
const CATEGORY_IDS = {
  'spese casa':       '4cfaac74-aab4-4d96-b335-6cc64de59afc',
  'vestiti':          '89e223d4-1ec0-4631-b0d4-52472579a04a',
  'cene e aperitivi': '0f8eb04a-8a1a-4899-9f29-236a5be7e9db',
  'varie':            '075ce548-15a9-467c-afc8-8b156064eeb6',
};

// Nessuna tabella itemizzata collegata alle spese nel tuo schema attuale:
const TBL_EXPENSE_ITEMS = null;

// --- SCORTE (dispensa) ---
const TBL_INVENTORY   = 'scorte';
const COL_INV_NAME    = 'nome_prodotto';
const COL_INV_RESIDUO = 'quantita_attuale';
const COL_INV_CONF    = 'quantita_iniziale';
const COL_INV_UNIT    = 'unita';        // opzionale
const COL_INV_UPDATED = 'updated_at';
const COL_INV_EXPIRY  = 'expiry_date';  // aggiungila se non c'è (consigliato)

// --- LISTE DELLA SPESA ---
// Schema piatto: ogni riga è un item di una lista
const TBL_LISTS               = 'shopping_list'; // (usato solo per coerenza)
const COL_LIST_ID             = 'id';
const COL_LIST_TYPE           = 'lista';         // 'supermercato' | 'online'
const TBL_LIST_ITEMS          = 'shopping_list';
const COL_LIST_ITEM_LIST_ID   = null;            // non serve (schema piatto)
const COL_LIST_ITEM_NAME      = 'nome_prodotto';
const COL_LIST_ITEM_QTY       = 'quantita';
const COL_LIST_ITEM_BOUGHT    = 'acquistato';
const COL_LIST_ITEM_PRICE     = 'prezzo';

// --- MEMORIA (apprendimento) opzionale ---
const TBL_MEMORY     = 'assistant_memory';
const COL_MEM_USER   = 'user_id';
const COL_MEM_TYPE   = 'type';
const COL_MEM_KEY    = 'key';
const COL_MEM_VALUE  = 'value';
const COL_MEM_WEIGHT = 'weight';
const COL_MEM_UPDATED= 'updated_at';

// Soglie consigli scorte
const LOW_STOCK_THRESHOLD = 0.2; // 20%
const DAYS_TO_EXPIRY      = 10;

/* ========== SUPABASE CLIENT (Server-side) ========== */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // service role
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

/* ========== HELPERS ========== */

const fmtEuro = (n) => {
  if (n == null || Number.isNaN(n)) return '€0,00';
  try { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n)); }
  catch { return `€${Number(n).toFixed(2)}`; }
};
const safeDate = (s) => s?.slice?.(0,10) || s || '';

function labelPeriod(period) {
  if (!period?.start && !period?.end) return 'nel periodo selezionato';
  if (period.start && period.end && period.start === period.end) return `il ${period.start}`;
  if (period.start && period.end) return `tra ${period.start} e ${period.end}`;
  if (period.start) return `dal ${period.start}`;
  if (period.end) return `fino al ${period.end}`;
  return '';
}

function mapCategoryNameToId(name) {
  if (!name) return null;
  const key = String(name).toLowerCase();
  return CATEGORY_IDS[key] || null;
}

function applyPeriodFilter(query, period) {
  if (period?.start) query.gte(COL_EXP_DATE, period.start);
  if (period?.end)   query.lte(COL_EXP_DATE, period.end);
  return query;
}

function isTablePresent(name) {
  return !!name && typeof name === 'string';
}

/* ========== APPRENDIMENTO (best-effort) ========== */

async function learnUtterance(userId, utterance, actionObj) {
  if (!utterance || !isTablePresent(TBL_MEMORY)) return;
  try {
    await supabase
      .from(TBL_MEMORY)
      .upsert({
        [COL_MEM_USER]: userId || null,
        [COL_MEM_TYPE]: 'qa',
        [COL_MEM_KEY]: String(utterance).slice(0, 300),
        [COL_MEM_VALUE]: JSON.stringify(actionObj),
        [COL_MEM_WEIGHT]: 1
      }, { onConflict: `${COL_MEM_USER},${COL_MEM_TYPE},${COL_MEM_KEY}` });
  } catch {
    // se non esiste la tabella, ignoriamo
  }
}

/* ========== FINANZE ========== */

// Somma JS (portabile) invece di SUM SQL per evitare incompatibilità
async function sumAmountBase(filters, extraWhere = null) {
  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_AMOUNT}, ${COL_EXP_DATE}, ${COL_EXP_CATEGORY}`, { head: false });

  if (filters?.period) q = applyPeriodFilter(q, filters.period);
  if (typeof extraWhere === 'function') q = extraWhere(q);

  const { data, error } = await q;
  if (error) throw error;
  const sum = (data || []).reduce((acc, r) => acc + Number(r[COL_EXP_AMOUNT] || 0), 0);
  return sum;
}

async function finances_total_spent(filters) {
  const sum = await sumAmountBase(filters);
  const label = labelPeriod(filters?.period);
  return `Hai speso ${fmtEuro(sum)} ${label}.`;
}

async function finances_category_total(filters) {
  const catId = mapCategoryNameToId(filters?.category);
  if (!catId) return `Categoria non trovata. Prova: "spese casa", "vestiti", "cene e aperitivi".`;

  const sum = await sumAmountBase(filters, (q) => q.eq(COL_EXP_CATEGORY, catId));
  const label = labelPeriod(filters?.period);
  return `Nella categoria “${filters.category}” hai speso ${fmtEuro(sum)} ${label}.`;
}

async function finances_category_breakdown(filters) {
  const catId = mapCategoryNameToId(filters?.category);
  if (!catId) return `Categoria non trovata.`;

  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_DATE}, ${COL_EXP_AMOUNT}, ${COL_EXP_DESC}`)
    .eq(COL_EXP_CATEGORY, catId)
    .order(COL_EXP_DATE, { ascending: false })
    .limit(30);
  if (filters?.period) q = applyPeriodFilter(q, filters.period);

  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return `Nessuna spesa per “${filters.category}” nel periodo richiesto.`;

  const rows = data.map(r => `• ${safeDate(r[COL_EXP_DATE])}: ${fmtEuro(r[COL_EXP_AMOUNT])} – ${r[COL_EXP_DESC] || ''}`.trim());
  return `Dettaglio “${filters.category}” (ultime ${data.length}):\n` + rows.join('\n');
}

async function finances_products_purchased(filters) {
  // Non hai tabella di item: stimiamo dai testi description
  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_DESC}`)
    .not(COL_EXP_DESC, 'is', null)
    .order(COL_EXP_DATE, { ascending: false })
    .limit(300);
  if (filters?.period) q = applyPeriodFilter(q, filters.period);

  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return 'Non ho trovato descrizioni utili nel periodo richiesto.';

  const STOP = new Set(['da','al','alla','allo','del','della','dei','degli','delle','con','per','e','di','il','lo','la','le','gli','i','un','uno','una','in','su','sul','sulla','sui','sugli','sulle','dal','dall','dalla','dallo','dai','dagli','dalle','a','ad','ai','agli','alle','tra','fra','o','oppure']);
  const freq = Object.create(null);

  for (const r of data) {
    const words = String(r[COL_EXP_DESC] || '').toLowerCase().match(/[a-zàèéìòóù0-9]+/g) || [];
    for (const wRaw of words) {
      const w = wRaw.normalize('NFD').replace(/\p{Diacritic}/gu,'');
      if (w.length < 4 || STOP.has(w)) continue;
      freq[w] = (freq[w] || 0) + 1;
    }
  }

  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,20);
  if (!top.length) return 'Non emergono prodotti ricorrenti nelle descrizioni.';

  const label = labelPeriod(filters?.period);
  const lines = top.map(([k,v]) => `• ${k} (${v})`);
  return `Prodotti ricorrenti nelle descrizioni ${label}:\n` + lines.join('\n');
}

async function finances_cheapest_merchant(filters) {
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi il prodotto (es. “prosciutto San Daniele”).';

  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_AMOUNT}, ${COL_EXP_DATE}, ${COL_EXP_DESC}`)
    .ilike(COL_EXP_DESC, `%${product}%`)
    .order(COL_EXP_AMOUNT, { ascending: true })
    .limit(1);
  if (filters?.period) q = applyPeriodFilter(q, filters.period);

  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return `Non ho trovato acquisti di “${product}” nel periodo richiesto.`;
  const r = data[0];
  // Non avendo merchant, mostriamo solo importo+data+nota testuale
  return `Il prezzo più basso per “${product}” è ${fmtEuro(r[COL_EXP_AMOUNT])} (il ${safeDate(r[COL_EXP_DATE])}).`;
}

async function finances_price_trend(filters) {
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi il prodotto di cui vuoi il trend prezzo.';
  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_AMOUNT}, ${COL_EXP_DATE}, ${COL_EXP_DESC}`)
    .ilike(COL_EXP_DESC, `%${product}%`)
    .order(COL_EXP_DATE, { ascending: true })
    .limit(10);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return `Non ho trovato acquisti di “${product}”.`;
  const lines = data.map(r => `• ${safeDate(r[COL_EXP_DATE])}: ${fmtEuro(r[COL_EXP_AMOUNT])}`);
  return `Trend prezzo per “${product}” (ultimi ${data.length}):\n` + lines.join('\n');
}

async function finances_last_purchase(filters) {
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi il prodotto (es. “mozzarella”).';
  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_AMOUNT}, ${COL_EXP_DATE}, ${COL_EXP_DESC}`)
    .ilike(COL_EXP_DESC, `%${product}%`)
    .order(COL_EXP_DATE, { ascending: false })
    .limit(1);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return `Nessun acquisto recente di “${product}”.`;
  const r = data[0];
  return `Ultimo acquisto “${product}”: ${fmtEuro(r[COL_EXP_AMOUNT])} il ${safeDate(r[COL_EXP_DATE])}.`;
}

/* ========== SCORTE (INVENTORY) ========== */

async function inv_low_stock() {
  const { data, error } = await supabase.from(TBL_INVENTORY)
    .select(`${COL_INV_NAME}, ${COL_INV_RESIDUO}, ${COL_INV_CONF}, ${COL_INV_EXPIRY}`)
    .order(COL_INV_NAME, { ascending: true });
  if (error) throw error;

  const rows = (data || []).filter(r => {
    const cap = Number(r[COL_INV_CONF] || 0);
    const res = Number(r[COL_INV_RESIDUO] || 0);
    if (!cap) return res <= 0;
    return res / cap <= LOW_STOCK_THRESHOLD;
  });
  if (!rows.length) return 'Nessun prodotto in esaurimento.';

  const lines = rows.map(r => {
    const cap = Number(r[COL_INV_CONF] || 0), res = Number(r[COL_INV_RESIDUO] || 0);
    const perc = cap ? Math.round((res / cap) * 100) : 0;
    const exp = r[COL_INV_EXPIRY] ? ` (scad. ${safeDate(r[COL_INV_EXPIRY])})` : '';
    return `• ${r[COL_INV_NAME]} – residuo ${res}/${cap} (${perc}%)${exp}`;
  });
  return `Prodotti in esaurimento (≤${Math.round(LOW_STOCK_THRESHOLD*100)}%):\n` + lines.join('\n');
}

async function inv_out_of_stock() {
  const { data, error } = await supabase.from(TBL_INVENTORY)
    .select(`${COL_INV_NAME}, ${COL_INV_RESIDUO}, ${COL_INV_CONF}`);
  if (error) throw error;

  const rows = (data || []).filter(r => Number(r[COL_INV_RESIDUO] || 0) <= 0);
  if (!rows.length) return 'Nessun prodotto esaurito.';
  return 'Esauriti:\n' + rows.map(r => `• ${r[COL_INV_NAME]}`).join('\n');
}

async function inv_near_expiry() {
  const today = new Date();
  const lim = new Date(today); lim.setDate(today.getDate() + DAYS_TO_EXPIRY);

  const { data, error } = await supabase.from(TBL_INVENTORY)
    .select(`${COL_INV_NAME}, ${COL_INV_EXPIRY}`)
    .not(COL_INV_EXPIRY, 'is', null);
  if (error) throw error;

  const rows = (data || []).filter(r => {
    const d = new Date(r[COL_INV_EXPIRY]);
    return d <= lim;
  }).sort((a,b) => new Date(a[COL_INV_EXPIRY]) - new Date(b[COL_INV_EXPIRY]));

  if (!rows.length) return `Nessun prodotto in scadenza entro ${DAYS_TO_EXPIRY} giorni.`;
  const lines = rows.map(r => `• ${r[COL_INV_NAME]} – scade il ${safeDate(r[COL_INV_EXPIRY])}`);
  return `Prossime scadenze (≤ ${DAYS_TO_EXPIRY} giorni):\n` + lines.join('\n');
}

async function inv_stock_status(filters) {
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi il prodotto (es. “latte”).';

  const { data, error } = await supabase.from(TBL_INVENTORY)
    .select(`${COL_INV_NAME}, ${COL_INV_RESIDUO}, ${COL_INV_CONF}, ${COL_INV_EXPIRY}`)
    .ilike(COL_INV_NAME, `%${product}%`)
    .limit(1);
  if (error) throw error;

  if (!data?.length) return `Non trovo “${product}” in dispensa.`;
  const r = data[0];
  const cap = Number(r[COL_INV_CONF] || 0), res = Number(r[COL_INV_RESIDUO] || 0);
  const perc = cap ? Math.round((res / cap) * 100) : 0;
  const exp = r[COL_INV_EXPIRY] ? ` Scadenza: ${safeDate(r[COL_INV_EXPIRY])}.` : '';
  return `Scorta di “${r[COL_INV_NAME]}”: ${res}/${cap} (${perc}%).${exp}`;
}

async function inv_consumption_rate(filters) {
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi il prodotto.';
  // Stima semplice con due snapshot (serve che tu aggiorni quantita_attuale)
  const { data, error } = await supabase.from(TBL_INVENTORY)
    .select(`${COL_INV_NAME}, ${COL_INV_RESIDUO}, ${COL_INV_UPDATED}`)
    .ilike(COL_INV_NAME, `%${product}%`)
    .order(COL_INV_UPDATED, { ascending: false })
    .limit(2);
  if (error) throw error;

  if (!data?.length) return `Non ho dati sufficienti per “${product}”.`;
  const [last, prev] = data;
  if (!prev) return 'Servono almeno due aggiornamenti di scorta per stimare il consumo.';

  const resLast = Number(last[COL_INV_RESIDUO] || 0);
  const resPrev = Number(prev[COL_INV_RESIDUO] || 0);
  const tLast = new Date(last[COL_INV_UPDATED]);
  const tPrev = new Date(prev[COL_INV_UPDATED]);
  const days = Math.max(1, (tLast - tPrev) / (1000*60*60*24));
  const daily = (resPrev - resLast) / days;
  if (!(daily > 0)) return 'Non rilevo un consumo medio positivo.';
  return `Consumo medio “${last[COL_INV_NAME]}”: ~${daily.toFixed(2)} unità/giorno.`;
}

async function inv_runout_eta(filters) {
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi il prodotto.';
  const { data, error } = await supabase.from(TBL_INVENTORY)
    .select(`${COL_INV_NAME}, ${COL_INV_RESIDUO}, ${COL_INV_UPDATED}`)
    .ilike(COL_INV_NAME, `%${product}%`)
    .order(COL_INV_UPDATED, { ascending: false })
    .limit(2);
  if (error) throw error;

  if (!data?.length) return `Non ho dati sufficienti per “${product}”.`;
  const [last, prev] = data;
  if (!prev) return 'Servono almeno due aggiornamenti per stimare quando finirà.';

  const resLast = Number(last[COL_INV_RESIDUO] || 0);
  const resPrev = Number(prev[COL_INV_RESIDUO] || 0);
  const tLast = new Date(last[COL_INV_UPDATED]);
  const tPrev = new Date(prev[COL_INV_UPDATED]);
  const days = Math.max(1, (tLast - tPrev) / (1000*60*60*24));
  const daily = (resPrev - resLast) / days;
  if (!(daily > 0)) return 'Non riesco a stimare la data di esaurimento (consumo non positivo).';
  const daysLeft = resLast / daily;
  const eta = new Date(tLast); eta.setDate(eta.getDate() + Math.ceil(daysLeft));
  return `Stima esaurimento “${last[COL_INV_NAME]}”: tra circa ${Math.ceil(daysLeft)} giorni (≈ ${eta.toISOString().slice(0,10)}).`;
}

async function inv_shopping_recommendations() {
  const [low, out, exp] = await Promise.all([
    inv_low_stock(),
    inv_out_of_stock(),
    inv_near_expiry()
  ]);
  const parts = [];
  if (!/Nessun prodotto in esaurimento/.test(low)) parts.push(low);
  if (!/Nessun prodotto esaurito/.test(out))       parts.push(out);
  if (!/Nessun prodotto in scadenza/.test(exp))    parts.push(exp);
  if (!parts.length) return 'Non serve comprare nulla adesso: scorte e scadenze ok ✅';
  return `Consigli di acquisto:\n${parts.join('\n\n')}`;
}

/* ========== LISTE ========== */

async function lists_show(filters) {
  const type = filters?.list_type || 'supermercato';
  const { data, error } = await supabase.from(TBL_LIST_ITEMS)
    .select(`${COL_LIST_ITEM_NAME}, ${COL_LIST_ITEM_QTY}, ${COL_LIST_ITEM_BOUGHT}`)
    .eq(COL_LIST_TYPE, type)
    .order(COL_LIST_ITEM_BOUGHT, { ascending: true })
    .order(COL_LIST_ITEM_NAME, { ascending: true });
  if (error) throw error;
  if (!data?.length) return `La lista ${type} è vuota.`;
  const lines = data.map(i => {
    const flag = i[COL_LIST_ITEM_BOUGHT] ? '✅' : '◻️';
    const q = i[COL_LIST_ITEM_QTY] ? ` x${i[COL_LIST_ITEM_QTY]}` : '';
    return `${flag} ${i[COL_LIST_ITEM_NAME]}${q}`;
  });
  return `Lista ${type}:\n` + lines.join('\n');
}

async function lists_add(filters) {
  const type = filters?.list_type || 'supermercato';
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi cosa devo aggiungere e a quale lista (es. “aggiungi latte alla lista supermercato”).';

  // evita duplicati (ilike)
  const { data: existing } = await supabase.from(TBL_LIST_ITEMS)
    .select('id')
    .eq(COL_LIST_TYPE, type)
    .ilike(COL_LIST_ITEM_NAME, product)
    .limit(1);
  if (existing?.length) return `“${product}” è già presente nella lista ${type}.`;

  const { error } = await supabase.from(TBL_LIST_ITEMS).insert({
    [COL_LIST_TYPE]: type,
    [COL_LIST_ITEM_NAME]: product,
    [COL_LIST_ITEM_BOUGHT]: false
  });
  if (error) throw error;
  return `Aggiunto “${product}” alla lista ${type}.`;
}

async function lists_remove(filters) {
  const type = filters?.list_type || 'supermercato';
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi cosa devo rimuovere e da quale lista.';

  const { data: items, error } = await supabase.from(TBL_LIST_ITEMS)
    .select('id, ' + COL_LIST_ITEM_NAME)
    .eq(COL_LIST_TYPE, type)
    .ilike(COL_LIST_ITEM_NAME, `%${product}%`)
    .limit(1);
  if (error) throw error;

  if (!items?.length) return `“${product}” non è nella lista ${type}.`;
  await supabase.from(TBL_LIST_ITEMS).delete().eq('id', items[0].id);
  return `Rimosso “${items[0][COL_LIST_ITEM_NAME]}” dalla lista ${type}.`;
}

/* ========== ROUTER ========== */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok:false, result:'Metodo non consentito' });
    return;
  }
  try {
    const { domain, action, filters, utterance, userId } = req.body || {};

    // memorizza la conversazione (best-effort)
    await learnUtterance(
      userId || null,
      utterance || filters?.raw || '',
      { domain, action, filters: { period: filters?.period || null, product: filters?.product || null, category: filters?.category || null, list_type: filters?.list_type || null } }
    );

    let text = 'Richiesta non compresa.';
    if (domain === 'finances') {
      if (action === 'total_spent')            text = await finances_total_spent(filters);
      else if (action === 'products_purchased')text = await finances_products_purchased(filters);
      else if (action === 'purchase_frequency')text = 'La frequenza acquisti sarà disponibile quando avrò dati più granulari per prodotto.';
      else if (action === 'cheapest_merchant') text = await finances_cheapest_merchant(filters);
      else if (action === 'price_trend')       text = await finances_price_trend(filters);
      else if (action === 'last_purchase')     text = await finances_last_purchase(filters);
      else if (action === 'category_total')    text = await finances_category_total(filters);
      else if (action === 'category_breakdown')text = await finances_category_breakdown(filters);
      else text = 'Comando finanze non riconosciuto.';
    } else if (domain === 'inventory') {
      if (action === 'out_of_stock')           text = await inv_out_of_stock();
      else if (action === 'low_stock')         text = await inv_low_stock();
      else if (action === 'near_expiry')       text = await inv_near_expiry();
      else if (action === 'stock_status')      text = await inv_stock_status(filters);
      else if (action === 'consumption_rate')  text = await inv_consumption_rate(filters);
      else if (action === 'runout_eta')        text = await inv_runout_eta(filters);
      else if (action === 'shopping_recommendations') text = await inv_shopping_recommendations();
      else text = 'Comando scorte non riconosciuto.';
    } else if (domain === 'lists') {
      if (action === 'show_list')              text = await lists_show(filters);
      else if (action === 'add_to_list')       text = await lists_add(filters);
      else if (action === 'remove_from_list')  text = await lists_remove(filters);
      else text = 'Comando liste non riconosciuto.';
    } else {
      text = 'Posso aiutarti su spese (“quanto ho speso…”), scorte (“cosa manca a casa?”) e liste (“mostra lista supermercato”).';
    }

    res.status(200).json({ ok:true, result: text });
  } catch (err) {
    console.error('analytics error', err);
    res.status(200).json({ ok:false, result:'Si è verificato un errore durante l’interrogazione.' });
  }
}
