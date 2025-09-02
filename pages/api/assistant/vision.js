// pages/api/assistant/vision.js
export const config = { api: { bodyParser: false } };
import formidable from 'formidable';

function setCORS(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function readMultipart(req){
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples:false, maxFiles:1, allowEmptyFiles:false });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      const f = files.image || files.file || files.images;
      const file = Array.isArray(f) ? f[0] : f;
      if (!file) return reject(new Error('Nessuna immagine ricevuta'));
      const prompt = (fields.prompt && (Array.isArray(fields.prompt)?fields.prompt[0]:fields.prompt)) || '';
      resolve({ file, prompt });
    });
  });
}

async function fileToBase64(file){
  const fs = await import('fs');
  const path = file.filepath || file._writeStream?.path || file.path;
  const buf = await fs.promises.readFile(path);
  return buf.toString('base64');
}

async function callOpenAIVision({ base64, mime, prompt }){
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY mancante');

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role:'system', content: 'Rispondi solo con JSON valido.' },
        { role:'user', content: [
          { type:'text', text: prompt || 'Estrai JSON degli acquisti' },
          { type:'image_url', image_url: { url: `data:${mime};base64,${base64}` } }
        ] }
      ],
      temperature: 0.1
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'Vision API error');

  const text = data?.choices?.[0]?.message?.content || '';
  try { return JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}$/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Risposta non JSON');
  }
}

export default async function handler(req, res){
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok:true, info:'vision alive' }); // health

  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });

  try {
    const { file, prompt } = await readMultipart(req);
    const base64 = await fileToBase64(file);
    const mime = file.mimetype || 'image/jpeg';
    const json = await callOpenAIVision({ base64, mime, prompt });
    return res.status(200).json({ ok:true, answer: JSON.stringify(json) });
  } catch (e) {
    return res.status(200).json({ ok:false, error: String(e?.message || e) });
  }
}
