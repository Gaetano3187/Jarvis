// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

const PAYDAY_DAY = 10;
const CATEGORY_ID_VARIE = '075ce548-15a9-467c-afc8-8b156064eeb6';

/* --------------------------- helpers --------------------------- */
function isoLocal(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}
function computeCurrentPayPeriod(today, paydayDay) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const thisPayday = new Date(y, m, paydayDay);
  let start, end;
  if (d >= paydayDay) { start = thisPayday; end = new Date(y, m + 1, paydayDay - 1); }
  else { start = new Date(y, m - 1, paydayDay); end = new Date(y, m, paydayDay - 1); }
  const startDate = isoLocal(start);
  const endDate = isoLocal(end);
  const monthKey = isoLocal(end).slice(0, 7);
  return { startDate, endDate, monthKey };
}
function parseAmountLoose(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g,'').replace(/\./g,'').replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : 0;
}

/* ===== Importi dal parlato ===== */
// 1) numeri arabi (evita di “catturare” i giorni della data, preferisce il max ≥ 1)
function parseMoneyFromDigits(text='') {
  const s = String(text || '').toLowerCase().replace(/\s+/g,' ').trim();
  const re = /[-+]?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?|[-+]?\d+(?:[.,]\d+)?/g;
  const vals = [];
  for (const m of s.matchAll(re)) {
    const raw = m[0].replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',', '.'); // “1.000,50” → “1000.50”
    const n = Number(raw);
    if (Number.isFinite(n)) vals.push(Math.abs(n));
  }
  if (!vals.length) return 0;
  const ge1 = vals.filter(n => n >= 1);
  return ge1.length ? Math.max(...ge1) : vals[0];
}

// 2) numeri ITA in lettere più comuni (duecento, cinquecento, mille, duemila, …)
function parseMoneyFromWordsIT(text='') {
  const s = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const dict = new Map(Object.entries({
    dieci:10, venti:20, trenta:30, quaranta:40, cinquanta:50, sessanta:60, settanta:70, ottanta:80, novanta:90,
    cento:100, duecento:200, trecento:300, quattrocento:400, cinquecento:500, seicento:600, settecento:700, ottocento:800, novecento:900,
    mille:1000, duemila:2000, tremila:3000, quattromila:4000, cinquemila:5000
  }));
  // prova pattern “… <word> euro …”
  const m = s.match(/\b([a-z]+)\s*euro\b/);
  if (m) {
    const w = m[1];
    if (dict.has(w)) return dict.get(w);
  }
  // fallback: cerca qualsiasi parola nota
  for (const [w, val] of dict.entries()) {
    if (s.includes(` ${w} `) || s.endsWith(` ${w}`) || s.startsWith(`${w} `)) return val;
  }
  return 0;
}

// wrapper: prima cifre, poi parole ITA
function parseMoneyFromText(t='') {
  const n1 = parseMoneyFromDigits(t);
  if (n1 && n1 > 0) return n1;
  const n2 = parseMoneyFromWordsIT(t);
  return n2 > 0 ? n2 : 0;
}

/* ===== Date dal parlato ===== */
function pickDateFromText(t='') {
  const s = String(t).toLowerCase();
  if (/\boggi\b/.test(s))   return isoLocal(new Date());
  if (/\bieri\b/.test(s))  { const d = new Date(); d.setDate(d.getDate()-1); return isoLocal(d); }
  if (/\bdomani\b/.test(s)){ const d = new Date(); d.setDate(d.getDate()+1); return isoLocal(d); }
  const m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) {
    const dd = String(m[1]).padStart(2,'0'), mm = String(m[2]).padStart(2,'0');
    let yy = String(m[3]); if (yy.length===2) yy = (Number(yy)>=70?'19':'20')+yy;
    return `${yy}-${mm}-${dd}`;
  }
  return isoLocal(new Date());
}

/* ===== Intent dal parlato ===== */
// Tasca: +ricarica / -uscita
function detectPocketIntent(text='') {
  const s = String(text).toLowerCase();
  let amount = parseMoneyFromText(s);
  if (!amount) return null;

  // molteplici sinonimi + flessioni
  const POS = /(in\s+tasca|in\s+portafogli\w*|borsell\w*|mess[ioae]\b|ricaric\w*|preliev\w*|cash\s*in|aggiunt[oa]\s+in\s+tasca|metti\w*\s+in\s+tasca)/i;
  const NEG = /(uscita\s+contanti|spes[ao]\s+in\s+contanti|pagat[oa]\s+in\s+contanti|tolto|pres[oa]\s+dalla\s+tasca|dato\s+contanti|cash\s*out|levat[oa]\s+in\s+contanti)/i;

  const isPos = POS.test(s) || /\btasca\b/.test(s) || /\bcontanti\b/.test(s);
  const isNeg = NEG.test(s);

  const dateISO = pickDateFromText(s);
  if (isNeg) return { delta: -Math.abs(amount), dateISO, note: 'Uscita contanti (voce)' };
  if (isPos) return { delta: +Math.abs(amount), dateISO, note: 'Ricarica contanti (voce)' };
  return null;
}

