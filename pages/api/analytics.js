// pages/api/finances/analytics.js
// Endpoint unico per interrogazioni da chat: FINANZE, SCORTE, LISTE.
// Risponde SEMPRE con stringhe pronte all'uso:
//   { ok: true, result: "testo pronto", redirect?: string }

import { createClient } from '@supabase/supabase-js';

/* ================== CONFIG ADATTABILE ================== */
// Imposta i nomi delle tue tabelle/colonne reali qui sotto.
// Se alcune tabelle non esistono, il codice tenta fallback/alternative.

const TBL_EXPENSES = 'expenses';            // spese singole
const COL_EXP_AMOUNT = 'amount';            // NUMERIC/REAL
const COL_EXP_DATE = 'date';                // DATE/TIMESTAMP (YYYY-MM-DD)
const COL_EXP_CATEGORY = 'category';        // TEXT (es. "spese casa", "vestiti", "cene e aperitivi")
const COL_EXP_DESC = 'description';         // TEXT
const COL_EXP_MERCHANT = 'merchant';        // TEXT (se disponibile)

const TBL_EXPENSE_ITEMS = 'expense_items';  // righe prodotto (se esiste)
const COL_ITEM_NAME = 'product_name';       // TEXT
const COL_ITEM_QTY = 'quantity';            // NUMERIC
const COL_ITEM_UNIT = 'unit';               // TEXT (opzionale)
const COL_ITEM_PRICE = 'price';             // NUMERIC
const COL_ITEM_EXP_ID = 'expense_id';       // FK a expenses.id

const TBL_INVENTORY = 'inventory';          // scorte di casa
const COL_INV_NAME = 'product_name';        // TEXT
const COL_INV_RESIDUO = 'residuo_unita';    // NUMERIC (unità residue)
const COL_INV_CONF = 'confezione_unita';    // NUMERIC (unità per confezione)
const COL_INV_UPDATED = 'updated_at';       // TIMESTAMP (per stima consumo)
const COL_INV_EXPIRY = 'expiry_date';       // DATE (opzionale)

const TBL_LISTS = 'shopping_lists';         // liste (supermercato / online)
const COL_LIST_TYPE = 'list_type';          // 'supermercato' | 'online'
const COL_LIST_ID = 'id';

const TBL_LIST_ITEMS = 'shopping_items';
const COL_LIST_ITEM_LIST_ID = 'list_id';
const COL_LIST_ITEM_NAME = 'product_name';

const TBL_MEMORY = 'assistant_memory';      // “apprendimento” (facoltativa)
const COL_MEM_USER = 'user_id';
const COL_MEM_TYPE = 'type';                // 'product_alias' | 'merchant_alias' | 'qa'
const COL_MEM_KEY = 'key';                  // alias oppure utterance
const COL_MEM_VALUE = 'value';              // canonical (per alias) oppure action JSON
const COL_MEM_WEIGHT = 'weight';            // INT
const COL_MEM_UPDATED = 'updated_at';

// Soglie consigli
const LOW_STOCK_THRESHOLD = 0.2; // 20%
const DAYS_TO_EXPIRY = 10;

/* ============== SUPABASE (server-side key) ============== */
// Richiede: process.env.NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // service role per letture aggregate
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

/* ================== HELPERS COMUNI ================== */
const fmtEuro = (n) => {
  if (n == null || Number.isNaN(n)) return '€0,00';
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n));
  } catch { return `€${Number(n).toFixed(2)}`; }
};
const safeDate = (s) => s?.slice?.(0,10) || s;

const withinPeriod = (query, period) => {
  if (period?.start) query.gte(COL_EXP_DATE, period.start);
  if (period?.end) query.lte(COL_EXP_DATE, period.end);
};

function pick(a, ...keys) {
  const o = {};
  keys.forEach(k => { if (a && a[k] != null) o[k] = a[k]; });
  return o;
}

/* ================== “APPRENDIMENTO” ================== */
// Best-effort: se la tabella non esiste, ignora errori
async function learnUtterance(userId, utterance, actionObj) {
  if (!utterance) return;
  try {
    await supabase
      .from(TBL_MEMORY)
      .upsert({
        [COL_MEM_USER]: userId || null,
        [COL_MEM_TYPE]: 'qa',
        [COL_MEM_KEY]: utterance.slice(0, 300),
        [COL_MEM_VALUE]: JSON.stringify(actionObj),
        [COL_MEM_WEIGHT]: 1
      }, { onConflict: [COL_MEM_USER, COL_MEM_TYPE, COL_MEM_KEY].join(',') });
  } catch { /* noop */ }
}

