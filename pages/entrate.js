// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

/** Giorno di accredito stipendio (1..28) */
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

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const monthKey = end.toISOString().slice(0, 7);
  return { startDate, endDate, monthKey };
}

/** Se manca il carryover per il mese corrente, lo crea come residuo del mese precedente (saldo base) */
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  const { data: existing, error: e0 } = await supabase
    .from('carryovers')
    .select('id')
    .eq('user_id', userId)
    .eq('month_key', monthKeyCurrent)
    .maybeSingle();

  // PGRST116 = no rows; altri errori sono reali
  if (e0 && e0.code !== 'PGRST116') throw e0;
  if (existing) return;

  // periodo precedente (mese calendario precedente)
  const [yy, mm] = monthKeyCurrent.split('-').map(Number);
  const prevEnd = new Date(yy, mm - 1, 0); // ultimo giorno mese precedente
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
  const prevStartISO = prevStart.toISOString().slice(0, 10);
  const prevEndISO = prevEnd.toISOString().slice(0, 10);
  const prevKey = prevEnd.toISOString().slice(0, 7);

  const { data: incPrev, error: e1 } = await supabase
    .from('incomes')
    .select('amount')
    .eq('user_id', userId)
    .gte('received_at', prevStartISO)
    .lte('received_at', prevEndISO);
  if (e1) throw e1;

  const { data: expPrev, error: e2 } = await supabase
    .from('finances')
    .select('amount')
    .eq('user_id', userId)
    .gte('spent_at', prevStartISO)
    .lte('spent_at', prevEndISO);
  if (e2) throw e2;

  const { data: coPrev, error: e3 } = await supabase
    .from('carryovers')
    .select('amount')
    .eq('user_id', userId)
    .eq('month_key', prevKey)
    .maybeSingle();
  if (e3 && e3.code !== 'PGRST116') throw e3;

  const totalInc = (incPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const totalExp = (expPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const prevCarry = Number(coPrev?.amount || 0);

  const saldoPrevBase = totalInc + prevCarry - totalExp;

  const { error: e4 } = await supabase.from('carryovers').insert({
    user_id: userId,
    month_key: monthKeyCurrent,
    amount: Number(saldoPrevBase.toFixed(2)),
    note: 'Auto-carryover da mese precedente',
  });
  if (e4) throw e4;
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

  const [pocket, setPocket] = useState([]);
  const [pocketTopUp, setPocketTopUp] = useState('');
  const [onlyPocketExpenses, setOnlyPocketExpenses] = useState(true);

  const [monthExpenses, setMonthExpenses] = useState(0);

  // OCR / VOCE
  const ocrInputRef = useRef(null);
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY);

  useEffect(() => {
    loadAll();

    // cleanup microfono se si lascia la pagina
    return () => {
      try {
        if (mediaRecRef.current && mediaRecRef.current.state === 'recording') {
          mediaRecRef.current.stop();
        }
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
      } catch {}
    };
  }, [monthKey]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');

      await ensureCarryoverAuto(user.id, monthKey);

      const { data: inc, error: e1 } = await supabase
        .from('incomes')
        .select('id, source, description, amount, received_at')
        .eq('user_id', user.id)
        .gte('received_at', startDate)
        .lte('received_at', endDate)
        .order('received_at', { ascending: false });
      if (e1) throw e1;
      setIncomes(inc || []);

      const { data: co, error: e2 } = await supabase
        .from('carryovers')
        .select('id, month_key, amount, note')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle();
      if (e2 && e2.code !== 'PGRST116') throw e2;
      setCarryover(co || null);

      // pocket cash ultimi 2 mesi (usa moved_at)
      const since = new Date();
      since.setMonth(since.getMonth() - 2);

      const { data: pc, error: e3 } = await supabase
        .from('pocket_cash')
        .select(`
          id, user_id, created_at, moved_at, note, delta, amount, direction,
          finances_fid:finances!pocket_cash_finance_id_fkey (id, spent_at, description),
          finances_lid:finances!pocket_cash_link_finance_id_fkey (id, spent_at, description)
        `)
        .eq('user_id', user.id)
        .gte('moved_at', since.toISOString())
        .order('moved_at', { ascending: false });
      if (e3) throw e3;

      const norm = (v) => (Array.isArray(v) ? v[0] : v) || null;
      const pocketView = (pc || [])
        .map((row) => {
          const finA = norm(row.finances_fid);
          const finB = norm(row.finances_lid);
          const fin = finA || finB;

          const eff = (row.delta != null)
            ? Number(row.delta || 0)
            : (row.amount != null ? (row.direction === 'in' ? 1 : -1) * Number(row.amount || 0) : 0);

          const isoFull = (fin?.spent_at || row.moved_at || row.created_at || '');
          const iso = isoFull ? isoFull.slice(0, 10) : '';
          const dateStr = iso ? new Date(iso).toLocaleDateString() : '-';

          let label;
          if (fin?.description) {
            const m = fin.description.match(/^\[(.*?)\]/);
            const store = m ? m[1] : 'N/D';
            label = 'Punto vendita: ' + store + ' - spesa del ' + dateStr;
          } else {
            const dirLabel = eff >= 0 ? 'entrata cassa' : 'uscita cassa';
            label = dirLabel + (row.note ? ' - ' + row.note : '');
          }

          return { id: row.id, dateISO: iso, label, amount: eff, hasFinance: !!fin };
        })
        .filter((v) => Number(v.amount) !== 0);

      setPocket(pocketView);

      const { data: exp, error: e4 } = await supabase
        .from('finances')
        .select('amount, spent_at')
        .eq('user_id', user.id)
        .gte('spent_at', startDate)
        .lte('spent_at', endDate);
      if (e4) throw e4;
      const totalExp = (exp || []).reduce((t, r) => t + Number(r.amount || 0), 0);
      setMonthExpenses(totalExp);
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------- Assistant prompts (ASCII safe) ---------------------- */
  function buildPocketPrompt(userText) {
    const example = JSON.stringify({
      type: 'pocket_topup',
      items: [{ amount: 200.0, note: 'prelievo contante da stipendio', date: 'YYYY-MM-DD' }],
    });
    const none = JSON.stringify({ type: 'none' });
    return [
      'Sei Jarvis. Capisci se il testo indica un PRELIEVO o RICARICA di contante "in tasca".',
      'Se si, rispondi SOLO con JSON:',
      example,
      'Se non e un prelievo, restituisci ' + none + '.',
      '',
      'Testo:',
      userText,
    ].join('\n');
  }

  function buildIncomePrompt(userText) {
    const today = new Date().toISOString().slice(0, 10);
    const example = JSON.stringify({
      type: 'income',
      items: [{ source: 'Stipendio', description: 'Stipendio ACME', amount: 1500, receivedAt: today }],
    });
    return [
      'Sei Jarvis. Estrai ENTRATE economiche (stipendi, provvigioni, rimborsi).',
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

  async function parseAssistantForPocket(userText) {
    const data = await callAssistant(buildPocketPrompt(userText));
    if (data.type !== 'pocket_topup' || !Array.isArray(data.items) || !data.items.length) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');

    const rows = data.items.map((it) => ({
      user_id: user.id,
      note: it.note || 'Ricarica manuale (OCR/voce)',
      delta: Number(it.amount) || 0, // negativo = prelievo?
      moved_at: it.date || new Date().toISOString(),
    }));

    const { error } = await supabase.from('pocket_cash').insert(rows);
    if (error) throw error;
    return true;
  }

  async function parseAssistantForIncome(userText) {
    const data = await callAssistant(buildIncomePrompt(userText));
    if (data.type !== 'income' || !Array.isArray(data.items) || !data.items.length) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');

    const rows = data.items.map((it) => ({
      user_id: user.id,
      source: it.source || 'Entrata',
      description: it.description || it.source || 'Entrata',
      amount: Number(it.amount) || 0,
      received_at: it.receivedAt || new Date().toISOString().slice(0, 10),
    }));

    const { error } = await supabase.from('incomes').insert(rows);
    if (error) throw error;
    return true;
  }

  /* --------------------------- OCR / VOCE handlers --------------------------- */
  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const { text } = await res.json();

      const handledPocket = await parseAssistantForPocket(text).catch(() => false);
      if (handledPocket) return loadAll();

      const handledIncome = await parseAssistantForIncome(text).catch(() => false);
      if (handledIncome) return loadAll();

      setError('Nessun dato riconosciuto da OCR');
    } catch (err) {
      console.error(err);
      setError('OCR fallito');
    }
  }

  const toggleRec = async () => {
    if (recBusy) {
      try {
        mediaRecRef.current?.stop();
      } catch {}
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => {
        if (e.data?.size) recordedChunks.current.push(e.data);
      };
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

      const handledPocket = await parseAssistantForPocket(text).catch(() => false);
      if (handledPocket) {
        setRecBusy(false);
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
        return loadAll();
      }

      const handledIncome = await parseAssistantForIncome(text).catch(() => false);
      if (handledIncome) {
        setRecBusy(false);
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
        return loadAll();
      }

      setError('Nessun dato riconosciuto dalla voce');
    } catch (err) {
      console.error(err);
      setError('STT fallito');
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');

      await supabase.from('incomes').insert({
        user_id: user.id,
        source: newIncome.source || 'Entrata',
        description: newIncome.description || newIncome.source || 'Entrata',
        amount: Number(newIncome.amount) || 0,
        received_at: newIncome.receivedAt || new Date().toISOString().slice(0, 10),
      });

      setNewIncome({ source: 'Stipendio', description: '', amount: '', receivedAt: '' });
      await loadAll();
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function handleDeleteIncome(id) {
    const { error: e } = await supabase.from('incomes').delete().eq('id', id);
    if (e) return setError(e.message);
    setIncomes(incomes.filter((i) => i.id !== id));
  }

  async function handleSaveCarryover(e) {
    e.preventDefault();
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');

      const payload = {
        user_id: user.id,
        month_key: monthKey,
        amount: Number(newCarry.amount) || 0,
        note: newCarry.note || null,
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
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function handleTopUpPocket(e) {
    e.preventDefault();
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');

      const delta = Number(pocketTopUp);
      if (!delta) return;

      const { error } = await supabase.from('pocket_cash').insert({
        user_id: user.id,
        note: 'Ricarica manuale',
        delta,
        moved_at: new Date().toISOString(),
      });
      if (error) throw error;

      setPocketTopUp('');
      await loadAll();
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function handleClearPocket() {
    if (!confirm('Azzerare TUTTI i movimenti di "Soldi in tasca"?')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');

      const { error } = await supabase.from('pocket_cash').delete().eq('user_id', user.id);
      if (error) throw error;

      await loadAll();
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  /* --------------------------- calcoli --------------------------- */
  const totalIncomes = incomes.reduce((t, r) => t + Number(r.amount || 0), 0);
  const carryAmount = Number(carryover?.amount || 0);
  const saldoMese = totalIncomes + carryAmount - monthExpenses;
  const pocketBalance = pocket.reduce((t, r) => t + Number(r.amount || 0), 0);

  const pocketTableRows = onlyPocketExpenses ? pocket.filter((m) => m.amount < 0) : pocket;

  /* ------------------------------ UI ------------------------------ */
  return (
    <>
      <Head><title>Entrate & Saldi</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">Entrate & Saldi</h2>

          {/* Disponibilita */}
          <div className="total-box" style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.1)' }}>
            <h3>Disponibilita</h3>
            <div className="flex-line"><span>Saldo mese disponibile:</span><b>€ {saldoMese.toFixed(2)}</b></div>
            <div className="flex-line"><span>Soldi in tasca (restanti):</span><b>€ {pocketBalance.toFixed(2)}</b></div>
            <p style={{ opacity: 0.8, marginTop: '0.3rem' }}>
              Periodo corrente: <b>{startDate}</b> → <b>{endDate}</b> (payday giorno {PAYDAY_DAY})
            </p>
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
              type="number"
              step="0.01"
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
                    <td>{i.received_at ? new Date(i.received_at).toLocaleDateString() : '-'}</td>
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
              type="number"
              step="0.01"
              value={pocketTopUp}
              onChange={(e) => setPocketTopUp(e.target.value)}
              placeholder="Ricarica / Prelievo €"
              required
            />
            <button className="btn-manuale">+ Aggiungi</button>
            <button type="button" onClick={handleClearPocket} style={{ background: '#ef4444' }}>Ripulisci</button>

            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input
                type="checkbox"
                checked={onlyPocketExpenses}
                onChange={(e) => setOnlyPocketExpenses(e.target.checked)}
              />
              Solo spese contante
            </label>

            <p style={{ opacity: 0.8, marginTop: '0.5rem', flexBasis: '100%' }}>
              Le spese in contante vengono scalate automaticamente (trigger su finances).
            </p>
          </form>

          {loading ? <p>Caricamento…</p> : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrizione (riassunto)</th>
                  <th style={{ textAlign: 'right' }}>Importo €</th>
                </tr>
              </thead>
              <tbody>
                {pocketTableRows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.dateISO ? new Date(m.dateISO).toLocaleDateString() : '-'}</td>
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
          font-family: Inter, sans-serif;
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
        .title { margin-bottom: .5rem; font-size: 1.5rem; }

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

        .flex-line { display: flex; justify-content: space-between; margin: .3rem 0; }
        .total-box { background: rgba(255,255,255,.06); padding: 1rem; border-radius: .75rem; }
        .error { color: #f87171; margin-top: 1rem; }
      `}</style>
    </>
  );
}

export default withAuth(Entrate);
