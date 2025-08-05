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

  const handleOCR = async file => {
    reader.onload = async () => {
  const base64 = reader.result.split(',')[1];
  // 2) Costruisci un prompt ad hoc con campi dettagliati
  const prompt = `
Sei Jarvis. Da questa immagine OCR (base64) estrai **solo** i dati di spesa in formato JSON.

Ogni spesa deve avere:
- puntoVendita: string  
- items: array di oggetti con:
  - prodotto: string  
  - prezzoUnitario: number | null  
  - quantita: number  
  - prezzoTotale: number  
- data: "YYYY-MM-DD" oppure "oggi"/"ieri"/"domani"

Rispondi **solo** con JSON conforme a questo schema:
\`\`\`json
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Supermercato Rossi",
      "prodotto": "Latte UHT",
      "prezzoUnitario": 2.50,
      "quantita": 1,
      "prezzoTotale": 2.50,
      "data": "oggi"
    }
    /* altri items... */
  ]
}
\`\`\`

IMMAGINE_BASE64:
${base64}
`;

  try {
    const { answer } = await askAssistant(prompt);
    console.log('🛈 Assistant OCR:', answer);
    // qui puoi parsare `answer` e popolare il form/lo stato come fai per la voce
  } catch (err) {
    console.error(err);
    alert('OCR fallito');
  }
};
reader.readAsDataURL(file);

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

  const buildSystemPrompt = (source, userText) => {
    return `
Sei Jarvis. Rispondi **solo** con JSON conforme al seguente schema, senza testo extra.

ESEMPIO 1
Input: "Ho preso 3 pacchi di pasta Barilla a 2.50 euro al Supermercato Rossi il 10 luglio 2025"
Output:
{
  "type":"expense",
  "items":[{ "puntoVendita":"Supermercato Rossi","dettaglio":"3 pacchi di pasta Barilla","prezzoTotale":2.50,"quantita":3,"data":"2025-07-10","categoria":"casa","category_id":"${CATEGORY_ID_CASA}" }]
}

ESEMPIO 2
Input: "Ho comprato al supermercato Orsini Market una confezione di latte a 20 euro"
Output:
{
  "type":"expense",
  "items":[{ "puntoVendita":"Orsini Market","dettaglio":"1 confezione di latte","prezzoTotale":20.00,"quantita":1,"data":"oggi","categoria":"casa","category_id":"${CATEGORY_ID_CASA}" }]
}

ESEMPIO 1
Input: "Ho preso 3 pacchi di pasta Barilla a 2.50 euro al Supermercato Rossi il 10 luglio 2025"
Output:
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
      "category_id":"\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 2
Input: "Ho comprato al supermercato Orsini Market una confezione di latte a 20 euro"
Output:
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Orsini Market",
      "dettaglio":"1 confezione di latte",
      "prezzoTotale":20.00,
      "quantita":1,
      "data":"<ODIERNA>",
      "categoria":"casa",
      "category_id":"\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 3
Input: "Ieri ho acquistato 2 biglietti del cinema a 18 euro in totale al Cinema Lux"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Cinema Lux",
      "dettaglio": "2 biglietti del cinema",
      "prezzoTotale": 18.00,
      "quantita": 2,
      "data": "<IERI>",
      "categoria": "tempo libero",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 4
Input: "Ho speso 45,99€ su Amazon per un paio di cuffie il 15 giugno 2025"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Amazon",
      "dettaglio": "1 paio di cuffie",
      "prezzoTotale": 45.99,
      "quantita": 1,
      "data": "2025-06-15",
      "categoria": "tecnologia",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 5
Input: "Al benzinaio Shell ho fatto il pieno: 50 litri di benzina a 1,80 al litro"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Shell",
      "dettaglio": "50 litri di benzina",
      "prezzoTotale": 90.00,
      "quantita": 50,
      "data": "<ODIERNA>",
      "categoria": "trasporti",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 6
Input: "Ho ordinato da Just Eat 3 pizze margherita per 24 euro totali"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Just Eat",
      "dettaglio": "3 pizze margherita",
      "prezzoTotale": 24.00,
      "quantita": 3,
      "data": "<ODIERNA>",
      "categoria": "casa",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 7
Input: "Pagato abbonamento palestra mensile di 60€ oggi"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Palestra (abbonamento)",
      "dettaglio": "Abbonamento mensile palestra",
      "prezzoTotale": 60.00,
      "quantita": 1,
      "data": "<ODIERNA>",
      "categoria": "salute",
      "category_id": "\${CATEGORY_ID_VARIE}"
    }
  ]
}

ESEMPIO 8
Input: "Ho comprato un biglietto del treno Frecciarossa Roma-Milano per 79,50€ il 2 agosto 2025"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Frecciarossa",
      "dettaglio": "Biglietto treno Roma-Milano",
      "prezzoTotale": 79.50,
      "quantita": 1,
      "data": "2025-08-02",
      "categoria": "trasporti",
      "category_id": "\${CATEGORY_ID_VARIE}"
    }
  ]
}

ESEMPIO 9
Input: "Ho speso 12 euro al bar Caffè Italia per due cappuccini e due cornetti questa mattina"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Caffè Italia",
      "dettaglio": "2 cappuccini e 2 cornetti",
      "prezzoTotale": 12.00,
      "quantita": 4,
      "data": "<ODIERNA>",
      "categoria": "casa",
      "category_id": "\${CATEGORY_ID_CASA}"
    }
  ]
}

ESEMPIO 10 – Vestiti
Input: "Ieri ho comprato da Zara 2 magliette a 12,99€ ciascuna"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Zara",
      "dettaglio": "2 magliette",
      "prezzoTotale": 25.98,
      "quantita": 2,
      "data": "<IERI>",
      "categoria": "vestiti",
      "category_id": "\${CATEGORY_ID_VESTITI}"
    }
  ]
}

ESEMPIO 11 – Vestiti
Input: "Ho preso un paio di jeans Levi's su Amazon a 59,90 euro il 18 aprile 2025"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Amazon",
      "dettaglio": "1 paio di jeans Levi's",
      "prezzoTotale": 59.90,
      "quantita": 1,
      "data": "2025-04-18",
      "categoria": "vestiti",
      "category_id": "\${CATEGORY_ID_VESTITI}"
    }
  ]
}

ESEMPIO 12 – Cene
Input: "Stasera cena al Ristorante Da Gino: conto totale 80 euro per 2 persone"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Ristorante Da Gino",
      "dettaglio": "2 coperti (cena)",
      "prezzoTotale": 80.00,
      "quantita": 2,
      "data": "<ODIERNA>",
      "categoria": "cene",
      "category_id": "\${CATEGORY_ID_CENE}"
    }
  ]
}

ESEMPIO 13 – Cene
Input: "Ho speso 35,50€ per una cena da Sushi House ieri sera"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Sushi House",
      "dettaglio": "1 cena",
      "prezzoTotale": 35.50,
      "quantita": 1,
      "data": "<IERI>",
      "categoria": "cene",
      "category_id": "\${CATEGORY_ID_CENE}"
    }
  ]
}

ESEMPIO 14 – Varie
Input: "Ricarica telefonica Vodafone 20 euro oggi"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Vodafone",
      "dettaglio": "Ricarica telefonica",
      "prezzoTotale": 20.00,
      "quantita": 1,
      "data": "<ODIERNA>",
      "categoria": "varie",
      "category_id": "\${CATEGORY_ID_VARIE}"
    }
  ]
}

ESEMPIO 15 – Varie
Input: "Pagato parcheggio 4 ore al Parcheggio Centrale: 8 euro il 25 luglio 2025"
Output:
{
  "type": "expense",
  "items": [
    {
      "puntoVendita": "Parcheggio Centrale",
      "dettaglio": "4 ore di parcheggio",
      "prezzoTotale": 8.00,
      "quantita": 4,
      "data": "2025-07-25",
      "categoria": "varie",
      "category_id": "\${CATEGORY_ID_VARIE}"
    }
  ]
}

Ora capisci la frase seguente (proveniente da **\${source}**) e compila i campi:
"\${userText}"
  ;
};



Ora capisci la frase seguente (proveniente da **${source}**) e compila i campi:
"${userText}"
`
  }

  async function parseAssistantPrompt(prompt) {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })

      const rawBody = await res.text()
      console.log('--- /api/assistant raw response ---', rawBody)

      if (!res.ok) {
        return setError(`Assistant ${res.status}: ${rawBody}`)
      }

      const { answer, error: apiErr } = JSON.parse(rawBody)
      console.log('--- assistant raw answer ---', answer)
      if (apiErr) {
        setError(`Assistant: ${apiErr}`)
        return
      }

      const data = JSON.parse(answer)
      console.log('parsed data:', data)
      console.log('items:', data.items)

      if (
        data.type !== 'expense' ||
        !Array.isArray(data.items) ||
        data.items.length === 0
      ) {
        setError('Risposta assistant non valida')
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const rows = data.items.map(it => {
        const rawPV = String(it.puntoVendita || '').trim().toLowerCase()
        const pd =
          rawPV && rawPV !== 'undefined' ? it.puntoVendita : 'Sconosciuto'
        const rawDT = String(it.dettaglio || '').trim().toLowerCase()
        const dt = rawDT && rawDT !== 'undefined' ? it.dettaglio : 'spesa'
        const pr = Number(it.prezzoTotale)
        const price = isNaN(pr) ? 0 : pr

        let dRaw = String(it.data).toLowerCase(),
          spentAt
        if (dRaw === 'oggi') {
          spentAt = new Date().toISOString().slice(0, 10)
        } else if (dRaw === 'ieri') {
          const d = new Date()
          d.setDate(d.getDate() - 1)
          spentAt = d.toISOString().slice(0, 10)
        } else if (dRaw === 'domani') {
          const d = new Date()
          d.setDate(d.getDate() + 1)
          spentAt = d.toISOString().slice(0, 10)
        } else {
          spentAt = it.data
        }

        return {
          user_id: user.id,
          category_id: CATEGORY_ID_CASA,
          description: `[${pd}] ${dt}`,
          amount: price,
          spent_at: spentAt,
          qty: parseInt(it.quantita, 10) || 1,
        }
      })
      console.log('parsed rows:', rows)

      const { data: inserted, error: insertErr } = await supabase
        .from('finances')
        .insert(rows)
        .select()
      console.log('insert result:', { inserted, insertErr })
      if (insertErr) {
        setError(insertErr.message)
        return
      }

      fetchSpese()
      const f = inserted[0]
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
          <h2
            style={{
              marginBottom: '1rem',
              fontSize: '1.5rem',
              color: '#fff',
            }}
          >
            🏠 Spese Casa
          </h2>

          <div className="table-buttons">
            <button
              className="btn-manuale"
              onClick={() => formRef.current?.scrollIntoView()}
            >
              ➕ Aggiungi manualmente
            </button>
            <button className="btn-vocale" onClick={toggleRec}>
              {recBusy ? '⏹ Stop' : '🎙 Voce'}
            </button>
            <button
              className="btn-ocr"
              onClick={() => ocrInputRef.current?.click()}
            >
              📷 OCR
            </button>
          </div>

          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={e => handleOCR(e.target.files?.[0])}
          />

          <form
            className="input-section"
            ref={formRef}
            onSubmit={handleAdd}
          >
            <label htmlFor="vendita">Punto vendita / Servizio</label>
            <input
              id="vendita"
              value={nuovaSpesa.puntoVendita}
              onChange={e =>
                setNuovaSpesa({
                  ...nuovaSpesa,
                  puntoVendita: e.target.value,
                })
              }
              required
            />

            <label htmlFor="quantita">Quantità</label>
            <input
              id="quantita"
              type="number"
              min="1"
              value={nuovaSpesa.quantita}
              onChange={e =>
                setNuovaSpesa({
                  ...nuovaSpesa,
                  quantita: e.target.value,
                })
              }
              required
            />

            <label htmlFor="dettaglio">Dettaglio della spesa</label>
            <textarea
              id="dettaglio"
              value={nuovaSpesa.dettaglio}
              onChange={e =>
                setNuovaSpesa({
                  ...nuovaSpesa,
                  dettaglio: e.target.value,
                })
              }
              required
            />

            <label htmlFor="data">Data di acquisto</label>
            <input
              id="data"
              type="date"
              value={nuovaSpesa.spentAt}
              onChange={e =>
                setNuovaSpesa({
                  ...nuovaSpesa,
                  spentAt: e.target.value,
                })
              }
              required
            />

            <label htmlFor="prezzo">Prezzo totale (€)</label>
            <input
              id="prezzo"
              type="number"
              step="0.01"
              value={nuovaSpesa.prezzoTotale}
              onChange={e =>
                setNuovaSpesa({
                  ...nuovaSpesa,
                  prezzoTotale: e.target.value,
                })
              }
              required
            />

            <button
              className="btn-manuale"
              style={{ width: 'fit-content' }}
            >
              Aggiungi
            </button>
          </form>

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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map(r => {
                    const m =
                      r.description.match(/^\[(.*?)\]\s*(.*)$/) || []
                    return (
                      <tr key={r.id}>
                        <td>{m[1] || '-'}</td>
                        <td>{m[2] || r.description}</td>
                        <td>
                          {r.spent_at
                            ? new Date(r.spent_at).toLocaleDateString()
                            : ''}
                        </td>
                        <td>{r.qty || 1}</td>
                        <td>{Number(r.amount).toFixed(2)}</td>
                        <td>
                          <button onClick={() => handleDelete(r.id)}>
                            🗑
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <div className="total-box">
              Totale: € {totale.toFixed(2)}
            </div>
          </div>

          {error && <p style={{ color: 'red' }}>{error}</p>}
          <Link
            href="/home"
            className="btn-vocale"
            style={{ marginTop: '1.5rem', textDecoration: 'none' }}
          >
            🏠 Home
          </Link>
        </div>
      </div>

      <style jsx global>{`
        .spese-casa-container1 {
          width: 100%;
          display: flex;
          min-height: 100vh;
          align-items: center;
          justify-content: center;
          background: #0f172a;
          font-family: Inter, sans-serif;
          padding: 2rem;
        }
        .spese-casa-container2 {
          max-width: 800px;
          width: 100%;
          background: rgba(0, 0, 0, 0.6);
          padding: 2rem;
          border-radius: 1rem;
          color: #fff;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        }
        .table-buttons {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }
        .btn-manuale {
          background: #22c55e;
          color: #fff;
        }
        .btn-vocale {
          background: #10b981;
          color: #fff;
        }
        .btn-ocr {
          background: #f43f5e;
          color: #fff;
        }
        input,
        textarea {
          width: 100%;
          padding: 0.6rem;
          border: none;
          border-radius: 0.5rem;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        textarea {
          min-height: 4.5rem;
          resize: vertical;
        }
        .input-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }
        .custom-table {
          width: 100%;
          border-collapse: collapse;
        }
        .custom-table thead {
          background: #1f2937;
        }
        .custom-table th,
        .custom-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .custom-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .total-box {
          margin-top: 1rem;
          background: rgba(34, 197, 94, 0.8);
          padding: 1rem;
          border-radius: 0.5rem;
          text-align: right;
          font-weight: 600;
        }
      `}</style>
    </>
  )
}



export default withAuth(SpeseCasa)
