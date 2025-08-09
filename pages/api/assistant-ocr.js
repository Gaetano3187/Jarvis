// pages/api/assistant-ocr.js
import OpenAI from 'openai'

export const config = {
  api: { bodyParser: true },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

function pick<T>(a, b) {
  return a !== undefined && a !== null ? a : b;
}

export default async function handler(req, res) {
  // CORS & preflight (sicuro anche su Vercel)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Supporta sia GET (query string) sia POST (JSON)
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).json({ error: `Metodo ${method} non consentito` });
  }

  try {
    const q = req.query ?? {};
    const b = (req.body && typeof req.body === 'object') ? req.body : {};

    const imageUrl = pick(b.imageUrl, q.imageUrl); // es: ?imageUrl=https://...
    const hints = pick(b.hints, q.hints) || '';    // suggerimenti opzionali
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'Parametri mancanti: imageUrl' });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Istruzioni: estrai spesa in JSON rigoroso
    const systemPrompt =
      'Sei Jarvis, l’assistente per la finanza domestica. ' +
      'Devi leggere la ricevuta/scontrino nell’immagine e restituire SOLO JSON valido con questo schema: ' +
      '{ "type":"expense", "items":[ { "puntoVendita":"...", "dettaglio":"...", "prezzoTotale":0.00, "quantita":1, "data":"YYYY-MM-DD", "categoria":"casa", "category_id":"4cfaac74-aab4-4d96-b335-6cc64de59afc" } ] }. ' +
      `Usa "${today}" se la data non è presente. ` +
      'prezzoTotale è il totale della voce (numerico, punto come separatore decimale). ' +
      'Dettaglio: descrizione sintetica della voce (es. "pane", "latte 1L"). ' +
      'Se non trovi quantità, usa 1. ' +
      'Rispondi SOLO con JSON, senza testo aggiuntivo. ' +
      (hints ? `Suggerimenti: ${hints}` : '');

    // OpenAI Vision
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Estrai le voci di spesa in JSON.' },
            { type: 'input_image', image_url: imageUrl },
          ],
        },
      ],
      temperature: 0,
    });

    // Estrazione testo risposta
    const raw =
      response?.output_text ??
      response?.content?.[0]?.text ??
      '';

    // Prova a fare parse robusto
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}$/);
      if (match) json = JSON.parse(match[0]);
    }

    if (!json || typeof json !== 'object') {
      return res.status(502).json({
        error: 'Impossibile parse della risposta OCR',
        details: raw?.slice(0, 4000),
      });
    }

    return res.status(200).json(json);
  } catch (err) {
    console.error('[assistant-ocr] error', err);
    const msg = (err && err.message) ? err.message : 'Errore interno';
    return res.status(500).json({ error: msg });
  }
}
