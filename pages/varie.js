// pages/varie.js
import React, { useEffect, useState, useRef } from 'react';
import Head  from 'next/head';
import Link  from 'next/link';

import { supabase }      from '../lib/supabaseClient';   // percorso corretto
import { askAssistant } from '../lib/assistant'
import withAuth          from '../hoc/withAuth';

function Varie() {
  /* ─────────── STATE ─────────── */
  const [spese,      setSpese]      = useState([]);
  const [nuovaSpesa, setNuovaSpesa] = useState({ descrizione: '', importo: '' });
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const fileInputRef = useRef(null);   // OCR hidden input

  /* ─────────── FETCH iniziale ─────────── */
  useEffect(() => { fetchSpese(); }, []);

  const fetchSpese = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('categoria', 'varie')
      .order('created_at', { ascending: false });

    if (!error) setSpese(data);
    else        setError(error.message);

    setLoading(false);
  };

  /* ─────────── CRUD ─────────── */
  const handleAdd = async (e) => {
    e.preventDefault();
    const { data, error } = await supabase
      .from('expenses')
      .insert([{ ...nuovaSpesa, categoria: 'varie' }])
      .select()
      .single();

    if (!error) {
      setSpese([...spese, data]);
      setNuovaSpesa({ descrizione: '', importo: '' });
    } else setError(error.message);
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (!error) setSpese(spese.filter((s) => s.id !== id));
    else        setError(error.message);
  };

  /* ─────────── OCR & VOCE (assistant) ─────────── */
  const handleOCR = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const prompt =
        'Analizza lo scontrino OCR e restituisci JSON con {descrizione, importo, esercizio, data}.';
      await parseAssistant(`${prompt}\n${base64}`);
    };
    reader.readAsDataURL(file);
  };

  const handleVoice = async () => {
    const spoken = prompt('Parla o digita la descrizione:');
    if (!spoken) return;
    const prompt =
      `Estrai descrizione, importo e data da: "${spoken}" in JSON`;
    await parseAssistant(prompt);
  };

  const parseAssistant = async (fullPrompt) => {
    try {
      const answer = await askAssistant(fullPrompt);
      const parsed = JSON.parse(answer);
      await supabase
        .from('expenses')
        .insert([{ ...parsed, categoria: 'varie' }]);
      fetchSpese();
    } catch (err) {
      console.error('Assistente: JSON non valido', err);
      setError('Risposta assistant non valida');
    }
  };

  /* ─────────── UI (layout Teleport invariato) ─────────── */
  const totale = spese.reduce((sum, s) => sum + Number(s.importo || 0), 0);

  return (
    <>
      <Head>
        <title>Spese Varie – Jarvis-Assistant</title>
      </Head>

      <div className="varie-container1">
        <div className="varie-container2">
          <div className="varie-container3">

            {/* intestazione + pulsanti */}
            <div className="table-container">
              <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>
                📁 Spese Varie
              </h2>

              <div className="table-buttons">
                <button
                  className="btn-manuale"
                  onClick={() => fileInputRef.current?.scrollIntoView()}
                >
                  ➕ Aggiungi manualmente
                </button>
                <button className="btn-vocale" onClick={handleVoice}>
                  🎙 Riconoscimento vocale
                </button>
                <button
                  className="btn-ocr"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📷 OCR
                </button>
              </div>

              {/* input nascosto OCR */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => handleOCR(e.target.files[0])}
              />

              {/* form manuale */}
              <form onSubmit={handleAdd} className="input-section">
                <label htmlFor="descrizioneVarie">Descrizione</label>
                <input
                  id="descrizioneVarie"
                  type="text"
                  placeholder="Es. Spesa imprevista"
                  value={nuovaSpesa.descrizione}
                  onChange={(e) =>
                    setNuovaSpesa({ ...nuovaSpesa, descrizione: e.target.value })
                  }
                  required
                />

                <label htmlFor="importoVarie">Importo</label>
                <input
                  id="importoVarie"
                  type="number"
                  step="0.01"
                  placeholder="50.00"
                  value={nuovaSpesa.importo}
                  onChange={(e) =>
                    setNuovaSpesa({ ...nuovaSpesa, importo: e.target.value })
                  }
                  required
                />

                <button type="submit">Aggiungi</button>
              </form>

              {/* tabella */}
              {loading ? (
                <p>Caricamento…</p>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Descrizione</th>
                      <th>Data</th>
                      <th>Prezzo €</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {spese.map((s) => (
                      <tr key={s.id}>
                        <td>{s.descrizione}</td>
                        <td>
                          {s.data
                            ? new Date(s.data).toLocaleDateString()
                            : '-'}
                        </td>
                        <td>{Number(s.importo).toFixed(2)}</td>
                        <td>
                          <button onClick={() => handleDelete(s.id)}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* totale */}
              <div className="total-box">Totale: € {totale.toFixed(2)}</div>

              {error && <p style={{ color: 'red' }}>{error}</p>}
            </div>

            <Link
              href="/home"
              className="thq-button-filled"
              style={{ marginTop: '1.5rem', display: 'inline-block' }}
            >
              🏠 Home
            </Link>
          </div>
        </div>
      </div>

      {/* ——— STILI TELEPORT ORIGINALI + global ripresi dallo <style> precedente ——— */}
      <style jsx global>{`
        .table-container{
          overflow-x:auto;background:rgba(0,0,0,.6);border-radius:1rem;padding:1.5rem;
          color:#fff;font-family:Inter,sans-serif;box-shadow:0 6px 16px rgba(0,0,0,.3);
          width:100%;box-sizing:border-box
        }
        table.custom-table{width:100%;border-collapse:collapse;font-size:1rem;color:#fff}
        table.custom-table thead{background-color:#1f2937}
        table.custom-table th,table.custom-table td{
          padding:.75rem 1rem;text-align:left;
          border-bottom:1px solid rgba(255,255,255,.1)
        }
        table.custom-table tbody tr:hover{background-color:rgba(255,255,255,.05)}
        .total-box{
          margin-top:1rem;background:rgba(34,197,94,.8);color:#fff;padding:1rem;
          border-radius:.5rem;font-size:1.25rem;font-weight:600;text-align:right
        }
        .table-buttons{
          display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap
        }
        .table-buttons button{
          padding:.75rem 1.25rem;font-size:1rem;border-radius:.5rem;border:none;
          font-weight:600;cursor:pointer;transition:all .3s ease
        }
        .btn-manuale{background:#22c55e;color:#fff}
        .btn-vocale{background:#10b981;color:#fff}
        .btn-ocr{background:#f43f5e;color:#fff}
        .table-buttons button:hover{opacity:.85}
        .input-section{
          background:rgba(255,255,255,.1);padding:1rem;margin-bottom:1.5rem;
          border-radius:.5rem;display:flex;flex-direction:column;gap:.75rem
        }
        .input-section label{font-weight:600;font-size:1rem}
        .input-section input{
          padding:.6rem;border-radius:.5rem;border:none;font-size:1rem;width:100%
        }
        @media(max-width:768px){
          .table-container{padding:1rem}
          .table-buttons button{font-size:.95rem;padding:.6rem 1rem}
          .input-section input{font-size:.95rem}
        }
      `}</style>

      <style jsx>{`
        .varie-container1{
          width:100%;display:flex;min-height:100vh;align-items:center;
          flex-direction:column;justify-content:center
        }
        .varie-container3{display:contents}
        @media(max-width:1600px){.varie-container2{width:1599px;height:1000px}}
        @media(max-width:1200px){.varie-container2{width:1199px}}
        @media(max-width:991px){.varie-container2{width:990px}}
        @media(max-width:767px){.varie-container2{width:766px}}
        @media(max-width:479px){.varie-container2{width:466px;height:990px}}
      `}</style>
    </>
  );
}

export default withAuth(Varie);
