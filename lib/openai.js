import OpenAI from 'openai';

/* esporta una singola istanza ri‑usabile */
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
