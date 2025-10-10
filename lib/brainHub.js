// /lib/brainHub.js
import { supabase } from '@/lib/supabaseClient';

/* ===========================
   Helpers di formattazione
=========================== */
const fmtEuro = n => (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const fmtInt  = n => (Number(n) || 0).toLocaleString('it-IT');
const iso     = d => d.toISOString().slice(0, 10);

/* ===========================
   SVG mini line chart (semplice)
=========================== */
function svgLine(points, { width = 420, height = 120, pad = 16, label = '' } = {}) {
  const pts = Array.isArray(points) ? points : [];
  if (!pts.length) return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="auto"/>`;
  const xs = pts.map(p => Number(p.x)), ys = pts.map(p => Number(p.y));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const rx = maxX === minX ? 1 : (maxX - minX);
  const ry = maxY === minY ? 1 : (maxY - minY);
  const W = width - pad * 2, H = height - pad * 2;

  const mapX = v => pad + ((v - minX) / rx) * W;
  const mapY = v => pad + H - ((v - minY) / ry) * H;

  const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${mapX(p.x)} ${mapY(p.y)}`).join(' ');
  const circles = pts.map(p => `<circle cx="${mapX(p.x)}" cy="${mapY(p.y)}" r="2" fill="#fff" />`).join('');

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" style="background:#0b0f14;border:1px solid #1f2a38;border-radius:12px">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#0b0f14"/>
    <path d="${d}" fill="none" stroke="#60a5fa" stroke-width="2"/>
    ${circles}
    ${label ? `<text x="${pad}" y="${pad - 4}" fill="#cdeafe" font-size="12">${label}</text>` : ``}
  </svg>`;
}

/* ===========================
   Bounds / intervalli
=========================== */
function bounds(ref) {
  const now = new Date();
  if (ref === 'today') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: iso(d), end: iso(d), label: 'oggi' };
  }
  if (ref === 'week') {
    const day = now.getDay();
    const delta = (day === 0 ? -6 : 1 - day);
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
    const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    return { start: iso(s), end: iso(e), label: 'questa settimana' };
  }
  if (ref === 'year') {
    const s = new Date(now.getFullYear(), 0, 1), e = new Date(now.getFullYear(), 11, 31);
    return { start: iso(s), end: iso(e), label: "quest'anno" };
  }
  const s = new Date(now.getFullYear(), now.getMonth(), 1);
  const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: iso(s), end: iso(e), label: 'questo mese' };
}

// mesi italiani → indice (0-11)
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
function monthBoundsByName(name, optYear) {
  const idx = MESI.indexOf(String(name||'').toLowerCase());
  if (idx < 0) return null;
  const now = new Date();
  const year = optYear ? Number(optYear) : now.getFullYear();
  const s = new Date(year, idx, 1);
  const e = new Date(year, idx + 1, 0);
  return { start: iso(s), end: iso(e), label: `${MESI[idx]} ${year}` };
}

/* ===========================
   User ID helper
=========================== */
async function getUserIdOrThrow(prefUid) {
  if (prefUid) return prefUid;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {}
  throw new Error('NO_UID');
}

/* ===========================
   Ledger reader + fallback categorie
=========================== */
async function readLedger(uid, start, end) {
  // Prima prova dal ledger aggregato
  const { data, error } = await supabase
    .from('jarvis_finances')
    .select('price_total, purchase_date, store')
    .eq('user_id', uid)
    .gte('purchase_date', start)
    .lte('purchase_date', end);

  let rows = Array.isArray(data) ? data : [];
  if (!rows.length || error) {
    // Fallback: somma delle tabelle categoria
    const readCat = async (t) => {
      const { data: d } = await supabase
        .from(t)
        .select('price_total, purchase_date, store')
        .eq('user_id', uid)
        .gte('purchase_date', start)
        .lte('purchase_date', end);
      return Array.isArray(d) ? d : [];
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

/* ===========================
   Tools
=========================== */
async function toolSpendSum({ userId, ref = 'month', explicitRange }) {
  const uid = await getUserIdOrThrow(userId);
  const { start, end, label } = explicitRange || bounds(ref);
  const rows = await readLedger(uid, start, end);

  const total = rows.reduce((t, r) => t + Number(r?.price_total || 0), 0);
  const perStore = new Map();
  rows.forEach(r => {
    const k = (r.store || 'Punto vendita').trim();
    perStore.set(k, (perStore.get(k) || 0) + Number(r?.price_total || 0));
  });
  const top = [...perStore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([store, amount]) => ({ store, amount }));

  return {
    kind: 'finances.month_summary',
    intervallo: label,
    total,
    transactions: rows.length,
    top_stores: top
  };
}

async function toolTopProducts({ userId, ref = 'month', limit = 10 }) {
  const uid = await getUserIdOrThrow(userId);
  const { start, end } = bounds(ref);
  const { data, error } = await supabase
    .from('jarvis_spese_casa')
    .select('name, price_total, purchase_date')
    .eq('user_id', uid)
    .gte('purchase_date', start)
    .lte('purchase_date', end);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const agg = new Map();
  rows.forEach(r => {
    const k = (r.name || 'Prodotto').trim().toUpperCase();
    agg.set(k, (agg.get(k) || 0) + Number(r?.price_total || 0));
  });

  return {
    kind: 'products.top',
    items: [...agg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, amount]) => ({ name, amount }))
  };
}

async function toolPriceTrend({ userId, term, months_back = 6 }) {
  const uid = await getUserIdOrThrow(userId);
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - months_back, 1);
  const startISO = iso(start), endISO = iso(end);

  const { data, error } = await supabase
    .from('jarvis_spese_casa')
    .select('store, name, price_each, purchase_date')
    .eq('user_id', uid)
    .gte('purchase_date', startISO)
    .lte('purchase_date', endISO);

  if (error) throw error;

  const rows = (Array.isArray(data) ? data : [])
    .filter(r => `${r.name || ''}`.toLowerCase().includes(String(term || '').toLowerCase()));

  const byStoreMonth = new Map(); // store -> (month -> [vals])
  rows.forEach(r => {
    const st = (r.store || 'Punto vendita').trim();
    const m = String(r.purchase_date || '').slice(0, 7);
    const mm = byStoreMonth.get(st) || new Map();
    const arr = mm.get(m) || [];
    arr.push(Number(r.price_each || 0));
    mm.set(m, arr);
    byStoreMonth.set(st, mm);
  });

  const series = [];
  for (const [store, mm] of byStoreMonth.entries()) {
    const months = [...mm.keys()].sort();
    series.push({
      store,
      points: months.map((m, i) => {
        const vals = mm.get(m) || [];
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        return { x: i, y: Number(avg.toFixed(2)), label: m };
      })
    });
  }
  return { kind: 'price.trend', term, series };
}

async function toolStockSnapshot({ userId }) {
  const uid = await getUserIdOrThrow(userId);
  for (const table of ['jarvis_stock', 'stock', 'scorte']) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', uid);
    if (!error && Array.isArray(data) && data.length) {
      return {
        kind: 'inventory.snapshot',
        elenco: data.map(r => ({
          name: r.name || r.prodotto || 'Articolo',
          qty: r.qty ?? r.quantity ?? r.qta ?? null,
          fill_pct: r.fill_pct ?? r.consumo_pct ?? r.remaining_pct ?? null,
          expires_at: r.expires_at ?? r.scadenza ?? null
        }))
      };
    }
  }
  return { kind: 'inventory.snapshot', elenco: [] };
}

async function toolShoppingTodo({ userId }) {
  const uid = await getUserIdOrThrow(userId);
  for (const table of ['jarvis_liste_prodotti', 'shopping_list', 'todo_spesa']) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      return {
        kind: 'shopping.read',
        items: data,
        note: data.length ? null : 'Nessuna lista trovata.'
      };
    }
  }
  return { kind: 'shopping.read', items: [], note: 'Nessuna lista trovata.' };
}

async function toolBestStore({ userId, term, days_back = 180 }) {
  const uid = await getUserIdOrThrow(userId);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days_back);

  const { data, error } = await supabase
    .from('jarvis_spese_casa')
    .select('store, name, price_each, purchase_date')
    .eq('user_id', uid);

  if (error) throw error;

  const q = String(term || '').toLowerCase().trim();
  const rows = (Array.isArray(data) ? data : [])
    .filter(r => `${r.name || ''}`.toLowerCase().includes(q))
    .filter(r => {
      const d = new Date(String(r.purchase_date || ''));
      return !isNaN(d) && d >= cutoff;
    });

  const m = new Map();
  rows.forEach(r => {
    const st = (r.store || 'Punto vendita').trim();
    const arr = m.get(st) || [];
    arr.push(Number(r.price_each || 0));
    m.set(st, arr);
  });

  const ranked = [...m.entries()]
    .map(([store, arr]) => ({
      store,
      n: arr.length,
      avg: arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    }))
    .filter(x => x.n > 0)
    .sort((a, b) => a.avg - b.avg);

  return { kind: 'price.best_store', term, results: ranked };
}

// “quando scade il latte?”
async function toolNextExpiry({ userId, term }) {
  const uid = await getUserIdOrThrow(userId);
  const like = `%${String(term||'').toLowerCase().trim()}%`;

  // prova tabelle scorte comuni e colonne di scadenza più usate
  const candidates = [
    { table: 'jarvis_stock', cols: ['name','qty','expires_at','scadenza'] },
    { table: 'stock',        cols: ['name','qty','expires_at','scadenza'] },
    { table: 'scorte',       cols: ['name','qty','expires_at','scadenza'] },
  ];

  for (const c of candidates) {
    // select flessibile: prendi * e filtra poi
    const { data, error } = await supabase
      .from(c.table)
      .select('*')
      .eq('user_id', uid)
      .ilike('name', like);

    if (error) continue;
    const rows = (Array.isArray(data) ? data : [])
      .map(r => ({
        name: r.name || r.prodotto || 'Articolo',
        qty: r.qty ?? r.quantity ?? r.qta ?? null,
        exp: r.expires_at ?? r.scadenza ?? null
      }))
      .filter(r => r.exp); // solo con scadenza
    if (!rows.length) continue;

    rows.sort((a,b) => (a.exp||'').localeCompare(b.exp||''));
    const soon = rows[0];
    return { kind: 'stock.next_expiry', term, item: soon, all: rows.slice(0,5) };
  }

  return { kind: 'stock.next_expiry', term, item: null, all: [] };
}

/* ===========================
   Intent parser (regole locali)
=========================== */
function parseQuickIntent(q = '') {
  const s = q.toLowerCase().trim();

  // 1) “quanto ho speso …”
  // oggi / questo mese / quest'anno
  if (/quanto\s+ho\s+spes[oa]/i.test(s) || /spes[ae]\s+di|spes[ae]\s+del/i.test(s)) {
    if (/\boggi\b/.test(s)) return { tool: 'spend.sum', args: { ref: 'today' } };
    if (/questa\s+settimana/.test(s)) return { tool: 'spend.sum', args: { ref: 'week' } };
    if (/quest['o]?\s*anno/.test(s)) return { tool: 'spend.sum', args: { ref: 'year' } };

    // mese esplicito: “a ottobre”, “di novembre 2024”, …
    const m = s.match(/\b(a|ad|di|del)\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(20\d{2}))?\b/i);
    if (m) {
      return { tool: 'spend.sum', args: { explicitMonth: m[2].toLowerCase(), explicitYear: m[3] ? Number(m[3]) : undefined } };
    }

    // “mese” generico → mese corrente
    if (/\bmese\b/.test(s) || /questo\s+mese/.test(s)) {
      return { tool: 'spend.sum', args: { ref: 'month' } };
    }
  }

  // 2) “in quali prodotti spendo di più”
  if (/in\s+quali\s+prodott[iy]\s+spendo\s+di\s+pi[uù]|top\s+prodott[iy]/i.test(s)) {
    return { tool: 'spend.top_products', args: { ref: 'month' } };
  }

  // 3) “dove costa meno il TERM …”
  // cattura tutto dopo “dove costa meno (il|la|lo|i|gli|le)?”
  const mBest = s.match(/dove\s+costa\s+meno\s+(?:il|la|lo|i|gli|le)?\s*(.+?)\??$/i);
  if (mBest) {
    return { tool: 'price.best_store', args: { term: mBest[1].trim() } };
  }

  // 4) “cosa ho in casa?”
  if (/cosa\s+ho\s+in\s+casa|scorte\b/i.test(s)) return { tool: 'stock.snapshot', args: {} };

  // 5) “cosa devo comprare?”
  if (/cosa\s+devo\s+comprare|lista\s+(spesa|da\s+comprare)/i.test(s)) return { tool: 'shopping.read', args: {} };

  // 6) “quando scade il latte?”
  const mExp = s.match(/quando\s+scad[ea]\s+(?:il|la|lo|i|gli|le)?\s*(.+?)\??$/i);
  if (mExp) {
    return { tool: 'stock.next_expiry', args: { term: mExp[1].trim() } };
  }

  return null;
}

/* ===========================
   Renderer semplice → testo/HTML
=========================== */
function render(result) {
  if (result.kind === 'finances.month_summary') {
    const { intervallo, total, transactions, top_stores } = result;
    const lines = (top_stores || []).map(r => `${r.store}: ${fmtEuro(r.amount)}`).join('\n');
    return { text: `📊 Spese — ${intervallo}\nTotale: ${fmtEuro(total)} • Transazioni: ${fmtInt(transactions)}\n\n${lines || ''}`, mono: true };
  }
  if (result.kind === 'products.top') {
    const lines = (result.items || []).map(p => `• ${p.name}: ${fmtEuro(p.amount)}`).join('\n');
    return { text: `🏷️ Prodotti su cui spendi di più\n${lines || '—'}`, mono: true };
  }
  if (result.kind === 'price.trend') {
    const svgs = (result.series || []).slice(0, 2).map(s => {
      const points = (s.points || []).map((p, i) => ({ x: i, y: p.y }));
      const svg = svgLine(points, { label: `${s.store} — ${result.term}` });
      return `<div style="margin:6px 0">${svg}</div>`;
    }).join('');
    return { text: svgs || 'Nessun dato prezzi', mono: false };
  }
  if (result.kind === 'inventory.snapshot') {
    const rows = (result.elenco || []).slice(0, 30).map(s => `• ${s.name} — ${s.qty ?? '—'}`).join('\n');
    return { text: `🏠 Scorte (snapshot)\n${rows || '—'}`, mono: true };
  }
  if (result.kind === 'shopping.read') {
    const rows = (result.items || []).slice(0, 30).map(x => `• ${x.name || x.item || x.prodotto || 'Voce'}${x.qty ? ` × ${x.qty}` : ''}`).join('\n');
    return { text: `🛒 Cose da comprare\n${rows || '—'}${result.note ? `\n\n${result.note}` : ''}`, mono: true };
  }
  if (result.kind === 'price.best_store') {
    const rows = (result.results || []).slice(0, 5).map(b => `• ${b.store}: ~ ${fmtEuro(b.avg)} (su ${fmtInt(b.n)})`).join('\n');
    return { text: rows ? `📍 Dove conviene “${result.term}”\n${rows}` : `Nessun prezzo recente per “${result.term}”.`, mono: true };
  }
  if (result.kind === 'stock.next_expiry') {
    if (!result.item) return { text: `⏳ Nessuna scadenza trovata per “${result.term}”.`, mono: true };
    const soon = result.item;
    const extra = (result.all || []).slice(1).map(x => `• ${x.name} → ${x.exp}`).join('\n');
    return { text: `⏳ Scadenza più vicina per “${result.term}”\n• ${soon.name}${soon.qty ? ` × ${soon.qty}` : ''} → ${soon.exp}${extra ? `\n\nAltre scadenze:\n${extra}` : ''}`, mono: true };
  }
  return { text: JSON.stringify(result, null, 2), mono: true };
}

/* ===========================
   Public API
=========================== */
export async function runQueryFromTextLocal(text, opts = {}) {
  const { userId: passedUserId, user_id } = opts || {};
  const uid = await getUserIdOrThrow(passedUserId || user_id);

  // intent base
  const intent = parseQuickIntent(text || '');

  // mese esplicito: se presente, calcola subito il range e chiama spend.sum con explicitRange
  if (intent?.tool === 'spend.sum' && intent.args?.explicitMonth) {
    const range = monthBoundsByName(intent.args.explicitMonth, intent.args.explicitYear);
    const fallback = bounds('month');
    return render(await toolSpendSum({
      userId: uid,
      explicitRange: range || fallback
    }));
  }

  if (intent) {
    if (intent.tool === 'spend.sum')              return render(await toolSpendSum({ userId: uid, ...intent.args }));
    if (intent.tool === 'spend.top_products')     return render(await toolTopProducts({ userId: uid, ...intent.args }));
    if (intent.tool === 'price.trend')            return render(await toolPriceTrend({ userId: uid, ...intent.args }));
    if (intent.tool === 'stock.snapshot')         return render(await toolStockSnapshot({ userId: uid }));
    if (intent.tool === 'shopping.read')          return render(await toolShoppingTodo({ userId: uid }));
    if (intent.tool === 'price.best_store')       return render(await toolBestStore({ userId: uid, ...intent.args }));
    if (intent.tool === 'stock.next_expiry')      return render(await toolNextExpiry({ userId: uid, ...intent.args }));
  }

  // fallback neutro
  return { kind: 'noop', note: 'no_intent' };
}

export default { runQueryFromTextLocal };
