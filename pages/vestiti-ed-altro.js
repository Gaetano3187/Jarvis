// pages/vestiti-ed-altro.js
import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_ID_VESTITI = '89e223d4-1ec0-4631-b0d4-52472579a04a'
const PAYDAY_DAY = 10

/* ========================= Helpers data/formato ========================= */
function isoLocal(date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const pad = (n) => String(n).padStart(2, '0')
  return `${y}-${pad(m)}-${pad(d)}`
}
function addDaysLocal(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + days)
  return d
}
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
  const startDate = isoLocal(start)
  const endDate = isoLocal(end)
  const monthKey = endDate.slice(0, 7)
  return { startDate, endDate, monthKey }
}
function formatIT(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  return date.toLocaleDateString('it-IT')
}
function parseAmountLoose(v) {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/* ========================= Carryover auto (come spese-casa) ========================= */
async function ensureCarryoverAuto(userId, monthKeyCurrent) {
  const { data: existing, error: e0 } = await supabase
    .from('carryovers')
    .select('id')
    .eq('user_id', userId)
    .eq('month_key', monthKeyCurrent)
    .maybeSingle()
  if (e0 && e0.code !== 'PGRST116') throw e0
  if (existing) return

  const [yy, mm] = monthKeyCurrent.split('-').map(Number)
  const prevEnd = new Date(yy, mm - 1, 0)
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1)
  const prevStartISO = isoLocal(prevStart)
  const prevEndISO = isoLocal(prevEnd)
  const prevKey = prevEndISO.slice(0, 7)

  const { data: incPrev, error: e1 } = await supabase
    .from('incomes')
    .select('amount')
    .eq('user_id', userId)
    .gte('received_at', prevStartISO)
    .lte('received_at', prevEndISO)
  if (e1) throw e1

  const { data: expPrev, error: e2 } = await supabase
    .from('finances')
    .select('amount')
    .eq('user_id', userId)
    .gte('spent_at', prevStartISO)
    .lte('spent_at', prevEndISO)
  if (e2) throw e2

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
  const saldoPrevBase = totalInc + prevCarry - totalExp

  const { error: e4 } = await supabase.from('carryovers').insert({
    user_id: userId,
    month_key: monthKeyCurrent,
    amount: Number(saldoPrevBase.toFixed(2)),
    note: 'Auto-carryover da mese precedente',
  })
  if (e4) throw e4
}

