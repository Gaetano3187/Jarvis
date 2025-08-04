// pages/api/assistant.js
import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────────────────────
//  Client singleton
// ─────────────────────────────────────────────────────────────────────────────
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

// ─────────────────────────────────────────────────────────────────────────────
//  API route  (runtime: Node)
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  /* 1. Consenti solo POST --------------------------------------------------- */
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res
      .status(405) // Method Not Allowed
      .json({ error: `Metodo ${req.method} non consentito (usa POST)` });
  }

  try {
    /* 2. Validazione input -------------------------------------------------- */
    const { prompt = '' } = req.body || {};
    if (!prompt.trim()) {
      return res.status(400).json({ error: 'Prompt mancante' });
    }

    const assistantId = process.env.OPENAI_ASSISTANT_ID;
    if (!assistantId) {
      return res
        .status(500)
        .json({ error: 'OPENAI_ASSISTANT_ID non configurato nel deploy' });
    }

    /* 3. Thread + messaggio utente ----------------------------------------- */
    const { id: threadId } = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: prompt,
    });

    /* 4. Avvio run e polling (timeout 30 s) -------------------------------- */
    let run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      response_format: { type: 'json_object' },
    });

    const deadline = Date.now() + 30_000; // 30 s
    while (run.status !== 'completed') {
      if (['failed', 'expired', 'cancelled'].includes(run.status)) {
        throw new Error(`Run terminata con stato ${run.status}`);
      }
      if (Date.now() > deadline) {
        throw new Error('Assistant run timeout');
      }

      await new Promise((r) => setTimeout(r, 1000));
      run = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    /* 5. Ultima risposta ---------------------------------------------------- */
    const { data: messages } = await openai.beta.threads.messages.list(
      threadId,
      { limit: 1 }
    );

    const answer = messages?.[0]?.content?.[0]?.text?.value?.trim() ?? '';
    return res.status(200).json({ answer });
  } catch (err) {
    console.error('Assistant API error:', err);
    return res.status(500).json({
      error: 'Assistant failure',
      details:
        process.env.NODE_ENV === 'development' ? String(err) : undefined,
    });
  }
}
