// pages/vestiti-ed-altro.js
import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_ID_VESTITI = '89e223d4-1ec0-4631-b0d4-52472579a04a'

function VestitiEdAltro() {
  // ─────────────────────────────────────────────── Stati e refs
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recBusy, setRecBusy] = useState(false)
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    quantita: '1',
    prezzoTotale: '',
    spentAt: '',
  })

  const formRef = useRef(null)
  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])

  // ─────────────────────────────────────────────── Carica storico on mount
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

  // ─────────────────────────────────────────────── Aggiungi manuale
  const handleAdd = async e => {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return setError('Sessione scaduta')

    const row = {
      user_id:     user.id,
      category_id: CATEGORY_ID_VESTITI,
      description: `[${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio}`,
      amount:      Number(nuovaSpesa.prezzoTotale),
      spent_at:    nuovaSpesa.spentAt || new Date().toISOString().slice(0, 10),
      qty:         parseInt(nuovaSpesa.quantita, 10) || 1,
    }

    const { error: insertError } = await supabase.from('finances').insert(row)
    if (insertError) setError(insertError.message)
    else {
      setNuovaSpesa({
        puntoVendita: '',
        dettaglio: '',
        quantita: '1',
        prezzoTotale: '',
        spentAt: '',
      })
      fetchSpese()
    }
  }

  // ─────────────────────────────────────────────── Elimina voce
  const handleDelete = async id => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (error) setError(error.message)
    else setSpese(spese.filter(r => r.id !== id))
  }

  // ─────────────────────────────────────────────── OCR multiplo
  const handleOCR = async files => {
    if (!files?.length) return
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('images', f))
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text } = await res.json()
      await parseAssistantPrompt(buildSystemPrompt('ocr', text))
    } catch (err) {
      console.error(err)
      setError('OCR fallito')
    }
  }

  // ─────────────────────────────────────────────── Registrazione audio
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
    } catch (err) {
      console.error(err)
      setError('STT fallito')
    } finally {
      setRecBusy(false)
    }
  }

  // ─────────────────────────────────────────────── Costruisci prompt
  function buildSystemPrompt(source, userText) {
    if (source === 'ocr') {
      return `
Sei Jarvis. Da questo testo OCR estrai **tutte** le voci di spesa, anche se ce ne sono più di una, **usando la data** presente sullo scontrino.

Per ciascuna voce genera:
- puntoVendita: string
- dettaglio: string
- quantita: number
- prezzoTotale: number
- data: "YYYY-MM-DD"

Rispondi **solo** con JSON:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"abbigliamento",
      "dettaglio":"un paio di pantaloni a fiocca",
      "quantita":1,
      "prezzoTotale":100.00,
      "data":"2025-08-06"
    }
    /* altre voci... */
  ]
}
\`\`\`

TESTO_OCR:
${userText}
`
    }
    return `
**ATTENZIONE:** il testo seguente è trascrizione vocale, ignora "ehm", "ok", ecc.

Ora estrai **solo** JSON spesa (stesso schema):
"${userText}"
`
  }

  // ─────────────────────────────────────────────── Parsing AI & DB insert
  async function parseAssistantPrompt(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const { answer, error: apiErr } = await res.json()
    if (!res.ok || apiErr) throw new Error(apiErr || res.status)

    const data = JSON.parse(answer)
    if (data.type !== 'expense' || !Array.isArray(data.items) || !data.items.length) {
      throw new Error('Assistant response invalid')
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const rows = data.items.map(it => {
      let spentAt = it.data === 'oggi'
        ? new Date().toISOString().slice(0, 10)
        : it.data === 'ieri'
          ? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0,10) })()
          : it.data

      return {
        user_id:     user.id,
        category_id: CATEGORY_ID_VESTITI,
        description: `[${it.puntoVendita}] ${it.dettaglio}`,
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
      puntoVendita: last.description.match(/^\[(.*?)\]/)?.[1] || '',
      dettaglio:    last.description.replace(/^\[.*?\]\s*/, ''),
      quantita:     String(last.qty),
      prezzoTotale: last.amount,
      spentAt:      last.spent_at,
    })
  }

  // ─────────────────────────────────────────────── Render
  const totale = spese.reduce((t, r) => t + r.amount * (r.qty || 1), 0)

  return (
    <>
      <Head><title>Vestiti ed Altro</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">🛍️ Vestiti ed Altro</h2>

          <div className="table-buttons">
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

          <form className="input-section" ref={formRef} onSubmit={handleAdd}>
            <label>Punto vendita / Servizio</label>
            <input
              value={nuovaSpesa.puntoVendita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })}
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
            <label>Dettaglio della spesa</label>
            <textarea
              value={nuovaSpesa.dettaglio}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })}
              required
            />
            <label>Data di acquisto</label>
            <input
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
              required
            />
            <label>Prezzo totale (€)</label>
            <input
              type="number"
              step="0.01"
              value={nuovaSpesa.prezzoTotale}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })}
              required
            />
            <button className="btn-manuale">Aggiungi</button>
          </form>

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
                  {spese.map(r => {
                    const m = r.description.match(/^\[(.*?)\]\s*(.*)$/) || []
                    return (
                      <tr key={r.id}>
                        <td>{m[1] || '-'}</td>
                        <td>{m[2] || r.description}</td>
                        <td>{new Date(r.spent_at).toLocaleDateString()}</td>
                        <td>{r.qty}</td>
                        <td>{r.amount.toFixed(2)}</td>
                        <td><button onClick={() => handleDelete(r.id)}>🗑</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <div className="total-box">Totale: € {totale.toFixed(2)}</div>
          </div>

          {error && <p className="error">{error}</p>}

          <Link href="/home">
            <button className="btn-vocale">🏠 Home</button>
          </Link>
        </div>
      </div>

               <style jsx>{`
        .spese-casa-container1 {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f172a;
          min-height: 100vh;
          padding: 2rem;
          font-family: Inter, sans-serif;
        }
        .spese-casa-container2 {
          background: rgba(0, 0, 0, 0.6);
          padding: 2rem;
          border-radius: 1rem;
          color: #fff;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
          max-width: 800px;
          width: 100%;
        }
        .title { margin-bottom: 1rem; font-size: 1.5rem; }
        .table-buttons { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
        .btn-vocale, .btn-ocr, .btn-manuale {
          display: inline-block;
          text-align: center;
          background: #10b981;
          color: #fff;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          cursor: pointer;
          text-decoration: none;
        }
        .btn-ocr { background: #f43f5e; }
        .btn-vocale[disabled] { opacity: 0.6; cursor: not-allowed; }
        .input-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }
        input, textarea, select {
          width: 100%;
          padding: 0.6rem;
          border: none;
          border-radius: 0.5rem;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        textarea { resize: vertical; min-height: 4.5rem; }
        .custom-table { width: 100%; border-collapse: collapse; }
        .custom-table th, .custom-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .custom-table thead { background: #1f2937; }
        .total-box {
          margin-top: 1rem;
          background: rgba(34, 197, 94, 0.8);
          padding: 1rem;
          border-radius: 0.5rem;
          text-align: right;
          font-weight: 600;
        }
        .error { color: #f87171; margin-top: 1rem; }
      `}</style>
    </>
  )
}
export default withAuth(VestitiEdAltro)
