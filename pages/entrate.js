import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

/** Giorno di accredito stipendio (1..28) */
const PAYDAY_DAY = 10

// ───────────────────────────────────────────────────────── helpers
function computeCurrentPayPeriod(today, paydayDay) {
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()

  const thisPayday = new Date(y, m, paydayDay)
  let start, end

  if (d >= paydayDay) {
    start = thisPayday
    end = new Date(y, m + 1, paydayDay - 1)
  } else {
    start = new Date(y, m - 1, paydayDay)
    end = new Date(y, m, paydayDay - 1)
  }

  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)
  const monthKey = end.toISOString().slice(0, 7)
  return { startDate, endDate, monthKey }
}

/** Se manca il carryover per il mese corrente, lo crea come residuo del mese precedente (saldo base) */
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  // Già presente?
  const { data: existing, error: e0 } = await supabase
    .from('carryovers')
    .select('id')
    .eq('user_id', userId)
    .eq('month_key', monthKeyCurrent)
    .maybeSingle()
  if (e0 && e0.code !== 'PGRST116') throw e0
  if (existing) return

  // Periodo precedente
  const [y, m] = monthKeyCurrent.split('-').map(Number)
  const prevEnd   = new Date(y, m - 1, 0) // ultimo giorno mese precedente
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1)
  const prevStartISO = prevStart.toISOString().slice(0,10)
  const prevEndISO   = prevEnd.toISOString().slice(0,10)
  const prevKey      = prevEnd.toISOString().slice(0,7)

  // Entrate mese precedente
  const { data: incPrev, error: e1 } = await supabase
    .from('incomes')
    .select('amount')
    .eq('user_id', userId)
    .gte('received_at', prevStartISO)
    .lte('received_at', prevEndISO)
  if (e1) throw e1

  // Spese mese precedente
  const { data: expPrev, error: e2 } = await supabase
    .from('finances')
    .select('amount')
    .eq('user_id', userId)
    .gte('spent_at', prevStartISO)
    .lte('spent_at', prevEndISO)
  if (e2) throw e2

  // Carryover mese precedente
  const { data: coPrev, error: e3 } = await supabase
    .from('carryovers')
    .select('amount')
    .eq('user_id', userId)
    .eq('month_key', prevKey)
    .maybeSingle()
  if (e3 && e3.code !== 'PGRST116') throw e3

  const totalInc = (incPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0)
  const totalExp = (expPrev || []).reduce((t, r) => t + Number(r.amount || 0), 0)
  const prevCarry = Number(coPrev?.amount || 0)

  // saldo base mese precedente (come richiesto: senza detrarre contanti in tasca)
  const saldoPrevBase = totalInc + prevCarry - totalExp

  const { error: e4 } = await supabase.from('carryovers').insert({
    user_id: userId,
    month_key: monthKeyCurrent,
    amount: Number(saldoPrevBase.toFixed(2)),
    note: 'Auto-carryover da mese precedente',
  })
  if (e4) throw e4
}

