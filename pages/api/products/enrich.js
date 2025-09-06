// pages/api/products/enrich.js
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    // ---- ENV (robusta)
    const key   = process.env.GOOGLE_API_KEY || process.env.GOOGLE_SEARCH_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';
    const cxWeb = process.env.GOOGLE_CSE_ID   || process.env.GOOGLE_SEARCH_ENGINE_ID   || process.env.NEXT_PUBLIC_GOOGLE_CSE_ID   || '';
    const cxImg = process.env.GOOGLE_CSE_ID_IMG || process.env.GOOGLE_SEARCH_ENGINE_ID_IMG || process.env.NEXT_PUBLIC_GOOGLE_CSE_ID_IMG || cxWeb;

    if (!key || !cxWeb) {
      return res.status(200).json({
        ok: false,
        error: !key ? 'GOOGLE_API_KEY mancante' : 'GOOGLE_CSE_ID mancante',
        meta: { hasKey: !!key, hasCxWeb: !!cxWeb, hasCxImg: !!cxImg }
      });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return res.status(200).json({ ok: true, items: [], meta: { count: 0 } });

    // ---- utils
    const UNIT = /\b(?:\d+(?:[.,]\d+)?)\s*(?:kg|g|gr|l|lt|ml|cl)\b/ig;
    const MULT = /\b\d+\s*[x×]\s*\d+\b/ig;
    const PACK = /\b(?:confezion(?:e|i)|pack|multipack|scatola|pz\.?|pezzi?|ricarich(?:e|a))\s*\d*\b/ig;
    const NOISE= /\b(?:offerte?|prezzi?|acquista|shop|amazon|ebay|coop|esselunga|esselungaonline|iper)\b/ig;

    const normKey = (s='') => String(s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9\s]/g,' ')
      .replace(/\s{2,}/g,' ')
      .trim();

    const properBrandCase = (s='') => {
      const keepLower = new Set(['de','di','della','dello','dei','degli','del','d','la','il','lo','le','gli','da','dal','dalla','dalle']);
      return String(s).toLowerCase().split(/\s+/).map((w,i)=> (keepLower.has(w) && i>0) ? w : w.replace(/^\w/,c=>c.toUpperCase())).join(' ');
    };

    const cleanName = (s='') => String(s)
      .replace(UNIT,' ')
      .replace(MULT,' ')
      .replace(PACK,' ')
      .replace(/\s{2,}/g,' ')
      .trim();

    const canon = [
      ['de cecco','De Cecco'], ['barilla','Barilla'], ['garofalo','Garofalo'],
      ['kimbo','Kimbo'], ['lavazza','Lavazza'], ['rio mare','Rio Mare'],
      ['mulino bianco','Mulino Bianco'], ['galbani','Galbani'], ['parmalat','Parmalat'],
      ['zymil','Zymil'], ['ace','Ace'], ['dash','Dash'], ['lenor','Lenor'],
      ['vileda','Vileda'], ['nivea','Nivea'], ['pantene','Pantene'], ['finish','Finish'],
      ['chanteclair','Chanteclair'], ['scottex','Scottex'], ['splendid','Splendid'],
      ['dixan','Dixan'], ['cif','Cif'], ['ajax','Ajax'], ['spontex','Spontex'], ['mentadent','Mentadent'],
    ];
    const canonBrand = (txt='') => {
      const t = txt.toLowerCase();
      for (const [pat,out] of canon) if (t.includes(pat)) return out;
      return '';
    };

    const PRODUCT_KW = [
      ['Alimentari · Pasta', ['spaghetti','spaghettoni','rigatoni','penne rigate','penne','bucatini','fusilli','linguine','farfalle','mezze maniche','orecchiette','tagliatelle']],
      ['Pulizia casa · Spugne', ['spugna','spugne','ondattiva','sponge']],
      ['Pulizia casa · Detergenti', ['detersivo','detergente','ammorbidente','candeggina','sgrassatore']],
      ['Igiene personale', ['shampoo','bagnoschiuma','lacca','dentifricio','collutorio','deodorante']],
      ['Alimentari · Caffè', ['caffè','espresso','cialde','capsule','grani','macinato']],
    ];

    const googleWeb = async (q) => {
      const p = new URLSearchParams({ key, cx:cxWeb, q, lr:'lang_it', gl:'it', num:'8', safe:'active' });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('web '+r.status);
      return r.json();
    };
    const googleImg = async (q) => {
      const p = new URLSearchParams({ key, cx:cxImg, q, searchType:'image', imgType:'photo', lr:'lang_it', gl:'it', num:'10', safe:'active' });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('img '+r.status);
      return r.json();
    };

    const pickCat = (hay='') => {
      const t = hay.toLowerCase();
      for (const [cat,kws] of PRODUCT_KW) for (const k of kws) if (t.includes(k)) return cat;
      return '';
    };

    const guessName = (titles=[], brand='') => {
      const text = titles.join(' • ').replace(UNIT,' ').replace(MULT,' ').replace(NOISE,' ').toLowerCase();
      const tokens = text.split(/[^a-zà-ú0-9]+/i).filter(Boolean);
      const ban = new Set((brand||'').toLowerCase().split(/\s+/));
      const freq = new Map();
      for (const w of tokens) {
        if (w.length<3) continue;
        if (ban.has(w)) continue;
        if (/^\d+$/.test(w)) continue;
        freq.set(w, (freq.get(w)||0) + 1);
      }
      const strong = new Set(PRODUCT_KW.flatMap(([_, arr]) => arr.map(s=>s.toLowerCase())));
      const top = [...freq.entries()]
        .sort((a,b)=>(strong.has(b[0])-strong.has(a[0]))||(b[1]-a[1]))
        .slice(0,4).map(([w])=>w);
      if (!top.length) return '';
      const joined = tokens.join(' ');
      const combos = ['penne rigate','mezze maniche','spugne ondattiva','caffè espresso'];
      for (const c of combos) if (joined.includes(c)) return c;
      return top.slice(0,2).join(' ');
    };

    const out = [];
    for (const it of items) {
      const srcName  = cleanName(String(it?.name || ''));
      const srcBrand = String(it?.brand || '');
      const q = (srcBrand ? `${srcBrand} ${srcName}` : srcName).trim();

      let web = null, img = null;
      try { web = await googleWeb(q); } catch {}
      try { img = await googleImg(q); } catch {}

      const titles   = (web?.items || []).map(x=>x.title||'').filter(Boolean);
      const snippets = (web?.items || []).map(x=>x.snippet||'').filter(Boolean);
      const joined   = `${titles.join(' • ')} • ${snippets.join(' • ')}`;

      let brand = canonBrand(`${srcBrand} ${joined}`) || properBrandCase(srcBrand);
      const brandNorm = (brand || srcBrand || '').toLowerCase(); // <-- FIX: definito
      let cat   = pickCat(`${srcName} ${joined}`);
      let name  = cleanName(guessName(titles, brand) || srcName).replace(/\bgr?\.?\b/ig,'').trim();
      if (!name) name = cleanName(srcName);

      // IMMAGINE (img → best, poi web og:image/cse_image/thumbnail, poi fallback query)
      let imageUrl = '';
      if (img?.items?.length) {
        const best = img.items.find(x =>
          brandNorm && (x.title || '').toLowerCase().includes(brandNorm)
        ) || img.items[0];
        imageUrl = (best?.link || '').trim();
      }
      if (!imageUrl && web?.items?.length) {
        for (const w of web.items) {
          const og = w?.pagemap?.metatags?.[0]?.['og:image'];
          const cs = w?.pagemap?.cse_image?.[0]?.src;
          const tn = w?.pagemap?.cse_thumbnail?.[0]?.src;
          const any = og || cs || tn;
          if (any && /^https?:\/\//i.test(any)) { imageUrl = any; break; }
        }
      }
      if (!imageUrl) {
        try {
          const imgs2 = await googleImg(`${q} immagine prodotto`);
          const cand2 = imgs2?.items?.slice(0, 10) || [];
          const best2 = cand2.find(x =>
            brandNorm && (x.title || '').toLowerCase().includes(brandNorm)
          ) || cand2[0];
          imageUrl = (best2?.link || '').trim();
        } catch {}
      }

      // chiave di match (il client usa name+brand normalizzati lato suo)
      const matchKey = `${normKey(srcName)}|${normKey(srcBrand)}`;

      out.push({
        sourceName: srcName,
        sourceBrand: srcBrand,
        brand,                       // brand canonico
        normalizedName: name,        // nome ripulito
        category: cat,
        shortDescription: snippets[0] || cat || '',
        imageUrl,
        matchKey
      });
    }

    return res.status(200).json({
      ok: true,
      items: out,
      meta: { count: out.length, hasKey: !!key, hasCxWeb: !!cxWeb, hasCxImg: !!cxImg }
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
}
