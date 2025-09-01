// /lib/brainHub.js
import { supabase } from '@/lib/supabaseClient';

/* ========================== UTIL ========================== */
function norm(s=''){ return String(s).trim().replace(/\s+/g,' ').toLowerCase(); }
function fmtEuro(n){ const x=Number(n)||0; return x.toLocaleString('it-IT',{style:'currency',currency:'EUR'}); }
function startOfDay(d=new Date()){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d=new Date()){ const x=new Date(d); x.setHours(23,59,59,999); return x; }
function isoDate(d){ return d.toISOString().slice(0,10); }
function sum(arr){ return arr.reduce((t,x)=>t+(Number(x)||0),0); }

/** “questo mese / mese scorso / questa settimana / oggi / ultimi 30 giorni” */
function parseTimeRangeIT(query){
  const s = norm(query);
  const now = new Date();

  if (/\boggi\b/.test(s)) {
    const from = startOfDay(now);
    const to   = endOfDay(now);
    return { from: isoDate(from), to: isoDate(to), label:'oggi' };
  }
  if (/\bquesta\s+settimana\b/.test(s)) {
    const day = now.getDay(); // 0 dom 1 lun
    const diffToMon = (day === 0 ? 6 : day-1);
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate()-diffToMon));
    const to   = endOfDay(new Date(from.getFullYear(), from.getMonth(), from.getDate()+6));
    return { from: isoDate(from), to: isoDate(to), label:'questa settimana' };
  }
  if (/\bquest[oa]\s+mes\w*\b/.test(s)) {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const to   = endOfDay(new Date(now.getFullYear(), now.getMonth()+1, 0));
    return { from: isoDate(from), to: isoDate(to), label:'questo mese' };
  }
  if (/\bmes\w*\s+scors\w*\b/.test(s)) {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth()-1, 1));
    const to   = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return { from: isoDate(from), to: isoDate(to), label:'mese scorso' };
  }
  // fallback: ultimi 30 giorni
  const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate()-29));
  const to   = endOfDay(now);
  return { from: isoDate(from), to: isoDate(to), label:'ultimi 30 giorni' };
}

/** Estrae [Negozio] Dettaglio dalla description (vedi spese-casa.js) */
function parseDescParts(description=''){
  const m = String(description).match(/^\s*\[(.*?)\]\s*(.+)$/);
  return m ? { store: m[1] || null, detail: m[2] || '' } : { store: null, detail: String(description) };
}

