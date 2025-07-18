// lib/assistant.js
import OpenAI from 'openai';

let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/**
 * Mappa dei due assistant ID.
 */
const ASSISTANT_IDS = {
  STT: process.env.OPENAI_ASSISTANT_ID_STT,
  OCR: process.env.OPENAI_ASSISTANT_ID_OCR,
};

/**
 * Chiede all’assistente di rispondere al prompt.
 * @param {string} prompt  – Testo da inviare
 * @param {object} context – Metadati (facoltativi)
 * @param {'STT'|'OCR'} assistantType – Quale assistant usare
 * @returns {Promise<string>}
 */
export async function askAssistant(prompt, context = {}, assistantType = 'STT') {
  const openai = getClient();
  const assistantId = ASSISTANT_IDS[assistantType];
  if (!assistantId) throw new Error(`Missing assistant ID for ${assistantType}`);

  // 1) crea thread
  const thread = await openai.beta.threads.create({ metadata: context });

  // 2) inserisci messaggio
  await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: prompt,
  });

  // 3) avvia run
  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistantId,
  });

  // 4) polling
  let status;
  do {
    await new Promise(r => setTimeout(r, 1500));
    status = await openai.beta.threads.runs.retrieve(thread.id, run.id);
  } while (status.status === 'queued' || status.status === 'in_progress');

  if (status.status !== 'completed') throw new Error(`Run failed: ${status.status}`);

  // 5) ultima risposta
  const msgs = await openai.beta.threads.messages.list(thread.id, { limit: 1 });
  return msgs.data[0]?.content[0]?.text.value ?? '';
}

/**
 * Wrapper usato nei componenti front‑end.
 * Passa l’oggetto `data` restituito da STT / OCR all’assistente corretto
 * e restituisce il testo.

export function parseAssistant(answer, fallback = 'supermercato') {
  try {
    const j = JSON.parse(answer);
    if (j?.type === 'shopping_list' && Array.isArray(j.prodotti)) {
      const list = j.lista === 'online' ? 'online' : 'supermercato';
      return { listType: list, names: j.prodotti.map(p => p.nome) };
    }
    if (Array.isArray(j)) return { listType: fallback, names: j };
  } catch (_) {
    /* ignore */
  }
  const names = answer.split('\\n').map(t => t.trim()).filter(Boolean);
  return { listType: fallback, names };
}
