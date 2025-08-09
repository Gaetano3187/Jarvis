// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

/** Giorno “payday” usato solo per calcolare il periodo corrente */
const PAYDAY_DAY = 10;

/* --------------------------- helpers --------------------------- */
function computeCurrentPayPeriod(today, paydayDay) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();

  const thisPayday = new Date(y, m, paydayDay);
  let start, end;

  if (d >= paydayDay) {
    start = thisPayday;
    end = new Date(y, m + 1, paydayDay - 1);
  } else {
    start = new Date(y, m - 1, paydayDay);
    end = new Date(y, m, paydayDay - 1);
  }

  const startDate = start.toISOString().slice(0, 10); // YYYY-MM-DD
  const endDate = end.toISOString().slice(0, 10);     // YYYY-MM-DD
  const monthKey = end.toISOString().slice(0, 7);
  return { startDate, endDate, monthKey };
}

/** Se manca il carryover per il mese corrente, lo crea come residuo del mese precedente (saldo base) */
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  console.log('[CARRY] ensureCarryoverAuto start', { userId, monthKeyCurrent });
  const { data: existing, error: e0 } = await supabase
    .from('carryovers')
    .select('id')
    .eq('user_id', userId)
    .eq('month_key', monthKeyCurrent)
    .maybeSingle();

  if (e0 && e0.code !== 'PGRST116') {
    console.error('[CARRY] existing check error', e0);
    throw e0;
  }
  if (existing) {
    console.log('[CARRY] already exists for', monthKeyCurrent, 'id=', existing.id);
    return;
  }

  const [yy, mm] = monthKeyCurrent.split('-').map(Number);
  const prevEnd = new Date(yy, mm - 1, 0);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
  const prevStartISO = prevStart.toISOString().slice(0, 10);
  const prevEndISO = prevEnd.toISOString().slice(0, 10);
  const prevKey = prevEnd.toISOString().slice(0, 7);

  console.log('[CARRY] prev period', { prevStartISO, prevEndISO, prevKey });

  const { data: incPrev, error: e1 } = await supabase
    .from('incomes')
    .select('amount')
    .eq('user_id', userId)
    .gte('received_at', prevStartISO)
    .lte('received_at', prevEndISO);
  if (e1) { console.error('[CARRY] incPrev error', e1); throw e1; }

  const { data: expPrev, error: e2 } = await supabase
    .from('finances')
    .select('amount')
    .eq('user_id', userId)
    .gte('spent_at', prevStartISO)
    .lte('spent_at', prevEndISO);
  if (e2) { console.error('[CARRY] expPrev error', e2); throw e2; }

  const { data: coPrev, error: e3 } = await supabase
    .from('carryovers')
    .select('amount')
    .eq('user_id', userId)
    .eq('month_key', prevKey)
    .maybeSingle();
  if (e3 && e3.code !== 'PGRST116') { console.error('[CARRY] coPrev error', e3); throw e3; }

  const totalInc = (incPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const totalExp = (expPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const prevCarry = Number(coPrev?.amount || 0);
  const saldoPrevBase = totalInc + prevCarry - totalExp;

  console.log('[CARRY] computed', { totalInc, totalExp, prevCarry, saldoPrevBase });

  const { error: e4 } = await supabase.from('carryovers').insert({
    user_id: userId,
    month_key: monthKeyCurrent,
    amount: Number(saldoPrevBase.toFixed(2)),
    note: 'Auto-carryover da mese precedente',
  });
  if (e4) { console.error('[CARRY] insert error', e4); throw e4; }
  console.log('[CARRY] inserted for', monthKeyCurrent);
}

/** Parser importi: accetta "10,50" o "10.50" e rimuove spazi */
function parseAmountLoose(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Formatta YYYY-MM-DD -> dd/mm/yyyy (IT) */
function formatIT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isNaN(d)) return d.toLocaleDateString('it-IT');
  const [yy, mm, dd] = String(iso).split('-').map(Number);
  if (yy && mm && dd) return new Date(yy, mm - 1, dd).toLocaleDateString('it-IT');
  return String(iso);
}

