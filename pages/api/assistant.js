// pages/api/assistant.js
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

export default async function handler(req, res) {
  /* ──────────────────────────────────────────────────────────────── 1 */
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res
      .status(405)
      .json({ error: `Metodo ${req.method} non consentito (usa POST)` });
  }

  try {
    /* ─────────────────────────────────────────────────────────────── 2 */
    const { prompt = '' } = req.body ?? {};
    if (!prompt.trim()) return res.status(400).json({ error: 'Prompt mancante' });

    const assistantId = process.env.OPENAI_ASSISTANT_ID;
    if (!assistantId) {
      return res
        .status(500)
        .json({ error: 'OPENAI_ASSISTANT_ID non configurato nel deploy' });
    }

    /* ─────────────────────────────────────────────────────────────── 3 */
    let run = await openai.beta.threads.createAndRun({
      assistant_id: assistantId,
      response_format: { type: 'json_object' },
      thread: {
        messages: [{ role: 'user', content: prompt }],
      },
    });

    /*  Fallback per versioni lib diverse: thread_id oppure thread.id */
    const threadId = run.thread_id ?? run.thread?.id;
    if (!threadId) {
      console.error('createAndRun → nessun thread_id:', run);   // DEBUG
      throw new Error('thread_id mancante nella risposta di createAndRun');
    }

    /* ─────────────────────────────────────────────────────────────── 4 */
    const deadline = Date.now() + 30_000;              // timeout 30 s
    while (run.status !== 'completed') {
      if (['failed', 'expired', 'cancelled'].includes(run.status)) {
        throw new Error(`Run terminata con stato ${run.status}`);
      }
      if (Date.now() > deadline) throw new Error('Assistant run timeout');

      await new Promise(r => setTimeout(r, 1_000));
      run = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    /* ─────────────────────────────────────────────────────────────── 5 */
    const { data: msgs } = await openai.beta.threads.messages.list(threadId, {
      limit: 1,
    });
    const answer = msgs?.[0]?.content?.[0]?.text?.value?.trim() ?? '';

    return res.status(200).json({ answer });
  } catch (err) {
    console.error('Assistant API error:', err);
    return res.status(500).json({
      error: 'Assistant failure',
      details: process.env.NODE_ENV === 'development' ? String(err) : undefined,
    });
  }
}
