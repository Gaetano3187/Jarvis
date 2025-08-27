// pages/api/ingest/ocr.js

function pick(text, re, group = 1) {
  const m = re.exec(text);
  return m ? (m[group] || '').trim() : null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { ocrText } = req.body || {};
    if (!ocrText) return res.status(400).json({ error: 'Missing ocrText' });

    const txt = String(ocrText).replace(/\s+/g, ' ').trim();

    const looksLikeWine = /(barolo|barbaresco|chianti|nero d.?avola|vermentino|pecorino|frappato|merlot|cabernet|sangiovese|nebbiolo|syrah|pinot)/i.test(txt);
    const looksLikeCheeseMeat = /(dop|igp|pecorino|parmigiano|grana|gorgonzola|prosciutto|salame|finocchiona|coppa|culatello)/i.test(txt);

    const price = pick(txt, /(?:€|eur|euro)\s*([0-9]+[.,]?[0-9]{0,2})/i);
    const year = pick(txt, /\b(19|20)\d{2}\b/);
    const place = pick(txt, /\(([^)]+)\)/) || pick(txt, /@\s*([A-Za-zÀ-ÖØ-öø-ÿ' \-]+)/);

    const words = txt.replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ' \-]/g, ' ')
                     .split(' ').filter(w => w.length > 2).slice(0, 6).join(' ');

    if (looksLikeWine) {
      return res.status(200).json({
        kind: 'wine',
        data: {
          name: words,
          vintage: year ? Number(year) : null,
          price_eur: price ? Number(price.replace(',', '.')) : null,
          bought_place_name: place || null
        }
      });
    }

    if (looksLikeCheeseMeat) {
      return res.status(200).json({
        kind: 'artisan',
        data: {
          name: words,
          category: /prosciutto|salame|coppa|culatello|mortadella|bresaola/i.test(txt) ? 'salume' : 'formaggio',
          price_eur: price ? Number(price.replace(',', '.')) : null,
          bought_place_name: place || null
        }
      });
    }

    return res.status(200).json({ kind: 'unknown', raw: txt });
  } catch (e) {
    console.error('ingest/ocr error', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
}