/** Error helper */
function showError(setter, err) {
  const msg =
    err?.message ||
    err?.error_description ||
    err?.hint ||
    (typeof err === 'string' ? err : JSON.stringify(err));
  setter(msg);
  console.error('[SUPABASE ERROR]', err);
}

/* --------------------------- component --------------------------- */
function Entrate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [incomes, setIncomes] = useState([]);
  const [newIncome, setNewIncome] = useState({
    source: 'Stipendio',
    description: '',
    amount: '',
    receivedAt: '',
  });

  const [carryover, setCarryover] = useState(null);
  const [newCarry, setNewCarry] = useState({ amount: '', note: '' });

  const [pocketRows, setPocketRows] = useState([]); // movimenti manuali + spese cash
  const [pocketTopUp, setPocketTopUp] = useState('');

  const [monthExpenses, setMonthExpenses] = useState(0); // opzionale

  // OCR / VOCE
  const ocrInputRef = useRef(null);
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // === Date correnti ===
  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY);

  // ISO per filtri
  const startDateISO = startDate; // 'YYYY-MM-DD'
  const endDateISO = endDate;     // 'YYYY-MM-DD'
  const endExclusiveDate = (() => {
    const d = new Date(endDateISO + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  })();

  // Italiano per UI
  const startDateIT = formatIT(startDateISO);
  const endDateIT = formatIT(endDateISO);

  useEffect(() => {
    console.log('[MOUNT] Entrate page mount');
    loadAll();
    return () => {
      try {
        if (mediaRecRef.current && mediaRecRef.current.state === 'recording') {
          mediaRecRef.current.stop();
        }
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
      } catch {}
      console.log('[UNMOUNT] Entrate page unmount');
    };
  }, [monthKey]);

  async function loadAll() {
    console.log('================ [LOAD ALL] ================');
    console.log('[PERIODO]', { startDateISO, endDateISO, endExclusiveDate, startDateIT, endDateIT, monthKey });

    setLoading(true);
    setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) { console.error('[AUTH] getUser error', userErr); throw userErr; }
      if (!user) throw new Error('Sessione scaduta');
      console.log('[AUTH] user', user.id);

      await ensureCarryoverAuto(user.id, monthKey);

      // 1) Entrate del periodo (ISO nei filtri)
      const { data: inc, error: e1 } = await supabase
        .from('incomes')
        .select('id, source, description, amount, received_at')
        .eq('user_id', user.id)
        .gte('received_at', startDateISO)
        .lt('received_at', endExclusiveDate)
        .order('received_at', { ascending: false });
      if (e1) { console.error('[FETCH] incomes error', e1); throw e1; }
      console.log('[FETCH] incomes count', inc?.length ?? 0);
      setIncomes(inc || []);

      // 2) Carryover
      const { data: co, error: e2 } = await supabase
        .from('carryovers')
        .select('id, month_key, amount, note')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle();
      if (e2 && e2.code !== 'PGRST116') { console.error('[FETCH] carryover error', e2); throw e2; }
      console.log('[FETCH] carryover', co);
      setCarryover(co || null);

      // 3a) Movimenti contante manuali nel periodo
      // Inclusi record che hanno moved_at NULLO: usiamo created_at come fallback
      const { data: pc, error: e3 } = await supabase
        .from('pocket_cash')
        .select('id, created_at, moved_at, note, delta, amount, direction')
        .eq('user_id', user.id)
        .or(`and(moved_at.gte.${startDateISO},moved_at.lt.${endExclusiveDate}),and(created_at.gte.${startDateISO},created_at.lt.${endExclusiveDate})`)
        .order('moved_at', { ascending: false })
        .order('created_at', { ascending: false });
      if (e3) { console.error('[FETCH] pocket_cash error', e3); throw e3; }
      console.log('[FETCH] pocket_cash count', pc?.length ?? 0);

      const manualRows = (pc || []).map((row) => {
        const eff = (row.delta != null)
          ? Number(row.delta || 0)
          : (row.amount != null
              ? (row.direction === 'in' ? 1 : -1) * Number(row.amount || 0)
              : 0);

        const dateISO = (row.moved_at || row.created_at || '').slice(0, 10);

        return {
          id: `pc-${row.id}`,
          dateISO,
          label: row.note?.trim() || (eff >= 0 ? 'Ricarica contanti' : 'Uscita contanti'),
          amount: Number(eff || 0),
        };
      });
      console.log('[MAP] manualRows', manualRows.length);

      // 3b) Spese cash dalle altre pagine (ISO nei filtri)
      const { data: finCash, error: e4 } = await supabase
        .from('finances')
        .select('id, description, amount, spent_at')
        .eq('user_id', user.id)
        .eq('payment_method', 'cash')
        .gte('spent_at', startDateISO)
        .lt('spent_at', endExclusiveDate)
        .order('spent_at', { ascending: false });
      if (e4) { console.error('[FETCH] finances cash error', e4); throw e4; }
      console.log('[FETCH] finances cash count', finCash?.length ?? 0);

      const cashRows = (finCash || []).map((f) => {
        const dateISO = (f.spent_at || '').slice(0, 10);
        const m = (f.description || '').match(/^\[(.*?)\]\s*(.*)$/);
        const store = m ? m[1] : 'Punto vendita';
        const dett  = m ? m[2] : (f.description || '');
        return {
          id: `fin-${f.id}`,
          dateISO,
          label: `Spesa in contante • ${store}${dett ? ` • ${dett}` : ''}`,
          amount: -Math.abs(Number(f.amount) || 0),
        };
      });
      console.log('[MAP] cashRows', cashRows.length);

      const rows = [...manualRows, ...cashRows]
        .filter(r => Number.isFinite(r.amount) && r.amount !== 0)
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''));
      console.log('[MERGE] pocketRows total', rows.length);

      setPocketRows(rows);

      // 4) (opzionale) Totale spese nel periodo
      const { data: exp, error: e5 } = await supabase
        .from('finances')
        .select('amount, spent_at')
        .eq('user_id', user.id)
        .gte('spent_at', startDateISO)
        .lt('spent_at', endExclusiveDate);
      if (e5) { console.error('[FETCH] expenses error', e5); throw e5; }
      const totalExp = (exp || []).reduce((t, r) => t + Number(r.amount || 0), 0);
      console.log('[FETCH] expenses count', exp?.length ?? 0, 'totalExp', totalExp);
      setMonthExpenses(totalExp);

      console.log('================ [/LOAD ALL OK] ================');
    } catch (err) {
      console.error('================ [/LOAD ALL ERROR] ================');
      showError(setError, err);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------- Assistant (OCR/voce) ---------------------- */
  function buildPocketPrompt(userText) {
    const example = JSON.stringify({
      type: 'pocket_topup',
      items: [{ amount: 200.0, note: 'ricarica contanti', date: 'YYYY-MM-DD' }],
    });
    const none = JSON.stringify({ type: 'none' });
    return [
      'Sei Jarvis. Capisci se il testo indica un MOVIMENTO di contante (ricarica o uscita).',
      'Se si, rispondi SOLO con JSON:',
      example,
      'Se non e un movimento contante, restituisci ' + none + '.',
      '',
      'Testo:',
      userText,
    ].join('\n');
  }

  function buildIncomePrompt(userText) {
    const today = new Date().toISOString().slice(0, 10);
    const example = JSON.stringify({
      type: 'income',
      items: [{ source: 'Stipendio', description: 'Stipendio', amount: 1500, receivedAt: today }],
    });
    return [
      'Sei Jarvis. Estrai ENTRATE economiche.',
      'Rispondi SOLO con JSON:',
      example,
      '',
      'Testo:',
      userText,
    ].join('\n');
  }

  async function callAssistant(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const { answer, error: apiErr } = await res.json();
    if (!res.ok || apiErr) throw new Error(apiErr || String(res.status));
    return JSON.parse(answer);
  }

  // Normalizza segni per contante via OCR/Voce
  async function parseAssistantForPocket(userText) {
    const data = await callAssistant(buildPocketPrompt(userText));
    if (data.type !== 'pocket_topup' || !Array.isArray(data.items) || !data.items.length) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');

    const rows = data.items.map((it) => {
      const raw = parseAmountLoose(it.amount);
      const note = (it.note || '').trim();
      const noteL = note.toLowerCase();

      let delta = raw;
      if (noteL.includes('preliev') || noteL.includes('ricarica')) delta = Math.abs(raw);
      else if (noteL.includes('uscit') || noteL.includes('spesa')) delta = -Math.abs(raw);

      return {
        user_id: user.id,
        note: note || (delta >= 0 ? 'Ricarica contanti' : 'Uscita contanti'),
        delta,
        moved_at: it.date || new Date().toISOString(),
      };
    });

    console.log('[INSERT POCKET OCR]', rows);
    const { error } = await supabase.from('pocket_cash').insert(rows);
    if (error) { console.error('[INSERT POCKET OCR ERROR]', error); throw error; }
    return true;
  }

  // Entrate via OCR/Voce sempre positive
  async function parseAssistantForIncome(userText) {
    const data = await callAssistant(buildIncomePrompt(userText));
    if (data.type !== 'income' || !Array.isArray(data.items) || !data.items.length) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');

    for (const it of data.items) {
      const dataIncasso = it.receivedAt || new Date().toISOString().slice(0, 10);
      const amount = Math.abs(parseAmountLoose(it.amount));

      const payload = {
        user_id: user.id,
        source: it.source || 'Entrata',
        description: it.description || it.source || 'Entrata',
        amount,
        received_at: dataIncasso
      };
      console.log('[INSERT INCOME OCR]', payload);

      const { error } = await supabase.from('incomes').insert(payload);
      if (error) { console.error('[INSERT INCOME OCR ERROR]', error); throw error; }
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

      const handledPocket = await parseAssistantForPocket(text);
      if (handledPocket) {
        await loadAll();
        return;
      }

      const handledIncome = await parseAssistantForIncome(text);
      if (handledIncome) {
        await loadAll();
        return;
      }

      setError('Nessun dato riconosciuto da OCR');
    } catch (err) {
      showError(setError, err);
    }
  }

  const toggleRec = async () => {
    if (recBusy) {
      try { mediaRecRef.current?.stop(); } catch {}
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => { if (e.data?.size) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop = processVoice;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch {
      setError('Microfono non disponibile');
    }
  };

  const processVoice = async () => {
    const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
    const fd = new FormData();
    fd.append('audio', blob, 'voice.webm');

    try {
      const res = await fetch('/api/stt', { method: 'POST', body: fd });
      const { text } = await res.json();

      const handledPocket = await parseAssistantForPocket(text);
      if (handledPocket) {
        setRecBusy(false);
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
        await loadAll();
        return;
      }

      const handledIncome = await parseAssistantForIncome(text);
      if (handledIncome) {
        setRecBusy(false);
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
        await loadAll();
        return;
      }

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
    e.preventDefault();
    setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) { console.error('[AUTH] getUser error', userErr); throw userErr; }
      if (!user) throw new Error('Sessione scaduta');

      const payload = {
        user_id: user.id,
        source: newIncome.source || 'Entrata',
        description: newIncome.description || newIncome.source || 'Entrata',
        amount: Math.abs(parseAmountLoose(newIncome.amount)),
        received_at: newIncome.receivedAt || new Date().toISOString().slice(0, 10),
      };

      console.log('[INSERT INCOME MANUAL]', payload);

      const { error } = await supabase.from('incomes').insert(payload);
      if (error) { console.error('[INSERT INCOME MANUAL ERROR]', error); throw error; }

      setNewIncome({ source: 'Stipendio', description: '', amount: '', receivedAt: '' });
      await loadAll();
    } catch (err) {
      showError(setError, err);
    }
  }

  async function handleDeleteIncome(id) {
    try {
      console.log('[DELETE INCOME]', id);
      const { error: e } = await supabase.from('incomes').delete().eq('id', id);
      if (e) { console.error('[DELETE INCOME ERROR]', e); throw e; }
      setIncomes(incomes.filter((i) => i.id !== id));
    } catch (err) {
      showError(setError, err);
    }
  }

  async function handleSaveCarryover(e) {
    e.preventDefault();
    setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) { console.error('[AUTH] getUser error', userErr); throw userErr; }
      if (!user) throw new Error('Sessione scaduta');

      const payload = {
        user_id: user.id,
        month_key: monthKey,
        amount: Number(newCarry.amount) || 0,
        note: newCarry.note || null,
      };

      console.log('[CARRY SAVE] payload', payload, 'existing', carryover?.id);

      if (carryover?.id) {
        const { error } = await supabase.from('carryovers').update(payload).eq('id', carryover.id);
        if (error) { console.error('[CARRY UPDATE ERROR]', error); throw error; }
      } else {
        const { error } = await supabase.from('carryovers').insert(payload);
        if (error) { console.error('[CARRY INSERT ERROR]', error); throw error; }
      }

      setNewCarry({ amount: '', note: '' });
      await loadAll();
    } catch (err) {
      showError(setError, err);
    }
  }

  async function handleTopUpPocket(e) {
    e.preventDefault();
    setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) { console.error('[AUTH] getUser error', userErr); throw userErr; }
      if (!user) throw new Error('Sessione scaduta');

      const delta = parseAmountLoose(pocketTopUp);
      if (!delta) {
        console.warn('[INSERT POCKET MANUAL] delta falsy, skip');
        return;
      }

      const payload = {
        user_id: user.id,
        note: delta >= 0 ? 'Ricarica contanti' : 'Uscita contanti',
        delta,
        moved_at: new Date().toISOString(),
      };

      console.log('[INSERT POCKET MANUAL]', payload);

      const { error } = await supabase.from('pocket_cash').insert(payload);
      if (error) { console.error('[INSERT POCKET MANUAL ERROR]', error); throw error; }

      setPocketTopUp('');
      await loadAll();
    } catch (err) {
      showError(setError, err);
    }
  }

  async function handleClearPocket() {
    if (!confirm('Azzerare TUTTI i movimenti di "Soldi in tasca"?')) return;
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) { console.error('[AUTH] getUser error', userErr); throw userErr; }
      if (!user) throw new Error('Sessione scaduta');

      console.log('[POCKET CLEAR] deleting all for user', user.id);

      const { error } = await supabase.from('pocket_cash').delete().eq('user_id', user.id);
      if (error) {
        console.error('[POCKET DELETE ERROR]', error);
        throw error;
      }

      await loadAll();
    } catch (err) {
      showError(setError, err);
    }
  }

  /* --------------------------- calcoli --------------------------- */
  const entratePeriodo = incomes.reduce((t, r) => t + Number(r.amount || 0), 0);
  const carryAmount = Number(carryover?.amount || 0);

  // Prelievi = ricariche manuali positive (solo righe manuali pc-)
  const prelievi = pocketRows
    .filter(r => r.id?.toString().startsWith('pc-') && r.amount > 0)
    .reduce((t, r) => t + r.amount, 0);

  // Saldo disponibile = entrate periodo + carryover - prelievi effettuati
  const saldoDisponibile = entratePeriodo + carryAmount - prelievi;
  const saldoDisponibileUI = Math.max(0, saldoDisponibile); // mostrato sempre >= 0

  // Contante residuo = somma movimenti (ricariche/prelievi +, spese cash -)
  const pocketBalance = pocketRows.reduce((t, r) => t + Number(r.amount || 0), 0);

  /* ------------------------------ UI ------------------------------ */
  return (
    <>
      <Head><title>Entrate & Saldi</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">Entrate & Saldi</h2>

          {/* Periodo corrente in alto - formato IT */}
          <div className="periodo-row">
            <span>Periodo corrente:</span>
            <b>{startDateIT}</b>
            <span>–</span>
            <b>{endDateIT}</b>
          </div>

          {/* Disponibilita */}
          <div className="total-box" style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.1)' }}>
            <h3>Disponibilità</h3>

            <div className="flex-line metric-sub">
              <span>Entrate periodo corrente:</span><b>€ {entratePeriodo.toFixed(2)}</b>
            </div>
            <div className="flex-line metric-sub">
              <span>Carryover mese precedente:</span><b>€ {carryAmount.toFixed(2)}</b>
            </div>

            <div className="flex-line">
              <span>Saldo disponibile:</span>
              <b className="metric metric--saldo">€ {saldoDisponibileUI.toFixed(2)}</b>
            </div>
            <div className="flex-line">
              <span>Soldi in tasca (restanti):</span>
              <b className="metric metric--pocket">€ {pocketBalance.toFixed(2)}</b>
            </div>
          </div>

          {/* Tasti OCR/Voce */}
          <div className="table-buttons">
            <button className="btn-vocale" onClick={toggleRec}>
              {recBusy ? 'Stop' : 'Voce'}
            </button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current && ocrInputRef.current.click()}>
              OCR
            </button>
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

          {/* 1) Entrate */}
          <h3>1) Entrate del periodo</h3>
          <form className="input-section" onSubmit={handleAddIncome}>
            <input
              value={newIncome.source}
              onChange={(e) => setNewIncome({ ...newIncome, source: e.target.value })}
              placeholder="Fonte"
              required
            />
            <input
              value={newIncome.description}
              onChange={(e) => setNewIncome({ ...newIncome, description: e.target.value })}
              placeholder="Descrizione"
              required
            />
            <input
              type="date"
              value={newIncome.receivedAt}
              onChange={(e) => setNewIncome({ ...newIncome, receivedAt: e.target.value })}
              required
            />
            <input
              type="text"
              inputMode="decimal"
              value={newIncome.amount}
              onChange={(e) => setNewIncome({ ...newIncome, amount: e.target.value })}
              placeholder="Importo €"
              required
            />
            <button className="btn-manuale">Aggiungi</button>
          </form>

          {loading ? <p>Caricamento…</p> : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th>Descrizione</th>
                  <th>Data</th>
                  <th>Importo €</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {incomes.map((i) => (
                  <tr key={i.id}>
                    <td>{i.source || '-'}</td>
                    <td>{i.description}</td>
                    <td>{i.received_at ? new Date(i.received_at).toLocaleDateString('it-IT') : '-'}</td>
                    <td>{Number(i.amount).toFixed(2)}</td>
                    <td><button onClick={() => handleDeleteIncome(i.id)}>Elimina</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 2) Carryover */}
          <h3 style={{ marginTop: '1rem' }}>2) Rimanenze / Perdite mesi precedenti</h3>
          <form className="input-section" onSubmit={handleSaveCarryover}>
            <input
              type="number"
              step="0.01"
              value={newCarry.amount}
              onChange={(e) => setNewCarry({ ...newCarry, amount: e.target.value })}
              placeholder={`Importo € per ${monthKey}`}
              required
            />
            <input
              value={newCarry.note}
              onChange={(e) => setNewCarry({ ...newCarry, note: e.target.value })}
              placeholder="Nota (opzionale)"
            />
            <button className="btn-manuale">{carryover ? 'Aggiorna' : 'Salva'}</button>
          </form>

          {carryover && (
            <table className="custom-table">
              <thead>
                <tr><th>Mese</th><th>Importo €</th><th>Nota</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{carryover.month_key}</td>
                  <td>{Number(carryover.amount).toFixed(2)}</td>
                  <td>{carryover.note || '-'}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* 3) Soldi in tasca */}
          <h3 style={{ marginTop: '1rem' }}>3) Soldi in tasca</h3>
          <form className="input-section" onSubmit={handleTopUpPocket}>
            <input
              type="text"
              inputMode="decimal"
              value={pocketTopUp}
              onChange={(e) => setPocketTopUp(e.target.value)}
              placeholder="Ricarica (+) / Uscita (-) €"
              required
            />
            <button className="btn-manuale">+ Aggiungi</button>
            <button type="button" onClick={handleClearPocket} style={{ background: '#ef4444' }}>Ripulisci</button>

            <p style={{ opacity: 0.8, marginTop: '0.5rem', flexBasis: '100%' }}>
              Qui vedi tutte le ricariche/uscite e le spese in contante registrate nelle altre sezioni.
            </p>
          </form>

          {loading ? <p>Caricamento…</p> : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrizione</th>
                  <th style={{ textAlign: 'right' }}>Importo €</th>
                </tr>
              </thead>
              <tbody>
                {pocketRows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.dateISO ? new Date(m.dateISO).toLocaleDateString('it-IT') : '-'}</td>
                    <td>{m.label}</td>
                    <td style={{ textAlign: 'right' }}>
                      {m.amount >= 0 ? '+' : '-'} {Math.abs(m.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {error && <p className="error">{error}</p>}

          <Link href="/home">
            <button className="btn-vocale" style={{ marginTop: '1rem' }}>Home</button>
          </Link>
        </div>
      </div>

      <style jsx global>{`
        .spese-casa-container1 {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f172a;
          min-height: 100vh;
          padding: 2rem;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        }
        .spese-casa-container2 {
          background: rgba(0, 0, 0, 0.6);
          padding: 2rem;
          border-radius: 1rem;
          color: #fff;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
          max-width: 1000px;
          width: 100%;
        }
        .title { margin-bottom: .25rem; font-size: 1.5rem; }

        .periodo-row {
          display:flex; gap:.4rem; align-items:center;
          margin: .25rem 0 .6rem;
          font-size: .95rem;
          opacity:.9;
        }

        .table-buttons { display: flex; gap: .5rem; margin: .25rem 0 1rem; }
        .btn-vocale, .btn-ocr, .btn-manuale {
          background: #6366f1; border: 0; padding: .4rem .6rem; border-radius: .5rem; cursor: pointer; color: #fff;
        }
        .btn-ocr { background: #06b6d4; }

        .input-section {
          display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin: .5rem 0;
        }
        .input-section input {
          padding: .4rem; border-radius: .5rem; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06); color: #fff;
        }

        .custom-table { width: 100%; margin-top: .5rem; border-collapse: collapse; }
        .custom-table th, .custom-table td { border-bottom: 1px solid rgba(255,255,255,.12); padding: .5rem; text-align: left; }

        .flex-line { display: flex; justify-content: space-between; margin: .3rem 0; gap: 1rem; }
        .total-box { background: rgba(255,255,255,.06); padding: 1rem; border-radius: .75rem; }
        .error { color: #f87171; margin-top: 1rem; }

        /* ===== Metrics grandi e colorate ===== */
        .metric { font-size: 1.6rem; font-weight: 800; line-height: 1.1; }
        .metric-sub { font-size: 1rem; opacity: .85; }
        .metric--saldo { color: #22c55e; }   /* verde */
        .metric--pocket { color: #06b6d4; }  /* ciano */
      `}</style>
    </>
  );
}

export default withAuth(Entrate);
