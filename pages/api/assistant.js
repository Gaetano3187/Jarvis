// pages/api/stt.js
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import OpenAI from 'openai';

/* ---------- multer in-memory ---------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------- helper per usare multer senza next-connect ---------- */
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) reject(result);
      else resolve(result);
    });
  });
}

/* ---------- Next.js API config ---------- */
export const config = {
  api: {
    bodyParser: false,      // multipart => gestito da multer
    externalResolver: true, // sopprime warn “API resolved without sending…”
  },
};

/* ---------- formati audio supportati da Whisper ---------- */
const ALLOWED_EXT = new Set([
  'flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga',
  'oga',  'ogg', 'wav', 'webm',
]);

/* ---------- POST /api/stt ---------- */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Metodo ${req.method} non consentito`);
  }

  try {
    /* ---- parse multipart ---- */
    await runMiddleware(req, res, upload.single('audio'));
    if (!req.file) {
      return res.status(400).json({ error: 'File audio mancante' });
    }

    const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return res.status(400).json({ error: `Formato non supportato: ${ext}` });
    }

    /* ---- salva su /tmp ---- */
    const tmpPath = path.join('/tmp', `${Date.now()}-${req.file.originalname}`);
    await fs.writeFile(tmpPath, req.file.buffer);

    /* ---- chiama Whisper ---- */
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file:  createReadStream(tmpPath),
    });

    /* ---- cleanup ---- */
    await fs.unlink(tmpPath).catch(() => /* ignora */ null);

    return res.status(200).json({ text: transcription.text });
  } catch (err) {
    console.error('[STT]', err);
    return res.status(500).json({
      error: 'Errore nella trascrizione',
      details: err.message,
    });
  }
}
