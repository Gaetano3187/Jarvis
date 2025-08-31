// pages/api/sommelier.js
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

/* ===================== ENV ===================== */
const OPENAI_API_KEY   = process.env.OPENAI_API_KEY;
const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;   // server-only
const GOOGLE_API_KEY   = process.env.GOOGLE_API_KEY;              // Programmable Search
const GOOGLE_CX        = process.env.GOOGLE_CX;

const LLM_MODEL = process.env.SOMMELIER_MODEL || 'gpt-4o-mini';

/* ===================== Clients ===================== */
const sbAdmin = (SUPABASE_URL && SUPABASE_SERVICE)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE)
  : null;

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* ===================== Budget caps (adattati) ===================== */
const CAPS = {
  enoteca: {
    rosso:   { daily: 25, target: 40, occasion: 70, cap: 120 },
    bdxLeft: 90,
    bianco:  40,
    rosato:  28,
  },
  ristorante: {
    rosso:   { daily: 50, target: 80, occasion: 150, cap: 220 },
    bdxLeft: 160,
    bianco:  60,
    rosato:  45,
  },
};

function capFor(req) {
  const ctx = req.context ?? 'enoteca';
  const mood = req.mood ?? 'rosso';
  if (req.budgetCap) return req.budgetCap;
  if (mood === 'rosso')  return CAPS[ctx].rosso.cap;
  if (mood === 'bianco') return CAPS[ctx].bianco;
  if (mood === 'rosato') return CAPS[ctx].rosato;
  return CAPS[ctx].rosso.target; // mix
}

function bandsFor(req) {
  const ctx = req.context ?? 'enoteca';
  const mood = req.mood ?? 'rosso';

  if (mood === 'rosso') {
    const { daily, target, occasion, cap } = CAPS[ctx].rosso;
    return [
      { key: 'daily',    label: `0–${daily} € (${ctx})`,       max: daily },
      { key: 'target',   label: `${daily+1}–${target} € (${ctx})`, max: target },
      { key: 'occasion', label: `${target+1}–${occasion} € (${ctx})`, max: occasion },
      { key: 'premium',  label: `${occasion+1}–${cap} € (${ctx})`, max: cap },
    ];
  }

  const cap = capFor(req);
  let b1, b2, b3;
  if (mood === 'bianco')     { b1 = 20; b2 = 35; b3 = CAPS[ctx].bianco; }
  else if (mood === 'rosato'){ b1 = 18; b2 = 25; b3 = CAPS[ctx].rosato; }
  else                       { b1 = 25; b2 = 45; b3 = 80; } // mix
  return [
    { key: 'daily',    label: `0–${b1} € (${ctx})`,           max: b1 },
    { key: 'target',   label: `${b1+1}–${b2} € (${ctx})`,     max: b2 },
    { key: 'occasion', label: `${b2+1}–${b3} € (${ctx})`,     max: b3 },
    { key: 'premium',  label: `${b3+1}–${cap} € (${ctx})`,    max: cap },
  ];
}

/* ===================== Utils ===================== */
const nowISO = () => new Date().toISOString();

function cleanText(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pickPrice(s) {
  const m = String(s || '').match(/(\d+[.,]?\d*)\s*€|€\s*(\d+[.,]?\d*)/i);
  if (!m) return null;
  const v = Number((m[1] || m[2]).replace(',', '.'));
  return isNaN(v) ? null : v;
}

function bandKeyFromPrice(bands, price) {
  if (price == null) return null;
  for (const b of bands) if (price <= b.max) return b.key;
  return 'premium';
}

/* ===================== Drawer adapter ===================== */
function toDrawerRec(sugg, bandKey) {
  const bandMap = { daily: 'low', target: 'med', occasion: 'high', premium: 'high' };
  return {
    name: sugg.name,
    winery: '',
    denomination: sugg.denomOrGrape || '',
    region: sugg.area || '',
    why: sugg.whyMatch || (sugg.notes || []).join(', '),
    typical_price_eur: sugg.typical_price_eur ?? pickPrice(sugg.priceBand),
    price_band: bandMap[bandKey] || 'med',
    out_of_budget: false,
    links: sugg.links || [],
    vintage_suggestion: sugg.vintage ? [String(sugg.vintage)] : [],
    similar_to: sugg.similar_to || []   // <-- nuovo campo
  };
}

function ensureMinPerBand(groups, min = 3) {
  const keys = Object.keys(groups);
  // prova a bilanciare spostando dagli altri gruppi con surplus
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if ((groups[k] || []).length >= min) continue;
    for (let j = 0; j < keys.length && groups[k].length < min; j++) {
      if (j === i) continue;
      while ((groups[keys[j]] || []).length > min && groups[k].length < min) {
        groups[k].push(groups[keys[j]].pop());
      }
    }
  }
  return groups;
}