/** Utente corrente */
async function getUserId(){
  const { data:{ user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user?.id || null;
}

/* ========================== SCORTE ========================== */
/** Vista “scorte_view” (richiede _scorte_metrics e scorte_view create lato DB) */
async function scorteOverview({ userId, onlyLow=false, scadenzaGiorni=null }){
  // name proviene dalla vista → Home mostrerà i NOME prodotti (non codici)
  const sel = 'id,name,qty,unit,fill_pct,consumed_pct_calc,status,days_to_expiry';
  let q = supabase.from('scorte_view').select(sel).eq('user_id', userId);

  if (onlyLow) q = q.in('status', ['low']);
  const { data, error } = await q.order('fill_pct', { ascending:true, nullsLast:true });
  if (error) throw error;
  const rows = data || [];

  const filtered = (scadenzaGiorni!=null)
    ? rows.filter(r => r.days_to_expiry!=null && Number(r.days_to_expiry) <= scadenzaGiorni)
    : rows;

  const total = rows.length;
  const low   = rows.filter(r => r.status==='low').length;
  const med   = rows.filter(r => r.status==='med').length;
  const ok    = rows.filter(r => r.status==='ok').length;
  const expSoon = rows.filter(r => r.days_to_expiry!=null && Number(r.days_to_expiry) <= 3).length;

  const items = filtered.slice(0, 25).map(r => ({
    id: r.id,
    name: r.name, // <-- NOME prodotto
    qty: r.qty,
    unit: r.unit,
    fill_pct: r.fill_pct!=null ? Math.round(Number(r.fill_pct)) : null,
    consumed_pct: r.consumed_pct_calc!=null ? Math.round(Number(r.consumed_pct_calc)) : null,
    status: r.status,
    days_to_expiry: r.days_to_expiry
  }));

  return {
    ok: true,
    summary: {
      totale: total,
      "in_scadenza_<=3gg": expSoon,   // chiave quotata → nessun errore TS
      stati: { low, med, ok }
    },
    elenco: items,
    note: onlyLow
      ? 'Mostro solo ciò che sta finendo (riempimento <25%).'
      : (scadenzaGiorni!=null ? `Mostro prodotti in scadenza entro ${scadenzaGiorni} giorni.` : undefined)
  };
}

/* ========================== FINANZE (base) ========================== */
async function fetchFinances({ userId, from, to, categoryIds=null }){
  const sel = 'amount,qty,description,store_name,spent_at,product_id,category_id,currency';
  let q = supabase
    .from('finances')
    .select(sel)
    .eq('user_id', userId)
    .gte('spent_at', from)
    .lte('spent_at', to);

  if (categoryIds && categoryIds.length) q = q.in('category_id', categoryIds);

  const { data, error } = await q.order('spent_at', { ascending:false });
  if (error) throw error;
  return data || [];
}

function spendKPI(rows){
  const total = sum(rows.map(r=>r.amount));
  const byStore = {};
  for (const r of rows) {
    const key = r.store_name || parseDescParts(r.description).store || '—';
    byStore[key] = (byStore[key]||0) + (Number(r.amount)||0);
  }
  const topStores = Object.entries(byStore)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,5)
    .map(([store, eur]) => ({ store, speso: eur, speso_fmt: fmtEuro(eur) }));

  return { totale: total, totale_fmt: fmtEuro(total), transazioni: rows.length, top_negozi: topStores };
}

/* ========================== CATEGORIE ========================== */
const CAT_ALIASES = {
  casa:      ['casa','utenze','spese casa','bollette'],
  cene:      ['cene','ristorante','aperitivi','pizzeria','bar','food out'],
  vestiti:   ['vestiti','abbigliamento','scarpe','accessori','outfit','moda'],
  varie:     ['varie','altro','generici','diversi','misc']
};

// Fallback noto dalla pagina spese-casa
const FALLBACK_CAT_ID_CASA = '4cfaac74-aab4-4d96-b335-6cc64de59afc';

async function resolveCategoryIds(userId, aliasKey){
  try {
    const { data, error } = await supabase
      .from('finance_categories')
      .select('id,name')
      .or(`user_id.eq.${userId},user_id.is.null`);
    if (error) throw error;

    const names = (data||[]).map(c => ({ id:c.id, name: (c.name||'').toLowerCase() }));
    const needles = (CAT_ALIASES[aliasKey] || []).map(s => s.toLowerCase());
    const hits = names
      .filter(c => needles.some(n => c.name.includes(n)))
      .map(c => c.id);

    if (hits.length) return hits;
    if (aliasKey === 'casa' && FALLBACK_CAT_ID_CASA) return [FALLBACK_CAT_ID_CASA];
    return [];
  } catch {
    if (aliasKey === 'casa' && FALLBACK_CAT_ID_CASA) return [FALLBACK_CAT_ID_CASA];
    return [];
  }
}

/* ====================== KPI per categoria ====================== */
async function spendTotalsByCat({ userId, range, aliasKey }){
  const catIds = await resolveCategoryIds(userId, aliasKey);
  const rows = await fetchFinances({ userId, from:range.from, to:range.to, categoryIds: catIds });
  const kpi = spendKPI(rows);
  return { ok:true, categoria: aliasKey, intervallo: range.label, ...kpi, categories_matched: catIds.length };
}

async function topProductsByCat({ userId, range, aliasKey, limit=10 }){
  const catIds = await resolveCategoryIds(userId, aliasKey);
  const rows = await fetchFinances({ userId, from:range.from, to:range.to, categoryIds: catIds });

  const byProd = {};
  for (const r of rows) {
    const { detail } = parseDescParts(r.description);
    const key = (detail || '').toLowerCase().slice(0,120) || '—';
    byProd[key] = (byProd[key]||0) + (Number(r.amount)||0);
  }
  const top = Object.entries(byProd)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,limit)
    .map(([name, eur]) => ({ prodotto: name, speso: eur, speso_fmt: fmtEuro(eur) }));

  return { ok:true, categoria: aliasKey, intervallo: range.label, top, categories_matched: catIds.length };
}

async function suppliersForByCat({ userId, range, aliasKey, term=null }){
  const catIds = await resolveCategoryIds(userId, aliasKey);

  let q = supabase
    .from('finances')
    .select('amount,description,store_name')
    .eq('user_id', userId)
    .gte('spent_at', range.from)
    .lte('spent_at', range.to);

  if (catIds.length) q = q.in('category_id', catIds);
  if (term) q = q.ilike('description', `%${term}%`);

  const { data, error } = await q;
  if (error) throw error;

  const rows = data || [];
  const stores = {};
  for (const r of rows) {
    const store = r.store_name || parseDescParts(r.description).store || '—';
    if (!stores[store]) stores[store] = { speso:0, scontrini:0 };
    stores[store].speso += Number(r.amount)||0;
    stores[store].scontrini += 1;
  }
  const elenco = Object.entries(stores)
    .map(([store, o]) => ({ store, speso: o.speso, speso_fmt: fmtEuro(o.speso), scontrini: o.scontrini }))
    .sort((a,b)=>b.speso - a.speso);

  return { ok:true, categoria: aliasKey, intervallo: range.label, filtro: term || null, fornitori: elenco, categories_matched: catIds.length };
}

