// lib/assistant.js
import OpenAI from 'openai';

let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

/**
 * Invia un prompt all’assistente e restituisce la risposta.
 * @param {string} prompt
 * @param {object} context (opzionale)
 */
export async function askAssistant(prompt, context = {}) {
  if (!ASSISTANT_ID) throw new Error('Missing OPENAI_ASSISTANT_ID');
  const openai = getClient();

  const thread = await openai.beta.threads.create({ metadata: context });

  await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: prompt,
  });

  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: ASSISTANT_ID,
  });

  let status;
  do {
    await new Promise(r => setTimeout(r, 1500));
    status = await openai.beta.threads.runs.retrieve(thread.id, run.id);
  } while (status.status === 'queued' || status.status === 'in_progress');

  if (status.status !== 'completed') throw new Error(`Run failed: ${status.status}`);

  const msgs = await openai.beta.threads.messages.list(thread.id, { limit: 1 });
  return msgs.data[0]?.content[0]?.text.value ?? '';
}

/**
 * Alias usato nei componenti front‑end.
 */
export const parseAssistant = askAssistant;