/* ===================== Gusti utente (bevuti + rating) ===================== */
async function fetchUserTaste(userId) {
  if (!sbAdmin || !userId) return { wines: [], places: [] };
  const { data: wines } = await sbAdmin
    .from('wines')
    .select('id, name, winery, region, style, grapes, grape_blend, rating_5, price_target')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const { data: places } = await sbAdmin
    .from('product_places')
    .select('item_id, kind')
    .eq('user_id', userId)
    .eq('item_type', 'wine')
    .eq('kind', 'purchase');

  const tastedIds = new Set((places || []).map(p => p.item_id));
  const tasted = (wines || []).filter(w => tastedIds.has(w.id));
  return { wines: tasted, places: places || [] };
}

/* Similarità dettagliata per "similar_to" */
function computeSimilarTo(sugg, tasteWines, topN = 3) {
  const nm = s => String(s || '').toLowerCase();
  const out = [];

  for (const t of (tasteWines || [])) {
    const reasons = [];
    let score = 0;

    // rating come peso
    const weight = (Number(t.rating_5) || 0) / 5; // 0..1
    score += weight * 0.5;

    // regione/area
    if (nm(t.region) && nm(sugg.area).includes(nm(t.region))) {
      reasons.push('regione simile');
      score += 0.7;
    }

    // cantina (grezzo: match nel nome)
    if (nm(t.name) && nm(sugg.name).includes(nm(t.name.split(' ')[0]))) {
      reasons.push('cantina menzionata');
      score += 0.4;
    }

    // vitigni vs denom/grape string
    const list = nm(sugg.denomOrGrape);
    let grapeHit = 0;
    for (const g of (t.grapes || []).map(nm)) {
      if (g && list.includes(g)) grapeHit++;
    }
    if (grapeHit > 0) {
      reasons.push(`${grapeHit} vitigno/i in comune`);
      score += 0.6 * grapeHit;
    }

    // stile (“rosso/bianco/rosato”, ecc.) cercato nelle note
    if (t.style && (sugg.notes || []).join(' ').toLowerCase().includes(nm(t.style))) {
      reasons.push('stile affine');
      score += 0.3;
    }

    // prezzo vicino
    if (t.price_target != null && sugg.typical_price_eur != null) {
      const diff = Math.abs(Number(t.price_target) - Number(sugg.typical_price_eur));
      const closeness = Math.max(0, 1 - diff / 50); // ±50€ → 0
      if (closeness > 0.2) {
        reasons.push('fascia prezzo vicina');
        score += 0.25 * closeness;
      }
    }

    if (reasons.length) {
      out.push({
        wine_id: t.id,
        name: t.name,
        rating_5: t.rating_5 || 0,
        reasons,
        score: Number(score.toFixed(3)),
      });
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topN);
}

/* ===================== LLM Helpers ===================== */
const SYS_PARSE_REQUEST = `
Sei un sommelier digitale. Dato un prompt utente, estrai un SommelierRequest JSON con campi:
{ "mood":"rosso|bianco|rosato|mix", "context":"enoteca|ristorante", "budgetCap": number|undefined,
  "dish": string|undefined, "locationHint": string|undefined, "must": string[]|undefined, "avoid": string[]|undefined }.
Rispondi SOLO JSON valido.`;

const SYS_PARSE_WINE_LIST = `
Sei un parser di carte vini. Estrai un array nel formato:
[{ "name":"", "denomOrGrape":"", "vintage":"", "area":"", "notes":[], "whyMatch":"", "priceBand":"" }]
- "priceBand": una stringa tipo "25–40 € (enoteca)" o "≤25 €".
- "notes": 3–5 descrittori sintetici.
Rispondi SOLO JSON. Se serve, racchiudi l'array in {"items":[...]}.
`;

const SYS_WEB_SUMMARIZE = `
Sei un sommelier. Dati frammenti web su un vino, sintetizza:
{ "name":"", "denomOrGrape":"", "vintage":"", "area":"", "notes":[], "whyMatch":"", "priceBand":"~XX €" }.
Rispondi SOLO JSON valido.`;

async function llmJSON(system, userText, fallback) {
  if (!openai) return fallback;
  const resp = await openai.chat.completions.create({
    model: LLM_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: String(userText).slice(0, 12000) }
    ]
  });
  try {
    return JSON.parse(resp.choices?.[0]?.message?.content || '{}');
  } catch { return fallback; }
}

async function llmJSONArray(system, userText, fallback = []) {
  if (!openai) return fallback;
  const resp = await openai.chat.completions.create({
    model: LLM_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system + '\nRestituisci come {"items":[...]}.' },
      { role: 'user',   content: String(userText).slice(0, 12000) }
    ]
  });
  try {
    const j = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    return Array.isArray(j.items) ? j.items : fallback;
  } catch { return fallback; }
}

