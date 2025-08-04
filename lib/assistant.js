// lib/assistant.js
/**
 * Chiede all'Assistant (via API route server-side) e restituisce
 * la risposta JSON come stringa.
 * La route /api/assistant si occupa di creare thread, run e polling.
 */
export async function askAssistant(prompt) {
  const res = await fetch('/api/assistant', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ prompt }),
  });

  const { answer, error } = await res.json();
  if (error) throw new Error(error);

  return answer.trim();
}

/**
 * Converte una possibile risposta testuale in
 * { listType, names[] } per le liste della spesa legacy.
 */
export function parseAssistant(answer, fallback = 'generic') {
  try {
    const arr = JSON.parse(answer);
    if (Array.isArray(arr)) return { listType: fallback, names: arr };
  } catch {
    /* non era JSON: continua */
  }
  const names = answer
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);

  return { listType: fallback, names };
}
