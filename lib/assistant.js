/**
 * Wrapper minimale per l’Assistants API v2.
 * - Crea (o riutilizza) il thread “shopping-list” in variabili d’ambiente.
 * - Restituisce la risposta dell’assistente come stringa.
 *
 * Env:
 *   OPENAI_API_KEY         — obbligatoria
 *   OPENAI_ASSISTANT_ID    — ID dell’assistente creato su platform.openai.com
 */

import OpenAI from 'openai';

let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/**
 * Chiede all’assistente di rispondere al `prompt`.
 * @param {string} prompt  – testo da inviare
 * @param {object} [context] – chiavi opzionali da serializzare in metadata
 */
export default async function askAssistant(prompt, context = {}) {
  const openai = getClient();
  const assistantId = process.env.OPENAI_ASSISTANT_ID;
  if (!assistantId) throw new Error('Missing OPENAI_ASSISTANT_ID');

  // 1) crea thread se non esiste (puoi passare threadId dal client, se lo hai)
  const thread = await openai.beta.threads.create({
    metadata: context,
  });

  // 2) inserisci messaggio
  await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: prompt,
  });

  // 3) avvia run e aspetta completamento
  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistantId,
  });

  let status;
  do {
    await new Promise((r) => setTimeout(r, 1500));
    status = await openai.beta.threads.runs.retrieve(thread.id, run.id);
  } while (status.status === 'queued' || status.status === 'in_progress');

  if (status.status !== 'completed') {
    throw new Error(`Run failed: ${status.status}`);
  }

  // 4) recupera l’ultima risposta
  const msgs = await openai.beta.threads.messages.list(thread.id, {
    limit: 1,
  });

  return msgs.data[0]?.content[0]?.text.value ?? '';
}
