// pages/varie.js
import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'

async function askAssistant(prompt) {
  const res = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const { answer, error } = await res.json()
  if (error) throw new Error(error)
  return answer
}

function Varie() {
  const [rows, setRows]              = useState([])
  const [form, setForm]              = useState({ store: '', purchase_date: '', price_total: '' })
  const [err, setErr]                = useState(null)
  const [isRec, setIsRec]            = useState(false)
  const [loadingVoice, setLoadVoice] = useState(false)
  const [loadingOCR, setLoadOCR]     = useState(false)
  const mediaRef  = useRef(null)
  const chunksRef = useRef([])
  const fileRef   = useRef(null)

  useEffect(() => { fetchRows() }, [])

  async function fetchRows() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('jarvis_varie')
      .select('id, store, purchase_date, price_total')
      .eq('user_id', user.id)
      .order('purchase_date', { ascending: false })
    if (error) setErr(error.message)
    else setRows(data ?? [])
  }

  async function onSubmit(e) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('jarvis_varie').insert([{
      user_id: user.id,
      store: form.store,
      purchase_date: form.purchase_date || new Date().toISOString().slice(0, 10),
      price_total: parseFloat(form.price_total),
    }])
    if (error) setErr(error.message)
    else { setForm({ store: '', purchase_date: '', price_total: '' }); fetchRows() }
  }

  async function onDelete(id) {
    const { error } = await supabase.from('jarvis_varie').delete().eq('id', id)
    if (error) setErr(error.message)
    else setRows(rows.filter(r => r.id !== id))
  }

  async function parseAndInsert(text) {
    setErr(null)
    try {
      const sys = 'Estrai spese varie da testo/OCR. Rispondi SOLO con JSON array: [{store, purchase_date (YYYY-MM-DD), price_total (numero)}].'
      const answer = await askAssistant(sys + '\n\nTESTO:\n' + text)
      const clean = answer.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from('jarvis_varie').insert(
        items.map(i => ({
          user_id: user.id,
          store: i.store ?? 'Generico',
          purchase_date: i.purchase_date ?? new Date().toISOString().slice(0, 10),
          price_total: parseFloat(i.price_total ?? 0),
        }))
      )
      if (error) setErr(error.message)
      else fetchRows()
    } catch (e) { setErr('Assistant: ' + e.message) }
  }

  async function handleOCR(file) {
    if (!file) return
    setLoadOCR(true)
    const fd = new FormData(); fd.append('image', file)
    try {
      const r = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text } = await r.json()
      await parseAndInsert(text)
    } catch (e) { setErr(e.message) }
    finally { setLoadOCR(false) }
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRef.current = new MediaRecorder(stream)
      chunksRef.current = []
      mediaRef.current.ondataavailable = e => e.data.size && chunksRef.current.push(e.data)
      mediaRef.current.onstop = async () => {
        setLoadVoice(true)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const fd = new FormData(); fd.append('audio', blob, 'audio.webm')
        try {
          const r = await fetch('/api/stt', { method: 'POST', body: fd })
          const { text } = await r.json()
          await parseAndInsert(text)
        } catch (e) { setErr(e.message) }
        finally { setLoadVoice(false) }
      }
      mediaRef.current.start(); setIsRec(true)
    } catch { setErr('Microfono non disponibile') }
  }
  function stopRec() { mediaRef.current?.stop(); setIsRec(false) }

  const totale = rows.reduce((s, r) => s + Number(r.price_total || 0), 0)

  return (
    <>
      <Head><title>Spese Varie – Jarvis</title></Head>
      <div className="page-wrapper">
        <div className="table-container">
          <h2>🧰 Spese Varie</h2>
          <div className="table-buttons">
            <button className="btn-vocale" onClick={isRec ? stopRec : startRec}>
              {isRec ? '⏹ Stop' : '🎙 Voce'}
            </button>
            <button className="btn-ocr" onClick={() => fileRef.current?.click()}>📷 OCR</button>
          </div>
          <form className="input-section" onSubmit={onSubmit}>
            <label>Punto vendita / Servizio</label>
            <input value={form.store} onChange={e => setForm({ ...form, store: e.target.value })} placeholder="Es. Farmacia, Amazon…" required />
            <label>Data acquisto</label>
            <input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
            <label>Prezzo totale (€)</label>
            <input type="number" step="0.01" value={form.price_total} onChange={e => setForm({ ...form, price_total: e.target.value })} placeholder="30.00" required />
            <button type="submit" className="btn-manuale">Aggiungi</button>
          </form>
          <table className="custom-table">
            <thead><tr><th>Punto vendita</th><th>Data</th><th>Prezzo €</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.store ?? '-'}</td>
                  <td>{r.purchase_date ?? '-'}</td>
                  <td>{Number(r.price_total).toFixed(2)}</td>
                  <td><button onClick={() => onDelete(r.id)}>🗑</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} style={{ opacity: .5 }}>Nessuna spesa</td></tr>}
            </tbody>
          </table>
          <div className="total-box">Totale: € {totale.toFixed(2)}</div>
          {(loadingVoice || loadingOCR) && <p style={{ color: '#00e4ff' }}>Elaborazione…</p>}
          {err && <p style={{ color: 'red' }}>{err}</p>}
        </div>
        <Link href="/finanze" className="btn-back">← Finanze</Link>
      </div>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => handleOCR(e.target.files?.[0])} />
      <style jsx global>{`
        .page-wrapper{width:100%;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:5rem 1rem 3rem;color:#e6e7eb;font-family:Inter,sans-serif}
        .table-container{overflow-x:auto;background:rgba(0,0,0,.6);border-radius:1rem;padding:1.5rem;box-shadow:0 6px 16px rgba(0,0,0,.3);width:100%;max-width:900px;box-sizing:border-box}
        .table-container h2{font-size:1.5rem;margin-bottom:1.25rem;color:#fff}
        table.custom-table{width:100%;border-collapse:collapse;font-size:1rem;color:#fff}
        table.custom-table thead{background:#1f2937}
        table.custom-table th,table.custom-table td{padding:.75rem 1rem;text-align:left;border-bottom:1px solid rgba(255,255,255,.1)}
        table.custom-table tbody tr:hover{background:rgba(255,255,255,.05)}
        table.custom-table tbody button{background:none;border:none;color:#fff;cursor:pointer;font-size:1.1rem}
        .total-box{margin-top:1rem;background:rgba(34,197,94,.8);color:#fff;padding:1rem;border-radius:.5rem;font-size:1.25rem;font-weight:600;text-align:right}
        .table-buttons{display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap}
        .table-buttons button{padding:.75rem 1.25rem;font-size:1rem;border-radius:.5rem;border:none;font-weight:600;cursor:pointer;transition:opacity .3s}
        .btn-manuale{background:#22c55e;color:#fff;border:none;padding:.6rem 1.25rem;border-radius:.5rem;font-weight:600;cursor:pointer}
        .btn-vocale{background:#10b981;color:#fff}.btn-ocr{background:#f43f5e;color:#fff}
        .table-buttons button:hover,.btn-manuale:hover{opacity:.85}
        .input-section{background:rgba(255,255,255,.08);padding:1rem;margin-bottom:1.5rem;border-radius:.5rem;display:flex;flex-direction:column;gap:.75rem}
        .input-section label{font-weight:600;font-size:.95rem;color:#fff}
        .input-section input{padding:.6rem;border-radius:.5rem;border:none;font-size:1rem;width:100%;background:#1f2937;color:#fff}
        .btn-back{margin-top:1.5rem;color:#00e4ff;text-decoration:none;font-size:.95rem}
      `}</style>
    </>
  )
}

export default withAuth(Varie)

export async function getServerSideProps() {
  return { props: {} }
}