/* ========================== FINANZE (esistenti) ========================== */
async function spendTotals({ userId, range }){
  const rows = await fetchFinances({ userId, from: range.from, to: range.to });
  const kpi = spendKPI(rows);
  return { ok: true, intervallo: range.label, ...kpi };
}

async function topProductsSpend({ userId, range, limit=10 }){
  const rows = await fetchFinances({ userId, from: range.from, to: range.to });
  const byProd = {};
  for (const r of rows) {
    const { detail } = parseDescParts(r.description);
    const key = (detail || '').toLowerCase().slice(0,120) || '—';
    byProd[key] = (byProd[key]||0) + (Number(r.amount)||0);
  }
  const top = Object.entries(byProd)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,limit)
    .map(([name, eur]) => ({ prodotto: name, speso: eur, speso_fmt: fmtEuro(eur) }));
  return { ok:true, intervallo: range.label, top };
}

async function productPriceStats({ userId, range, term }){
  term = term.trim();
  const { data, error } = await supabase
    .from('finances')
    .select('amount,qty,description,store_name,spent_at')
    .eq('user_id', userId)
    .gte('spent_at', range.from)
    .lte('spent_at', range.to)
    .ilike('description', `%${term}%`)
    .order('spent_at', { ascending:false });
  if (error) throw error;
  const rows = (data || []);
  if (!rows.length) return { ok:true, term, intervallo: range.label, trovati:0, note:'Nessuna spesa trovata per questo termine.' };

  const amounts = rows.map(r=>Number(r.amount)||0);
  const total = sum(amounts);
  const avg = total / amounts.length;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const stores = {};
  for (const r of rows) {
    const store = r.store_name || parseDescParts(r.description).store || '—';
    stores[store] = (stores[store]||{ speso:0, volte:0 });
    stores[store].speso += Number(r.amount)||0;
    stores[store].volte += 1;
  }
  const byStore = Object.entries(stores)
    .map(([store, o]) => ({ store, speso: o.speso, speso_fmt: fmtEuro(o.speso), scontrini: o.volte }))
    .sort((a,b)=>b.speso-a.speso);

  return {
    ok:true, term, intervallo: range.label, trovati: rows.length,
    media: avg, media_fmt: fmtEuro(avg),
    min: min, min_fmt: fmtEuro(min),
    max: max, max_fmt: fmtEuro(max),
    negozi: byStore.slice(0,5)
  };
}

async function suppliersFor({ userId, range, term }){
  const base = supabase
    .from('finances')
    .select('amount,description,store_name')
    .eq('user_id', userId)
    .gte('spent_at', range.from)
    .lte('spent_at', range.to);

  const { data, error } = term
    ? await base.ilike('description', `%${term}%`)
    : await base;

  if (error) throw error;
  const rows = data || [];
  const stores = {};
  for (const r of rows) {
    const store = r.store_name || parseDescParts(r.description).store || '—';
    if (!stores[store]) stores[store] = { speso:0, scontrini:0 };
    stores[store].speso += Number(r.amount)||0;
    stores[store].scontrini += 1;
  }
  const elenco = Object.entries(stores)
    .map(([store, o]) => ({ store, speso: o.speso, speso_fmt: fmtEuro(o.speso), scontrini: o.scontrini }))
    .sort((a,b)=>b.speso - a.speso);

  return { ok:true, intervallo: range.label, filtro: term || null, fornitori: elenco };
}

/* ====================== INTENT PARSER ======================= */
function detectCategoryAlias(s){
  const tests = [
    { key:'casa',    re: /\b(casa|utenze|bollette|spese\s*casa)\b/ },
    { key:'cene',    re: /\b(cene|cena|ristorant|aperitivi|pizzer|bar)\b/ },
    { key:'vestiti', re: /\b(vestit|abbigliamento|scarpe|accessor|outfit|moda)\b/ },
    { key:'varie',   re: /\b(varie|altro|divers|generici|misc)\b/ },
  ];
  const hit = tests.find(t => t.re.test(s));
  return hit?.key || null;
}

