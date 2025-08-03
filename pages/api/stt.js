// pages/api/stt.js
import nextConnect from 'next-connect';
import multer from 'multer';
import OpenAI from 'openai';
import { parseAssistant } from '@/lib/assistant';

/* ---------- OpenAI client ---------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

/* ---------- multer in-memory ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

/* ---------- API route ---------- */
const handler = nextConnect({
  onError(err, req, res) {
    console.error(err);
    res.status(500).json({ error: 'Errore STT', details: err.message });
  },
  onNoMatch(req, res) {
    res.status(405).json({ error: 'Metodo non consentito' });
  },
});

handler.use(upload.single('audio'));

handler.post(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File mancante' });
  }

  /* ---------- Whisper ---------- */
  const transcription = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file: req.file.buffer,
    fileName: req.file.originalname,
    response_format: 'text',
  });

  const risposta = parseAssistant(transcription);
  res.status(200).json({ text: transcription, risposta });
});

export default handler;

/* ---------- Next.js config ---------- */
export const config = {
  api: { bodyParser: false }, // necessario per multipart/form-data
};
