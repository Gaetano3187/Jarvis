// /lib/brainHub.js
import { supabase } from '@/lib/supabaseClient';

// ---------- util ----------
const fmtEuro = n => (Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'});
const fmtInt  = n => (Number(n)||0).toLocaleString('it-IT');
const iso = d => d.toISOString().slice(0,10);

// ---------- bounds ----------
function bounds(ref) {
  const now = new Date();
  if (ref === 'today') { const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()); return {start:iso(d), end:iso(d), label:'oggi'}; }
  if (ref === 'week')  { const day=now.getDay(); const delta=(day===0?-6:1-day); const s=new Date(now.getFullYear(),now.getMonth(),now.getDate()+delta); const e=new Date(s.getFullYear(),s.getMonth(),s.getDate()+6); return {start:iso(s), end:iso(e), label:'questa settimana'}; }
  if (ref === 'year')  { const s=new Date(now.getFullYear(),0,1), e=new Date(now.getFullYear(),11,31); return {start:iso(s), end:iso(e), label:"quest'anno"}; }
  const s=new Date(now.getFullYear(),now.getMonth(),1), e=new Date(now.getFullYear(),now.getMonth()+1,0);
  return {start:iso(s), end:iso(e), label:'questo mese'};
}

// ---------- tool: ledger + fallback ----------
async function readLedger(uid, start, end) {
  const { data, error } = await supabase
    .from('jarvis_finances')
    .select('price_total, purchase_date, store')
    .eq('user_id', uid).gte('purchase_date', start).lte('purchase_date', end);
  let rows = Array.isArray(data) ? data : [];
  if (!rows.length || error) {
    const readCat = async (t) => {
      const { data } = await supabase.from(t)
        .select('price_total, purchase_date, store')
        .eq('user_id', uid).gte('purchase_date', start).lte('purchase_date', end);
      return Array.isArray(data) ? data : [];
    };
    const [sc, ca, va, vr] = await Promise.all([
      readCat('jarvis_spese_casa'),
      readCat('jarvis_cene_aperitivi'),
      readCat('jarvis_vestiti_altro'),
      readCat('jarvis_varie'),
    ]);
    rows = [...sc, ...ca, ...va, ...vr];
  }
  return rows;
}

// ---------- tools ----------
async function toolSpendSum({ userId, ref='month' }) {
  const { start, end, label } = bounds(ref);
  const rows = await readLedger(userId, start, end);
  const total = rows.reduce((t, r) => t + Number(r.price_total||0), 0);
  const perStore = new Map();
  rows.forEach(r => {
    const k = (r.store||'Punto vendita').trim();
    perStore.set(k, (perStore.get(k)||0) + Number(r.price_total||0));
  });
  const top = [...perStore.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([store,amount])=>({store, amount}));
  return {
    kind: 'finances.month_summary',
    intervallo: label,
    total,
    transactions: rows.length,
    top_stores: top
  };
}

async function toolTopProducts({ userId, ref='month', limit=10 }) {
  const { start, end } = bounds(ref);
  const { data } = await supabase
    .from('jarvis_spese_casa')
    .select('name, price_total')
    .eq('user_id', userId).gte('purchase_date', start).lte('purchase_date', end);
  const rows = Array.isArray(data) ? data : [];
  const agg = new Map();
  rows.forEach(r => {
    const k = (r.name||'Prodotto').trim().toUpperCase();
    agg.set(k, (agg.get(k)||0) + Number(r.price_total||0));
  });
  return {
    kind: 'products.top',
    items: [...agg.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([name,amount])=>({name, amount}))
  };
}

