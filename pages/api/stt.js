// pages/api/stt.js
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import OpenAI from 'openai';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

// In-memory storage con limite 25MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export const config = {
  api: { bodyParser: false, externalResolver: true },
  runtime: 'nodejs', // assicura runtime Node su Vercel/Next
};

// mappa MIME/estensioni più ampia (Android/iOS/legacy)
const EXT_BY_MIME = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/mp4': '.m4a',        // iOS (MediaRecorder / AV)
  'audio/aac': '.aac',
  'audio/3gpp': '.3gp',
  'audio/3gpp2': '.3g2',
  'audio/x-caf': '.caf',
  'video/quicktime': '.mov',  // alcuni recorder iOS
};

const EXT_FALLBACKS = ['.webm', '.m4a', '.mp3', '.wav', '.ogg', '.aac', '.caf', '.3gp', '.mov'];

function safeBaseName(name) {
  return String(name || 'audio').replace(/[^\w.\-]/g, '_');
}

function pickFirstFile(req) {
  // multer.single('audio') popola req.file e req.body;
  // ma alcune UI inviano con altri fieldName: proviamo a recuperarli
  if (req.file) return req.file;
  const candidates = ['audio', 'file', 'voice'];
  for (const key of candidates) {
    const any = req?.files?.[key];
    if (any && any[0]) return any[0];
    if (Array.isArray(any)) return any[0];
  }
  return null;
}

function guessExtension(mimetype, original) {
  // 1) prova da mimetype
  if (mimetype && EXT_BY_MIME[mimetype]) return EXT_BY_MIME[mimetype];

  // 2) prova dall'estensione originale
  const extOrig = path.extname(original || '').toLowerCase();
  if (extOrig && EXT_FALLBACKS.includes(extOrig)) return extOrig;
  if (extOrig) return extOrig; // meglio di nulla

  // 3) fallback: webm
  return '.webm';
}

export default async function handler(req, res) {
  console.log('[STT] handler start, method=', req.method);

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` });
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('[STT] OPENAI_API_KEY mancante');
    return res.status(500).json({ error: 'Configurazione STT mancante' });
  }

  let tmpPath = null;

  try {
    // supporta anche il caso in cui il client usi un altro field name
    await runMiddleware(req, res, upload.any()); // invece di .single('audio')

    const file = pickFirstFile(req);
    if (!file) {
      console.log('[STT] no file in request');
      return res.status(400).json({ error: 'File audio mancante (usa campo "audio" o "file")' });
    }
    console.log('[STT] multer:', file.originalname, file.mimetype, file.size);

    const langField = req.body?.language;
    const promptField = req.body?.prompt;

    // Scrivi su /tmp (Vercel/Node) con estensione coerente
    const mime = file.mimetype || '';
    const safeName = safeBaseName(file.originalname || 'audio');
    const base = path.basename(safeName, path.extname(safeName));
    const ext = guessExtension(mime, safeName);

    const tmpDir = os.tmpdir() || '/tmp';
    tmpPath = path.join(tmpDir, `${Date.now()}-${base}${ext}`);
    await writeFile(tmpPath, file.buffer);
    console.log('[STT] wrote temp file ->', tmpPath);

    // OpenAI SDK v4
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const MODEL = process.env.STT_MODEL || 'whisper-1';

    // Prompt lessicale ampliato (tagliato a 1500 char)
    const defaultPrompt =
      'Lista spesa italiana, manutenzioni, igiene, beverage. Termini comuni: ' +
      'latte, pasta, riso, olio, zucchero, sale, uova, acqua, scottex, detersivo pavimenti, ' +
      'detersivo piatti, detersivo lavatrice, ammorbidente, candeggina, biscotti, cereali, ' +
      'passata di pomodoro, pelati, yogurt, burro, mozzarella, parmigiano, tonno, pollo, ' +
      'prosciutto, frutta, verdura, shampoo, balsamo, bagnoschiuma, deodorante, dentifricio, ' +
      'spazzolino, lamette, cotton fioc, assorbenti, lampadine, pile, vernice, pennelli, ' +
      'birra, vino, prosecco, amaro, gin, vodka, succo di frutta, coca cola, tè freddo.';
    const prompt = (promptField && String(promptField)) ? String(promptField).slice(0, 1500) : defaultPrompt;
    const language = (langField && String(langField)) || 'it';

    // timeout hard per reti mobili lente
    const timeoutMs = 45000;
    const transcribePromise = openai.audio.transcriptions.create({
      model: MODEL,
      file: fs.createReadStream(tmpPath),
      response_format: 'json',
      language,
      temperature: 0,
      prompt,
    });

    const transcription = await Promise.race([
      transcribePromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('OpenAI STT timeout')), timeoutMs)),
    ]);

    const text = transcription?.text?.trim() || '';
    if (!text) {
      console.warn('[STT] risposta vuota dal modello');
      return res.status(502).json({ error: 'Trascrizione vuota' });
    }

    return res.status(200).json({ text });
  } catch (err) {
    console.error('[STT] error →', err?.message || err);
    if (err?.response?.data) console.error('[STT] response error →', err.response.data);
    return res.status(500).json({
      error: 'Errore STT',
      details: process.env.NODE_ENV === 'development' ? (err?.message || String(err)) : undefined,
    });
  } finally {
    if (tmpPath) {
      try {
        await unlink(tmpPath);
        console.log('[STT] temp file removed');
      } catch (e) {
        console.warn('[STT] temp file removal failed:', e?.message || e);
      }
    }
  }
}
