// pages/spese-casa.js
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

import withAuth from '../hoc/withAuth';
import { insertExpense } from '@/lib/dbHelpers';
import { supabase } from '../lib/supabaseClient';

function SpeseCasa() {
  /* ---------- STATE ---------- */
  const [spese, setSpese] = useState([]);
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    prezzoTotale: '',
    quantita: '1',
    spentAt: '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [recBusy, setRecBusy] = useState(false);

  /* ---------- REFS ---------- */
  const ocrInputRef    = useRef(null);
  const formRef        = useRef(null);
  const mediaRecRef    = useRef(null);
  const recordedChunks = useRef([]);

  /* ---------- EFFECT ---------- */
  useEffect(() => { fetchSpese(); }, []);

  /* ---------- LOAD ---------- */
  const fetchSpese = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at')
      .eq('category_id', '4cfaac74-aab4-4d96-b335-6cc64de59afc')
      .order('created_at', { ascending: false });

    if (!error) setSpese(data);
    else        setError(error.message);
    setLoading(false);
  };

  /* ---------- ADD ---------- */
  const handleAdd = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Sessione scaduta'); return; }

    const description = `[${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio}`;
    const { data, error } = await insertExpense({
      userId: user.id,
      categoryName: 'casa',
      description,
      amount: Number(nuovaSpesa.prezzoTotale),
      spentAt: nuovaSpesa.spentAt || new Date().toISOString(),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1,
    });

    if (!error) {
      setSpese([...spese, data]);
      setNuovaSpesa({ puntoVendita: '', dettaglio: '', prezzoTotale: '', quantita: '1', spentAt: '' });
    } else setError(error.message);
  };

  /* ---------- DELETE ---------- */
  const handleDelete = async (id) => {
    const { error } = await supabase.from('finances').delete().eq('id', id);
    if (!error) setSpese(spese.filter(s => s.id !== id));
    else        setError(error.message);
  };

  /* ---------- OCR ---------- */
  const handleOCR = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('image', file);
    try {
      const { text } = await (await fetch('/api/ocr', { method: 'POST', body: fd })).json();
      const sysPrompt = 'Analizza lo scontrino e restituisci JSON con: puntoVendita, dettaglio, prezzoTotale, quantita, data';
      await parseAssistantPrompt(`${sysPrompt}\n${text}`);
    } catch { setError('OCR fallito'); }
  };

  /* ---------- VOICE ---------- */
  const toggleRec = async () => {
    if (recBusy) {
      mediaRecRef.current?.stop();
      setRecBusy(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = e => e.data.size && recordedChunks.current.push(e.data);
      mediaRecRef.current.onstop = processVoice;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch { setError('Microfono non disponibile'); }
  };

  const processVoice = async () => {
    const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
    const fd = new FormData(); fd.append('audio', blob, 'voice.webm');
    try {
      const { text } = await (await fetch('/api/stt', { method: 'POST', body: fd })).json();
      const sysPrompt = 'Estrai puntoVendita, dettaglio, prezzoTotale, quantita, data da questa frase e restituisci JSON.';
      await parseAssistantPrompt(`${sysPrompt}\n${text}`);
    } catch { setError('STT fallito'); }
  };

  /* ---------- GPT PARSER (via API server-side) ---------- */
  const parseAssistantPrompt = async (prompt) => {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const { answer, error: apiErr } = await res.json();
      if (apiErr) { setError(`Assistant: ${apiErr}`); return; }
  /* 👇  LOG QUI */
    console.log('[assistant-raw]', answer);
      const parsed   = JSON.parse(answer);
      const expenses = [];

      if (parsed.type === 'expense' && Array.isArray(parsed.items)) {
        parsed.items.forEach(it => expenses.push({
          puntoVendita: it.puntoVendita || it.esercente || 'Sconosciuto',
          dettaglio:    it.dettaglio    || it.descrizione || 'spesa',
          prezzoTotale: it.prezzoTotale || it.importo     || 0,
          quantita:     it.quantita     || 1,
          spentAt:      it.data         || new Date().toISOString(),
        }));
      }

      if (!parsed.type && Array.isArray(parsed)) {
        parsed.forEach(r => expenses.push({
          puntoVendita: r.puntoVendita || r.store || 'Sconosciuto',
          dettaglio:    r.dettaglio    || r.item  || 'spesa',
          prezzoTotale: r.prezzoTotale || r.importo || r.prezzo || 0,
          quantita:     r.quantita     || r.qty || 1,
          spentAt:      r.data         || new Date().toISOString(),
        }));
      }

      if (!expenses.length) { setError('Risposta assistant non valida'); return; }

      /* popola form con la prima spesa */
      setNuovaSpesa({
        puntoVendita: expenses[0].puntoVendita,
        dettaglio:    expenses[0].dettaglio,
        prezzoTotale: expenses[0].prezzoTotale,
        quantita:     String(expenses[0].quantita),
        spentAt:      expenses[0].spentAt.slice(0, 10),
      });

      /* inserisce su Supabase */
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const rows = expenses.map(r => ({
        userId: user.id,
        categoryName: 'casa',
        description: `[${r.puntoVendita}] ${r.dettaglio}`,
        amount: Number(r.prezzoTotale),
        spent_at: r.spentAt,
        qty: parseInt(r.quantita, 10),
      }));

      await supabase.from('finances').insert(rows);
      fetchSpese();
    } catch (err) {
      console.error(err);
      setError('Risposta assistant non valida');
    }
  };

  /* ---------- RENDER ---------- */
  const totale = spese.reduce((sum, s) => sum + Number(s.amount || 0) * (s.qty ?? 1), 0);

  return (
    <>
      <Head><title>Spese Casa</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: '#fff' }}>🏠 Spese Casa</h2>

          <div className="table-buttons">
            <button className="btn-manuale" onClick={() => formRef.current?.scrollIntoView()}>
              ➕ Aggiungi manualmente
            </button>
            <button className="btn-vocale" onClick={toggleRec}>
              {recBusy ? '⏹ Stop' : '🎙 Voce'}
            </button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>
              📷 OCR
            </button>
          </div>

          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={e => handleOCR(e.target.files?.[0])}
          />

          <form className="input-section" ref={formRef} onSubmit={handleAdd}>
            <label htmlFor="vendita">Punto vendita / Servizio</label>
            <input
              id="vendita"
              type="text"
              placeholder="Es. Enel, Supermercato XYZ"
              value={nuovaSpesa.puntoVendita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })}
              required
            />

            <label htmlFor="quantita">Quantità</label>
            <input
              id="quantita"
              type="number"
              min="1"
              value={nuovaSpesa.quantita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })}
              required
            />

            <label htmlFor="dettaglio">Dettaglio della spesa</label>
            <textarea
              id="dettaglio"
              placeholder="Es. Bolletta €60, Detersivo €5"
              value={nuovaSpesa.dettaglio}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })}
              required
            />

            <label htmlFor="data">Data di acquisto</label>
            <input
              id="data"
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
              required
            />

            <label htmlFor="prezzo">Prezzo totale (€)</label>
            <input
              id="prezzo"
              type="number"
              step="0.01"
              placeholder="65.00"
              value={nuovaSpesa.prezzoTotale}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })}
              required
            />

            <button type="submit" className="btn-manuale" style={{ width: 'fit-content' }}>
              Aggiungi
            </button>
          </form>

          <div className="table-container">
            {loading ? (
              <p>Caricamento…</p>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Punto vendita / Servizio</th>
                    <th>Dettaglio</th>
                    <th>Data</th>
                    <th>Qtà</th>
                    <th>Prezzo €</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map(s => {
                    const m = s.description?.match(/^\[(.*?)\]\s*(.*)$/);
                    return (
                      <tr key={s.id}>
                        <td>{m?.[1] || '-'}</td>
                        <td>{m?.[2] || s.description}</td>
                        <td>{s.spent_at ? new Date(s.spent_at).toLocaleDateString() : '-'}</td>
                        <td>{s.qty ?? 1}</td>
                        <td>{Number(s.amount).toFixed(2)}</td>
                        <td><button onClick={() => handleDelete(s.id)}>🗑</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div className="total-box">Totale: € {totale.toFixed(2)}</div>
          </div>

          {error && <p style={{ color: 'red' }}>{error}</p>}

          <Link href="/home" className="btn-vocale" style={{ marginTop: '1.5rem', textDecoration: 'none' }}>
            🏠 Home
          </Link>
        </div>
      </div>

      {/* ---------- TELEPORT STYLE ---------- */}
      <style jsx global>{`
        .spese-casa-container1{width:100%;display:flex;min-height:100vh;align-items:center;
          flex-direction:column;justify-content:center}
        .spese-casa-container2{display:contents}
        .table-container{overflow-x:auto;background:rgba(0,0,0,.6);border-radius:1rem;padding:1.5rem;
          color:#fff;font-family:Inter,sans-serif;box-shadow:0 6px 16px rgba(0,0,0,.3);width:100%;
          box-sizing:border-box}
        table.custom-table{width:100%;border-collapse:collapse;font-size:1rem;color:#fff}
        table.custom-table thead{background-color:#1f2937}
        table.custom-table th,table.custom-table td{padding:.75rem 1rem;text-align:left;
          border-bottom:1px solid rgba(255,255,255,.1)}
        table.custom-table tbody tr:hover{background-color:rgba(255,255,255,.05)}
        .total-box{margin-top:1rem;background:rgba(34,197,94,.8);color:#fff;padding:1rem;border-radius:.5rem;
          font-size:1.25rem;font-weight:600;text-align:right}
        .table-buttons{display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap}
        .table-buttons button{padding:.75rem 1.25rem;font-size:1rem;border-radius:.5rem;border:none;
          font-weight:600;cursor:pointer;transition:all .3s ease}
        .btn-manuale{background:#22c55e;color:#fff}
        .btn-vocale {background:#10b981;color:#fff}
        .btn-ocr    {background:#f43f5e;color:#fff}
        .table-buttons button:hover{opacity:.85}
        .input-section{background:rgba(255,255,255,.1);padding:1rem;margin-bottom:1.5rem;border-radius:.5rem;
          display:flex;flex-direction:column;gap:.75rem}
        .input-section label{font-weight:600;font-size:1rem}
        .input-section input,.input-section textarea{padding:.6rem;border-radius:.5rem;border:none;font-size:1rem;width:100%}
        textarea{min-height:4.5rem;resize:vertical}
        @media(max-width:768px){
          .table-container{padding:1rem}
          .table-buttons button{font-size:.95rem;padding:.6rem 1rem}
          .input-section input,.input-section textarea{font-size:.95rem}
        }
      `}</style>
    </>
  );
}

export default withAuth(SpeseCasa);
