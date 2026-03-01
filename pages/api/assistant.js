// pages/api/assistant.js
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Metodo ${req.method} non consentito (usa POST)` });
  }

  try {
    const { prompt = '' } = req.body ?? {};
    if (!prompt.trim()) return res.status(400).json({ error: 'Prompt mancante' });

    // Assistant "neutro": restituisce SOLO JSON, nessun testo extra
    const systemPrompt = `
Sei Jarvis. Devi rispondere ESCLUSIVAMENTE con JSON valido e ben formato.
- Nessuna spiegazione, nessun commento, nessun blocco markdown.
- Se non sei certo, restituisci un oggetto JSON vuoto {}.
`.trim();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });

    let raw = completion.choices?.[0]?.message?.content ?? '';

    // Estrarre solo il JSON (gestisce anche eventuali ```json ... ```)
    const fence = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/);
    if (fence) raw = fence[1].trim();

    // Se contiene testo vario, prova a prendere il primo oggetto/array JSON
    if (!/^\s*[\[{]/.test(raw)) {
      const objMatch = raw.match(/{[\s\S]*}/);
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      raw = (objMatch?.[0] || arrMatch?.[0] || raw).trim();
    }

    // Validazione minima
    try { JSON.parse(raw); } catch {
      // ultima difesa: forziamo oggetto vuoto
      raw = '{}';
    }

    return res.status(200).json({ answer: raw });
  } catch (error) {
    console.error('Errore Assistant:', error);
    return res.status(500).json({ error: 'Errore interno assistant' });
  }
}
