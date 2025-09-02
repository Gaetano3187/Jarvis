// /lib/brainHub.js
import { supabase } from '@/lib/supabaseClient';

/* ========================== UTIL ========================== */
function norm(s=''){ return String(s).trim().replace(/\s+/g,' ').toLowerCase(); }
function fmtEuro(n){ const x=Number(n)||0; return x.toLocaleString('it-IT',{style:'currency',currency:'EUR'}); }
function startOfDay(d=new Date()){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d=new Date()){ const x=new Date(d); x.setHours(23,59,59,999); return x; }
function isoDate(d){ return d.toISOString().slice(0,10); }
function sum(arr){ return arr.reduce((t,x)=>t+(Number(x)||0),0); }
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

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

/* ===========================================================
   SCORTE (usa scorte_view.name → nomi in chiaro)
   =========================================================== */
async function scorteOverview({ userId, onlyLow=false, scadenzaGiorni=null }){
  let q = supabase.from('scorte_view')
    .select('id,name,qty,unit,fill_pct,consumed_pct_calc,status,days_to_expiry')
    .eq('user_id', userId);

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

  const items = filtered.slice(0, 50).map(r => ({
    id: r.id,
    name: r.name || '—',
    qty: r.qty,
    unit: r.unit,
    fill_pct: r.fill_pct!=null ? Math.round(Number(r.fill_pct)) : null,
    consumed_pct: r.consumed_pct_calc!=null ? Math.round(Number(r.consumed_pct_calc)) : null,
    status: r.status,
    days_to_expiry: r.days_to_expiry
  }));

  return {
    ok: true,
    kind: 'inventory.snapshot',
    summary: {
      totale: total,
      in_scadenza_entra_3gg: expSoon,
      stati: { low, med, ok }
    },
    elenco: items
  };
}

/* ===========================================================
   FINANZE (base)
   =========================================================== */
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

/* ===========================================================
   CATEGORIE alias (Casa / Cene / Vestiti / Varie)
   =========================================================== */
const CAT_ALIASES = {
  casa:      ['casa','utenze','spese casa','bollette'],
  cene:      ['cene','ristorante','aperitivi','pizzeria','bar','food out'],
  vestiti:   ['vestiti','abbigliamento','scarpe','accessori','outfit','moda'],
  varie:     ['varie','altro','generici','diversi','misc']
};
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
  return { ok:true, kind:'finances.month_summary', categoria: aliasKey, intervallo: range.label, ...kpi, categories_matched: catIds.length };
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
  return { ok:true, kind:'finances.top_products', categoria: aliasKey, intervallo: range.label, top, categories_matched: catIds.length };
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
  return { ok:true, kind:'finances.suppliers', categoria: aliasKey, intervallo: range.label, filtro: term || null, fornitori: elenco, categories_matched: catIds.length };
}

/* ========================== FINANZE (globali) ========================== */
async function spendTotals({ userId, range }){
  const rows = await fetchFinances({ userId, from: range.from, to: range.to });
  const kpi = spendKPI(rows);
  return { ok: true, kind:'finances.month_summary', intervallo: range.label, ...kpi };
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
  return { ok:true, kind:'finances.top_products', intervallo: range.label, top };
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
  const rows = data || [];
  if (!rows.length) return { ok:true, kind:'finances.price_stats', term, intervallo: range.label, trovati:0, note:'Nessuna spesa trovata per questo termine.' };

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
    ok:true, kind:'finances.price_stats', term, intervallo: range.label, trovati: rows.length,
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
  return { ok:true, kind:'finances.suppliers', intervallo: range.label, filtro: term || null, fornitori: elenco };
}

/* ===========================================================
   LISTE DELLA SPESA (lists / list_items / products)
   =========================================================== */
