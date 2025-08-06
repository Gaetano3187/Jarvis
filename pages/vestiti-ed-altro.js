// pages/vestiti-ed-altro.js
import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'
import { askAssistant } from '@/lib/assistant'

const CATEGORY_ID_VESTITI = '89e223d4-1ec0-4631-b0d4-52472579a04a'

function VestitiEdAltro() {
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recBusy, setRecBusy] = useState(false)
  const [nuovaSpesa, setNuovaSpesa] = useState({
    descrizione: '',
    importo: '',
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
      .eq('category_id', CATEGORY_ID_VESTITI)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setSpese(data)
    setLoading(false)
  }

  /* ------------------------ INSERIMENTO MANUALE ------------------------ */
  const handleAdd = async e => {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return setError('Sessione scaduta')

    const row = {
      user_id: user.id,
      category_id: CATEGORY_ID_VESTITI,
      description: nuovaSpesa.descrizione,
      amount: Number(nuovaSpesa.importo),
      spent_at: nuovaSpesa.spentAt || new Date().toISOString(),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1,
    }

    const { error: insertError } = await supabase.from('finances').insert(row)
    if (insertError) setError(insertError.message)
    else {
      setNuovaSpesa({ descrizione: '', importo: '', quantita: '1', spentAt: '' })
      fetchSpese()
    }
  }

  /* ------------------------------ DELETE -------------------------------- */
  const handleDelete = async id => {
    const { error } = await supabase.from('finances').delete().eq('id', id)
    if (error) setError(error.message)
    else setSpese(spese.filter(s => s.id !== id))
  }

  /* -------------------------------- OCR --------------------------------- */
  const handleOCR = async file => {
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('image', file)
      // 1) estrai il testo via API OCR
      const { text } = await (await fetch('/api/ocr', { method: 'POST', body: fd })).json()
      // 2) passa il testo a GPT
      await parseAssistantPrompt(buildSystemPrompt('ocr', text))
    } catch {
      setError('OCR fallito')
    }
  }

  /* ----------------------------- RECORDING ------------------------------ */
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

  /* -------------------------- SYSTEM PROMPT ----------------------------- */
  const buildSystemPrompt = (source, userText) => {
    if (source === 'ocr') {
      return `
Sei Jarvis. Da questo testo OCR estrai **solo** i dati di spesa in formato JSON.

Ogni spesa deve avere:
- descrizione: string
- prezzoUnitario: number | null
- quantita: number
- prezzoTotale: number
- data: "YYYY-MM-DD" | "oggi" | "ieri"

Rispondi **solo** con JSON conforme a questo schema:
\`\`\`json
{
  "type": "expense",
  "items": [
    {
      "descrizione": "1 paio di jeans",
      "prezzoUnitario": 59.90,
      "quantita": 1,
      "prezzoTotale": 59.90,
      "data": "oggi"
    }
    /* altri items... */
  ]
}
\`\`\`

TESTO_OCR:
${userText}
      `
    }

    // voce / testo libero
    return `
**ATTENZIONE:** il testo che segue è trascrizione vocale, ignora "ehm", "ok", ecc.

Ora estrai **solo** JSON spesa nello stesso schema di prima.

ESEMPIO:
Input: "Ho preso un paio di jeans Levi's su Amazon a 59,90 euro il 18 aprile 2025"
Output:
{
  "type":"expense",
  "items":[
    {
      "descrizione":"Jeans Levi's",
      "prezzoUnitario":59.90,
      "quantita":1,
      "prezzoTotale":59.90,
      "data":"2025-04-18"
    }
  ]
}

Ora capisci la frase seguente e compila i campi:
"${userText}"
      `
  }

  /* ---------------------- CHIAMATA E PARSING GPT ------------------------ */
  async function parseAssistantPrompt(prompt) {
    try {
      const { answer, error: apiErr } = await askAssistant(prompt)
      if (apiErr) throw new Error(apiErr)

      const data = JSON.parse(answer)
      if (data.type !== 'expense' || !Array.isArray(data.items) || !data.items.length)
        throw new Error('Risposta assistant non valida')

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      const rows = data.items.map(it => {
        let spentAt = it.data
        if (it.data === 'oggi') {
          spentAt = new Date().toISOString().slice(0, 10)
        } else if (it.data === 'ieri') {
          const d = new Date()
          d.setDate(d.getDate() - 1)
          spentAt = d.toISOString().slice(0, 10)
        }
        return {
          user_id: user.id,
          category_id: CATEGORY_ID_VESTITI,
          description: it.descrizione,
          amount: Number(it.prezzoTotale) || 0,
          spent_at: spentAt,
          qty: parseFloat(it.quantita) || 1,
        }
      })

      const { error: dbErr } = await supabase.from('finances').insert(rows)
      if (dbErr) throw dbErr

      fetchSpese()
      const f = rows[0]
      setNuovaSpesa({
        descrizione: f.description,
        importo: f.amount,
        quantita: String(f.qty),
        spentAt: f.spent_at.slice(0, 10),
      })
    } catch (err) {
      console.error(err)
      setError(err.message)
    }
  }

  /* -------------------------------- RENDER ------------------------------- */
  const totale = spese.reduce((sum, s) => sum + Number(s.amount || 0) * (s.qty || 1), 0)

  return (
    <>
      <Head>
        <title>Vestiti ed Altro</title>
      </Head>

      <div className="vestiti-ed-altro-container1">
        <div className="vestiti-ed-altro-container2">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: '#fff' }}>
            🛍️ Vestiti ed Altro
          </h2>

          <div className="table-buttons">
            <button className="btn-manuale" onClick={() => formRef.current?.scrollIntoView()}>
              ➕ Aggiungi manualmente
            </button>
            <button className="btn-vocale" onClick={toggleRec}>
              {recBusy ? '⏹ Stop' : '🎙 Voce'}
            </button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>
              📷 OCR
            </button>
          </div>

          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={e => handleOCR(e.target.files?.[0])}
          />

          <form ref={formRef} onSubmit={handleAdd} className="input-section">
            <label>Descrizione</label>
            <input
              value={nuovaSpesa.descrizione}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, descrizione: e.target.value })}
              required
            />

            <label>Importo (€)</label>
            <input
              type="number"
              step="0.01"
              value={nuovaSpesa.importo}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, importo: e.target.value })}
              required
            />

            <label>Quantità</label>
            <input
              type="number"
              min="1"
              value={nuovaSpesa.quantita}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })}
              required
            />

            <label>Data</label>
            <input
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })}
            />

            <button type="submit" className="btn-manuale">
              Salva
            </button>
          </form>

          <div className="table-container">
            {loading ? (
              <p>Caricamento…</p>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Descrizione</th>
                    <th>Data</th>
                    <th>Qtà</th>
                    <th>Importo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map(s => (
                    <tr key={s.id}>
                      <td>{s.description}</td>
                      <td>{new Date(s.spent_at).toLocaleDateString()}</td>
                      <td>{s.qty}</td>
                      <td>{s.amount.toFixed(2)}</td>
                      <td>
                        <button onClick={() => handleDelete(s.id)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="total-box">Totale: € {totale.toFixed(2)}</div>
          </div>

          {error && <p style={{ color: 'red' }}>{error}</p>}

          <Link href="/home" className="btn-vocale" style={{ marginTop: '1.5rem', textDecoration: 'none' }}>
            🏠 Home
          </Link>
        </div>
      </div>

      <style jsx>{`
        /* qui incolla gli stessi stili di spese-casa */
      `}</style>
    </>
  )
}

export default withAuth(VestitiEdAltro)
