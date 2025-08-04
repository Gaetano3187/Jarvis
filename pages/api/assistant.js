// server-side (no dangerouslyAllowBrowser)
import OpenAI from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Metodo ${req.method} non consentito`);
  }

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Prompt mancante' });

  try {
    const client       = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    const assistantId  = process.env.OPENAI_ASSISTANT_ID;
    if (!assistantId)  throw new Error('OPENAI_ASSISTANT_ID non impostato');

    // 1. thread
    const thread = await client.beta.threads.create();

    // 2. user msg
    await client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: prompt,
    });

    // 3. run
    let run = await client.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
      response_format: { type: 'json_object' },
    });

    // 4. polling semplice
    while (run.status !== 'completed') {
      if (['failed', 'expired', 'cancelled'].includes(run.status)) {
        throw new Error(`Run ${run.status}`);
      }
      await new Promise(r => setTimeout(r, 1000));
      run = await client.beta.threads.runs.retrieve(thread.id, run.id);
    }

    // 5. ultima risposta
    const msgs   = await client.beta.threads.messages.list(thread.id, { limit: 1 });
    const answer = msgs.data?.[0]?.content?.[0]?.text?.value || '';

    return res.status(200).json({ answer: answer.trim() });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
}
