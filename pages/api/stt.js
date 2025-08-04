// pages/api/stt.js
import { Readable } from 'stream';
import multer from 'multer';
import OpenAI from 'openai';

// -----------------------------
// 1. Multer: in-memory storage
// -----------------------------
const upload = multer({ storage: multer.memoryStorage() });

// Utility per eseguire middleware dentro una API Route Next.js
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => (result instanceof Error ? reject(result) : resolve(result)));
  });
}

// Disattiviamo il body-parser built-in
export const config = {
  api: { bodyParser: false, externalResolver: true },
};

// -------------------------------------
// 2. Accepted audio extensions + MIME
// -------------------------------------
const ALLOWED_MIME = [
  'audio/flac',
  'audio/m4a',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/mpga',
  'audio/ogg',
  'audio/oga',
  'audio/wav',
  'audio/webm',
];

// -----------------------------
// 3. API Route handler (POST)
// -----------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` });
  }

  try {
    // a) Estraiamo il campo "audio" dal multipart
    await runMiddleware(req, res, upload.single('audio'));

    if (!req.file) {
      return res.status(400).json({ error: 'File audio mancante (campo "audio")' });
    }

    if (!ALLOWED_MIME.includes(req.file.mimetype)) {
      return res.status(400).json({ error: `Formato non supportato: ${req.file.mimetype}` });
    }

    // b) Creiamo uno stream leggibile e aggiungiamo la proprietà "path"
    const audioStream = new Readable({
      read() {
        this.push(req.file.buffer);
        this.push(null);
      },
    });
    audioStream.path = req.file.originalname; // ← fondamentale per far riconoscere l’estensione

    // c) Chiamiamo Whisper
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioStream,
    });

    return res.status(200).json({ text: transcription.text });
  } catch (err) {
    console.error('STT API error:', err);
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}
