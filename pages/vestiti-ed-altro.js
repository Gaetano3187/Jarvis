// pages/vestiti-ed-altro.js
import React, { useEffect, useState } from 'react';
import Head from 'next/head'
import { supabase } from '@/lib/supabaseClient';
import withAuth from '../hoc/withAuth'
import { askAssistant } from '@/lib/assistant';
import { parseAssistant } from '@/lib/assistant';

const VestitiEdAltro = () => {
  const [spese, setSpese] = useState([])
  const [nuovaSpesa, setNuovaSpesa] = useState({ descrizione: '', importo: '' })

  /* fetch iniziale */
  useEffect(() => {
    fetchSpese()
  }, [])

  const fetchSpese = async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('categoria', 'vestiti')
      .order('created_at', { ascending: false })
    if (!error) setSpese(data)
    else console.error(error)
  }

  /* aggiunta manuale */
  const handleAdd = async (e) => {
    e.preventDefault()
    const { data, error } = await supabase
      .from('expenses')
      .insert([{ ...nuovaSpesa, categoria: 'vestiti' }])
      .select()
      .single()
    if (!error) {
      setSpese([...spese, data])
      setNuovaSpesa({ descrizione: '', importo: '' })
    } else console.error(error)
  }

  /* elimina */
  const handleDelete = async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (!error) setSpese(spese.filter((s) => s.id !== id))
    else console.error(error)
  }

  /* placeholder OCR / STT */
  const handleOCR = () => alert('TODO: OCR')
  const handleVoice = () => alert('TODO: STT')

  /* totale */
  const totale = spese.reduce((sum, s) => sum + Number(s.importo || 0), 0)

  return (
    <>
      <Head>
        <title>Vestiti ed Altro - Jarvis-Assistant</title>
      </Head>

      <div className="vestiti-ed-altro-container1">
        <div className="vestiti-ed-altro-container2">
          {/* Pulsanti */}
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: '#fff' }}>
            👗 Vestiti ed Altro
          </h2>

          <div className="table-buttons">
            <button className="btn-manuale" onClick={() => document.getElementById('descrV').focus()}>
              ➕ Aggiungi manualmente
            </button>
            <button className="btn-vocale" onClick={handleVoice}>
              🎙 Riconoscimento vocale
            </button>
            <button className="btn-ocr" onClick={handleOCR}>
              📷 OCR
            </button>
          </div>

          {/* Form di input */}
          <form onSubmit={handleAdd} className="input-section">
            <label htmlFor="descrV">Descrizione</label>
            <input
              id="descrV"
              type="text"
              placeholder="Es. H&M - Jeans"
              value={nuovaSpesa.descrizione}
              onChange={(e) =>
                setNuovaSpesa({ ...nuovaSpesa, descrizione: e.target.value })
              }
              required
            />

            <label htmlFor="impV">Importo €</label>
            <input
              id="impV"
              type="number"
              step="0.01"
              placeholder="25.00"
              value={nuovaSpesa.importo}
              onChange={(e) =>
                setNuovaSpesa({ ...nuovaSpesa, importo: e.target.value })
              }
              required
            />

            <button type="submit" className="btn-manuale">
              Salva
            </button>
          </form>

          {/* Tabella */}
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Descrizione</th>
                  <th>Dettaglio</th>
                  <th>Data</th>
                  <th>Importo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {spese.map((s) => (
                  <tr key={s.id}>
                    <td>{s.descrizione}</td>
                    <td>{s.dettaglio || '-'}</td>
                    <td>{new Date(s.data || s.created_at).toLocaleDateString()}</td>
                    <td>{Number(s.importo).toFixed(2)}</td>
                    <td>
                      <button onClick={() => handleDelete(s.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totale */}
            <div className="total-box">Totale: € {totale.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* stile originale + utility */}
      <style jsx>{`
        .vestiti-ed-altro-container1 {
          width: 100%;
          min-height: 100vh;
          display: flex;
          align-items: center;
          flex-direction: column;
          padding: 2rem 0;
          background: url('/pagina%20vestiti.mp4') no-repeat center/cover;
        }
        .vestiti-ed-altro-container2 {
          max-width: 1000px;
          width: 95%;
        }
        .table-buttons {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }
        .btn-manuale,
        .btn-vocale,
        .btn-ocr {
          padding: 0.75rem 1.25rem;
          font-size: 1rem;
          border-radius: 0.5rem;
          border: none;
          font-weight: 600;
          cursor: pointer;
          color: #fff;
        }
        .btn-manuale {
          background: #22c55e;
        }
        .btn-vocale {
          background: #10b981;
        }
        .btn-ocr {
          background: #f43f5e;
        }

        /* input section */
        .input-section {
          background: rgba(255, 255, 255, 0.1);
          padding: 1rem;
          margin-bottom: 1.5rem;
          border-radius: 0.5rem;
          display: grid;
          gap: 0.75rem;
        }
        .input-section input {
          padding: 0.6rem;
          border-radius: 0.5rem;
          border: none;
          font-size: 1rem;
        }

        /* tabella */
        .table-container {
          overflow-x: auto;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 1rem;
          padding: 1.5rem;
          color: #fff;
          font-family: Inter, sans-serif;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        }
        .custom-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 1rem;
        }
        .custom-table thead {
          background: #1f2937;
        }
        .custom-table th,
        .custom-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .custom-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .total-box {
          margin-top: 1rem;
          background: rgba(34, 197, 94, 0.8);
          padding: 1rem;
          border-radius: 0.5rem;
          font-size: 1.25rem;
          font-weight: 600;
          text-align: right;
        }

        @media (max-width: 768px) {
          .btn-manuale,
          .btn-vocale,
          .btn-ocr {
            font-size: 0.95rem;
            padding: 0.6rem 1rem;
          }
        }
      `}</style>
    </>
  )
}

export default withAuth(VestitiEdAltro)
