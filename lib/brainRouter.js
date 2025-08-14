// lib/brainRouter.js
// Qui instradi tutto: voce, OCR, query, ecc.
// Sostituisci le funzioni "stub" con le tue integrazioni reali (OpenAI, Supabase, ecc.)

async function saveVoiceExpense(text) {
  // TODO: salva su DB e aggiorna "spese-casa" come già fai
  return { saved: true, parsed: { raw: text } };
}

async function saveReceiptOCR({ base64, raw }) {
  // TODO: decodifica OCR + ingest; aggiorna anche "spese-casa"
  return { stored: true, bytes: base64 ? base64.length : 0, raw: raw ?? null };
}

async function answerQuery(text) {
  // TODO: collega al tuo motore AI/SQL; qui metto un echo strutturato
  const lower = String(text).toLowerCase();
  if (lower.includes('prosciutto')) {
    return { result: 'Miglior prezzo Prosciutto San Daniele: €2,99/100g (esempio).' };
  }
  return { result: `Echo: ${text}` };
}

/**
 * Body atteso:
 *  - { kind:'voiceIngest', text: '...' }
 *  - { kind:'ocrIngest', base64:'...', raw:'...' }
 *  - { kind:'query', text:'...' }
 */
export async function handleBrainRequest(body = {}) {
  const { kind } = body;

  switch (kind) {
    case 'voiceIngest': {
      const text = body.text?.trim();
      if (!text) return { ok: false, error: 'Missing text' };
      const r = await saveVoiceExpense(text);
      return { type: 'voiceIngest', ...r };
    }

    case 'ocrIngest': {
      const { base64, raw } = body;
      if (!base64) return { ok: false, error: 'Missing base64' };
      const r = await saveReceiptOCR({ base64, raw });
      return { type: 'ocrIngest', ...r };
    }

    case 'query': {
      const text = body.text?.trim();
      if (!text) return { ok: false, error: 'Missing text' };
      const r = await answerQuery(text);
      return { type: 'query', ...r };
    }

    default:
      return { ok: false, error: `Unknown kind: ${kind}` };
  }
}
