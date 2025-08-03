import multer from 'multer';
import OpenAI from 'openai';
import { parseAssistant } from '@/lib/assistant';

/* ---------- multer in-memory ---------- */
const upload = multer({ storage: multer.memoryStorage() });

export const config = { api: { bodyParser: false } };

/* ---------- helper: Buffer → File ---------- */
function toFile(buf, origName = 'audio.webm') {
  return new File([buf], origName, { type: 'audio/webm' });
}

/* ---------- API route ---------- */
export default async function handler(req, res) {
  try {
    await new Promise((resolve, reject) =>
      upload.single('audio')(req, {}, (err) => (err ? reject(err) : resolve())),
    );

    if (!req.file) {
      return res.status(400).json({ error: 'File mancante' });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: toFile(req.file.buffer, req.file.originalname || 'audio.webm'),
    });

    const risposta = parseAssistant(transcription.text);
    return res.status(200).json({ text: transcription.text, risposta });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: 'Errore STT', details: err.message ?? 'unknown' });
  }
}
