// pages/vestiti-ed-altro.js
import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_ID_VESTITI = '89e223d4-1ec0-4631-b0d4-52472579a04a'

function VestitiEdAltro() {
  // stati & refs
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

  // carica storico
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

  // aggiunta manuale
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

  // elimina
  const handleDelete = async id => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (error) setError(error.message)
    else setSpese(spese.filter(s => s.id !== id))
  }

  // OCR (una sola immagine)
  const handleOCR = async file => {
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('images', file)
      const { text } = await (await fetch('/api/ocr', { method: 'POST', body: fd })).json()
      await parseAssistantPrompt(buildSystemPrompt('ocr', text))
    } catch {
      setError('OCR fallito')
    }
  }

  // registrazione audio
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

  // costruisci prompt
  function buildSystemPrompt(source, userText) {
    if (source === 'ocr') {
      return `
Sei Jarvis. Da questo testo OCR estrai **tutte** le voci di spesa in JSON, **usando la data** presente sullo scontrino.

Ogni voce deve avere:
- descrizione: string
- prezzoUnitario: number | null
- quantita: number
- prezzoTotale: number
- data: "YYYY-MM-DD"

Rispondi **solo** con JSON come:
\`\`\`json
{
  "type":"expense",
  "items":[
    { "descrizione":"Jeans Levi's", "prezzoUnitario":59.90, "quantita":1, "prezzoTotale":59.90, "data":"2025-04-18" },
    /* altre voci... */
  ]
}
\`\`\`

TESTO_OCR:
${userText}
`
    }
    // trascrizione vocale
    return `
**ATT:** trascrizione vocale, ignora "ehm", "ok", ecc.

Ora estrai **solo** JSON spesa (stesso schema di prima).

ESEMPIO:
Input: "Ho comprato un paio di pantaloni a 49.90 euro il 5 maggio 2025"
Output:
{
  "type":"expense",
  "items":[
    { "descrizione":"Pantaloni", "prezzoUnitario":49.90, "quantita":1, "prezzoTotale":49.90, "data":"2025-05-05" }
  ]
}

Frase:
"${userText}"
`
  }

  // parsing e inserimento DB
  async function parseAssistantPrompt(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const { answer, error: apiErr } = await res.json()
    if (!res.ok || apiErr) throw new Error(apiErr || res.status)
    const data = JSON.parse(answer)
    if (data.type !== 'expense' || !Array.isArray(data.items) || data.items.length === 0)
      throw new Error('Risposta assistant non valida')

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
        user_id:     user.id,
        category_id: CATEGORY_ID_VESTITI,
        description: it.descrizione,
        amount:      Number(it.prezzoTotale) || 0,
        spent_at:    spentAt,
        qty:         parseFloat(it.quantita) || 1,
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
  }

  // render
  const totale = spese.reduce((sum, s) => sum + Number(s.amount || 0) * (s.qty || 1), 0)

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
              hidden
              onChange={e => handleOCR(e.target.files?.[0])}
            />
          </div>

          <form ref={formRef} className="input-section" onSubmit={handleAdd}>
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
          min-height: 100vh; padding: 2rem;
          font-family: Inter, sans-serif;
        }
        .vestiti-ed-altro-container2 {
          max-width: 800px; width: 100%;
          background: rgba(0, 0, 0, 0.6);
          padding: 2rem; border-radius: 1rem;
          color: #fff; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        }
        .title { margin-bottom:1rem; font-size:1.5rem; }
        .table-buttons { display:flex; gap:1rem; margin-bottom:1.5rem; }
        .btn-vocale, .btn-ocr, .btn-manuale {
          background:#10b981; color:#fff; border:none;
          padding:0.5rem 1rem; border-radius:0.5rem; cursor:pointer;
        }
        .btn-ocr { background:#f43f5e; }
        .input-section { display:flex; flex-direction:column; gap:0.75rem; margin-bottom:1.5rem; }
        input, textarea {
          width:100%; padding:0.6rem; border:none; border-radius:0.5rem;
          background:rgba(255,255,255,0.1); color:#fff;
        }
        textarea { resize:vertical; min-height:4.5rem; }
        .custom-table { width:100%; border-collapse:collapse; }
        .custom-table thead { background:#1f2937; }
        .custom-table th, .custom-table td { padding:0.75rem 1rem; border-bottom:1px solid rgba(255,255,255,0.1); }
        .total-box {
          margin-top:1rem; background:rgba(34,197,94,0.8);
          padding:1rem; border-radius:0.5rem; text-align:right; font-weight:600;
        }
        .error { color:#f87171; margin-top:1rem; }
      `}</style>
    </>
  )
}

export default withAuth(VestitiEdAltro)
