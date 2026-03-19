// pages/api/ocr-bill.js
// OCR specializzato per bollette italiane: luce, gas, acqua, internet, telefono
import multer from 'multer'
import OpenAI from 'openai'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })
function runMw(req, res, fn) { return new Promise((ok, ko) => fn(req, res, r => r instanceof Error ? ko(r) : ok(r))) }
export const config = { api: { bodyParser: false, externalResolver: true } }

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

const BILL_PROMPT = `Sei un esperto di bollette italiane. Analizza il testo e restituisci SOLO JSON valido:
{
  "type": "luce|gas|acqua|internet|telefono|condominio|altro",
  "provider": "nome fornitore (es. Enel Energia, ENI Gas, Italgas, Sorgenia, Tim, Fastweb)",
  "amount": 85.50,
  "period_from": "YYYY-MM-DD",
  "period_to": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "invoice_number": "numero fattura o null",
  "confidence": "high|medium|low"
}
Regole:
- type: kWh/Energia/Enel → "luce"; gas/mc/Smc/metano → "gas"; acqua/acquedotto → "acqua"
- amount: importo TOTALE da pagare (cerca "Totale da pagare", "Importo dovuto", "Da pagare entro")
- due_date: "entro il", "scadenza pagamento", "data scadenza"
- period_from/to: periodo di fornitura/competenza
- date formato italiano DD/MM/YYYY → converti in YYYY-MM-DD
- SOLO JSON valido, nessun testo extra`

function normDate(v) {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) >= 50 ? '19' : '20') + m[3] : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!openai) return res.status(500).json({ error: 'OpenAI non configurato' })
  try {
    await runMw(req, res, upload.single('image'))
    const file = req.file
    if (!file) return res.status(400).json({ error: 'Nessuna immagine' })

    const base64 = file.buffer.toString('base64')
    const mime   = file.mimetype || 'image/jpeg'

    // Step 1: trascrivi il testo
    const tx = await openai.chat.completions.create({
      model: 'gpt-4o', temperature: 0, max_tokens: 2000,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Trascrivi ESATTAMENTE tutto il testo visibile in questa bolletta, riga per riga, senza interpretare.' },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } }
      ]}]
    })
    const rawText = tx.choices?.[0]?.message?.content || ''
    if (!rawText) return res.status(422).json({ error: 'Testo non leggibile' })

    // Step 2: analisi strutturata
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o', temperature: 0, max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: `${BILL_PROMPT}\n\nTESTO BOLLETTA:\n${rawText}` }]
    })
    const data = JSON.parse(resp.choices?.[0]?.message?.content || '{}')

    return res.status(200).json({
      ok: true,
      type:           data.type || 'altro',
      provider:       data.provider || null,
      amount:         parseFloat(data.amount) || 0,
      period_from:    normDate(data.period_from),
      period_to:      normDate(data.period_to),
      due_date:       normDate(data.due_date),
      invoice_number: data.invoice_number || null,
      confidence:     data.confidence || 'medium',
      raw_text:       rawText.slice(0, 2000),
    })
  } catch (e) {
    console.error('[ocr-bill]', e?.message)
    return res.status(500).json({ error: e?.message || 'Errore OCR bolletta' })
  }
}