// ───────────────────────────────────────────────────────── component
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

  // Carryover
  const [carryover, setCarryover] = useState(null)
  const [newCarry, setNewCarry] = useState({ amount: '', note: '' })

  // Soldi in tasca
  const [pocket, setPocket] = useState([])
  const [pocketTopUp, setPocketTopUp] = useState('')
  const [onlyPocketExpenses, setOnlyPocketExpenses] = useState(true) // filtro default

  // Spese del periodo (per saldo mese)
  const [monthExpenses, setMonthExpenses] = useState(0)

  // OCR / VOCE
  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])
  const [recBusy, setRecBusy] = useState(false)

  // Periodo in base al payday
  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY)

  // ─────────────────────────────────────────────── Load dati
  useEffect(() => { loadAll() }, [monthKey])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      // ensure carryover corrente se mancante
      await ensureCarryoverAuto(user.id, monthKey)

      // Entrate nel periodo
      const { data: inc, error: e1 } = await supabase
        .from('incomes')
        .select('*')
        .eq('user_id', user.id)
        .gte('received_at', startDate)
        .lte('received_at', endDate)
        .order('received_at', { ascending: false })
      if (e1) throw e1
      setIncomes(inc || [])

      // Carryover del mese corrente
      const { data: co, error: e2 } = await supabase
        .from('carryovers')
        .select('*')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle()
      if (e2 && e2.code !== 'PGRST116') throw e2
      setCarryover(co || null)

      // SOLDI IN TASCA — ultimi 2 mesi (usa moved_at)
      const since = new Date()
      since.setMonth(since.getMonth() - 2)
      const { data: pc, error: e3 } = await supabase
        .from('pocket_cash')
        .select(`
          id, user_id, created_at, moved_at, note, delta, amount, direction,
          finances_fid:finances!pocket_cash_finance_id_fkey (id, spent_at, description),
          finances_lid:finances!pocket_cash_link_finance_id_fkey (id, spent_at, description)
        `)
        .eq('user_id', user.id)
        .gte('moved_at', since.toISOString())
        .order('moved_at', { ascending: false })
      if (e3) throw e3

      const normalize = v => (Array.isArray(v) ? v[0] : v) || null
      const pocketView = (pc || [])
        .map(row => {
          const finA = normalize(row.finances_fid)
          const finB = normalize(row.finances_lid)
          const fin = finA || finB

          // importo effettivo: delta se presente, altrimenti amount± con direction
          const eff = (row.delta != null)
            ? Number(row.delta || 0)
            : (row.amount != null ? (row.direction === 'in' ? +1 : -1) * Number(row.amount || 0) : 0)

          const iso = (fin?.spent_at || row.moved_at || row.created_at || '').slice(0, 10)
          const dateStr = iso ? new Date(iso).toLocaleDateString() : '-'

          let label
          if (fin?.description) {
            const store = fin.description.match(/^\[(.*?)\]/)?.[1] || 'N/D'
            label = `Punto vendita: ${store} — spesa del ${dateStr}`
          } else {
            const dirLabel = eff >= 0 ? 'entrata cassa' : 'uscita cassa'
            label = `${dirLabel}${row.note ? ` — ${row.note}` : ''}`
          }

          return { id: row.id, dateISO: iso, label, amount: eff, hasFinance: !!fin }
        })
        .filter(v => Number(v.amount) !== 0)

      setPocket(pocketView)

      // Spese del periodo
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

  // ─────────────────────────────────────────────── Prompts Assistant
  function buildPocketPrompt(userText) {
    // Riconosce frasi tipo "ho prelevato 200 euro e li ho messi in tasca"
    return [
      'Sei Jarvis. Capisci se il testo indica un PRELIEVO o RICARICA di contante "in tasca".',
      'Se sì, rispondi SOLO con JSON:',
      '{"type":"pocket_topup","items":[{"amount":200.00,"note":"prelievo contante da stipendio","date":"YYYY-MM-DD"}]}',
      'Se non è un prelievo, restituisci {"type":"none"}.',
      '',
      'Testo:',
      userText
    ].join('\n')
  }

  function buildIncomePrompt(userText) {
    const today = new Date().toISOString().slice(0, 10)
    return [
      'Sei Jarvis. Estrai ENTRATE economiche (stipendi, provvigioni, rimborsi).',
      'Rispondi SOLO con JSON:',
      `{"type":"income","items":[{"source":"Stipendio","description":"Stipendio ACME","amount":1500,"receivedAt":"${today}"}]}`,
      '',
      'Testo:',
      userText
    ].join('\n')
  }

  async function callAssistant(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const { answer, error: apiErr } = await res.json()
    if (!res.ok || apiErr) throw new Error(apiErr || res.status)
    return JSON.parse(answer)
  }

  async function parseAssistantForPocket(userText) {
    const data = await callAssistant(buildPocketPrompt(userText))
    if (data.type !== 'pocket_topup' || !Array.isArray(data.items) || !data.items.length) return false
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const rows = data.items.map(it => ({
      user_id: user.id,
      note: it.note || 'Ricarica manuale (OCR/voce)',
      delta: Number(it.amount) || 0,
      moved_at: it.date || new Date().toISOString(), // ← usa moved_at
    }))
    const { error } = await supabase.from('pocket_cash').insert(rows)
    if (error) throw error
    return true
  }

  async function parseAssistantForIncome(userText) {
    const data = await callAssistant(buildIncomePrompt(userText))
    if (data.type !== 'income' || !Array.isArray(data.items) || !data.items.length) return false
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const rows = data.items.map(it => ({
      user_id: user.id,
      source: it.source || 'Entrata',
      description: it.description || it.source || 'Entrata',
      amount: Number(it.amount) || 0,
      received_at: it.receivedAt || new Date().toISOString().slice(0, 10),
    }))
    const { error } = await supabase.from('incomes').insert(rows)
    if (error) throw error
    return true
  }

  // ─────────────────────────────────────────────── OCR / VOCE handlers
  async function handleOCR(files) {
    if (!files?.length) return
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('images', f))
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text } = await res.json()

      // 1) prova come prelievo "in tasca"
      const handledPocket = await parseAssistantForPocket(text).catch(() => false)
      if (handledPocket) return loadAll()

      // 2) fallback: prova come Entrata
      const handledIncome = await parseAssistantForIncome(text).catch(() => false)
      if (handledIncome) return loadAll()

      setError('Nessun dato riconosciuto da OCR')
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
      mediaRecRef.current.ondataavailable = e => { if (e.data.size) recordedChunks.current.push(e.data) }
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
      const res = await fetch('/api/stt', { method: 'POST', body: fd })
      const { text } = await res.json()

      // 1) prova "pocket_topup"
      const handledPocket = await parseAssistantForPocket(text).catch(() => false)
      if (handledPocket) {
        setRecBusy(false)
        return loadAll()
      }

      // 2) fallback: Entrata
      const handledIncome = await parseAssistantForIncome(text).catch(() => false)
      if (handledIncome) {
        setRecBusy(false)
        return loadAll()
      }

      setError('Nessun dato riconosciuto dalla voce')
    } catch (err) {
      console.error(err)
      setError('STT fallito')
    } finally {
      setRecBusy(false)
    }
  }

  // ─────────────────────────────────────────────── CRUD
  async function handleAddIncome(e) {
    e.preventDefault()
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')
      await supabase.from('incomes').insert({
        user_id: user.id,
        source: newIncome.source || 'Entrata',
        description: newIncome.description || newIncome.source || 'Entrata',
        amount: Number(newIncome.amount) || 0,
        received_at: newIncome.receivedAt || new Date().toISOString().slice(0, 10),
      })
      setNewIncome({ source: 'Stipendio', description: '', amount: '', receivedAt: '' })
      await loadAll()
    } catch (err) { setError(err.message || String(err)) }
  }

  async function handleDeleteIncome(id) {
    const { error: e } = await supabase.from('incomes').delete().eq('id', id)
    if (e) return setError(e.message)
    setIncomes(incomes.filter(i => i.id !== id))
  }

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
    } catch (err) { setError(err.message || String(err)) }
  }

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
        moved_at: new Date().toISOString(), // ← usa moved_at
      })
      if (error) throw error
      setPocketTopUp('')
      await loadAll()
    } catch (err) { setError(err.message || String(err)) }
  }

  async function handleClearPocket() {
    if (!confirm('Azzerare TUTTI i movimenti di “Soldi in tasca”?')) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')
      const { error } = await supabase.from('pocket_cash').delete().eq('user_id', user.id)
      if (error) throw error
      await loadAll()
    } catch (err) { setError(err.message || String(err)) }
  }

  // ─────────────────────────────────────────────── Calcoli
  const totalIncomes  = incomes.reduce((t, r) => t + Number(r.amount || 0), 0)
  const carryAmount   = Number(carryover?.amount || 0)
  const saldoMese     = totalIncomes + carryAmount - monthExpenses
  const pocketBalance = pocket.reduce((t, r) => t + Number(r.amount || 0), 0)

  // Dati tabella "Soldi in tasca" con filtro "Solo spese contante"
  const pocketTableRows = onlyPocketExpenses
    ? pocket.filter(m => m.amount < 0) // solo uscite/spese
    : pocket

  // ─────────────────────────────────────────────── UI
  return (
    <>
      <Head><title>Entrate & Saldi</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">💶 Entrate & Saldi</h2>

          {/* BOX DISPONIBILITÀ */}
          <div className="total-box" style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.1)' }}>
            <h3>📊 Disponibilità</h3>
            <div className="flex-line"><span>Saldo mese disponibile:</span><b>€ {saldoMese.toFixed(2)}</b></div>
            <div className="flex-line"><span>Soldi in tasca (restanti):</span><b>€ {pocketBalance.toFixed(2)}</b></div>
            <p style={{ opacity: .8, marginTop: '.3rem' }}>
              Periodo corrente: <b>{startDate}</b> → <b>{endDate}</b> (payday giorno {PAYDAY_DAY})
            </p>
          </div>

          {/* Tasti OCR/Voce */}
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
              onChange={(e
