import { OpenAI } from 'openai';
import formidable from 'formidable';
import fs from 'fs';
import { parseAssistant } from '../../lib/assistant';

export const config = { api: { bodyParser: false } };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Metodo ${req.method} non consentito`);
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, _fields, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Errore nel parsing del form' });
    }

    const audio = files.audio;
    if (!audio) {
      return res.status(400).json({ error: 'Nessun file audio inviato' });
    }

    try {
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audio.filepath),
        model: 'whisper-1',
        response_format: 'json',
        language: 'it'
      });

      const risposta = await parseAssistant(response.text);
      return res.status(200).json({ text: response.text, risposta });
    } catch (apiErr) {
      console.error(apiErr);
      return res.status(500).json({ error: String(apiErr) });
    }
  }); // ← chiusura callback form.parse
}      // ← chiusura funzione handler
