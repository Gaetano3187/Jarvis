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
  const [recBusy, setRecBusy] = useState(false)
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    prezzoTotale: '',
    quantita: '1',
    spentAt: '',
    paymentMethod: 'cash', // default
    cardLabel: '',
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
      .select('id, description, amount, qty, spent_at, payment_method, card_label')
      .eq('category_id', CATEGORY_ID_CASA)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setSpese(data)
    setLoading(false)
  }

  const handleAdd = async e => {
    e.preventDefault()
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

  const handleDelete = async id => {
    const { error: deleteError } = await supabase
      .from('finances')
      .delete()
      .eq('id', id)
    if (deleteError) setError(deleteError.message)
    else setSpese(spese.filter(r => r.id !== id))
  }

  const handleOCR = async files => {
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
        const d = new Date()
        d.setDate(d.getDate() - 1)
        spentAt = d.toISOString().slice(0, 10)
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

  const totale = spese.reduce((t, r) => t + r.amount * (r.qty || 1), 0)

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
            <button className="btn-vocale" onClick={toggleRec}>
              {recBusy ? '⏹ Stop' : '🎙 Voce'}
            </button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>
              📷 OCR
            </button>
            <input ref={ocrInputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => handleOCR(Array.from(e.target.files || []))}/>
          </div>

          <form className="input-section" ref={formRef} onSubmit={handleAdd}>
            <label>Punto vendita / Servizio</label>
            <input value={nuovaSpesa.puntoVendita} onChange={e => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })} required/>
            <label>Quantità</label>
            <input type="number" min="1" value={nuovaSpesa.quantita} onChange={e => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })} required/>
            <label>Dettaglio della spesa</label>
            <textarea value={nuovaSpesa.dettaglio} onChange={e => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })} required/>
            <label>Data di acquisto</label>
            <input type="date" value={nuovaSpesa.spentAt} onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })} required/>
            <label>Prezzo totale (€)</label>
            <input type="number" step="0.01" value={nuovaSpesa.prezzoTotale} onChange={e => setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })} required/>
            <label>Metodo di pagamento</label>
            <select value={nuovaSpesa.paymentMethod} onChange={e => setNuovaSpesa({ ...nuovaSpesa, paymentMethod: e.target.value })}>
              <option value="cash">Contante (tasca)</option>
              <option value="card">Carta</option>
              <option value="bank">Bonifico/Altro</option>
            </select>
            {nuovaSpesa.paymentMethod === 'card' && (
              <>
                <label>Nome carta (opz.)</label>
                <input value={nuovaSpesa.cardLabel} onChange={e => setNuovaSpesa({ ...nuovaSpesa, cardLabel: e.target.value })} placeholder="Visa, Revolut…"/>
              </>
            )}
            <button className="btn-manuale">Aggiungi</button>
          </form>

          <div className="table-container">
            {loading ? <p>Caricamento…</p> : (
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
                  {spese.map(r => {
                    const m = r.description.match(/^\[(.*?)\]\s*(.*)$/) || []
                    return (
                      <tr key={r.id}>
                        <td>{m[1] || '-'}</td>
                        <td>{m[2] || r.description}</td>
                        <td>{new Date(r.spent_at).toLocaleDateString()}</td>
                        <td>{r.qty}</td>
                        <td>{r.amount.toFixed(2)}</td>
                        <td>{renderPayBadge(r)}</td>
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
          <Link href="/home"><a className="btn-vocale">🏠 Home</a></Link>
        </div>
      </div>
    </>
  )
}

export default withAuth(SpeseCasa)