// In un secondo step potresti leggere gli alias qui e arricchire il parser client.

/* ================== DOMAIN: FINANZE ================== */

async function finances_total_spent(filters) {
  let q = supabase.from(TBL_EXPENSES).select(`sum:${COL_EXP_AMOUNT}`, { head: false, count: 'exact' });
  if (filters?.period) withinPeriod(q, filters.period);
  const { data, error } = await q;
  if (error) throw error;
  const sum = data?.[0]?.sum || 0;
  const label = labelPeriod(filters?.period);
  return `Hai speso ${fmtEuro(sum)} ${label}.`;
}

async function finances_category_total(filters) {
  if (!filters?.category) return 'Specifica una categoria (es. "spese casa").';
  let q = supabase.from(TBL_EXPENSES)
    .select(`sum:${COL_EXP_AMOUNT}`)
    .eq(COL_EXP_CATEGORY, filters.category);
  if (filters?.period) withinPeriod(q, filters.period);
  const { data, error } = await q;
  if (error) throw error;
  const sum = data?.[0]?.sum || 0;
  const label = labelPeriod(filters?.period);
  return `Nella categoria “${filters.category}” hai speso ${fmtEuro(sum)} ${label}.`;
}

async function finances_category_breakdown(filters) {
  if (!filters?.category) return 'Specifica una categoria.';
  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_DATE}, ${COL_EXP_AMOUNT}, ${COL_EXP_DESC}, ${COL_EXP_MERCHANT}`)
    .eq(COL_EXP_CATEGORY, filters.category)
    .order(COL_EXP_DATE, { ascending: false })
    .limit(20);
  if (filters?.period) withinPeriod(q, filters.period);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return `Nessuna spesa per “${filters.category}” nel periodo richiesto.`;
  const lines = data.map(r => {
    const d = safeDate(r[COL_EXP_DATE]);
    const m = r[COL_EXP_MERCHANT] ? ` @ ${r[COL_EXP_MERCHANT]}` : '';
    return `• ${d}: ${fmtEuro(r[COL_EXP_AMOUNT])}${m} – ${r[COL_EXP_DESC] || ''}`.trim();
  });
  return `Dettaglio “${filters.category}” (ultime 20):\n` + lines.join('\n');
}

async function finances_products_purchased(filters) {
  // Se hai expense_items usa quelli; altrimenti estrai dai description
  // Tentativo con expense_items
  let q = supabase.from(TBL_EXPENSE_ITEMS)
    .select(`${COL_ITEM_NAME}, sum:${COL_ITEM_QTY}`)
    .group(COL_ITEM_NAME)
    .order('sum', { ascending: false })
    .limit(20);
  if (filters?.period) {
    // join virtuale: filtra via expenses se possibile
    // In assenza di view/materialized, facciamo due step
    // 1) prendi expense_ids nel periodo
    const expQ = supabase.from(TBL_EXPENSES).select('id');
    withinPeriod(expQ, filters.period);
    const { data: expIds, error: e1 } = await expQ;
    if (!e1 && expIds?.length) {
      const ids = expIds.map(x => x.id);
      q = q.in(COL_ITEM_EXP_ID, ids);
    }
  }
  const { data, error } = await q;
  if (!error && data?.length) {
    const lines = data.map(r => `• ${r[COL_ITEM_NAME]} (qty: ${r.sum})`);
    const label = labelPeriod(filters?.period);
    return `Prodotti acquistati ${label} (top 20):\n` + lines.join('\n');
  }

  // Fallback su descrizioni spese
  let q2 = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_DESC}`)
    .not(COL_EXP_DESC, 'is', null)
    .order(COL_EXP_DATE, { ascending: false })
    .limit(200);
  if (filters?.period) withinPeriod(q2, filters.period);
  const { data: d2, error: e2 } = await q2;
  if (e2) throw e2;
  if (!d2?.length) return 'Non trovo prodotti nel periodo richiesto.';
  // Estrazione naive parole “tipo prodotto”
  const freq = Object.create(null);
  for (const r of d2) {
    const words = String(r[COL_EXP_DESC] || '').toLowerCase().match(/[a-zàèéìòóù0-9]+/g) || [];
    for (const w of words) {
      if (w.length < 4) continue;
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const lines = top.map(([k,v]) => `• ${k} (${v})`);
  const label = labelPeriod(filters?.period);
  return `Prodotti ricorrenti nelle descrizioni ${label}:\n` + lines.join('\n');
}

async function finances_cheapest_merchant(filters) {
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi il prodotto (es. “prosciutto San Daniele”).';

  // Se hai expense_items: cerca righe contenenti il prodotto nel nome
  const expItemQ = supabase.from(TBL_EXPENSE_ITEMS)
    .select(`${COL_ITEM_PRICE}, ${COL_ITEM_NAME}, ${COL_ITEM_EXP_ID}`)
    .ilike(COL_ITEM_NAME, `%${product}%`)
    .order(COL_ITEM_PRICE, { ascending: true })
    .limit(1);
  const { data: di, error: ei } = await expItemQ;
  if (!ei && di?.length) {
    // recupera merchant da expenses
    const { data: exp } = await supabase.from(TBL_EXPENSES)
      .select(`id, ${COL_EXP_MERCHANT}, ${COL_EXP_DATE}`)
      .eq('id', di[0][COL_ITEM_EXP_ID]).single();
    const price = di[0][COL_ITEM_PRICE];
    const shop = exp?.[COL_EXP_MERCHANT] || 'esercizio non registrato';
    const when = exp?.[COL_EXP_DATE] ? ` il ${safeDate(exp[COL_EXP_DATE])}` : '';
    return `Il prezzo più basso per “${product}” è ${fmtEuro(price)} da ${shop}${when}.`;
  }

  // Fallback: cerca nel testo descrizione
  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_AMOUNT}, ${COL_EXP_DESC}, ${COL_EXP_MERCHANT}, ${COL_EXP_DATE}`)
    .ilike(COL_EXP_DESC, `%${product}%`)
    .order(COL_EXP_AMOUNT, { ascending: true })
    .limit(1);
  if (filters?.period) withinPeriod(q, filters.period);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return `Non ho trovato acquisti di “${product}” nel periodo richiesto.`;
  const r = data[0];
  const shop = r[COL_EXP_MERCHANT] || 'esercizio non registrato';
  const when = r[COL_EXP_DATE] ? ` il ${safeDate(r[COL_EXP_DATE])}` : '';
  return `Il prezzo più basso per “${product}” è ${fmtEuro(r[COL_EXP_AMOUNT])} da ${shop}${when}.`;
}

async function finances_price_trend(filters) {
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi il prodotto di cui vuoi il trend prezzo.';
  // Fallback semplice: ultimi 10 acquisti
  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_AMOUNT}, ${COL_EXP_DATE}, ${COL_EXP_DESC}, ${COL_EXP_MERCHANT}`)
    .ilike(COL_EXP_DESC, `%${product}%`)
    .order(COL_EXP_DATE, { ascending: true })
    .limit(10);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return `Non ho trovato acquisti di “${product}”.`;
  const lines = data.map(r => `• ${safeDate(r[COL_EXP_DATE])}: ${fmtEuro(r[COL_EXP_AMOUNT])} @ ${r[COL_EXP_MERCHANT] || 'N/D'}`);
  return `Trend prezzo per “${product}” (ultimi ${data.length}):\n` + lines.join('\n');
}

