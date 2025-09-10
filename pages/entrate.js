// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

const PAYDAY_DAY = 10;
/** Categoria "Spese Varie" (resta per la logica di filtro della pagina) */
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

/**
 * Assicura il carryover del mese corrente calcolando saldo mese precedente.
 * Usa:
 *  - incomes (amount, received_[date|at])
 *  - jarvis_finances (price_total, purchase_date)
 *  - carryovers (month_key)
 */
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  const { data: existing } = await supabase
    .from('carryovers')
    .select('id')
    .eq('user_id', userId)
    .eq('month_key', monthKeyCurrent)
    .maybeSingle();
  if (existing) return;

  // mese precedente
  const [yy, mm] = monthKeyCurrent.split('-').map(Number);
  const prevEnd = new Date(yy, mm - 1, 0);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
  const prevStartISO = isoLocal(prevStart);
  const prevEndISO = isoLocal(prevEnd);
  const prevKey = prevEndISO.slice(0, 7);

  // Entrate mese precedente
  const { data: incPrev } = await supabase
    .from('incomes')
    .select('amount, received_date, received_at')
    .eq('user_id', userId)
    .or(
      `and(received_date.gte.${prevStartISO},received_date.lte.${prevEndISO}),` +
      `and(received_at.gte.${prevStartISO}T00:00:00,received_at.lte.${prevEndISO}T23:59:59)`
    );

  // Spese mese precedente (nuova tabella jarvis_finances)
  const { data: expPrevRows } = await supabase
    .from('jarvis_finances')
    .select('price_total, purchase_date')
    .eq('user_id', userId)
    .gte('purchase_date', prevStartISO)
    .lte('purchase_date', prevEndISO);

  // Carryover mese precedente, se esiste
  const { data: coPrev } = await supabase
    .from('carryovers')
    .select('amount')
    .eq('user_id', userId)
    .eq('month_key', prevKey)
    .maybeSingle();

  const totalInc = (incPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const totalExpPrev = (expPrevRows || []).reduce((t, r) => t + Number(r.price_total || 0), 0);
  const prevCarry = Number(coPrev?.amount || 0);
  const saldoPrevBase = totalInc + prevCarry - totalExpPrev;

  await supabase.from('carryovers').insert({
    user_id: userId,
    month_key: monthKeyCurrent,
    amount: Number(saldoPrevBase.toFixed(2)),
    note: 'Auto-carryover da mese precedente',
  });
}

function parseAmountLoose(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, '')
    .replace(/\./g, '').replace(',', '.'); // “1.200,50” -> “1200.50”
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function formatIT(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('it-IT');
}
function showError(setter, err) {
  const msg = err?.message || err?.error_description || err?.hint || (typeof err === 'string' ? err : JSON.stringify(err));
  setter(msg); console.error('[SUPABASE ERROR]', err);
}

/* ----------- classificazione negozio per routing/copy ----------- */
function isSupermarketStore(store = '') {
  const s = String(store).toLowerCase();
  return new RegExp(
    [
      'supermercat','ipermercat','market','discount',
      'conad','coop','esselunga','carrefour','auchan','pam','despar','a&o','iper',
      'lidl','md','eurospin','todis','alter discount','tigros','gs','famila',
      'deco','decò','tigre','simply','sidis','ipercoop','iper la grande i',
      'dok','cra\\s?i','penny','maxi\\s*store'
    ].join('|'),'i'
  ).test(s);
}
function isRestaurantBar(store = '') {
  const s = String(store).toLowerCase();
  return /\b(ristorante|trattoria|pizzeria|bar|pub|bistrot|osteria|sushi|braceria|enoteca)\b/i.test(s);
}
function titleize(s='') {
  return String(s)
    .toLowerCase()
    .replace(/(^|\s|-)\p{L}/gu, m => m.toUpperCase());
}

