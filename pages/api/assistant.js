// pages/api/assistant.js
import OpenAI from 'openai';

export const config = {
  runtime: 'edge',          // facoltativo: riduce cold-start su Vercel (Node ovviamente OK)
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` });
  }

  try {
    const { prompt = '' } = req.body;
    if (!prompt.trim()) {
      return res.status(400).json({ error: 'Prompt mancante' });
    }

    const assistantId = process.env.OPENAI_ASSISTANT_ID;
    if (!assistantId) {
      return res.status(500).json({ error: 'OPENAI_ASSISTANT_ID non configurato' });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    /* 1. Crea thread */
    const { id: threadId } = await openai.beta.threads.create();

    /* 2. Aggiunge il messaggio dell’utente */
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: prompt,
    });

    /* 3. Avvia il run */
    let run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      response_format: { type: 'json_object' },
    });

    /* 4. Polling semplice finché non è completo */
    // (max 30 s per sicurezza)
    const deadline = Date.now() + 30_000;
    while (run.status !== 'completed') {
      if (['failed', 'expired', 'cancelled'].includes(run.status)) {
        throw new Error(`Assistant run ${run.status}`);
      }
      if (Date.now() > deadline) throw new Error('Run timeout');

      await new Promise(r => setTimeout(r, 1000));
      run = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    /* 5. Recupera l’ultima risposta del thread */
    const { data: messages } = await openai.beta.threads.messages.list(threadId, { limit: 1 });
    const answer = messages?.[0]?.content?.[0]?.text?.value?.trim() || '';

    return res.status(200).json({ answer });
  } catch (err) {
    console.error('Assistant API error:', err);
    // Risposta generica + dettagli (solo in dev) per debugging
    return res.status(500).json({
      error: 'Assistant failure',
      details: process.env.NODE_ENV === 'development' ? `${err}` : undefined,
    });
  }
}
