// lib/assistant.js
import OpenAI from 'openai';

/* ---------- lazy-init del client (solo lato server) ---------- */
let openai;
function getClient() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY || '';
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

/* ---------- API di alto livello ---------- */

/** Chiede a ChatGPT e restituisce la risposta testuale */
export async function askAssistant(
  prompt,
  { model = 'gpt-3.5-turbo', temperature = 0.7 } = {},
) {
  // 👉 se siamo in browser delega alla API route
  if (typeof window !== 'undefined') {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, temperature }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || 'assistant_failed');
    }
    const { answer } = await res.json();
    return answer;
  }

  // 👉 lato server: usa direttamente la SDK
  const { choices } = await getClient().chat.completions.create({
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  });
  return choices?.[0]?.message?.content ?? '';
}

/** Da testo grezzo → { listType, names[] } */
export function parseAssistant(answer, fallback = 'generic') {
  try {
    const arr = JSON.parse(answer);
    if (Array.isArray(arr)) return { listType: fallback, names: arr };
  } catch {
    /* non era JSON, prosegui */
  }
  const names = answer
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  return { listType: fallback, names };
}
