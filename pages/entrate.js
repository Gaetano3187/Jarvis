// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

const PAYDAY_DAY = 10;

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
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    monthKey: end.toISOString().slice(0, 7),
  };
}

async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  const { data: existing } = await supabase
    .from('carryovers')
    .select('id')
    .eq('user_id', userId)
    .eq('month_key', monthKeyCurrent)
    .maybeSingle();
  if (existing) return;

  const [yy, mm] = monthKeyCurrent.split('-').map(Number);
  const prevEnd = new Date(yy, mm - 1, 0);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);

  const prevStartISO = prevStart.toISOString().slice(0, 10);
  const prevEndISO = prevEnd.toISOString().slice(0, 10);
  const prevKey = prevEnd.toISOString().slice(0, 7);

  const { data: incPrev } = await supabase
    .from('incomes')
    .select('amount')
    .eq('user_id', userId)
    .gte('received_at', prevStartISO)
    .lte('received_at', prevEndISO);
  const { data: expPrev } = await supabase
    .from('finances')
    .select('amount')
    .eq('user_id', userId)
    .gte('spent_at', prevStartISO)
    .lte('spent_at', prevEndISO);
  const { data: coPrev } = await supabase
    .from('carryovers')
    .select('amount')
    .eq('user_id', userId)
    .eq('month_key', prevKey)
    .maybeSingle();

  const totalInc = (incPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const totalExp = (expPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0);
  const prevCarry = Number(coPrev?.amount || 0);
  const saldoPrevBase = totalInc + prevCarry - totalExp;

  await supabase.from('carryovers').insert({
    user_id: userId,
    month_key: monthKeyCurrent,
    amount: Number(saldoPrevBase.toFixed(2)),
    note: 'Auto-carryover da mese precedente',
  });
}

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

  const ocrInputRef = useRef(null);
  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY);

  useEffect(() => { loadAll(); }, [monthKey]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');
      await ensureCarryoverAuto(user.id, monthKey);

      const { data: inc } = await supabase
        .from('incomes')
        .select('id, source, description, amount, received_at')
        .eq('user_id', user.id)
        .gte('received_at', startDate)
        .lte('received_at', endDate)
        .order('received_at', { ascending: false });
      setIncomes(inc || []);

      const { data: co } = await supabase
        .from('carryovers')
        .select('id, month_key, amount, note')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle();
      setCarryover(co || null);

      const { data: pc } = await supabase
        .from('pocket_cash')
        .select('id, created_at, moved_at, note, delta, amount, direction')
        .eq('user_id', user.id)
        .gte('moved_at', startDate)
        .lte('moved_at', endDate)
        .order('moved_at', { ascending: false });

      const manualRows = (pc || []).map((row) => {
        const eff = (row.delta != null)
          ? Number(row.delta || 0)
          : (row.amount != null ? (row.direction === 'in' ? 1 : -1) * Number(row.amount || 0) : 0);
        const dateISO = (row.moved_at || row.created_at || '').slice(0, 10);
        return { id: `pc-${row.id}`, dateISO, label: row.note?.trim() || (eff >= 0 ? 'Ricarica contanti' : 'Uscita contanti'), amount: Number(eff || 0) };
      });

      const { data: finCash } = await supabase
        .from('finances')
        .select('id, description, amount, spent_at')
        .eq('user_id', user.id)
        .eq('payment_method', 'cash')
        .gte('spent_at', startDate)
        .lte('spent_at', endDate)
        .order('spent_at', { ascending: false });

      const cashRows = (finCash || []).map((f) => {
        const dateISO = (f.spent_at || '').slice(0, 10);
        const m = (f.description || '').match(/^\[(.*?)\]\s*(.*)$/);
        const store = m ? m[1] : 'Punto vendita';
        const dett = m ? m[2] : (f.description || '');
        return { id: `fin-${f.id}`, dateISO, label: `Spesa in contante • ${store}${dett ? ` • ${dett}` : ''}`, amount: -Math.abs(Number(f.amount) || 0) };
      });

      setPocketRows([...manualRows, ...cashRows].filter(r => Number.isFinite(r.amount) && r.amount !== 0).sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || '')));

      const { data: exp } = await supabase
        .from('finances')
        .select('amount, spent_at')
        .eq('user_id', user.id)
        .gte('spent_at', startDate)
        .lte('spent_at', endDate);
      setMonthExpenses((exp || []).reduce((t, r) => t + Number(r.amount || 0), 0));

    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  const entratePeriodo = incomes.reduce((t, r) => t + Number(r.amount || 0), 0);
  const carryAmount = Number(carryover?.amount || 0);
  const prelievi = pocketRows.filter(r => r.amount < 0 && r.label.includes('Uscita contanti')).reduce((t, r) => t + Math.abs(r.amount), 0);
  const saldoDisponibile = entratePeriodo + carryAmount - prelievi;
  const pocketBalance = pocketRows.reduce((t, r) => t + Number(r.amount || 0), 0);

  return (
    <>
      <Head><title>Entrate & Saldi</title></Head>
      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">Entrate & Saldi</h2>

          {/* BOX SALDI */}
          <div className="total-box">
            <h3>Disponibilità</h3>
            <div className="flex-line"><span>Entrate periodo corrente:</span><b>€ {entratePeriodo.toFixed(2)}</b></div>
            <div className="flex-line"><span>Carryover mese precedente:</span><b>€ {carryAmount.toFixed(2)}</b></div>
            <div className="flex-line"><span>Saldo disponibile:</span><b>€ {saldoDisponibile.toFixed(2)}</b></div>
            <div className="flex-line"><span>Soldi in tasca:</span><b>€ {pocketBalance.toFixed(2)}</b></div>
          </div>

          {/* FORM OCR/VOCE */}
          <div className="table-buttons">
            <button className="btn-vocale">Voce</button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current && ocrInputRef.current.click()}>OCR</button>
            <input ref={ocrInputRef} type="file" accept="image/*" capture="environment" multiple hidden />
          </div>

          {/* FORM ENTRATE */}
          <h3>Entrate</h3>
          <form className="input-section">
            <input value={newIncome.source} placeholder="Fonte" />
            <input value={newIncome.description} placeholder="Descrizione" />
            <input type="date" value={newIncome.receivedAt} />
            <input type="number" step="0.01" value={newIncome.amount} placeholder="Importo €" />
            <button className="btn-manuale">Aggiungi</button>
          </form>

          {/* TABELLA ENTRATE */}
          <table className="custom-table">
            <thead><tr><th>Fonte</th><th>Descrizione</th><th>Data</th><th>Importo</th></tr></thead>
            <tbody>
              {incomes.map((i) => (
                <tr key={i.id}>
                  <td>{i.source}</td>
                  <td>{i.description}</td>
                  <td>{i.received_at}</td>
                  <td>{i.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* FORM CARRYOVER */}
          <h3>Carryover</h3>
          <form className="input-section">
            <input type="number" step="0.01" value={newCarry.amount} placeholder="Importo €" />
            <input value={newCarry.note} placeholder="Nota" />
            <button className="btn-manuale">Salva</button>
          </form>

          {/* TABELLA CARRYOVER */}
          {carryover && (
            <table className="custom-table">
              <thead><tr><th>Mese</th><th>Importo €</th><th>Nota</th></tr></thead>
              <tbody><tr><td>{carryover.month_key}</td><td>{carryover.amount}</td><td>{carryover.note}</td></tr></tbody>
            </table>
          )}

          {/* FORM POCKET CASH */}
          <h3>Soldi in tasca</h3>
          <form className="input-section">
            <input type="number" step="0.01" value={pocketTopUp} placeholder="Ricarica (+) / Uscita (-) €" />
            <button className="btn-manuale">+ Aggiungi</button>
          </form>

          {/* TABELLA POCKET CASH */}
          <table className="custom-table">
            <thead><tr><th>Data</th><th>Descrizione</th><th>Importo</th></tr></thead>
            <tbody>
              {pocketRows.map((m) => (
                <tr key={m.id}>
                  <td>{m.dateISO}</td>
                  <td>{m.label}</td>
                  <td>{m.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {error && <p className="error">{error}</p>}
          <Link href="/home"><button className="btn-vocale">Home</button></Link>
        </div>
      </div>
    </>
  );
}

export default withAuth(Entrate);
