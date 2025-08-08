// pages/cene-aperitivi.js
import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_ID_CENE = '0f8eb04a-8a1a-4899-9f29-236a5be7e9db'

function CeneAperitivi() {
  // Stati & refs
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

  // Carica storico on mount
  useEffect(() => {
    fetchSpese()
  }, [])

  async function fetchSpese() {
    setLoading(true)
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at')
      .eq('category_id', CATEGORY_ID_CENE)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setSpese(data || [])
    setLoading(false)
  }

  // Aggiungi manuale (una riga)
  const handleAdd = async e => {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return setError('Sessione scaduta')

    const row = {
      user_id:     user.id,
      category_id: CATEGORY_ID_CENE,
      description: `[${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio}`,
      amount:      Number(nuovaSpesa.prezzoTotale) || 0,
      spent_at:    nuovaSpesa.spentAt || new Date().toISOString().slice(0,10),
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

  // Elimina voce
  const handleDelete = async id => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (error) setError(error.message)
    else setSpese(spese.filter(r => r.id !== id))
  }

  // OCR multiplo
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

  // Registrazione audio
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

  // Prompt "receipt": voce unica con righe + totale
  function buildSystemPrompt(source, userText) {
    const header =
      source === 'ocr'
        ? 'Sei Jarvis. Dal testo OCR estrai uno scontrino unico.'
        : 'Sei Jarvis. Dal dettato vocale estrai uno scontrino unico (ignora “ehm”, “ok”, ecc.).'

    return `
${header}

Devi produrre:
- puntoVendita (string)
- data (YYYY-MM-DD, usa quella sullo scontrino o oggi se assente)
- lineItems: array di { desc (string), qty (number, default 1), price (number in EUR per unità) }
- total (number in EUR). Se non c'è, calcola tu somma (qty * price).

Rispondi **solo** JSON, senza testo extra:
\`\`\`json
{
  "type":"receipt",
  "puntoVendita":"Ristorante Il Cortile",
  "data":"2025-08-06",
  "lineItems":[
    {"desc":"Bruschette","qty":1,"price":3.00},
    {"desc":"Pizza margherita","qty":1,"price":7.00}
  ],
  "total":10.00
}
\`\`\`

TESTO_INPUT:
${userText}
`.trim()
  }

  // Parsing AI & DB insert (una riga con dettaglio)
  async function parseAssistantPrompt(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const { answer, error: apiErr } = await res.json()
    if (!res.ok || apiErr) throw new Error(apiErr || res.status)

    const data = JSON.parse(answer)

    // Helper € con virgola
    const eur = n => (Number(n || 0).toFixed(2)).replace('.', ',')

    let puntoVendita = ''
    let spentAt = new Date().toISOString().slice(0,10)
    let total = 0
    let descr = ''

    if (data.type === 'receipt' && Array.isArray(data.lineItems)) {
      puntoVendita = data.puntoVendita || ''
      spentAt = data.data || spentAt

      const rows = data.lineItems.map(li => {
        const qty = Number(li.qty || 1)
        const lineTotal = qty * Number(li.price || 0)
        return `${li.desc?.trim() || 'Voce'}${qty>1 ? ` x${qty}`:''} ${eur(lineTotal)} €`
      })
      const calc = data.lineItems.reduce((s, li) => s + (Number(li.qty || 1) * Number(li.price || 0)), 0)
      total = Number(data.total || calc)
      descr = `${rows.join('; ')}; Totale scontrino: ${eur(total)} €`
    } else if (data.type === 'expense' && Array.isArray(data.items) && data.items.length) {
      // Fallback compatibile: raggruppa tutto in UNA riga
      const rows = []
      total = 0
      let candidatePV = ''
      data.items.forEach(it => {
        const q = Number(it.quantita || 1)
        const price = Number(it.prezzoTotale || 0) // totale voce
        total += price
        if (it.data) spentAt = it.data
        if (!candidatePV && it.puntoVendita) candidatePV = it.puntoVendita
        rows.push(`${(it.dettaglio || 'Voce').trim()}${q>1 ? ` x${q}`:''} ${eur(price)} €`)
      })
      puntoVendita = candidatePV
      descr = `${rows.join('; ')}; Totale scontrino: ${eur(total)} €`
    } else {
      throw new Error('Assistant response invalid')
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const row = {
      user_id:      user.id,
      category_id:  CATEGORY_ID_CENE,
      description:  `[${puntoVendita || 'Cena/Aperitivo'}] ${descr}`,
      amount:       Number(total) || 0,
      spent_at:     spentAt,
      qty:          1,
    }

    const { error: dbErr } = await supabase.from('finances').insert(row)
    if (dbErr) throw dbErr

    await fetchSpese()
    setNuovaSpesa({
      puntoVendita: puntoVendita || '',
      dettaglio:    descr,
      quantita:     '1',
      prezzoTotale: Number(total) || 0,
      spentAt:      spentAt,
    })
  }

  // Render
  const totale = spese.reduce((t, r) => t + r.amount * (r.qty || 1), 0)

  return (
    <>
      <Head><title>Cene e Aperitivi</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2>🍽️ Cene e Aperitivi</h2>

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
              onChange={e => handleOCR(Array.from(e.target.files))}
            />
          </div>

          <form className="input-section" ref={formRef} onSubmit={handleAdd}>
            <label>Punto vendita</label>
            <input
              value={nuovaSpesa.puntoVendita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })}
              required
            />
            <label>Dettaglio</label>
            <textarea
              value={nuovaSpesa.dettaglio}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })}
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
                    <th>Qtà</th>
                    <th>Data</th>
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
                        <td>{r.qty}</td>
                        <td>{new Date(r.spent_at).toLocaleDateString()}</td>
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

      {/* Stili identici a quelli di Vestiti ed Altro */}
      <style jsx global>{`
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
        .title { margin-bottom: 1rem; font-size: 1.5rem; color: #fff; }
        .table-buttons { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
        .btn-vocale, .btn-ocr, .btn-manuale {
          background: #10b981; color: #fff; border: none;
          padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer;
        }
        .btn-ocr { background: #f43f5e; }
        .input-section { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
        input, textarea {
          width: 100%; padding: 0.6rem; border: none; border-radius: 0.5rem;
          background: rgba(255, 255, 255, 0.1); color: #fff;
        }
        textarea { resize: vertical; min-height: 4.5rem; }
        .custom-table { width: 100%; border-collapse: collapse; }
        .custom-table thead { background: #1f2937; }
        .custom-table th, .custom-table td {
          padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .custom-table tbody tr:hover { background: rgba(255,255,255,0.05); }
        .total-box {
          margin-top: 1rem; background: rgba(34,197,94,0.8);
          padding: 1rem; border-radius: 0.5rem; text-align: right; font-weight: 600;
        }
        .error { color: #f87171; margin-top: 1rem; }
      `}</style>
    </>
  )
}

export default withAuth(CeneAperitivi)