async function toolPriceTrend({ userId, term, months_back=6 }) {
  const end = new Date(), start = new Date(end.getFullYear(), end.getMonth()-months_back, 1);
  const startISO = iso(start), endISO = iso(end);
  const { data } = await supabase
    .from('jarvis_spese_casa')
    .select('store, name, price_each, purchase_date')
    .eq('user_id', userId).gte('purchase_date', startISO).lte('purchase_date', endISO);
  const rows = (Array.isArray(data)?data:[]).filter(r => `${r.name||''}`.toLowerCase().includes(String(term||'').toLowerCase()));
  const byStoreMonth = new Map(); // store -> month -> [vals]
  rows.forEach(r => {
    const st = (r.store||'Punto vendita').trim();
    const m  = String(r.purchase_date||'').slice(0,7);
    const mm = byStoreMonth.get(st) || new Map(); const arr = mm.get(m)||[];
    arr.push(Number(r.price_each||0)); mm.set(m,arr); byStoreMonth.set(st,mm);
  });
  const series = [];
  for (const [store, mm] of byStoreMonth.entries()) {
    const months = [...mm.keys()].sort();
    series.push({
      store,
      points: months.map((m,i)=>({ x:m, y: Number(((mm.get(m)||[]).reduce((a,b)=>a+b,0)/((mm.get(m)||[]).length||1)).toFixed(2)) }))
    });
  }
  return { kind: 'price.trend', term, series };
}

async function toolStockSnapshot({ userId }) {
  for (const table of ['jarvis_stock','stock','scorte']) {
    const { data } = await supabase.from(table).select('*').eq('user_id', userId);
    if (Array.isArray(data) && data.length) {
      return { kind:'inventory.snapshot', elenco: data.map(r => ({ name:r.name||r.prodotto||'Articolo', qty:r.qty??r.quantity??r.qta??null, fill_pct:r.fill_pct??r.consumo_pct??r.remaining_pct??null })) };
    }
  }
  return { kind:'inventory.snapshot', elenco: [] };
}

async function toolShoppingTodo({ userId }) {
  for (const table of ['jarvis_liste_prodotti','shopping_list','todo_spesa']) {
    const { data } = await supabase.from(table).select('*').eq('user_id', userId).order('created_at', {ascending:false});
    if (Array.isArray(data)) {
      return { kind:'shopping.read', items: data, note: data.length?null:'Nessuna lista trovata.' };
    }
  }
  return { kind:'shopping.read', items: [], note:'Nessuna lista trovata.' };
}

async function toolBestStore({ userId, term, days_back=120 }) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days_back);
  const { data } = await supabase
    .from('jarvis_spese_casa')
    .select('store, name, price_each, purchase_date')
    .eq('user_id', userId);
  const rows = (Array.isArray(data)?data:[])
    .filter(r => `${r.name||''}`.toLowerCase().includes(String(term||'').toLowerCase()))
    .filter(r => { const d=new Date(String(r.purchase_date||'')); return !isNaN(d) && d>=cutoff; });
  const m = new Map();
  rows.forEach(r => { const st=(r.store||'Punto vendita').trim(); const arr=m.get(st)||[]; arr.push(Number(r.price_each||0)); m.set(st,arr); });
  const ranked = [...m.entries()].map(([store,arr])=>({store, n:arr.length, avg: arr.reduce((a,b)=>a+b,0)/arr.length})).filter(x=>x.n>0).sort((a,b)=>a.avg-b.avg);
  return { kind:'price.best_store', term, results: ranked };
}

