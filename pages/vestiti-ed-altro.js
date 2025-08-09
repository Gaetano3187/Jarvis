VestitiEdAltro() {
  // ─────────────────────────────────────────────── Stati e refs
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recBusy, setRecBusy] = useState(false)
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    quantita: '1',
    prezzoTotale: '',
    spentAt: '',
  })

  const formRef = useRef(null)
  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])

  // ─────────────────────────────────────────────── Carica storico on mount
  useEffect(() => {
    fetchSpese()
  }, [])

  async function fetchSpese() {
    setLoading(true)
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at')
      .eq('category_id', CATEGORY_ID_VESTITI)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setSpese(data)
    setLoading(false)
  }

  // ─────────────────────────────────────────────── Aggiungi manuale
  const handleAdd = async e => {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return setError('Sessione scaduta')

    const row = {
      user_id:     user.id,
      category_id: CATEGORY_ID_VESTITI,
      description: [${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio},
      amount:      Number(nuovaSpesa.prezzoTotale),
      spent_at:    nuovaSpesa.spentAt || new Date().toISOString().slice(0, 10),
      qty:         parseInt(nuovaSpesa.quantita, 10) || 1,
    }

    const { error: insertError } = await supabase.from('finances').insert(row)
    if (insertError) setError(insertError.message)
    else {
      setNuovaSpesa({
        puntoVendita: '',
        dettaglio: '',
        quantita: '1',
        prezzoTotale: '',
        spentAt: '',
      })
      fetchSpese()
    }
  }

  // ─────────────────────────────────────────────── Elimina voce
  const handleDelete = async id => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (error) setError(error.message)
    else setSpese(spese.filter(r => r.id !== id))
  }

  // ─────────────────────────────────────────────── OCR multiplo
  const handleOCR = async files => {
    if (!files?.length) return
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('images', f))
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text } = await res.json()
      await parseAssistantPrompt(buildSystemPrompt('ocr', text))
    } catch (err) {
      console.error(err)
      setError('OCR fallito')
    }
  }

  // ─────────────────────────────────────────────── Registrazione audio
  const toggleRec = async () => {
    if (recBusy) {
      mediaRecRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecRef.current = new MediaRecorder(stream)
      recordedChunks.current = []
      mediaRecRef.current.ondataavailable = e =>
        e.data.size && recordedChunks.current.push(e.data)
      mediaRecRef.current.onstop = processVoice
      mediaRecRef.current.start()
      setRecBusy(true)
    } catch {
      setError('Microfono non disponibile')
    }
  }

  const processVoice = async () => {
    const blob = new Blob(recordedChunks.current, { type: 'audio/webm' })
    const fd = new FormData()
    fd.append('audio', blob, 'voice.webm')
    try {
      const { text } = await (await fetch('/api/stt', { method: 'POST', body: fd })).json()
      await parseAssistantPrompt(buildSystemPrompt('voice', text))
    } catch (err) {
      console.error(err)
      setError('STT fallito')
    } finally {
      setRecBusy(false)
    }
  }

  // ─────────────────────────────────────────────── Costruisci prompt
  function buildSystemPrompt(source, userText) {
    if (source === 'ocr') {
      return 
Sei Jarvis. Da questo testo OCR estrai **tutte** le voci di spesa, anche se ce ne sono più di una, **usando la data** presente sullo scontrino.

Per ciascuna voce genera:
- puntoVendita: string
- dettaglio: string
- quantita: number
- prezzoTotale: number
- data: "YYYY-MM-DD"

Rispondi **solo** con JSON:
\\\json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"abbigliamento",
      "dettaglio":"un paio di pantaloni a fiocca",
      "quantita":1,
      "prezzoTotale":100.00,
      "data":"2025-08-06"
    }
    /* altre voci... */
  ]
}
\\\

TESTO_OCR:
${userText}

    }
    return 
**ATTENZIONE:** il testo seguente è trascrizione vocale, ignora "ehm", "ok", ecc.

