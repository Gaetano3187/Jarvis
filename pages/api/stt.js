// pages/api/stt.js -----------------------------------------------------------
import fs from 'fs';
import path from 'path';
import formidable from 'formidable';
import OpenAI from 'openai';

export const config = { api: { bodyParser: false } };

/* singleton OpenAI --------------------------------------------------------- */
let openai;
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

/* parse multipart e restituisce path del file audio ------------------------ */
function parseMultipart(req) {
  const uploadDir = '/tmp';
  return new Promise((resolve, reject) => {
    const form = formidable({
      uploadDir,
      multiples: false,
      maxFileSize: 25 * 1024 * 1024,
      filter: p => p.mimetype?.startsWith('audio/'),
      filename: (_, __, part) =>
        `audio-${Date.now()}${path.extname(part.originalFilename || '')}`,
    });

    form.parse(req, (err, _f, files) => {
      if (err) return reject(err);
      const audio = files.audio || files.file || Object.values(files)[0];
      if (!audio) return reject(new Error('Missing audio file (field "audio")'));
      resolve({ filepath: audio.filepath });
      
    });
  });
}
form.parse(req, (err, _fields, files) => {
  console.log('files ricevuti:', files);     // 👈  vedi quali chiavi arrivano
  if (err) return reject(err);
  const audio = files.audio || files.file || Object.values(files)[0];
  
});
function parseMultipart(req) {
  const uploadDir = '/tmp';
  return new Promise((resolve, reject) => {
    const form = formidable({
      uploadDir,
      multiples: false,
      maxFileSize: 25 * 1024 * 1024,
      filter: p => p.mimetype?.startsWith('audio/'),
      filename: (_, __, part) =>
        `audio-${Date.now()}${path.extname(part.originalFilename || '')}`,
    });

    form.parse(req, (err, _f, files) => {
      if (err) return reject(err);
      const audio = Object.values(files)[0];           // 👈  qualunque chiave
      if (!audio?.filepath) return reject(new Error('Nessun file audio'));
      resolve({ filepath: audio.filepath });
    });
  });
}


/* handler ------------------------------------------------------------------ */
export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { filepath } = await parseMultipart(req);
    const client = getOpenAI();

    const rsp = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(filepath),
      response_format: 'json',
      // language: 'it',
    });

    fs.unlink(filepath, () => {}); // cleanup
    return res.status(200).json({ text: rsp.text });
  } catch (error) {
    console.error('/api/stt error:', error);
    return res
      .status(500)
      .json({ error: 'Transcription failed', details: String(error) });
  }
}