// ---------- intent router (LLM opzionale o regole locali) ----------
function parseQuickIntent(q='') {
  const s = q.toLowerCase().trim();
  const spentRe = /(quanto\s+ho\s+spes[oa]|totale\s+spes[ea]|spes[ae]\s+(di|del)\s+(oggi|questa settimana|questo mese|quest’anno|questo anno))/i;
  if (spentRe.test(s)) {
    if (/oggi\b/.test(s)) return { tool:'spend.sum', args:{ref:'today'} };
    if (/questa\s+settimana/.test(s)) return { tool:'spend.sum', args:{ref:'week'} };
    if (/quest['o]?\s*anno/.test(s)) return { tool:'spend.sum', args:{ref:'year'} };
    return { tool:'spend.sum', args:{ref:'month'} };
  }
  if (/in\s+quali\s+prodott[iy]\s+spendo\s+di\s+pi[uù]|top\s+prodott[iy]/i.test(s)) {
    if (/oggi\b/.test(s)) return { tool:'spend.top_products', args:{ref:'today'} };
    if (/questa\s+settimana/.test(s)) return { tool:'spend.top_products', args:{ref:'week'} };
    if (/quest['o]?\s*anno/.test(s)) return { tool:'spend.top_products', args:{ref:'year'} };
    return { tool:'spend.top_products', args:{ref:'month'} };
  }
  const mGraph = s.match(/grafico.*andament[oi].*prezz[iy].*?(?:per|di)?\s*["“](.+?)["”]/i) || s.match(/andament[oi].*prezz[iy].*["“](.+?)["”]/i);
  if (mGraph) return { tool:'price.trend', args:{term:mGraph[1].trim()} };
  const mBest = s.match(/dove\s+mi\s+conviene\s+acquistar[e]?\s+(.+?)\??$/i);
  if (mBest)  return { tool:'price.best_store', args:{term:mBest[1].trim().replace(/^(il|la|lo|i|gli|le)\s+/i,'')} };
  if (/cosa\s+ho\s+in\s+casa|scorte\b/i.test(s)) return { tool:'stock.snapshot', args:{} };
  if (/cosa\s+devo\s+comprare|lista\s+(spesa|da\s+comprare)/i.test(s)) return { tool:'shopping.read', args:{} };
  return null;
}

// ---------- renderer semplice ----------
function render(result){
  if (result.kind === 'finances.month_summary') {
    const { intervallo, total, transactions, top_stores } = result;
    const lines = (top_stores||[]).map(r => `${r.store}: ${fmtEuro(r.amount)}`).join('\n');
    return { text: `📊 Spese — ${intervallo}\nTotale: ${fmtEuro(total)} • Transazioni: ${fmtInt(transactions)}\n\n${lines||''}`, mono:true };
  }
  if (result.kind === 'products.top') {
    const lines = (result.items||[]).map(p => `• ${p.name}: ${fmtEuro(p.amount)}`).join('\n');
    return { text: `🏷️ Prodotti su cui spendi di più\n${lines||'—'}`, mono:true };
  }
  if (result.kind === 'price.trend') {
    const svgs = (result.series||[]).slice(0,2).map(s => {
      const points = (s.points||[]).map((p,i)=>({x:i,y:p.y}));
      const svg = svgLine(points, { label:`${s.store} — ${result.term}` });
      return `<div style="margin:6px 0">${svg}</div>`;
    }).join('');
    return { text: svgs || 'Nessun dato prezzi', mono:false };
  }
  if (result.kind === 'inventory.snapshot') {
    const rows = (result.elenco||[]).slice(0,30).map(s => `• ${s.name} — ${s.qty ?? '—'}`).join('\n');
    return { text: `🏠 Scorte (snapshot)\n${rows||'—'}`, mono:true };
  }
  if (result.kind === 'shopping.read') {
    const rows = (result.items||[]).slice(0,30).map(x => `• ${x.name || x.item || x.prodotto || 'Voce'}${x.qty?` × ${x.qty}`:''}`).join('\n');
    return { text: `🛒 Cose da comprare\n${rows||'—'}${result.note?`\n\n${result.note}`:''}`, mono:true };
  }
  if (result.kind === 'price.best_store') {
    const rows = (result.results||[]).slice(0,5).map(b => `• ${b.store}: ~ ${fmtEuro(b.avg)} (su ${fmtInt(b.n)})`).join('\n');
    return { text: rows ? `📍 Dove conviene “${result.term}”\n${rows}` : `Nessun prezzo recente per “${result.term}”.`, mono:true };
  }
  return { text: JSON.stringify(result, null, 2), mono:true };
}

// ---------- public API ----------
export async function runQueryFromTextLocal(text, { userId } = {}) {
  // se vuoi: integra OpenAI function-calling qui; per ora parser locale robusto
  const intent = parseQuickIntent(text||'');
  if (intent) {
    if (intent.tool === 'spend.sum')              return render(await toolSpendSum({ userId, ...intent.args }));
    if (intent.tool === 'spend.top_products')     return render(await toolTopProducts({ userId, ...intent.args }));
    if (intent.tool === 'price.trend')            return render(await toolPriceTrend({ userId, ...intent.args }));
    if (intent.tool === 'stock.snapshot')         return render(await toolStockSnapshot({ userId }));
    if (intent.tool === 'shopping.read')          return render(await toolShoppingTodo({ userId }));
    if (intent.tool === 'price.best_store')       return render(await toolBestStore({ userId, ...intent.args }));
  }
  // fallback neutro: nessun match → lascia al chiamante gestire
  return { kind:'noop', note:'no_intent' };
}

export default { runQueryFromTextLocal };
