// pages/api/stt.js
import multer from 'multer';
import OpenAI from 'openai';
import { parseAssistant } from '@/lib/assistant';

/* ---------- multer in-memory ---------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------- helper per usare multer senza next-connect ---------- */
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

/* ---------- API route ---------- */
export const config = {
  api: {
    bodyParser: false,           // disabilita il parser built-in per multipart
    externalResolver: true,      // evita warning “API resolved without sending…”
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Metodo ${req.method} non consentito`);
  }

  try {
    // applica multer
    await runMiddleware(req, res, upload.single('audio'));

    if (!req.file) {
      return res.status(400).json({ error: 'File mancante' });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: req.file.buffer,
      filename: req.file.originalname,
    });

    const risposta = parseAssistant(transcription.text);

    return res.status(200).json({
      text: transcription.text,
      risposta,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Errore STT',
      details: err.message,
    });
  }
}
