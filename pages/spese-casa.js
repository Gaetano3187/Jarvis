// pages/spese-casa.js
import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'

import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_ID_CASA = '4cfaac74-aab4-4d96-b335-6cc64de59afc'

function SpeseCasa () {
  /* ---------- STATE ---------- */
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recBusy, setRecBusy] = useState(false)
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    prezzoTotale: '',
    quantita: '1',
    spentAt: ''
  })

  /* ---------- REFS ---------- */
  const formRef = useRef(null)
  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const recordedChunks = useRef([])

  /* ---------- LOAD ---------- */
  useEffect(() => { fetchSpese() }, [])

  async function fetchSpese () {
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

  /* ---------- ADD ---------- */
  const handleAdd = async e => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Sessione scaduta'); return }

    const row = {
      user_id: user.id,                       // 👈  snake_case coerente con il DB
      category_id: CATEGORY_ID_CASA,
      description: `[${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio}`,
      amount: Number(nuovaSpesa.prezzoTotale),
      spent_at: nuovaSpesa.spentAt || new Date().toISOString(),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1
    }

    const { error } = await supabase.from('finances').insert(row)
    if (error) { setError(error.message); return }

    setNuovaSpesa({ puntoVendita: '', dettaglio: '', prezzoTotale: '', quantita: '1', spentAt: '' })
    fetchSpese()
  }

  /* ---------- DELETE ---------- */
  const handleDelete = async id => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (error) setError(error.message)
    else setSpese(spese.filter(r => r.id !== id))
  }

  /* ---------- OCR ---------- */
  const handleOCR = async file => {
    if (!file) return
    try {
      const fd = new FormData(); fd.append('image', file)
      const { text } = await (await fetch('/api/ocr', { method: 'POST', body: fd })).json()
      await parseAssistantPrompt(buildSystemPrompt('ocr', text))
    } catch { setError('OCR fallito') }
  }

  /* ---------- REC ---------- */
  const toggleRec = async () => {
    if (recBusy) { mediaRecRef.current?.stop(); setRecBusy(false); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecRef.current = new MediaRecorder(stream)
      recordedChunks.current = []
      mediaRecRef.current.ondataavailable = e => e.data.size && recordedChunks.current.push(e.data)
      mediaRecRef.current.onstop = processVoice
      mediaRecRef.current.start()
      setRecBusy(true)
    } catch { setError('Microfono non disponibile') }
  }

  const processVoice = async () => {
    const blob = new Blob(recordedChunks.current, { type: 'audio/webm' })
    const fd = new FormData(); fd.append('audio', blob, 'voice.webm')
    try {
      const { text } = await (await fetch('/api/stt', { method: 'POST', body: fd })).json()
      await parseAssistantPrompt(buildSystemPrompt('voice', text))
    } catch { setError('STT fallito') }
  }

  /* ---------- PROMPT ---------- */
  const buildSystemPrompt = (source, userText) => `
Sei Jarvis. Rispondi **solo** con JSON valido:

{
 "type":"expense",
 "items":[{
   "puntoVendita":"...",
   "dettaglio":"...",
   "prezzoTotale":0.00,
   "quantita":1,
   "data":"YYYY-MM-DD",
   "categoria":"casa",
   "category_id":"${CATEGORY_ID_CASA}"
 }]
}

TESTO (${source}): ${userText}`

  /* ---------- PARSE ASSISTANT ---------- */
  async function parseAssistantPrompt (prompt) {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })

      if (!res.ok) {
        const txt = await res.text()
        console.error('assistant error', res.status, txt)
        setError(`Assistant ${res.status}`); return
      }

      const { answer, error: apiErr } = await res.json()
      if (apiErr) { setError(`Assistant: ${apiErr}`); return }

      console.log('[assistant-raw]', answer)
      const data = JSON.parse(answer)
      if (data.type !== 'expense' || !Array.isArray(data.items) || !data.items.length) {
        setError('Risposta assistant non valida'); return
      }

      /* ---------- INSERT ---------- */
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const rows = data.items.map(it => ({
        user_id: user.id,
        category_id: CATEGORY_ID_CASA,
        description: `[${it.puntoVendita || 'Sconosciuto'}] ${it.dettaglio || 'spesa'}`,
        amount: Number(it.prezzoTotale || 0),
        spent_at: it.data || new Date().toISOString(),
        qty: parseInt(it.quantita || 1, 10)
      }))

      const { error: dbErr } = await supabase.from('finances').insert(rows)
      if (dbErr) { setError(dbErr.message); return }

      fetchSpese()

      /* pre-riempie il form (solo se c’è almeno una riga) */
      if (rows.length) {
        const f = rows[0]
        const m = f.description.match(/^\[(.*?)\]\s*(.*)$/) || []
        setNuovaSpesa({
          puntoVendita: m[1] || '',
          dettaglio: m[2] || '',
          prezzoTotale: String(f.amount),
          quantita: String(f.qty),
          spentAt: f.spent_at.slice(0, 10)
        })
      }
    } catch (err) {
      console.error(err)
      setError('Risposta assistant non valida')
    }
  }

  /* ---------- RENDER ---------- */
  const totale = spese.reduce((t, r) => t + Number(r.amount || 0) * (r.qty ?? 1), 0)

  return (
    <>
      <Head><title>Spese Casa</title></Head>

      {/* … resto del JSX identico … */}
      {/* (omesso qui per brevità; struttura e style invariati) */}
    </>
  )
}

export default withAuth(SpeseCasa)