/* ===================== Google Programmable Search ===================== */
async function googleSearch(q, num = 6) {
  if (!GOOGLE_API_KEY || !GOOGLE_CX) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_API_KEY)}&cx=${encodeURIComponent(GOOGLE_CX)}&q=${encodeURIComponent(q)}&num=${num}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  const items = j.items || [];
  return items.map(it => ({ title: it.title, link: it.link, snippet: it.snippet || '' }));
}

/* ===================== Parse richiesta ===================== */
async function buildSommelierRequest(queryText) {
  const txt = cleanText(queryText || '');
  if (!txt) return { mood:'rosso', context:'enoteca' };
  const req = await llmJSON(SYS_PARSE_REQUEST, txt, { mood:'rosso', context:'enoteca' });
  // normalizza
  req.mood = ['rosso','bianco','rosato','mix'].includes(req.mood) ? req.mood : 'rosso';
  req.context = ['enoteca','ristorante'].includes(req.context) ? req.context : 'enoteca';
  if (req.budgetCap && typeof req.budgetCap !== 'number') delete req.budgetCap;
  if (req.must && !Array.isArray(req.must)) delete req.must;
  if (req.avoid && !Array.isArray(req.avoid)) delete req.avoid;
  return req;
}

/* ===================== Candidate da carta (OCR/QR) ===================== */
async function parseWineListFromText(listText) {
  const arr = await llmJSONArray(SYS_PARSE_WINE_LIST, cleanText(listText), []);
  return arr.map(x => ({
    name: x.name || '',
    denomOrGrape: x.denomOrGrape || '',
    vintage: x.vintage || '',
    area: x.area || '',
    notes: Array.isArray(x.notes) ? x.notes.slice(0,5) : [],
    whyMatch: x.whyMatch || '',
    priceBand: x.priceBand || '',
    typical_price_eur: pickPrice(x.priceBand),
    links: [],
    source: 'list',
  })).filter(x => x.name);
}

/* ===================== Candidate dal web (usato SOLO se non c'è carta) ===================== */
async function expandCandidatesFromWeb(req) {
  if (!GOOGLE_API_KEY || !GOOGLE_CX) return [];
  const terms = [
    req.locationHint,
    req.mood === 'bianco' ? 'best white wine' : req.mood === 'rosato' ? 'best rosé wine' : 'best red wine',
    ...(req.must || []),
    'value',
  ].filter(Boolean).join(' ');
  const hits = await googleSearch(terms, 8);
  const out = [];
  for (const h of hits) {
    const j = await llmJSON(SYS_WEB_SUMMARIZE, `${h.title}\n${h.snippet}\n${h.link}`, null);
    if (!j) continue;
    out.push({
      name: j.name || h.title,
      denomOrGrape: j.denomOrGrape || '',
      vintage: j.vintage || '',
      area: j.area || '',
      notes: Array.isArray(j.notes) ? j.notes.slice(0,5) : [],
      whyMatch: j.whyMatch || '',
      priceBand: j.priceBand || '',
      typical_price_eur: pickPrice(j.priceBand),
      links: [{ title: 'Fonte', url: h.link }],
      source: 'web',
    });
  }
  return out;
}

/* ===================== Filtra e ranking ===================== */
function filterByReq(candidates, req) {
  const must  = (req.must || []).map(s => s.toLowerCase());
  const avoid = (req.avoid || []).map(s => s.toLowerCase());
  const mood  = req.mood || 'rosso';

  return candidates.filter(c => {
    const T = `${c.name} ${c.denomOrGrape} ${c.area} ${(c.notes || []).join(' ')}`.toLowerCase();
    if (must.length && !must.every(m => T.includes(m))) return false;
    if (avoid.length && avoid.some(a => T.includes(a))) return false;
    if (mood === 'bianco' && /rosso|rouge|tinto/.test(T)) return false;
    if (mood === 'rosato' && !/(rosato|rosé)/.test(T)) return false;
    if (mood === 'rosso' && /(bianco|white|blanc|rosé|rosato)/.test(T)) return false;
    return true;
  });
}

