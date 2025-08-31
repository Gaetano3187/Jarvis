// pages/api/sommelier.js
// Lista locale (foto/QR) -> 3 scelte (Low/Med/High) rispettando il budget.
// Altrimenti web search -> 5 alternative (SERPAPI o Bing se configurati).
const UA = 'JarvisSommelier/1.0 (+https://vercel.app)';

/* ---------------- Taste & Price parsing ---------------- */
function extractTasteHints(text = '', hints = {}) {
  const t = String(text || '').toLowerCase();
  const out = { ...hints, tags: Array.isArray(hints?.tags) ? [...hints.tags] : [] };

  // stile
  if (/\bros[ée]\b|rosato/.test(t)) out.style = 'rosé';
  else if (/\bbianco\b/.test(t)) out.style = 'bianco';
  else if (/\bfrizzante|spumante|metodo classico|prosecco|franciacorta\b/.test(t)) out.style = 'bollicine';
  else if (/\brosso\b/.test(t)) out.style = 'rosso';

  // struttura
  if (/\bcorpos[oa]|strutturat[oa]|pieno\b/.test(t)) out.body = 'full';
  else if (/\blegger[oa]|snello|fresco beverino\b/.test(t)) out.body = 'light';

  // tannino
  if (/\bnon troppo tannico|poco tannico|setoso|morbido\b/.test(t)) out.tannin = 'low';
  else if (/\btannico|ruvido|astringente\b/.test(t)) out.tannin = 'high';

  // acidità
  if (/\bnon troppo aspro|poco aspro|rotondo\b/.test(t)) out.acidity = 'low';
  else if (/\bfresco|tagliente|acido|verticale\b/.test(t)) out.acidity = 'high';

  // dolcezza
  if (/\bsecco\b/.test(t)) out.sweetness = 'dry';
  else if (/\bdolce|amabile|abboccato\b/.test(t)) out.sweetness = 'sweet';

  // tag sensoriali
  ['fruttato','speziato','minerale','aromatico','floreale','agrumi','tropicale']
    .forEach(k => { if (new RegExp(`\\b${k}\\b`).test(t)) out.tags.push(k); });

  // regione (rapida)
  const m = t.match(/\b(sicilia|piemonte|toscana|veneto|puglia|trentino|alto adige|friuli|campania|abruzzo|sardegna)\b/);
  if (m) out.region = m[1];

  // prezzo
  const budget = parseBudget(t);
  if (budget.min != null) out.price_min = budget.min;
  if (budget.max != null) out.price_max = budget.max;

  return out;
}

function parseBudget(t='') {
  const out = { min: null, max: null };

  // range "tra 15 e 25", "15-25", "15 – 25"
  let m = t.match(/(?:tra|fra)\s+(\d{1,4})\s*(?:e|a)\s*(\d{1,4})\s*€?/);
  if (!m) m = t.match(/(\d{1,4})\s*[–—-]\s*(\d{1,4})/);
  if (m) {
    out.min = Number(m[1]);
    out.max = Number(m[2]);
    if (out.min > out.max) [out.min, out.max] = [out.max, out.min];
    return out;
  }

  // sotto/meno di/max/<
  m = t.match(/\b(sotto|meno di|max(?:imo)?)\s+(\d{1,4})\s*€?/);
  if (!m) m = t.match(/<=?\s*(\d{1,4})\s*€?/);
  if (m) { out.max = Number(m[2] || m[1]); return out; }

  // sopra/più di/min/>=
  m = t.match(/\b(sopra|pi[uù] di|min(?:imo)?)\s+(\d{1,4})\s*€?/);
  if (!m) m = t.match(/>=?\s*(\d{1,4})\s*€?/);
  if (m) { out.min = Number(m[2] || m[1]); return out; }

  // "intorno a 20", "sui 25"
  m = t.match(/\b(intorno a|sui|circa)\s+(\d{1,4})\s*€?/);
  if (m) {
    const c = Number(m[2]);
    out.min = Math.max(0, Math.round(c * 0.8));
    out.max = Math.round(c * 1.2);
    return out;
  }

  // parole chiave
  if (/\beconomic[oa]\b/.test(t)) out.max = 15;
  if (/\bmedio\b/.test(t)) { out.min = 15; out.max = 30; }
  if (/\b(importante|alto|premium|costoso)\b/.test(t)) out.min = 30;

  return out;
}

