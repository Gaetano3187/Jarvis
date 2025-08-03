// pages/api/stt.js
import nextConnect from 'next-connect';
import multer from 'multer';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { parseAssistant } from '@/lib/assistant';

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

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    // Converte il buffer di multer in oggetto File/Blob compatibile con openai
    const fileForOpenAI = await toFile(req.file.buffer, req.file.originalname);

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fileForOpenAI,
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
    bodyParser: false, // multipart via multer
  },
};
