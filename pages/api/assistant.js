// pages/api/assistant.js
import { askAssistant } from '@/lib/assistant'

export const config = {
  api: {
    bodyParser: true,        // Next.js parser JSON di default
    externalResolver: true,  // sopprime warning “API resolved…”
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` })
  }

  const { prompt, model, temperature } = req.body || {}

  /* ---------- validazione di base ---------- */
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Campo "prompt" mancante o vuoto' })
  }

  try {
    /* ---------- chiamata a ChatGPT ---------- */
    const risposta = await askAssistant(prompt, { model, temperature })

    // se OpenAI ha risposto con testo vuoto, lo gestiamo
    if (!risposta) {
      return res.status(502).json({ error: 'Assistant ha restituito risposta vuota' })
    }

    return res.status(200).json({ answer: risposta })
  } catch (err) {
    /* ---------- log esteso per debug ---------- */
    console.error('[api/assistant] OpenAI error →', err)

    /* OpenAI SDK spesso espone err.status / err.error */
    const status  = err?.status  || 500
    const message = err?.error?.message || err.message || 'Errore sconosciuto'

    return res.status(status).json({ error: message })
  }
}