/* ---------------- Profili vitigno (sintesi) ---------------- */
const GRAPE_PROFILES = {
  'nebbiolo': { body:'full', tannin:'high', acidity:'high', style:'rosso' },
  'sangiovese': { body:'med', tannin:'med', acidity:'high', style:'rosso' },
  'merlot': { body:'med', tannin:'med', acidity:'med', style:'rosso' },
  'cabernet': { body:'full', tannin:'high', acidity:'med', style:'rosso' },
  'nero d avola': { body:'full', tannin:'med', acidity:'med', style:'rosso' },
  'montepulciano': { body:'full', tannin:'med', acidity:'med', style:'rosso' },
  'aglianico': { body:'full', tannin:'high', acidity:'high', style:'rosso' },
  'primitivo': { body:'full', tannin:'med', acidity:'low', style:'rosso' },
  'frappato': { body:'light', tannin:'low', acidity:'med', style:'rosso' },
  'pinot nero': { body:'light', tannin:'low', acidity:'med', style:'rosso' },
  'schiava': { body:'light', tannin:'low', acidity:'med', style:'rosso' },

  'vermentino': { body:'light', tannin:'low', acidity:'high', style:'bianco' },
  'pecorino': { body:'med', tannin:'low', acidity:'high', style:'bianco' },
  'grillo': { body:'med', tannin:'low', acidity:'med', style:'bianco' },
  'fiano': { body:'med', tannin:'low', acidity:'med', style:'bianco' },
  'greco': { body:'med', tannin:'low', acidity:'med', style:'bianco' },
  'garganega': { body:'med', tannin:'low', acidity:'med', style:'bianco' },
  'chardonnay': { body:'med', tannin:'low', acidity:'med', style:'bianco' },
  'sauvignon': { body:'light', tannin:'low', acidity:'high', style:'bianco' },
};

/* ---------------- Parser lista vini (OCR/QR) ---------------- */
function parseWineList(raw = '') {
  const text = String(raw).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!text) return [];
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

  // blocchi separati da una linea con prezzo
  const items = [];
  let cur = [];
  const priceRe = /(?:€|\bEUR\b)?\s*([0-9]{1,4}(?:[.,][0-9]{1,2})?)/;

  for (const ln of lines) {
    cur.push(ln);
    if (priceRe.test(ln)) { items.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) items.push(cur.join(' '));

  return items.map(s => {
    const priceM = s.match(priceRe);
    const price = priceM ? parseFloat(priceM[1].replace(',','.')) : null;

    const lower = s.toLowerCase();
    const style = /\bros[ée]|rosato/.test(lower) ? 'rosé'
                : /\bbianco\b/.test(lower) ? 'bianco'
                : /\bfrizzante|spumante|metodo classico|prosecco|franciacorta/.test(lower) ? 'bollicine'
                : 'rosso';

    const grapeHit = Object.keys(GRAPE_PROFILES).find(g => lower.includes(g));
    const regionM = lower.match(/\b(piemonte|toscana|sicilia|veneto|puglia|abruzzo|campania|sardegna|friuli|trentino|alto adige)\b/);

    const name = s.replace(priceRe, '').replace(/\s{2,}/g,' ').trim();

    return {
      raw: s,
      name,
      style,
      grape: grapeHit || null,
      region: regionM?.[1] || null,
      typical_price_eur: price
    };
  });
}

