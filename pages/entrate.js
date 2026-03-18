// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '../lib/supabaseClient';

const PAYDAY_DAY = 10;

/* ─── helpers ──────────────────────────────────────────────────── */
function isoLocal(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}`;
}
function computeCurrentPayPeriod(today, paydayDay) {
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  const thisPayday = new Date(y, m, paydayDay);
  let start, end;
  if (d >= paydayDay) { start = thisPayday; end = new Date(y, m + 1, paydayDay - 1); }
  else { start = new Date(y, m - 1, paydayDay); end = new Date(y, m, paydayDay - 1); }
  return { startDate: isoLocal(start), endDate: isoLocal(end), monthKey: isoLocal(end).slice(0, 7) };
}
function parseAmountLoose(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : 0;
}
function formatIT(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('it-IT');
}
function titleize(s = '') {
  return String(s).toLowerCase().replace(/(^|\s|-)\p{L}/gu, m => m.toUpperCase());
}
function showError(setter, err) {
  const msg = err?.message || err?.error_description || err?.hint || err?.details
    || (typeof err === 'string' ? err : JSON.stringify(err));
  setter(msg);
  console.error('[ENTRATE ERROR]', err);
}

/* ─── MimeType ottimale (incluso iPhone/Safari) ─────────────────── */
function getBestMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus','audio/ogg']) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
  }
  return '';
}
function extForMime(mime = '') {
  if (mime.includes('mp4')) return 'voice.mp4';
  if (mime.includes('ogg')) return 'voice.ogg';
  return 'voice.webm';
}

/* ─── Parsing testo parlato ─────────────────────────────────────── */
function parseMoneyFromDigits(text = '') {
  const s = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const re = /[-+]?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?|[-+]?\d+(?:[.,]\d+)?/g;
  const vals = [];
  for (const m of s.matchAll(re)) {
    const raw = m[0].replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number(raw);
    if (Number.isFinite(n)) vals.push(Math.abs(n));
  }
  if (!vals.length) return 0;
  const ge1 = vals.filter(n => n >= 1);
  return ge1.length ? Math.max(...ge1) : vals[0];
}
function parseMoneyFromWordsIT(text = '') {
  const s = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const dict = new Map(Object.entries({
    dieci:10,venti:20,trenta:30,quaranta:40,cinquanta:50,sessanta:60,settanta:70,ottanta:80,novanta:90,
    cento:100,duecento:200,trecento:300,quattrocento:400,cinquecento:500,seicento:600,settecento:700,ottocento:800,novecento:900,
    mille:1000,duemila:2000,tremila:3000,quattromila:4000,cinquemila:5000
  }));
  const m = s.match(/\b([a-z]+)\s*euro\b/);
  if (m && dict.has(m[1])) return dict.get(m[1]);
  for (const [w, val] of dict.entries())
    if (s.includes(` ${w} `) || s.endsWith(` ${w}`) || s.startsWith(`${w} `)) return val;
  return 0;
}
function parseMoneyFromText(t = '') {
  const n1 = parseMoneyFromDigits(t);
  if (n1 > 0) return n1;
  return parseMoneyFromWordsIT(t);
}
function pickDateFromText(t = '') {
  const s = String(t).toLowerCase();
  if (/\boggi\b/.test(s)) return isoLocal(new Date());
  if (/\bieri\b/.test(s)) { const d = new Date(); d.setDate(d.getDate() - 1); return isoLocal(d); }
  if (/\bdomani\b/.test(s)) { const d = new Date(); d.setDate(d.getDate() + 1); return isoLocal(d); }
  const m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) {
    const dd = String(m[1]).padStart(2, '0'), mm = String(m[2]).padStart(2, '0');
    let yy = String(m[3]); if (yy.length === 2) yy = (Number(yy) >= 70 ? '19' : '20') + yy;
    return `${yy}-${mm}-${dd}`;
  }
  return isoLocal(new Date());
}
function normalizeIT(s = '') {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/* ─── Detect metodo pagamento ───────────────────────────────────── */
function detectPaymentMethod(text = '') {
  const s = normalizeIT(text);
  if (/\b(carta|card|bancomat|pos|visa|mastercard|credito|debito|contactless|tap)\b/.test(s)) return 'card';
  if (/\b(contanti|cash|liquidi|banconot|spiccioli)\b/.test(s)) return 'cash';
  return null;
}

/* ─── Intent: spesa (cash o card) ──────────────────────────────── */
function inferCategory(text = '') {
  const s = normalizeIT(text);
  if (/\b(tabac|sigarett|fum[oi])\b/.test(s)) return 'varie';
  if (/\b(supermercat|market|spes[ae]|coop|conad|carrefour|esselunga|md|lid[li])\b/.test(s)) return 'casa';
  if (/\b(bar|caffe|aperitiv|pizzeria|ristorant|pub|bistrot|braceria|sushi|enoteca)\b/.test(s)) return 'cene';
  if (/\b(scarp|maglion|pantalon|camici|indument|vestit)\b/.test(s)) return 'vestiti';
  return 'varie';
}
function extractStoreName(text = '') {
  const s = normalizeIT(text);
  const m = s.match(/\b(?:a|da|presso|al|alla)\s+([a-z0-9'.\-& ]{2,50})\b/);
  if (!m) return null;
  let store = m[1].replace(/\b(per|di|da|alle|all[ao]s?|ore|euro|€|carta|contanti|cash)\b.*$/, '').replace(/\s{2,}/g, ' ').trim();
  return titleize(store) || null;
}
function detectExpenseIntent(text = '') {
  const raw = String(text || '');
  const s = normalizeIT(raw);
  if (!/\b(ho\s+speso|abbiam|pagat[oa]|spes[ao]|mi\s+e'?|e'?\s+costat[oa])\b/.test(s)) return null;
  const amount = parseMoneyFromText(s);
  if (!amount) return null;
  const dateISO = pickDateFromText(s);
  const paymentMethod = detectPaymentMethod(s) || 'cash';
  let store = extractStoreName(raw) || 'Punto vendita';
  if (/\b(tabac|sigarett|fum[oi])\b/.test(s) && !/^tabaccheria/i.test(store)) store = `Tabaccheria ${store}`;
  const category = inferCategory(raw);
  let descr = 'Spesa';
  const md = s.match(/\bper\s+([a-z0-9'.\-& ]{2,60})(?:\b|$)/i);
  if (md) descr = titleize(md[1].trim());
  else if (/\bsigar|tabac\b/.test(s)) descr = 'Sigarette';
  return { category, store, amount: Math.abs(amount), dateISO, description: descr, payment_method: paymentMethod };
}
async function insertExpenseByVoice(exp) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sessione scaduta');
  const { error } = await supabase.from('expenses').insert({
    user_id: user.id, category: exp.category || 'varie',
    store: exp.store || 'Punto vendita', description: exp.description || '',
    purchase_date: exp.dateISO || isoLocal(new Date()),
    amount: Number(exp.amount || 0), payment_method: exp.payment_method || 'cash', source: 'voice',
  });
  if (error) throw error;
}

/* ─── Intent: tasca ─────────────────────────────────────────────── */
function detectPocketIntent(text = '') {
  const s = String(text).toLowerCase();
  const amount = parseMoneyFromText(s);
  if (!amount) return null;
  const NEG = /(uscita\s+contanti|tolto|pres[oa]\s+dalla\s+tasca|cash\s*out)/i;
  const POS = /(in\s+tasca|in\s+portafogli\w*|borsell\w*|ricaric\w*|preliev\w*|cash\s*in|metti\w*\s+in\s+tasca)/i;
  const isNeg = NEG.test(s);
  const isPos = POS.test(s) || (/\btasca\b/.test(s) && !isNeg);
  if (!isPos && !isNeg) return null;
  return { delta: isNeg ? -Math.abs(amount) : Math.abs(amount), dateISO: pickDateFromText(s), note: isNeg ? 'Uscita contanti (voce)' : 'Ricarica contanti (voce)' };
}

/* ─── Intent: entrata ───────────────────────────────────────────── */
function detectIncomeIntent(text = '') {
  const s = String(text || '').toLowerCase();
  const amount = parseMoneyFromText(s);
  if (!amount) return null;
  if (/\b(ho\s+speso|pagat[oa]|spes[ao])\b/.test(s)) return null;
  const dateISO = pickDateFromText(s);
  let source = 'Entrata';
  if (/\bstipendio|paga|salario|mensilit[àa]\b/.test(s)) source = 'Stipendio';
  else if (/\bincass|incasso|fattur|bonific|rimborso\b/.test(s)) source = 'Incasso';
  else if (/\bmi ha pagato\b/.test(s)) source = 'Pagamento ricevuto';
  const payerMatch = s.match(/\b(?:da|dal|dalla)\s+([a-zà-ù' ]{2,40})/i);
  if (payerMatch) {
    const name = titleize(payerMatch[1].replace(/\b(euro|€)\b/gi, '').trim());
    source = source === 'Entrata' ? `Pagamento da ${name}` : `${source} da ${name}`;
  }
  return { source, description: source, amount: Math.abs(amount), dateISO };
}

/* ─── Carryover auto ────────────────────────────────────────────── */
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  const { data: existing } = await supabase.from('carryovers').select('id')
    .eq('user_id', userId).eq('month_key', monthKeyCurrent).maybeSingle();
  if (existing) return;
  const [yy, mm] = monthKeyCurrent.split('-').map(Number);
  const prevEnd = new Date(yy, mm - 1, 0);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
  const prevStartISO = isoLocal(prevStart), prevEndISO = isoLocal(prevEnd);
  const prevKey = prevEndISO.slice(0, 7);
  const { data: incPrev } = await supabase.from('incomes').select('amount,received_date,received_at')
    .eq('user_id', userId)
    .or(`and(received_date.gte.${prevStartISO},received_date.lte.${prevEndISO}),and(received_at.gte.${prevStartISO}T00:00:00,received_at.lte.${prevEndISO}T23:59:59)`);
  const { data: expPrev } = await supabase.from('expenses').select('amount,purchase_date')
    .eq('user_id', userId).gte('purchase_date', prevStartISO).lte('purchase_date', prevEndISO);
  const { data: coPrev } = await supabase.from('carryovers').select('amount')
    .eq('user_id', userId).eq('month_key', prevKey).maybeSingle();
  const totalInc = (incPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const totalExp = (expPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const prevCarry = Number(coPrev?.amount || 0);
  await supabase.from('carryovers').insert({
    user_id: userId, month_key: monthKeyCurrent,
    amount: Number((totalInc + prevCarry - totalExp).toFixed(2)),
    note: 'Auto-carryover da mese precedente',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTE
══════════════════════════════════════════════════════════════════ */
function Entrate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [incomes, setIncomes]   = useState([]);
  const [newIncome, setNewIncome] = useState({ source: 'Stipendio', description: '', amount: '', receivedAt: '' });
  const [showAddIncome, setShowAddIncome] = useState(false);

  // Riserve = saldo netto di tutti i carryover storici, scalato se entrate <= 0
  const [riserve, setRiserve] = useState(0);

  // Tutte le spese del periodo (cash + card) per la sezione Uscite
  const [uscite, setUscite] = useState([]);

  // Movimenti tasca (solo cash)
  const [pocketRows, setPocketRows] = useState([]);
  const [pocketTopUp, setPocketTopUp] = useState('');
  const [showAddPocket, setShowAddPocket] = useState(false);

  const ocrInputRef   = useRef(null);
  const mediaRecRef   = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef     = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY);
  const dateStartTS = `${startDate}T00:00:00`;
  const dateEndTS   = `${endDate}T23:59:59`;

  useEffect(() => {
    loadAll();
    return () => {
      try { if (mediaRecRef.current?.state === 'recording') mediaRecRef.current.stop(); } catch {}
      try { streamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
    };
  }, [monthKey]);

  /* ─── loadAll ─────────────────────────────────────────────────── */
  async function loadAll() {
    setLoading(true); setError(null);
    try {
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      if (!user) throw new Error('Sessione scaduta');

      await ensureCarryoverAuto(user.id, monthKey);

      // 1) Entrate periodo
      const { data: inc, error: incErr } = await supabase
        .from('incomes').select('id,source,description,amount,received_at,received_date')
        .eq('user_id', user.id)
        .or(`and(received_date.gte.${startDate},received_date.lte.${endDate}),and(received_at.gte.${dateStartTS},received_at.lte.${dateEndTS})`)
        .order('received_at', { ascending: false, nullsFirst: false });
      if (incErr) throw incErr;
      setIncomes(inc || []);

      // 2) Riserve = somma netta di tutti i carryover storici
      //    Se entrate periodo ≤ 0 → scala il deficit dalle riserve
      const { data: allCarry } = await supabase.from('carryovers').select('amount').eq('user_id', user.id);
      const sumCarry = (allCarry || []).reduce((t, r) => t + Number(r.amount || 0), 0);
      const entratePeriodoRaw = (inc || []).reduce((t, r) => t + Number(r.amount || 0), 0);
      const deficit = entratePeriodoRaw <= 0 ? Math.abs(entratePeriodoRaw) : 0;
      setRiserve(Math.max(0, sumCarry - deficit));

      // 3) Tutte le spese del periodo
      const { data: expenses } = await supabase
        .from('expenses').select('id,category,store,description,purchase_date,amount,payment_method,created_at')
        .eq('user_id', user.id)
        .gte('purchase_date', startDate).lte('purchase_date', endDate)
        .order('purchase_date', { ascending: false }).order('created_at', { ascending: false });

      // Sezione Uscite: tutte (cash + card) con badge
      setUscite((expenses || []).map(h => ({
        id: h.id, dateISO: h.purchase_date,
        label: h.description || h.store || h.category,
        store: h.store || '', category: h.category,
        amount: Number(h.amount || 0),
        payment_method: h.payment_method || 'cash',
      })));

      // 4) Movimenti tasca manuali
      const { data: pc } = await supabase
        .from('pocket_cash').select('id,created_at,moved_at,moved_date,note,delta,amount,direction')
        .eq('user_id', user.id)
        .gte('moved_date', startDate).lte('moved_date', endDate)
        .order('moved_at', { ascending: false }).order('created_at', { ascending: false });

      const manualRows = (pc || []).map(row => {
        const eff = row.delta != null ? Number(row.delta || 0)
          : (row.amount != null ? (row.direction === 'in' ? 1 : -1) * Number(row.amount || 0) : 0);
        return {
          id: `pc-${row.id}`,
          dateISO: row.moved_date || (row.moved_at || row.created_at || '').slice(0, 10),
          label: row.note?.trim() || (eff >= 0 ? 'Ricarica contanti' : 'Uscita contanti'),
          amount: Number(eff || 0), kind: 'manual',
        };
      });

      // Tasca: spese cash + movimenti manuali
      const cashExpRows = (expenses || [])
        .filter(h => /^(cash|contanti)$/i.test(String(h.payment_method || '')))
        .map(h => ({
          id: `exp-${h.id}`, dateISO: h.purchase_date,
          label: h.description || h.store || h.category,
          amount: -Number(h.amount || 0), kind: 'expense-cash',
        }));

      setPocketRows([...cashExpRows, ...manualRows]
        .filter(r => Number.isFinite(r.amount))
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || '')));

    } catch (err) { showError(setError, err); }
    finally { setLoading(false); }
  }

  /* ─── Voce ────────────────────────────────────────────────────── */
  function buildIncomePrompt(userText) {
    const today = isoLocal(new Date());
    return [
      'Sei Jarvis. Estrai ENTRATE economiche (stipendio, pagamenti, rimborsi).',
      `Se non è specificata una data usa oggi: ${today}`,
      'Rispondi SOLO con JSON: {"type":"income","items":[{"source":"Stipendio","description":"Stipendio","amount":1500,"receivedAt":"' + today + '"}]}',
      '', 'Testo:', userText,
    ].join('\n');
  }
  async function callAssistant(prompt) {
    const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    const { answer, error: apiErr } = await res.json();
    if (!res.ok || apiErr) throw new Error(apiErr || String(res.status));
    return JSON.parse(answer);
  }
  async function insertPocketQuick({ delta, date, note }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');
    const { error } = await supabase.from('pocket_cash').insert({
      user_id: user.id, note: note || (delta >= 0 ? 'Ricarica contanti' : 'Uscita contanti'),
      delta, moved_at: `${date || isoLocal(new Date())}T12:00:00Z`,
    });
    if (error) throw error;
  }
  async function insertIncomeAssistant(text) {
    const data = await callAssistant(buildIncomePrompt(text));
    if (data.type !== 'income' || !Array.isArray(data.items) || !data.items.length) return false;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');
    for (const it of data.items) {
      const { error } = await supabase.from('incomes').insert({
        user_id: user.id, source: it.source || 'Entrata',
        description: it.description || it.source || 'Entrata',
        amount: Math.abs(parseAmountLoose(it.amount)),
        received_at: `${it.receivedAt || isoLocal(new Date())}T12:00:00Z`,
      });
      if (error) throw error;
    }
    return true;
  }

  const toggleRec = async () => {
    if (recBusy) {
      try { const mr = mediaRecRef.current; if (mr?.state === 'recording') { mr.requestData?.(); mr.stop(); } } catch {}
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; recordedChunks.current = [];
      const mimeType = getBestMimeType();
      mediaRecRef.current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecRef.current.ondataavailable = (e) => { if (e.data?.size > 0) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop = async () => {
        try {
          const t0 = Date.now();
          while (!recordedChunks.current.length && Date.now() - t0 < 1500) await new Promise(r => setTimeout(r, 60));
          if (!recordedChunks.current.length) throw new Error('Nessun audio ricevuto');
          const actualMime = mediaRecRef.current?.mimeType || recordedChunks.current[0]?.type || mimeType || 'audio/webm';
          const blob = new Blob(recordedChunks.current, { type: actualMime });
          if (blob.size < 500) throw new Error('Audio troppo corto, riprova');
          const fd = new FormData();
          fd.append('audio', blob, extForMime(actualMime));
          const r = await fetch('/api/stt', { method: 'POST', body: fd });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j?.text) throw new Error(j?.error || 'STT fallito');
          const spoken = String(j.text || '').trim();
          if (!spoken) { setError('Trascrizione vuota'); return; }

          // 1) Spesa (cash o card) — "ho speso 100 euro con carta"
          const exp = detectExpenseIntent(spoken);
          if (exp) { await insertExpenseByVoice(exp); await loadAll(); return; }
          // 2) Tasca
          const pocket = detectPocketIntent(spoken);
          if (pocket) { await insertPocketQuick(pocket); await loadAll(); return; }
          // 3) Entrata locale
          const inc = detectIncomeIntent(spoken);
          if (inc) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Sessione scaduta');
            await supabase.from('incomes').insert({ user_id: user.id, source: inc.source, description: inc.description, amount: inc.amount, received_at: `${inc.dateISO}T12:00:00Z` });
            await loadAll(); return;
          }
          // 4) Fallback AI
          const ok = await insertIncomeAssistant(spoken);
          if (ok) await loadAll(); else setError('Nessun dato riconosciuto dalla voce');
        } catch (e) { showError(setError, e); }
        finally {
          setRecBusy(false);
          try { streamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
          streamRef.current = null;
        }
      };
      mediaRecRef.current.start(250);
      setRecBusy(true);
    } catch (err) {
      setRecBusy(false);
      setError(err?.name === 'NotAllowedError'
        ? 'Microfono non autorizzato — controlla Impostazioni > Safari'
        : 'Microfono non disponibile: ' + (err?.message || err));
      try { streamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
    }
  };

  /* ─── OCR ─────────────────────────────────────────────────────── */
  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      const fd = new FormData(); files.forEach(f => fd.append('images', f));
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const { text } = await res.json();
      const ok = await insertIncomeAssistant(text);
      if (ok) await loadAll(); else setError('Nessun dato riconosciuto da OCR');
    } catch (err) { showError(setError, err); }
  }

  /* ─── CRUD ────────────────────────────────────────────────────── */
  async function handleAddIncome(e) {
    e.preventDefault(); setError(null);
    try {
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr; if (!user) throw new Error('Sessione scaduta');
      const { error } = await supabase.from('incomes').insert({
        user_id: user.id, source: newIncome.source || 'Entrata',
        description: newIncome.description || newIncome.source || 'Entrata',
        amount: Math.abs(parseAmountLoose(newIncome.amount)),
        received_at: newIncome.receivedAt ? `${newIncome.receivedAt}T12:00:00Z` : new Date().toISOString(),
      });
      if (error) throw error;
      setNewIncome({ source: 'Stipendio', description: '', amount: '', receivedAt: '' });
      setShowAddIncome(false); await loadAll();
    } catch (err) { showError(setError, err); }
  }
  async function handleDeleteIncome(id) {
    try {
      const { error } = await supabase.from('incomes').delete().eq('id', id);
      if (error) throw error; setIncomes(incomes.filter(i => i.id !== id));
    } catch (err) { showError(setError, err); }
  }
  async function handleDeleteUscita(id) {
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error; await loadAll();
    } catch (err) { showError(setError, err); }
  }
  async function handleTopUpPocket(e) {
    e.preventDefault(); setError(null);
    try {
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr; if (!user) throw new Error('Sessione scaduta');
      const delta = parseAmountLoose(pocketTopUp); if (!delta) return;
      const { error } = await supabase.from('pocket_cash').insert({
        user_id: user.id, note: delta >= 0 ? 'Ricarica contanti' : 'Uscita contanti',
        delta, moved_at: new Date().toISOString(),
      });
      if (error) throw error; setPocketTopUp(''); setShowAddPocket(false); await loadAll();
    } catch (err) { showError(setError, err); }
  }
  async function handleDeletePocketRow(row) {
    if (!confirm('Eliminare questo movimento?')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');
      if (row.kind === 'manual') {
        const pid = String(row.id).startsWith('pc-') ? row.id.slice(3) : null;
        if (!pid) throw new Error('ID non valido');
        const { error } = await supabase.from('pocket_cash').delete().eq('user_id', user.id).eq('id', pid);
        if (error) throw error;
      } else {
        const eid = String(row.id).startsWith('exp-') ? row.id.slice(4) : row.id;
        const { error } = await supabase.from('expenses').delete().eq('id', eid);
        if (error) throw error;
      }
      await loadAll();
    } catch (err) { showError(setError, err); }
  }

  /* ─── Calcoli ─────────────────────────────────────────────────── */
  const entratePeriodo  = incomes.reduce((t, r) => t + Number(r.amount || 0), 0);
  const prelievi        = pocketRows.filter(r => r.kind === 'manual' && r.amount > 0).reduce((t, r) => t + r.amount, 0);
  const saldoDisponibile = Math.max(0, entratePeriodo + riserve - prelievi);
  const pocketBalance   = pocketRows.reduce((t, r) => t + Number(r.amount || 0), 0);
  const totUsciteCash   = uscite.filter(u => /cash|contanti/i.test(u.payment_method)).reduce((t, u) => t + u.amount, 0);
  const totUsciteCard   = uscite.filter(u => /card|bancomat/i.test(u.payment_method)).reduce((t, u) => t + u.amount, 0);

  const CAT_EMOJI = { casa: '🏠', cene: '🍽️', vestiti: '👔', varie: '📦' };

  /* ─── UI ──────────────────────────────────────────────────────── */
  return (
    <>
      <Head><title>Entrate & Saldi · Jarvis</title></Head>
      <div className="pg">

        {/* TOPBAR */}
        <div className="topbar">
          <div className="logo">JARVIS</div>
          <div className="periodo-badge">{formatIT(startDate)} — {formatIT(endDate)}</div>
        </div>

        {/* AZIONI VOCE / OCR */}
        <div className="fab-row">
          <button className={`fab-voice ${recBusy ? 'fab-voice--rec' : ''}`} onClick={toggleRec}>
            <span className="fab-dot" />
            {recBusy ? 'Stop registrazione' : 'Voce'}
          </button>
          <button className="fab-ocr" onClick={() => ocrInputRef.current?.click()}>OCR</button>
          <input ref={ocrInputRef} type="file" accept="image/*" capture="environment" multiple hidden
            onChange={e => handleOCR(Array.from(e.target.files || []))} />
        </div>

        {/* KPI — 4 metriche */}
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">Entrate</div>
            <div className={`kpi-value ${entratePeriodo >= 0 ? 'kpi-green' : 'kpi-red'}`}>
              € {entratePeriodo.toFixed(2)}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Disponibile</div>
            <div className="kpi-value kpi-cyan">€ {saldoDisponibile.toFixed(2)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">In tasca</div>
            <div className="kpi-value kpi-purple">€ {pocketBalance.toFixed(2)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Riserve</div>
            <div className="kpi-value kpi-amber">€ {riserve.toFixed(2)}</div>
          </div>
        </div>

        {/* ── SEZIONE: ENTRATE ── */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Entrate del periodo</span>
            <button className="btn-add" onClick={() => setShowAddIncome(v => !v)}>
              {showAddIncome ? '✕ Chiudi' : '+ Aggiungi'}
            </button>
          </div>
          {showAddIncome && (
            <form className="add-form" onSubmit={handleAddIncome}>
              <input className="fi" value={newIncome.source} placeholder="Fonte" onChange={e => setNewIncome({ ...newIncome, source: e.target.value })} required />
              <input className="fi" value={newIncome.description} placeholder="Descrizione" onChange={e => setNewIncome({ ...newIncome, description: e.target.value })} />
              <input className="fi" type="date" value={newIncome.receivedAt} onChange={e => setNewIncome({ ...newIncome, receivedAt: e.target.value })} />
              <input className="fi" type="text" inputMode="decimal" value={newIncome.amount} placeholder="Importo €" onChange={e => setNewIncome({ ...newIncome, amount: e.target.value })} required />
              <button className="btn-save" type="submit">Salva</button>
            </form>
          )}
          {loading ? <div className="loading">Caricamento…</div> : (
            <div className="card">
              {incomes.length === 0 ? <div className="empty">Nessuna entrata questo periodo</div>
                : incomes.map(i => (
                  <div className="row" key={i.id}>
                    <span className="row-dot dot-green" />
                    <div className="row-body">
                      <div className="row-label">{i.source || '-'}</div>
                      <div className="row-sub">{i.description}</div>
                    </div>
                    <div className="row-amount pos">+ {Number(i.amount).toFixed(2)}</div>
                    <div className="row-date">{i.received_at ? new Date(i.received_at).toLocaleDateString('it-IT') : '-'}</div>
                    <button className="del-btn" onClick={() => handleDeleteIncome(i.id)}>✕</button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* ── SEZIONE: USCITE DEL PERIODO ── */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Uscite del periodo</span>
            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
              {totUsciteCash > 0 && <span className="badge badge-cash">Cash € {totUsciteCash.toFixed(2)}</span>}
              {totUsciteCard > 0 && <span className="badge badge-card">Carta € {totUsciteCard.toFixed(2)}</span>}
            </div>
          </div>
          {loading ? <div className="loading">Caricamento…</div> : (
            <div className="card">
              {uscite.length === 0 ? <div className="empty">Nessuna uscita questo periodo</div>
                : uscite.map(u => {
                  const isCash = /cash|contanti/i.test(u.payment_method);
                  return (
                    <div className="row" key={u.id}>
                      <span className="row-dot dot-red" />
                      <div className="row-body">
                        <div className="row-label">
                          {CAT_EMOJI[u.category] || '📦'} {u.label}
                          {u.store && u.store !== u.label && <span className="row-store"> · {u.store}</span>}
                        </div>
                        <div className="row-sub">{formatIT(u.dateISO)}</div>
                      </div>
                      <div className="row-amount neg">− {u.amount.toFixed(2)}</div>
                      <span className={`badge-inline ${isCash ? 'badge-inline--cash' : 'badge-inline--card'}`}>
                        {isCash ? 'Cash' : 'Carta'}
                      </span>
                      <button className="del-btn" onClick={() => handleDeleteUscita(u.id)}>✕</button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* ── SEZIONE: SOLDI IN TASCA ── */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Soldi in tasca</span>
            <button className="btn-add" onClick={() => setShowAddPocket(v => !v)}>
              {showAddPocket ? '✕ Chiudi' : '+ Aggiungi'}
            </button>
          </div>
          <div className="pocket-bar-wrap">
            <span className="pocket-bar-label">Bilancio contanti</span>
            <div className="pocket-bar-track">
              <div className="pocket-bar-fill"
                style={{ width: `${Math.min(100, Math.max(0, prelievi > 0 ? (pocketBalance / prelievi) * 100 : pocketBalance > 0 ? 100 : 0))}%` }} />
            </div>
            <span className="pocket-bar-val">€ {pocketBalance.toFixed(2)}</span>
          </div>
          {showAddPocket && (
            <form className="add-form" onSubmit={handleTopUpPocket}>
              <input className="fi" type="text" inputMode="decimal" value={pocketTopUp}
                onChange={e => setPocketTopUp(e.target.value)} placeholder="Ricarica (+) / Uscita (-) €" required />
              <button className="btn-save" type="submit">Aggiungi</button>
            </form>
          )}
          {loading ? <div className="loading">Caricamento…</div> : (
            <div className="card">
              {pocketRows.length === 0 ? <div className="empty">Nessun movimento contanti</div>
                : pocketRows.map(m => (
                  <div className="row" key={m.id}>
                    <span className={`row-dot ${m.amount >= 0 ? 'dot-cyan' : 'dot-red'}`} />
                    <div className="row-body">
                      <div className="row-label">{m.label}</div>
                      <div className="row-sub">{formatIT(m.dateISO)}</div>
                    </div>
                    <div className={`row-amount ${m.amount >= 0 ? 'pos' : 'neg'}`}>
                      {m.amount >= 0 ? '+' : '−'} {Math.abs(m.amount).toFixed(2)}
                    </div>
                    <button className="del-btn" onClick={() => handleDeletePocketRow(m)}>✕</button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {error && <div className="error-box">{error}</div>}
        <div style={{ marginTop: '1.5rem' }}>
          <Link href="/home"><button className="btn-home">← Home</button></Link>
        </div>

      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .pg {
          background: #0f172a; min-height: 100vh; padding: 1.5rem;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          color: #e2e8f0; max-width: 860px; margin: 0 auto;
        }

        /* Topbar */
        .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
        .logo { font-family: 'Orbitron', sans-serif; font-size: 1.05rem; font-weight: 900; background: linear-gradient(90deg,#5eead4,#22d3ee); -webkit-background-clip: text; background-clip: text; color: transparent; letter-spacing: 4px; }
        .periodo-badge { font-size: .72rem; color: #64748b; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 20px; padding: .28rem .75rem; }

        /* FAB */
        .fab-row { display: flex; gap: .6rem; margin-bottom: 1.25rem; }
        .fab-voice { display: flex; align-items: center; gap: .5rem; background: rgba(99,102,241,.12); border: 1px solid rgba(99,102,241,.3); border-radius: 12px; color: #818cf8; font-size: .82rem; font-weight: 600; padding: .55rem 1.1rem; cursor: pointer; letter-spacing: .03em; transition: background .15s; }
        .fab-voice--rec { background: rgba(239,68,68,.15); border-color: rgba(239,68,68,.4); color: #f87171; animation: pulse-rec 1s ease-in-out infinite; }
        @keyframes pulse-rec { 0%,100%{opacity:1} 50%{opacity:.5} }
        .fab-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .fab-ocr { background: rgba(6,182,212,.1); border: 1px solid rgba(6,182,212,.3); border-radius: 12px; color: #22d3ee; font-size: .82rem; font-weight: 600; padding: .55rem 1rem; cursor: pointer; }

        /* KPI */
        .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: .6rem; margin-bottom: 1.5rem; }
        .kpi { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); border-radius: 14px; padding: .85rem 1rem; }
        .kpi-label { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-bottom: .35rem; }
        .kpi-value { font-size: 1.15rem; font-weight: 700; line-height: 1; }
        .kpi-green  { color: #22c55e; }
        .kpi-red    { color: #f87171; }
        .kpi-cyan   { color: #06b6d4; }
        .kpi-purple { color: #a78bfa; }
        .kpi-amber  { color: #fbbf24; }

        /* Section */
        .section { margin-bottom: 1.5rem; }
        .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .6rem; flex-wrap: wrap; gap: .4rem; }
        .section-title { font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; color: #475569; font-weight: 600; }
        .btn-add { font-size: .74rem; background: rgba(99,102,241,.12); border: 1px solid rgba(99,102,241,.25); color: #818cf8; border-radius: 8px; padding: .28rem .65rem; cursor: pointer; transition: background .15s; }
        .btn-add:hover { background: rgba(99,102,241,.2); }

        /* Card */
        .card { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 14px; overflow: hidden; }
        .row { display: flex; align-items: center; gap: .65rem; padding: .7rem 1rem; border-bottom: 1px solid rgba(255,255,255,.05); }
        .row:last-child { border-bottom: none; }
        .row-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .dot-green { background: #22c55e; }
        .dot-cyan  { background: #06b6d4; }
        .dot-red   { background: #f87171; }
        .row-body  { flex: 1; min-width: 0; }
        .row-label { font-size: .84rem; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row-store { color: #475569; }
        .row-sub   { font-size: .7rem; color: #475569; margin-top: .1rem; }
        .row-amount { font-size: .88rem; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
        .row-amount.pos { color: #22c55e; }
        .row-amount.neg { color: #f87171; }
        .row-date  { font-size: .7rem; color: #334155; flex-shrink: 0; }
        .del-btn   { background: none; border: none; color: #334155; cursor: pointer; font-size: .8rem; padding: .2rem .35rem; border-radius: 6px; flex-shrink: 0; transition: color .15s; }
        .del-btn:hover { color: #f87171; }

        /* Badges */
        .badge { font-size: .68rem; font-weight: 600; padding: .25rem .6rem; border-radius: 6px; white-space: nowrap; }
        .badge-cash { background: rgba(251,191,36,.1); color: #fbbf24; border: 1px solid rgba(251,191,36,.2); }
        .badge-card { background: rgba(99,102,241,.1);  color: #818cf8; border: 1px solid rgba(99,102,241,.2); }
        .badge-inline { font-size: .66rem; font-weight: 700; padding: .18rem .5rem; border-radius: 5px; white-space: nowrap; flex-shrink: 0; }
        .badge-inline--cash { background: rgba(251,191,36,.1); color: #fbbf24; }
        .badge-inline--card { background: rgba(99,102,241,.1);  color: #818cf8; }

        /* Pocket bar */
        .pocket-bar-wrap  { display: flex; align-items: center; gap: .6rem; margin-bottom: .65rem; }
        .pocket-bar-label { font-size: .7rem; color: #475569; white-space: nowrap; }
        .pocket-bar-track { flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,.07); overflow: hidden; }
        .pocket-bar-fill  { height: 100%; border-radius: 2px; background: linear-gradient(90deg,#06b6d4,#22d3ee); transition: width .4s ease; }
        .pocket-bar-val   { font-size: .8rem; font-weight: 700; color: #06b6d4; white-space: nowrap; }

        /* Add form */
        .add-form { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: .65rem; }
        .fi { flex: 1 1 140px; padding: .45rem .7rem; border-radius: 9px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: #e2e8f0; font-size: .82rem; outline: none; }
        .fi:focus { border-color: rgba(99,102,241,.5); }
        .btn-save { background: #6366f1; border: none; border-radius: 9px; color: #fff; font-size: .82rem; font-weight: 600; padding: .45rem 1rem; cursor: pointer; }

        /* Misc */
        .loading   { font-size: .8rem; color: #334155; padding: 1rem; text-align: center; }
        .empty     { font-size: .8rem; color: #334155; padding: 1.5rem; text-align: center; }
        .error-box { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.25); color: #f87171; border-radius: 10px; padding: .75rem 1rem; font-size: .82rem; margin-top: .5rem; }
        .btn-home  { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: #94a3b8; border-radius: 9px; padding: .45rem .9rem; cursor: pointer; font-size: .82rem; }

        /* Responsive */
        @media (max-width: 600px) {
          .kpi-grid { grid-template-columns: repeat(2,1fr); }
          .pg { padding: 1rem; }
        }
        @media (max-width: 380px) {
          .kpi-grid { grid-template-columns: repeat(2,1fr); }
        }
      `}</style>
    </>
  );
}

export default withAuth(Entrate);

export async function getServerSideProps() {
  return { props: {} };
}