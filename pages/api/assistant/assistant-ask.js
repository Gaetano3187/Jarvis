// /pages/api/assistant-ask.js
import { createClient } from '@supabase/supabase-js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID   = process.env.OPENAI_ASSISTANT_ID;
const SUPABASE_URL   = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only

// Supabase server
const sb = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false }})
  : null;

const base = 'https://api.openai.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!OPENAI_API_KEY || !ASSISTANT_ID) { res.status(500).json({ error: 'Assistant not configured' }); return; }
  if (!sb) { res.status(500).json({ error: 'Supabase server client not configured' }); return; }

  const { text, userId, sommelierMemory } = req.body || {};
  try {
    // 1) crea thread
    const thread = await post('/v1/threads', {}, OPENAI_API_KEY);

    // 2) message utente (+ hint opzionale)
    const hint = `USER_ID=${userId || 'anon'}\n${sommelierMemory ? `CARTA_VINI:\n${String(sommelierMemory).slice(0,5000)}\n` : ''}`;
    await post(`/v1/threads/${thread.id}/messages`, {
      role: 'user',
      content: [{ type:'text', text: `${hint}\n\n${text||''}` }],
      metadata: { user_id: userId || 'anon' }
    }, OPENAI_API_KEY);

    // 3) avvia run
    let run = await post(`/v1/threads/${thread.id}/runs`, {
      assistant_id: ASSISTANT_ID
    }, OPENAI_API_KEY);

    // 4) loop: tool-calls / completion
    for (let i = 0; i < 40; i++) {
      await sleep(800);
      run = await get(`/v1/threads/${thread.id}/runs/${run.id}`, OPENAI_API_KEY);

      if (run.status === 'requires_action') {
        const calls = run.required_action?.submit_tool_outputs?.tool_calls || [];
        const outputs = [];
        for (const c of calls) {
          const name = c.function?.name;
          const args = safeParse(c.function?.arguments);
          const out  = await resolveTool(name, args, userId);  // ⬅️ Supabase here
          outputs.push({ tool_call_id: c.id, output: JSON.stringify(out) });
        }
        await post(`/v1/threads/${thread.id}/runs/${run.id}/submit_tool_outputs`, {
          tool_outputs: outputs
        }, OPENAI_API_KEY);
        continue;
      }

      if (run.status === 'completed') {
        const msgs = await get(`/v1/threads/${thread.id}/messages?order=desc&limit=1`, OPENAI_API_KEY);
        const last = msgs.data?.[0];
        const textOut = (last?.content || [])
          .map(p => p?.text?.value)
          .filter(Boolean)
          .join('\n')
          || '(nessuna risposta)';
        return res.status(200).json({ text: textOut, mono: true });
      }

      if (['failed','expired','cancelled'].includes(run.status)) {
        return res.status(200).json({ text: `❌ Assistant: ${run.status}`, mono: true });
      }
    }

    return res.status(200).json({ text: '❌ Assistant timeout', mono: true });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}

/* -------------------- OpenAI helpers -------------------- */
async function post(path, body, key) {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify(body || {})
  });
  const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || r.statusText); return j;
}
async function get(path, key) {
  const r = await fetch(`${base}${path}`, {
    headers: { 'Authorization': `Bearer ${key}`, 'OpenAI-Beta': 'assistants=v2' }
  });
  const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || r.statusText); return j;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safeParse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

/* -------------------- Date bounds -------------------- */
function bounds(ref = 'month') {
  const now = new Date(); const iso = d => d.toISOString().slice(0,10);
  if (ref === 'today') { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return { start: iso(d), end: iso(d), label: 'oggi' }; }
  if (ref === 'week')  { const day = now.getDay(); const delta = (day===0?-6:1-day); const s = new Date(now.getFullYear(), now.getMonth(), now.getDate()+delta); const e = new Date(s.getFullYear(), s.getMonth(), s.getDate()+6); return { start: iso(s), end: iso(e), label: 'questa settimana' }; }
  if (ref === 'year')  { const s = new Date(now.getFullYear(), 0, 1), e = new Date(now.getFullYear(), 11, 31); return { start: iso(s), end: iso(e), label: "quest'anno" }; }
  const s = new Date(now.getFullYear(), now.getMonth(), 1), e = new Date(now.getFullYear(), now.getMonth()+1, 0); return { start: iso(s), end: iso(e), label: 'questo mese' };
}

