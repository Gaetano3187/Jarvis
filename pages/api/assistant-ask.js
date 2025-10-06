// pages/api/assistant-ask.js
import { createClient } from '@supabase/supabase-js';

/* ─────────────────────────── UTIL HOISTED ─────────────────────────── */
// (hoisted) così è disponibile ovunque, anche dentro oaPost/oaGet
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeParse(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }

/* ─────────────────────────── ENV / CLIENT ─────────────────────────── */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID   = process.env.OPENAI_ASSISTANT_ID;
const SUPABASE_URL   = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only

const sb = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;

const OA_BASE = 'https://api.openai.com';

/* ─────────────────────────── OpenAI helpers ROBUSTI ─────────────────────────── */
async function oaPost(path, body, key, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${OA_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify(body || {})
      });
      const raw = await r.text();
      let j = null; try { j = JSON.parse(raw); } catch {}
      if (!r.ok) {
        const msg = j?.error?.message || raw?.slice(0, 500) || r.statusText;
        throw new Error(`OpenAI POST ${path} ${r.status}: ${msg}`);
      }
      if (!j) throw new Error(`OpenAI POST ${path}: risposta non JSON: ${raw?.slice(0,500)}`);
      return j;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(400 * (i + 1));
    }
  }
}

async function oaGet(path, key, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${OA_BASE}${path}`, {
        headers: { 'Authorization': `Bearer ${key}`, 'OpenAI-Beta': 'assistants=v2' }
      });
      const raw = await r.text();
      let j = null; try { j = JSON.parse(raw); } catch {}
      if (!r.ok) {
        const msg = j?.error?.message || raw?.slice(0,500) || r.statusText;
        throw new Error(`OpenAI GET ${path} ${r.status}: ${msg}`);
      }
      if (!j) throw new Error(`OpenAI GET ${path}: risposta non JSON: ${raw?.slice(0,500)}`);
      return j;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(400 * (i + 1));
    }
  }
}

/* ─────────────────────────── HANDLER ─────────────────────────── */
export default async function handler(req, res) {
  // CORS / preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error:'Method not allowed. Use POST.' });
  }
  if (!OPENAI_API_KEY || !ASSISTANT_ID) {
    console.error('[assistant-ask] missing OpenAI keys');
    return res.status(500).json({ error: 'Assistant not configured' });
  }
  if (!sb) {
    console.error('[assistant-ask] missing Supabase server client');
    return res.status(500).json({ error: 'Supabase server client not configured' });
  }

  const { text, userId, sommelierMemory } = req.body || {};
  try {
    // 1) thread
    const thread = await oaPost('/v1/threads', {}, OPENAI_API_KEY);

    // 2) messaggio utente (+ hint opzionale)
    const hint = `USER_ID=${userId || 'anon'}\n` +
      (sommelierMemory ? `CARTA_VINI:\n${String(sommelierMemory).slice(0,5000)}\n` : '');
    await oaPost(`/v1/threads/${thread.id}/messages`, {
      role: 'user',
      content: [{ type:'text', text: `${hint}\n\n${text || ''}` }],
      metadata: { user_id: userId || 'anon' }
    }, OPENAI_API_KEY);

    // 3) run
    let run = await oaPost(`/v1/threads/${thread.id}/runs`, { assistant_id: ASSISTANT_ID }, OPENAI_API_KEY);

    // 4) loop: tool-calls / completion
    for (let i = 0; i < 48; i++) {
      await sleep(800);
      run = await oaGet(`/v1/threads/${thread.id}/runs/${run.id}`, OPENAI_API_KEY);

      if (run.status === 'requires_action') {
        const calls = run.required_action?.submit_tool_outputs?.tool_calls || [];
        console.log('[assistant-ask] tool-calls:',
          calls.map(c => ({ name:c.function?.name, args:c.function?.arguments?.slice?.(0,200) })));
        const outputs = [];
        for (const c of calls) {
          const name = c.function?.name;
          const args = safeParse(c.function?.arguments);
          let out = null;
          try {
            out = await resolveTool(name, args, userId);
          } catch (e) {
            console.error(`[assistant-ask] tool ${name} failed`, e);
            out = { error: String(e?.message || e), tool: name };
          }
          outputs.push({ tool_call_id: c.id, output: JSON.stringify(out) });
        }
        await oaPost(`/v1/threads/${thread.id}/runs/${run.id}/submit_tool_outputs`, {
          tool_outputs: outputs
        }, OPENAI_API_KEY);
        continue;
      }

      if (run.status === 'completed') {
        const msgs = await oaGet(`/v1/threads/${thread.id}/messages?order=desc&limit=1`, OPENAI_API_KEY);
        const last = msgs.data?.[0];
        const textOut = (last?.content || [])
          .map(p => p?.text?.value).filter(Boolean).join('\n') || '(nessuna risposta)';
        console.log('[assistant-ask] final message:', textOut?.slice?.(0,500));
        return res.status(200).json({ text: textOut, mono: true });
      }

      if (['failed','expired','cancelled'].includes(run.status)) {
        return res.status(200).json({ text: `❌ Assistant: ${run.status}`, mono: true });
      }
    }

    return res.status(200).json({ text: '❌ Assistant timeout', mono: true });
  } catch (e) {
    console.error('[assistant-ask] fatal', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}

/* ─────────────────────────── Date bounds / HEAD helpers ─────────────────────────── */
function bounds(ref = 'month') {
  const now = new Date(); const iso = d => d.toISOString().slice(0,10);
  if (ref === 'today') { const d = new Date(now.getFullYear(),now.getMonth(),now.getDate()); return { start: iso(d), end: iso(d), label:'oggi' }; }
  if (ref === 'week')  { const day=now.getDay(); const delta=(day===0?-6:1-day); const s=new Date(now.getFullYear(),now.getMonth(),now.getDate()+delta); const e=new Date(s.getFullYear(),s.getMonth(),s.getDate()+6); return { start: iso(s), end: iso(e), label:'questa settimana' }; }
  if (ref === 'year')  { const s = new Date(now.getFullYear(),0,1), e = new Date(now.getFullYear(),11,31); return { start: iso(s), end: iso(e), label:"quest'anno" }; }
  const s = new Date(now.getFullYear(),now.getMonth(),1), e = new Date(now.getFullYear(),now.getMonth()+1,0);
  return { start: iso(s), end: iso(e), label:'questo mese' };
}

// ledger (HEAD) → categorie (HEAD/doc_total) → categorie TUTTE LE RIGHE (dedupe MAX)
// → Fallback legacy: jarvis_finanze → Fallback generico: finances
async function getHeads(uid, start, end) {
  // 1) HEAD dal ledger (link_* non null)
  const { data: led } = await sb
    .from('jarvis_finances')
    .select('receipt_id, store, purchase_date, price_total, link_label, link_path')
    .eq('user_id', uid)
    .gte('purchase_date', start)
    .lte('purchase_date', end)
    .or('not.link_label.is.null,not.link_path.is.null');

  let rows = Array.isArray(led) ? led : [];

  // 2) HEAD dalle categorie (preferisci doc_total)
  if (!rows.length) {
    const getCatHead = async (table, hasDoc) => {
      const sel = hasDoc
        ? 'receipt_id, store, purchase_date, doc_total, price_total, link_label, link_path'
        : 'receipt_id, store, purchase_date, price_total, link_label, link_path';
      const { data } = await sb
        .from(table)
        .select(sel)
        .eq('user_id', uid)
        .gte('purchase_date', start)
        .lte('purchase_date', end)
        .or('not.link_label.is.null,not.link_path.is.null');
      const arr = Array.isArray(data) ? data : [];
      return arr.map(r => ({
        ...r,
        price_total: Number((hasDoc ? (r.doc_total ?? r.price_total) : r.price_total) || 0)
      }));
    };
    const sc = await getCatHead('jarvis_spese_casa',     true);
    const ca = await getCatHead('jarvis_cene_aperitivi', true);
    const va = await getCatHead('jarvis_vestiti_altro',  false);
    const vr = await getCatHead('jarvis_varie',          false);
    rows = [...sc, ...ca, ...va, ...vr];
  }

  // 3) SE ANCORA VUOTO: categorie TUTTE LE RIGHE (no link_*), dedupe MAX per chiave
  if (!rows.length) {
    const getCatAll = async (table, hasDoc) => {
      const sel = hasDoc
        ? 'receipt_id, store, purchase_date, doc_total, price_total'
        : 'receipt_id, store, purchase_date, price_total';
      const { data } = await sb
        .from(table)
        .select(sel)
        .eq('user_id', uid)
        .gte('purchase_date', start)
        .lte('purchase_date', end);
      const arr = Array.isArray(data) ? data : [];
      return arr.map(r => ({
        receipt_id: r.receipt_id || null,
        store: (r.store || '').trim(),
        purchase_date: r.purchase_date,
        price_total: Number((hasDoc ? (r.doc_total ?? r.price_total) : r.price_total) || 0)
      }));
    };
    const scAll = await getCatAll('jarvis_spese_casa',     true);
    const caAll = await getCatAll('jarvis_cene_aperitivi', true);
    const vaAll = await getCatAll('jarvis_vestiti_altro',  false);
    const vrAll = await getCatAll('jarvis_varie',          false);
    rows = [...scAll, ...caAll, ...vaAll, ...vrAll];
  }

  // 4) FALLBACK LEGACY: jarvis_finanze (un movimento = una “testa”)
  if (!rows.length) {
    const { data: jf } = await sb
      .from('jarvis_finanze')
      .select('id, date, amount, description')
      .eq('user_id', uid)
      .gte('date', start)
      .lte('date', end);
    if (Array.isArray(jf) && jf.length) {
      const mapped = jf
        .filter(r => Number(r.amount || 0) > 0)
        .map(r => ({
          receipt_id: `finz:${r.id}`,                       // chiave univoca → non collide in dedupe
          store: (r.description || 'Finanze').trim(),       // etichetta di comodo
          purchase_date: r.date,
          price_total: Number(r.amount || 0)
        }));
      rows = mapped;
    }
  }

  // 5) FALLBACK GENERICO: finances (registro generico)
  if (!rows.length) {
    const { data: fin } = await sb
      .from('finances')
      .select('id, amount, spent_date, spent_at, store_name, categoria')
      .eq('user_id', uid)
      .or(`and(spent_date.gte.${start},spent_date.lte.${end}),and(spent_at.gte.${start},spent_at.lte.${end})`);
    if (Array.isArray(fin) && fin.length) {
      const mapped = fin
        .filter(r => Number(r.amount || 0) > 0) // somma solo uscite
        .map(r => ({
          receipt_id: `fin:${r.id}`,                        // chiave univoca → non collide in dedupe
          store: (r.store_name || r.categoria || 'Finanze').trim(),
          purchase_date: r.spent_date || (r.spent_at ? String(r.spent_at).slice(0,10) : null),
          price_total: Number(r.amount || 0)
        }))
        .filter(r => !!r.purchase_date && r.purchase_date >= start && r.purchase_date <= end);
      rows = mapped;
    }
  }

  // 6) DEDUPE: receipt_id oppure (store+date) → tieni il MAX come “testa”
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

  return [...byKey.values()];
}


/* ─────────────────────────── TOOL ROUTER ─────────────────────────── */
async function resolveTool(name, args, userId) {
  switch (name) {
    case 'spend_sum':            return toolSpendSum(userId, args);
    case 'spend_top_products':   return toolSpendTopProducts(userId, args);
    case 'price_trend':          return toolPriceTrend(userId, args);
    case 'price_best_store':     return toolPriceBestStore(userId, args);
    case 'stock_snapshot':       return toolStockSnapshot(userId);
    case 'stock_expiring':       return toolStockExpiring(userId, args);
    case 'shopping_read':        return toolShoppingRead(userId);
    case 'shopping_add':         return toolShoppingAdd(userId, args);
    case 'income_sum':           return toolIncomeSum(userId, args);
    case 'finance_balance':      return toolFinanceBalance(userId, args);
    case 'pocket_cash_summary':  return toolPocketCashSummary(userId, args);
    case 'pocket_cash_add':      return toolPocketCashAdd(userId, args);
    case 'cellar_summary':       return toolCellarSummary(userId);
    case 'cellar_window':        return toolCellarWindow(userId, args);
    case 'artisan_search':       return toolArtisanSearch(userId, args);
    case 'product_places':       return toolProductPlaces(userId, args);
    case 'offers_search':        return toolOffersSearch(userId, args);
    case 'memory_set':           return toolMemorySet(userId, args);
    case 'memory_get':           return toolMemoryGet(userId, args);
    default: return { error:`Unknown tool ${name}` };
  }
}

/* ─────────────── SPESA: somma autoritativa (HEAD) ─────────────── */
async function toolSpendSum(uid, { ref='month' } = {}) {
  const { start, end, label } = bounds(ref);
  const heads = await getHeads(uid, start, end);
  let total = 0; const perStore = new Map();
  for (const h of heads) { total += h.total; perStore.set(h.store, (perStore.get(h.store)||0) + h.total); }
  const top_stores = [...perStore.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([store,amount])=>({ store, amount:Number(amount.toFixed(2)) }));
  return { start, end, label, total: Number(total.toFixed(2)), transactions: heads.length, top_stores };
}

/* ─────────────── TOP PRODOTTI ─────────────── */
async function toolSpendTopProducts(uid, { ref='month', limit=10 } = {}) {
  const { start, end } = bounds(ref);
  const { data } = await sb
    .from('jarvis_spese_casa')
    .select('name, price_total, purchase_date')
    .eq('user_id', uid).gte('purchase_date', start).lte('purchase_date', end);
  const rows = Array.isArray(data)?data:[];
  const agg = new Map();
  for (const r of rows) {
    const k=(r.name||'PRODOTTO').trim().toUpperCase();
    agg.set(k, (agg.get(k)||0)+Number(r.price_total||0));
  }
  const items = [...agg.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit)
    .map(([name,amount])=>({ name, amount:Number(amount.toFixed(2)) }));
  return { items };
}

/* ─────────────── ANDAMENTO PREZZI ─────────────── */
async function toolPriceTrend(uid, { term, months_back=6 } = {}) {
  if (!term || !String(term).trim()) return { term, series: [] };
  const end = new Date(); const start = new Date(end.getFullYear(), end.getMonth()-Math.max(1,months_back), 1);
  const startISO = start.toISOString().slice(0,10), endISO = end.toISOString().slice(0,10);
  const { data } = await sb
    .from('jarvis_spese_casa')
    .select('store, name, price_each, purchase_date')
    .eq('user_id', uid).gte('purchase_date', startISO).lte('purchase_date', endISO);
  const rows = (Array.isArray(data)?data:[])
    .filter(r => (`${r.name||''}`.toLowerCase()).includes(String(term).toLowerCase()));
  const byStoreMonth = new Map();
  for (const r of rows) {
    const st=(r.store||'Punto vendita').trim(); const m=String(r.purchase_date||'').slice(0,7);
    const map=byStoreMonth.get(st)||new Map(); const arr=map.get(m)||[];
    if (Number.isFinite(Number(r.price_each))) arr.push(Number(r.price_each));
    map.set(m,arr); byStoreMonth.set(st,map);
  }
  const series = [];
  for (const [store, mm] of byStoreMonth.entries()) {
    const months=[...mm.keys()].sort();
    const points = months.map(m=>{
      const arr=mm.get(m)||[]; const avg=arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
      return { x:m, y:Number(avg.toFixed(3)) };
    });
    if (points.length) series.push({ store, points });
  }
  return { term, series };
}

/* ─────────────── DOVE CONVIENE COMPRARE ─────────────── */
async function toolPriceBestStore(uid, { term, days_back=120 } = {}) {
  if (!term || !String(term).trim()) return { term, results: [] };
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-Math.max(1,days_back));
  const cutISO=cutoff.toISOString().slice(0,10);
  const { data } = await sb
    .from('jarvis_spese_casa')
    .select('store, name, price_each, purchase_date')
    .eq('user_id', uid).gte('purchase_date', cutISO);
  const rows=(Array.isArray(data)?data:[])
    .filter(r => (`${r.name||''}`.toLowerCase()).includes(String(term).toLowerCase()));
  const byStore=new Map();
  for (const r of rows) {
    const st=(r.store||'Punto vendita').trim(); const arr=byStore.get(st)||[];
    if (Number.isFinite(Number(r.price_each))) arr.push(Number(r.price_each));
    byStore.set(st,arr);
  }
  const results=[...byStore.entries()]
    .map(([store,arr]) => ({ store, n:arr.length, avg:arr.length?(arr.reduce((a,b)=>a+b,0)/arr.length):Infinity }))
    .filter(x=>x.n>0).sort((a,b)=>a.avg-b.avg)
    .map(x=>({ store:x.store, avg:Number(x.avg.toFixed(3)), n:x.n }));
  return { term, results };
}

/* ─────────────── SCORTE ─────────────── */
async function toolStockSnapshot(uid) {
  const out=[];
  const { data: scorte } = await sb.from('scorte')
    .select('prodotto, quantita_attuale, data_scadenza').eq('utente_id', uid);
  if (Array.isArray(scorte)) for (const r of scorte)
    out.push({ name:r.prodotto||'Articolo', qty:r.quantita_attuale??null, unit:'pz', expiry_date:r.data_scadenza||null });

  const { data: inv } = await sb.from('inventory')
    .select('product_id, qty, unit, expiry_date').eq('user_id', uid);
  if (Array.isArray(inv)) for (const r of inv)
    out.push({ name:r.product_id||'Item', qty:r.qty??null, unit:r.unit||null, expiry_date:r.expiry_date||null });

  const { data: exp } = await sb.from('expiring_items')
    .select('product_id, qty, unit, expiry_date').eq('user_id', uid);
  if (Array.isArray(exp)) for (const r of exp)
    out.push({ name:r.product_id||'Item', qty:r.qty??null, unit:r.unit||null, expiry_date:r.expiry_date||null });

  return { items: out.slice(0,50) };
}

async function toolStockExpiring(uid, { days_ahead=7 } = {}) {
  const today=new Date(); const lim=new Date(today); lim.setDate(lim.getDate()+Math.max(1,days_ahead));
  const tISO=today.toISOString().slice(0,10); const lISO=lim.toISOString().slice(0,10);
  const out=[];
  const { data: exp } = await sb.from('expiring_items')
    .select('product_id, qty, unit, expiry_date').eq('user_id', uid)
    .gte('expiry_date', tISO).lte('expiry_date', lISO);
  if (Array.isArray(exp)) for (const r of exp) out.push({ name:r.product_id||'Item', qty:r.qty??null, unit:r.unit||null, expiry_date:r.expiry_date });

  const { data: inv } = await sb.from('inventory')
    .select('product_id, qty, unit, expiry_date').eq('user_id', uid)
    .gte('expiry_date', tISO).lte('expiry_date', lISO);
  if (Array.isArray(inv)) for (const r of inv) out.push({ name:r.product_id||'Item', qty:r.qty??null, unit:r.unit||null, expiry_date:r.expiry_date });

  const { data: sc } = await sb.from('scorte')
    .select('prodotto, quantita_attuale, data_scadenza').eq('utente_id', uid)
    .gte('data_scadenza', tISO).lte('data_scadenza', lISO);
  if (Array.isArray(sc)) for (const r of sc) out.push({ name:r.prodotto||'Articolo', qty:r.quantita_attuale??null, unit:'pz', expiry_date:r.data_scadenza });

  for (const it of out) if (it.expiry_date) {
    const d=new Date(it.expiry_date); it.days_left=Math.ceil((d - today)/86400000);
  }
  return { items: out.slice(0,50) };
}

/* ─────────────── LISTA SPESA ─────────────── */
async function toolShoppingRead(uid) {
  const out=[];
  const { data: sh } = await sb.from('shopping_list')
    .select('name, brand, qty, units_per_pack, unit_label, list_type, category')
    .eq('user_id', uid).order('added_at', { ascending:false });
  if (Array.isArray(sh)) for (const r of sh) out.push({
    name:[r.name,r.brand].filter(Boolean).join(' ').trim()||'Voce',
    qty:Number(r.qty||1), unit:r.unit_label||'unità', list_type:r.list_type||'supermercato', category:r.category||'spese-casa'
  });

  const { data: li } = await sb.from('list_items')
    .select('product_id, qty, unit, store_name, expiry_date').eq('user_id', uid);
  if (Array.isArray(li)) for (const r of li) out.push({
    name:r.product_id||'Item', qty:Number(r.qty||1), unit:r.unit||'unità', store:r.store_name||null, expiry_date:r.expiry_date||null
  });

  const { data: gl } = await sb.from('grocery_lists').select('data').eq('user_id', uid).maybeSingle();
  if (gl && gl.data) {
    try {
      const arr=Array.isArray(gl.data?.items)?gl.data.items:[];
      for (const it of arr) out.push({ name:String(it.name||it.prodotto||'Voce'), qty:Number(it.qty||it.quantita||1), unit:it.unit||it.unita||'unità' });
    } catch {}
  }
  return { items: out.slice(0,50), note: out.length ? null : 'Nessuna voce in lista.' };
}

async function toolShoppingAdd(uid, { name, qty=1, brand=null, unit='unità' } = {}) {
  if (!name || !String(name).trim()) return { ok:false, error:'name required' };
  const { error } = await sb.from('shopping_list').insert({
    user_id: uid, name: String(name).trim(), brand: brand||'', qty, units_per_pack: 1, unit_label: unit, list_type:'supermercato', category:'spese-casa'
  });
  if (error) return { ok:false, error: error.message || String(error) };
  return { ok:true };
}

/* ─────────────── ENTRATE / BILANCIO ─────────────── */
async function toolIncomeSum(uid, { ref='month' } = {}) {
  const { start, end } = bounds(ref);
  const { data } = await sb.from('incomes')
    .select('amount, received_at, received_date').eq('user_id', uid)
    .or(`and(received_date.gte.${start},received_date.lte.${end}),and(received_at.gte.${start},received_at.lte.${end})`);
  const rows = Array.isArray(data)?data:[];
  const total = rows.reduce((t,r)=>t+Number(r.amount||0),0);
  return { start, end, total:Number(total.toFixed(2)), txs: rows.length };
}

async function toolFinanceBalance(uid, { ref='month' } = {}) {
  const { start, end } = bounds(ref);
  const inc = await toolIncomeSum(uid, { ref });
  const monthKey = end.slice(0,7);
  const { data: co } = await sb.from('carryovers').select('amount').eq('user_id', uid).eq('month_key', monthKey).maybeSingle();
  const carry = Number(co?.amount || 0);
  const spend = await toolSpendSum(uid, { ref });
  const balance = inc.total + carry - spend.total;
  return { start, end, income:inc.total, carryover:carry, spend_head:spend.total, balance:Number(balance.toFixed(2)) };
}

/* ─────────────── POCKET CASH ─────────────── */
async function toolPocketCashSummary(uid, { ref='month' } = {}) {
  const { start, end } = bounds(ref);
  const { data } = await sb.from('pocket_cash')
    .select('delta, amount, direction, moved_date').eq('user_id', uid).gte('moved_date', start).lte('moved_date', end);
  const rows = Array.isArray(data)?data:[];
  let ins=0, outs=0;
  for (const r of rows) {
    const d=(r.delta!=null)?Number(r.delta||0):(r.amount!=null?((r.direction==='in')?+1:-1)*Number(r.amount||0):0);
    if (d>0) ins+=d; else outs+=d;
  }
  return { net:Number((ins+outs).toFixed(2)), ins:Number(ins.toFixed(2)), outs:Number(outs.toFixed(2)) };
}

async function toolPocketCashAdd(uid, { delta, date=null, note=null } = {}) {
  if (delta==null) return { ok:false, error:'delta required' };
  const moved_date = date || new Date().toISOString().slice(0,10);
  const payload = { user_id: uid, delta: Number(delta), moved_at: `${moved_date}T12:00:00Z`, moved_date, note: note || null };
  const { error } = await sb.from('pocket_cash').insert(payload);
  if (error) return { ok:false, error: error.message || String(error) };
  return { ok:true };
}

/* ─────────────── CANTINA ─────────────── */
async function toolCellarSummary(uid) {
  const { data } = await sb.from('cellar').select('bottles').eq('user_id', uid);
  const rows = Array.isArray(data)?data:[];
  const bottles = rows.reduce((t,r)=>t + Number(r.bottles||0),0);
  return { bottles };
}

async function toolCellarWindow(uid, { days_ahead=90 } = {}) {
  const today=new Date(); const to=new Date(today); to.setDate(to.getDate()+Math.max(0,days_ahead));
  const tISO=today.toISOString().slice(0,10); const toISO=to.toISOString().slice(0,10);
  const { data } = await sb.from('cellar').select('wine_id, ready_from, drink_by').eq('user_id', uid);
  const rows = Array.isArray(data)?data:[];
  const ready=[];
  for (const r of rows) {
    const rf=r.ready_from?String(r.ready_from):null;
    const db=r.drink_by?String(r.drink_by):null;
    const cond=(rf && rf<=toISO) && (!db || db>=tISO);
    if (cond) ready.push({ wine_id:r.wine_id, from:rf, to:db||null });
  }
  return { ready: ready.slice(0,50) };
}

/* ─────────────── ARTISAN PRODUCTS ─────────────── */
async function toolArtisanSearch(uid, { category=null, text=null, min_aging=null, max_price=null } = {}) {
  let q = sb.from('artisan_products')
    .select('id, name, category, designation, milk_meat_type, aging_days, price_eur, tags, photo_url, notes')
    .eq('user_id', uid);
  if (category) q = q.eq('category', category);
  if (min_aging!=null) q = q.gte('aging_days', Number(min_aging));
  if (max_price!=null) q = q.lte('price_eur', Number(max_price));
  if (text) q = q.or(`name.ilike.%${text}%,designation.ilike.%${text}%`);
  const { data } = await q;
  const items = Array.isArray(data)?data:[];
  return { items };
}

/* ─────────────── PRODUCT PLACES ─────────────── */
async function toolProductPlaces(uid, { item_type=null, term=null, kind=null } = {}) {
  let q = sb.from('product_places')
    .select('item_type, item_id, kind, place_name, lat, lng, visited_at, is_primary')
    .eq('user_id', uid);
  if (item_type) q = q.eq('item_type', item_type);
  if (kind) q = q.eq('kind', kind);
  if (term) q = q.ilike('place_name', `%${term}%`);
  const { data } = await q;
  const items = Array.isArray(data)?data:[];
  return { items };
}

/* ─────────────── OFFERTE ─────────────── */
async function toolOffersSearch(uid, { term=null, days_back=30 } = {}) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-Math.max(1,days_back));
  const out=[];
  const pushNorm=(arr)=>{ if(Array.isArray(arr)) for(const r of arr) out.push({
    store_name:r.store_name||r.fonte||null, price:Number(r.price||r.prezzo_offerta||0),
    valid_to:r.valid_to||r.data_scadenza_offerta||null, link:r.link_offerta||r.link||null, source:r.source||r.fonte||null
  });};

  const { data:o1 } = await sb.from('offers').select('store_name, price, valid_to, source, link_offerta, product_id').eq('user_id', uid); pushNorm(o1);
  const { data:o2 } = await sb.from('offers_weekly_report').select('store_name, price, link_offerta, captured_at').eq('user_id', uid); pushNorm(o2);
  const { data:o3 } = await sb.from('offerte').select('prodotto, prezzo_offerta, link, fonte, data_scadenza_offerta'); pushNorm(o3);

  const norm=String(term||'').toLowerCase();
  const items=out.filter(x => !term || (x.store_name||'').toLowerCase().includes(norm) || (x.source||'').toLowerCase().includes(norm));
  return { items: items.slice(0,50) };
}

/* ─────────────── MEMORY KV ─────────────── */
async function toolMemorySet(uid, { type, key, value, weight=1 } = {}) {
  if (!type || !key || !value) return { ok:false, error:'type/key/value required' };
  const { error } = await sb.from('assistant_memory')
    .upsert({ user_id: uid, type, key, value, weight, updated_at: new Date().toISOString() }, { onConflict: 'type,key,user_id' });
  if (error) return { ok:false, error: error.message || String(error) };
  return { ok:true };
}
async function toolMemoryGet(uid, { type=null } = {}) {
  let q = sb.from('assistant_memory').select('type, key, value, weight').eq('user_id', uid);
  if (type) q = q.eq('type', type);
  const { data } = await q;
  const items = Array.isArray(data)?data:[];
  return { items };
}
