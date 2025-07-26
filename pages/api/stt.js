import { parseAssistant } from '@/lib/assistant';
import { openai } from '@/lib/openai';            // adatta se il path è diverso

export default async function handler(req, res) {
  try {
    const file = req.file;                        // dipende da come gestisci upload
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
