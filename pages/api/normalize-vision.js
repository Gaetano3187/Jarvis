// pages/api/normalize-vision.js
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = (process.env.NORMALIZE_VISION_MODEL || 'gpt-4o-mini').trim();

const STOPLINES = /\b(carta\s+\*{2,}|bancomat|pos|resto|sconto|arrotondamento|pagamento|contanti|totale|imponibile|ventilazione|iva)\b/i;

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

    // filtra righe evidentemente non-prodotto
    const filtered = items.map(it => ({
      ...it,
      _drop: STOPLINES.test(String(it?.name||'')) ? true : false
    }));

    const system = [
      'Sei un normalizzatore di righe scontrino (IT).',
      'Per ogni item restituisci JSON:',
      '{ "results":[ {',
      '  "drop": false,',
      '  "normalizedName": "string",',
      '  "canonicalBrand": "string",',
      '  "unitsPerPack": 10,',
      '  "unitLabel": "pezzi|fette|pod|capsule|uova|cartoni|rotoli|buste|unità",',
      '  "packMultiplier": 1',
      '} ] }',
      'Regole:',
      '- Usa *conoscenza del prodotto* per pezzi/confezione:',
      '  • Ferrero Fiesta = 10 pezzi',
      '  • Motta Yo-Yo = 10 pezzi',
      '  • Pancarrè (Mulino Bianco) 16F = 16 fette',
      '  • Dash Pods 30PZ = 30 pod',
      '  • Uova fresche = 6 uova',
      '  • Zucchero Eridania “pacco 1” = 1 kg (unitsPerPack = 1, unitLabel = "kg" → ma lascia "unità" se non sicuro)',
      '  • Latte UHT (Parmalat/Arborea) = 1 cartone',
      '- Dai un brand canonico (Mulino Bianco, Ferrero, Galbani, San Carlo, Parmalat, Arborea, Garofalo, Eridania, Lenor, Lavazza…).',
      '- Leggi moltiplicatori tipo "x3", "3 conf.", "3 pz" → packMultiplier.',
      '- Se non è un prodotto (Carta ****, Resto, Sconto) metti {"drop": true}.',
      '- Non inventare numeri esotici: se dubbio, unitsPerPack null e unitLabel "unità"; packMultiplier = 1.',
      `Contesto negozio: ${store || '(non specificato)'} | locale: ${locale}`
    ].join('\n');

    const user = [
      'Righe grezze:',
      JSON.stringify(filtered.map(({name, brand, _drop}) => ({ name, brand: brand||'', _drop })), null, 2),
      '',
      'Estratto OCR intero (aiuta):',
      receiptText || '(vuoto)'
    ].join('\n');

    const resp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || '{}';
    const json = safeParse(text, { results: [] });
    const out = Array.isArray(json.results) ? json.results : [];

    // allinea
    const N = Math.min(filtered.length, out.length);
    const results = [];
    for (let i=0; i<N; i++){
      const src = filtered[i];
      const r = out[i] || {};
      if (src._drop) { results.push({ in: items[i], out: null, drop: true }); continue; }
      results.push({
        in: items[i],
        out: (!r?.drop) ? {
          normalizedName: str(r.normalizedName),
          canonicalBrand: str(r.canonicalBrand),
          unitsPerPack: intOrNull(r.unitsPerPack),
          unitLabel: str(r.unitLabel) || 'unità',
          packMultiplier: intOrOne(r.packMultiplier)
        } : null,
        drop: !!r?.drop
      });
    }

    return res.status(200).json({ ok:true, results, ...(wantTrace ? { raw: text } : {}) });
  } catch (e) {
    console.error('[normalize-vision]', e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}

/* utils */
async function readJSON(req){ if (req.body && typeof req.body==='object') return req.body; const bufs=[]; for await (const c of req) bufs.push(c); try{ return JSON.parse(Buffer.concat(bufs).toString('utf8')) }catch{ return {} } }
function safeParse(s,d){ try{ return JSON.parse(s) }catch{ return d } }
function str(s){ return (s==null ? '' : String(s)).trim() }
function intOrNull(n){ const v=Number(n); return Number.isFinite(v)?Math.round(v):null }
function intOrOne(n){ const v=Number(n); return Number.isFinite(v)&&v>0?Math.round(v):1 }