/* ---------------- Scoring preferenze ---------------- */
function scoreWine(w, pref) {
  let sc = 0;
  if (pref.style) sc += (w.style === pref.style) ? 3 : 0;

  if (w.grape && GRAPE_PROFILES[w.grape]) {
    const gp = GRAPE_PROFILES[w.grape];
    if (pref.body) sc += (gp.body === pref.body ? 2 : 0);
    if (pref.tannin) sc += (gp.tannin === pref.tannin ? 2 : 0);
    if (pref.acidity) sc += (gp.acidity === pref.acidity ? 2 : 0);
    if (pref.style && gp.style === pref.style) sc += 1;
  }

  if (pref.region && w.region && pref.region === w.region) sc += 1;

  if (Array.isArray(pref.tags)) {
    if (pref.tags.includes('minerale') && /etna|sardegna|vermentino|greco|fiano|carricante/.test(w.raw.toLowerCase())) sc += 1;
    if (pref.tags.includes('fruttato') && /frappato|primitivo|nero d avola|barbera|dolcetto|chardonnay|sauvignon/.test(w.raw.toLowerCase())) sc += 1;
  }
  return sc;
}

/* ---------------- Web search providers ---------------- */
async function searchSerpApi(q) {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return [];
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&gl=it&hl=it&api_key=${key}`;
  const r = await fetch(url, { headers:{ 'User-Agent': UA }});
  const j = await r.json().catch(()=> ({}));
  const out = [];
  if (Array.isArray(j.shopping_results)) {
    for (const s of j.shopping_results.slice(0,8)) {
      const n = s.price ? Number(String(s.price).replace(/[^\d,.-]/g,'').replace(',','.')) : null;
      out.push({ name: s.title, url: s.link, typical_price_eur: isNaN(n)?null:n, source:'serpapi' });
    }
  }
  if (out.length < 3 && Array.isArray(j.organic_results)) {
    for (const o of j.organic_results.slice(0,5)) {
      out.push({ name: o.title, url: o.link, typical_price_eur: null, source:'serpapi' });
    }
  }
  return out;
}
async function searchBing(q) {
  const key = process.env.BING_SEARCH_API_KEY;
  if (!key) return [];
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}&mkt=it-IT`;
  const r = await fetch(url, { headers:{ 'Ocp-Apim-Subscription-Key': key, 'User-Agent': UA }});
  const j = await r.json().catch(()=> ({}));
  const out = [];
  if (j?.webPages?.value) {
    for (const v of j.webPages.value.slice(0,8)) {
      out.push({ name: v.name, url: v.url, typical_price_eur: null, source:'bing' });
    }
  }
  return out;
}
function fallbackByPreference(pref={}) {
  if (pref.style === 'rosé') {
    return [
      { name:'Cerasuolo d’Abruzzo DOC Rosato', why:'Rosé fruttato e sapido, spesso minerale', typical_price_eur:12 },
      { name:'Etna Rosato DOC (Nerello Mascalese)', why:'Rosé vulcanico, note minerali', typical_price_eur:20 },
      { name:'Chiaretto del Garda DOC', why:'Rosé fresco e profumato', typical_price_eur:10 },
      { name:'Cerasuolo di Vittoria Rosato', why:'Rosé siciliano profumato', typical_price_eur:16 },
      { name:'Salina IGP Rosato', why:'Rosé insulare, salino', typical_price_eur:22 },
    ];
  }
  if (pref.style === 'bianco') {
    return [
      { name:'Vermentino di Gallura DOCG', why:'Bianco fresco e minerale', typical_price_eur:15 },
      { name:'Pecorino d’Abruzzo DOC', why:'Acidità alta, agrumi e fiori', typical_price_eur:12 },
      { name:'Fiano di Avellino DOCG', why:'Più struttura e profumo', typical_price_eur:22 },
      { name:'Soave Classico DOC', why:'Snello, floreale', typical_price_eur:10 },
      { name:'Etna Bianco DOC (Carricante)', why:'Spiccata mineralità vulcanica', typical_price_eur:25 },
    ];
  }
  return [
    { name:'Barbera d’Asti DOCG', why:'Rosso fresco, tannino basso', typical_price_eur:13 },
    { name:'Frappato DOC', why:'Rosso leggero e profumato', typical_price_eur:15 },
    { name:'Chianti Classico DOCG', why:'Sangiovese medio corpo', typical_price_eur:18 },
    { name:'Montepulciano d’Abruzzo DOC', why:'Più corpo, tannino medio', typical_price_eur:12 },
    { name:'Aglianico del Vulture DOC', why:'Polposo, tannino importante', typical_price_eur:20 },
  ];
}