function pickIntent(text){
  const s = norm(text);

  // SCORTE
  if (/\b(cosa|che)\b.*\b(ho|c'è)\b.*\b(casa|dispensa|frigo|scorte)\b/.test(s)
      || /\b(stato\s+scorte|scorte)\b/.test(s)) {
    const onlyLow = /\b(finend|quasi\s+finit|sotto\s*25|low)\b/.test(s);
    const scad3   = /\b(scad|scadenza|scadono)\b/.test(s) ? 3 : null;
    return { type:'INVENTORY_OVERVIEW', onlyLow, scadDays: scad3 };
  }

  // SPESA TOTALE (globale o per categoria)
  if (/\bquanto\b.*\bspes[oa]\b/.test(s)) {
    const alias = detectCategoryAlias(s);
    if (alias) return { type:'SPEND_TOTALS_CAT', alias };
    return { type:'SPEND_TOTALS' };
  }

  // TOP PRODOTTI (globale o per categoria)
  if (/(in\s+quali|su\s+quali).*\bprodott/i.test(s) && /\bspend[oa]\s+di\s+pi[ùu]/.test(s)) {
    const alias = detectCategoryAlias(s);
    if (alias) return { type:'TOP_PRODUCTS_CAT', alias };
    return { type:'TOP_PRODUCTS' };
  }

  // QUANTO PAGO X
  const mQuanto = s.match(/\bquanto\b.*\b(pag|cost)\w*\b\s+(il|la|lo|i|gli|le)?\s*(.+)$/i);
  if (mQuanto) {
    const term = mQuanto[3]?.trim();
    if (term) return { type:'PRODUCT_PRICE', term };
  }

  // DOVE COMPRO X (globale o per categoria)
  const mDove = s.match(/\b(dove|in quali negozi|fornitor[ei])\b.*\b(compr|acquist)\w*\b\s*(.*)$/i);
  if (mDove) {
    const term = (mDove[3]||'').trim();
    const alias = detectCategoryAlias(s);
    if (alias) return { type:'WHERE_BUY_CAT', alias, term: term || null };
    return { type:'WHERE_BUY', term: term || null };
  }

  // fallback
  return { type:'UNKNOWN' };
}

/* ======================= PUBLIC API ======================== */
export async function runQueryFromTextLocal(text, { first=false } = {}){
  const userId = await getUserId();
  if (!userId) return { ok:false, error:'SESSIONE ASSENTE' };

  const intent = pickIntent(text);
  const range  = parseTimeRangeIT(text);

  try {
    switch (intent.type) {
      /* --- SCORTE --- */
      case 'INVENTORY_OVERVIEW': {
        const res = await scorteOverview({ userId, onlyLow:intent.onlyLow, scadenzaGiorni:intent.scadDays });
        return { ok:true, result: res };
      }

      /* --- FINANZE GLOBALI --- */
      case 'SPEND_TOTALS': {
        const res = await spendTotals({ userId, range });
        return { ok:true, result: res };
      }
      case 'TOP_PRODUCTS': {
        const res = await topProductsSpend({ userId, range, limit: 10 });
        return { ok:true, result: res };
      }
      case 'PRODUCT_PRICE': {
        const res = await productPriceStats({ userId, range, term: intent.term });
        return { ok:true, result: res };
      }
      case 'WHERE_BUY': {
        const res = await suppliersFor({ userId, range, term: intent.term });
        return { ok:true, result: res };
      }

      /* --- FINANZE PER CATEGORIA (Casa, Cene, Vestiti, Varie) --- */
      case 'SPEND_TOTALS_CAT': {
        const res = await spendTotalsByCat({ userId, range, aliasKey:intent.alias });
        return { ok:true, result: res };
      }
      case 'TOP_PRODUCTS_CAT': {
        const res = await topProductsByCat({ userId, range, aliasKey:intent.alias, limit: 10 });
        return { ok:true, result: res };
      }
      case 'WHERE_BUY_CAT': {
        const res = await suppliersForByCat({ userId, range, aliasKey:intent.alias, term:intent.term });
        return { ok:true, result: res };
      }

      /* --- fallback help --- */
      default:
        return {
          ok:true,
          result:{
            help: 'Prova: "Quanto ho speso questo mese **per casa**?", "In quali prodotti spendo di più **per vestiti**?", "Dove compro **il latte** per **cene**?", "Cosa ho a casa che sta finendo?", "Prodotti in scadenza?"'
          }
        };
    }
  } catch (e) {
    return { ok:false, error: e?.message || String(e) };
  }
}

/* =========== Compat con Home (OCR/Voce) ============ */
export async function ingestOCRLocal({ files=[] } = {}){
  const fd = new FormData();
  for (const f of files) fd.append('images', f, f.name || 'image.jpg');
  const r = await fetch('/api/ocr', { method:'POST', body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return { ok:true, result: { text: j.text || '' } };
}
export async function ingestSpokenLocal(spokenText=''){
  return runQueryFromTextLocal(spokenText);
}
