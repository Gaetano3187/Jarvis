// pages/api/assistant.js
import OpenAI from 'openai';

/* ───────── client singleton ─────────────────────────────────────────── */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

/* ───────── API route ────────────────────────────────────────────────── */
export default async function handler(req, res) {
  /* 1 · verbo HTTP ----------------------------------------------------- */
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res
      .status(405)
      .json({ error: `Metodo ${req.method} non consentito (usa POST)` });
  }

  try {
    /* 2 · validazione input ------------------------------------------- */
    const { prompt = '' } = req.body ?? {};
    if (!prompt.trim()) {
      return res.status(400).json({ error: 'Prompt mancante' });
    }

    const assistantId = process.env.OPENAI_ASSISTANT_ID;
    if (!assistantId) {
      return res
        .status(500)
        .json({ error: 'OPENAI_ASSISTANT_ID non configurato nel deploy' });
    }

    /* 3 · creazione thread + messaggio utente ------------------------- */
    const thread = await openai.beta.threads.create();
    const threadId = thread.id;

    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: prompt,
    });

    /* 4 · avvio run ---------------------------------------------------- */
    let run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      response_format: { type: 'json_object' },
    });

    /* 5 · polling ------------------------------------------------------ */
    const deadline = Date.now() + 30_000; // 30 s timeout
    while (run.status !== 'completed') {
      if (['failed', 'expired', 'cancelled'].includes(run.status)) {
        throw new Error(`Run terminata con stato ${run.status}`);
      }
      if (Date.now() > deadline) {
        throw new Error('Assistant run timeout');
      }

      await new Promise((r) => setTimeout(r, 1_000));
      run = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    /* 6 · estrazione risposta ----------------------------------------- */
    const { data: msgs } = await openai.beta.threads.messages.list(threadId, {
      limit: 1,
    });

    const answer =
      msgs?.[0]?.content?.[0]?.text?.value?.trim() || '';

    return res.status(200).json({ answer });
  } catch (err) {
    /* log server-side */
    console.error('Assistant API error:', err);

    /* risposta sintetica al front-end */
    return res.status(500).json({
      error: 'Assistant failure',
      details:
        process.env.NODE_ENV === 'development' ? String(err) : undefined,
    });
  }
}
