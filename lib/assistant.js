// lib/assistant.js
import OpenAI from 'openai';

/* ---------- lazy-init del client ---------- */
let openai;
function getClient() {
  if (openai) return openai;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error('OPENAI_API_KEY mancante nelle env vars del backend');

  // NB: niente dangerouslyAllowBrowser → il bundle client non includerà l’API-key
  openai = new OpenAI({ apiKey });
  return openai;
}

/* ---------- API di alto livello ---------- */
/**
 * Interroga ChatGPT e restituisce la risposta testuale (JSON).
 *
 * @param {string} userPrompt          Testo da inviare come messaggio utente
 * @param {object} [options]
 * @param {string} [options.system]    Messaggio 'system' opzionale
 * @param {string} [options.model]     Modello OpenAI (def: gpt-3.5-turbo-1106)
 * @param {number} [options.temperature] Temperatura (def: 0 = risposta deterministica)
 * @returns {Promise<string>}          Contenuto della prima choice (o stringa vuota)
 */
export async function askAssistant(
  userPrompt,
  {
    system      = '',
    model       = 'gpt-3.5-turbo-1106',
    temperature = 0,
  } = {},
) {
  const messages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content: userPrompt },
  ];

  const { choices } = await getClient().chat.completions.create({
    model,
    temperature,
    response_format: { type: 'json_object' }, // forza JSON
    messages,
  });

  return choices?.[0]?.message?.content ?? '';
}

/* ---------- utilità legacy (non più usata ma lasciata per compat) ---------- */
export function parseAssistant(answer, fallback = 'generic') {
  try {
    const arr = JSON.parse(answer);
    if (Array.isArray(arr)) return { listType: fallback, names: arr };
  } catch {
    /* il testo non era JSON → continua */
  }

  const names = answer
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);

  return { listType: fallback, names };
}
