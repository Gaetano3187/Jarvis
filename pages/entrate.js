// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

function Entrate() {
  // ─────────────────────────────────────────────── Stati e refs
  const [entrate, setEntrate] = useState([])
  const [spese, setSpese] = useState([])
  const [pocket, setPocket] = useState({ current_amount: 0 })
  const [pocketLog, setPocketLog] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recBusy, setRecBusy] = useState(false)

  const [nuovaEntrata, setNuovaEntrata] = useState({
    source: '',
    description: '',
    amount: '',
    receivedAt: '',
    isSalary: false,
  })

  const [nuoviContanti, setNuoviContanti] = useState('') // input "soldi in tasca"

  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])

  // ─────────────────────────────────────────────── Mount
  useEffect(() => {
    refreshAll()
  }, [])

  async function refreshAll() {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      const [inc, fin, pc, pcl] = await Promise.all([
        supabase
          .from('incomes')
          .select('id, description, source, amount, received_at, is_salary')
          .order('received_at', { ascending: false }),
        supabase
          .from('finances')
          .select('id, description, amount, spent_at')
          .order('spent_at', { ascending: false }),
        supabase
          .from('pocket_cash')
          .select('current_amount')
          .single(),
        supabase
          .from('pocket_cash_log')
          .select('id, change_amount, balance_after, reason, happened_at')
          .order('happened_at', { ascending: false }),
      ])

      if (inc.error) throw inc.error
      if (fin.error) throw fin.error
      if (pc.error && pc.error.code !== 'PGRST116') throw pc.error // PGRST116 = no rows
      if (pcl.error) throw pcl.error

      setEntrate(inc.data || [])
      setSpese(fin.data || [])
      setPocket(pc.data || { current_amount: 0 })
      setPocketLog(pcl.data || [])
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────── Helpers calcolo saldo
  function getCurrentSalaryCycle() {
    // ultimo stipendio <= oggi
    const today = new Date().toISOString().slice(0, 10)
    const stipendi = (entrate || [])
      .filter(e => e.is_salary)
      .sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
    const currentSalary = stipendi.find(s => s.received_at <= today)
    return currentSalary || null
  }

  function sumAmounts(rows, field = 'amount') {
    return (rows || []).reduce((t, r) => t + Number(r?.[field] || 0), 0)
  }

  function computeBalances() {
    const salary = getCurrentSalaryCycle()
    if (!salary) {
      return {
        saldoMese: 0,
        spesePeriodo: 0,
        rimanenzePregresse: sumAmounts(entrate) - sumAmounts(spese),
        anchorDate: null,
        salaryAmount: 0,
      }
    }
    const start = salary.received_at // giorno stipendio
    const today = new Date().toISOString().slice(0, 10)

    const spesePeriodo = spese.filter(
      s => s.spent_at >= start && s.spent_at <= today
    )
    const spesePrima = spese.filter(s => s.spent_at < start)
    const entratePrima = entrate.filter(i => i.received_at < start)

    const rimanenzePregresse =
      sumAmounts(entratePrima) - sumAmounts(spesePrima)

    const saldoMese =
      Number(salary.amount || 0) - sumAmounts(spesePeriodo) + rimanenzePregresse

    return {
      saldoMese,
      spesePeriodo: sumAmounts(spesePeriodo),
      rimanenzePregresse,
      anchorDate: start,
      salaryAmount: Number(salary.amount || 0),
    }
  }

  const {
    saldoMese,
    spesePeriodo,
    rimanenzePregresse,
    anchorDate,
    salaryAmount,
  } = computeBalances()

  // ─────────────────────────────────────────────── Aggiungi entrata (manuale)
  const handleAddIncome = async e => {
    e.preventDefault()
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      const row = {
        user_id: user.id,
        description: nuovaEntrata.description || (nuovaEntrata.isSalary ? 'Stipendio' : 'Entrata'),
        source: nuovaEntrata.source || (nuovaEntrata.isSalary ? 'stipendio' : 'varia'),
        amount: Number(nuovaEntrata.amount) || 0,
        received_at: nuovaEntrata.receivedAt || new Date().toISOString().slice(0, 10),
        is_salary: !!nuovaEntrata.isSalary,
      }
      const { error } = await supabase.from('incomes').insert(row)
      if (error) throw error

      setNuovaEntrata({
        source: '',
        description: '',
        amount: '',
        receivedAt: '',
        isSalary: false,
      })
      await refreshAll()
    } catch (e) {
      setError(e.message || String(e))
    }
  }

  // ─────────────────────────────────────────────── Soldi in tasca: set iniziale
  const handleSetPocketCash = async e => {
    e.preventDefault()
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      const startAmount = Number(nuoviContanti) || 0

      // upsert pocket_cash
      const { data: pcData, error: pcErr } = await supabase
        .from('pocket_cash')
        .upsert({ user_id: user.id, current_amount: startAmount }, { onConflict: 'user_id' })
        .select()
        .single()
      if (pcErr) throw pcErr

      // log "inizializzazione"
      const { error: logErr } = await supabase.from('pocket_cash_log').insert({
        user_id: user.id,
        change_amount: startAmount,              // positivo
        balance_after: pcData.current_amount,
        reason: 'Inizializzazione soldi in tasca',
      })
      if (logErr) throw logErr

      setNuoviContanti('')
      await refreshAll()
    } catch (e) {
      setError(e.message || String(e))
    }
  }

  // ─────────────────────────────────────────────── OCR / VOCE (riusiamo i tuoi endpoint)
  const handleOCR = async files => {
    if (!files?.length) return
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('images', f))
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text } = await res.json()
      await parseAssistantToIncome(buildSystemPrompt('ocr', text))
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
      await parseAssistantToIncome(buildSystemPrompt('voice', text))
    } catch (err) {
      console.error(err)
      setError('STT fallito')
    } finally {
      setRecBusy(false)
    }
  }

  function buildSystemPrompt(source, userText) {
    const schema = `
Rispondi SOLO con JSON:
\`\`\`json
{
  "type":"income",
  "items":[
    {
      "source":"stipendio | provvigione | rimborso | ...",
      "description":"testo libero",
      "amount": 123.45,
      "receivedAt": "YYYY-MM-DD",
      "isSalary": false
    }
  ]
}
\`\`\`
`
    if (source === 'ocr') {
      return `
Sei Jarvis. Dal testo OCR estrai tutte le ENTRATE (non le spese).
Se individui uno stipendio, imposta "isSalary": true. La data è quella riportata nel documento.
${schema}

TESTO_OCR:
${userText}
`
    }
    return `
Trascrizione vocale dell'ENTRATA. Estrai i campi secondo lo schema.
Se è lo stipendio del mese, usa "isSalary": true. Se manca la data, usa oggi.
${schema}

TESTO_VOCE:
${userText}
`
  }

  async function parseAssistantToIncome(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const { answer, error: apiErr } = await res.json()
    if (!res.ok || apiErr) throw new Error(apiErr || res.status)

    const data = JSON.parse(answer)
    if (data.type !== 'income' || !Array.isArray(data.items) || !data.items.length) {
      throw new Error('Assistant response invalid')
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const rows = data.items.map(it => ({
      user_id: user.id,
      description: it.description || it.source || 'Entrata',
      source: it.source || 'varia',
      amount: Number(it.amount) || 0,
      received_at: it.receivedAt || new Date().toISOString().slice(0,10),
      is_salary: !!it.isSalary,
    }))
    const { error: dbErr } = await supabase.from('incomes').insert(rows)
    if (dbErr) throw dbErr
    await refreshAll()
  }

  // ─────────────────────────────────────────────── Render
  return (
    <>
      <Head><title>Entrate & Saldo</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">💰 Entrate & Saldo</h2>

          {/* Pulsanti come le altre pagine */}
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

          {/* 1) TABELLA ENTRATE + RIMANENZE/PERDITE PREGRESSE */}
          <h3 style={{margin:'0 0 .5rem'}}>Entrate</h3>
          <form className="input-section" onSubmit={handleAddIncome}>
            <label>Fonte</label>
            <input
              value={nuovaEntrata.source}
              onChange={e => setNuovaEntrata({ ...nuovaEntrata, source: e.target.value })}
              placeholder="stipendio, provvigione…"
            />
            <label>Descrizione</label>
            <input
              value={nuovaEntrata.description}
              onChange={e => setNuovaEntrata({ ...nuovaEntrata, description: e.target.value })}
              placeholder="Entrata di giugno"
              required
            />
            <label>Importo (€)</label>
            <input
              type="number"
              step="0.01"
              value={nuovaEntrata.amount}
              onChange={e => setNuovaEntrata({ ...nuovaEntrata, amount: e.target.value })}
              required
            />
            <label>Data</label>
            <input
              type="date"
              value={nuovaEntrata.receivedAt}
              onChange={e => setNuovaEntrata({ ...nuovaEntrata, receivedAt: e.target.value })}
              required
            />
            <label style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
              <input
                type="checkbox"
                checked={nuovaEntrata.isSalary}
                onChange={e => setNuovaEntrata({ ...nuovaEntrata, isSalary: e.target.checked })}
              />
              Questa è lo stipendio (inizio ciclo)
            </label>
            <button className="btn-manuale">Aggiungi entrata</button>
          </form>

          {loading ? <p>Caricamento…</p> : (
            <table className="custom-table" style={{marginBottom:'1rem'}}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Fonte</th>
                  <th>Descrizione</th>
                  <th>Importo €</th>
                  <th>Stipendio</th>
                </tr>
              </thead>
              <tbody>
                {entrate.map(e => (
                  <tr key={e.id}>
                    <td>{new Date(e.received_at).toLocaleDateString()}</td>
                    <td>{e.source || '-'}</td>
                    <td>{e.description}</td>
                    <td>{Number(e.amount).toFixed(2)}</td>
                    <td>{e.is_salary ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="total-box">
            Rimanenze/Perdite pregresse: <b>{rimanenzePregresse.toFixed(2)} €</b>
          </div>

          {/* 2) INPUT "SOLDI IN TASCA" */}
          <h3 style={{margin:'1.5rem 0 .5rem'}}>💼 Soldi in tasca</h3>
          <form className="input-section" onSubmit={handleSetPocketCash}>
            <label>Imposta/aggiorna cifra iniziale (€)</label>
            <input
              type="number"
              step="0.01"
              value={nuoviContanti}
              onChange={e => setNuoviContanti(e.target.value)}
              placeholder="es. 200"
              required
            />
            <button className="btn-manuale">Salva</button>
          </form>

          {/* 3) LOG MOVIMENTI SOLDI IN TASCA */}
          <table className="custom-table
