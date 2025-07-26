// pages/api/stt.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs';
import { parseAssistant } from '@/lib/assistant';

export const config = {
  api: {
    bodyParser: false,   // necessario per ricevere multipart/form‑data
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,   // assicurati che sia presente nel .env
});

export default async function handler(req, res) {
  // consenti solo POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Metodo ${req.method} non consentito`);
  }

  // parse multipart/form‑data
  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Errore nel caricamento del file audio' });
    }

    const audioFile = files.audio;
    if (!audioFile) {
      return res.status(400).json({ error: 'Nessun file audio inviato' });
    }

const risposta = await parseAssistant(response.text);
return res.status(200).json({ text: response.text, risposta });
