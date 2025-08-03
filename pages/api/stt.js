// pages/api/stt.js
import * as nc from 'next-connect';
import * as multer from 'multer';
import OpenAI from 'openai';
import { parseAssistant } from '@/lib/assistant';

/* ---------- next-connect & multer (compat con CJS/ESM) ---------- */
const nextConnect = nc.default || nc;
const Multer      = multer.default || multer;

/* ---------- multer in-memory (25 MB) ---------- */
const upload = Multer({
  storage: Multer.memoryStorage(),
  limits : { fileSize: 25 * 1024 * 1024 },
});

/* ---------- API route ---------- */
const handler = nextConnect({
  onError(err, req, res) {
    console.error(err);
    res.status(500).json({ error: 'Errore interno', details: err.message });
  },
  onNoMatch(req, res) {
    res.status(405).json({ error: 'Metodo non consentito' });
  },
});

handler.use(upload.single('audio'));

handler.post(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File mancante' });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    const { text } = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file : req.file.buffer,
      filename: req.file.originalname || 'audio.webm',
    });

    const risposta = parseAssistant(text);
    res.status(200).json({ text, risposta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore STT', details: err.message });
  }
});

export default handler;

/* ---------- Next.js config ---------- */
export const config = {
  api: { bodyParser: false }, // multipart handled da multer
};
 