// pages/spese-casa.js
import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'

import withAuth from '../hoc/withAuth'
import { insertExpense } from "@/lib/dbHelpers";
import { supabase } from '../lib/supabaseClient'
import { askAssistant } from '../lib/assistant'
import { parseAssistant } from '@/lib/assistant';

function SpeseCasa () {
  const [spese, setSpese] = useState([])
  const [nuovaSpesa, setNuovaSpesa] = useState({ descrizione: '', importo: '', spentAt: '', quantita: '1' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recBusy, setRecBusy] = useState(false)

  const mediaRecRef = useRef(null)
  const recordedChunksRef = useRef([])
  const fileInputRef = useRef(null)

  useEffect(() => { fetchSpese() }, [])

  const fetchSpese = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at, category_id')
      .eq('category_id', '4cfaac74-aab4-4d96-b335-6cc64de59afc')
      .order('created_at', { ascending: false })

    if (!error) setSpese(data)
    else        setError(error.message)

    setLoading(false)
  }

  const handleAdd = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();    
    if (!user) {
      setError('Sessione scaduta, effettua di nuovo il login.');
      return;
    }

    const { data, error } = await insertExpense({
      userId: user.id,
      categoryName: 'casa',
      description: nuovaSpesa.descrizione,
      amount: Number(nuovaSpesa.importo),
      spentAt: nuovaSpesa.spentAt || new Date().toISOString(),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1
    });

    if (!error) {
      setSpese([...spese, data]);
      setNuovaSpesa({ descrizione: '', importo: '', spentAt: '', quantita: '1' });
    } else {
      setError(error.message);
    }
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (!error) setSpese(spese.filter(s => s.id !== id))
    else        setError(error.message)
  }

  const handleOCR = async file => {
    if (!file) return
    const formData = new FormData()
    formData.append('image', file)
    try {
      const { text } = await (await fetch('/api/ocr', { method: 'POST', body: formData })).json()
      const sysPrompt = 'Estrarre descrizione, importo e data dal testo OCR; ritorna JSON.'
      await parseAssistantPrompt(`${sysPrompt}\n${text}`)
    } catch { setError('OCR fallito') }
  }

  const toggleRec = async () => {
    if (recBusy) {
      mediaRecRef.current?.stop()
      setRecBusy(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecRef.current = new MediaRecorder(stream)
      recordedChunksRef.current = []
      mediaRecRef.current.ondataavailable = e => e.data.size && recordedChunksRef.current.push(e.data)
      mediaRecRef.current.onstop = processVoice
      mediaRecRef.current.start()
      setRecBusy(true)
    } catch { setError('Microfono non disponibile') }
  }

  const processVoice = async () => {
    const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' })
    const fd = new FormData(); fd.append('audio', blob, 'voice.webm')
    try {
      const { text } = await (await fetch('/api/stt', { method: 'POST', body: fd })).json()
      const sysPrompt = 'Da questa frase estrai descrizione, importo, data; restituisci JSON.'
      await parseAssistantPrompt(`${sysPrompt}\n${text}`)
    } catch { setError('STT fallito') }
  }

  const parseAssistantPrompt = async fullPrompt => {
    try {
      const answer = await askAssistant(fullPrompt);
      const parsed = JSON.parse(answer)
      const rows = Array.isArray(parsed) ? parsed : [parsed]
      const insert = rows.map(r => ({
        description: r.descrizione || r.item || 'spesa',
        amount: Number(r.importo || r.prezzo || 0),
        spent_at: r.data || new Date().toISOString(),
        categoryName: 'casa',
        qty: parseInt(r.quantita || r.qty || 1, 10)
      }))
      await supabase.from('finances').insert(insert)
      fetchSpese()
    } catch {
      setError('Risposta assistant non valida')
    }
  }

  const totale = spese.reduce((sum, s) => sum + Number(s.amount || 0) * (s.qty ?? 1), 0)

  return (
    <>
      <Head><title>Spese Casa</title></Head>

      <div className="cene-aperitivi-container1">
        <div className="cene-aperitivi-container2">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: '#fff' }}>
            🏠 Spese Casa
          </h2>

          <div className="table-buttons">
            <button className="btn-manuale" onClick={() => fileInputRef.current?.scrollIntoView()}>
              ➕ Aggiungi manualmente
            </button>
            <button className="btn-vocale" onClick={toggleRec}>
              {recBusy ? '⏹ Stop' : '🎙 Riconoscimento vocale'}
            </button>
            <button className="btn-ocr" onClick={() => fileInputRef.current?.click()}>
              📷 OCR
            </button>
          </div>

          <form className="input-section" onSubmit={handleAdd} ref={fileInputRef}>
            <label htmlFor="descr">Voce di spesa</label>
            <input
              id="descr"
              type="text"
              placeholder="Es. Bolletta luce"
              value={nuovaSpesa.descrizione}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, descrizione: e.target.value })}
              required
            />

            <label htmlFor="importo">Importo (€)</label>
            <input
              id="importo"
              type="number"
              step="0.01"
              placeholder="65.00"
              value={nuovaSpesa.importo}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, importo: e.target.value })}
              required
            />

            <label htmlFor="quantita">Quantità</label>
            <input
              id="quantita"
              type="number"
              step="1"
              min="1"
              value={nuovaSpesa.quantita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })}
              required
            />

            <label htmlFor="data">Data (opzionale)</label>
            <input
              id="data"
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
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
                    <th>Descrizione</th>
                    <th>Data</th>
                    <th>Qtà</th>
                    <th>Importo €</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map(s => (
                    <tr key={s.id}>
                      <td>{s.description}</td>
                      <td>{s.spent_at ? new Date(s.spent_at).toLocaleDateString() : '-'}</td>
                      <td>{s.qty ?? 1}</td>
                      <td>{Number(s.amount).toFixed(2)}</td>
                      <td><button onClick={() => handleDelete(s.id)}>🗑</button></td>
                    </tr>
                  ))}
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

    </>
  )
}

export default withAuth(SpeseCasa)
