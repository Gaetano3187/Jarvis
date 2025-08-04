// pages/api/assistant.js

import OpenAI from 'openai';

// singleton OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

export default async function handler(req, res) {
  // 1. solo POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res
      .status(405)
      .json({ error: `Metodo ${req.method} non consentito (usa POST)` });
  }

  try {
    // 2. validazione
    const { prompt = '' } = req.body ?? {};
    if (!prompt.trim()) {
      return res.status(400).json({ error: 'Prompt mancante' });
    }

    // 3. chiamiamo Chat Completion
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-3.5-turbo',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Sei Jarvis: l'assistente delle spese di casa. Rispondi **solo** con JSON conforme allo schema richiesto.`,
        },
        { role: 'user', content: prompt },
      ],
    });

    // 4. estraiamo e rimandiamo la risposta
    const answer = completion.choices?.[0]?.message?.content?.trim() ?? '';
    return res.status(200).json({ answer });
  } catch (err) {
    console.error('Assistant API error:', err);
    return res.status(500).json({
      error: 'Assistant failure',
      details: process.env.NODE_ENV === 'development' ? String(err) : undefined,
    });
  }
}
