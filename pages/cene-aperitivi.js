// pages/cene-aperitivi.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '../lib/supabaseClient';

/* -------------------- helpers data/tempo -------------------- */
function isoLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function toMonthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function clampMonthKey(s) {
  return /^\d{4}-\d{2}$/.test(String(s || '')) ? s : toMonthKey(new Date());
}
function monthBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { startISO: isoLocal(start), endISO: isoLocal(end) };
}

/* -------------------- componente -------------------- */
function CeneAperitivi() {
  const [spese, setSpese] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [recBusy, setRecBusy] = useState(false);
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const ocrInputRef = useRef(null);

  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    quantita: '1',
    prezzoTotale: '',
    spentAt: '',
  });

  const initialMonth = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('month') || null;
  }, []);

  const [monthKey, setMonthKey] = useState(() => {
    if (typeof window === 'undefined') return toMonthKey(new Date());
    const local = window.localStorage.getItem('__cene_month');
    return clampMonthKey(initialMonth || local || toMonthKey(new Date()));
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('__cene_month', monthKey);
      const url = new URL(window.location.href);
      url.searchParams.set('month', monthKey);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  }, [monthKey]);

  const { startISO, endISO } = useMemo(() => monthBounds(monthKey), [monthKey]);

  /* -------------------- fetch elenco -------------------- */
  const fetchSpese = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error('Sessione scaduta');

      const { data, error: qErr } = await supabase
        .from('expenses')
        .select('id, store, description, amount, purchase_date, created_at')
        .eq('user_id', user.id)
        .eq('category', 'cene')
        .gte('purchase_date', startISO)
        .lte('purchase_date', endISO)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (qErr) throw qErr;
      setSpese(data || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [startISO, endISO]);

  useEffect(() => { fetchSpese(); }, [fetchSpese]);

  /* -------------------- add manuale -------------------- */
  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');

      const row = {
        user_id:      user.id,
        category:     'cene',
        store:        nuovaSpesa.puntoVendita || 'Cena/Aperitivo',
        description:  nuovaSpesa.dettaglio,
        amount:       Number(nuovaSpesa.prezzoTotale) || 0,
        purchase_date: nuovaSpesa.spentAt || isoLocal(new Date()),
      };

      const { error: insertError } = await supabase.from('expenses').insert(row);
      if (insertError) throw insertError;

      setNuovaSpesa({ puntoVendita: '', dettaglio: '', quantita: '1', prezzoTotale: '', spentAt: '' });
      await fetchSpese();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  /* -------------------- delete -------------------- */
  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      setSpese((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  /* -------------------- OCR multiplo -------------------- */
  const handleOCR = async (files) => {
    if (!files?.length) return;
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const { text } = await res.json();
      await parseAssistantPrompt(buildSystemPrompt('ocr', text));
    } catch (err) {
      console.error(err);
      setError('OCR fallito');
    }
  };

  /* -------------------- Registrazione audio -------------------- */
  const toggleRec = async () => {
    if (recBusy) {
      try { mediaRecRef.current?.stop(); } catch {}
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => e.data.size && recordedChunks.current.push(e.data);
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
      const { text } = await (await fetch('/api/stt', { method: 'POST', body: fd })).json();
      await parseAssistantPrompt(buildSystemPrompt('voice', text));
    } catch (err) {
      console.error(err);
      setError('STT fallito');
    } finally {
      setRecBusy(false);
    }
  };

  /* -------------------- Prompt assistant -------------------- */
  function buildSystemPrompt(source, userText) {
    const header =
      source === 'ocr'
        ? 'Sei Jarvis. Dal testo OCR estrai uno scontrino unico.'
        : 'Sei Jarvis. Dal dettato vocale estrai uno scontrino unico (ignora "ehm", "ok", ecc.).';

    return `
${header}

Devi produrre:
- puntoVendita (string)
- data (YYYY-MM-DD, usa quella sullo scontrino o oggi se assente)
- lineItems: array di { desc (string), qty (number, default 1), price (number in EUR per unità) }
- total (number in EUR). Se non c'è, calcola tu somma (qty * price).

Rispondi **solo** JSON, senza testo extra:
\`\`\`json
{
  "type":"receipt",
  "puntoVendita":"Ristorante Il Cortile",
  "data":"2025-08-06",
  "lineItems":[
    {"desc":"Bruschette","qty":1,"price":3.00},
    {"desc":"Pizza margherita","qty":1,"price":7.00}
  ],
  "total":10.00
}
\`\`\`

TESTO_INPUT:
${userText}
`.trim();
  }

  /* -------------------- Parsing & insert -------------------- */
  async function parseAssistantPrompt(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const { answer, error: apiErr } = await res.json();
    if (!res.ok || apiErr) throw new Error(apiErr || res.status);

    const data = JSON.parse(answer);

    const eurF = (n) => Number(n || 0).toFixed(2).replace('.', ',');

    let puntoVendita = '';
    let spentAt = isoLocal(new Date());
    let total = 0;
    let descr = '';

    if (data.type === 'receipt' && Array.isArray(data.lineItems)) {
      puntoVendita = data.puntoVendita || '';
      spentAt = data.data || spentAt;

      const rows = data.lineItems.map((li) => {
        const qty = Number(li.qty || 1);
        const lineTotal = qty * Number(li.price || 0);
        return `${li.desc?.trim() || 'Voce'}${qty > 1 ? ` x${qty}` : ''} ${eurF(lineTotal)} €`;
      });
      const calc = data.lineItems.reduce(
        (s, li) => s + (Number(li.qty || 1) * Number(li.price || 0)),
        0
      );
      total = Number(data.total || calc);
      descr = `${rows.join('; ')}; Totale scontrino: ${eurF(total)} €`;
    } else if (data.type === 'expense' && Array.isArray(data.items) && data.items.length) {
      const rows = [];
      total = 0;
      let candidatePV = '';
      data.items.forEach((it) => {
        const q = Number(it.quantita || 1);
        const price = Number(it.prezzoTotale || 0);
        total += price;
        if (it.data) spentAt = it.data;
        if (!candidatePV && it.puntoVendita) candidatePV = it.puntoVendita;
        rows.push(`${(it.dettaglio || 'Voce').trim()}${q > 1 ? ` x${q}` : ''} ${eurF(price)} €`);
      });
      puntoVendita = candidatePV;
      descr = `${rows.join('; ')}; Totale scontrino: ${eurF(total)} €`;
    } else {
      throw new Error('Assistant response invalid');
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');

    const row = {
      user_id:      user.id,
      category:     'cene',
      store:        puntoVendita || 'Cena/Aperitivo',
      description:  descr,
      amount:       Number(total) || 0,
      purchase_date: spentAt,
    };

    const { error: dbErr } = await supabase.from('expenses').insert(row);
    if (dbErr) throw dbErr;

    await fetchSpese();

    setNuovaSpesa({
      puntoVendita: puntoVendita || '',
      dettaglio: descr,
      quantita: '1',
      prezzoTotale: Number(total) || 0,
      spentAt,
    });
  }

  /* -------------------- render -------------------- */
  const totale = spese.reduce((t, r) => t + Number(r.amount || 0), 0);

  return (
    <>
      <Head><title>Cene e Aperitivi</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
            <h2 className="title">🍽️ Cene e Aperitivi <small style={{opacity:.8}}>(mese {monthKey})</small></h2>
            <Link href="/finanze" className="btn-manuale">📊 Vai a Finanze</Link>
          </div>

          {/* Toolbar mese */}
          <div className="month-toolbar" style={{display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px'}}>
            <button className="btn-manuale" onClick={()=>{
              const [y,m]=monthKey.split('-').map(Number);
              const d=new Date(y, m-2, 1); setMonthKey(toMonthKey(d));
            }}>«</button>

            <input
              type="month"
              value={monthKey}
              onChange={(e)=> setMonthKey(clampMonthKey(e.target.value))}
              className="btn-manuale"
              style={{padding:'6px 10px'}}
            />

            <button className="btn-manuale" onClick={()=>{
              const [y,m]=monthKey.split('-').map(Number);
              const d=new Date(y, m, 1); setMonthKey(toMonthKey(d));
            }}>»</button>
          </div>

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

          {/* form manuale */}
          <form className="input-section" onSubmit={handleAdd}>
            <label>Punto vendita</label>
            <input
              value={nuovaSpesa.puntoVendita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })}
              required
            />

            <label>Dettaglio</label>
            <textarea
              value={nuovaSpesa.dettaglio}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })}
              required
            />

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem'}}>
              <div>
                <label>Data</label>
                <input
                  type="date"
                  value={nuovaSpesa.spentAt}
                  onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
                  required
                />
              </div>
              <div>
                <label>Prezzo totale (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nuovaSpesa.prezzoTotale}
                  onChange={e => setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })}
                  required
                />
              </div>
            </div>

            <button className="btn-manuale" style={{marginTop:'.5rem'}}>Aggiungi</button>
          </form>

          {/* tabella elenco */}
          <div className="table-container">
            {loading ? (
              <p>Caricamento…</p>
            ) : error ? (
              <p className="error">Errore: {error}</p>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Punto vendita</th>
                    <th>Dettaglio</th>
                    <th>Data</th>
                    <th>Prezzo €</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map(r => (
                    <tr key={r.id}>
                      <td>{r.store || 'Cena/Aperitivo'}</td>
                      <td>{r.description || '-'}</td>
                      <td>{new Date(r.purchase_date || r.created_at).toLocaleDateString('it-IT')}</td>
                      <td>{(Number(r.amount || 0)).toFixed(2)}</td>
                      <td>
                        <button onClick={() => handleDelete(r.id)} className="btn-danger" title="Elimina">🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="total-box">Totale mese {monthKey}: € {totale.toFixed(2)}</div>
          </div>

          <Link href="/home">
            <button className="btn-vocale" style={{marginTop:'1rem'}}>🏠 Home</button>
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
          max-width: 900px;
          width: 100%;
        }
        .title { margin-bottom: .5rem; font-size: 1.5rem; color: #fff; }
        .table-buttons { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
        .btn-vocale, .btn-ocr, .btn-manuale, .btn-danger {
          background: #10b981; color: #fff; border: none;
          padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer;
          text-decoration: none;
        }
        .btn-ocr { background: #f43f5e; }
        .btn-danger { background: #ef4444; }
        .input-section { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem; }
        input, textarea {
          width: 100%; padding: 0.6rem; border: none; border-radius: 0.5rem;
          background: rgba(255, 255, 255, 0.1); color: #fff;
        }
        textarea { resize: vertical; min-height: 4.5rem; }
        .custom-table { width: 100%; border-collapse: collapse; }
        .custom-table thead { background: #1f2937; }
        .custom-table th, .custom-table td {
          padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .custom-table tbody tr:hover { background: rgba(255,255,255,0.05); }
        .total-box {
          margin-top: 1rem; background: rgba(34,197,94,0.85);
          padding: 1rem; border-radius: 0.5rem; text-align: right; font-weight: 600;
        }
        .month-toolbar .btn-manuale { background: rgba(99,102,241,.9); }
        .error { color: #f87171; margin-top: 1rem; }
      `}</style>
    </>
  );
}

export default withAuth(CeneAperitivi);

export async function getServerSideProps() {
  return { props: {} }
}
