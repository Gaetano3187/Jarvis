// /pages/api/assistant-ask.js
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const { text, userId, sommelierMemory } = req.body || {};
  const apiKey = process.env.OPENAI_API_KEY;
  const asstId = process.env.OPENAI_ASSISTANT_ID;
  if (!apiKey || !asstId) { res.status(500).json({ error: 'Assistant not configured' }); return; }

  try {
    // Assistants v2 (thread + run semplice)
    const thread = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Beta': 'assistants=v2' },
      body: JSON.stringify({})
    }).then(r => r.json());

    const systemHint =
      `Utente: ${userId || 'anon'}.\n` +
      (sommelierMemory ? `MemoriaCartaVini:\n${sommelierMemory.slice(0,10000)}\n` : '');

    await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Beta': 'assistants=v2' },
      body: JSON.stringify({ role: 'user', content: `${systemHint}\n\n${text}` })
    });

    const run = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Beta': 'assistants=v2' },
      body: JSON.stringify({ assistant_id: asstId })
    }).then(r => r.json());

    // Poll semplice
    let out = null, loops = 0;
    while (loops++ < 40) {
      await new Promise(r => setTimeout(r, 800));
      const cur = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'OpenAI-Beta': 'assistants=v2' }
      }).then(r => r.json());
      if (cur.status === 'completed') {
        const msgs = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'OpenAI-Beta': 'assistants=v2' }
        }).then(r => r.json());
        const last = msgs.data?.find(m => m.role === 'assistant');
        const textOut = last?.content?.map(p => p.text?.value).filter(Boolean).join('\n') || '(nessuna risposta)';
        out = { text: textOut, mono: true };
        break;
      }
      if (cur.status === 'failed' || cur.status === 'expired' || cur.status === 'cancelled') {
        out = { text: `❌ Assistant: ${cur.status}`, mono: true }; break;
      }
    }
    if (!out) out = { text: '❌ Assistant timeout', mono: true };
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
