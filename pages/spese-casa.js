// pages/spese-casa.js
import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'

import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_ID_CASA = '4cfaac74-aab4-4d96-b335-6cc64de59afc'

function SpeseCasa() {
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

    const { error } = await supabase.from('finances').insert(row)
    if (error) setError(error.message)
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

  const handleDelete = async (id) => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (error) setError(error.message)
    else setSpese(spese.filter((r) => r.id !== id))
  }

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

  const buildSystemPrompt = (source, userText) => {
    const prompt = `
Sei Jarvis. Rispondi **solo** con JSON conforme al seguente schema, senza testo extra.

ESEMPIO 1
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
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 2
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
      "data":"<ODIERNA>",
      "categoria":"casa",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}

Ora capisci la frase seguente (proveniente da **${source}**) e compila i campi:
"${userText}"
`
    console.log('--- prompt completo ---')
    console.log(prompt)
    return prompt
  }

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

          {/* FORM */}
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

          {/* TABELLA */}
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

      <style jsx global>{`
        /* ... stili esattamente come prima ... */
      `}</style>
    </>
  )
}

export default withAuth(SpeseCasa)
