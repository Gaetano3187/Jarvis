// pages/spese-casa.js
import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'

import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

const CATEGORY_ID_CASA = '4cfaac74-aab4-4d96-b335-6cc64de59afc'

function SpeseCasa() {
  /* STATE & REFS */
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

  /* CARICAMENTO DATI */
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

  /* INSERIMENTO MANUALE */
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

  /* DELETE */
  const handleDelete = async (id) => {
    const { error: deleteError } = await supabase
      .from('finances')
      .delete()
      .eq('id', id)
    if (deleteError) setError(deleteError.message)
    else setSpese(spese.filter((r) => r.id !== id))
  }

  /* OCR */
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

  /* RECORDING */
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

  /* SYSTEM PROMPT */
  const buildSystemPrompt = (source, userText) => `
**ATTENZIONE:** il testo che segue è il risultato di una trascrizione vocale.  
Potrebbe contenere errori di punteggiatura, parole ripetute o intercalari come “ehm”, “allora”, “ok”.  
**Ignora** questi artefatti e concentra l’attenzione solo sui dati di spesa.

**CONTESTO:** l’utente sta annotando una **spesa domestica**. Tu sei Jarvis, un assistente che estrae da frasi in italiano i dettagli di un acquisto e restituisce **solo** JSON valido.

Rispondi **esclusivamente** con JSON conforme al seguente schema:

\`\`\`json
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
\`\`\`

ESEMPIO 1 (non da ripetere)  
Input: "Ho preso 3 pacchi di pasta Barilla a 2.50 euro al Supermercato Rossi il 10 luglio 2025"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Supermercato Rossi",
      "dettaglio":"3 pacchi di pasta Barilla",
      "prezzoTotale":2.50,
      "quantita":3,
      "data":"2025-07-10",
      "categoria":"casa",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 2 (non da ripetere)  
Input: "Ho comprato al supermercato Orsini Market una confezione di latte a 20 euro"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Orsini Market",
      "dettaglio":"1 confezione di latte",
      "prezzoTotale":20.00,
      "quantita":1,
      "data":"oggi",
      "categoria":"casa",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 3 (non da ripetere)  
Input: "Ieri ho acquistato 2 biglietti del cinema a 18 euro in totale al Cinema Lux"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Cinema Lux",
      "dettaglio":"2 biglietti del cinema",
      "prezzoTotale":18.00,
      "quantita":2,
      "data":"ieri",
      "categoria":"tempo libero",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 4 (non da ripetere)  
Input: "Ho speso 45,99€ su Amazon per un paio di cuffie il 15 giugno 2025"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Amazon",
      "dettaglio":"1 paio di cuffie",
      "prezzoTotale":45.99,
      "quantita":1,
      "data":"2025-06-15",
      "categoria":"tecnologia",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 5 (non da ripetere)  
Input: "Al benzinaio Shell ho fatto il pieno: 50 litri di benzina a 1,80 al litro"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Shell",
      "dettaglio":"50 litri di benzina",
      "prezzoTotale":90.00,
      "quantita":50,
      "data":"oggi",
      "categoria":"trasporti",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 6 (non da ripetere)  
Input: "Ho ordinato da Just Eat 3 pizze margherita per 24 euro totali"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Just Eat",
      "dettaglio":"3 pizze margherita",
      "prezzoTotale":24.00,
      "quantita":3,
      "data":"oggi",
      "categoria":"casa",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 7 (non da ripetere)  
Input: "Pagato abbonamento palestra mensile di 60€ oggi"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Palestra (abbonamento)",
      "dettaglio":"Abbonamento mensile palestra",
      "prezzoTotale":60.00,
      "quantita":1,
      "data":"oggi",
      "categoria":"salute",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 8 (non da ripetere)  
Input: "Ho comprato un biglietto del treno Frecciarossa Roma-Milano per 79,50€ il 2 agosto 2025"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Frecciarossa",
      "dettaglio":"Biglietto treno Roma-Milano",
      "prezzoTotale":79.50,
      "quantita":1,
      "data":"2025-08-02",
      "categoria":"trasporti",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 9 (non da ripetere)  
Input: "Ho speso 12 euro al bar Caffè Italia per due cappuccini e due cornetti questa mattina"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Caffè Italia",
      "dettaglio":"2 cappuccini e 2 cornetti",
      "prezzoTotale":12.00,
      "quantita":4,
      "data":"oggi",
      "categoria":"casa",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 10 – Vestiti (non da ripetere)  
Input: "Ieri ho comprato da Zara 2 magliette a 12,99€ ciascuna"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Zara",
      "dettaglio":"2 magliette",
      "prezzoTotale":25.98,
      "quantita":2,
      "data":"ieri",
      "categoria":"vestiti",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 11 – Vestiti (non da ripetere)  
Input: "Ho preso un paio di jeans Levi's su Amazon a 59,90 euro il 18 aprile 2025"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Amazon",
      "dettaglio":"1 paio di jeans Levi's",
      "prezzoTotale":59.90,
      "quantita":1,
      "data":"2025-04-18",
      "categoria":"vestiti",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 12 – Cene (non da ripetere)  
Input: "Stasera cena al Ristorante Da Gino: conto totale 80 euro per 2 persone"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Ristorante Da Gino",
      "dettaglio":"2 coperti (cena)",
      "prezzoTotale":80.00,
      "quantita":2,
      "data":"oggi",
      "categoria":"cene",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 13 – Cene (non da ripetere)  
Input: "Ho speso 35,50€ per una cena da Sushi House ieri sera"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Sushi House",
      "dettaglio":"1 cena",
      "prezzoTotale":35.50,
      "quantita":1,
      "data":"ieri",
      "categoria":"cene",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 14 – Varie (non da ripetere)  
Input: "Ricarica telefonica Vodafone 20 euro oggi"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Vodafone",
      "dettaglio":"Ricarica telefonica",
      "prezzoTotale":20.00,
      "quantita":1,
      "data":"oggi",
      "categoria":"varie",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

ESEMPIO 15 – Varie (non da ripetere)  
Input: "Pagato parcheggio 4 ore al Parcheggio Centrale: 8 euro il 25 luglio 2025"  
Output:
\`\`\`json
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Parcheggio Centrale",
      "dettaglio":"4 ore di parcheggio",
      "prezzoTotale":8.00,
      "quantita":4,
      "data":"2025-07-25",
      "categoria":"varie",
      "category_id":"${CATEGORY_ID_CASA}"
    }
  ]
}
\`\`\`

Ora comprendi la frase proveniente da **${source}** e restituisci solo il JSON:

"${userText.trim()}"
`

  /* CHIAMATA E PARSING GPT */
  async function parseAssistantPrompt(prompt) {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) {
        const txt = await res.text()
        console.error('assistant error', res.status, txt)
        setError(`Assistant ${res.status}`)
        return
      }
      const { answer, error: apiErr } = await res.json()
      if (apiErr) {
        setError(`Assistant: ${apiErr}`)
        return
      }
      console.log('[assistant-raw]', answer)
      const data = JSON.parse(answer)
      if (data.type !== 'expense' || !Array.isArray(data.items) || !data.items.length) {
        setError('Risposta assistant non valida')
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const rows = data.items.map((it) => {
        let spentDate = it.data
        if (spentDate === 'oggi') {
          spentDate = new Date().toISOString().slice(0, 10)
        } else if (spentDate === 'ieri') {
          const d = new Date()
          d.setDate(d.getDate() - 1)
          spentDate = d.toISOString().slice(0, 10)
        } else if (spentDate === 'domani') {
          const d = new Date()
          d.setDate(d.getDate() + 1)
          spentDate = d.toISOString().slice(0, 10)
        }
        return {
          user_id: user.id,
          category_id: CATEGORY_ID_CASA,
          description: `[${it.puntoVendita || 'Sconosciuto'}] ${it.dettaglio || 'spesa'}`,
          amount: Number(it.prezzoTotale || 0),
          spent_at: spentDate,
          qty: parseInt(it.quantita || 1, 10),
        }
      })

      const { error: dbErr } = await supabase.from('finances').insert(rows)
      if (dbErr) {
        setError(dbErr.message)
        return
      }
      fetchSpese()

      const f = rows[0]
      setNuovaSpesa({
        puntoVendita: f.description.match(/^\[(.*?)\]/)?.[1] || '',
        dettaglio: f.description.replace(/^\[.*?\]\s*/, ''),
        prezzoTotale: f.amount,
        quantita: String(f.qty),
        spentAt: f.spent_at.slice(0, 10),
      })
    } catch (err) {
      console.error(err)
      setError('Risposta assistant non valida')
    }
  }

  /* RENDER */
  const totale = spese.reduce(
    (t, r) => t + Number(r.amount || 0) * (r.qty ?? 1),
    0
  )

  return (
    <>
      <Head>
        <title>Spese Casa</title>
      </Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          {/* resto del JSX e stili invariati */}
        </div>
      </div>
    </>
  )
}

export default withAuth(SpeseCasa)
