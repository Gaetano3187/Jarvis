// pages/api/products/enrich.js

// ✅ se sviluppi da domini diversi serve CORS
function setCORS(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ✅ lascia attivo il body parser di Next (JSON in req.body)
export const config = { api: { bodyParser: true } };

export default async function enrichHandler(req, res) {
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, info: 'enrich alive' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    // ✅ usa req.body; fallback a {} se vuoto
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const { name = '', brand = '', needsUPP = true } = body;
    const qBase = `${brand ? brand + ' ' : ''}${name}`.trim();

    if (!qBase) {
      return res.status(400).json({ ok: false, error: 'Missing name', debug: { got: body } });
    }

    const queries = [
      `${qBase} confezione`, `${qBase} quante pezzi`, `${qBase} x`,
      `${qBase} pz`, `${qBase} bottiglie`, `${qBase} capsule`, `${qBase} uova`,
    ];

    const results = [];
    for (const q of queries) {
      const serp = await ddgSearch(q).catch(() => null);
      if (!serp?.links?.length) continue;

      for (const href of serp.links.slice(0, 5)) {
        const page = await fetchPageText(href).catch(() => null);
        if (!page) continue;
        const ex = extractPacksInfo(page);
        if (ex) results.push({ ...ex, source: href });
      }
      if (results.length >= 3) break;
    }

    const best = chooseBest(results);
    return res.status(200).json({ ok: true, best, candidates: results });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}

// -------- helpers scraping (unchanged) --------
async function ddgSearch(q) {
  const url = 'https://duckduckgo.com/html/?q=' + encodeURIComponent(q);
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const links = [...html.matchAll(/<a rel="nofollow" class="result__a" href="(.*?)"/g)]
    .map(m => m[1]).filter(Boolean);
  return { links };
}
async function fetchPageText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  return html.replace(/<script[\s\S]*?<\/script>/g, ' ')
             .replace(/<style[\s\S]*?<\/style>/g, ' ')
             .replace(/<[^>]+>/g, ' ')
             .replace(/\s{2,}/g, ' ')
             .slice(0, 120000);
}
function extractPacksInfo(text) {
  const s = text.toLowerCase();
  const mCombo = s.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (mCombo) return { packs: +mCombo[1], unitsPerPack: +mCombo[2], unitLabel: 'pezzi', confidence: 0.9, rule: 'combo' };
  const mConf = s.match(/conf(?:ezione)?\s*(?:da)?\s*(\d{1,3})\s*(pz|pezzi|capsule|bottiglie|uova|rotoli)?/);
  if (mConf) {
    const upp = +mConf[1];
    const label = mConf[2] ? (mConf[2] === 'pz' ? 'pezzi' : mConf[2])
      : (s.includes('capsule') ? 'capsule' : s.includes('bottigl') ? 'bottiglie' : s.includes('uova') ? 'uova' : 'pezzi');
    return { packs: 1, unitsPerPack: upp, unitLabel: label, confidence: 0.8, rule: 'conf-da' };
  }
  const mUnits = s.match(/\b(\d{1,3})\s*(pz|pezzi|capsule|bottiglie|uova|rotoli)\b/);
  if (mUnits && !s.includes('lavaggi')) {
    return { packs: 1, unitsPerPack: +mUnits[1], unitLabel: (mUnits[2] === 'pz' ? 'pezzi' : mUnits[2]), confidence: 0.72, rule: 'units' };
  }
  const mLav = s.match(/\b(\d{1,3})\s*lavaggi?\b/);
  if (mLav) return { packs: 1, unitsPerPack: 1, unitLabel: 'unità', confidence: 0.4, rule: 'lavaggi', extra: { lavaggi: +mLav[1] } };
  return null;
}
function chooseBest(list = []) {
  if (!list.length) return null;
  const order = { 'combo': 3, 'conf-da': 2, 'units': 1, 'lavaggi': 0 };
  list.sort((a, b) => (b.confidence - a.confidence) || ((order[b.rule] || 0) - (order[a.rule] || 0)));
  const t = list[0];
  return { unitsPerPack: Math.max(1, +t.unitsPerPack || 1), unitLabel: t.unitLabel || 'unità', confidence: t.confidence || 0.6, source: t.source || '' };
}