/* -------------------- Tool resolver (Supabase) -------------------- */
async function resolveTool(name, args, userId) {
  switch (name) {
    case 'spend_sum':            return toolSpendSum(userId, args);
    case 'spend_top_products':   return toolSpendTopProducts(userId, args);
    case 'price_trend':          return toolPriceTrend(userId, args);
    case 'price_best_store':     return toolPriceBestStore(userId, args);
    case 'stock_snapshot':       return toolStockSnapshot(userId);
    case 'shopping_read':        return toolShoppingRead(userId);
    default: return { error: `Unknown tool ${name}` };
  }
}

/* ========= SPESA: somma autoritativa (HEAD) ========= */
async function toolSpendSum(uid, { ref='month' } = {}) {
  const { start, end, label } = bounds(ref);

  // 1) HEAD dal ledger (link_label|link_path not null)
  let { data: finLed } = await sb
    .from('jarvis_finances')
    .select('receipt_id, store, purchase_date, price_total, link_label, link_path')
    .eq('user_id', uid)
    .gte('purchase_date', start)
    .lte('purchase_date', end)
    .or('not.link_label.is.null,not.link_path.is.null');

  let rows = Array.isArray(finLed) ? finLed : [];

  // 2) fallback: HEAD categorie
  if (!rows.length) {
    const readCat = async (table, extraSelect = '') => {
      const sel = `receipt_id, store, purchase_date, price_total, ${extraSelect} link_label, link_path`;
      const { data } = await sb
        .from(table)
        .select(sel)
        .eq('user_id', uid)
        .gte('purchase_date', start)
        .lte('purchase_date', end)
        .or('not.link_label.is.null,not.link_path.is.null');
      return Array.isArray(data) ? data : [];
    };
    const sc = await readCat('jarvis_spese_casa', 'doc_total, ');
    const ca = await readCat('jarvis_cene_aperitivi', 'doc_total, ');
    const va = await readCat('jarvis_vestiti_altro', '');
    const vr = await readCat('jarvis_varie', '');
    // normalizza doc_total → price_total se presente
    rows = [...sc, ...ca, ...va, ...vr].map(r => ({ ...r, price_total: Number(r.doc_total ?? r.price_total ?? 0) }));
  }

  // 3) dedupe HEAD: receipt_id o (store+data), tieni MAX come testa
  const byKey = new Map();
  for (const r of rows) {
    const st  = (r.store || 'Punto vendita').trim();
    const dt  = String(r.purchase_date || '');
    const rid = r.receipt_id ? String(r.receipt_id) : null;
    const key = rid ? `rid:${rid}` : `sd:${st.toLowerCase()}|${dt}`;
    const cur = byKey.get(key) || { store: st, total: 0 };
    const val = Number(r.price_total || 0);
    if (val > cur.total) cur.total = val;
    byKey.set(key, cur);
  }

  let total = 0;
  const perStore = new Map();
  for (const { store, total: t } of byKey.values()) {
    total += t; perStore.set(store, (perStore.get(store)||0) + t);
  }
  const top_stores = [...perStore.entries()]
    .sort((a,b)=> b[1]-a[1])
    .slice(0,5)
    .map(([store, amount]) => ({ store, amount }));

  return { start, end, label, total: Number(total.toFixed(2)), transactions: byKey.size, top_stores };
}

/* ========= TOP PRODOTTI ========= */
async function toolSpendTopProducts(uid, { ref='month', limit=10 } = {}) {
  const { start, end } = bounds(ref);
  const { data } = await sb
    .from('jarvis_spese_casa')
    .select('name, price_total, purchase_date')
    .eq('user_id', uid)
    .gte('purchase_date', start)
    .lte('purchase_date', end);

  const rows = Array.isArray(data) ? data : [];
  const agg = new Map();
  for (const r of rows) {
    const k = (r.name || 'PRODOTTO').trim().toUpperCase();
    agg.set(k, (agg.get(k)||0) + Number(r.price_total || 0));
  }
  const items = [...agg.entries()]
    .sort((a,b)=> b[1]-a[1])
    .slice(0, limit)
    .map(([name, amount]) => ({ name, amount: Number(amount.toFixed(2)) }));
  return { items };
}

