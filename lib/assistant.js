// lib/assistant.js

/**
 * Helper robusto per chiamare la route /api/assistant (GPT).
 * Ritorna SEMPRE una stringa (trimmed) o lancia errore.
 */
export async function askAssistant(prompt) {
  const res = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  let payload;
  try {
    payload = await res.json();
  } catch (e) {
    throw new Error('Risposta non valida dalla /api/assistant');
  }

  const { answer, error } = payload || {};
  if (!res.ok || error) {
    throw new Error(error || `Assistant HTTP ${res.status}`);
  }

  return String(answer ?? '').trim();
}

/**
 * Prova a rispondere usando i dati locali già calcolati (il “Brain” sul client).
 * Se non disponibile / non pertinente → ritorna null e si passerà a GPT.
 *
 * NOTA: richiede che runBrainQuery legga window.__JARVIS_DATA__ popolato
 *       dalle pagine (es. Entrate) e risponda con { ok: boolean, text?: string }.
 */
async function tryBrainFirst(userText) {
  // Evita esecuzione lato server: il Brain vive nel browser.
  if (typeof window === 'undefined') return null;

  // Import dinamico per non caricare nulla lato SSR.
  // Percorso relativo “/lib/brainQuery” secondo la tua struttura.
  try {
    const mod = await import('@/lib/brainQuery');
    const runBrainQuery = mod?.runBrainQuery;
    if (typeof runBrainQuery !== 'function') return null;

    const res = await runBrainQuery(userText);
    if (res && res.ok) {
      // Se il brain fornisce direttamente testo formattato
      if (res.text && typeof res.text === 'string') return res.text.trim();

      // Fallback: se avesse un oggetto dati, formatta in modo sobrio
      if (res.data && typeof res.data === 'object') {
        try {
          return JSON.stringify(res.data);
        } catch {
          /* ignora e lascia proseguire */
        }
      }
      // Se ok ma senza text/data, lascio passare a GPT
    }
    return null;
  } catch {
    // Qualsiasi problema col brain → proseguiamo con GPT
    return null;
  }
}

/**
 * Entry-point "smart": prima tenta la risposta locale (runBrainQuery),
 * se non pertinente usa GPT. Restituisce sempre una stringa.
 */
export async function smartAsk(userText) {
  const brainAnswer = await tryBrainFirst(userText);
  if (brainAnswer) return brainAnswer;
  return askAssistant(userText);
}

/**
 * Parser legacy per liste della spesa:
 * - Se la risposta è un JSON array → { listType, names[] }
 * - Altrimenti split per righe non vuote
 */
export function parseAssistant(answer, fallback = 'generic') {
  // Prova JSON → array
  try {
    const arr = JSON.parse(answer);
    if (Array.isArray(arr)) {
      return { listType: fallback, names: arr };
    }
  } catch {
    // non era JSON, continua
  }

  // Split per righe testuali
  const names = String(answer || '')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  return { listType: fallback, names };
}

/**
 * Comodo combinatore per i casi "liste": usa smartAsk e poi parseAssistant.
 * Utile dove prima chiamavi askAssistant+parseAssistant in sequenza.
 */
export async function smartAskForList(userText, fallback = 'generic') {
  const answer = await smartAsk(userText);
  return parseAssistant(answer, fallback);
}
