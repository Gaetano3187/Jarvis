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

  const handleAdd = async (e) => {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Sessione scaduta')
      return
    }
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

  const handleDelete = async (id) => {
    const { error: deleteError } = await supabase
      .from('finances')
      .delete()
      .eq('id', id)
    if (deleteError) setError(deleteError.message)
    else setSpese(spese.filter((r) => r.id !== id))
  }

  const handleOCR = async (file) => {
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('image', file)
      const { text } = await (
        await fetch('/api/ocr', { method: 'POST', body: fd })
      ).json()
      await parseAssistantPrompt(buildSystemPrompt('ocr', text))
    } catch {
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
      mediaRecRef.current.ondataavailable = (e) =>
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
      const { text } = await (
        await fetch('/api/stt', { method: 'POST', body: fd })
      ).json()
      await parseAssistantPrompt(buildSystemPrompt('voice', text))
    } catch {
      setError('STT fallito')
    } finally {
      setRecBusy(false)
    }
  }

  const buildSystemPrompt = (source, userText) => `
ATTENZIONE: il testo seguente è una trascrizione vocale ed
è pieno di “ehm”, ripetizioni, punteggiatura mancante.
Ignora questi artefatti e considera solo i dati della spesa.

CONTESTO: annotazione di una spesa domestica.  
Sei Jarvis, estrai **solo** JSON valido:

Schema:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": string,
      "dettaglio": string,
      "prezzoTotale": number,
      "quantita": number,
      "data": "YYYY-MM-DD" | "oggi" | "ieri" | "domani",
      "categoria": string,
      "category_id": "${CATEGORY_ID_CASA}"
    }
  ]
}

Esempi (non ripeterli):
1) Input: "Ho preso 3 pacchi di pasta Barilla a 2.50 euro al Supermercato Rossi il 10 luglio 2025"
   Output: {"type":"expense","items":[{"puntoVendita":"Supermercato Rossi","dettaglio":"3 pacchi di pasta Barilla","prezzoTotale":2.5,"quantita":3,"data":"2025-07-10","categoria":"casa","category_id":"${CATEGORY_ID_CASA}"}]}
2) Input: "Ho comprato una confezione di latte a 20 euro"
   Output: {"type":"expense","items":[{"puntoVendita":"Sconosciuto","dettaglio":"1 confezione di latte","prezzoTotale":20,"quantita":1,"data":"oggi","categoria":"casa","category_id":"${CATEGORY_ID_CASA}"}]}
3) Input: "Ieri ho acquistato 2 biglietti del cinema a 18 euro in totale al Cinema Lux"
   Output: {"type":"expense","items":[{"puntoVendita":"Cinema Lux","dettaglio":"2 biglietti del cinema","prezzoTotale":18,"quantita":2,"data":"ieri","categoria":"tempo libero","category_id":"${CATEGORY_ID_CASA}"}]}

Ora elabora la frase:
"${userText.trim()}"
`

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
      if (data.type !== 'expense' || !data.items?.length) {
        setError('Risposta assistant non valida')
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const rows = data.items.map((it) => {
        let d = it.data.toLowerCase()
        let spentDate
        if (d === 'oggi') spentDate = new Date().toISOString().slice(0, 10)
        else if (d === 'ieri') {
          const x = new Date()
          x.setDate(x.getDate() - 1)
          spentDate = x.toISOString().slice(0, 10)
        } else if (d === 'domani') {
          const x = new Date()
          x.setDate(x.getDate() + 1)
          spentDate = x.toISOString().slice(0, 10)
        } else {
          spentDate = it.data
        }
        return {
          user_id: user.id,
          category_id: CATEGORY_ID_CASA,
          description: `[${it.puntoVendita||'Sconosciuto'}] ${it.dettaglio}`,
          amount: Number(it.prezzoTotale),
          spent_at: spentDate,
          qty: parseInt(it.quantita, 10),
        }
      })

      const { error: dbErr } = await supabase.from('finances').insert(rows)
      if (dbErr) {
        setError(dbErr.message)
        return
      }
      fetchSpese()
    } catch (err) {
      setError('Risposta assistant non valida')
    }
  }

  const totale = spese.reduce((sum, r) => sum + r.amount * (r.qty || 1), 0)

  return (
    <>
      <Head>
        <title>Spese Casa</title>
      </Head>
      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2>🏠 Spese Casa</h2>
          {/* pulsanti e form ... */}
          <div className="table-container">
            {loading ? (
              <p>Caricamento…</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Punto vendita</th>
                    <th>Dettaglio</th>
                    <th>Data</th>
                    <th>Qtà</th>
                    <th>Prezzo €</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map((r) => (
                    <tr key={r.id}>
                      <td>{r.description.match(/^\[(.*?)\]/)?.[1]}</td>
                      <td>{r.description.replace(/^\[.*?\]\s*/, '')}</td>
                      <td>{new Date(r.spent_at).toLocaleDateString()}</td>
                      <td>{r.qty}</td>
                      <td>{r.amount.toFixed(2)}</td>
                      <td>
                        <button onClick={() => handleDelete(r.id)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div>Totale: € {totale.toFixed(2)}</div>
          </div>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <Link href="/home">🏠 Home</Link>
        </div>
      </div>
      {/* stili CSS globali ... */}
    </>
  )
}

export default withAuth(SpeseCasa)
