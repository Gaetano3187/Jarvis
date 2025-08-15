
// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

const PAYDAY_DAY = 10;
/** Categoria "Spese Varie" */
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
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  const { data: existing } = await supabase.from('carryovers').select('id')
    .eq('user_id', userId).eq('month_key', monthKeyCurrent).maybeSingle();
  if (existing) return;

  const [yy, mm] = monthKeyCurrent.split('-').map(Number);
  const prevEnd = new Date(yy, mm - 1, 0);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
  const prevStartISO = isoLocal(prevStart);
  const prevEndISO = isoLocal(prevEnd);
  const prevKey = prevEndISO.slice(0, 7);

  const { data: incPrev } = await supabase.from('incomes').select('amount')
    .eq('user_id', userId).gte('received_date', prevStartISO).lte('received_date', prevEndISO);
  const { data: expPrev } = await supabase.from('finances').select('amount')
    .eq('user_id', userId).gte('spent_date', prevStartISO).lte('spent_date', prevEndISO);
  const { data: coPrev } = await supabase.from('carryovers').select('amount')
    .eq('user_id', userId).eq('month_key', prevKey).maybeSingle();

  const totalInc = (incPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const totalExp = (expPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const prevCarry = Number(coPrev?.amount || 0);
  const saldoPrevBase = totalInc + prevCarry - totalExp;

  await supabase.from('carryovers').insert({
    user_id: userId, month_key: monthKeyCurrent,
    amount: Number(saldoPrevBase.toFixed(2)), note: 'Auto-carryover da mese precedente',
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

/* ----------- intent detection + quick parsing senza assistant ----------- */
function isCashIntent(text) {
  const t = (text || '').toLowerCase();
  return /(prelev|ritirat|bancomat|atm|in tasca|contanti|cash)/.test(t)
      || /ho preso\s*\d+([.,]\d{1,2})?\s*€.*(tasca|contanti)/.test(t);
}
function isIncomeIntent(text) {
  const t = (text || '').toLowerCase();
  return /(stipendio|busta paga|accredito|bonifico|fattura|pagamento|mi hanno pagato|compenso|rimborso)/.test(t);
}
/** Estrae importo e data (“oggi/ieri/…”) per frasi contante */
function quickParseCash(text) {
  const t = (text || '').toLowerCase();
  const m = t.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const raw = m[1];
  const amount = parseAmountLoose(raw);
  let date = isoLocal(new Date());
  if (/\bieri\b/.test(t)) {
    const d = new Date(); d.setDate(d.getDate() - 1); date = isoLocal(d);
  }
  const isOut = /(uscita|spes|pagat.*contanti)/.test(t);
  const isIn  = /(prelev|messo in tasca|ritirat|bancomat|atm)/.test(t);
  const delta = isOut ? -Math.abs(amount) : Math.abs(amount); // default in (+)
  const note =
    isOut ? 'Uscita contanti'
         : (/prelev/.test(t) ? 'Prelievo/ricarica contanti' : 'Ricarica contanti');
  return { amount, date, delta, note };
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

// Spese cash dalle altre sezioni — cash di default salvo parole “elettronico” in descrizione
const ELECTRONIC_TOKENS = [
  'carta', 'carta di credito', 'credito', 'debito', 'pos',
  'visa', 'mastercard', 'amex', 'paypal', 'iban', 'bonifico',
  'satispay', 'apple pay', 'google pay'
];

const { data: finAll, error: finAllErr } = await supabase
  .from('finances')
  .select('id, description, amount, spent_at, spent_date, category_id, payment_method')
  .eq('user_id', user.id)
  .or(
    `and(spent_date.gte.${startDate},spent_date.lte.${endDate}),` +
    `and(spent_at.gte.${dateStartTS},spent_at.lte.${dateEndTS})`
  )
  .order('spent_at', { ascending: false, nullsFirst: false })
  .order('spent_date', { ascending: false, nullsFirst: false });

if (finAllErr) throw finAllErr;

function isElectronicByText(desc) {
  const t = String(desc || '').toLowerCase();
  return ELECTRONIC_TOKENS.some(k => t.includes(k));
}
function isCashByFields(row) {
  const pm = String(row.payment_method || '').toLowerCase();
  if (pm === 'cash' || pm === 'contanti') return true;       // esplicitamente contanti
  if (pm && pm !== 'cash' && pm !== 'contanti') return false; // esplicitamente elettronico
  // default: contanti se la descrizione NON contiene parole di pagamento elettronico
  return !isElectronicByText(row.description);
}

let finCash = (finAll || []).filter(isCashByFields);

let cashRows = (finCash || []).map((f) => {
  const dateISO = f.spent_date || (f.spent_at || '').slice(0, 10);
  const m = (f.description || '').match(/^\[(.*?)\]\s*(.*)$/);
  const store = m ? m[1] : 'Punto vendita';
  const dett  = m ? m[2] : (f.description || '');
  return {
    id: `fin-${f.id}`,
    dateISO,
    label: `Spesa in contante • ${store}${dett ? ` • ${dett}` : ''}`,
    amount: -Math.abs(Number(f.amount) || 0),
    category_id: f.category_id,
    kind: 'cash-expense',
  };
});

// Dopo "Ripulisci": nascondi le spese cash della categoria VARIE nella pagina Entrate
if (hideVarieCashAfterClear) {
  cashRows = cashRows.filter(r => r.category_id !== CATEGORY_ID_VARIE);
}


      const rows = [...manualRows, ...cashRows]
        .filter(r => Number.isFinite(r.amount) && r.amount !== 0)
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''));

      setPocketRows(rows);

      // Totale spese del periodo (facoltativo)
      const { data: exp } = await supabase.from('finances')
        .select('amount, spent_date').eq('user_id', user.id)
        .gte('spent_date', startDate).lte('spent_date', endDate);
      const totalExp = (exp || []).reduce((t, r) => t + Number(r.amount || 0), 0);
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
      // fallback: prova income comunque
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
                    <td>{i.received_at ? new Date(i.received_at).toLocaleDateString('it-IT') : '-'}</td>
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
          <form className="input-section" onSubmit={handleTopUpPocket}>
            <input type="text" inputMode="decimal" value={pocketTopUp}
                   onChange={(e) => setPocketTopUp(e.target.value)} placeholder="Ricarica (+) / Uscita (-) €" required />
            <button className="btn-manuale">+ Aggiungi</button>
            <button type="button" className="btn-danger" onClick={handleClearPocket}>Ripulisci</button>
            {hideVarieCashAfterClear && (
              <p style={{ opacity: 0.85, marginTop: '.5rem', flexBasis: '100%' }}>
                Vista filtrata: spese cash della categoria <b>Varie</b> nascoste in questa pagina (restano nelle rispettive sezioni).
              </p>
            )}
          </form>

          {loading ? <p>Caricamento…</p> : (
            <table className="custom-table">
              <thead><tr><th>Data</th><th>Descrizione</th><th style={{ textAlign: 'right' }}>Importo €</th></tr></thead>
              <tbody>
                {pocketRows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.dateISO ? new Date(m.dateISO).toLocaleDateString('it-IT') : '-'}</td>
                    <td>{m.label}</td>
                    <td style={{ textAlign: 'right' }}>{m.amount >= 0 ? '+' : '-'} {Math.abs(m.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {error && <p className="error">{error}</p>}

          <Link href="/home"><button className="btn-vocale" style={{ marginTop: '1rem' }}>Home</button></Link>
        </div>
      </div>

      <style jsx>{`
  /* ====== Layout & container (glass) ====== */
  .spese-casa-container1{
    width:100%;
    min-height:100vh;
    padding: clamp(16px, 3vw, 28px);
    display:flex; align-items:flex-start; justify-content:center;
    background: transparent;              /* lascia lo sfondo ai global */
    color:#e6f1ff;
    font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  }
  .spese-casa-container2{
    width:100%;
    max-width: 1000px;
    padding: clamp(16px, 2.6vw, 24px);
    border-radius: 16px;
    background: rgba(255,255,255,.08);
    border:1px solid rgba(255,255,255,.18);
    backdrop-filter: blur(14px) saturate(120%);
    -webkit-backdrop-filter: blur(14px) saturate(120%);
    box-shadow: 0 12px 30px rgba(0,0,0,.45);
  }

  /* ====== Header & titolo animato ====== */
  .title-row{
    display:flex; align-items:center; justify-content:space-between;
    gap: 10px; margin-bottom: 6px; flex-wrap: wrap;
  }
  .title{
    margin:0;
    font-size: clamp(1.35rem, 3.2vw, 1.6rem);
    font-weight: 800; letter-spacing:.2px;
    background: linear-gradient(90deg,#ffffff,#c7d2fe,#22d3ee,#ffffff);
    -webkit-background-clip:text; background-clip:text; color:transparent;
    background-size:220% 100%;
    text-shadow:
      0 1px 0 rgba(255,255,255,.22),
      0 2px 0 rgba(0,0,0,.28),
      0 10px 26px rgba(0,0,0,.35);
    animation: textShine 3.6s ease-in-out infinite, textEmbossPulse 2.4s ease-in-out infinite;
  }
  @keyframes textShine { 0%{background-position:0 50%} 100%{background-position:200% 50%} }
  @keyframes textEmbossPulse { 0%,100%{filter:none} 50%{filter:drop-shadow(0 4px 14px rgba(0,0,0,.25))} }

  .title-actions{ display:flex; gap:8px; flex-wrap:wrap; }

  .periodo-row{
    display:flex; gap: 6px; align-items:center;
    margin: 6px 0 12px; font-size:.98rem; opacity:.92; flex-wrap:wrap;
  }

  /* ====== Bottoni vetrificati + bagliore “sweep” ====== */
  .btn-vocale, .btn-ocr, .btn-manuale, .btn-danger, .btn-danger-outline{
    position: relative; overflow: hidden; isolation:isolate;
    display:inline-flex; align-items:center; justify-content:center; gap:8px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.22);
    color:#061019;
    font-weight:700; letter-spacing:.2px;
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.28),
      0 10px 26px rgba(0,0,0,.36),
      0 0 24px rgba(16,185,129,.22);
    transition: transform .18s ease, box-shadow .22s ease, filter .2s ease;
    cursor:pointer;
  }
  .btn-vocale{ background: linear-gradient(90deg, #22c55e, #86efac); }
  .btn-ocr{    background: linear-gradient(90deg, #06b6d4, #67e8f9); }
  .btn-manuale{background: linear-gradient(90deg, #10b981, #34d399); }
  .btn-danger{ background: linear-gradient(90deg, #ef4444, #fca5a5); color:#1a0d0d; }
  .btn-danger-outline{
    background: rgba(255,255,255,.06); color:#fca5a5; border-color: rgba(239,68,68,.8);
  }

  /* aureola caleidoscopio */
  .btn-vocale::before, .btn-ocr::before, .btn-manuale::before,
  .btn-danger::before, .btn-danger-outline::before{
    content:""; position:absolute; inset:-32%;
    background: conic-gradient(from 0deg, #f472b6, #f59e0b, #10b981, #22c55e, #8b5cf6, #f472b6);
    filter: blur(18px); opacity:.55; z-index:-1; animation: kaleiSpin 8s linear infinite;
  }
  @keyframes kaleiSpin { to{ transform: rotate(360deg); } }

  /* sweep centrale */
  .btn-vocale::after, .btn-ocr::after, .btn-manuale::after,
  .btn-danger::after, .btn-danger-outline::after{
    content:""; position:absolute; top:0; left:-160%;
    width:160%; height:100%;
    background: linear-gradient(110deg,
      transparent 0%,
      rgba(255,255,255,.18) 44%,
      rgba(255,255,255,.70) 50%,
      rgba(255,255,255,.18) 56%,
      transparent 100%);
    transform: skewX(-18deg); mix-blend-mode: screen; pointer-events:none;
    animation: btnSweep 2.6s cubic-bezier(.25,.6,.35,1) infinite;
  }
  @keyframes btnSweep { 0%{ left:-170%; } 100%{ left:170%; } }

  .btn-vocale:hover, .btn-ocr:hover, .btn-manuale:hover, .btn-danger:hover, .btn-danger-outline:hover{
    transform: translateY(-2px);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.36),
      0 14px 32px rgba(0,0,0,.42),
      0 0 36px rgba(16,185,129,.28);
  }

  /* ====== Form (glass inputs) ====== */
  .input-section{
    display:flex; flex-wrap:wrap; gap: 10px; align-items:center; margin: 10px 0 14px;
  }
  .input-section input{
    padding: 10px 12px; border-radius: 12px;
    border:1px solid rgba(255,255,255,.22);
    background: rgba(255,255,255,.10); color:#e6f1ff;
    outline:none; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    transition: box-shadow .18s ease, border-color .2s ease, transform .08s ease;
    flex: 1 1 200px; min-width: 180px;
  }
  .input-section input:focus{
    border-color: rgba(96,165,250,.9);
    box-shadow: 0 0 0 3px rgba(96,165,250,.25);
    transform: translateY(-1px);
  }

  /* righe KPI */
  .flex-line{ display:flex; justify-content:space-between; gap:12px; margin: 6px 0; flex-wrap:wrap; }
  .metric{ font-size: clamp(1.25rem, 4.5vw, 1.6rem); font-weight:800; line-height:1.1; }
  .metric-sub{ font-size: .98rem; opacity:.9; }
  .metric--saldo{ color:#86efac; text-shadow: 0 0 12px rgba(134,239,172,.35); }
  .metric--pocket{ color:#67e8f9; text-shadow: 0 0 12px rgba(103,232,249,.35); }

  .total-box{
    background: linear-gradient(180deg, rgba(34,197,94,.32), rgba(34,197,94,.14));
    border: 1px solid rgba(34,197,94,.5);
    box-shadow: 0 12px 30px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.16);
    border-radius: 14px; padding: 14px; margin-bottom: 12px;
  }

  /* ====== Tabelle: desktop leggibile + mobile senza sovrapposizioni ====== */
  .custom-table{
    width:100%;
    border-collapse: separate; border-spacing:0;
    border-radius: 14px; overflow:hidden;
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.18);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.10);
    display:block;                 /* abilita overflow-x */
    overflow-x:auto;
    -webkit-overflow-scrolling: touch;
    min-width: 720px;              /* prevenire compressione: scroll su schermi stretti */
  }
  .custom-table thead{
    display: table; width:100%; table-layout:fixed;
    background: linear-gradient(0deg, rgba(255,255,255,.18), rgba(255,255,255,.08));
    backdrop-filter: blur(10px);
    position: sticky; top: 0; z-index: 2;
  }
  .custom-table tbody{ display: table; width:100%; table-layout:fixed; }
  .custom-table th, .custom-table td{
    padding: 11px 14px;
    white-space: nowrap;           /* desktop: no wrap */
    border-bottom: 1px solid rgba(255,255,255,.16);
    text-align: left;
  }
  .custom-table tbody tr:nth-child(odd){ background: rgba(255,255,255,.07); }
  .custom-table tbody tr:nth-child(even){ background: rgba(0,0,0,.12); }
  .custom-table tbody tr:hover{ filter: brightness(1.08); }

  /* tabella 2 e 3 riusano le stesse classi */
  /* Mobile: consentire il wrap per evitare sovrapposizioni */
  @media (max-width: 820px){
    .custom-table{ min-width: 0; display: table; overflow-x: visible; }
    .custom-table thead{ position: sticky; top: 0; }
    .custom-table tbody{ display: table-row-group; }
    .custom-table th, .custom-table td{
      white-space: normal; word-break: break-word; overflow-wrap: anywhere; max-width: 1px;
    }
  }

  .error{ color:#fda4af; font-weight:700; margin-top: 10px; }

  /* ====== Responsive tweaks ====== */
  @media (max-width: 900px){
    .title-actions{ width:100%; }
    .btn-vocale, .btn-ocr, .btn-manuale, .btn-danger, .btn-danger-outline{ width: 100%; }
    .input-section{ flex-direction: column; }
  }
`}</style>