async function finances_last_purchase(filters) {
  const product = filters?.product?.trim();
  if (!product) return 'Dimmi il prodotto (es. “mozzarella”).';
  let q = supabase.from(TBL_EXPENSES)
    .select(`${COL_EXP_AMOUNT}, ${COL_EXP_DATE}, ${COL_EXP_DESC}, ${COL_EXP_MERCHANT}`)
    .ilike(COL_EXP_DESC, `%${product}%`)
    .order(COL_EXP_DATE, { ascending: false })
    .limit(1);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return `Nessun acquisto recente di “${product}”.`;
  const r = data[0];
  return `Ultimo acquisto “${product}”: ${fmtEuro(r[COL_EXP_AMOUNT])} il ${safeDate(r[COL_EXP_DATE])} @ ${r[COL_EXP_MERCHANT] || 'N/D'}.`;
}

/* ================== DOMAIN: INVENTORY (SCORTE) ================== */

async function inv_low_stock() {
  // residuo < 20% della confezione
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
    .select(`${COL_INV_NAME}, ${COL_INV_RESIDUO}, ${COL_INV_CONF}`)
    .order(COL_INV_NAME, { ascending: true });
  if (error) throw error;
  const rows = (data || []).filter(r => Number(r[COL_INV_RESIDUO] || 0) <= 0);
  if (!rows.length) return 'Nessun prodotto esaurito.';
  return 'Esauriti:\n' + rows.map(r => `• ${r[COL_INV_NAME]}`).join('\n');
}

async function inv_near_expiry() {
  const today = new Date();
  const lim = new Date(today); lim.setDate(today.getDate() + DAYS_TO_
