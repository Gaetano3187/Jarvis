// pages/api/normalize.js
import { openai, TEXT_MODEL } from '@/lib/openai'; // riusa il tuo lib/openai.js
const CSE_ID  = process.env.GOOGLE_CSE_ID;
const CSE_KEY = process.env.GOOGLE_CSE_KEY;

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

// cache volatile 10 minuti
const mem = new Map();
const TTL = 10 * 60 * 1000;
const now = () => Date.now();

async function googleSearch(q, num = 5) {
  if (!CSE_ID || !CSE_KEY) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(CSE_KEY)}&cx=${encodeURIComponent(CSE_ID)}&q=${encodeURIComponent(q)}&num=${num}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  const items = Array.isArray(j.items) ? j.items : [];
  return items.map(it => ({
    title: it.title || '',
    snippet: it.snippet || '',
    link: it.link || '',
    displayLink: it.displayLink || ''
  }));
}

function buildPrompt(item, web) {
  return [
    'Sei un normalizzatore prodotto per la spesa (lingua: IT).',
    'Ti fornisco un ITEM (name, brand) riconosciuto da OCR e alcuni RISULTATI WEB.',
    'Obiettivo: restituisci SOLO JSON con lo schema:',
    '{ "normalizedName":"", "canonicalBrand":"", "category":"", "subcategory":"", "attributes":[], "confidence":0.0, "reason":"" }',
    '',
    'Regole:',
    '- normalizedName: breve e chiaro, senza url, con pezzi tra parentesi se noti (es. "(3 pz)")',
    '- canonicalBrand: brand standardizzato (vuoto se ignoto)',
    '- category/subcategory: tassonomia casalinga (es. "Pulizia", "Spugne e abrasivi")',
    '- attributes: array di parole/etichette utili (es. ["abrasiva","multicolor","cucina"])',
    '- confidence: 0–1, stima affidabilità in base ai risultati.',
    '- reason: una frase breve sul perché.',
    '',
    'ITEM:',
    JSON.stringify(item, null, 2),
    '',
    'RISULTATI WEB (titolo • snippet • dominio):',
    ...web.map(w => `- ${w.title} • ${w.snippet} • ${w.displayLink}`),
    '',
    'Rispondi SOLO JSON.'
  ].join('\n');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });
    const { items = [], locale = 'it-IT' } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ ok:false, error:'items[] richiesto' });

    const out = [];
    // batch semplice, 1 query per item
    for (const raw of items) {
      const key = JSON.stringify({ n: raw?.name || '', b: raw?.brand || '' });
      const hit = mem.get(key);
      if (hit && (now() - hit.t) < TTL) { out.push(hit.v); continue; }

      const q = [raw?.brand, raw?.name].filter(Boolean).join(' ').trim() || (raw?.name || '');
      const web = await googleSearch(q, 5);

      let normalized = {
        normalizedName: (raw?.name || '').trim(),
        canonicalBrand: (raw?.brand || '').trim(),
        category: '',
        subcategory: '',
        attributes: [],
        confidence: 0.2,
        reason: web.length ? 'Fallback: normalizzazione minima senza mod.' : 'Nessun risultato web'
      };

      try {
        const prompt = buildPrompt({ name: raw?.name || '', brand: raw?.brand || '', locale }, web);
        const resp = await openai.chat.completions.create({
          model: TEXT_MODEL,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Rispondi sempre e solo JSON valido.' },
            { role: 'user', content: prompt }
          ],
        });
        const txt = resp?.choices?.[0]?.message?.content || '';
        const j = JSON.parse(txt);
        // coerce minima
        normalized = {
          normalizedName: String(j?.normalizedName || normalized.normalizedName).trim(),
          canonicalBrand: String(j?.canonicalBrand || normalized.canonicalBrand).trim(),
          category: String(j?.category || ''),
          subcategory: String(j?.subcategory || ''),
          attributes: Array.isArray(j?.attributes) ? j.attributes.slice(0, 8) : [],
          confidence: Number(j?.confidence || 0),
          reason: String(j?.reason || '').slice(0, 200)
        };
      } catch (e) {
        // lascia fallback
      }

      const val = { in: { name: raw?.name || '', brand: raw?.brand || '' }, out: normalized };
      mem.set(key, { t: now(), v: val });
      out.push(val);
    }

    res.status(200).json({ ok: true, results: out });
  } catch (e) {
    console.error('[normalize] fail', e);
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
