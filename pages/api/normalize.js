// pages/api/normalize.js
import { openai, TEXT_MODEL } from '@/lib/openai';

const CSE_ID  = process.env.GOOGLE_CSE_ID || '';
const CSE_KEY = process.env.GOOGLE_CSE_KEY || '';
const USE_WEB = !!(CSE_ID && CSE_KEY);

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

// cache in-mem 10min
const mem = new Map();
const TTL = 10 * 60 * 1000;
const now = () => Date.now();

async function googleSearch(q, num = 5) {
  if (!USE_WEB) return { items: [], mode: 'llm-only' };
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(CSE_KEY)}&cx=${encodeURIComponent(CSE_ID)}&q=${encodeURIComponent(q)}&num=${num}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { items: [], mode: 'web-failed' };
    const j = await r.json();
    const items = Array.isArray(j.items) ? j.items.map(it => ({
      title: it.title || '',
      snippet: it.snippet || '',
      link: it.link || '',
      displayLink: it.displayLink || ''
    })) : [];
    return { items, mode: 'web' };
  } catch {
    return { items: [], mode: 'web-error' };
  }
}

function promptFor(item, webLines, mode) {
  return [
    'Sei un normalizzatore di voci prodotto per la spesa (IT).',
    'Rendi standard nome, brand e classifica il prodotto.',
    'Rispondi SOLO JSON con schema:',
    '{ "normalizedName":"","canonicalBrand":"","category":"","subcategory":"","attributes":[], "confidence":0.0, "reason":"" }',
    '',
    'Regole:',
    '- normalizedName: conciso, con pezzi/pack tra parentesi (es. "(3 pz)") se deducibile.',
    '- NON inventare numeri: se non sai i pezzi, ometti.',
    '- canonicalBrand: brand canonico (o vuoto).',
    '- category/subcategory: tassonomia semplice (es. "Pulizia", "Spugne e abrasivi").',
    '- attributes: max 8 tag utili (es. ["abrasiva","multicolor","cucina"]).',
    '- confidence: 0–1 (0.8+ se molto sicuro).',
    '',
    'ITEM OCR:',
    JSON.stringify(item, null, 2),
    '',
    mode === 'web' && webLines.length
      ? 'Estratti WEB (titolo • snippet • dominio):\n' + webLines.join('\n')
      : 'Nessun risultato web: usa conoscenza generale e il senso comune.',
    '',
    'Rispondi solo JSON.'
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });
    const { items = [], locale = 'it-IT', trace = false } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ ok:false, error:'items[] richiesto' });

    const out = [];
    for (const raw of items) {
      const key = JSON.stringify({ n: (raw?.name||'').trim(), b: (raw?.brand||'').trim() }).toLowerCase();
      const hit = mem.get(key);
      if (hit && now() - hit.t < TTL) { out.push(hit.v); continue; }

      const q = [raw?.brand, raw?.name].filter(Boolean).join(' ').trim() || (raw?.name || '');
      const { items: webItems, mode } = await googleSearch(q, 5);
      const webLines = (webItems || []).map(w => `- ${w.title} • ${w.snippet} • ${w.displayLink}`);

      let result = {
        in: { name: raw?.name || '', brand: raw?.brand || '' },
        out: {
          normalizedName: (raw?.name || '').trim(),
          canonicalBrand: (raw?.brand || '').trim(),
          category: '',
          subcategory: '',
          attributes: [],
          confidence: 0.2,
          reason: mode === 'web' ? 'Fallback senza LLM' : 'LLM-only fallback'
        },
        mode
      };

      try {
        const prompt = promptFor({ name: raw?.name || '', brand: raw?.brand || '', locale }, webLines, mode);
        const r = await openai.chat.completions.create({
          model: TEXT_MODEL,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Rispondi sempre e solo JSON valido.' },
            { role: 'user', content: prompt },
          ],
        });
        const txt = r?.choices?.[0]?.message?.content || '{}';
        const j = JSON.parse(txt);

        result.out = {
          normalizedName: String(j?.normalizedName || result.out.normalizedName).trim(),
          canonicalBrand: String(j?.canonicalBrand || result.out.canonicalBrand).trim(),
          category: String(j?.category || ''),
          subcategory: String(j?.subcategory || ''),
          attributes: Array.isArray(j?.attributes) ? j.attributes.slice(0, 8) : [],
          confidence: Number(j?.confidence || 0),
          reason: String(j?.reason || '').slice(0, 200)
        };
      } catch (e) {
        // lascio fallback
        result.error = e?.message || String(e);
      }

      mem.set(key, { t: now(), v: result });
      out.push(result);
    }

    res.status(200).json({ ok:true, results: out, usedWeb: USE_WEB, note: USE_WEB ? 'web+llm' : 'llm-only', ts: Date.now(), ...(trace?{debug:true}: {}) });
  } catch (e) {
    console.error('[normalize] fail', e);
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
