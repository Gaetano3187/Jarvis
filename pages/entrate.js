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
// Estrae il primo importo dal testo (con virgola o punto)
function parseMoneyFromText(t='') {
  const s = String(t || '').replace(/\s+/g,' ').trim();
  const m = s.match(/([-+]?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/);
  if (!m) return 0;
  const raw = m[1].replace(/\s/g,'').replace(/\./g,'').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
// Oggi/ieri/domani o data esplicita
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
// Riconosce intenzione "tasca": +ricarica / -uscita
function detectPocketIntent(text='') {
  const s = String(text).toLowerCase();
  const amount = parseMoneyFromText(s);
  if (!amount) return null;

  const POS = /(in\s+tasca|messo|messa|ricaric|prelevat[oa]\b|ho preso.*in\s+tasca|cash in|aggiunt[oa]\s+in\s+tasca)/i;
  const NEG = /(uscita\s+contanti|spes[ao]\s+in\s+contanti|pagat[oa]\s+in\s+contanti|tolto|pres[oa]\s+dalla\s+tasca|dato\s+contanti|cash out)/i;

  const isPos = POS.test(s);
  const isNeg = NEG.test(s);

  if (!isPos && !isNeg && !/\btasca\b|\bcontanti\b/.test(s)) return null;

  const dateISO = pickDateFromText(s);
  if (isNeg) return { delta: -Math.abs(amount), dateISO, note: 'Uscita contanti (voce)' };
  return { delta: +Math.abs(amount), dateISO, note: 'Ricarica contanti (voce)' };
}

function formatIT(iso) {
  if (!iso) return '';
  const [y,m,d] = String(iso).split('-').map(Number);
  return new Date(y,(m??1)-1,d??1).toLocaleDateString('it-IT');
}
function showError(setter, err) {
  const msg = err?.message || err?.error_description || err?.hint || (typeof err === 'string' ? err : JSON.stringify(err));
  setter(msg); console.error('[SUPABASE ERROR]', err);
}
function titleize(s='') {
  return String(s).toLowerCase().replace(/(^|\s|-)\p{L}/gu, m => m.toUpperCase());
}
// Evita virgole finali nei select Supabase
function sbSelect(cols = []) {
  if (!Array.isArray(cols)) return '*';
  const list = cols
    .filter(Boolean)
    .map(String)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
  const [stopping, setStopping] = useState(false);

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

      /* ======== HEADS dal ledger unico ======== */
      const CAT_TO_ROUTE = {
        'spese-casa':     '/spese-casa',
        'cene-aperitivi': '/cene-aperitivi',
        'vestiti-altro':  '/vestiti-altro',
        'varie':          '/varie',
      };

      const { data: finHeads, error: finErr } = await supabase
        .from('jarvis_finances')
        .select('receipt_id, category, store, purchase_date, price_total, payment_method, link_label, link_path, created_at')
        .eq('user_id', user.id)
        .in('category', ['spese-casa','cene-aperitivi','vestiti-altro','varie'])
        .gte('purchase_date', startDate)
        .lte('purchase_date', endDate)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (finErr) throw finErr;

      // raggruppa: testa (headTotal) vs righe (linesSum)
      function groupFinHeads(heads = []) {
        const map = new Map();
        for (const h of heads) {
          const dateISO = h.purchase_date || '';
          const key = h.receipt_id
            ? `rid:${h.receipt_id}`
            : `sd:${String(h.store || '').toLowerCase().trim()}|${dateISO}|${h.category || 'spese-casa'}`;

          const isHead = Boolean(
            (h.link_label && String(h.link_label).trim()) ||
            (h.link_path  && String(h.link_path ).trim())
          );

          const g = map.get(key) || {
            receipt_id: h.receipt_id || null,
            category:   h.category   || 'spese-casa',
            store:      h.store      || '',
            dateISO,
            payment_method: h.payment_method || '',
            link_label:     h.link_label     || '',
            link_path:      h.link_path      || '',
            headTotal: 0,
            linesSum:  0,
          };

          if (!g.store && h.store) g.store = h.store;
          if (!g.link_label && h.link_label) g.link_label = h.link_label;
          if (!g.link_path  && h.link_path)  g.link_path  = h.link_path;
          if (!g.payment_method && h.payment_method) g.payment_method = h.payment_method;

          const val = Number(h.price_total || 0);
          if (isHead) g.headTotal = Math.max(g.headTotal, val);
          else        g.linesSum  += val;

          map.set(key, g);
        }

        return Array.from(map.values()).map(g => {
          const isCash = /^(cash|contanti)$/i.test(String(g.payment_method || ''));
          const monthParam = (g.dateISO || '').slice(0, 7);
          const baseTxt =
            g.category === 'cene-aperitivi' ? 'Cena/Aperitivo' :
            g.category === 'vestiti-altro'  ? 'Vestiti/Altro'  :
            g.category === 'varie'          ? 'Varie'          : 'Spesa';

          // usa headTotal se presente, altrimenti somma righe
          const total = g.headTotal > 0 ? g.headTotal : g.linesSum;
          const tot = Number((total || 0).toFixed(2));

          const dateIT = g.dateISO ? new Date(g.dateISO).toLocaleDateString('it-IT') : '';
          const defaultLabel = `${baseTxt} ${g.store || 'Punto vendita'}${dateIT ? ` (${dateIT})` : ''}`;

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
            displayAmount: -tot,          // mostrato sempre
            amount: isCash ? -tot : 0,    // impatta “Soldi in tasca” solo se contanti
            affectsPocket: isCash,
          };
        });
      }

      const expenseRows = groupFinHeads(finHeads);

      // merge finale con movimenti manuali
      const filteredManual = hideVarieCashAfterClear
        ? manualRows.filter(r => r.kind !== 'manual' || r.category_id !== CATEGORY_ID_VARIE)
        : manualRows;

      const rows = [...expenseRows, ...filteredManual]
        .filter(r => Number.isFinite(r.amount) || Number.isFinite(r.displayAmount))
        .sort((a,b) => (b.dateISO || '').localeCompare(a.dateISO || ''));

      setPocketRows(rows);

      // totale spese periodo (dal ledger completo)
      const { data: exp, error: expErr } = await supabase
        .from('jarvis_finances')
        .select('price_total,purchase_date')
        .eq('user_id', user.id)
        .gte('purchase_date', startDate)
        .lte('purchase_date', endDate);
      if (expErr) throw expErr;
      const totalExp = (exp || []).reduce((t, r) => t + Number(r.price_total || 0), 0);
      setMonthExpenses(totalExp);

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

  const toggleRec = async () => {
    if (recBusy) { try { mediaRecRef.current?.stop(); } catch {} return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => { if (e.data?.size) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop = async () => {
        try {
          const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
          const fd = new FormData(); fd.append('audio', blob, 'voice.webm');
          const r = await fetch('/api/stt', { method:'POST', body:fd }); 
          const j = await r.json().catch(()=> ({}));
          if (!r.ok || !j?.text) throw new Error('STT fallito');

          const spoken = String(j.text || '');

          // 1) Prova come movimento "Soldi in tasca"
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

          // 2) Altrimenti prova come entrata
          const ok = await insertIncomeAssistant(spoken);
          if (ok) await loadAll(); else setError('Nessun dato riconosciuto dalla voce');

        } catch (e) { showError(setError,e); }
        setRecBusy(false);
        try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
        streamRef.current = null;
        setStopping(false);
      };
      mediaRecRef.current.start(); setRecBusy(true);
    } catch { setError('Microfono non disponibile'); }
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

          {/* 3) Soldi in tasca + Spese (con link) */}
          <div className="row-head">
            <h3 style={{ marginTop: '1rem' }}>3) Soldi in tasca</h3>
            <button type="button" className="btn-danger" onClick={handleClearPocket} title="Elimina movimenti manuali e nasconde qui le spese cash di Varie in questa vista">
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
                <thead><tr><th>Data</th><th>Descrizione</th><th style={{ textAlign: 'right' }}>Importo €</th></tr></thead>
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
