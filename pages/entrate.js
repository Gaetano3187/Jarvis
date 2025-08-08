// pages/entrate.js
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
  const m = today.getMonth() // 0..11
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
  const monthKey = end.toISOString().slice(0, 7) // YYYY-MM
  return { startDate, endDate, monthKey }
}

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

  // Spese del periodo
  const [monthExpenses, setMonthExpenses] = useState(0)

  // OCR / VOCE
  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])
  const [recBusy, setRecBusy] = useState(false)

  // Periodo in base al payday
  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY)

  // ─────────────────────────────────────────────── Load dati
  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

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

      // Movimenti “soldi in tasca” (ultimi 60 gg)
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
        received_at: newIncome.receivedAt || new Date().toISOString().slice(0, 10),
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

  // ─────────────────────────────────────────────── Salva/Aggiorna Carryover
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

  // ─────────────────────────────────────────────── Top-up “Soldi in tasca”
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

  // ─────────────────────────────────────────────── Prompt builder (OCR / Voce)
  function buildIncomePrompt(source, userText) {
    const today = new Date().toISOString().slice(0, 10)

    if (source === 'ocr') {
      return [
        'Sei Jarvis. Dal testo OCR qui sotto estrai **entrate economiche** (stipendi, provvigioni, rimborsi).',
        'Per ogni entrata genera i campi: source (string), description (string), amount (number, euro), receivedAt (YYYY-MM-DD).',
        'Rispondi SOLO con JSON, ad es.:',
        '{"type":"income","items":[{"source":"Stipendio","description":"Stipendio ACME","amount":1500,"receivedAt":"' + today + '"}]}',
        '',
        'TESTO:',
        userText
      ].join('\n')
    }

    return [
      'Trascrizione vocale: estrai ENTRATE e rispondi SOLO con JSON nel formato:',
      '{"type":"income","items":[{"source":"Provvigioni","description":"Provvigioni","amount":250,"receivedAt":"' + today + '"}]}',
      '',
      'TESTO:',
      userText
    ].join('\n')
  }

  // ─────────────────────────────────────────────── Parsing risposta assistant
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
      received_at: it.receivedAt || new Date().toISOString().slice(0, 10),
    }))

    const { error } = await supabase.from('incomes').insert(rows)
    if (error) throw error
    await loadAll()
  }

  // ─────────────────────────────────────────────── OCR (Entrate)
  async function handleOCR(files) {
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

  // ─────────────────────────────────────────────── Voce (Entrate)
  const toggleRec = async () => {
    if (recBusy) {
      mediaRecRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecRef.current = new MediaRecorder(stream)
      recordedChunks.current = []
      mediaRecRef.current.ondataavailable = e => {
        if (e.data.size) recordedChunks.current.push(e.data)
      }
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
              onChange={(e) => handleOCR(Array.from(e.target.files || []))}
            />
          </div>

          {/* TABELLA 1 — ENTRATE */}
          <h3 style={{ marginTop: '1rem' }}>1) Entrate del periodo</h3>
          <form className="input-section" onSubmit={handleAddIncome}>
            <label>Fonte</label>
            <input
              value={newIncome.source}
              onChange={(e) => setNewIncome({ ...newIncome, source: e.target.value })}
              placeholder="Stipendio, Provvigioni…"
              required
            />
            <label>Descrizione</label>
            <input
              value={newIncome.description}
              onChange={(e) => setNewIncome({ ...newIncome, description: e.target.value })}
              placeholder="Stipendio ACME Srl"
              required
            />
            <label>Data accredito</label>
            <input
              type="date"
              value={newIncome.receivedAt}
              onChange={(e) => setNewIncome({ ...newIncome, receivedAt: e.target.value })}
              required
            />
            <label>Importo (€)</label>
            <input
              type="number"
              step="0.01"
              value={newIncome.amount}
              onChange={(e) => setNewIncome({ ...newIncome, amount: e.target.value })}
              required
            />
            <button className="btn-manuale">Aggiungi entrata</button>
          </form>

          {loading ? <p>Caricamento…</p> : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th>Descrizione</th>
                  <th>Data</th>
                  <th>Importo €</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {incomes.map(i => (
                  <tr key={i.id}>
                    <td>{i.source || '-'}</td>
                    <td>{i.description}</td>
                    <td>{new Date(i.received_at).toLocaleDateString()}</td>
                    <td>{Number(i.amount).toFixed(2)}</td>
                    <td><button onClick={() => handleDeleteIncome(i.id)}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* TABELLA 2 — CARRYOVER */}
          <h3 style={{ marginTop: '2rem' }}>2) Rimanenze / Perdite mesi precedenti</h3>
          <form className="input-section" onSubmit={handleSaveCarryover}>
            <label>Importo (€) per {monthKey} (positivo=avanzo, negativo=perdita)</label>
            <input
              type="number"
              step="0.01"
              value={newCarry.amount}
              onChange={(e) => setNewCarry({ ...newCarry, amount: e.target.value })}
              placeholder={carryover ? String(carryAmount) : '0'}
              required
            />
            <label>Nota (opzionale)</label>
            <input
              value={newCarry.note}
              onChange={(e) => setNewCarry({ ...newCarry, note: e.target.value })}
              placeholder={carryover?.note || 'es. “riporto mese precedente”'}
            />
            <button className="btn-manuale">{carryover ? 'Aggiorna' : 'Salva'} carryover</button>
          </form>

          {carryover && (
            <table className="custom-table">
              <thead>
                <tr><th>Mese</th><th>Importo €</th><th>Nota</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{carryover.month_key}</td>
                  <td>{Number(carryover.amount).toFixed(2)}</td>
                  <td>{carryover.note || '-'}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* TABELLA 3 — SOLDI IN TASCA */}
          <h3 style={{ marginTop: '2rem' }}>3) Soldi in tasca</h3>
          <form className="input-section" onSubmit={handleTopUpPocket}>
            <label>Ricarica/Immissione (€)</label>
            <input
              type="number"
              step="0.01"
              value={pocketTopUp}
              onChange={(e) => setPocketTopUp(e.target.value)}
              placeholder="es. 200.00"
              required
            />
            <button className="btn-manuale">Aggiungi movimento +</button>
            <p style={{ opacity: .8, marginTop: '.5rem' }}>
              Le spese vengono scalate automaticamente (trigger su <code>finances</code>).
            </p>
          </form>

          {loading ? <p>Caricamento…</p> : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Nota</th>
                  <th>Variazione</th>
                </tr>
              </thead>
              <tbody>
                {pocket.map(m => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString()}</td>
                    <td>{m.note || '-'}</td>
                    <td>{Number(m.delta).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* RIEPILOGO FINALE */}
          <div className="total-box" style={{ marginTop: '2rem' }}>
            <div><b>Entrate periodo:</b> € {totalIncomes.toFixed(2)}</div>
            <div><b>Carryover {monthKey}:</b> € {carryAmount.toFixed(2)}</div>
            <div><b>Spese dal {startDate} al {endDate}:</b> € {monthExpenses.toFixed(2)}</div>
            <hr style={{ borderColor: 'rgba(255,255,255,0.3)' }} />
            <div style={{ fontSize: '1.2rem' }}>
              <b>Saldo mese disponibile:</b> € {saldoMese.toFixed(2)}
            </div>
            <div style={{ fontSize: '1.2rem' }}>
              <b>Soldi in tasca (restanti):</b> € {pocketBalance.toFixed(2)}
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <Link href="/home">
            <button className="btn-vocale" style={{ marginTop: '1rem' }}>🏠 Home</button>
          </Link>
        </div>
      </div>

      {/* Stili riusati */}
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
          max-width: 1000px;
          width: 100%;
        }
        .title { margin-bottom: 1rem; font-size: 1.5rem; }

        .table-buttons { display: flex; gap: .5rem; margin: .5rem 0 1rem; }
        .btn-vocale, .btn-ocr, .btn-manuale {
          background: #22c55e; border: 0; padding: .5rem .75rem; border-radius: .5rem; cursor: pointer;
        }
        .btn-ocr { background: #06b6d4; }
        .btn-manuale { background: #6366f1; }

        .input-section {
          display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin: .75rem 0 1rem;
        }
        .input-section label { opacity: .85; }
        .input-section input { padding: .5rem; border-radius: .5rem; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06); color: #fff; }

        .custom-table { width: 100%; margin-top: .5rem; border-collapse: collapse; }
        .custom-table th, .custom-table td { border-bottom: 1px solid rgba(255,255,255,.12); padding: .5rem; text-align: left; }

        .total-box { background: rgba(255,255,255,.06); padding: 1rem; border-radius: .75rem; }
        .error { color: #f87171; margin-top: 1rem; }
      `}</style>
    </>
  )
}

export default withAuth(Entrate)
