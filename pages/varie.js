// pages/varie.js
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
      .select('id, description, amount, qty, spent_at, finance_categories(name)')
      .eq('finance_categories.name', 'Varie')
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
    </>
  );
}

export default withAuth(Varie);