/* ---------------- Utility ---------------- */
async function fetchTextFromUrl(url) {
  try {
    const r = await fetch(url, { headers:{ 'User-Agent': UA }});
    const html = await r.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi,' ')
                     .replace(/<style[\s\S]*?<\/style>/gi,' ')
                     .replace(/<[^>]+>/g,' ')
                     .replace(/\s+/g,' ')
                     .trim();
    return text;
  } catch { return ''; }
}
function categorizeBand(price, qLow, qMed) {
  if (price == null) return null;
  if (price <= qLow) return 'low';
  if (price <= qMed) return 'med';
  return 'high';
}

/* ---------------- Handler ---------------- */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { query = '', wineList = '', qrLinks = [], tasteHints = {} } = req.body || {};

    const pref = extractTasteHints(query, tasteHints);

    // 1) lista via QR?
    let listText = String(wineList || '').trim();
    if (!listText && Array.isArray(qrLinks) && qrLinks.length) {
      const t = await fetchTextFromUrl(qrLinks[0]);
      if (t) listText = t;
    }

    // 2) Se ho lista, propongo 3 scelte con budget
    if (listText && listText.length > 20) {
      const candidates = parseWineList(listText);
      if (!candidates.length) {
        return res.status(200).json({ source:'list', recommendations: [], notes:'Nessun vino riconosciuto nella carta.' });
      }

      // score preferenze
      const scored = candidates.map(w => ({ ...w, _score: scoreWine(w, pref) }));
      scored.sort((a,b) => b._score - a._score);

      // quantili per fascia (usiamo solo quelli con prezzo)
      const withPrice = scored.filter(x => typeof x.typical_price_eur === 'number')
                              .sort((a,b)=>a.typical_price_eur-b.typical_price_eur);
      let qLow = null, qMed = null;
      if (withPrice.length >= 3) {
        qLow = withPrice[Math.floor(withPrice.length/3)].typical_price_eur;
        qMed = withPrice[Math.floor((2*withPrice.length)/3)].typical_price_eur;
      }

      // filtro budget
      const inBudget = (x)=>{
        const p = x.typical_price_eur;
        if (p == null) return false;
        if (pref.price_min != null && p < pref.price_min) return false;
        if (pref.price_max != null && p > pref.price_max) return false;
        return true;
      };

      let pool = withPrice;
      let poolBudget = withPrice.filter(inBudget);

      // se non ho prezzo su molti item, ripiego sul migliore per score
      if (pool.length === 0) pool = scored;

      // scegli triple low/med/high dal pool "budget" se possibile
      const takeTriple = (arr) => {
        if (arr.length === 0) return [];
        const a = [...arr].sort((x,y)=>(x.typical_price_eur??999)-(y.typical_price_eur??999));
        const low = a[0];
        const med = a[Math.floor(a.length/2)];
        const high = a[a.length-1];
        return [low,med,high].filter(Boolean);
      };

      let picks = takeTriple(poolBudget);
      // se meno di 3, completa con migliori generale
      if (picks.length < 3) {
        const extra = takeTriple(pool).filter(x => !picks.includes(x));
        picks = [...picks, ...extra].slice(0,3);
      }

      const triple = picks.map(x => {
        const band = (qLow!=null && qMed!=null) ? categorizeBand(x.typical_price_eur, qLow, qMed) : null;
        const outOf = (pref.price_min!=null && x.typical_price_eur!=null && x.typical_price_eur < pref.price_min)
                   || (pref.price_max!=null && x.typical_price_eur!=null && x.typical_price_eur > pref.price_max);
        return {
          name: x.name,
          winery: null,
          denomination: null,
          region: x.region,
          typical_price_eur: x.typical_price_eur ?? null,
          vintage_suggestion: [],
          why: buildWhy(x, pref),
          price_band: band,              // 'low'|'med'|'high'|null
          out_of_budget: !!outOf,
          links: []
        };
      });

      return res.status(200).json({
        source: 'list',
        profile: pref,
        budget_filter: { min: pref.price_min ?? null, max: pref.price_max ?? null },
        recommendations: triple,
        notes: 'Scelte basate sulla carta del locale (3 fasce di prezzo).'
      });
    }

    // 3) Web search -> 5 alternative
    const qWeb = buildWebQuery(query, pref);
    let web = await searchSerpApi(qWeb);
    if (web.length < 3) web = [...web, ...(await searchBing(qWeb))];

    if (web.length === 0) {
      const fb = fallbackByPreference(pref).slice(0,5).map(x => ({
        ...x,
        winery:null, denomination:null, region:null, vintage_suggestion:[], links:[], price_band: x.typical_price_eur!=null ? (x.typical_price_eur<=15?'low':x.typical_price_eur<=30?'med':'high') : null,
        out_of_budget: (pref.price_min!=null && x.typical_price_eur!=null && x.typical_price_eur < pref.price_min)
                    || (pref.price_max!=null && x.typical_price_eur!=null && x.typical_price_eur > pref.price_max)
      }));
      return res.status(200).json({
        source:'fallback',
        profile: pref,
        budget_filter: { min: pref.price_min ?? null, max: pref.price_max ?? null },
        recommendations: fb,
        notes: 'Suggerimenti offline (nessun provider web configurato o nessun risultato).'
      });
    }

    // filtro prezzo se presente
    const inBudgetWeb = (x)=>{
      const p = x.typical_price_eur;
      if (p == null) return false;
      if (pref.price_min != null && p < pref.price_min) return false;
      if (pref.price_max != null && p > pref.price_max) return false;
      return true;
    };

    const webBudget = web.filter(inBudgetWeb);
    const ordered = (webBudget.length ? webBudget : web).slice(0,5);

    const recs = ordered.map(x => ({
      name: x.name,
      winery: null,
      denomination: null,
      region: null,
      typical_price_eur: x.typical_price_eur ?? null,
      vintage_suggestion: [],
      why: 'Alternativa coerente con le preferenze richieste.',
      price_band: x.typical_price_eur!=null ? (x.typical_price_eur<=15?'low':x.typical_price_eur<=30?'med':'high') : null,
      out_of_budget: (pref.price_min!=null && x.typical_price_eur!=null && x.typical_price_eur < pref.price_min)
                  || (pref.price_max!=null && x.typical_price_eur!=null && x.typical_price_eur > pref.price_max),
      links: [{ title:x.source || 'link', url:x.url }]
    }));

    return res.status(200).json({
      source:'web',
      profile: pref,
      budget_filter: { min: pref.price_min ?? null, max: pref.price_max ?? null },
      recommendations: recs,
      notes: 'Ricerca web basata sulle preferenze.'
    });

  } catch (e) {
    console.error('sommelier error', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
}

function buildWhy(w, pref) {
  const bits = [];
  if (pref.style) bits.push(`${w.style} richiesto`);
  if (w.grape) bits.push(`vitigno ${w.grape}`);
  if (pref.tannin) bits.push(`tannino ${pref.tannin}`);
  if (pref.body) bits.push(`corpo ${pref.body}`);
  if (pref.acidity) bits.push(`acidità ${pref.acidity}`);
  if (pref.tags?.length) bits.push(pref.tags.join(', '));
  return 'Scelto per: ' + bits.filter(Boolean).join(' • ');
}
function buildWebQuery(query, pref) {
  const parts = [];
  if (pref.style) parts.push(pref.style);
  if (pref.region) parts.push(pref.region);
  if (pref.tannin === 'low') parts.push('tannino basso');
  if (pref.body === 'full') parts.push('corposo');
  if (pref.acidity === 'high') parts.push('acido/fresco');
  if (pref.tags?.length) parts.push(pref.tags.join(' '));
  if (pref.price_max != null) parts.push(`sotto ${pref.price_max} euro`);
  if (pref.price_min != null) parts.push(`sopra ${pref.price_min} euro`);
  parts.push('vino', 'alternativa', 'recensioni', 'qualità prezzo');
  const base = parts.filter(Boolean).join(' ');
  return query ? `${query} ${base}` : base;
}