function parseListContext(text){
  const s = norm(text);
  // nome lista dopo la parola 'lista ...'
  let name = null;
  const m = s.match(/\blista\s+([a-z0-9àèéìòù\s]+)\b/);
  if (m) name = m[1].trim();
  // tipo
  let listType = /online\b/.test(s) ? 'online' : 'supermercato';
  if (name && /online/.test(name)) listType = 'online';
  return { listName: name || (listType==='online'?'Online':'Supermercato'), listType };
}
async function getOrCreateListId(userId, listName='Supermercato', listType='supermercato'){
  let { data: found, error: e1 } = await supabase
    .from('lists')
    .select('id,name,list_type,created_at')
    .eq('user_id', userId)
    .or(`list_type.eq.${listType},name.ilike.%${listName}%`)
    .order('created_at', { ascending:false })
    .limit(1);
  if (e1) throw e1;
  if (found && found.length) return found[0].id;

  const { data: ins, error: e2 } = await supabase
    .from('lists')
    .insert([{ user_id:userId, name:listName, list_type:listType }])
    .select('id')
    .single();
  if (e2) throw e2;
  return ins.id;
}
async function getLatestListId(userId, listType='supermercato', listName=null){
  let q = supabase.from('lists')
    .select('id,name,list_type,created_at')
    .eq('user_id', userId)
    .eq('list_type', listType);
  if (listName) q = q.ilike('name', `%${listName}%`);
  const { data, error } = await q.order('created_at',{ascending:false}).limit(1);
  if (error) throw error;
  return (data && data.length) ? data[0].id : null;
}
async function getOrCreateProductId(userId, name){
  const nm = name.trim();
  if (!nm) return null;
  const { data: hit, error: e1 } = await supabase
    .from('products')
    .select('id,name')
    .eq('user_id', userId)
    .ilike('name', nm)
    .limit(1);
  if (e1) throw e1;
  if (hit && hit.length) return hit[0].id;

  const { data: ins, error: e2 } = await supabase
    .from('products')
    .insert([{ user_id:userId, name:nm }])
    .select('id')
    .single();
  if (e2) throw e2;
  return ins.id;
}
// "latte, 2 kg mele, pane integrale e uova" -> array {name, qty, unit}
function splitItalianList(s){
  const raw = s.replace(/\s+e\s+/gi, ',').split(',').map(x=>x.trim()).filter(Boolean);
  return raw.map(chunk=>{
    const re = /^(?:(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|pz|x|bottiglie?|confezioni?|pacchi?)?\s*)?(.*)$/i;
    const m = chunk.match(re);
    const q = m?.[1] ? Number(String(m[1]).replace(',','.')) : 1;
    let u = (m?.[2]||'').toLowerCase();
    const name = (m?.[3]||'').trim();
    if (!u) u = 'pz';
    if (u === 'x') u = 'pz';
    return { name, qty: clamp(q, 0.01, 9999), unit: u };
  }).filter(x=>x.name);
}
function extractItemsTail(text){
  const s = norm(text);
  const tail =
    s.split(/(?:lista|spesa|supermercato)\s*/).slice(1).join(' ').trim() ||
    s.replace(/^(aggiung[ei]|metti|inserisc[io])\s*/,'').trim();
  return tail;
}
async function addToShoppingList({ userId, text }){
  const { listName, listType } = parseListContext(text);
  const items = splitItalianList(extractItemsTail(text));
  if (!items.length) {
    return { ok:false, kind:'shopping.add', note:'Nessun prodotto riconosciuto.' };
  }
  const listId = await getOrCreateListId(userId, listName, listType);
  const inserted = [];
  for (const it of items) {
    const pid = await getOrCreateProductId(userId, it.name);
    if (!pid) continue;
    const row = { user_id:userId, list_id:listId, product_id:pid, qty:it.qty, unit:it.unit, purchased:false };
    const { error } = await supabase.from('list_items').insert([row]);
    if (!error) inserted.push({ name: it.name, qty: it.qty, unit: it.unit });
  }
  return { ok:true, kind:'shopping.add', inserted, count: inserted.length, list_id: listId, list_name:listName, list_type:listType };
}
async function readShoppingList({ userId, listCtx=null }){
  const ctx = listCtx || { listType:'supermercato', listName:null };
  const listId = await getLatestListId(userId, ctx.listType, ctx.listName);
  if (!listId) return { ok:true, kind:'shopping.read', items:[], note:'Nessuna lista trovata.' };

  const { data: items, error } = await supabase
    .from('list_items')
    .select('id,qty,unit,purchased,products(name)')
    .eq('user_id', userId)
    .eq('list_id', listId)
    .eq('purchased', false)
    .order('added_at', { ascending:false });
  if (error) throw error;

  const elenco = (items||[]).map(r => ({
    id: r.id,
    name: r?.products?.name ?? r?.products?.[0]?.name ?? '—',
    qty: r.qty,
    unit: r.unit || 'pz'
  }));
  return { ok:true, kind:'shopping.read', list_id:listId, items:elenco };
}
async function findItemRowsByTerm({ userId, listId, term }){
  const { data, error } = await supabase
    .from('list_items')
    .select('id,qty,unit,purchased,products(name)')
    .eq('user_id', userId)
    .eq('list_id', listId);
  if (error) throw error;
  const t = norm(term);
  return (data||[]).filter(r => norm(r?.products?.name ?? r?.products?.[0]?.name ?? '').includes(t));
}
async function markPurchased({ userId, text, purchased=true }){
  const { listName, listType } = parseListContext(text);
  const listId = await getLatestListId(userId, listType, listName);
  if (!listId) return { ok:false, kind:'shopping.mark', note:'Nessuna lista trovata.' };

  const m = text.match(/\b(?:comprat[oa]|pres[ao]|da\s+comprare|non\s+comprat[oa])\b\s+(.*)$/i);
  const term = m ? m[1].trim() : text.replace(/^(segna|metti|spunta|togli)\b/i,'').trim();
  if (!term) return { ok:false, kind:'shopping.mark', note:'Nessun prodotto specificato.' };

  const rows = await findItemRowsByTerm({ userId, listId, term });
  if (!rows.length) return { ok:false, kind:'shopping.mark', note:`Nessun elemento che corrisponde a "${term}".` };

  const ids = rows.map(r=>r.id);
  const { error } = await supabase
    .from('list_items')
    .update({ purchased, purchased_at: purchased ? isoDate(new Date()) : null })
    .in('id', ids)
    .eq('user_id', userId)
    .eq('list_id', listId);
  if (error) throw error;

  return { ok:true, kind:'shopping.mark', term, purchased, count: ids.length, list_id:listId };
}
async function removeItem({ userId, text }){
  const { listName, listType } = parseListContext(text);
  const listId = await getLatestListId(userId, listType, listName);
  if (!listId) return { ok:false, kind:'shopping.remove', note:'Nessuna lista trovata.' };

  const m = text.match(/\b(?:rimuovi|cancella|togli)\b\s+(.*)$/i);
  const term = m ? m[1].trim() : '';
  if (!term) return { ok:false, kind:'shopping.remove', note:'Nessun prodotto specificato.' };

  const rows = await findItemRowsByTerm({ userId, listId, term });
  if (!rows.length) return { ok:false, kind:'shopping.remove', note:`Nessun elemento che corrisponde a "${term}".` };

  const ids = rows.map(r=>r.id);
  const { error } = await supabase
    .from('list_items')
    .delete()
    .in('id', ids)
    .eq('user_id', userId)
    .eq('list_id', listId);
  if (error) throw error;

  return { ok:true, kind:'shopping.remove', term, count: ids.length, list_id:listId };
}
async function clearList({ userId, text }){
  const { listName, listType } = parseListContext(text);
  const listId = await getLatestListId(userId, listType, listName);
  if (!listId) return { ok:false, kind:'shopping.clear', note:'Nessuna lista trovata.' };

  const { error } = await supabase
    .from('list_items')
    .delete()
    .eq('user_id', userId)
    .eq('list_id', listId);
  if (error) throw error;

  return { ok:true, kind:'shopping.clear', list_id:listId };
}
async function setQuantity({ userId, text }){
  const { listName, listType } = parseListContext(text);
  const listId = await getLatestListId(userId, listType, listName);
  if (!listId) return { ok:false, kind:'shopping.qty', note:'Nessuna lista trovata.' };

  // imposta 3 bottiglie acqua | imposta 2 kg mele | metti 4 latte
  const m = text.match(/\b(?:imposta|setta|metti)\b\s+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|pz|bottiglie?|confezioni?|pacchi?)?\s+(.*)$/i);
  if (!m) return { ok:false, kind:'shopping.qty', note:'Non ho riconosciuto quantità / prodotto.' };
  const qty = Number(String(m[1]).replace(',','.'));
  const unit = (m[2]||'pz').toLowerCase()==='x' ? 'pz' : (m[2]||'pz').toLowerCase();
  const term = m[3].trim();

  const rows = await findItemRowsByTerm({ userId, listId, term });
  if (!rows.length) return { ok:false, kind:'shopping.qty', note:`Nessun elemento che corrisponde a "${term}".` };

  const ids = rows.map(r=>r.id);
  const { error } = await supabase
    .from('list_items')
    .update({ qty, unit })
    .in('id', ids)
    .eq('user_id', userId)
    .eq('list_id', listId);
  if (error) throw error;

  return { ok:true, kind:'shopping.qty', term, qty, unit, count: ids.length, list_id:listId };
}
async function listAllLists({ userId }){
  const { data, error } = await supabase
    .from('lists')
    .select('id,name,list_type,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending:false });
  if (error) throw error;
  return { ok:true, kind:'shopping.lists', lists: (data||[]).map(r=>({ id:r.id, name:r.name, type:r.list_type })) };
}
async function createList({ userId, text }){
  const m = text.match(/\b(?:crea|nuova)\s+lista\s+([a-z0-9àèéìòù\s]+)\b/i);
  if (!m) return { ok:false, kind:'shopping.create', note:'Specifica un nome: "crea lista farmacia".' };
  const name = m[1].trim();
  const listType = /online\b/i.test(text) ? 'online' : 'supermercato';
  const id = await getOrCreateListId(userId, name, listType);
  return { ok:true, kind:'shopping.create', list_id:id, name, list_type:listType };
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

  // === LISTE: aggiungi
  if (/\b(aggiung[ei]|metti|inserisc[io])\b.*\b(lista|spesa|supermercato)\b/.test(s)) {
    return { type:'ADD_TO_LIST' };
  }
  // === LISTE: leggi
  if (/\b(cosa\s+(devo|c')\s*comprare|legg(i|imi)\s+la\s+lista|mostra\s+lista|dammi\s+la\s+lista)\b/.test(s)) {
    return { type:'READ_LIST' };
  }
  // === LISTE: segna comprato / non comprato
  if (/\b(segna|metti|spunta)\b.*\b(comprat[oa]|pres[ao])\b/.test(s) || /\b(ho\s+pres[oa])\b/.test(s)) {
    return { type:'MARK_PURCHASED', purchased: true };
  }
  if (/\b(segna|metti|togli)\b.*\b(da\s+comprare|non\s+comprat[oa])\b/.test(s)) {
    return { type:'MARK_PURCHASED', purchased: false };
  }
  // === LISTE: rimuovi
  if (/\b(rimuovi|cancella|togli)\b.*\b(dalla\s+lista|lista|spesa|supermercato)?\b/.test(s)) {
    return { type:'REMOVE_ITEM' };
  }
  // === LISTE: svuota
  if (/\b(svuota|pulisci)\b.*\b(l[ao]\s+)?lista\b/.test(s)) {
    return { type:'CLEAR_LIST' };
  }
  // === LISTE: imposta quantità
  if (/\b(imposta|setta|metti)\b\s+\d/.test(s)) {
    return { type:'SET_QTY' };
  }
  // === LISTE: elenca liste / crea lista
  if (/\b(elenca|mostra)\b.*\b(liste)\b/.test(s) || /\b(quali)\s+liste\b/.test(s)) {
    return { type:'LIST_ALL_LISTS' };
  }
  if (/\b(crea|nuova)\s+lista\b/.test(s)) {
    return { type:'CREATE_LIST' };
  }

  // === SCORTE
  if (/\b(cosa|che)\b.*\b(ho|c'è)\b.*\b(casa|dispensa|frigo|scorte)\b/.test(s)
      || /\b(stato\s+scorte|scorte)\b/.test(s)) {
    const onlyLow = /\b(finend|quasi\s+finit|sotto\s*25|low|in\s+esaurimento)\b/.test(s);
    const scad3   = /\b(scad|scadenza|scadono|in\s+scadenza)\b/.test(s) ? 3 : null;
    return { type:'INVENTORY_OVERVIEW', onlyLow, scadDays: scad3 };
  }

  // === FINANZE
  if (/\bquanto\b.*\bspes[oa]\b/.test(s)) {
    const alias = detectCategoryAlias(s);
    if (alias) return { type:'SPEND_TOTALS_CAT', alias };
    return { type:'SPEND_TOTALS' };
  }
  if (/(in\s+quali|su\s+quali).*\bprodott/i.test(s) && /\bspend[oa]\s+di\s+pi[ùu]/.test(s)) {
    const alias = detectCategoryAlias(s);
    if (alias) return { type:'TOP_PRODUCTS_CAT', alias };
    return { type:'TOP_PRODUCTS' };
  }
  const mQuanto = s.match(/\bquanto\b.*\b(pag|cost)\w*\b\s+(?:il|la|lo|i|gli|le)?\s*(.+)$/i);
  if (mQuanto) {
    const term = mQuanto[2]?.trim();
    if (term) return { type:'PRODUCT_PRICE', term };
  }
  const mDove = s.match(/\b(dove|in quali negozi|fornitor[ei])\b.*\b(compr|acquist)\w*\b\s*(.*)$/i);
  if (mDove) {
    const term = (mDove[3]||'').trim();
    const alias = detectCategoryAlias(s);
    if (alias) return { type:'WHERE_BUY_CAT', alias, term: term || null };
    return { type:'WHERE_BUY', term: term || null };
  }

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
      /* --- LISTE --- */
      case 'ADD_TO_LIST': {
        const res = await addToShoppingList({ userId, text });
        return { ok:true, result: res };
      }
      case 'READ_LIST': {
        const res = await readShoppingList({ userId, listCtx: parseListContext(text) });
        return { ok:true, result: res };
      }
      case 'MARK_PURCHASED': {
        const res = await markPurchased({ userId, text, purchased: intent.purchased===true });
        return { ok:true, result: res };
      }
      case 'REMOVE_ITEM': {
        const res = await removeItem({ userId, text });
        return { ok:true, result: res };
      }
      case 'CLEAR_LIST': {
        const res = await clearList({ userId, text });
        return { ok:true, result: res };
      }
      case 'SET_QTY': {
        const res = await setQuantity({ userId, text });
        return { ok:true, result: res };
      }
      case 'LIST_ALL_LISTS': {
        const res = await listAllLists({ userId });
        return { ok:true, result: res };
      }
      case 'CREATE_LIST': {
        const res = await createList({ userId, text });
        return { ok:true, result: res };
      }

      /* --- SCORTE --- */
      case 'INVENTORY_OVERVIEW': {
        const res = await scorteOverview({ userId, onlyLow:intent.onlyLow, scadenzaGiorni:intent.scadDays });
        return { ok:true, result: res };
      }

      /* --- FINANZE --- */
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

      default:
        return {
          ok:true,
          result:{
            help: 'Esempi: "Aggiungi alla lista supermercato latte, 2 kg mele e pasta" • "Cosa devo comprare?" • "Segna comprato latte" • "Rimuovi pane dalla lista" • "Svuota la lista" • "Imposta 3 bottiglie acqua" • "Elenca le liste" • "Crea lista farmacia" • "Cosa ho a casa in esaurimento?" • "Quanto ho speso questo mese per casa?"'
          }
        };
    }
  } catch (e) {
    return { ok:false, error: e?.message || String(e) };
  }
}

/* =========== Compat con Home (OCR) ============ */
export async function ingestOCRLocal({ files=[] } = {}){
  const fd = new FormData();
  for (const f of files) fd.append('images', f, f.name || 'image.jpg');
  const r = await fetch('/api/ocr', { method:'POST', body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return { ok:true, result: { text: j.text || '' } };
}

/* =========== Compat con Home (voce) ============ */
export async function ingestSpokenLocal(spokenText=''){
  return runQueryFromTextLocal(spokenText);
}
