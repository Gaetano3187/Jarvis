// lib/openai.js
import OpenAI from 'openai';

/** Istanza riusabile */
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ===== Risoluzione sicura dei modelli (con fallback) =====
const envText   = process.env.OPENAI_TEXT_MODEL?.trim?.();
const envVision = process.env.OCR_VISION_MODEL?.trim?.() || process.env.OPENAI_VISION_MODEL?.trim?.();

/** Modello per parsing / normalizzazione testo */
export const TEXT_MODEL = (envText && envText.length) ? envText : 'gpt-4o';
/** Modello per Vision (OCR ecc.) */
export const VISION_MODEL = (envVision && envVision.length) ? envVision : 'gpt-40';

// (opzionale) warning gentile se manca la chiave
if (!process.env.OPENAI_API_KEY) {
  console.warn('[openai] OPENAI_API_KEY non impostata: le API che usano OpenAI falliranno.');
}
