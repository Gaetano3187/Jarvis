// pages/api/ocr.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';
import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

const BAD_LINE = /(mi\s*dispiace|non\s*posso\s*aiut|cannot\s*assist|i\s*can'?t|policy)/i;

function sanitize(text = '') {
  return String(text || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !BAD_LINE.test(s))
    .join('\n');
}

async function parseMultipart(req) {
  return await new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, keepExtensions: true });
    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
  });
}

async function toBase64JPEG(buf, mime = '') {
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(buf)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { b64: out.toString('base64'), mime: 'image/jpeg' };
  } catch {
    // fallback: usa buffer com'è
    const safeMime = /^image\//i.test(mime) ? mime : 'image/jpeg';
    return { b64: buf.toString('base64'), mime: safeMime };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY non configurata' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1) Parse multipart
    const { fields, files } = await parseMultipart(req);

    // accetta tutte le chiavi comuni
    const pick = (k) => {
      const v = files?.[k];
      return v ? (Array.isArray(v) ? v : [v]) : [];
    };
    let fileList = [
      ...pick('images'),
      ...pick('files'),
      ...pick('file'),
      ...pick('image'),
    ];
    if (!fileList.length) {
      fileList = Object.values(files || {}).flat().filter(Boolean);
    }
    if (!fileList.length) {
      return res.status(400).json({ error: 'Nessun file ricevuto' });
    }

    // 2) Dedup per hash e normalizza a base64 JPEG
    const seen = new Set();
    const images = [];
    for (const f of fileList) {
      const path = f.filepath || f.path;
      if (!path) continue;
      const buf = await fs.readFile(path);
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      if (seen.has(h)) continue;
      seen.add(h);

      // PDF → testo con pdf-parse
      const mime = String(f.mimetype || '').toLowerCase();
      const name = String(f.originalFilename || '');
      if (mime.includes('pdf') || /\.pdf$/i.test(name)) {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(buf);
        const txt = String(parsed?.text || '').trim();
        if (txt) {
          // ritorna subito testo da PDF (niente Vision)
          const text = sanitize(txt);
          return res.status(200).json({ ok: true, text, items: [] });
        }
        continue;
      }

      const { b64, mime: outMime } = await toBase64JPEG(buf, mime);
      images.push({ b64, mime: outMime });
    }

    if (!images.length) {
      return res.status(400).json({ error: 'Immagini non leggibili' });
    }

    // 3) Costruisci contenuti Vision per Chat Completions
    const imageContents = images.map((im) => ({
      type: 'image_url',
      image_url: { url: `data:${im.mime};base64,${im.b64}` },
    }));

    // 4) Esegui in parallelo:
    //    A) Trascrizione testo (scontrino)
    //    B) Riconoscimento prodotti (busta / etichette) → JSON items
    const transcribePromise = client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are a neutral OCR engine. Transcribe printed text exactly. Respond with plain text only, no explanations.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Trascrivi fedelmente il testo. Solo testo, una riga per riga visibile.' },
            ...imageContents,
          ],
        },
      ],
    });

    const bagPromise = client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract grocery items from photos of products/bags. Always output JSON with fields name, brand, packs, unitsPerPack, unitLabel, expiresAt. Never refuse.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'Rileva i PRODOTTI visibili (nome e marca) e, se possibile, le quantità:',
                '- "packs" = numero confezioni uguali viste/implicate;',
                '- "unitsPerPack" = n. unità per confezione quando appare (es. 6 bottiglie → 6);',
                '- "unitLabel" ∈ { "unità","pezzi","bottiglie","buste","lattine","vasetti","rotoli","capsule" } (usa la più adatta);',
                '- "expiresAt" = YYYY-MM-DD se leggibile su etichette;',
                'Schema esatto JSON:',
                '{ "items":[ { "name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","expiresAt":"" } ] }',
                'Niente testo libero, SOLO JSON.',
              ].join('\n'),
            },
            ...imageContents,
          ],
        },
      ],
    });

    const [transcribeRes, bagRes] = await Promise.allSettled([transcribePromise, bagPromise]);

    // 5) Recupera risultati
    let text = '';
    if (transcribeRes.status === 'fulfilled') {
      const raw = transcribeRes.value?.choices?.[0]?.message?.content || '';
      text = sanitize(String(raw || '').trim());
    }

    let items = [];
    if (bagRes.status === 'fulfilled') {
      const raw = String(bagRes.value?.choices?.[0]?.message?.content || '').trim();
      try {
        const j = JSON.parse(raw || '{}');
        if (Array.isArray(j?.items)) items = j.items;
      } catch { /* ignore */ }
    }

    // 6) Se non c’è testo ma ci sono items, crea un testo sintetico (compatibilità client)
    if (!text && Array.isArray(items) && items.length) {
      text = items
        .map((it) => {
          const p = Number(it?.packs || 0) > 0 ? `${it.packs} conf.` : '';
          const u = Number(it?.unitsPerPack || 0) > 0 ? `${it.unitsPerPack} ${it.unitLabel || 'unità'}` : '';
          const qty = [p, u].filter(Boolean).join(' x ');
          const nb = [it?.name || '', it?.brand || ''].filter(Boolean).join(' ');
          return qty ? `${nb} ${qty}` : nb;
        })
        .filter(Boolean)
        .join('\n');
    }

    return res.status(200).json({ ok: true, text, items: Array.isArray(items) ? items : [] });
  } catch (err) {
    console.error('[OCR] fail', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
