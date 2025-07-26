// pages/spese-casa.js
import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';
import { askAssistant } from '@/lib/assistant';
import VoiceRecorder from '../components/VoiceRecorder';

function SpeseCasa() {
  /* ------------------- state ------------------- */
  const [spese, setSpese] = useState([]);
  const [nuovaSpesa, setNuovaSpesa] = useState({ descrizione: '', importo: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* riferimento sia per scroll che per file‑input OCR */
  const fileInputRef = useRef(null);

  /* ------------------- fetch iniziale ------------------- */
  useEffect(() => {
    fetchSpese();
  }, []);

  const fetchSpese = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('categoria', 'casa')
      .order('created_at', { ascending: false });

    if (!error) setSpese(data);
    else setError(error.message);

    setLoading(false);
  };

  /* ------------------- CRUD ------------------- */
  const handleAdd = async (e) => {
    e.preventDefault();
    const { data, error } = await supabase
      .from('expenses')
      .insert([{ ...nuovaSpesa, categoria: 'casa' }])
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
    else setError(error.message);
  };

  /* ------------------- OCR & VOCE ------------------- */
  const handleOCR = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      const { text } = await (
        await fetch('/api/ocr', { method: 'POST', body: formData })
      ).json();
      const sysPrompt =
        'Estrarre descrizione, importo e data dal testo OCR; restituisci solo JSON.';
      await parseAssistantPrompt(`${sysPrompt}\n${text}`);
    } catch {
      setError('OCR fallito');
    }
  };

  const handleVoiceText = async (spoken) => {
    if (!spoken) return;
    const sysPrompt =
      'Da questa frase estrai descrizione, importo, data; restituisci solo JSON.';
    await parseAssistantPrompt(`${sysPrompt}\n${spoken}`);
  };

  const parseAssistantPrompt = async (fullPrompt) => {
    try {
      const { answer } = await askAssistant(fullPrompt);
      const parsed = JSON.parse(answer);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const insert = rows.map((r) => ({
        descrizione: r.descrizione || r.item || 'spesa',
        importo: Number(r.importo || r.prezzo || 0),
        data: r.data || new Date().toISOString(),
        categoria: 'casa',
      }));
      await supabase.from('expenses').insert(insert);
      fetchSpese();
    } catch {
      setError('Risposta assistant non valida');
    }
  };

  /* ------------------- UI ------------------- */
  const totale = spese.reduce((sum, s) => sum + Number(s.importo || 0), 0);

  return (
    <>
      <Head>
        <title>Spese Casa</title>
      </Head>

      <div className="cene-aperitivi-container1">
        <div className="cene-aperitivi-container2">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: '#fff' }}>
            🏠 Spese Casa
          </h2>

          {/* pulsanti */}
          <div className="table-buttons">
            <button
              className="btn-manuale"
              onClick={() => fileInputRef.current?.scrollIntoView()}
            >
              ➕ Aggiungi manualmente
            </button>

            {/* microfono reale */}
            <VoiceRecorder
              buttonClass="btn-vocale"
              idleLabel="🎙 Riconoscimento vocale"
              recordingLabel="⏹ Stop"
              onText={handleVoiceText}
              onError={setError}
            />

            <button className="btn-ocr" onClick={() => fileInputRef.current?.click()}>
              📷 OCR
            </button>
          </div>

          {/* sezione input dettagli */}
          <form className="input-section" onSubmit={handleAdd} ref={fileInputRef}>
            <label htmlFor="descr">Voce di spesa</label>
            <input
              id="descr"
              type="text"
              placeholder="Es. Bolletta luce"
              value={nuovaSpesa.descrizione}
              onChange={(e) =>
                setNuovaSpesa({ ...nuovaSpesa, descrizione: e.target.value })
              }
              required
            />

            <label htmlFor="importo">Importo (€)</label>
            <input
              id="importo"
              type="number"
              step="0.01"
              placeholder="65.00"
              value={nuovaSpesa.importo}
              onChange={(e) =>
                setNuovaSpesa({ ...nuovaSpesa, importo: e.target.value })
              }
              required
            />

            <button type="submit" className="btn-manuale" style={{ width: 'fit-content' }}>
              Aggiungi
            </button>
          </form>

          {/* tabella spese */}
          <div className="table-container">
            {loading ? (
              <p>Caricamento…</p>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Descrizione</th>
                    <th>Data</th>
                    <th>Importo €</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map((s) => (
                    <tr key={s.id}>
                      <td>{s.descrizione}</td>
                      <td>
                        {s.data ? new Date(s.data).toLocaleDateString() : '-'}
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
          </div>

          {error && <p style={{ color: 'red' }}>{error}</p>}

          <Link
            href="/home"
            className="btn-vocale"
            style={{ marginTop: '1.5rem', textDecoration: 'none' }}
          >
            🏠 Home
          </Link>
        </div>
      </div>

      {/* stili globali invariati (css già presente nel file originale) */}

      {/* file‑input nascosto per OCR */}
      <input
        ref={fileInputRef}
        hidden
        accept="image/*,application/pdf"
        type="file"
        onChange={(e) => handleOCR(e.target.files?.[0])}
      />
    </>
  );
}

export default withAuth(SpeseCasa);
