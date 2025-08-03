// pages/api/stt.js
import multer from 'multer';
import { Readable } from 'stream';
import OpenAI from 'openai';
import { parseAssistant } from '@/lib/assistant';

/* ---------- multer in-memory ---------- */
const upload = multer({ storage: multer.memoryStorage() });
const uploadSingle = upload.single('audio');

/* ---------- disattiva bodyParser builtin ---------- */
export const config = {
  api: { bodyParser: false },
};

/* ---------- API route ---------- */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  /* -- esegui multer e attendi -- */
  await new Promise((resolve, reject) => {
    uploadSingle(req, res, (err) => (err ? reject(err) : resolve()));
  });

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File mancante' });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: Readable.from(req.file.buffer),
      filename: req.file.originalname,
    });

    const risposta = parseAssistant(transcription.text);
    return res.status(200).json({ text: transcription.text, risposta });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: 'Errore STT', details: err.message });
  }
}
