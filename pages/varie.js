import React, { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

import { supabase } from '../lib/supabaseClient';
import { insertExpense } from '@/lib/dbHelpers';
import { askAssistant } from '../lib/assistant';
import withAuth from '../hoc/withAuth';
import { parseAssistant } from '@/lib/assistant';

function Varie() {
  const [spese, setSpese] = useState([]);
  const [nuovaSpesa, setNuovaSpesa] = useState({ descrizione: '', importo: '', quantita: '1', spentAt: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => { fetchSpese(); }, []);

  const fetchSpese = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at, category_id')
      .eq('category_id', '075ce548-15a9-467c-afc8-8b156064eeb6')
      .order('created_at', { ascending: false });

    if (!error) setSpese(data);
    else setError(error.message);

    setLoading(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Sessione scaduta');
      return;
    }

    const { data, error } = await insertExpense({
      userId: user.id,
      categoryName: 'varie',
      description: nuovaSpesa.descrizione,
      amount: Number(nuovaSpesa.importo),
      spentAt: nuovaSpesa.spentAt || new Date().toISOString(),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1
    });

    if (!error) {
      setSpese([...spese, data]);
      setNuovaSpesa({ descrizione: '', importo: '', quantita: '1', spentAt: '' });
    } else setError(error.message);
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from('finances').delete().eq('id', id);
    if (!error) setSpese(spese.filter((s) => s.id !== id));
    else setError(error.message);
  };

  const handleOCR = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const prompt = 'Analizza lo scontrino OCR e restituisci JSON con {descrizione, importo, esercizio, data, quantita}.';
      await parseAssistantPrompt(`${prompt}\n${base64}`);
    };
    reader.readAsDataURL(file);
  };

  const handleVoice = async () => {
    const spoken = prompt('Parla o digita la descrizione:');
    if (!spoken) return;
    const prompt = `Estrai descrizione, importo e data da: "${spoken}" in JSON`;
    await parseAssistantPrompt(prompt);
  };

  const parseAssistantPrompt = async (fullPrompt) => {
    try {
      const answer = await askAssistant(fullPrompt);
      const parsed = JSON.parse(answer);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const insert = rows.map(r => ({
        userId: user.id,
        categoryName: 'varie',
        description: r.descrizione || r.item || 'spesa',
        amount: Number(r.importo || r.prezzo || 0),
        spent_at: r.data || new Date().toISOString(),
        qty: parseInt(r.quantita || r.qty || 1, 10)
      }));

      await supabase.from('finances').insert(insert);
      fetchSpese();
    } catch (err) {
      console.error('Assistente: JSON non valido', err);
      setError('Risposta assistant non valida');
    }
  };

  const totale = spese.reduce(
    (sum, s) => sum + Number(s.amount || 0) * (s.qty ?? 1),
    0
  );

  return (
    <>
      <Head>
        <title>Spese Varie – Jarvis-Assistant</title>
      </Head>

      <div className="varie-container1">
        <div className="varie-container2">
          <div className="varie-container3">
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

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => handleOCR(e.target.files[0])}
              />

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

                <label htmlFor="quantita">Quantità</label>
                <input
                  id="quantita"
                  type="number"
                  min="1"
                  step="1"
                  value={nuovaSpesa.quantita}
                  onChange={(e) =>
                    setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })
                  }
                  required
                />

                <label htmlFor="spentAt">Data</label>
                <input
                  id="spentAt"
                  type="date"
                  value={nuovaSpesa.spentAt}
                  onChange={(e) =>
                    setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })
                  }
                />

                <button type="submit">Aggiungi</button>
              </form>

              {loading ? (
                <p>Caricamento…</p>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Descrizione</th>
                      <th>Data</th>
                      <th>Qtà</th>
                      <th>Prezzo €</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {spese.map((s) => (
                      <tr key={s.id}>
                        <td>{s.description}</td>
                        <td>{s.spent_at ? new Date(s.spent_at).toLocaleDateString() : '-'}</td>
                        <td>{s.qty ?? 1}</td>
                        <td>{Number(s.amount).toFixed(2)}</td>
                        <td>
                          <button onClick={() => handleDelete(s.id)}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

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

      <style jsx global>{`
        .table-container {
          overflow-x: auto;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 1rem;
          padding: 1.5rem;
          color: #fff;
          font-family: Inter, sans-serif;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
          width: 100%;
          box-sizing: border-box;
        }
        table.custom-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 1rem;
          color: #fff;
        }
        table.custom-table thead {
          background-color: #1f2937;
        }
        table.custom-table th,
        table.custom-table td {
          padding: 0.75rem 1rem;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        table.custom-table tbody tr:hover {
          background-color: rgba(255, 255, 255, 0.05);
        }
        .total-box {
          margin-top: 1rem;
          background: rgba(34, 197, 94, 0.8);
          color: #fff;
          padding: 1rem;
          border-radius: 0.5rem;
          font-size: 1.25rem;
          font-weight: 600;
          text-align: right;
        }
        .table-buttons {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }
        .table-buttons button {
          padding: 0.75rem 1.25rem;
          font-size: 1rem;
          border-radius: 0.5rem;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .btn-manuale {
          background: #22c55e;
          color: #fff;
        }
        .btn-vocale {
          background: #10b981;
          color: #fff;
        }
        .btn-ocr {
          background: #f43f5e;
          color: #fff;
        }
        .table-buttons button:hover {
          opacity: 0.85;
        }
        .input-section {
          background: rgba(255, 255, 255, 0.1);
          padding: 1rem;
          margin-bottom: 1.5rem;
          border-radius: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .input-section label {
          font-weight: 600;
          font-size: 1rem;
        }
        .input-section input {
          padding: 0.6rem;
          border-radius: 0.5rem;
          border: none;
          font-size: 1rem;
          width: 100%;
        }
        @media (max-width: 768px) {
          .table-container {
            padding: 1rem;
          }
          .table-buttons button {
            font-size: 0.95rem;
            padding: 0.6rem 1rem;
          }
          .input-section input {
            font-size: 0.95rem;
          }
        }
      `}</style>

      <style jsx>{`
        .varie-container1 {
          width: 100%;
          display: flex;
          min-height: 100vh;
          align-items: center;
          flex-direction: column;
          justify-content: center;
        }
        .varie-container3 {
          display: contents;
        }
        @media (max-width: 1600px) {
          .varie-container2 {
            width: 1599px;
            height: 1000px;
          }
        }
        @media (max-width: 1200px) {
          .varie-container2 {
            width: 1199px;
          }
        }
        @media (max-width: 991px) {
          .varie-container2 {
            width: 990px;
          }
        }
        @media (max-width: 767px) {
          .varie-container2 {
            width: 766px;
          }
        }
        @media (max-width: 479px) {
          .varie-container2 {
            width: 466px;
            height: 990px;
          }
        }
      `}</style>
    </>
  );
}

export default withAuth(Varie);
