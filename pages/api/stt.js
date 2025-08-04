// pages/api/stt.js
import nextConnect from 'next-connect';
import multer from 'multer';
import { parseAssistant } from '@/lib/assistant';
import OpenAI from 'openai';

/* ---------- multer in-memory ---------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------- API route ---------- */
const handler = nextConnect();

handler.use(upload.single('audio'));

handler.post(async (req, res) => {
  try {
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
      language: 'it', // forza il riconoscimento in italiano
    });

    const risposta = parseAssistant(transcription.text);
    return res.status(200).json({ text: transcription.text, risposta });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Errore STT', details: err.message });
  }
});

export default handler;

/* ---------- Next.js config ---------- */
export const config = {
  api: {
    bodyParser: false, // disabilita il parser built-in per gestire multipart
  },
};
