import { parseAssistant } from '@/lib/assistant';
import { OpenAI } from 'openai';

const openai = new OpenAI();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ text: response.text, risposta });

  const { file } = req.body;                       // adegua se usi form‑data
  if (!file) return res.status(400).json({ error: 'Nessun file audio inviato' });

  try {
    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file
    });

    const risposta = await parseAssistant(response.text);
    return res.status(200).json({ text: response.text, risposta });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Errore STT' });
  }
}