/* --------------------------- component --------------------------- */
function Entrate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [incomes, setIncomes] = useState([]);
  const [newIncome, setNewIncome] = useState({ source: 'Stipendio', description: '', amount: '', receivedAt: '' });

  const [carryover, setCarryover] = useState(null);
  const [newCarry, setNewCarry] = useState({ amount: '', note: '' });

  const [pocketRows, setPocketRows] = useState([]);
  const [pocketTopUp, setPocketTopUp] = useState('');
  const [monthExpenses, setMonthExpenses] = useState(0);

  // OCR / VOCE
  const ocrInputRef = useRef(null);
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // Dopo “Ripulisci”: nascondi in questa pagina anche le spese CASH della categoria VARIE
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

      // Entrate periodo (supporta sia received_date che received_at)
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
      const { data: co } = await supabase.from('carryovers')
        .select('id, month_key, amount, note')
        .eq('user_id', user.id).eq('month_key', monthKey).maybeSingle();
      setCarryover(co || null);

      // Movimenti contanti manuali
      const { data: pc } = await supabase.from('pocket_cash')
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

      // Spese (jarvis_finances) — con luogo + link routing
      const { data: finAll, error: finAllErr } = await supabase
        .from('jarvis_finances')
        .select('id, store, location, name, price_total, purchase_date, payment_method, created_at')
        .eq('user_id', user.id)
        .gte('purchase_date', startDate)
        .lte('purchase_date', endDate)
        .order('created_at', { ascending: false });

      if (finAllErr) throw finAllErr;

      function isElectronicByText(desc) {
        const ELECTRONIC_TOKENS = [
          'carta','carta di credito','credito','debito','pos',
          'visa','mastercard','amex','paypal','iban','bonifico',
          'satispay','apple pay','google pay'
        ];
        const t = String(desc || '').toLowerCase();
        return ELECTRONIC_TOKENS.some(k => t.includes(k));
      }
      function isCashByFields(row) {
        const pm = String(row.payment_method || '').toLowerCase();
        if (pm === 'cash' || pm === 'contanti') return true;
        if (pm && pm !== 'cash' && pm !== 'contanti') return false;
        const desc = `[${row.store || 'Punto vendita'}] ${row.name || ''}`;
        return !isElectronicByText(desc);
      }

      let finCash = (finAll || []).filter(isCashByFields);

      // Mapping + label leggibile + luogo + route
      let cashRows = (finCash || []).map((f) => {
        const dateISO = f.purchase_date || (f.created_at || '').slice(0, 10);
        const storeRaw = f.store || '';
        const locRaw   = f.location || '';                       // <-- luogo (se presente)
        const store = storeRaw ? titleize(storeRaw) : 'Articoli vari';
        const loc   = locRaw ? ` (${titleize(locRaw)})` : '';
        const dett  = f.name || '';
        const total = Number(f.price_total) || 0;

        const isRest = isRestaurantBar(storeRaw);
        const kind = isRest ? 'Cena/Aperitivo' : 'Spesa';
        const route = isRest ? '/cene-aperitivi' : '/spese-casa';

        const label = `${kind} ${store}${loc}${dett ? ` • ${dett}` : ''} — € ${total.toFixed(2)}`;

        return {
          id: `jfin-${f.id}`,
          dateISO,
          label,
          route,
          amount: -Math.abs(total),
          category_id: null,
          kind: 'cash-expense',
        };
      });

      if (hideVarieCashAfterClear) {
        cashRows = cashRows.filter(r => r.category_id !== CATEGORY_ID_VARIE);
      }

      const rows = [...manualRows, ...cashRows]
        .filter(r => Number.isFinite(r.amount) && r.amount !== 0)
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''));

      setPocketRows(rows);

      // Totale spese periodo (jarvis_finances)
      const { data: exp } = await supabase
        .from('jarvis_finances')
        .select('price_total, purchase_date')
        .eq('user_id', user.id)
        .gte('purchase_date', startDate)
        .lte('purchase_date', endDate);

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

  /** Inserisce pocket_cash (ricarica/uscita) — usato per voce/OCR “prelevato / messo in tasca” */
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

  /** Inserisce entrata (stipendio/pagamento) */
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
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const { text } = await res.json();

      if (isCashIntent(text)) {
        const parsed = quickParseCash(text);
        if (parsed) { await insertPocketQuick(parsed); await loadAll(); return; }
      }
      if (isIncomeIntent(text)) {
        const ok = await insertIncomeAssistant(text);
        if (ok) { await loadAll(); return; }
      }
      const ok2 = await insertIncomeAssistant(text);
      if (ok2) { await loadAll(); return; }

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
      mediaRecRef.current.onstop = processVoice;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch { setError('Microfono non disponibile'); }
  };

  const processVoice = async () => {
    const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
    const fd = new FormData(); fd.append('audio', blob, 'voice.webm');
    try {
      const res = await fetch('/api/stt', { method: 'POST', body: fd });
      const { text } = await res.json();

      if (isCashIntent(text)) {
        const parsed = quickParseCash(text);
        if (parsed) { await insertPocketQuick(parsed); setRecBusy(false); streamRef.current?.getTracks?.().forEach(t=>t.stop()); await loadAll(); return; }
      }
      if (isIncomeIntent(text)) {
        const ok = await insertIncomeAssistant(text);
        if (ok) { setRecBusy(false); streamRef.current?.getTracks?.().forEach(t=>t.stop()); await loadAll(); return; }
      }
      const ok2 = await insertIncomeAssistant(text);
      if (ok2) { setRecBusy(false); streamRef.current?.getTracks?.().forEach(t=>t.stop()); await loadAll(); return; }

      setError('Nessun dato riconosciuto dalla voce');
    } catch (err) {
      showError(setError, err);
    } finally {
      setRecBusy(false);
      try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
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

  async function handleSaveCarryover(e) {
    e.preventDefault(); setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr; if (!user) throw new Error('Sessione scaduta');
      const payload = {
        user_id: user.id, month_key: monthKey,
        amount: Number(newCarry.amount) || 0, note: newCarry.note || null,
      };
      if (carryover?.id) {
        const { error } = await supabase.from('carryovers').update(payload).eq('id', carryover.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('carryovers').insert(payload);
        if (error) throw error;
      }
      setNewCarry({ amount: '', note: '' });
      await loadAll();
    } catch (err) { showError(setError, err); }
  }

  async function handleTopUpPocket(e) {
    e.preventDefault(); setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr; if (!user) throw new Error('Sessione scaduta');
      const delta = parseAmountLoose(pocketTopUp);
      if (!delta) return;
      const payload = {
        user_id: user.id,
        note: delta >= 0 ? 'Ricarica contanti' : 'Uscita contanti',
        delta,
        moved_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('pocket_cash').insert(payload);
      if (error) throw error;
      setPocketTopUp('');
      await loadAll();
    } catch (err) { showError(setError, err); }
  }

  async function handleClearPocket() {
    if (!confirm('Ripulisci: rimuove i movimenti manuali e nasconde qui le spese cash di Varie. Confermi?')) return;
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr; if (!user) throw new Error('Sessione scaduta');

      // 1) cancella SOLO pocket_cash
      const { error } = await supabase.from('pocket_cash').delete().eq('user_id', user.id);
      if (error) throw error;

      // 2) in questa pagina, nascondi le spese cash di categoria VARIE
      setHideVarieCashAfterClear(true);

      await loadAll();
    } catch (err) { showError(setError, err); }
  }

  /* --------------------------- calcoli --------------------------- */
  const entratePeriodo = incomes.reduce((t, r) => t + Number(r.amount || 0), 0);
  const carryAmount = Number(carryover?.amount || 0);
  const prelievi = pocketRows.filter(r => r.kind === 'manual' && r.amount > 0).reduce((t, r) => t + r.amount, 0);
  const saldoDisponibile = Math.max(0, entratePeriodo + carryAmount - prelievi);
  const pocketBalance = pocketRows.reduce((t, r) => t + Number(r.amount || 0), 0);

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
              <input ref={ocrInputRef} type="file" accept="image/*" capture="environment" multiple hidden
                     onChange={(e) => handleOCR(Array.from(e.target.files || []))}/>
            </div>
          </div>

          {/* Periodo */}
          <div className="periodo-row">
            <span>Periodo corrente:</span><b>{startDateIT}</b><span>–</span><b>{endDateIT}</b>
          </div>

          {/* Box metriche */}
          <div className="total-box" style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.1)' }}>
            <h3>Disponibilità</h3>
            <div className="flex-line metric-sub"><span>Entrate periodo corrente:</span><b>€ {entratePeriodo.toFixed(2)}</b></div>
            <div className="flex-line metric-sub"><span>Carryover mese precedente:</span><b>€ {carryAmount.toFixed(2)}</b></div>
            <div className="flex-line"><span>Saldo disponibile:</span><b className="metric metric--saldo">€ {saldoDisponibile.toFixed(2)}</b></div>
            <div className="flex-line"><span>Soldi in tasca (restanti):</span><b className="metric metric--pocket">€ {pocketBalance.toFixed(2)}</b></div>
          </div>

          {/* Entrate */}
          <h3>1) Entrate del periodo</h3>
          <form className="input-section" onSubmit={handleAddIncome}>
            <input value={newIncome.source} onChange={(e) => setNewIncome({ ...newIncome, source: e.target.value })} placeholder="Fonte" required />
            <input value={newIncome.description} onChange={(e) => setNewIncome({ ...newIncome, description: e.target.value })} placeholder="Descrizione" required />
            <input type="date" value={newIncome.receivedAt} onChange={(e) => setNewIncome({ ...newIncome, receivedAt: e.target.value })} required />
            <input type="text" inputMode="decimal" value={newIncome.amount} onChange={(e) => setNewIncome({ ...newIncome, amount: e.target.value })} placeholder="Importo €" required />
            <button className="btn-manuale">Aggiungi</button>
          </form>

          {loading ? <p>Caricamento…</p> : (
            <table className="custom-table">
              <thead><tr><th>Fonte</th><th>Descrizione</th><th>Data</th><th>Importo €</th><th></th></tr></thead>
              <tbody>
                {incomes.map((i) => (
                  <tr key={i.id}>
                    <td>{i.source || '-'}</td>
                    <td>{i.description}</td>
                    <td>{i.received_at ? new Date(i.received_at).toLocaleDateString('it-IT') : (i.received_date ? formatIT(i.received_date) : '-')}</td>
                    <td>{Number(i.amount).toFixed(2)}</td>
                    <td><button className="btn-danger-outline" onClick={() => handleDeleteIncome(i.id)}>Elimina</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Carryover */}
          <h3 style={{ marginTop: '1rem' }}>2) Rimanenze / Perdite mesi precedenti</h3>
          <form className="input-section" onSubmit={handleSaveCarryover}>
            <input type="number" step="0.01" value={newCarry.amount}
                   onChange={(e) => setNewCarry({ ...newCarry, amount: e.target.value })}
                   placeholder={`Importo € per ${monthKey}`} required />
            <input value={newCarry.note} onChange={(e) => setNewCarry({ ...newCarry, note: e.target.value })} placeholder="Nota (opzionale)" />
            <button className="btn-manuale">{carryover ? 'Aggiorna' : 'Salva'}</button>
          </form>

          {carryover && (
            <table className="custom-table">
              <thead><tr><th>Mese</th><th>Importo €</th><th>Nota</th></tr></thead>
              <tbody><tr><td>{carryover.month_key}</td><td>{Number(carryover.amount).toFixed(2)}</td><td>{carryover.note || '-'}</td></tr></tbody>
            </table>
          )}

          {/* Soldi in tasca */}
          <h3 style={{ marginTop: '1rem' }}>3) Soldi in tasca</h3>
          <div className="table-container">
            {loading ? (
              <p>Caricamento…</p>
            ) : (
              <table className="custom-table">
                <thead><tr><th>Data</th><th>Descrizione</th><th style={{ textAlign: 'right' }}>Importo €</th></tr></thead>
                <tbody>
                  {pocketRows.map((m) => (
                    <tr key={m.id}>
                      <td>{m.dateISO ? new Date(m.dateISO).toLocaleDateString('it-IT') : '-'}</td>
                      <td>
                        {m.route ? (
                          <Link href={m.route} className="row-link">{m.label}</Link>
                        ) : (
                          <span>{m.label}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {m.amount >= 0 ? '+' : '-'} {Math.abs(m.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          <Link href="/home"><button className="btn-vocale" style={{ marginTop: '1rem' }}>Home</button></Link>
        </div>
      </div>

      <style jsx global>{`
        .spese-casa-container1 { width: 100%; display: flex; align-items: center; justify-content: center; background: #0f172a; min-height: 100vh; padding: 2rem; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
        .spese-casa-container2 { background: rgba(0, 0, 0, 0.6); padding: 2rem; border-radius: 1rem; color: #fff; box-shadow: 0 6px 16px rgba(0,0,0,.3); max-width: 1000px; width: 100%; }
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
        .total-box { background: rgba(255,255,255,.06); padding: 1rem; border-radius: .75rem; }
        .metric { font-size: 1.6rem; font-weight: 800; line-height: 1.1; }
        .metric-sub { font-size: 1rem; opacity: .85; }
        .metric--saldo { color: #22c55e; }
        .metric--pocket { color: #06b6d4; }
        .error { color: #f87171; margin-top: 1rem; }
        .row-link { color: #c7d2fe; text-decoration: underline; }
        .row-link:hover { opacity: .9; }
      `}</style>
    </>
  );
}

export default withAuth(Entrate);
