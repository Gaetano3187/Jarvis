// pages/vestiti-ed-altro.js
import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'
import { askAssistant } from '@/lib/assistant'

const CATEGORY_ID_VESTITI = '89e223d4-1ec0-4631-b0d4-52472579a04a'

function VestitiEdAltro() {
  // ─────────────────────────────────── Stati e refs
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recBusy, setRecBusy] = useState(false)
  const [nuovaSpesa, setNuovaSpesa] = useState({
    descrizione: '',
    importo: '',
    quantita: '1',
    spentAt: '',
  })

  const formRef = useRef(null)
  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])

  // ─────────────────────────────────── Carica storico on mount
  useEffect(() => {
    fetchSpese()
  }, [])

  async function fetchSpese() {
    setLoading(true)
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at')
      .eq('category_id', CATEGORY_ID_VESTITI)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setSpese(data)
    setLoading(false)
  }

  // ─────────────────────────────────── Inserimento manuale
  const handleAdd = async e => {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return setError('Sessione scaduta')

    const row = {
      user_id: user.id,
      category_id: CATEGORY_ID_VESTITI,
      description: nuovaSpesa.descrizione,
      amount: Number(nuovaSpesa.importo),
      spent_at: nuovaSpesa.spentAt || new Date().toISOString().slice(0, 10),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1,
    }

    const { error: insertError } = await supabase.from('finances').insert(row)
    if (insertError) setError(insertError.message)
    else {
      setNuovaSpesa({ descrizione: '', importo: '', quantita: '1', spentAt: '' })
      fetchSpese()
    }
  }

  // ─────────────────────────────────── Elimina voce
  const handleDelete = async id => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (error) setError(error.message)
    else setSpese(spese.filter(s => s.id !== id))
  }

  // ─────────────────────────────────── OCR multiplo
  const handleOCR = async files => {
    console.log('▶️ handleOCR chiamato con file(s):', files)
    if (!files || files.length === 0) return
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('images', f))
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text } = await res.json()
      await parseAssistantPrompt(buildSystemPrompt('ocr', text, files.map(f => f.name).join(', ')))
    } catch (err) {
      console.error(err)
      setError('OCR fallito')
    }
  }

  // ─────────────────────────────────── Registrazione audio
  const toggleRec = async () => {
    if (recBusy) {
      mediaRecRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecRef.current = new MediaRecorder(stream)
      recordedChunks.current = []
      mediaRecRef.current.ondataavailable = e =>
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
      const { text } = await (await fetch('/api/stt', { method: 'POST', body: fd })).json()
      await parseAssistantPrompt(buildSystemPrompt('voice', text))
    } catch {
      setError('STT fallito')
    } finally {
      setRecBusy(false)
    }
  }

  // ─────────────────────────────────── Costruisci prompt
  function buildSystemPrompt(source, userText, fileName) {
    if (source === 'ocr') {
      return `
Sei Jarvis. Da questo testo OCR estrai **tutte** le righe di spesa, anche se ce ne sono più di una, **usando la data** presente sullo scontrino.

Per ciascuna voce estratta genera un oggetto con:
- descrizione: string
- prezzoUnitario: number | null
- quantita: number
- prezzoTotale: number
- data: "YYYY-MM-DD" (estratta direttamente dal testo)

Rispondi **solo** con JSON conforme a questo schema:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "descrizione":"1 paio di jeans",
      "prezzoUnitario":59.90,
      "quantita":1,
      "prezzoTotale":59.90,
      "data":"2025-08-18"
    },
    {
      "descrizione":"2 magliette",
      "prezzoUnitario":15.00,
      "quantita":2,
      "prezzoTotale":30.00,
      "data":"2025-08-18"
    }
    /* … tutte le voci … */
  ]
}
\`\`\`

CONTENUTO OCR (${fileName}):
${userText}
`
    }

    // voce / STT
    return `
**ATTENZIONE:** il testo che segue è trascrizione vocale, ignora "ehm", "ok", ecc.

Ora estrai **solo** JSON spesa nello stesso schema di prima.

ESEMPIO:
Input: "Ho comprato un paio di sneakers a 89.90 euro il 20 agosto 2025"
Output:
{
  "type":"expense",
  "items":[
    {
      "descrizione":"Sneakers",
      "prezzoUnitario":89.90,
      "quantita":1,
      "prezzoTotale":89.90,
      "data":"2025-08-20"
    }
  ]
}

Ora capisci la frase seguente e compila i campi:
"${userText}"
`
  }

  // ─────────────────────────────────── Parsing AI & DB insert
  async function parseAssistantPrompt(prompt) {
    try {
      const { answer, error: apiErr } = await askAssistant(prompt)
      if (apiErr) throw new Error(apiErr)

      const data = JSON.parse(answer)
      if (data.type !== 'expense' || !Array.isArray(data.items) || data.items.length === 0)
        throw new Error('Assistant response invalid')

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      const rows = data.items.map(it => {
        let spentAt = it.data
        if (spentAt === 'oggi') {
          spentAt = new Date().toISOString().slice(0, 10)
        } else if (spentAt === 'ieri') {
          const d = new Date()
          d.setDate(d.getDate() - 1)
          spentAt = d.toISOString().slice(0, 10)
        }
        return {
          user_id:      user.id,
          category_id:  CATEGORY_ID_VESTITI,
          description:  it.descrizione,
          amount:       Number(it.prezzoTotale) || 0,
          spent_at:     spentAt,
          qty:          parseFloat(it.quantita) || 1,
        }
      })

      const { error: dbErr } = await supabase.from('finances').insert(rows)
      if (dbErr) throw dbErr

      await fetchSpese()
      const last = rows[0]
      setNuovaSpesa({
        descrizione: last.description,
        importo:     last.amount,
        quantita:    String(last.qty),
        spentAt:     last.spent_at.slice(0, 10),
      })
    } catch (err) {
      console.error(err)
      setError(err.message)
    }
  }

  // ─────────────────────────────────── Render
  const totale = spese.reduce((sum, s) => sum + s.amount * (s.qty || 1), 0)

  return (
    <>
      <Head>
        <title>Vestiti ed Altro</title>
      </Head>

      <div className="vestiti-ed-altro-container1">
        <div className="vestiti-ed-altro-container2">
          <h2 className="title">🛍️ Vestiti ed Altro</h2>

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

          <form ref={formRef} onSubmit={handleAdd} className="input-section">
            <label>Descrizione</label>
            <input
              value={nuovaSpesa.descrizione}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, descrizione: e.target.value })}
              required
            />

            <label>Importo (€)</label>
            <input
              type="number"
              step="0.01"
              value={nuovaSpesa.importo}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, importo: e.target.value })}
              required
            />

            <label>Quantità</label>
            <input
              type="number"
              min="1"
              value={nuovaSpesa.quantita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })}
              required
            />

            <label>Data</label>
            <input
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
            />

            <button type="submit" className="btn-manuale">
              Salva
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
                    <th>Importo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map(s => (
                    <tr key={s.id}>
                      <td>{s.description}</td>
                      <td>{new Date(s.spent_at).toLocaleDateString()}</td>
                      <td>{s.qty}</td>
                      <td>{s.amount.toFixed(2)}</td>
                      <td>
                        <button onClick={() => handleDelete(s.id)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="total-box">Totale: € {totale.toFixed(2)}</div>
          </div>

          {error && <p className="error">{error}</p>}

          <Link href="/home">
            <a className="btn-vocale">🏠 Home</a>
          </Link>
        </div>
      </div>

      <style jsx>{`
        .vestiti-ed-altro-container1 {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f172a;
          min-height: 100vh;
          padding: 2rem;
          font-family: Inter, sans-serif;
        }
        .vestiti-ed-altro-container2 {
          background: rgba(0, 0, 0, 0.6);
          padding: 2rem;
          border-radius: 1rem;
          color: #fff;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
          max-width: 800px;
          width: 100%;
        }
        .title {
          margin-bottom: 1rem;
          font-size: 1.5rem;
        }
        .table-buttons {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .btn-vocale,
        .btn-ocr,
        .btn-manuale {
          background: #10b981;
          color: #fff;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          cursor: pointer;
        }
        .btn-ocr {
          background: #f43f5e;
        }
        .input-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }
        input,
        textarea {
          width: 100%;
          padding: 0.6rem;
          border: none;
          border-radius: 0.5rem;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        textarea {
          resize: vertical;
          min-height: 4.5rem;
        }
        .custom-table {
          width: 100%;
          border-collapse: collapse;
        }
        .custom-table th,
        .custom-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .custom-table thead {
          background: #1f2937;
        }
        .total-box {
          margin-top: 1rem;
          background: rgba(34, 197, 94, 0.8);
          padding: 1rem;
          border-radius: 0.5rem;
          text-align: right;
          font-weight: 600;
        }
        .error {
          color: #f87171;
          margin-top: 1rem;
        }
      `}</style>
    </>
  )
}

export default withAuth(VestitiEdAltro)