/* ========================= Component ========================= */
function VestitiEdAltro() {
  // dati lista spese (categoria)
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // metriche / pocket (identiche a spese-casa)
  const [incomes, setIncomes] = useState([])
  const [carryover, setCarryover] = useState(null)
  const [pocketRows, setPocketRows] = useState([])

  // voce / ocr (stessa UX di spese-casa)
  const [recBusy, setRecBusy] = useState(false)
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    quantita: '1',
    prezzoTotale: '',
    spentAt: '',
    paymentMethod: 'card', // 'card' | 'cash'
  })
  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])
  const streamRef = useRef(null)

  // periodo 10→9
  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY)
  const startDateISO = startDate
  const endDateISO = endDate
  const endExclusiveDate = isoLocal(
    addDaysLocal(
      new Date(
        Number(endDateISO.slice(0, 4)),
        Number(endDateISO.slice(5, 7)) - 1,
        Number(endDateISO.slice(8, 10))
      ),
      1
    )
  )
  const startDateIT = formatIT(startDateISO)
  const endDateIT = formatIT(endDateISO)

  useEffect(() => {
    loadAll()
    return () => {
      try {
        if (mediaRecRef.current && mediaRecRef.current.state === 'recording') {
          mediaRecRef.current.stop()
        }
        streamRef.current?.getTracks?.().forEach((t) => t.stop())
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      if (!user) throw new Error('Sessione scaduta')

      await ensureCarryoverAuto(user.id, monthKey)

      // 1) Spese VESTITI del periodo (solo categoria vestiti/altro)
      const { data: sp, error: eS } = await supabase
        .from('finances')
        .select('id, description, amount, qty, spent_at, payment_method')
        .eq('user_id', user.id)
        .eq('category_id', CATEGORY_ID_VESTITI)
        .gte('spent_at', startDateISO)
        .lt('spent_at', endExclusiveDate)
        .order('spent_at', { ascending: false })
      if (eS) throw eS
      setSpese(sp || [])

      // 2) Entrate del periodo
      const { data: inc, error: e1 } = await supabase
        .from('incomes')
        .select('id, amount, received_at')
        .eq('user_id', user.id)
        .gte('received_at', startDateISO)
        .lt('received_at', endExclusiveDate)
        .order('received_at', { ascending: false })
      if (e1) throw e1
      setIncomes(inc || [])

      // 3) Carryover corrente
      const { data: co, error: e2 } = await supabase
        .from('carryovers')
        .select('id, month_key, amount')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .maybeSingle()
      if (e2 && e2.code !== 'PGRST116') throw e2
      setCarryover(co || null)

      // 4a) Movimenti pocket manuali (pocket_cash) nel periodo
      const { data: pcMoved, error: e3a } = await supabase
        .from('pocket_cash')
        .select('id, created_at, moved_at, note, delta, amount, direction')
        .eq('user_id', user.id)
        .not('moved_at', 'is', null)
        .gte('moved_at', startDateISO)
        .lt('moved_at', endExclusiveDate)
        .order('moved_at', { ascending: false })
      if (e3a) throw e3a

      const { data: pcCreated, error: e3b } = await supabase
        .from('pocket_cash')
        .select('id, created_at, moved_at, note, delta, amount, direction')
        .eq('user_id', user.id)
        .is('moved_at', null)
        .gte('created_at', startDateISO)
        .lt('created_at', endExclusiveDate)
        .order('created_at', { ascending: false })
      if (e3b) throw e3b

      const pc = [...(pcMoved || []), ...(pcCreated || [])]
      const manualRows = pc.map((row) => {
        const eff =
          row.delta != null
            ? Number(row.delta || 0)
            : row.amount != null
            ? (row.direction === 'in' ? 1 : -1) * Number(row.amount || 0)
            : 0
        const dateISO = (row.moved_at || row.created_at || '').slice(0, 10)
        return {
          id: `pc-${row.id}`,
          dateISO,
          label: row.note?.trim() || (eff >= 0 ? 'Ricarica contanti' : 'Uscita contanti'),
          amount: Number(eff || 0),
        }
      })

      // 4b) Spese in contanti (tutte le categorie) nel periodo → righe negative
      const { data: finCash, error: e4 } = await supabase
        .from('finances')
        .select('id, description, amount, spent_at')
        .eq('user_id', user.id)
        .eq('payment_method', 'cash')
        .gte('spent_at', startDateISO)
        .lt('spent_at', endExclusiveDate)
        .order('spent_at', { ascending: false })
      if (e4) throw e4

      const cashRows = (finCash || []).map((f) => {
        const dateISO = (f.spent_at || '').slice(0, 10)
        const m = (f.description || '').match(/^\[(.*?)\]\s*(.*)$/)
        const store = m ? m[1] : 'Punto vendita'
        const dett = m ? m[2] : (f.description || '')
        return {
          id: `fin-${f.id}`,
          dateISO,
          label: `Spesa in contante • ${store}${dett ? ` • ${dett}` : ''}`,
          amount: -Math.abs(Number(f.amount) || 0),
        }
      })

      const rows = [...manualRows, ...cashRows]
        .filter((r) => Number.isFinite(r.amount) && r.amount !== 0)
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''))
      setPocketRows(rows)
    } catch (err) {
      const msg =
        err?.message ||
        err?.error_description ||
        err?.hint ||
        (typeof err === 'string' ? err : JSON.stringify(err))
      setError(msg)
      console.error('[VESTITI LOAD ERROR]', err)
    } finally {
      setLoading(false)
    }
  }

  /* ========================= OCR / Voce (stesso flusso di spese-casa) ========================= */
  function buildOCRPrompt(userText) {
    const example = JSON.stringify(
      {
        type: 'expense_list',
        items: [
          {
            puntoVendita: 'Zara',
            dettaglio: 'Pantaloni cargo',
            quantita: 1,
            prezzoTotale: 39.9,
            data: '2025-08-06',
            paymentMethod: 'card',
          },
        ],
      },
      null,
      2
    )
    return [
      'Sei Jarvis. Dal testo OCR estrai TUTTE le voci di spesa (anche multiple).',
      'Riconosci se è stato pagato in CONTANTI: allora paymentMethod="cash", altrimenti "card".',
      'Data: usa quella del documento, oppure "oggi"/"ieri" se indicato.',
      'Rispondi SOLO con JSON come nell’esempio seguente:',
      example,
      '',
      'TESTO_OCR:',
      userText,
    ].join('\n')
  }
  function buildVoicePrompt(userText) {
    const example = JSON.stringify(
      {
        type: 'expense_list',
        items: [
          {
            puntoVendita: 'OVS',
            dettaglio: 'Maglietta basic',
            quantita: 2,
            prezzoTotale: 18.0,
            data: 'oggi',
            paymentMethod: 'cash',
          },
        ],
      },
      null,
      2
    )
    return [
      'Trascrizione vocale utente. Estrai voci di spesa VESTITI/ALTRO.',
      'Se trovi "in contanti", usa paymentMethod="cash"; altrimenti "card".',
      'Data può essere "oggi"/"ieri" o ISO "YYYY-MM-DD".',
      'Rispondi SOLO con JSON:',
      example,
      '',
      'TESTO:',
      userText,
    ].join('\n')
  }
  async function callAssistant(prompt) {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const { answer, error: apiErr } = await res.json()
    if (!res.ok || apiErr) throw new Error(apiErr || String(res.status))
    return JSON.parse(answer)
  }
  async function handleOCR(files) {
    if (!files?.length) return
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('images', f))
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text } = await res.json()
      const data = await callAssistant(buildOCRPrompt(text))
      await upsertFromAssistant(data)
    } catch (err) {
      console.error(err)
      setError('OCR fallito')
    }
  }
  const toggleRec = async () => {
    if (recBusy) {
      try { mediaRecRef.current?.stop() } catch {}
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      mediaRecRef.current = new MediaRecorder(stream)
      recordedChunks.current = []
      mediaRecRef.current.ondataavailable = (e) => {
        if (e.data?.size) recordedChunks.current.push(e.data)
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
      const res = await fetch('/api/stt', { method: 'POST', body: fd })
      const { text } = await res.json()
      const data = await callAssistant(buildVoicePrompt(text))
      await upsertFromAssistant(data)
    } catch (err) {
      console.error(err)
      setError('STT fallito')
    } finally {
      setRecBusy(false)
      try { streamRef.current?.getTracks?.().forEach((t) => t.stop()) } catch {}
    }
  }
  async function upsertFromAssistant(data) {
    if (!data || data.type !== 'expense_list' || !Array.isArray(data.items) || !data.items.length) {
      setError('Nessuna voce valida rilevata')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setError('Sessione scaduta')

    const rows = data.items.map((it) => {
      let spentAt
      if (it.data === 'oggi') spentAt = isoLocal(new Date())
      else if (it.data === 'ieri') spentAt = isoLocal(addDaysLocal(new Date(), -1))
      else spentAt = it.data || isoLocal(new Date())

      const pm = (it.paymentMethod || '').toLowerCase() === 'cash' ? 'cash' : 'card'
      const store = (it.puntoVendita || 'Negozio').toString().trim()
      const dett  = (it.dettaglio || 'Acquisto').toString().trim()

      return {
        user_id: user.id,
        category_id: CATEGORY_ID_VESTITI,
        description: `[${store}] ${dett}`,
        amount: Math.abs(parseAmountLoose(it.prezzoTotale)),
        qty: Number(it.quantita) || 1,
        spent_at: spentAt,
        payment_method: pm,
      }
    })

    const { error: dbErr } = await supabase.from('finances').insert(rows)
    if (dbErr) {
      setError(dbErr.message || 'Errore salvataggio spese')
      return
    }
    await loadAll()

    const last = rows[0]
    const m = (last.description || '').match(/^\[(.*?)\]\s*(.*)$/)
    setNuovaSpesa({
      puntoVendita: m ? m[1] : '',
      dettaglio: m ? m[2] : '',
      quantita: String(last.qty ?? 1),
      prezzoTotale: String(last.amount ?? ''),
      spentAt: last.spent_at,
      paymentMethod: last.payment_method || 'card',
    })
  }

  /* ========================= CRUD manuale (identico) ========================= */
  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return setError('Sessione scaduta')

      const row = {
        user_id: user.id,
        category_id: CATEGORY_ID_VESTITI,
        description: `[${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio}`,
        amount: Math.abs(parseAmountLoose(nuovaSpesa.prezzoTotale)),
        spent_at: nuovaSpesa.spentAt || isoLocal(new Date()),
        qty: parseInt(nuovaSpesa.quantita, 10) || 1,
        payment_method: nuovaSpesa.paymentMethod === 'cash' ? 'cash' : 'card',
      }

      const { error: insertError } = await supabase.from('finances').insert(row)
      if (insertError) throw insertError

      setNuovaSpesa({
        puntoVendita: '',
        dettaglio: '',
        quantita: '1',
        prezzoTotale: '',
        spentAt: '',
        paymentMethod: 'card',
      })
      await loadAll()
    } catch (err) {
      const msg =
        err?.message ||
        err?.error_description ||
        err?.hint ||
        (typeof err === 'string' ? err : JSON.stringify(err))
      setError(msg)
    }
  }
  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('finances').delete().eq('id', id)
      if (error) throw error
      setSpese((prev) => prev.filter((r) => r.id !== id))
      await loadAll()
    } catch (err) {
      setError(err.message || 'Errore eliminazione')
    }
  }

  /* ========================= Metriche (come spese-casa) ========================= */
  const entratePeriodo = incomes.reduce((t, r) => t + Number(r.amount || 0), 0)
  const carryAmount = Number(carryover?.amount || 0)
  const prelievi = pocketRows
    .filter((r) => r.id?.toString().startsWith('pc-') && r.amount > 0)
    .reduce((t, r) => t + r.amount, 0)
  const saldoDisponibile = Math.max(0, entratePeriodo + carryAmount - prelievi)
  const pocketBalance = pocketRows.reduce((t, r) => t + Number(r.amount || 0), 0)
  const totale = spese.reduce((t, r) => t + (Number(r.amount) || 0), 0)

  /* ========================= UI (stesse classi/stili di spese-casa) ========================= */
  return (
    <>
      <Head><title>Vestiti ed Altro</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">🛍️ Vestiti ed Altro</h2>

          {/* Periodo corrente */}
          <div className="periodo-row">
            <span>Periodo corrente:</span>
            <b>{startDateIT}</b>
            <span>–</span>
            <b>{endDateIT}</b>
          </div>

          {/* Metriche & Pocket */}
          <div className="total-box" style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.1)' }}>
            <h3>Disponibilità & Contante</h3>
            <div className="flex-line metric-sub">
              <span>Entrate periodo corrente:</span><b>€ {entratePeriodo.toFixed(2)}</b>
            </div>
            <div className="flex-line metric-sub">
              <span>Carryover mese precedente:</span><b>€ {carryAmount.toFixed(2)}</b>
            </div>
            <div className="flex-line">
              <span>Saldo disponibile:</span>
              <b className="metric metric--saldo">€ {saldoDisponibile.toFixed(2)}</b>
            </div>
            <div className="flex-line">
              <span>Soldi in tasca (restanti):</span>
              <b className="metric metric--pocket">€ {pocketBalance.toFixed(2)}</b>
            </div>
          </div>

          {/* Pulsanti OCR / Voce */}
          <div className="table-buttons">
            <button className="btn-vocale" onClick={toggleRec}>{recBusy ? '⏹ Stop' : '🎙 Voce'}</button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>📷 OCR</button>
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

          {/* Form inserimento manuale */}
          <form className="input-section" onSubmit={handleAdd}>
            <label>Punto vendita / Servizio</label>
            <input
              value={nuovaSpesa.puntoVendita}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })}
              required
            />
            <label>Quantità</label>
            <input
              type="number"
              min="1"
              value={nuovaSpesa.quantita}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })}
              required
            />
            <label>Dettaglio della spesa</label>
            <textarea
              value={nuovaSpesa.dettaglio}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })}
              required
            />
            <label>Data di acquisto</label>
            <input
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
              required
            />
            <label>Prezzo totale (€)</label>
            <input
              type="text"
              inputMode="decimal"
              value={nuovaSpesa.prezzoTotale}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })}
              required
            />
            <label>Metodo di pagamento</label>
            <select
              value={nuovaSpesa.paymentMethod}
              onChange={(e) => setNuovaSpesa({ ...nuovaSpesa, paymentMethod: e.target.value })}
            >
              <option value="card">Carta</option>
              <option value="cash">Contanti</option>
            </select>
            <button className="btn-manuale">Aggiungi</button>
          </form>

          {/* Tabella spese */}
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
                    <th>Pagato</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map((r) => {
                    const m = (r.description || '').match(/^\[(.*?)\]\s*(.*)$/) || []
                    return (
                      <tr key={r.id}>
                        <td>{m[1] || '-'}</td>
                        <td>{m[2] || r.description}</td>
                        <td>{r.spent_at ? new Date(r.spent_at).toLocaleDateString('it-IT') : '-'}</td>
                        <td>{r.qty ?? 1}</td>
                        <td>{Number(r.amount || 0).toFixed(2)}</td>
                        <td>{r.payment_method === 'cash' ? 'Contanti' : 'Carta'}</td>
                        <td><button onClick={() => handleDelete(r.id)}>🗑</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <div className="total-box">
              Totale periodo (Vestiti/Altro): <b>€ {totale.toFixed(2)}</b>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <Link href="/home">
            <button className="btn-vocale" style={{ marginTop: '1rem' }}>🏠 Home</button>
          </Link>
        </div>
      </div>

      {/* Stili identici a spese-casa */}
      <style jsx global>{`
        .spese-casa-container1 {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f172a;
          min-height: 100vh;
          padding: 2rem;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
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
        .title { margin-bottom: .25rem; font-size: 1.5rem; }
        .periodo-row {
          display:flex; gap:.4rem; align-items:center;
          margin: .25rem 0 .6rem;
          font-size: .95rem;
          opacity:.9;
        }
        .table-buttons { display: flex; gap: .5rem; margin: .25rem 0 1rem; }
        .btn-vocale, .btn-ocr, .btn-manuale {
          background: #6366f1; border: 0; padding: .4rem .6rem; border-radius: .5rem; cursor: pointer; color: #fff;
        }
        .btn-ocr { background: #06b6d4; }
        .input-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: .6rem .8rem; align-items: center; margin: .5rem 0 1rem;
        }
        .input-section label { opacity: .85; font-size: .95rem; }
        .input-section input, .input-section textarea, .input-section select {
          padding: .5rem; border-radius: .5rem; border: 1px solid rgba(255,255,255,.15);
          background: rgba(255,255,255,.06); color: #fff;
        }
        .input-section textarea { grid-column: 1 / span 2; min-height: 4.5rem; resize: vertical; }
        .custom-table { width: 100%; margin-top: .5rem; border-collapse: collapse; }
        .custom-table th, .custom-table td { border-bottom: 1px solid rgba(255,255,255,.12); padding: .5rem; text-align: left; }
        .flex-line { display: flex; justify-content: space-between; margin: .3rem 0; gap: 1rem; }
        .total-box { background: rgba(255,255,255,.06); padding: 1rem; border-radius: .75rem; margin-top: .5rem; }
        .error { color: #f87171; margin-top: 1rem; }

        /* Metriche grandi (coerenti) */
        .metric { font-size: 1.6rem; font-weight: 800; line-height: 1.1; }
        .metric-sub { font-size: 1rem; opacity: .85; }
        .metric--saldo { color: #22c55e; }
        .metric--pocket { color: #06b6d4; }
      `}</style>
    </>
  )
}

export default withAuth(VestitiEdAltro)
