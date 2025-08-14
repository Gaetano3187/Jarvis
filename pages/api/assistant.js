// pages/api/assistant.js
import OpenAI from 'openai'
import { runBrainQuery } from '@/lib/brainQuery';


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res
      .status(405)
      .json({ error: `Metodo ${req.method} non consentito (usa POST)` })
  }

  try {
    const { prompt = '' } = req.body ?? {}
    if (!prompt.trim()) {
      return res.status(400).json({ error: 'Prompt mancante' })
    }

    // System prompt con few-shot examples e istruzioni
    const systemPrompt = `
Sei Jarvis, l’assistente per la finanza domestica. Rispondi **solo** con JSON conforme allo schema di spesa:
{
  "type":"expense",
  "items":[
    {
      "puntoVendita": "...",
      "dettaglio": "...",
      "prezzoTotale": 0.00,
      "quantita": 1,
      "data": "YYYY-MM-DD",
      "categoria": "casa",
      "category_id": "4cfaac74-aab4-4d96-b335-6cc64de59afc"
    }
  ]
}
Usa la data odierna se non indicata.

Esempi:
Input: "Ho preso 3 kg di mele a 4.50 euro al Mercato Centrale il 1 agosto 2025"
Output:
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Mercato Centrale",
      "dettaglio":"3 kg di mele",
      "prezzoTotale":4.50,
      "quantita":3,
      "data":"2025-08-01",
      "categoria":"casa",
      "category_id":"4cfaac74-aab4-4d96-b335-6cc64de59afc"
    }
  ]
}

Input: "Due pacchetti di sigarette a 20 euro alla Tabaccheria Casacchia"
Output:
{
  "type":"expense",
  "items":[
    {
      "puntoVendita":"Tabaccheria Casacchia",
      "dettaglio":"2 pacchetti di sigarette",
      "prezzoTotale":20.00,
      "quantita":2,
      "data":"${new Date().toISOString().slice(0,10)}",
      "categoria":"casa",
      "category_id":"4cfaac74-aab4-4d96-b335-6cc64de59afc"
    }
  ]
}
` // <-- QUI chiudiamo il backtick
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    })

    const answer = completion.choices?.[0]?.message?.content ?? ''
    return res.status(200).json({ answer })
  } catch (error) {
    console.error('Errore Assistant:', error)
    return res.status(500).json({ error: 'Errore interno assistant' })
  }
}
