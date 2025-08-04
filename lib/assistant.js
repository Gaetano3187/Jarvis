import OpenAI from 'openai';

let openai;
function getClient() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      dangerouslyAllowBrowser: true,
    });
  }
  return openai;
}

/**
 * Invia il prompt all’Assistant configurato su OpenAI
 * e restituisce la risposta JSON (stringa).
 */
export async function askAssistant(prompt) {
  const client   = getClient();
  const assistantId = process.env.OPENAI_ASSISTANT_ID;
  if (!assistantId) throw new Error('OPENAI_ASSISTANT_ID mancante');

  // 1. crea un thread temporaneo
  const thread = await client.beta.threads.create();

  // 2. aggiunge il messaggio dell’utente
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: prompt,
  });

  // 3. lancia il run dell’assistente
  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistantId,
    response_format: { type: 'json_object' },
  });

  // 4. attende il completamento (polling semplice)
  let runStatus = run;
  while (runStatus.status !== 'completed') {
    if (['failed', 'expired', 'cancelled'].includes(runStatus.status)) {
      throw new Error(`Assistant run ${runStatus.status}`);
    }
    await new Promise(r => setTimeout(r, 1000));
    runStatus = await client.beta.threads.runs.retrieve(thread.id, runStatus.id);
  }

  // 5. recupera l’ultima risposta
  const msgs = await client.beta.threads.messages.list(thread.id, { limit: 1 });
  const answer = msgs.data?.[0]?.content?.[0]?.text?.value || '';
  return answer.trim();
}

/* ---- parseAssistant resta uguale ---- */
