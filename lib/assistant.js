import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Chiede a ChatGPT e restituisce la risposta testuale */
export async function askAssistant(
  prompt,
  { model = 'gpt-3.5-turbo', temperature = 0.7 } = {}
) {
  const { choices } = await openai.chat.completions.create({
    model,
    temperature,
    messages: [{ role: 'user', content: prompt }]
  });
  return choices?.[0]?.message?.content ?? '';
}

/** Da testo grezzo → { listType, names[] } */
export function parseAssistant(answer, fallback = 'generic') {
  try {
    const arr = JSON.parse(answer);
    if (Array.isArray(arr)) return { listType: fallback, names: arr };
  } catch (_) { /* ignore JSON parse errors */ }

  const names = answer
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);

  return { listType: fallback, names };
}