Ora estrai **solo** JSON spesa (stesso schema):
"${userText}"

  }

  // ─────────────────────────────────────────────── Parsing AI & DB insert
  async function parseAssistantPrompt(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const { answer, error: apiErr } = await res.json()
    if (!res.ok || apiErr) throw new Error(apiErr || res.status)

    const data = JSON.parse(answer)
    if (data.type !== 'expense' || !Array.isArray(data.items) || !data.items.length) {
      throw new Error('Assistant response invalid')
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const rows = data.items.map(it => {
      let spentAt = it.data === 'oggi'
        ? new Date().toISOString().slice(0, 10)
        : it.data === 'ieri'
          ? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0,10) })()
          : it.data

      return {
        user_id:     user.id,
        category_id: CATEGORY_ID_VESTITI,
        description: [${it.puntoVendita}] ${it.dettaglio},
        amount:      Number(it.prezzoTotale) || 0,
        spent_at:    spentAt,
        qty:         parseFloat(it.quantita) || 1,
      }
    })

    const { error: dbErr } = await supabase.from('finances').insert(rows)
    if (dbErr) throw dbErr

    await fetchSpese()
    const last = rows[0]
    setNuovaSpesa({
      puntoVendita: last.description.match(/^\[(.*?)\]/)?.[1] || '',
      dettaglio:    last.description.replace(/^\[.*?\]\s*/, ''),
      quantita:     String(last.qty),
      prezzoTotale: last.amount,
      spentAt:      last.spent_at,
    })
  }

  // ─────────────────────────────────────────────── Render
  const totale = spese.reduce((t, r) => t + r.amount * (r.qty || 1), 0)

  return (
    <>
      <Head><title>Vestiti ed Altro</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">🛍️ Vestiti ed Altro</h2>

          <div className="table-buttons">
            <button className="btn-vocale" onClick={toggleRec}>
              {recBusy ? '⏹ Stop' : '🎙 Voce'}
            </button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>
              📷 OCR
            </button>
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={e => handleOCR(Array.from(e.target.files || []))}
            />
          </div>

          <form className="input-section" ref={formRef} onSubmit={handleAdd}>
            <label>Punto vendita / Servizio</label>
            <input
              value={nuovaSpesa.puntoVendita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })}
              required
            />
            <label>Quantità</label>
            <input
              type="number"
              min="1"
              value={nuovaSpesa.quantita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })}
              required
            />
            <label>Dettaglio della spesa</label>
            <textarea
              value={nuovaSpesa.dettaglio}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })}
              required
            />
            <label>Data di acquisto</label>
            <input
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
              required
            />
            <label>Prezzo totale (€)</label>
            <input
              type="number"
              step="0.01"
              value={nuovaSpesa.prezzoTotale}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })}
              required
            />
            <button className="btn-manuale">Aggiungi</button>
          </form>

          <div className="table-container">
            {loading ? (
              <p>Caricamento…</p>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Punto vendita</th>
                    <th>Dettaglio</th>
                    <th>Data</th>
                    <th>Qtà</th>
                    <th>Prezzo €</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map(r => {
                    const m = r.description.match(/^\[(.*?)\]\s*(.*)$/) || []
                    return (
                      <tr key={r.id}>
                        <td>{m[1] || '-'}</td>
                        <td>{m[2] || r.description}</td>
                        <td>{new Date(r.spent_at).toLocaleDateString()}</td>
                        <td>{r.qty}</td>
                        <td>{r.amount.toFixed(2)}</td>
                        <td><button onClick={() => handleDelete(r.id)}>🗑</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <div className="total-box">Totale: € {totale.toFixed(2)}</div>
          </div>

          {error && <p className="error">{error}</p>}

          <Link href="/home">
            <button className="btn-vocale">🏠 Home</button>
          </Link>
        </div>
      </div>

           <style jsx>{
        .vestiti-ed-altro-container1 {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f172a;
          min-height: 100vh;
          padding: 2rem;
          font-family: Inter, sans-serif;
        }
        .vestiti-ed-altro-container2 {
          background: rgba(0, 0, 0, 0.6);
          padding: 2rem;
          border-radius: 1rem;
          color: #fff;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
          max-width: 800px;
          width: 100%;
        }
        .title {
          margin-bottom: 1rem;
          font-size: 1.5rem;
        }
        .table-buttons {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .btn-vocale,
        .btn-ocr,
        .btn-manuale {
          background: #10b981;
          color: #fff;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          cursor: pointer;
        }
        .btn-ocr {
          background: #f43f5e;
        }
        .input-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }
        input,
        textarea {
          width: 100%;
          padding: 0.6rem;
          border: none;
          border-radius: 0.5rem;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        textarea {
          resize: vertical;
          min-height: 4.5rem;
        }
        .custom-table {
          width: 100%;
          border-collapse: collapse;
        }
        .custom-table th,
        .custom-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .custom-table thead {
          background: #1f2937;
        }
        .total-box {
          margin-top: 1rem;
          background: rgba(34, 197, 94, 0.8);
          padding: 1rem;
          border-radius: 0.5rem;
          text-align: right;
          font-weight: 600;
        }
        .error {
          color: #f87171;
          margin-top: 1rem;
        }
      }</style>
    </>
  )
}

export default withAuth(VestitiEdAltro)  
// pages/vestiti-ed-altro.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

const PAYDAY_DAY = 10;
const CATEGORY_ID_VESTITI = '89e223d4-1ec0-4631-b0d4-52472579a04a';

/* ========================= Helpers date/format ========================= */
function isoLocal(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const pad = (n) => String(n).padStart(2, '0');
  return ${y}-${pad(m)}-${pad(d)};
}
function addDaysLocal(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}
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
  const startDate = isoLocal(start);
  const endDate = isoLocal(end);
  const monthKey = endDate.slice(0, 7);
  return { startDate, endDate, monthKey };
}
function formatIT(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('it-IT');
}
function parseAmountLoose(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/* (opzionale) carryover auto come su Entrate */
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  const { data: existing, error: e0 } = await supabase
    .from('carryovers')
    .select('id')
    .eq('user_id', userId)
    .eq('month_key', monthKeyCurrent)
    .maybeSingle();
  if (e0 && e0.code !== 'PGRST116') throw e0;
  if (existing) return;

  const [yy, mm] = monthKeyCurrent.split('-').map(Number);
  const prevEnd = new Date(yy, mm - 1, 0);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
  const prevStartISO = isoLocal(prevStart);
  const prevEndISO = isoLocal(prevEnd);
  const prevKey = prevEndISO.slice(0, 7);

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

/* ========================= Component ========================= */
function VestitiEdAltro() {
  const [spese, setSpese] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // metriche/top
  const [incomes, setIncomes] = useState([]);
  const [carryover, setCarryover] = useState(null);
  const [pocketRows, setPocketRows] = useState([]);

  const [recBusy, setRecBusy] = useState(false);
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    quantita: '1',
    prezzoTotale: '',
    spentAt: '',
    paymentMethod: 'card', // 'card' | 'cash'
  });

  const ocrInputRef = useRef(null);
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);

  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY);
  const startDateISO = startDate;
  const endDateISO = endDate;
  const endExclusiveDate = isoLocal(
    addDaysLocal(
      new Date(
        Number(endDateISO.slice(0, 4)),
        Number(endDateISO.slice(5, 7)) - 1,
        Number(endDateISO.slice(8, 10))
      ),
      1
    )
  );
  const startDateIT = formatIT(startDateISO);
  const endDateIT = formatIT(endDateISO);

  useEffect(() => {
    loadAll();
    return () => {
      try {
        if (mediaRecRef.current && mediaRecRef.current.state === 'recording') {
          mediaRecRef.current.stop();
        }
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error('Sessione scaduta');

      await ensureCarryoverAuto(user.id, monthKey);

      // 1) Spese VESTITI del periodo
      const { data: sp, error: eS } = await supabase
        .from('finances')
        .select('id, description, amount, qty, spent_at, payment_method')
        .eq('user_id', user.id)
        .eq('category_id', CATEGORY_ID_VESTITI)
        .gte('spent_at', startDateISO)
        .lt('spent_at', endExclusiveDate)
        .order('spent_at', { ascending: false });
      if (eS) throw eS;
      setSpese(sp || []);

      // 2) Entrate del periodo
      const { data: inc, error: e1 } = await supabase
        .from('incomes')
        .select('id, amount, received_at')
        .eq('user_id', user.id)
        .gte('received_at', startDateISO)
        .lt('received_at', endExclusiveDate)
        .order('received_at', { ascending: false });
      if (e1) throw e1;
      setIncomes(inc || []);

      // 3) Carryover corrente
      const { data: co, error: e2 } = await supabase
        .from('carryovers')
        .select('id, month_key, amount')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle();
      if (e2 && e2.code !== 'PGRST116') throw e2;
      setCarryover(co || null);

      // 4a) Movimenti pocket manuali nel periodo
      const { data: pc, error: e3 } = await supabase
        .from('pocket_cash')
        .select('id, created_at, moved_at, note, delta, amount, direction')
        .eq('user_id', user.id)
        .or(
          and(moved_at.gte.${startDateISO},moved_at.lt.${endExclusiveDate}),and(created_at.gte.${startDateISO},created_at.lt.${endExclusiveDate})
        )
        .order('moved_at', { ascending: false })
        .order('created_at', { ascending: false });
      if (e3) throw e3;

      const manualRows = (pc || []).map((row) => {
        const eff =
          row.delta != null
            ? Number(row.delta || 0)
            : row.amount != null
            ? (row.direction === 'in' ? 1 : -1) * Number(row.amount || 0)
            : 0;
        const dateISO = (row.moved_at || row.created_at || '').slice(0, 10);
        return {
          id: pc-${row.id},
          dateISO,
          label: row.note?.trim() || (eff >= 0 ? 'Ricarica contanti' : 'Uscita contanti'),
          amount: Number(eff || 0),
        };
      });

      // 4b) Spese in contante (tutte le categorie) nel periodo → righe negative
      const { data: finCash, error: e4 } = await supabase
        .from('finances')
        .select('id, description, amount, spent_at')
        .eq('user_id', user.id)
        .eq('payment_method', 'cash')
        .gte('spent_at', startDateISO)
        .lt('spent_at', endExclusiveDate)
        .order('spent_at', { ascending: false });
      if (e4) throw e4;
      const cashRows = (finCash || []).map((f) => {
        const dateISO = (f.spent_at || '').slice(0, 10);
        const m = (f.description || '').match(/^\[(.*?)\]\s*(.*)$/);
        const store = m ? m[1] : 'Punto vendita';
        const dett = m ? m[2] : f.description || '';
        return {
          id: fin-${f.id},
          dateISO,
          label: Spesa in contante • ${store}${dett ?  • ${dett} : ''},
          amount: -Math.abs(Number(f.amount) || 0),
        };
      });

      const rows = [...manualRows, ...cashRows]
        .filter((r) => Number.isFinite(r.amount) && r.amount !== 0)
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''));
      setPocketRows(rows);
    } catch (err) {
      const msg =
        err?.message ||
        err?.error_description ||
        err?.hint ||
        (typeof err === 'string' ? err : JSON.stringify(err));
      setError(msg);
      console.error('[VESTITI LOAD ERROR]', err);
    } finally {
      setLoading(false);
    }
  }

  /* ========================= OCR / Voce ========================= */
  function buildOCRPrompt(userText) {
    // rileva SHOP, prodotti multipli, qty, importo, data, e "contanti" -> payment_method cash
    const example = JSON.stringify(
      {
        type: 'expense_list',
        items: [
          {
            puntoVendita: 'Zara',
            dettaglio: 'Pantaloni cargo',
            quantita: 1,
            prezzoTotale: 39.9,
            data: '2025-08-06',
            paymentMethod: 'card', // 'card' | 'cash'
          },
        ],
      },
      null,
      2
    );
    return [
      'Sei Jarvis. Dal testo OCR estrai TUTTE le voci di spesa (anche multiple).',
      'Riconosci se è stato pagato in CONTANTI (parole come "contanti", "cash"): in tal caso paymentMethod="cash", altrimenti "card".',
      'Data: usa quella del documento, oppure "oggi"/"ieri" se il testo lo dice.',
      'Rispondi SOLO con JSON come nel seguente esempio:',
      example,
      '',
      'TESTO_OCR:',
      userText,
    ].join('\n');
  }
  function buildVoicePrompt(userText) {
    const example = JSON.stringify(
      {
        type: 'expense_list',
        items: [
          {
            puntoVendita: 'OVS',
            dettaglio: 'Maglietta basic',
            quantita: 2,
            prezzoTotale: 18.0,
            data: 'oggi',
            paymentMethod: 'cash',
          },
        ],
      },
      null,
      2
    );
    return [
      'Trascrizione vocale utente. Estrai voci di spesa VESTITI/ALTRO.',
      'Se trovi parole come "in contanti", usa paymentMethod="cash"; altrimenti "card".',
      'Data può essere "oggi"/"ieri" o ISO "YYYY-MM-DD".',
      'Rispondi SOLO con JSON:',
      example,
      '',
      'TESTO:',
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

  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const { text } = await res.json();

      const data = await callAssistant(buildOCRPrompt(text));
      await upsertFromAssistant(data);
    } catch (err) {
      console.error(err);
      setError('OCR fallito');
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

      const data = await callAssistant(buildVoicePrompt(text));
      await upsertFromAssistant(data);
    } catch (err) {
      console.error(err);
      setError('STT fallito');
    } finally {
      setRecBusy(false);
      try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
    }
  };

  async function upsertFromAssistant(data) {
    if (!data || data.type !== 'expense_list' || !Array.isArray(data.items) || !data.items.length) {
      setError('Nessuna voce valida rilevata');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setError('Sessione scaduta');

    const rows = data.items.map((it) => {
      let spentAt;
      if (it.data === 'oggi') spentAt = isoLocal(new Date());
      else if (it.data === 'ieri') spentAt = isoLocal(addDaysLocal(new Date(), -1));
      else spentAt = it.data || isoLocal(new Date());

      const pm = (it.paymentMethod || '').toLowerCase() === 'cash' ? 'cash' : 'card';

      return {
        user_id: user.id,
        category_id: CATEGORY_ID_VESTITI,
        description: [${it.puntoVendita || 'Negozio'}] ${it.dettaglio || 'Acquisto'},
        amount: Math.abs(parseAmountLoose(it.prezzoTotale)),
        qty: Number(it.quantita) || 1,
        spent_at: spentAt,
        payment_method: pm,
      };
    });

    const { error: dbErr } = await supabase.from('finances').insert(rows);
    if (dbErr) {
      setError(dbErr.message || 'Errore salvataggio spese');
      return;
    }
    await loadAll();

    const last = rows[0];
    const m = (last.description || '').match(/^\[(.*?)\]\s*(.*)$/);
    setNuovaSpesa({
      puntoVendita: m ? m[1] : '',
      dettaglio: m ? m[2] : '',
      quantita: String(last.qty ?? 1),
      prezzoTotale: String(last.amount ?? ''),
      spentAt: last.spent_at,
      paymentMethod: last.payment_method || 'card',
    });
  }

  /* ========================= CRUD manuale ========================= */
  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setError('Sessione scaduta');

      const row = {
        user_id: user.id,
        category_id: CATEGORY_ID_VESTITI,
        description: [${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio},
        amount: Math.abs(parseAmountLoose(nuovaSpesa.prezzoTotale)),
        spent_at: nuovaSpesa.spentAt || isoLocal(new Date()),
        qty: parseInt(nuovaSpesa.quantita, 10) || 1,
        payment_method: nuovaSpesa.paymentMethod === 'cash' ? 'cash' : 'card',
      };

      const { error: insertError } = await supabase.from('finances').insert(row);
      if (insertError) throw insertError;

      setNuovaSpesa({
        puntoVendita: '',
        dettaglio: '',
        quantita: '1',
        prezzoTotale: '',
        spentAt: '',
        paymentMethod: 'card',
      });
      await loadAll();
    } catch (err) {
      const msg =
        err?.message ||
        err?.error_description ||
        err?.hint ||
        (typeof err === 'string' ? err : JSON.stringify(err));
      setError(msg);
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('finances').delete().eq('id', id);
      if (error) throw error;
      setSpese((prev) => prev.filter((r) => r.id !== id));
      // ricarico metriche/pocket per coerenza
      await loadAll();
    } catch (err) {
      setError(err.message || 'Errore eliminazione');
    }
  };

  /* ========================= Metriche ========================= */
  const entratePeriodo = incomes.reduce((t, r) => t + Number(r.amount || 0), 0);
  const carryAmount = Number(carryover?.amount || 0);

  // prelievi = movimenti manuali positivi (solo pc-)
  const prelievi = pocketRows
    .filter((r) => r.id?.toString().startsWith('pc-') && r.amount > 0)
    .reduce((t, r) => t + r.amount, 0);

  const saldoDisponibile = Math.max(0, entratePeriodo + carryAmount - prelievi);
  const pocketBalance = pocketRows.reduce((t, r) => t + Number(r.amount || 0), 0);

  const totale = spese.reduce((t, r) => t + (Number(r.amount) || 0), 0);

  /* ========================= UI ========================= */
  return (
    <>
      <Head><title>Vestiti ed Altro</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">🛍 Lista Supermercato – Vestiti ed Altro</h2>

          {/* Periodo corrente */}
          <div className="periodo-row">
            <span>Periodo corrente:</span>
            <b>{startDateIT}</b>
            <span>–</span>
            <b>{endDateIT}</b>
          </div>

          {/* Metriche come Entrate */}
          <div className="total-box" style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.1)' }}>
            <h3>Disponibilità & Contante</h3>
            <div className="flex-line metric-sub">
              <span>Entrate periodo corrente:</span><b>€ {entratePeriodo.toFixed(2)}</b>
            </div>
            <div className="flex-line metric-sub">
              <span>Carryover mese precedente:</span><b>€ {carryAmount.toFixed(2)}</b>
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

          {/* Pulsanti */}
          <div className="table-buttons">
            <button className="btn-vocale" onClick={toggleRec}>{recBusy ? '⏹ Stop' : '🎙 Voce'}</button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>📷 OCR</button>
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

          {/* Form inserimento */}
          <form className="input-section" onSubmit={handleAdd}>
            <label>Punto vendita / Servizio</label>
            <input
              value={nuovaSpesa.puntoVendita}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })}
              required
            />
            <label>Quantità</label>
            <input
              type="number"
              min="1"
              value={nuovaSpesa.quantita}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })}
              required
            />
            <label>Dettaglio della spesa</label>
            <textarea
              value={nuovaSpesa.dettaglio}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })}
              required
            />
            <label>Data di acquisto</label>
            <input
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
              required
            />
            <label>Prezzo totale (€)</label>
            <input
              type="text"
              inputMode="decimal"
              value={nuovaSpesa.prezzoTotale}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })}
              required
            />
            <label>Metodo di pagamento</label>
            <select
              value={nuovaSpesa.paymentMethod}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, paymentMethod: e.target.value })}
            >
              <option value="card">Carta</option>
              <option value="cash">Contanti</option>
            </select>
            <button className="btn-manuale">Aggiungi</button>
          </form>

          {/* Tabella spese */}
          <div className="table-container">
            {loading ? (
              <p>Caricamento…</p>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Punto vendita</th>
                    <th>Dettaglio</th>
                    <th>Data</th>
                    <th>Qtà</th>
                    <th>Prezzo €</th>
                    <th>Pagato</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map((r) => {
                    const m = (r.description || '').match(/^\[(.*?)\]\s*(.*)$/) || [];
                    return (
                      <tr key={r.id}>
                        <td>{m[1] || '-'}</td>
                        <td>{m[2] || r.description}</td>
                        <td>{r.spent_at ? new Date(r.spent_at).toLocaleDateString('it-IT') : '-'}</td>
                        <td>{r.qty ?? 1}</td>
                        <td>{Number(r.amount || 0).toFixed(2)}</td>
                        <td>{r.payment_method === 'cash' ? 'Contanti' : 'Carta'}</td>
                        <td><button onClick={() => handleDelete(r.id)}>🗑</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div className="total-box">
              Totale periodo (Vestiti/Altro): <b>€ {totale.toFixed(2)}</b>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <Link href="/home">
            <button className="btn-vocale" style={{ marginTop: '1rem' }}>🏠 Home</button>
          </Link>
        </div>
      </div>

      <style jsx global>{
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
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: .6rem .8rem; align-items: center; margin: .5rem 0 1rem;
        }
        .input-section label { opacity: .85; font-size: .95rem; }
        .input-section input, .input-section textarea, .input-section select {
          padding: .5rem; border-radius: .5rem; border: 1px solid rgba(255,255,255,.15);
          background: rgba(255,255,255,.06); color: #fff;
        }
        .input-section textarea { grid-column: 1 / span 2; min-height: 4.5rem; resize: vertical; }
        .custom-table { width: 100%; margin-top: .5rem; border-collapse: collapse; }
        .custom-table th, .custom-table td { border-bottom: 1px solid rgba(255,255,255,.12); padding: .5rem; text-align: left; }
        .flex-line { display: flex; justify-content: space-between; margin: .3rem 0; gap: 1rem; }
        .total-box { background: rgba(255,255,255,.06); padding: 1rem; border-radius: .75rem; margin-top: .5rem; }
        .error { color: #f87171; margin-top: 1rem; }

        /* Metriche grandi e colorate (coerenti con Entrate) */
        .metric { font-size: 1.6rem; font-weight: 800; line-height: 1.1; }
        .metric-sub { font-size: 1rem; opacity: .85; }
        .metric--saldo { color: #22c55e; }   /* verde */
        .metric--pocket { color: #06b6d4; }  /* ciano */
      }</style>
    </>
  );
}

export default withAuth(VestitiEdAltro);
