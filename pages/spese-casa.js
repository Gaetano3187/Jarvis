// pages/spese-casa.js
import { useEffect, useRef, useState } from 'react'
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
      .select('id, description, amount, qty, spent_at')
      .eq('category_id', CATEGORY_ID_CASA)
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setSpese(data)
    setLoading(false)
  }

  const handleAdd = async e => {
    e.preventDefault()
    const {
      data: { user }
    } = await supabase.auth.getUser()
    if (!user) return setError('Sessione scaduta')

    const row = {
      user_id: user.id,
      category_id: CATEGORY_ID_CASA,
      description: `[${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio}`,
      amount: Number(nuovaSpesa.prezzoTotale),
      spent_at: nuovaSpesa.spentAt || new Date().toISOString(),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1,
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

  // ───────────────────────── OCR ─────────────────────────
  const handleOCR = async file => {
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`OCR ${res.status}`)
      const { text } = await res.json()
      await parseAssistantPrompt(buildSystemPrompt('ocr', text))
    } catch (err) {
      console.error('OCR fallito', err)
      setError('OCR fallito')
    }
  }

  // ────────────────────── VOICE ───────────────────────
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
      const res = await fetch('/api/stt', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`STT ${res.status}`)
      const { text } = await res.json()
      await parseAssistantPrompt(buildSystemPrompt('voice', text))
    } catch {
      setError('STT fallito')
    } finally {
      setRecBusy(false)
    }
  }

  // ────────────────── SYSTEM PROMPT ────────────────────
  const buildSystemPrompt = (source, userText) => {
    return `
Sei Jarvis. Rispondi **solo** con JSON conforme al seguente schema, senza testo extra:

{
  "type":"expense",
  "items":[
    {
      "puntoVendita": string,
      "dettaglio": string,
      "prezzoUnitario": number | null,
      "quantita": number,
      "prezzoTotale": number,
      "data": "YYYY-MM-DD" | "<OGGI>" | "<IERI>",
      "categoria": "casa",
      "category_id": "${CATEGORY_ID_CASA}"
    }
  ]
}

**Regole**:
- “oggi” → `<OGGI>`, “ieri” → `<IERI>`, altrimenti estrai data ISO.
- Se trovi “€ X,XX al [kg|etto|litro]” → calcola quantita e prezzoUnitario.
- Se non c’è prezzo unitario → prezzoUnitario: null.
- Non aggiungere altro.

**Esempi**:
1) “1 etto di prosciutto cotto a 1.80 €/etto al Supermercato Rossi oggi”  
   →  
   {
     "type":"expense",
     "items":[
       {
         "puntoVendita":"Supermercato Rossi",
         "dettaglio":"prosciutto cotto",
         "prezzoUnitario":1.80,
         "quantita":1,
         "prezzoTotale":1.80,
         "data":"<OGGI>",
         "categoria":"casa",
         "category_id":"${CATEGORY_ID_CASA}"
       }
     ]
   }

2) “2 confezioni di merendine a 3.50 euro ciascuna da Coop ieri”  
   →  
   {
     "type":"expense",
     "items":[
       {
         "puntoVendita":"Coop",
         "dettaglio":"confezioni di merendine",
         "prezzoUnitario":3.50,
         "quantita":2,
         "prezzoTotale":7.00,
         "data":"<IERI>",
         "categoria":"casa",
         "category_id":"${CATEGORY_ID_CASA}"
       }
     ]
   }

…e così via fino all’esempio 15…

Ora capisci l’input proveniente da **${source}** e restituisci **solo** il JSON.
  
INPUT:
"""
${userText}
"""
`
  }

  // ────────────────── PARSING E INSERT ────────────────────
  async function parseAssistantPrompt(prompt) {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) {
        const txt = await res.text()
        setError(`Assistant ${res.status}: ${txt}`)
        return
      }
      const { answer, error: apiErr } = await res.json()
      if (apiErr) {
        setError(`Assistant: ${apiErr}`)
        return
      }

      const data = JSON.parse(answer)
      if (data.type !== 'expense' || !Array.isArray(data.items) || !data.items.length) {
        setError('Risposta assistant non valida')
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const rows = data.items.map(it => {
        // converti data (<OGGI>/<IERI> o YYYY-MM-DD)
        let spentAt = it.data === '<OGGI>'
          ? new Date().toISOString().slice(0, 10)
          : it.data === '<IERI>'
            ? (() => { let d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10) })()
            : it.data
        return {
          user_id: user.id,
          category_id: CATEGORY_ID_CASA,
          description: `[${it.puntoVendita}] ${it.dettaglio}`,
          amount: Number(it.prezzoTotale),
          spent_at: spentAt,
          qty: Number(it.quantita),
        }
      })

      const { error: dbErr } = await supabase.from('finances').insert(rows)
      if (dbErr) {
        setError(dbErr.message)
        return
      }
      fetchSpese()

      // pre-riempi il form con la prima spesa
      const f = rows[0]
      setNuovaSpesa({
        puntoVendita: f.description.match(/^\[(.*?)\]/)?.[1] || '',
        dettaglio: f.description.replace(/^\[.*?\]\s*/, ''),
        prezzoTotale: f.amount,
        quantita: String(f.qty),
        spentAt: f.spent_at,
      })
    } catch (err) {
      console.error(err)
      setError('Risposta assistant non valida')
    }
  }

  // ─────────────────────── RENDER ────────────────────────
  const totale = spese.reduce((t, r) => t + Number(r.amount||0)* (r.qty||1), 0)

  return (
    <>
      <Head><title>Spese Casa</title></Head>
      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2>🏠 Spese Casa</h2>

          <div className="table-buttons">
            <button onClick={()=>formRef.current?.scrollIntoView()}>➕ Manuale</button>
            <button onClick={toggleRec}>{recBusy?'⏹ Stop':'🎙 Voce'}</button>
            <button onClick={()=>ocrInputRef.current?.click()}>📷 OCR</button>
          </div>

          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={e=>handleOCR(e.target.files?.[0])}
          />

          {/* … il resto (form, tabella, stile) rimane identico a prima … */}

        </div>
      </div>
    </>
  )
}

export default withAuth(SpeseCasa)
