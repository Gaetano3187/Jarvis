// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

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

/** Ricalcola sempre il carryover del mese corrente */
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  const [yy, mm] = monthKeyCurrent.split('-').map(Number);
  const prevEnd = new Date(yy, mm - 1, 0);
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

  const { data: existing, error: e4 } = await supabase
    .from('carryovers')
    .select('id')
    .eq('user_id', userId)
    .eq('month_key', monthKeyCurrent)
    .maybeSingle();
  if (e4 && e4.code !== 'PGRST116') throw e4;

  if (existing) {
    const { error: e5 } = await supabase
      .from('carryovers')
      .update({
        amount: Number(saldoPrevBase.toFixed(2)),
        note: 'Ricalcolo automatico da mese precedente'
      })
      .eq('id', existing.id);
    if (e5) throw e5;
  } else {
    const { error: e6 } = await supabase
      .from('carryovers')
      .insert({
        user_id: userId,
        month_key: monthKeyCurrent,
        amount: Number(saldoPrevBase.toFixed(2)),
        note: 'Auto-carryover da mese precedente'
      });
    if (e6) throw e6;
  }
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
  const [pocketRows, setPocketRows] = useState([]);
  const [pocketTopUp, setPocketTopUp] = useState('');
  const [monthExpenses, setMonthExpenses] = useState(0);

  const ocrInputRef = useRef(null);
  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY);
  const endExclusive = new Date(new Date(endDate).getTime() + 86400000).toISOString();

  useEffect(() => {
    loadAll();
  }, [monthKey]);

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
        .lt('received_at', endExclusive)
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
        .lt('moved_at', endExclusive)
        .order('moved_at', { ascending: false });

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

      const { data: finCash } = await supabase
        .from('finances')
        .select('id, description, amount, spent_at')
        .eq('user_id', user.id)
        .eq('payment_method', 'cash')
        .gte('spent_at', startDate)
        .lt('spent_at', endExclusive)
        .order('spent_at', { ascending: false });

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

      setPocketRows([...manualRows, ...cashRows].sort((a, b) => b.dateISO.localeCompare(a.dateISO)));

      const { data: exp } = await supabase
        .from('finances')
        .select('amount, spent_at')
        .eq('user_id', user.id)
        .gte('spent_at', startDate)
        .lt('spent_at', endExclusive);
      const totalExp = (exp || []).reduce((t, r) => t + Number(r.amount || 0), 0);
      setMonthExpenses(totalExp);

    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddIncome(e) {
    e.preventDefault();
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');

      const dataIncasso = newIncome.receivedAt || new Date().toISOString().slice(0, 10);

      await supabase.from('incomes').insert({
        user_id: user.id,
        source: newIncome.source || 'Entrata',
        description: newIncome.description || newIncome.source || 'Entrata',
        amount: Number(newIncome.amount) || 0,
        received_at: dataIncasso,
      });

      if (dataIncasso < startDate || dataIncasso >= endDate) {
        await ensureCarryoverAuto(user.id, monthKey);
      }

      setNewIncome({ source: 'Stipendio', description: '', amount: '', receivedAt: '' });
      await loadAll();
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  /* --------------------------- calcoli --------------------------- */
  const carryAmount = Number(carryover?.amount || 0);
  const entrateTotaliPeriodo = incomes.reduce((t, r) => t + Number(r.amount || 0), 0);
  const saldoDisponibileIniziale = carryAmount + entrateTotaliPeriodo;
  const pocketBalance = pocketRows.reduce((t, r) => t + Number(r.amount || 0), 0);
  const saldoAttuale = saldoDisponibileIniziale - pocketBalance;

  /* ------------------------------ UI ------------------------------ */
  return (
    <>
      <Head><title>Entrate & Saldi</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">Entrate & Saldi</h2>

          <div className="total-box" style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.1)' }}>
            <h3>Disponibilità</h3>

            <div className="flex-line">
              <span>Entrate periodo corrente:</span>
              <b>€ {entrateTotaliPeriodo.toFixed(2)}</b>
            </div>

            <div className="flex-line">
              <span>Carryover mese precedente:</span>
              <b>€ {carryAmount.toFixed(2)}</b>
            </div>

            <div className="flex-line">
              <span>Saldo disponibile iniziale:</span>
              <b>€ {saldoDisponibileIniziale.toFixed(2)}</b>
            </div>

            <div className="flex-line">
              <span>Soldi in tasca (contante residuo):</span>
              <b>€ {pocketBalance.toFixed(2)}</b>
            </div>

            <div className="flex-line">
              <span>Saldo attuale (disponibile − contante):</span>
              <b>€ {saldoAttuale.toFixed(2)}</b>
            </div>

            <p style={{ opacity: 0.8, marginTop: '0.3rem' }}>
              Periodo corrente: <b>{startDate}</b> → <b>{endDate}</b> (payday giorno {PAYDAY_DAY})
            </p>
          </div>

          {/* Qui puoi lasciare il resto della UI per form entrate, tabelle, pocket cash ecc. invariato */}
        </div>
      </div>
    </>
  );
}

export default withAuth(Entrate);
