// pages/api/normalize-vision.js
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = (process.env.NORMALIZE_VISION_MODEL || 'gpt-4o-mini').trim();

/**
 * Body atteso:
 * {
 *   items: [{ name, brand? }],             // righe OCR grezze
 *   receiptText?: string,                  // testo OCR completo (opzionale, aiuta)
 *   store?: string,                        // negozio (opz.)
 *   locale?: 'it-IT',                      // default it-IT
 *   trace?: boolean                        // opzionale
 * }
 *
 * Risposta:
 * { ok:true, results:[{ in, out: { normalizedName, canonicalBrand, unitsPerPack, unitLabel, packMultiplier? }, drop?:true }] }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error: 'Method not allowed' });

  try {
    const body = await readJSON(req);
    const items = Array.isArray(body?.items) ? body.items : [];
    const receiptText = String(body?.receiptText || '');
    const store = String(body?.store || '');
    const locale = String(body?.locale || 'it-IT');
    const wantTrace = !!body?.trace;

    if (!items.length) return res.status(400).json({ ok:false, error:'items required' });

    const sys = [
      'Sei un normalizzatore di righe scontrino in italiano.',
      'Per ogni item restituisci SOLO un JSON con:',
      '{ "results": [ {',
      '  "drop": false,                             // true se non è un prodotto (es. Carta ****, Resto, Sconto)',
      '  "normalizedName": "string",                // es. "Fiesta Classica"',
      '  "canonicalBrand": "string",                // es. "Ferrero"',
      '  "unitsPerPack": 10,                        // numero unità in una confezione (null se sconosciuto)',
      '  "unitLabel": "pezzi|fette|pod|capsule|cartoni|rotoli|buste|unità",',
      '  "packMultiplier": 1                        // 1 se non leggibile, >1 se testo indica "x3", "3 conf.", "3 pezzi" come moltiplicatore confezioni',
      '} ] }',
      'Se non trovi un valore, imposta null (o 1 per packMultiplier).',
      'Usa la tua conoscenza del prodotto (es. Fiesta Ferrero = 10 pezzi).',
      'Non sommare i prezzi. Non inventare quantità palesemente errate.',
      `Contesto negozio: ${store || '(non specificato)'} | locale: ${locale}`
    ].join('\n');

    const user = [
      'Righe grezze da scontrino:',
      JSON.stringify(items.map(({name, brand}) => ({ name, brand: brand || '' })), null, 2),
      '',
      'Testo OCR completo (se presente):',
      receiptText || '(vuoto)'
    ].join('\n');

    const resp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ]
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || '{}';
    const parsed = safeParseJSON(text, { results: [] });
    const outResults = Array.isArray(parsed.results) ? parsed.results : [];

    // Allinea per indice: se size diversa, tronca al minimo
    const N = Math.min(items.length, outResults.length);
    const results = [];
    for (let i = 0; i < N; i++) {
      const r = outResults[i] || {};
      const norm = {
        normalizedName: strOrEmpty(r.normalizedName),
        canonicalBrand: strOrEmpty(r.canonicalBrand),
        unitsPerPack: toIntOrNull(r.unitsPerPack),
        unitLabel: strOrEmpty(r.unitLabel) || 'unità',
        packMultiplier: toIntOrOne(r.packMultiplier)
      };
      const drop = !!r.drop;
      results.push({
        in: items[i],
        out: drop ? null : norm,
        drop
      });
    }

    return res.status(200).json({
      ok: true,
      results,
      ...(wantTrace ? { raw: text } : {})
    });
  } catch (e) {
    console.error('[normalize-vision] error', e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}

/* ---------------- utils ---------------- */
async function readJSON(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}
function safeParseJSON(s, def){ try { return JSON.parse(s) } catch { return def } }
function strOrEmpty(s){ return (s == null ? '' : String(s)).trim() }
function toIntOrNull(n){ const v = Number(n); return Number.isFinite(v) ? Math.round(v) : null }
function toIntOrOne(n){ const v = Number(n); return Number.isFinite(v) && v > 0 ? Math.round(v) : 1 }
