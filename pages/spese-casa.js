// pages/spese-casa.js
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

import withAuth from '../hoc/withAuth';
import { insertExpense } from '@/lib/dbHelpers';
import { supabase } from '../lib/supabaseClient';
import { askAssistant } from '../lib/assistant';

function SpeseCasa() {
  /* -------------------- STATE -------------------- */
  const [spese, setSpese] = useState([]);
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    prezzoTotale: '',
    quantita: '1',
    spentAt: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recBusy, setRecBusy] = useState(false);

  /* -------------------- REFS -------------------- */
  const fileInputRef   = useRef(null);
  const mediaRecRef    = useRef(null);
  const recordedChunks = useRef([]);

  /* -------------------- EFFECT -------------------- */
  useEffect(() => { fetchSpese(); }, []);

  /* -------------------- LOAD -------------------- */
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

  /* -------------------- ADD -------------------- */
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

  /* -------------------- DELETE -------------------- */
  const handleDelete = async (id) => {
    const { error } = await supabase.from('finances').delete().eq('id', id);
    if (!error) setSpese(spese.filter(s => s.id !== id));
    else        setError(error.message);
  };

  /* -------------------- OCR & VOICE (resto invariato) -------------------- */
  // ... handleOCR, toggleRec, processVoice, parseAssistantPrompt restano identici ...

  /* -------------------- RENDER -------------------- */
  const totale = spese.reduce((sum, s) => sum + Number(s.amount || 0) * (s.qty ?? 1), 0);

  return (
    <>
      <Head><title>Spese Casa</title></Head>

      <div className="cene-aperitivi-container1">
        <div className="cene-aperitivi-container2">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: '#fff' }}>🏠 Spese Casa</h2>

          <div className="table-buttons">
            <button className="btn-manuale" onClick={() => fileInputRef.current?.scrollIntoView()}>➕ Aggiungi manualmente</button>
            <button className="btn-vocale" onClick={toggleRec}>{recBusy ? '⏹ Stop' : '🎙 Riconoscimento vocale'}</button>
            <button className="btn-ocr"    onClick={() => fileInputRef.current?.click()}>📷 OCR</button>
          </div>

          <form className="input-section" onSubmit={handleAdd} ref={fileInputRef}>
            <label htmlFor="vendita">Punto vendita / Servizio</label>
            <input id="vendita" type="text" placeholder="Es. Enel, Supermercato XYZ"
              value={nuovaSpesa.puntoVendita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })} required />

            <label htmlFor="quantita">Quantità</label>
            <input id="quantita" type="number" min="1"
              value={nuovaSpesa.quantita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })} required />

            <label htmlFor="dettaglio">Dettaglio della spesa</label>
            <textarea id="dettaglio" placeholder="Es. Bolletta €60, Detersivo €5"
              value={nuovaSpesa.dettaglio}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })} required />

            <label htmlFor="data">Data di acquisto</label>
            <input id="data" type="date"
              value={nuovaSpesa.spentAt}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })} required />

            <label htmlFor="prezzo">Prezzo totale (€)</label>
            <input id="prezzo" type="number" step="0.01" placeholder="65.00"
              value={nuovaSpesa.prezzoTotale}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })} required />

            <button type="submit" className="btn-manuale" style={{ width: 'fit-content' }}>Aggiungi</button>
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
                    const m = s.description?.match(/^\\[(.*?)\\]\\s*(.*)$/);
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
    </>
  );
}

export default withAuth(SpeseCasa);
