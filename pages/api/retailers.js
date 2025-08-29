// pages/api/retailers.js

async function searchWithSerp(q) {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return [];
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&gl=it&hl=it&api_key=${key}`;
  const r = await fetch(url);
  const j = await r.json();
  const out = [];
  if (Array.isArray(j.shopping_results)) {
    for (const s of j.shopping_results.slice(0, 8)) {
      const n = s.price ? Number(String(s.price).replace(/[^\d,.-]/g, '').replace(',', '.')) : null;
      out.push({
        title: s.title,
        url: s.link,
        price_eur: Number.isFinite(n) ? n : null,
        source: 'serpapi'
      });
    }
  }
  if (out.length < 3 && Array.isArray(j.organic_results)) {
    for (const o of j.organic_results.slice(0, 5)) {
      out.push({ title: o.title, url: o.link, price_eur: null, source: 'serpapi' });
    }
  }
  return out;
}

async function searchWithBing(q) {
  const key = process.env.BING_SEARCH_API_KEY;
  if (!key) return [];
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}&mkt=it-IT`;
  const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });
  const j = await r.json();
  const out = [];
  if (j?.webPages?.value) {
    for (const v of j.webPages.value.slice(0, 8)) {
      out.push({ title: v.name, url: v.url, price_eur: null, source: 'bing' });
    }
  }
  return out;
}

async function searchWithOperator(q) {
  const base = process.env.OPERATOR_BASE_URL;
  const key = process.env.OPERATOR_API_KEY;
  if (!base || !key) return [];
  const r = await fetch(`${base}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ q, market: 'it-IT', type: 'retailers' })
  });
  const j = await r.json();
  return (j.results || []).slice(0, 10).map(x => ({
    title: x.title || x.name,
    url: x.url || x.link,
    price_eur: x.price_eur ?? null,
    source: 'operator'
  }));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ✅ campi attesi dal client
    const { productName, region, budget } = req.body || {};
    if (!productName || typeof productName !== 'string') {
      return res.status(400).json({ error: 'Missing productName' });
    }

    const budgetNum = budget != null ? Number(String(budget).replace(',', '.')) : null;

    // query “umana” per i provider
    const parts = [productName];
    if (region) parts.push(region);
    parts.push(budgetNum ? `sotto ${budgetNum} euro` : 'compra online');
    const q = parts.filter(Boolean).join(' ');

    let results = [];
    let providerUsed = 'none';

    if (process.env.OPERATOR_BASE_URL && process.env.OPERATOR_API_KEY) {
      results = await searchWithOperator(q);
      providerUsed = 'operator';
    } else if (process.env.SERPAPI_API_KEY) {
      results = await searchWithSerp(q);
      providerUsed = 'serpapi';
    } else if (process.env.BING_SEARCH_API_KEY) {
      results = await searchWithBing(q);
      providerUsed = 'bing';
    }

    // dedup semplice per URL
    const seen = new Set();
    results = results.filter(r => {
      const key = (r.url || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.status(200).json({ providerUsed, count: results.length, results });
  } catch (e) {
    console.error('retailers error', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
}