// Entrate: “ho incassato 1000”, “mi ha pagato Rossi”, “stipendio 1500”
function detectIncomeIntent(text='') {
  const s = String(text || '').toLowerCase();
  const amount = parseMoneyFromText(s);
  if (!amount) return null;
  const dateISO = pickDateFromText(s);

  let source = 'Entrata';
  if (/\bstipendio|paga|salario|mensilit[àa]\b/.test(s)) source = 'Stipendio';
  else if (/\bincass|incasso|fattur|bonific|rimborso\b/.test(s)) source = 'Incasso';
  else if (/\bmi ha pagato\b/.test(s)) source = 'Pagamento ricevuto';

  const payerMatch = s.match(/\b(?:da|dal|dalla|dai|dalle|dal\s+signor|dal\s+sig\.?|dalla\s+signora|sig\.?|sig\.ra|signor|signora)\s+([a-zà-ù' ]{2,40})/i);
  if (payerMatch) {
    const name = titleize(payerMatch[1].replace(/\b(euro|€)\b/gi,'').trim());
    source = (source === 'Entrata') ? `Pagamento da ${name}` : `${source} da ${name}`;
  }
  return { source, description: source, amount: Math.abs(amount), dateISO };
}
/* ===== Spesa in contanti dal parlato ===== */
function normalizeIT(s='') {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // togli accenti
    .replace(/\s+/g,' ')
    .trim();
}

/** Estrae il nome esercizio dopo "a/da/presso <nome>" fermandosi prima di "per/di/da/alle/alle ore/€..." */
function extractStoreName(text='') {
  const s = normalizeIT(text);
  // esempi: "ho speso 10 euro a orsini market", "ho speso 20 euro da casacchia per le sigarette"
  const m = s.match(/\b(?:a|da|presso)\s+([a-z0-9'.\-& ]{2,50})\b/);
  if (!m) return null;
  let store = m[1]
    .replace(/\b(per|di|da|alle|all[ao]s?|ore|euro|€)\b.*$/,'') // tronca frasi successive
    .replace(/\s{2,}/g,' ')
    .trim();
  // capitalizza
  store = titleize(store);
  return store || null;
}

/** Categoria rapida in base a parole chiave (puoi ampliare liberamente) */
function inferCategory(text='') {
  const s = normalizeIT(text);
  if (/\b(tabac|sigarett|sifigarette|sigr|fum[oi])\b/.test(s)) return 'varie'; // tabaccheria -> "varie"
  if (/\b(supermercat|market|spes[ae]|coop|conad|carrefour|esselunga|md|lid[li])\b/.test(s)) return 'spese-casa';
  if (/\b(bar|caffe|aperitiv|pizzeria|ristorant|pub|bistrot|braceria|sushi|enoteca)\b/.test(s)) return 'cene-aperitivi';
  if (/\b(scarp|maglion|pantalon|camici|indument|vestit)\b/.test(s)) return 'vestiti-altro';
  return 'varie';
}

/** Se rileva "ho speso ..." o simili, ritorna una spesa in contanti */
function detectCashExpenseIntent(text='') {
  const raw = String(text || '');
  const s = normalizeIT(raw);

  // trigger di spesa
  if (!/\b(ho\s+speso|abbiam|pagat[oa]|spes[ao]|mi\s+e'?|e'?\s+costat[oa])\b/.test(s)) return null;

  const amount = parseMoneyFromText(s);
  if (!amount) return null;

  const dateISO = pickDateFromText(s);

  // negozio/luogo
  let store = extractStoreName(raw) || 'Punto vendita';
  // prefisso "Tabaccheria" se parole chiave
  if (/\b(tabac|sigarett|sifigarette|fum[oi])\b/.test(s) && !/^tabaccheria/i.test(store)) {
    store = `Tabaccheria ${store}`;
  }

  const category = inferCategory(raw);

  // descrizione libera (es. “sigarette” se presente)
  let descr = 'Spesa contanti';
  const md = s.match(/\bper\s+([a-z0-9'.\-& ]{2,60})$/i) || s.match(/\bper\s+([a-z0-9'.\-& ]{2,60})\b/i);
  if (md) descr = titleize(md[1].trim());
  else if (/\bsigar|tabac\b/.test(s)) descr = 'Sigarette';

  return {
    category,
    store,
    amount: Math.abs(amount),
    dateISO,
    description: descr,
    payment_method: 'cash',
  };
}

/** Inserisce velocemente una spesa nel ledger unificato (jarvis_finances) come pagamento in contanti */
async function insertFinanceExpenseByVoice(exp) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sessione scaduta');

  const payload = {
    user_id: user.id,
    category: exp.category || 'varie',
    store: exp.store || 'Punto vendita',
    purchase_date: exp.dateISO || isoLocal(new Date()),
    price_total: Number(exp.amount || 0),
    payment_method: 'cash',                 // ⚠️ fondamentale: così scala “Soldi in tasca”
    link_label: null,                       // facoltativo (si auto-costruisce la route)
    link_path: null,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('jarvis_finances').insert(payload);
  if (error) throw error;
}


function formatIT(iso) {
  if (!iso) return '';
  const [y,m,d] = String(iso).split('-').map(Number);
  return new Date(y,(m??1)-1,d??1).toLocaleDateString('it-IT');
}
function showError(setter, err) {
  const msg = err?.message || err?.error_description || err?.hint || err?.details || (typeof err === 'string' ? err : JSON.stringify(err));
  setter(msg);
  // log esteso
  try {
    console.group('[SUPABASE ERROR]');
    console.error(err);
    if (err && typeof err === 'object') {
      console.error('details:', err.details);
      console.error('hint:', err.hint);
      console.error('code:', err.code);
      console.error('message:', err.message);
    }
    console.groupEnd();
  } catch {}
}

function titleize(s='') {
  return String(s).toLowerCase().replace(/(^|\s|-)\p{L}/gu, m => m.toUpperCase());
}

/* —— classificazione esercizio (solo per etichetta) —— */
function isRestaurantBar(store='') {
  const s = String(store).toLowerCase();
  return /\b(ristorante|trattoria|pizzeria|bar|pub|bistrot|osteria|sushi|braceria|enoteca)\b/i.test(s);
}
// Evita virgole finali nei select Supabase
function sbSelect(cols = []) {
  if (!Array.isArray(cols)) return '*';
  const list = cols.filter(Boolean).map(String).map((s) => s.trim()).filter((s) => s.length > 0);
  return list.length ? list.join(',') : '*';
}



/* —— carryover mese corrente —— */
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  const { data: existing } = await supabase
    .from('carryovers').select('id')
    .eq('user_id', userId).eq('month_key', monthKeyCurrent).maybeSingle();
  if (existing) return;

  const [yy, mm] = monthKeyCurrent.split('-').map(Number);
  const prevEnd = new Date(yy, mm-1, 0);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
  const prevStartISO = isoLocal(prevStart), prevEndISO = isoLocal(prevEnd);
  const prevKey = prevEndISO.slice(0,7);

  const { data: incPrev } = await supabase.from('incomes')
    .select('amount, received_date, received_at')
    .eq('user_id', userId)
    .or(
      `and(received_date.gte.${prevStartISO},received_date.lte.${prevEndISO}),`+
      `and(received_at.gte.${prevStartISO}T00:00:00,received_at.lte.${prevEndISO}T23:59:59)`
    );

  const { data: expPrev } = await supabase.from('jarvis_finances')
    .select('price_total, purchase_date')
    .eq('user_id', userId)
    .gte('purchase_date', prevStartISO)
    .lte('purchase_date', prevEndISO);

  const { data: coPrev } = await supabase.from('carryovers')
    .select('amount').eq('user_id', userId).eq('month_key', prevKey).maybeSingle();

  const totalInc = (incPrev||[]).reduce((t,r)=>t+Number(r.amount||0),0);
  const totalExp = (expPrev||[]).reduce((t,r)=>t+Number(r.price_total||0),0);
  const prevCarry = Number(coPrev?.amount||0);
  const saldoPrevBase = totalInc + prevCarry - totalExp;

  await supabase.from('carryovers').insert({
    user_id: userId, month_key: monthKeyCurrent,
    amount: Number(saldoPrevBase.toFixed(2)),
    note: 'Auto-carryover da mese precedente'
  });
}

/* --------------------------- component --------------------------- */
function Entrate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [incomes, setIncomes] = useState([]);
  const [newIncome, setNewIncome] = useState({ source: 'Stipendio', description: '', amount: '', receivedAt: '' });

  const [carryover, setCarryover] = useState(null);
  const [newCarry, setNewCarry] = useState({ amount: '', note: '' });

  const [pocketRows, setPocketRows] = useState([]); // manual + spese con link
  const [pocketTopUp, setPocketTopUp] = useState('');
  const [monthExpenses, setMonthExpenses] = useState(0);

  const [showAddIncome, setShowAddIncome] = useState(false);
  const [showAddCarry, setShowAddCarry] = useState(false);
  const [showAddPocket, setShowAddPocket] = useState(false);

  // OCR / VOCE
  const ocrInputRef = useRef(null);
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  const [hideVarieCashAfterClear, setHideVarieCashAfterClear] = useState(false);

  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY);
  const startDateIT = formatIT(startDate);
  const endDateIT = formatIT(endDate);
  const dateStartTS = `${startDate}T00:00:00`;
  const dateEndTS   = `${endDate}T23:59:59`;

  useEffect(() => {
    loadAll();
    return () => {
      try { if (mediaRecRef.current?.state === 'recording') mediaRecRef.current.stop(); } catch {}
      try { streamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, hideVarieCashAfterClear]);

  async function loadAll() {
    setLoading(true); setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error('Sessione scaduta');

      await ensureCarryoverAuto(user.id, monthKey);

      // Entrate periodo
      const { data: inc, error: incErr } = await supabase
        .from('incomes')
        .select('id, source, description, amount, received_at, received_date')
        .eq('user_id', user.id)
        .or(
          `and(received_date.gte.${startDate},received_date.lte.${endDate}),` +
          `and(received_at.gte.${dateStartTS},received_at.lte.${dateEndTS})`
        )
        .order('received_at', { ascending: false, nullsFirst: false })
        .order('received_date', { ascending: false, nullsFirst: false });
      if (incErr) throw incErr;
      setIncomes(inc || []);

      // Carryover mese
      const { data: co } = await supabase
        .from('carryovers')
        .select('id, month_key, amount, note')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle();
      setCarryover(co || null);

      // Movimenti contanti manuali
      const { data: pc } = await supabase
        .from('pocket_cash')
        .select('id, created_at, moved_at, moved_date, note, delta, amount, direction')
        .eq('user_id', user.id)
        .gte('moved_date', startDate).lte('moved_date', endDate)
        .order('moved_at', { ascending: false }).order('created_at', { ascending: false });

      const manualRows = (pc || []).map((row) => {
        const eff = (row.delta != null)
          ? Number(row.delta || 0)
          : (row.amount != null ? (row.direction === 'in' ? 1 : -1) * Number(row.amount || 0) : 0);
        const dateISO = (row.moved_date || (row.moved_at || row.created_at || '').slice(0,10));
        return {
          id: `pc-${row.id}`,
          dateISO,
          label: row.note?.trim() || (eff >= 0 ? 'Ricarica contanti' : 'Uscita contanti'),
          amount: Number(eff || 0),
          kind: 'manual',
        };
      });

/* ===================== heads ledger + fallback categorie ===================== */
const CAT_TO_ROUTE = {
  'spese-casa': '/spese-casa',
  'cene-aperitivi': '/cene-aperitivi',
  'vestiti-altro': '/vestiti-altro',
  'varie': '/varie',
};

let finHeads = [];
const { data: finHeadsLedger } = await supabase
  .from('jarvis_finances')
  .select('id, receipt_id, category, store, purchase_date, price_total, payment_method, link_label, link_path, created_at')
  .eq('user_id', user.id)
  .in('category', ['spese-casa','cene-aperitivi','vestiti-altro','varie'])
  .gte('purchase_date', startDate)
  .lte('purchase_date', endDate)
  .order('purchase_date', { ascending: false })
  .order('created_at', { ascending: false });

if (Array.isArray(finHeadsLedger)) finHeads = [...finHeadsLedger];

// Fallback: se il ledger non ha nulla, leggo le tabelle categoria e normalizzo
const readCat = async (table, category) => {
  const { data } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', user.id)
    .gte('purchase_date', startDate)
    .lte('purchase_date', endDate);
  const rows = Array.isArray(data) ? data : [];
  return rows.map(r => ({
    id:             r.id ?? null,                  // ⬅️ aggiunto
    receipt_id:     r.receipt_id ?? r.rid ?? null,
    category,
    store:          r.store ?? r.merchant ?? r.name ?? 'Punto vendita',
    purchase_date:  r.purchase_date ?? (r.created_at || '').slice(0,10),
    price_total:    Number(r.price_total ?? r.total_paid ?? r.total ?? 0),
    payment_method: r.payment_method ?? null,
    link_label:     r.link_label ?? null,
    link_path:      r.link_path  ?? null,
    created_at:     r.created_at ?? null,
  }));
};


if (!finHeads.length) {
  const [sc, ca, va, vr] = await Promise.all([
    readCat('jarvis_spese_casa',     'spese-casa'),
    readCat('jarvis_cene_aperitivi', 'cene-aperitivi'),
    readCat('jarvis_vestiti_altro',  'vestiti-altro'),
    readCat('jarvis_varie',          'varie'),
  ]);
  finHeads = [...sc, ...ca, ...va, ...vr];
}

// Raggruppa: 1 riga per receipt_id (o store+data+categoria), usando headTotal oppure linesSum
// Raggruppa: 1 riga per receipt_id (o store+data+categoria), tenendo lista completa degli ID
const groupFinHeads = (heads = []) => {
  const map = new Map();
  for (const h of (heads || [])) {
    const dateISO = h.purchase_date || '';
    const cat     = h.category || 'spese-casa';
    const store   = h.store || '';
    const key = h.receipt_id
      ? `rid:${h.receipt_id}`
      : `sd:${String(store).toLowerCase().trim()}|${dateISO}|${cat}`;

    const isHead = Boolean(
      (h.link_label && String(h.link_label).trim()) ||
      (h.link_path  && String(h.link_path ).trim())
    );

    const g = map.get(key) || {
      receipt_id:     h.receipt_id || null,
      category:       cat,
      store,
      dateISO,
      payment_method: h.payment_method || '',
      link_label:     h.link_label     || '',
      link_path:      h.link_path      || '',
      headTotal: 0,
      linesSum:  0,
      ids: [], // ⬅️ accumulo id concreti
    };

    // aggiorna metadati più “pieni”
    if (!g.store && store) g.store = store;
    if (!g.link_label && h.link_label) g.link_label = h.link_label;
    if (!g.link_path  && h.link_path)  g.link_path  = h.link_path;
    if (!g.payment_method && h.payment_method) g.payment_method = h.payment_method;

    // accumula importi
    const val = Number(h.price_total || 0);
    if (isHead) g.headTotal = Math.max(g.headTotal, val); else g.linesSum += val;

    // accumula id se presente
    if (h.id) g.ids.push(h.id);

    map.set(key, g);
  }

  return Array.from(map.values()).map(g => {
    const isCash = /^(cash|contanti)$/i.test(String(g.payment_method || ''));
    const monthParam = (g.dateISO || '').slice(0,7);
    const baseTxt =
      g.category === 'cene-aperitivi' ? 'Cena/Aperitivo' :
      g.category === 'vestiti-altro'  ? 'Vestiti/Altro'  :
      g.category === 'varie'          ? 'Varie'          : 'Spesa';

    const total = g.headTotal > 0 ? g.headTotal : g.linesSum;
    const tot = Number((total || 0).toFixed(2));
    const dateIT = g.dateISO ? new Date(g.dateISO).toLocaleDateString('it-IT') : '';
    const defaultLabel = `${baseTxt} ${g.store || 'Punto vendita'}${dateIT ? ` (${dateIT})` : ''}`;

    const CAT_TO_ROUTE = {
      'spese-casa': '/spese-casa',
      'cene-aperitivi': '/cene-aperitivi',
      'vestiti-altro': '/vestiti-altro',
      'varie': '/varie',
    };
    const routeBase = CAT_TO_ROUTE[g.category] || '/spese-casa';
    const defaultPath = g.receipt_id
      ? `${routeBase}?rid=${encodeURIComponent(g.receipt_id)}&month=${monthParam}`
      : `${routeBase}?store=${encodeURIComponent(g.store||'')}&date=${encodeURIComponent(g.dateISO||'')}&month=${monthParam}`;

    const route = (g.link_path && g.link_path.trim())
      ? `${g.link_path}${g.link_path.includes('?') ? '&' : '?'}month=${monthParam}`
      : defaultPath;

    return {
      id: `${g.category}-${g.receipt_id || `${g.store}|${g.dateISO}`}`,
      kind: 'expense-linked',
      dateISO: g.dateISO,
      label: (g.link_label && g.link_label.trim()) ? g.link_label : defaultLabel,
      route,
      displayAmount: -tot,
      amount: isCash ? -tot : 0,
      affectsPocket: isCash,
      meta: {
        receipt_id: g.receipt_id || null,
        category: g.category || 'spese-casa',
        store: g.store || '',
        dateISO: g.dateISO || '',
        ids: Array.from(new Set(g.ids)).filter(Boolean), // ⬅️ lista unica di id concreti
      },
    };
  });
};

const expenseRows = groupFinHeads(finHeads);

// Merge + ordine
const filteredManual = hideVarieCashAfterClear
  ? manualRows.filter(r => r.kind !== 'manual' || r.category_id !== CATEGORY_ID_VARIE)
  : manualRows;
const rows = [...expenseRows, ...filteredManual]
  .filter(r => Number.isFinite(r.amount) || Number.isFinite(r.displayAmount))
  .sort((a,b) => (b.dateISO || '').localeCompare(a.dateISO || ''));
setPocketRows(rows);

// Totale spese periodo (ledger)
const { data: exp, error: expErr } = await supabase
  .from('jarvis_finances')
  .select('price_total,purchase_date')
  .eq('user_id', user.id)
  .gte('purchase_date', startDate)
  .lte('purchase_date', endDate);
if (!expErr && Array.isArray(exp)) {
  const totalExp = exp.reduce((t, r) => t + Number(r.price_total || 0), 0);
  setMonthExpenses(totalExp);
}


    } catch (err) {
      showError(setError, err);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------- Assistant (OCR/voce) ---------------------- */
  function buildIncomePrompt(userText) {
    const today = isoLocal(new Date());
    const example = JSON.stringify({
      type: 'income',
      items: [{ source: 'Stipendio', description: 'Stipendio', amount: 1500, receivedAt: today }],
    });
    return [
      'Sei Jarvis. Estrai ENTRATE economiche (stipendio, pagamenti, rimborsi).',
      'Rispondi SOLO con JSON:', example, '', 'Testo:', userText,
    ].join('\n');
  }
  async function callAssistant(prompt) {
    const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    const { answer, error: apiErr } = await res.json();
    if (!res.ok || apiErr) throw new Error(apiErr || String(res.status));
    return JSON.parse(answer);
  }

  async function insertPocketQuick({ amount, date, delta, note }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');
    const payload = {
      user_id: user.id,
      note: note || (delta >= 0 ? 'Ricarica contanti' : 'Uscita contanti'),
      delta: (typeof delta === 'number') ? delta : Math.abs(amount),
      moved_at: `${(date || isoLocal(new Date()))}T12:00:00Z`,
    };
    const { error } = await supabase.from('pocket_cash').insert(payload);
    if (error) throw error;
  }
  async function insertIncomeAssistant(text) {
    const data = await callAssistant(buildIncomePrompt(text));
    if (data.type !== 'income' || !Array.isArray(data.items) || !data.items.length) return false;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');
    for (const it of data.items) {
      const dataIncasso = it.receivedAt || isoLocal(new Date());
      const amount = Math.abs(parseAmountLoose(it.amount));
      const payload = {
        user_id: user.id,
        source: it.source || 'Entrata',
        description: it.description || it.source || 'Entrata',
        amount,
        received_at: `${dataIncasso}T12:00:00Z`,
      };
      const { error } = await supabase.from('incomes').insert(payload);
      if (error) throw error;
    }
    return true;
  }

  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      const fd = new FormData(); files.forEach((f)=>fd.append('images', f));
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const { text } = await res.json();

      if (/(prelev|contanti|cash)/i.test(text)) {
        const m = text.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/);
        if (m) {
          await insertPocketQuick({
            amount: parseAmountLoose(m[1]),
            date: isoLocal(new Date()),
            delta: parseAmountLoose(m[1]),
            note: 'Ricarica contanti'
          });
          await loadAll(); return;
        }
      }
      const ok = await insertIncomeAssistant(text);
      if (ok) { await loadAll(); return; }

      setError('Nessun dato riconosciuto da OCR');
    } catch (err) {
      showError(setError, err);
    }
  }
// ⬇️ Sostituisci tutta la tua funzione toggleRec con questa versione robusta
const toggleRec = async () => {
  // Se sto registrando → STOP sicuro
  if (recBusy) {
    try {
      // chiamo stop solo se esiste e sta registrando
      const mr = mediaRecRef.current;
      if (mr && mr.state === 'recording') {
        mr.requestData?.(); // chiedi l'ultimo chunk
        mr.stop();
      }
    } catch (e) {
      console.warn('Stop recorder error:', e);
    }
    return;
  }

  // Altrimenti → START
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    recordedChunks.current = [];

    // Scegli un mime supportato dal browser
    let mimeType = '';
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported?.('audio/webm')) mimeType = 'audio/webm';
      else if (MediaRecorder.isTypeSupported?.('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';
      else mimeType = ''; // lascia decidere al browser
    }

    mediaRecRef.current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    // Arrivo dei chunk
    mediaRecRef.current.ondataavailable = (e) => {
      if (e.data && e.data.size) recordedChunks.current.push(e.data);
    };

    // Funzione che attende il primo chunk dopo lo stop (max ~1s) e invia
    const finalizeAfterStop = async () => {
      try {
        // attendo finché ho almeno un chunk o scade il timeout
        const started = Date.now();
        while (recordedChunks.current.length === 0 && Date.now() - started < 1200) {
          await new Promise(r => setTimeout(r, 50));
        }

        if (!recordedChunks.current.length) {
          throw new Error('Nessun audio ricevuto dal microfono');
        }

        // Costruisci il Blob dal miglior tipo disponibile
        const firstType = recordedChunks.current[0].type || 'audio/webm';
        const blob = new Blob(recordedChunks.current, { type: firstType });

        const fd = new FormData();
        fd.append('audio', blob, firstType.includes('ogg') ? 'voice.ogg' : 'voice.webm');

        const r = await fetch('/api/stt', { method: 'POST', body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.text) throw new Error('STT fallito');

        const spoken = String(j.text || '').trim();
        if (!spoken) { setError('Trascrizione vuota'); return; }

        // ✅ 1) Spesa in contanti dal parlato
        const exp = detectCashExpenseIntent(spoken);
        if (exp) {
          await insertFinanceExpenseByVoice(exp);
          await loadAll();
          return;
        }

        // 2) Tasca (ricarica/uscita)
        const pocket = detectPocketIntent(spoken);
        if (pocket) {
          await insertPocketQuick({
            amount: Math.abs(pocket.delta),
            date:   pocket.dateISO,
            delta:  pocket.delta,
            note:   pocket.note
          });
          await loadAll();
          return;
        }

        // 3) Entrate locali
        const inc = detectIncomeIntent(spoken);
        if (inc) {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Sessione scaduta');
          await supabase.from('incomes').insert({
            user_id:     user.id,
            source:      inc.source,
            description: inc.description,
            amount:      inc.amount,
            received_at: `${inc.dateISO}T12:00:00Z`,
          });
          await loadAll();
          return;
        }

        // 4) Fallback Assistant
        const ok = await insertIncomeAssistant(spoken);
        if (ok) await loadAll();
        else setError('Nessun dato riconosciuto dalla voce');

      } catch (e) {
        showError(setError, e);
      } finally {
        setRecBusy(false);
        try { streamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
        streamRef.current = null;
      }
    };

    mediaRecRef.current.onstop = finalizeAfterStop;

    // Avvio: uso timeslice così arrivano chunk mentre registro (importante per onstop)
    mediaRecRef.current.start(250);
    setRecBusy(true);

  } catch (err) {
    setRecBusy(false);
    setError('Microfono non disponibile');
    try { streamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
    streamRef.current = null;
  }
};


  /* --------------------------------- CRUD ---------------------------------- */
  async function handleAddIncome(e) {
    e.preventDefault(); setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr; if (!user) throw new Error('Sessione scaduta');
      const payload = {
        user_id: user.id,
        source: newIncome.source || 'Entrata',
        description: newIncome.description || newIncome.source || 'Entrata',
        amount: Math.abs(parseAmountLoose(newIncome.amount)),
        received_at: (newIncome.receivedAt ? `${newIncome.receivedAt}T12:00:00Z` : new Date().toISOString()),
      };
      const { error } = await supabase.from('incomes').insert(payload);
      if (error) throw error;
      setNewIncome({ source: 'Stipendio', description: '', amount: '', receivedAt: '' });
      await loadAll();
    } catch (err) { showError(setError, err); }
  }
  async function handleDeleteIncome(id) {
    try {
      const { error: e } = await supabase.from('incomes').delete().eq('id', id);
      if (e) throw e;
      setIncomes(incomes.filter((i) => i.id !== id));
    } catch (err) { showError(setError, err); }
  }
 // helper: normalizza store per confronti "elastici"
function normStore(s='') {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

function normStore(s='') {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

// normalizza lo store per confronti affidabili
function normStore(s='') {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // accenti
    .replace(/\s+/g,' ')
    .trim();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function normStore(s='') {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

async function handleDeletePocketRow(row) {
  if (!row) return;
  if (!confirm('Eliminare definitivamente questa spesa?')) return;

  try {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    if (!user) throw new Error('Sessione scaduta');

    // A) pocket_cash (manuale)
    if (row.kind === 'manual') {
      const pid = String(row.id || '').startsWith('pc-') ? row.id.slice(3) : null;
      if (!pid) throw new Error('ID pocket non valido');
      const { error } = await supabase
        .from('pocket_cash')
        .delete()
        .eq('user_id', user.id)
        .eq('id', pid);
      if (error) throw error;

      setPocketRows(prev => prev.filter(r => r.id !== row.id));
      await loadAll();
      return;
    }

    // B) ledger + legacy
    const m = row.meta || {};
    const dateISO = (m.dateISO || row.dateISO || '').slice(0,10);
    const rawStore = m.store || row.label || '';
    const storeNorm = normStore(rawStore);
    const category = m.category || 'spese-casa';

    // 1) ID reali dal ledger (filtrati a UUID)
    let ids = Array.isArray(m.ids) ? m.ids.filter(id => typeof id === 'string' && UUID_RE.test(id)) : [];
    if (ids.length > 0) {
      // chunk in blocchi da 100 (evita URL troppo lunghi)
      const chunk = (arr, n) => arr.reduce((a,_,i)=> (i % n ? a : [...a, arr.slice(i, i+n)]), []);
      for (const part of chunk(ids, 100)) {
        const { error } = await supabase
          .from('jarvis_finances')
          .delete()
          .eq('user_id', user.id)
          .in('id', part);
        if (error) throw error;
      }
    } else if (m.receipt_id && UUID_RE.test(String(m.receipt_id))) {
      // 2) receipt_id
      const { error } = await supabase
        .from('jarvis_finances')
        .delete()
        .eq('user_id', user.id)
        .eq('receipt_id', m.receipt_id);
      if (error) throw error;
    } else {
      // 3) Fallback: stessa data + store (ilike) + categoria
      // Leggo i candidati del giorno/categoria e filtro per store normalizzato
      const { data: candidates, error: qErr } = await supabase
        .from('jarvis_finances')
        .select('id, store')
        .eq('user_id', user.id)
        .eq('category', category)
        .eq('purchase_date', dateISO);
      if (qErr) throw qErr;

      const toDel = (candidates || [])
        .filter(r => normStore(r.store) === storeNorm)
        .map(r => r.id)
        .filter(id => UUID_RE.test(String(id)));

      if (toDel.length > 0) {
        const chunk = (arr, n) => arr.reduce((a,_,i)=> (i % n ? a : [...a, arr.slice(i, i+n)]), []);
        for (const part of chunk(toDel, 100)) {
          const { error } = await supabase
            .from('jarvis_finances')
            .delete()
            .eq('user_id', user.id)
            .in('id', part);
          if (error) throw error;
        }
      }
    }

    // 4) Pulisci anche le legacy (se qualche pagina le usa ancora)
    const legacyMap = {
      'spese-casa': 'jarvis_spese_casa',
      'cene-aperitivi': 'jarvis_cene_aperitivi',
      'vestiti-altro': 'jarvis_vestiti_altro',
      'varie': 'jarvis_varie',
    };
    const tables = ['jarvis_spese_casa','jarvis_cene_aperitivi','jarvis_vestiti_altro','jarvis_varie'];
    const primaryLegacy = legacyMap[category];
    if (primaryLegacy && !tables.includes(primaryLegacy)) tables.unshift(primaryLegacy);

    for (const t of tables) {
      // Seleziono del giorno e confronto store normalizzato
      const { data: legRows, error: lErr } = await supabase
        .from(t)
        .select('id, store, merchant, name, purchase_date')
        .eq('user_id', user.id)
        .eq('purchase_date', dateISO);
      if (lErr) throw lErr;

      const idsLegacy = (legRows || [])
        .filter(r => normStore(r.store || r.merchant || r.name || '') === storeNorm)
        .map(r => r.id);

      if (idsLegacy.length > 0) {
        const chunk = (arr, n) => arr.reduce((a,_,i)=> (i % n ? a : [...a, arr.slice(i, i+n)]), []);
        for (const part of chunk(idsLegacy, 100)) {
          const { error } = await supabase
            .from(t)
            .delete()
            .eq('user_id', user.id)
            .in('id', part);
          if (error) throw error;
        }
      }
    }

    // Aggiorna subito UI e ricarica
    setPocketRows(prev => prev.filter(r => r.id !== row.id));
    await loadAll();

  } catch (err) {
    showError(setError, err);
  }
}



  async function handleSaveCarryover(e) {
    e.preventDefault(); setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr; if (!user) throw new Error('Sessione scaduta');
      const payload = { user_id: user.id, month_key: monthKey, amount: Number(newCarry.amount)||0, note: newCarry.note || null };
      if (carryover?.id) {
        const { error } = await supabase.from('carryovers').update(payload).eq('id', carryover.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('carryovers').insert(payload);
        if (error) throw error;
      }
      setNewCarry({ amount:'', note:'' }); await loadAll();
    } catch (err) { showError(setError, err); }
  }
  async function handleTopUpPocket(e) {
    e.preventDefault(); setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr; if (!user) throw new Error('Sessione scaduta');
      const delta = parseAmountLoose(pocketTopUp); if (!delta) return;
      const payload = { user_id: user.id, note: delta>=0 ? 'Ricarica contanti' : 'Uscita contanti', delta, moved_at: new Date().toISOString() };
      const { error } = await supabase.from('pocket_cash').insert(payload);
      if (error) throw error; setPocketTopUp(''); await loadAll();
    } catch (err) { showError(setError, err); }
  }
  async function handleClearPocket() {
    if (!confirm('Ripulisci: rimuove i movimenti manuali e nasconde qui le spese cash di Varie. Confermi?')) return;
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr; if (!user) throw new Error('Sessione scaduta');
      const { error } = await supabase.from('pocket_cash').delete().eq('user_id', user.id);
      if (error) throw error;
      setHideVarieCashAfterClear(true);
      await loadAll();
    } catch (err) { showError(setError, err); }
  }

  /* --------------------------- calcoli --------------------------- */
  const entratePeriodo   = incomes.reduce((t, r) => t + Number(r.amount || 0), 0);
  const carryAmount      = Number(carryover?.amount || 0);
  const prelievi         = pocketRows.filter(r => r.kind === 'manual' && r.amount > 0).reduce((t, r) => t + r.amount, 0);
  const saldoDisponibile = Math.max(0, entratePeriodo + carryAmount - prelievi);
  const pocketBalance    = pocketRows.reduce((t, r) => t + Number(r.amount || 0), 0);

  /* ------------------------------ UI ------------------------------ */
  return (
    <>
      <Head><title>Entrate & Saldi</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">

          {/* Titolo + Voce/OCR */}
          <div className="title-row">
            <h2 className="title">Entrate &amp; Saldi</h2>
            <div className="title-actions">
              <button className="btn-vocale" onClick={toggleRec}>{recBusy ? 'Stop' : 'Voce'}</button>
              <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>OCR</button>
              <input
                ref={ocrInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                hidden
                onChange={(e) => handleOCR(Array.from(e.target.files || []))}
              />
            </div>
          </div>

          {/* Periodo */}
          <div className="periodo-row">
            <span>Periodo corrente:</span><b>{startDateIT}</b><span>–</span><b>{endDateIT}</b>
          </div>

          {/* Box metriche */}
          <div className="total-box">
            <h3>Disponibilità</h3>
            <div className="metric-sub block">
              Entrate periodo corrente: <b>€ {entratePeriodo.toFixed(2)}</b> •&nbsp;
              Carryover mese precedente: <b>€ {carryAmount.toFixed(2)}</b>
            </div>
            <div className="flex-line">
              <span>Saldo disponibile:</span>
              <b className="metric metric--saldo">€ {saldoDisponibile.toFixed(2)}</b>
            </div>
            <div className="flex-line">
              <span>Soldi in tasca (restanti):</span>
              <b className="metric metric--pocket">€ {pocketBalance.toFixed(2)}</b>
            </div>
          </div>

          {/* 1) Entrate del periodo */}
          <h3>1) Entrate del periodo</h3>
          <details className="toggle-add">
            <summary className="btn-manuale">➕ Aggiungi manuale</summary>
            <form className="input-section" onSubmit={handleAddIncome}>
              <input value={newIncome.source} onChange={(e) => setNewIncome({ ...newIncome, source: e.target.value })} placeholder="Fonte" required />
              <input value={newIncome.description} onChange={(e) => setNewIncome({ ...newIncome, description: e.target.value })} placeholder="Descrizione" required />
              <input type="date" value={newIncome.receivedAt} onChange={(e) => setNewIncome({ ...newIncome, receivedAt: e.target.value })} required />
              <input type="text" inputMode="decimal" value={newIncome.amount} onChange={(e) => setNewIncome({ ...newIncome, amount: e.target.value })} placeholder="Importo €" required />
              <button className="btn-manuale">Aggiungi</button>
            </form>
          </details>

          {loading ? <p>Caricamento…</p> : (
            <div className="table-wrap">
              <table className="custom-table">
                <thead><tr><th>Fonte</th><th>Descrizione</th><th>Data</th><th>Importo €</th><th></th></tr></thead>
                <tbody>
                  {incomes.map((i) => (
                    <tr key={i.id}>
                      <td>{i.source || '-'}</td>
                      <td>{i.description}</td>
                      <td>{i.received_at ? new Date(i.received_at).toLocaleDateString('it-IT') : '-'}</td>
                      <td>{Number(i.amount).toFixed(2)}</td>
                      <td><button className="btn-danger-outline" onClick={() => handleDeleteIncome(i.id)}>Elimina</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 2) Carryover */}
          <h3 style={{ marginTop: '1rem' }}>2) Rimanenze / Perdite mesi precedenti</h3>
          <details className="toggle-add">
            <summary className="btn-manuale">➕ Aggiungi manuale</summary>
            <form className="input-section" onSubmit={handleSaveCarryover}>
              <input
                type="number" step="0.01" value={newCarry.amount}
                onChange={(e) => setNewCarry({ ...newCarry, amount: e.target.value })}
                placeholder={`Importo € per ${monthKey}`} required
              />
              <input
                value={newCarry.note}
                onChange={(e) => setNewCarry({ ...newCarry, note: e.target.value })}
                placeholder="Nota (opzionale)"
              />
              <button className="btn-manuale">{carryover ? 'Aggiorna' : 'Salva'}</button>
            </form>
          </details>

          {carryover && (
            <div className="table-wrap">
              <table className="custom-table">
                <thead><tr><th>Mese</th><th>Importo €</th><th>Nota</th></tr></thead>
                <tbody><tr><td>{carryover.month_key}</td><td>{Number(carryover.amount).toFixed(2)}</td><td>{carryover.note || '-'}</td></tr></tbody>
              </table>
            </div>
          )}

          {/* 3) Soldi in tasca + Spese (con link a Spese Casa / Cene & Aperitivi) */}
          <div className="row-head">
            <h3 style={{ marginTop: '1rem' }}>3) Soldi in tasca</h3>
            <button type="button" className="btn-danger" onClick={handleClearPocket} title="Elimina movimenti manuali e nascondi le spese cash di Varie in questa vista">
              Ripulisci
            </button>
          </div>
          <details className="toggle-add">
            <summary className="btn-manuale">➕ Aggiungi manuale</summary>
            <form className="input-section" onSubmit={handleTopUpPocket}>
              <input
                type="text" inputMode="decimal" value={pocketTopUp}
                onChange={(e) => setPocketTopUp(e.target.value)} placeholder="Ricarica (+) / Uscita (-) €" required
              />
              <button className="btn-manuale">+ Aggiungi</button>
              {hideVarieCashAfterClear && (
                <p style={{ opacity: 0.85, marginTop: '.5rem', flexBasis: '100%' }}>
                  Vista filtrata: spese cash della categoria <b>Varie</b> nascoste in questa pagina (restano nelle rispettive sezioni).
                </p>
              )}
            </form>
          </details>

{loading ? <p>Caricamento…</p> : (
  <div className="table-wrap">
    <table className="custom-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Descrizione</th>
          <th style={{ textAlign: 'right' }}>Importo €</th>
          <th style={{ width: '1%', whiteSpace: 'nowrap' }}>Azioni</th>
        </tr>
      </thead>
      <tbody>
        {pocketRows.map((m) => (
          <tr key={m.id}>
            <td>{m.dateISO ? new Date(m.dateISO).toLocaleDateString('it-IT') : '-'}</td>
            <td>
              {m.route
                ? <Link href={m.route} className="row-link">{m.label}</Link>
                : <span>{m.label}</span>}
            </td>
            <td style={{ textAlign: 'right' }}>
              {(m.displayAmount ?? m.amount) >= 0 ? '+' : '-'}{' '}
              {Math.abs(m.displayAmount ?? m.amount).toFixed(2)}
            </td>
            <td>
              <button
                className="icon-btn"
                onClick={() => handleDeletePocketRow(m)}
                title="Elimina questa spesa"
                aria-label="Elimina"
              >
                {/* cestino inline, uguale ovunque */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="currentColor" strokeWidth="2"/>
                  <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}


{error && <p className="error">{error}</p>}

<Link href="/home"><button className="btn-vocale" style={{ marginTop: '1rem' }}>Home</button></Link>
</div>
</div>


      <style jsx global>{`
        /* pagina più larga */
        .spese-casa-container1 { width: 100%; display: flex; align-items: center; justify-content: center; background: #0f172a; min-height: 100vh; padding: 2rem; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
        .spese-casa-container2 { background: rgba(0, 0, 0, 0.6); padding: 2rem; border-radius: 1rem; color: #fff; box-shadow: 0 6px 16px rgba(0,0,0,.3); max-width: 1280px; width: min(1280px, 96vw); }
        .title-row { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-bottom: .25rem; }
        .title { margin: 0; font-size: 1.5rem; }
        .title-actions { display: flex; gap: .5rem; }
        .periodo-row { display:flex; gap:.4rem; align-items:center; margin: .25rem 0 .6rem; font-size: .95rem; opacity:.9; }

        .btn-vocale, .btn-ocr, .btn-manuale { background: #6366f1; border: 0; padding: .45rem .7rem; border-radius: .55rem; cursor: pointer; color: #fff; transition: transform .06s ease, opacity .12s ease; }
        .btn-ocr { background: #06b6d4; }
        .btn-manuale:hover, .btn-vocale:hover, .btn-ocr:hover, .btn-danger:hover, .btn-danger-outline:hover { transform: translateY(-1px); opacity: .95; }
        .btn-danger { background: #ef4444; border: 0; padding: .45rem .7rem; border-radius: .55rem; cursor: pointer; color:#fff; }
        .btn-danger-outline { background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: .35rem .55rem; border-radius: .45rem; cursor: pointer; }

        .input-section { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin: .5rem 0; }
        .input-section input { padding: .45rem; border-radius: .55rem; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06); color: #fff; }

        .custom-table { width: 100%; margin-top: .5rem; border-collapse: collapse; }
        .custom-table th, .custom-table td { border-bottom: 1px solid rgba(255,255,255,.12); padding: .55rem; text-align: left; }
        .flex-line { display: flex; justify-content: space-between; margin: .35rem 0; gap: 1rem; }
        .total-box { background: rgba(255,255,255,.06); padding: 1rem; border-radius: .75rem; margin-bottom: 1rem; }
        .metric { font-size: 1.6rem; font-weight: 800; line-height: 1.1; }
        .metric-sub { font-size: 1rem; opacity: .85; }
        .metric--saldo { color: #22c55e; }
        .metric--pocket { color: #06b6d4; }

        .toggle-add { margin: .35rem 0 0.5rem; }
        .toggle-add > summary {
          list-style: none;
          display: inline-block;
          cursor: pointer;
          background: #6366f1;
          color: #fff;
          border: 0;
          padding: .45rem .7rem;
          border-radius: .55rem;
          user-select: none;
        }
        .toggle-add > summary::-webkit-details-marker { display: none; }

        .row-head { display:flex; justify-content:space-between; align-items:center; gap:.75rem; }
        .row-link { color:#c7d2fe; text-decoration:underline; }
        .row-link:hover { opacity:.9; }

        .error { color:#f87171; margin-top: 1rem; }
      `}</style>
    </>
      );
}

export default withAuth(Entrate);
