// pages/api/assistant.js
import OpenAI from 'openai'

// singleton
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

    // usa direttamente un Chat Completion (gpt-4o o gpt-3.5-turbo)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // o 'gpt-3.5-turbo'
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        // puoi anche mettere qui un system-message fisso in stile “Sei Jarvis…”
        { role: 'user', content: prompt },
      ],
    })

    const answer = completion.choices?.[0]?.message?.content?.trim() || ''
    return res.status(200).json({ answer })
  } catch (err) {
    console.error('Assistant API error:', err)
    return res.status(500).json({
      error: 'Assistant failure',
      details: process.env.NODE_ENV === 'development' ? String(err) : undefined,
    })
  }
}
