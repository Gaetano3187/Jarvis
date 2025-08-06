// pages/spese-casa.js
import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'

import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_ID_CASA = '4cfaac74-aab4-4d96-b335-6cc64de59afc'

/* -------------------------------------------------------------------------- */
/*  COMPONENTE                                                                */
/* -------------------------------------------------------------------------- */
function SpeseCasa() {
  /* ---------------------------- STATE & REF ----------------------------- */
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recBusy, setRecBusy] = useState(false)
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    prezzoTotale: '',
    quantita: '1',
    spentAt: '',
  })

  const formRef = useRef(null)
  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])

  /* -------------------------- CARICAMENTO DATI -------------------------- */
  useEffect(() => {
    fetchSpese()
  }, [])

  async function fetchSpese() {
    setLoading(true)
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at')
      .eq('category_id', CATEGORY_ID_CASA)
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setSpese(data)

    setLoading(false)
  }

  /* ------------------------- INSERIMENTO MANUALE ------------------------ */
  const handleAdd = async (e) => {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Sessione scaduta')
      return
    }

    const row = {
      user_id: user.id,
      category_id: CATEGORY_ID_CASA,
      description: `[${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio}`,
      amount: Number(nuovaSpesa.prezzoTotale),
      spent_at: nuovaSpesa.spentAt || new Date().toISOString(),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1,
    }

    const { error: insertError } = await supabase.from('finances').insert(row)
    if (insertError) setError(insertError.message)
    else {
      setNuovaSpesa({
        puntoVendita: '',
        dettaglio: '',
        prezzoTotale: '',
        quantita: '1',
        spentAt: '',
      })
      fetchSpese()
    }
  }

  /* ------------------------------ DELETE -------------------------------- */
  const handleDelete = async (id) => {
    const { error: deleteError } = await supabase.from('finances').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else setSpese(spese.filter((r) => r.id !== id))
  }

  /* -------------------------------- OCR --------------------------------- */
  const handleOCR = async (file) => {
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('image', file)
      const { text } = await (
        await fetch('/api/ocr', { method: 'POST', body: fd })
      ).json()
      await parseAssistantPrompt(buildSystemPrompt('ocr', text))
    } catch {
      setError('OCR fallito')
    }
  }

  /* ----------------------------- RECORDING ------------------------------ */
  const toggleRec = async () => {
    if (recBusy) {
      mediaRecRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecRef.current = new MediaRecorder(stream)
      recordedChunks.current = []
      mediaRecRef.current.ondataavailable = (e) =>
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
      const { text } = await (
        await fetch('/api/stt', { method: 'POST', body: fd })
      ).json()
      await parseAssistantPrompt(buildSystemPrompt('voice', text))
    } catch {
      setError('STT fallito')
    } finally {
      setRecBusy(false)
    }
  }

  /* -------------------------- SYSTEM PROMPT ----------------------------- */
  const buildSystemPrompt = (source, userText) => {
    return `

    **ATTENZIONE:** il testo che segue è il risultato di una trascrizione vocale.  
Potrebbe contenere errori di punteggiatura, parole ripetute o intercalari come “ehm”, “allora”, “ok”.  
**Ignora** questi artefatti e concentra l’attenzione solo sui dati di spesa.

**CONTESTO:** l’utente sta annotando una **spesa domestica**. Tu sei Jarvis, un assistente che estrae da frasi in italiano i dettagli di un acquisto e restituisce **solo** JSON valido.

Rispondi **esclusivamente** con JSON conforme al seguente schema, senza testo aggiuntivo:

json
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": string,
      "dettaglio": string,
      "prezzoTotale": number,
      "quantita": number,
      "data": "YYYY-MM-DD" | "<oggi>" | "<IERI>",
      "categoria": string,
      "category_id": "${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 1 (non da ripetere)
Input: "Ho preso 3 pacchi di pasta Barilla a 2.50 euro al Supermercato Rossi il 10 luglio 2025"
Output:
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Supermercato Rossi",
      "dettaglio":"3 pacchi di pasta Barilla",
      "prezzoTotale":2.50,
      "quantita":3,
      "data":"2025-07-10",
      "categoria":"casa",
      "category_id":"\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 2 (non da ripetere)
Input: "Ho comprato al supermercato Orsini Market una confezione di latte a 20 euro"
Output:
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Orsini Market",
      "dettaglio":"1 confezione di latte",
      "prezzoTotale":20.00,
      "quantita":1,
      "data":"< "YYYY-MM-DD" | "<oggi>" | 
      "categoria":"casa",
      "category_id":"\${CATEGORY_ID_CASA}"

    }
  ]
}
ESEMPIO 3
Input: "Ieri ho acquistato 2 biglietti del cinema a 18 euro in totale al Cinema Lux"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Cinema Lux",
      "dettaglio": "2 biglietti del cinema",
      "prezzoTotale": 18.00,
      "quantita": 2,
      "data": "<IERI>",
      "categoria": "tempo libero",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

Ora capisci la frase seguente (proveniente da **\${source}**) e compila i campi:
"\${userText}"
  `;
};
  /* ---------------------- CHIAMATA E PARSING GPT ------------------------ */
  async function parseAssistantPrompt(prompt) {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })

      if (!res.ok) {
        const txt = await res.text()
        console.error('assistant error', res.status, txt)
        setError(`Assistant ${res.status}`)
        return
      }

      const { answer, error: apiErr } = await res.json()
      if (apiErr) {
        setError(`Assistant: ${apiErr}`)
        return
      }

      console.log('[assistant-raw]', answer)
      const data = JSON.parse(answer)
      if (data.type !== 'expense' || !Array.isArray(data.items) || !data.items.length) {
        setError('Risposta assistant non valida')
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const rows = data.items.map((it) => ({
        user_id: user.id,
        category_id: CATEGORY_ID_CASA,
        description: `[${it.puntoVendita || 'Sconosciuto'}] ${it.dettaglio || 'spesa'}`,
        amount: Number(it.prezzoTotale || 0),
        spent_at: it.data || new Date().toISOString(),
        qty: parseInt(it.quantita || 1, 10),
      }))

      const { error: dbErr } = await supabase.from('finances').insert(rows)
      if (dbErr) {
        setError(dbErr.message)
        return
      }
      fetchSpese()

      /* pre-riempi il form con la prima riga */
      const f = rows[0]
      setNuovaSpesa({
        puntoVendita: f.description.match(/^\[(.*?)\]/)?.[1] || '',
        dettaglio: f.description.replace(/^\[.*?\]\s*/, ''),
        prezzoTotale: f.amount,
        quantita: String(f.qty),
        spentAt: f.spent_at.slice(0, 10),
      })
    } catch (err) {
      console.error(err)
      setError('Risposta assistant non valida')
    }
  }

  /* ------------------------------ RENDER ------------------------------- */
  const totale = spese.reduce(
    (t, r) => t + Number(r.amount || 0) * (r.qty ?? 1),
    0
  )

  return (
    <>
      <Head>
        <title>Spese Casa</title>
      </Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: '#fff' }}>
            🏠 Spese Casa
          </h2>

          <div className="table-buttons">
            <button
              className="btn-manuale"
              onClick={() => formRef.current?.scrollIntoView()}
            >
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
            hidden
            onChange={(e) => handleOCR(e.target.files?.[0])}
          />

          {/* ------------------------ FORM ------------------------ */}
          <form className="input-section" ref={formRef} onSubmit={handleAdd}>
            <label htmlFor="vendita">Punto vendita / Servizio</label>
            <input
              id="vendita"
              value={nuovaSpesa.puntoVendita}
              onChange={(e) =>
                setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })
              }
              required
            />

            <label htmlFor="quantita">Quantità</label>
            <input
              id="quantita"
              type="number"
              min="1"
              value={nuovaSpesa.quantita}
              onChange={(e) =>
                setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })
              }
              required
            />

            <label htmlFor="dettaglio">Dettaglio della spesa</label>
            <textarea
              id="dettaglio"
              value={nuovaSpesa.dettaglio}
              onChange={(e) =>
                setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })
              }
              required
            />

            <label htmlFor="data">Data di acquisto</label>
            <input
              id="data"
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={(e) =>
                setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })
              }
              required
            />

            <label htmlFor="prezzo">Prezzo totale (€)</label>
            <input
              id="prezzo"
              type="number"
              step="0.01"
              value={nuovaSpesa.prezzoTotale}
              onChange={(e) =>
                setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })
              }
              required
            />

            <button className="btn-manuale" style={{ width: 'fit-content' }}>
              Aggiungi
            </button>
          </form>

          {/* ----------------------- TABELLA ---------------------- */}
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
                  {spese.map((r) => {
                    const m = r.description?.match(/^\[(.*?)\]\s*(.*)$/)
                    return (
                      <tr key={r.id}>
                        <td>{m?.[1] || '-'}</td>
                        <td>{m?.[2] || r.description}</td>
                        <td>
                          {r.spent_at
                            ? new Date(r.spent_at).toLocaleDateString()
                            : ''}
                        </td>
                        <td>{r.qty ?? 1}</td>
                        <td>{Number(r.amount).toFixed(2)}</td>
                        <td>
                          <button onClick={() => handleDelete(r.id)}>🗑</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
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

      {/* --------------------------- STYLE --------------------------- */}
      <style jsx global>{`
        .spese-casa-container1 {
          width: 100%;
          display: flex;
          min-height: 100vh;
          align-items: center;
          flex-direction: column;
          justify-content: center;
        }
        .spese-casa-container2 {
          display: contents;
        }
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
          background: #1f2937;
        }
        table.custom-table th,
        table.custom-table td {
          padding: 0.75rem 1rem;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        table.custom-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.05);
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
        .input-section input,
        .input-section textarea {
          padding: 0.6rem;
          border-radius: 0.5rem;
          border: none;
          font-size: 1rem;
          width: 100%;
        }
        textarea {
          min-height: 4.5rem;
          resize: vertical;
        }
        @media (max-width: 768px) {
          .table-container {
            padding: 1rem;
          }
          .table-buttons button {
            font-size: 0.95rem;
            padding: 0.6rem 1rem;
          }
          .input-section input,
          .input-section textarea {
            font-size: 0.95rem;
          }
        }
      `}</style>
    </>
  )
}

export default withAuth(SpeseCasa)