function scoreAndGroup(candidates, req, taste) {
  const bands = bandsFor(req);
  const cap = capFor(req);

  for (const c of candidates) {
    // similarità dettagliata
    const similar = computeSimilarTo(c, taste.wines || [], 3);
    c.similar_to = similar; // arr di { wine_id, name, rating_5, reasons[], score }

    // punteggio
    let base = 0;
    if (similar.length) {
      base += similar.reduce((s, it) => s + it.score, 0); // somma dei top3
    }
    // budget proximity
    const p = c.typical_price_eur;
    if (p != null) {
      const target = bands.find(b => b.key === 'target')?.max || cap * 0.5;
      const budgetScore = Math.max(0, 1 - Math.abs(p - target) / Math.max(1, cap));
      base += budgetScore * 0.8;
    }
    c._score = Number(base.toFixed(3));
  }

  candidates.sort((a, b) => (b._score || 0) - (a._score || 0));

  const groups = { daily: [], target: [], occasion: [], premium: [] };
  for (const c of candidates) {
    const k = bandKeyFromPrice(bands, c.typical_price_eur);
    if (!k) continue;
    groups[k]?.push(c);
  }
  return { bands, groups };
}

/* ===================== Risposta finale ===================== */
function buildResponse(req, bands, groups, source) {
  const order = ['daily','target','occasion','premium'];
  const shortlist = [];

  for (const k of order) {
    for (const c of groups[k]) {
      shortlist.push({
        name: c.name,
        denomOrGrape: c.denomOrGrape || '',
        vintage: c.vintage || '',
        area: c.area || '',
        notes: c.notes || [],
        whyMatch: c.whyMatch || '',
        priceBand: c.priceBand || (c.typical_price_eur != null ? `~ ${c.typical_price_eur} €` : ''),
        service: undefined,
        alt: undefined,
        similar_to: c.similar_to || []   // <-- nuovo
      });
    }
  }

  // compat drawer UI
  const recommendations = [];
  for (const k of order) {
    for (const c of groups[k]) {
      recommendations.push(toDrawerRec(c, k));
    }
  }

  return {
    sommelier: {
      timestamp: nowISO(),
      request: req,
      shortlist,
      rationale: `Selezione basata su ${source === 'list' ? 'carta del locale' : (source === 'web' ? 'fonti web' : 'regole interne')} e gusti personali.`,
    },
    source,
    budget_filter: { min: 0, max: capFor(req) },
    recommendations,
    notes: source === 'list'
      ? 'Suggerimenti tratti dalla lista fornita (OCR/QR).'
      : source === 'web'
      ? 'Suggerimenti tratti dal web (Google Custom Search).'
      : 'Suggerimenti offline (fallback).'
  };
}

/* ===================== Handler ===================== */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { query = '', wineLists = [], qrLinks = [], userId } = req.body || {};
    const requestObj = await buildSommelierRequest(query);

    // 1) Raccogli testi di carta (OCR + QR). Nota: NON farò backfill dal web se c'è carta.
    const listTexts = [...(wineLists || [])];

    // 2) Estrai candidate
    let candidates = [];
    if (listTexts.length) {
      for (const t of listTexts) {
        const arr = await parseWineListFromText(t);
        candidates.push(...arr);
      }
    } else {
      // Nessuna carta → posso usare il web se configurato
      const arr = await expandCandidatesFromWeb(requestObj);
      candidates.push(...arr);
      if (!arr.length && (!GOOGLE_API_KEY || !GOOGLE_CX)) {
        // fallback “offline” minimo se proprio non c'è nulla
        candidates = [
          { name:'Barbera d’Asti', denomOrGrape:'Barbera', vintage:'2021', area:'Piemonte', notes:['fruttato','acidità viva'], priceBand:'12–18 €', typical_price_eur:15, links:[], source:'offline' },
          { name:'Verdicchio dei Castelli di Jesi', denomOrGrape:'Verdicchio', vintage:'2022', area:'Marche', notes:['agrumi','mandorla'], priceBand:'10–16 €', typical_price_eur:13, links:[], source:'offline' },
          { name:'Etna Rosso', denomOrGrape:'Nerello Mascalese', vintage:'2020', area:'Etna', notes:['minerale','speziato leggero'], priceBand:'18–30 €', typical_price_eur:24, links:[], source:'offline' },
        ];
      }
    }

    // 3) Personalizzazione gusti in base ai “bevuti” + rating
    const taste = await fetchUserTaste(userId);

    // 4) Filtra secondo richiesta, rank, gruppi
    const filtered = filterByReq(candidates, requestObj);
    const { bands, groups } = scoreAndGroup(filtered, requestObj, taste);

    // 5) Assicurare almeno 3 per fascia prezzo (solo bilanciamento interno, niente web se c'è carta)
    const needPerBand = 3;
    const totalAvail = filtered.length;
    if (totalAvail >= needPerBand) {
      ensureMinPerBand(groups, needPerBand);
    }

    // 6) Build response
    const source = listTexts.length ? 'list' : (GOOGLE_API_KEY && GOOGLE_CX ? 'web' : 'offline');
    const payload = buildResponse(requestObj, bands, groups, source);

    return res.status(200).json(payload);
  } catch (e) {
    console.error('sommelier error', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