/* ========= ANDAMENTO PREZZI ========= */
async function toolPriceTrend(uid, { term, months_back=6 } = {}) {
  if (!term || !String(term).trim()) return { term, series: [] };
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - Math.max(1, months_back), 1);
  const startISO = start.toISOString().slice(0,10), endISO = end.toISOString().slice(0,10);

  const { data } = await sb
    .from('jarvis_spese_casa')
    .select('store, name, price_each, purchase_date')
    .eq('user_id', uid)
    .gte('purchase_date', startISO)
    .lte('purchase_date', endISO);

  const rows = (Array.isArray(data) ? data : [])
    .filter(r => (`${r.name||''}`.toLowerCase()).includes(String(term).toLowerCase()));

  const byStoreMonth = new Map(); // store -> month -> [vals]
  for (const r of rows) {
    const st = (r.store || 'Punto vendita').trim();
    const m  = String(r.purchase_date || '').slice(0,7); // YYYY-MM
    const mm = byStoreMonth.get(st) || new Map();
    const arr = mm.get(m) || [];
    if (Number.isFinite(Number(r.price_each))) arr.push(Number(r.price_each));
    mm.set(m, arr); byStoreMonth.set(st, mm);
  }

  const series = [];
  for (const [store, mMap] of byStoreMonth.entries()) {
    const months = [...mMap.keys()].sort();
    const points = months.map(m => {
      const arr = mMap.get(m) || [];
      const avg = arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
      return { x: m, y: Number(avg.toFixed(3)) };
    });
    if (points.length) series.push({ store, points });
  }
  return { term, series };
}

/* ========= DOVE CONVIENE COMPRARE ========= */
async function toolPriceBestStore(uid, { term, days_back=120 } = {}) {
  if (!term || !String(term).trim()) return { term, results: [] };
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Math.max(1, days_back));
  const cutISO = cutoff.toISOString().slice(0,10);

  const { data } = await sb
    .from('jarvis_spese_casa')
    .select('store, name, price_each, purchase_date')
    .eq('user_id', uid)
    .gte('purchase_date', cutISO);

  const rows = (Array.isArray(data) ? data : [])
    .filter(r => (`${r.name||''}`.toLowerCase()).includes(String(term).toLowerCase()));

  const byStore = new Map();
  for (const r of rows) {
    const st = (r.store || 'Punto vendita').trim();
    const arr = byStore.get(st) || [];
    if (Number.isFinite(Number(r.price_each))) arr.push(Number(r.price_each));
    byStore.set(st, arr);
  }

  const results = [...byStore.entries()]
    .map(([store, arr]) => ({ store, n: arr.length, avg: arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : Infinity }))
    .filter(x => x.n > 0)
    .sort((a,b) => a.avg - b.avg)
    .map(x => ({ store: x.store, avg: Number(x.avg.toFixed(3)), n: x.n }));

  return { term, results };
}

/* ========= SCORTE ========= */
async function toolStockSnapshot(uid) {
  // inventory (se usi products serve join; altrimenti elenco grezzo)
  const snap = [];
  // scorte semplice
  const { data: scorte } = await sb
    .from('scorte')
    .select('prodotto, quantita_attuale, data_scadenza')
    .eq('utente_id', uid);
  if (Array.isArray(scorte)) {
    for (const r of scorte) snap.push({
      name: r.prodotto || 'Articolo',
      qty: r.quantita_attuale ?? null,
      unit: 'pz',
      expiry_date: r.data_scadenza || null
    });
  }
  // expiring_items (aggiungi se presenti)
  const { data: exp } = await sb
    .from('expiring_items')
    .select('product_id, qty, unit, expiry_date')
    .eq('user_id', uid);
  if (Array.isArray(exp)) {
    for (const r of exp) snap.push({
      name: r.product_id || 'Item', // senza join products non abbiamo name
      qty: r.qty ?? null,
      unit: r.unit || null,
      expiry_date: r.expiry_date || null
    });
  }
  return { items: snap.slice(0, 50) };
}

/* ========= LISTA SPESA ========= */
async function toolShoppingRead(uid) {
  const out = [];

  // shopping_list tabellare
  const { data: sh } = await sb
    .from('shopping_list')
    .select('name, brand, qty, units_per_pack, unit_label, list_type, category')
    .eq('user_id', uid)
    .order('added_at', { ascending:false });
  if (Array.isArray(sh)) {
    for (const r of sh) {
      out.push({
        name: [r.name, r.brand].filter(Boolean).join(' ').trim() || 'Voce',
        qty: Number(r.qty || 1),
        unit: r.unit_label || 'unità',
        list_type: r.list_type || 'supermercato',
        category: r.category || 'spese-casa'
      });
    }
  }

  // grocery_lists jsonb (se presente)
  const { data: gl } = await sb
    .from('grocery_lists')
    .select('data')
    .eq('user_id', uid)
    .maybeSingle();
  if (gl && gl.data) {
    try {
      const arr = Array.isArray(gl.data?.items) ? gl.data.items : [];
      for (const it of arr) {
        out.push({
          name: String(it.name || it.prodotto || 'Voce'),
          qty: Number(it.qty || it.quantita || 1),
          unit: it.unit || it.unita || 'unità'
        });
      }
    } catch {}
  }

  return { items: out.slice(0, 50), note: out.length ? null : 'Nessuna voce in lista.' };
}
