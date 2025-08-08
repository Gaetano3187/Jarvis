// pages/entrate.js
import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

/**
 * Impostazione giorno di accredito stipendio (1..28).
 * Esempio: 10 = il mese “contabile” va dal 10 (incluso) al 9 del mese successivo.
 * Puoi trasformarlo in un campo salvato per utente, per ora lo lasciamo costante.
 */
const PAYDAY_DAY = 10

function Entrate() {
  // ─────────────────────────────────────────────── Stati
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Entrate
  const [incomes, setIncomes] = useState([])
  const [newIncome, setNewIncome] = useState({
    source: 'Stipendio',
    description: '',
    amount: '',
    receivedAt: '',
  })

  // Carryover (rimanenze/perdite)
  const [carryover, setCarryover] = useState(null) // importo unico per il mese corrente
  const [newCarry, setNewCarry] = useState({ amount: '', note: '' })

  // Soldi in tasca (movimenti)
  const [pocket, setPocket] = useState([])
  const [pocketTopUp, setPocketTopUp] = useState('') // ricarica manuale rapida

  // Spese del mese (per calcolo saldo)
  const [monthExpenses, setMonthExpenses] = useState(0)

  // OCR / VOCE
  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])
  const [recBusy, setRecBusy] = useState(false)

  // Periodo corrente determinato da PAYDAY_DAY
  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY)

  // ─────────────────────────────────────────────── Load dati
  useEffect(() => {
    loadAll()
  }, [monthKey])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      // 1) Entrate nel periodo
      const { data: inc, error: e1 } = await supabase
        .from('incomes')
        .select('*')
        .eq('user_id', user.id)
        .gte('received_at', startDate)
        .lte('received_at', endDate)
        .order('received_at', { ascending: false })
      if (e1) throw e1
      setIncomes(inc || [])

      // 2) Carryover per il mese corrente
      const { data: co, error: e2 } = await supabase
        .from('carryovers')
        .select('*')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle()
      if (e2 && e2.code !== 'PGRST116') throw e2
      setCarryover(co || null)

      // 3) Movimenti soldi in tasca (ultimo 60 giorni per non sovraccaricare)
      const since = new Date()
      since.setMonth(since.getMonth() - 2)
      const { data: pc, error: e3 } = await supabase
        .from('pocket_cash')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
      if (e3) throw e3
      setPocket(pc || [])

      // 4) Spese del periodo (finances)
      const { data: exp, error: e4 } = await supabase
        .from('finances')
        .select('amount, spent_at')
        .eq('user_id', user.id)
        .gte('spent_at', startDate)
        .lte('spent_at', endDate)
      if (e4) throw e4
      const totalExp = (exp || []).reduce((t, r) => t + Number(r.amount || 0), 0)
      setMonthExpenses(totalExp)
    } catch (err) {
      console.error(err)
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────── Aggiungi Entrata (manuale)
  async function handleAddIncome(e) {
    e.preventDefault()
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      const row = {
        user_id: user.id,
        source: newIncome.source || 'Entrata',
        description: newIncome.description || newIncome.source || 'Entrata',
        amount: Number(newIncome.amount) || 0,
        received_at: newIncome.receivedAt || new Date().toISOString().slice(0,10),
      }
      const { error: errInc } = await supabase.from('incomes').insert(row)
      if (errInc) throw errInc

      setNewIncome({ source: 'Stipendio', description: '', amount: '', receivedAt: '' })
      await loadAll()
    } catch (err) {
      setError(err.message || String(err))
    }
  }

  // ─────────────────────────────────────────────── Cancella Entrata
  async function handleDeleteIncome(id) {
    const { error: e } = await supabase.from('incomes').delete().eq('id', id)
    if (e) return setError(e.message)
    setIncomes(incomes.filter(i => i.id !== id))
  }

  // ─────────────────────────────────────────────── Aggiungi/aggiorna Carryover del mese
  async function handleSaveCarryover(e) {
    e.preventDefault()
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')
      const payload = {
        user_id: user.id,
        month_key: monthKey,
        amount: Number(newCarry.amount) || 0,
        note: newCarry.note || null,
      }
      if (carryover?.id) {
        const { error } = await supabase.from('carryovers').update(payload).eq('id', carryover.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('carryovers').insert(payload)
        if (error) throw error
      }
      setNewCarry({ amount: '', note: '' })
      await loadAll()
    } catch (err) {
      setError(err.message || String(err))
    }
  }

  // ─────────────────────────────────────────────── Ricarica “Soldi in tasca”
  async function handleTopUpPocket(e) {
    e.preventDefault()
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')
      const delta = Number(pocketTopUp)
      if (!delta) return
      const { error } = await supabase.from('pocket_cash').insert({
        user_id: user.id,
        note: 'Ricarica manuale',
        delta,
      })
      if (error) throw error
      setPocketTopUp('')
      await loadAll()
    } catch (err) {
      setError(err.message || String(err))
    }
  }

  // ─────────────────────────────────────────────── OCR multiplo (Entrate)
  const handleOCR = async (files) => {
    if (!files?.length) return
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('images', f))
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text } = await res.json()
      await parseAssistant(buildIncomePrompt('ocr', text))
    } catch (err) {
      console.error(err)
      setError('OCR fallito')
    }
  }

  // ─────────────────────────────────────────────── Registrazione audio (Entrate)
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
      await parseAssistant(buildIncomePrompt('voice', text))
    } catch (err) {
      console.error(err)
      setError('STT fallito')
    } finally {
      setRecBusy(false)
    }
  }

  // ─────────────────────────────────────────────── Prompt & parsing (Entrate)
  function buildIncomePrompt(source, userText) {
    if (source === 'ocr') {
      return `
Sei Jarvis. Dal testo OCR qui sotto estrai **entrate economiche** (stipendi, provvigioni, rimborsi).
Per ogni entrata genera:
- source: string (es. "Stipendio", "Provvigioni", "Bonus")
- description: string breve (es. "Stipendio ACME Srl")
- amount: number (positivo, in euro)
- receivedAt: "YYYY-MM-DD"

Rispondi **solo** con JSON:
\`\`\`json
{"type":"income","items":[{"source":"Stipendio","description":"Stipendio ACME","amount":1500,"receivedAt":"2025-06-10"}]}
\`\`\`

TESTO:
${userText}
`
    }
    return `
**Trascrizione vocale**: estrai ENTRATE nel formato JSON seguente.
\`\`\`json
{"type":"income","items":[{"source":"Provvigioni","description":"Provvigioni maggio","amount":250,"receivedAt":"${new Date().toISOString().slice(0,10)}"}]}
\`\`\`

TESTO:
${userText}
`
  }

  async function parseAssistant(prompt) {
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const rows = data.items.map(it => ({
      user_id: user.id,
      source: it.source || 'Entrata',
      description: it.description || it.source || 'Entrata',
      amount: Number(it.amount) || 0,
      received_at: it.receivedAt || new Date().toISOString().slice(0,10),
    }))

    const { error } = await supabase.from('incomes').insert(rows)
    if (error) throw error
    await loadAll()
  }

  // ─────────────────────────────────────────────── Calcoli
  const totalIncomes = incomes.reduce((t, r) => t + Number(r.amount || 0), 0)
  const carryAmount = Number(carryover?.amount || 0)
  const saldoMese = totalIncomes + carryAmount - monthExpenses

  const pocketBalance = pocket.reduce((t, r) => t + Number(r.delta || 0), 0)

  // ─────────────────────────────────────────────── UI
  return (
    <>
      <Head><title>Entrate & Saldi</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">💶 Entrate & Saldi</h2>
          <p style={{ opacity: .85, marginTop: -8 }}>
            Periodo corrente: <b>{startDate}</b> → <b>{endDate}</b> (payday giorno {PAYDAY_DAY})
          </p>

          {/* Pulsanti OCR / Voce per ENTRATE */}
          <div className="table-buttons">
            <button className="btn-vocale" onClick={toggleRec}>
              {recBusy ? '⏹ Stop' : '🎙 Voce'}
            </button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>
              📷 OCR Entrate
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

          {/* TABELLA 1 — ENTRATE */}
          <h3 style={{ marginTop: '1rem' }}>1) Entrate del periodo</h3>
          <form className="input-section" onSubmit={handleAddIncome}>
            <label>Fonte</label>
            <input
              value={newIncome.source}
              onChange={e => setNewIncome
