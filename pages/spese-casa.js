// pages/spese-casa.js
import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_ID_CASA = '4cfaac74-aab4-4d96-b335-6cc64de59afc'

function SpeseCasa() {
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [recBusy, setRecBusy] = useState(false)      // true = sta registrando
  const [stopping, setStopping] = useState(false)    // true = fermo in corso (attendi)

  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    prezzoTotale: '',
    quantita: '1',
    spentAt: '',
    paymentMethod: 'cash',
    cardLabel: '',
  })

  const formRef = useRef(null)
  const ocrInputRef = useRef(null)

  const mediaRecRef = useRef(null)
  const streamRef = useRef(null)
  const recordedChunks = useRef([])
  const mimeRef = useRef('')
  const stopWaitRef = useRef(null) // promise di attesa stop

  useEffect(() => {
    fetchSpese()

    // auto-stop se si cambia scheda o si lascia la pagina
    const handleVisibility = () => { if (document.hidden) stopRecording() }
    const handleBeforeUnload = () => { stopRecording(true) } // best effort sync

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      stopRecording(true)
    }
  }, [])

  async function fetchSpese() {
    setLoading(true)
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at, payment_method, card_label')
      .eq('category_id', CATEGORY_ID_CASA)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setSpese(data || [])
    setLoading(false)
  }

  // ───────────────────────────── Aggiungi manuale
  const handleAdd = async e => {
    e.preventDefault()
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setError('Sessione scaduta')

    const row = {
      user_id: user.id,
      category_id: CATEGORY_ID_CASA,
      description: `[${(nuovaSpesa.puntoVendita || '').trim()}] ${(nuovaSpesa.dettaglio || '').trim()}`,
      amount: Number(nuovaSpesa.prezzoTotale) || 0,
      spent_at: (nuovaSpesa.spentAt || new Date().toISOString().slice(0, 10)),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1,
      payment_method: (nuovaSpesa.paymentMethod || 'cash'), // cash | card | bank
      card_label: (nuovaSpesa.paymentMethod === 'card'
        ? (nuovaSpesa.cardLabel?.trim() || null)
        : null),
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
        paymentMethod: 'cash',
        cardLabel: '',
      })
      fetchSpese()
    }
  }

  // ───────────────────────────── Elimina
  const handleDelete = async id => {
    setError(null)
    const { error: deleteError } = await supabase
      .from('finances')
      .delete()
      .eq('id', id)
    if (deleteError) setError(deleteError.message)
    else setSpese(spese.filter(r => r.id !== id))
  }

  // ───────────────────────────── OCR
  const handleOCR = async files => {
    setError(null)
    if (!files || files.length === 0) return
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('images', f))
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text, error: ocrErr } = await res.json()
      if (!res.ok || ocrErr) throw new Error(ocrErr || 'OCR fallito')
      await parseAssistantPrompt(buildSystemPrompt('ocr', text, files.map(f => f.name).join(', ')))
    } catch (err) {
      console.error(err)
      setError('OCR fallito')
    }
  }

  // ───────────────────────────── START/STOP REC
  const toggleRec = async () => {
    setError(null)
    if (stopping) return // evita rimbalzi durante lo stop

    if (recBusy) {
      await stopRecording()
      return
    }

    // già attivo?
    if (mediaRecRef.current && mediaRecRef.current.state === 'recording') return

    if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
      setError('Questo browser non supporta la registrazione audio.')
      return
    }

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ]
    let chosen = ''
    for (const c of candidates) {
      if (window.MediaRecorder.isTypeSupported?.(c)) { chosen = c; break }
    }
    mimeRef.current = chosen

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordedChunks.current = []
      const mr = new MediaRecorder(streamRef.current, chosen ? { mimeType: chosen } : undefined)
      mediaRecRef.current = mr

      mr.addEventListener('dataavailable', e => {
        if (e.data && e.data.size) recordedChunks.current.push(e.data)
      }, { once: false })

      // onstop → processVoice
      mr.addEventListener('stop', () => {
        // risolve la promise di stop (se in attesa)
        stopWaitRef.current?.resolve?.()
        processVoice().finally(() => {
          setRecBusy(false)
        })
      }, { once: true })

      mr.start()
      setRecBusy(true)
    } catch (err) {
      console.error(err)
      setError('Microfono non disponibile')
      stopTracks()
      setRecBusy(false)
    }
  }

  async function stopRecording(sync = false) {
    if (!mediaRecRef.current) {
      stopTracks()
      setRecBusy(false)
      return
    }
    if (mediaRecRef.current.state !== 'recording') {
      stopTracks()
      setRecBusy(false)
      return
    }

    setStopping(true)

    // prepara promise che si risolve su onstop o timeout
    const p = new Promise(resolve => {
      stopWaitRef.current = { resolve }
      // timeout di sicurezza: se onstop non arriva, forziamo cleanup
      setTimeout(() => resolve('timeout'), 2000)
    })

    try {
      mediaRecRef.current.stop() // può lanciare
    } catch {
      // se fallisce lo stop, procedi a cleanup comunque
      stopWaitRef.current?.resolve?.()
    }

    if (!sync) {
      await p
    }

    // cleanup comune
    mediaRecRef.current = null
    stopTracks()
    setStopping(false)
  }

  function stopTracks() {
    try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
    streamRef.current = null
  }

  // ───────────────────────────── POST-REC: STT
  const processVoice = async () => {
    try {
      if (!recordedChunks.current.length) {
        setError('Registrazione vuota, riprova.')
        return
      }
      const mime = mimeRef.current || (recordedChunks.current[0]?.type || 'audio/webm')
      const ext = mime.includes('mp4') ? 'm4a'
        : mime.includes('ogg') ? 'ogg'
        : 'webm'

      const blob = new Blob(recordedChunks.current, { type: mime })
      const fd = new FormData()
      fd.append('audio', blob, `voice.${ext}`)

      const resp = await fetch('/api/stt', { method: 'POST', body: fd })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json?.text) throw new Error('STT fallito')

      await parseAssistantPrompt(buildSystemPrompt('voice', json.text))
    } catch (err) {
      console.error(err)
      setError('STT fallito')
    } finally {
      recordedChunks.current = []
    }
  }

  // ───────────────────────────── PROMPT BUILDER
  function buildSystemPrompt(source, userText, fileName) {
    const fn = fileName || 'scontrino'
    if (source === 'ocr') {
      return [
        'Sei Jarvis. Da questo testo OCR estrai tutte le righe di spesa, usando la data presente sullo scontrino.',
        '',
        'Per ogni voce genera un oggetto con:',
        '- puntoVendita: string',
        '- dettaglio: string',
        '- prezzoUnitario: number | null',
        '- quantita: number',
        '- prezzoTotale: number',
        '- data: "YYYY-MM-DD" (estratta dal testo)',
        '',
        'Rispondi solo con JSON conforme a questo schema:',
        '{ "type": "expense", "items": [{ "puntoVendita": "Supermercato", "dettaglio": "Latte", "prezzoUnitario": 1.20, "quantita": 1, "prezzoTotale": 1.20, "data": "2025-08-06" }] }',
        '',
        'CONTENUTO OCR (' + fn + '):',
        String(userText || '')
      ].join('\n')
    }
    return [
      'ATTENZIONE: il testo che segue è trascrizione vocale.',
      'Estrai SOLO JSON spesa (stesso schema di prima).',
      '',
      'ESEMPIO:',
      '{ "type":"expense", "items":[{ "puntoVendita":"Supermercato Rossi", "dettaglio":"Pasta Barilla", "prezzoTotale":2.50, "quantita":1, "data":"2025-07-10", "categoria":"casa", "category_id":"' + CATEGORY_ID_CASA + '" }] }',
      '',
      'Testo:',
      String(userText || '')
    ].join('\n')
  }

  // ───────────────────────────── Parse + insert in DB
  async function parseAssistantPrompt(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const { answer, error: apiErr } = await res.json()
    if (!res.ok || apiErr) throw new Error(apiErr || res.status)

    const data = JSON.parse(answer)
    if (data.type !== 'expense' || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('Assistant response invalid')
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const rows = data.items.map(it => {
      let spentAt = it.data
      if (spentAt === 'oggi') spentAt = new Date().toISOString().slice(0, 10)
      if (spentAt === 'ieri') {
        const d = new Date(); d.setDate(d.getDate() - 1); spentAt = d.toISOString().slice(0, 10)
      }
      const totalPrice = Number(it.prezzoTotale) || 0
      const method = (it.paymentMethod || 'cash')
      const label = method === 'card' ? (it.cardLabel || null) : null

      return {
        user_id: user.id,
        category_id: CATEGORY_ID_CASA,
        description: `[${it.puntoVendita}] ${it.dettaglio}`,
        amount: totalPrice,
        spent_at: spentAt,
        qty: 1,
        payment_method: method, // cash | card | bank
        card_label: label,
      }
    })

    const { error: dbErr } = await supabase.from('finances').insert(rows)
    if (dbErr) throw dbErr

    await fetchSpese()
    const last = rows[0]
    setNuovaSpesa({
      puntoVendita: last.description.match(/^\[(.*?)\]/)?.[1] || '',
      dettaglio: last.description.replace(/^\[.*?\]\s*/, ''),
      prezzoTotale: last.amount,
      quantita: String(last.qty),
      spentAt: last.spent_at,
      paymentMethod: last.payment_method || 'cash',
      cardLabel: last.card_label || '',
    })
  }

  // ───────────────────────────── UI
  const totale = (spese || []).reduce((t, r) => t + r.amount * (r.qty || 1), 0)

  const renderPayBadge = (r) => {
    if (r.payment_method === 'card') return `💳 ${r.card_label || 'Carta'}`
    if (r.payment_method === 'bank') return '🏦 Bonifico'
    return '💶 Contante'
  }

  return (
    <>
      <Head><title>Spese Casa</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">🏠 Spese Casa</h2>

          <div className="table-buttons">
            <button
              className="btn-vocale"
              onClick={toggleRec}
              disabled={stopping}
              title={stopping ? 'Chiusura microfono…' : ''}
            >
              {recBusy && !stopping ? '⏹ Stop' : (stopping ? '…' : '🎙 Voce')}
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

            <label>Metodo di pagamento</label>
            <select
              value={nuovaSpesa.paymentMethod}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, paymentMethod: e.target.value })}
            >
              <option value="cash">Contante (tasca)</option>
              <option value="card">Carta</option>
              <option value="bank">Bonifico/Altro</option>
            </select>

            {nuovaSpesa.paymentMethod === 'card' && (
              <>
                <label>Nome carta (opz.)</label>
                <input
                  value={nuovaSpesa.cardLabel}
                  onChange={e => setNuovaSpesa({ ...nuovaSpesa, cardLabel: e.target.value })}
                  placeholder="Visa, Revolut…"
                />
              </>
            )}

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
                    <th>Pag.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(spese || []).map(r => {
                    const m = r.description?.match?.(/^\[(.*?)\]\s*(.*)$/) || []
                    return (
                      <tr key={r.id}>
                        <td>{m[1] || '-'}</td>
                        <td>{m[2] || r.description}</td>
                        <td>{r.spent_at ? new Date(r.spent_at).toLocaleDateString() : '-'}</td>
                        <td>{r.qty}</td>
                        <td>{Number(r.amount).toFixed(2)}</td>
                        <td>{renderPayBadge(r)}</td>
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

          {error && <p className="error">{error}</p>}

          <Link href="/home" className="btn-vocale">🏠 Home</Link>
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

export default withAuth(SpeseCasa)
