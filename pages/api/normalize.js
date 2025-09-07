// pages/api/normalize.js
import { openai, TEXT_MODEL as EXPORTED_MODEL } from '@/lib/openai';

const CSE_ID  = process.env.GOOGLE_CSE_ID || '';
const CSE_KEY = process.env.GOOGLE_CSE_KEY || '';
const USE_WEB = !!(CSE_ID && CSE_KEY);

// ✅ modello sicuro (fallback a gpt-4o-mini se env/export mancano)
const MODEL = (process.env.OPENAI_TEXT_MODEL?.trim?.() || EXPORTED_MODEL || 'gpt-4o-mini').trim();

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

// cache in-mem 10 min
const mem = new Map();
const TTL = 10 * 60 * 1000;
const now = () => Date.now();

// Placeholder leggibile se non troviamo una foto reale
const FALLBACK_IMG = (q) =>
  `https://dummyimage.com/256x256/0b1220/ffffff&text=${encodeURIComponent(String(q || '').slice(0, 18))}`;

// —— Google CSE (web results)
async function googleSearch(q, num = 5) {
  if (!USE_WEB) return { items: [], mode: 'llm-only' };
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(CSE_KEY)}&cx=${encodeURIComponent(CSE_ID)}&q=${encodeURIComponent(q)}&num=${num}&hl=it&gl=it`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { items: [], mode: 'web-failed' };
    const j = await r.json();
    const items = Array.isArray(j.items)
      ? j.items.map(it => ({
          title: it.title || '',
          snippet: it.snippet || '',
          link: it.link || '',
          displayLink: it.displayLink || ''
        }))
      : [];
    return { items, mode: 'web' };
  } catch {
    return { items: [], mode: 'web-error' };
  }
}

// —— Google CSE Image (più tentativi + scelta link migliore + log) ——
const IMG_EXT_OK  = /\.(jpe?g|png|webp|gif)$/i;
const DOMAIN_SKIP = /(^|\.)pinterest\.|(^|\.)alamy\.|(^|\.)istockphoto\.|(^|\.)dreamstime\./i;
const isImgLink   = (u) => typeof u === 'string' && u.startsWith('http');
const isGoodLink  = (u, dl) => isImgLink(u) && IMG_EXT_OK.test(u) && !DOMAIN_SKIP.test(dl || '');

/**
 * Una chiamata a CSE Image per la query q.
 * Preferisce link diretti a immagini (estensione valida) e domini non "problematici".
 * Logga sempre query, num risultati e link scelto.
 */
async function googleImageOnce(q, num = 6) {
  const url =
    `https://www.googleapis.com/customsearch/v1?searchType=image&imgType=photo&imgSize=large&safe=active&num=${num}` +
    `&key=${encodeURIComponent(CSE_KEY)}&cx=${encodeURIComponent(CSE_ID)}&q=${encodeURIComponent(q)}&hl=it&gl=it` +
    `&fields=items(link,displayLink,mime)`;

  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.log('[normalize:image] HTTP', r.status, 'per', q);
      return null;
    }
    const j = await r.json();
    const items = Array.isArray(j.items) ? j.items : [];
    console.log('[normalize:image] q=', q, 'items=', items.length);

    // 1) Preferisci link diretto con estensione immagine e dominio “pulito”
    for (const it of items) {
      const link = it?.link || '';
      const dl   = it?.displayLink || '';
      if (isGoodLink(link, dl)) {
        console.log('[normalize:image] pick (good ext/domain):', link);
        return link;
      }
    }

    // 2) Altrimenti prendi il primo link HTTP “sensato” (domain non bloccato)
    for (const it of items) {
      const link = it?.link || '';
      const dl   = it?.displayLink || '';
      if (isImgLink(link) && !DOMAIN_SKIP.test(dl)) {
        console.log('[normalize:image] pick (first acceptable):', link);
        return link;
      }
    }

    // 3) Nessun candidato valido
    console.log('[normalize:image] no candidate for', q);
    return null;
  } catch (e) {
    console.log('[normalize:image] error for', q, '-', e?.message || e);
    return null;
  }
}

/**
 * Prova più query in sequenza (base + varianti),
 * restituisce il primo link valido trovato.
 */
async function googleImageMulti(queries) {
  if (!USE_WEB) return null;
  for (const q of queries) {
    const qq = String(q || '').trim();
    if (!qq) continue;
    try {
      const link = await googleImageOnce(qq, 6);
      if (link) return link;
    } catch (e) {
      console.log('[normalize:image] multi error for', qq, '-', e?.message || e);
    }
  }
  console.log('[normalize:image] no image for any query:', queries);
  return null;
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

    const activeModel = (typeof MODEL === 'string' && MODEL.length) ? MODEL : 'gpt-4o-mini';

    const out = [];
    for (const raw of items) {
      const key = JSON.stringify({ n: (raw?.name||'').trim(), b: (raw?.brand||'').trim() }).toLowerCase();
      const hit = mem.get(key);
      if (hit && now() - hit.t < TTL) { out.push(hit.v); continue; }

      const baseQ = [raw?.brand, raw?.name].filter(Boolean).join(' ').trim() || (raw?.name || '');
      const { items: webItems, mode } = await googleSearch(baseQ, 5);
      const webLines = (webItems || []).map(w => `- ${w.title} • ${w.snippet} • ${w.displayLink}`);

      // 🎯 più tentativi per immagine
      const altQs = [];
      if (raw?.brand && raw?.name) {
        altQs.push(`${raw.brand} ${raw.name} prodotto`);
        altQs.push(`${raw.name} ${raw.brand} confezione`);
      }
      altQs.push(String(raw?.name || '').trim());
      const img = await googleImageMulti([baseQ, ...altQs]);

      let result = {
        in: { name: raw?.name || '', brand: raw?.brand || '' },
        out: {
          normalizedName: (raw?.name || '').trim(),
          canonicalBrand: (raw?.brand || '').trim(),
          category: '',
          subcategory: '',
          attributes: [],
          confidence: 0.2,
          reason: mode === 'web' ? 'Fallback senza LLM' : 'LLM-only fallback',
          imageUrl: img || FALLBACK_IMG(baseQ)   // ✅ sempre un’immagine
        },
        mode
      };

      try {
        const prompt = promptFor({ name: raw?.name || '', brand: raw?.brand || '', locale }, webLines, mode);
        const r = await openai.chat.completions.create({
          model: activeModel,
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
          reason: String(j?.reason || '').slice(0, 200),
          imageUrl: img || j?.imageUrl || result.out.imageUrl
        };
      } catch (e) {
        result.error = e?.message || String(e);
        result.out.imageUrl = img || result.out.imageUrl;
      }

      if (trace) {
        console.log('[normalize] q=', baseQ, 'img=', result.out.imageUrl, 'mode=', result.mode);
      }

      mem.set(key, { t: now(), v: result });
      out.push(result);
    }

    res.status(200).json({
      ok:true,
      results: out,
      usedWeb: USE_WEB,
      note: USE_WEB ? 'web+llm' : 'llm-only',
      ts: Date.now(),
      ...(trace ? { debug:true, model: MODEL } : {})
    });
  } catch (e) {
    console.error('[normalize] fail', e);
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
