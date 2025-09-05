// pages/api/products/enrich.js
// Normalizza brand + nome dal web (Google CSE) e fornisce imageUrl affidabile

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });

    // -------- ENV robusta
    const key = process.env.GOOGLE_API_KEY || process.env.GOOGLE_SEARCH_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';
    const cxWeb = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID || process.env.NEXT_PUBLIC_GOOGLE_CSE_ID || '';
    const cxImg = process.env.GOOGLE_CSE_ID_IMG || process.env.GOOGLE_SEARCH_ENGINE_ID_IMG || process.env.NEXT_PUBLIC_GOOGLE_CSE_ID_IMG || cxWeb;

    if (!key || !cxWeb) {
      return res.status(200).json({
        ok:false,
        error: !key ? 'GOOGLE_API_KEY mancante' : 'GOOGLE_CSE_ID mancante',
        meta:{ hasKey:!!key, hasCxWeb:!!cxWeb, hasCxImg:!!cxImg }
      });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(200).json({ ok:true, items:[], meta:{count:0} });

    // --------- Helpers
    const UNIT = /\b(?:\d+(?:[.,]\d+)?)\s*(?:kg|g|gr|l|lt|ml|cl)\b/ig;
    const MULT = /\b\d+\s*[x×]\s*\d+\b/ig;
    const PACK = /\b(?:confezion(?:e|i)|pack|multipack|scatola|pz\.?|pezzi?|ricarich(?:e|a))\s*\d*\b/ig;
    const NOISE = /\b(?:offerte?|prezzi?|acquista|shop|amazon|ebay|coop|esselunga|esselungaonline|iper|sci)?\b/ig;

    const properBrandCase = (s='') => {
      const keepLower = new Set(['de','di','della','dello','dei','degli','del','d','la','il','lo','le','gli','da','dal','dalla','dalle']);
      return String(s).toLowerCase().split(/\s+/).map((w,i)=> (keepLower.has(w) && i>0) ? w : w.replace(/^\w/,c=>c.toUpperCase())).join(' ');
    };

    const cleanName = (s='') => String(s)
      .replace(UNIT,'')
      .replace(MULT,'')
      .replace(PACK,'')
      .replace(/\s{2,}/g,' ')
      .trim();

    // brand canonici (pattern -> forma canonica)
    const BRAND_CANON = [
      ['de cecco','De Cecco'], ['barilla','Barilla'], ['garofalo','Garofalo'],
      ['kimbo','Kimbo'], ['lavazza','Lavazza'], ['rio mare','Rio Mare'],
      ['mulino bianco','Mulino Bianco'], ['galbani','Galbani'], ['parmalat','Parmalat'],
      ['zymil','Zymil'], ['ace','Ace'], ['dash','Dash'], ['lenor','Lenor'],
      ['vileda','Vileda'], ['nivea','Nivea'], ['pantene','Pantene'], ['finish','Finish'],
      ['chanteclair','Chanteclair'], ['scottex','Scottex'], ['splendid','Splendid'],
      ['dixan','Dixan'], ['cif','Cif'], ['ajax','Ajax'], ['spontex','Spontex'], ['mentadent','Mentadent'],
      // aggiungi liberamente
    ];
    const canonBrandFromText = (txt='') => {
      const t = txt.toLowerCase();
      for (const [pat, out] of BRAND_CANON) if (t.includes(pat)) return out;
      return '';
    };

    // dizionario categorie + parole chiave per “leggere” i titoli
    const PRODUCT_KW = [
      // Pasta
      ['Alimentari · Pasta', ['spaghetti','spaghettoni','rigatoni','penne rigate','penne','bucatini','fusilli','linguine','farfalle','mezze maniche','orecchiette','tagliatelle']],
      // Igiene casa
      ['Pulizia casa · Spugne', ['spugna','spugne','ondattiva','sponge']],
      ['Pulizia casa · Detergenti', ['detersivo','detergente','ammorbidente','candeggina','sgrassatore']],
      // Persona
      ['Igiene personale', ['shampoo','bagnoschiuma','lacca','dentifricio','collutorio','deodorante']],
      // Caffè
      ['Alimentari · Caffè', ['caffè','espresso','cialde','capsule','grani','macinato']],
    ];

    const googleWeb = async (q) => {
      const p = new URLSearchParams({ key, cx:cxWeb, q, lr:'lang_it', gl:'it', num:'8', safe:'active' });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`);
      if (!r.ok) throw new Error('web ' + r.status);
      return r.json();
    };
    const googleImg = async (q) => {
      const p = new URLSearchParams({ key, cx:cxImg, q, searchType:'image', imgType:'photo', lr:'lang_it', gl:'it', num:'10', safe:'active' });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`);
      if (!r.ok) throw new Error('img ' + r.status);
      return r.json();
    };

    const pickCategory = (hay='') => {
      const t = hay.toLowerCase();
      for (const [cat, kws] of PRODUCT_KW) {
        for (const k of kws) if (t.includes(k)) return cat;
      }
      return '';
    };

    // estrai “prodotto” dai titoli unendo le parole più frequenti “importanti”
    const guessProductFromTitles = (titles=[], brand='') => {
      const text = titles.join(' • ')
        .replace(UNIT,' ').replace(MULT,' ')
        .replace(NOISE,' ').toLowerCase();

      const tokens = text.split(/[^a-zà-ú0-9]+/i).filter(Boolean);
      const ban = new Set((brand || '').toLowerCase().split(/\s+/));
      const freq = new Map();
      for (const w of tokens) {
        if (w.length < 3) continue;
        if (ban.has(w)) continue;
        if (/^\d+$/.test(w)) continue;
        const c = (freq.get(w) || 0) + 1; freq.set(w, c);
      }
      // preferisci parole “forti” (spaghetti, rigatoni, spugne, shampoo, ecc.)
      const strong = new Set(PRODUCT_KW.flatMap(([_, arr]) => arr.map(s=>s.toLowerCase())));
      const top = [...freq.entries()]
        .sort((a,b) => (strong.has(b[0]) - strong.has(a[0])) || (b[1]-a[1]))
        .slice(0,4)
        .map(([w]) => w);

      if (!top.length) return '';
      // ricostruisci bigrammi se esistono (es: "penne" + "rigate")
      const joined = tokens.join(' ');
      const combos = ['penne rigate','mezze maniche','spugne ondattiva','caffè espresso'];
      for (const c of combos) if (joined.includes(c)) return c;
      return top.slice(0,2).join(' ');
    };

    const out = [];
    for (const raw of items) {
      const inName  = cleanName(String(raw?.name || ''));
      const inBrand = String(raw?.brand || '');

      const q = (inBrand ? `${inBrand} ${inName}` : inName).trim();
      let web = null, img = null;
      try { web = await googleWeb(q); } catch {}
      try { img = await googleImg(q); } catch {}

      const titles = (web?.items || []).map(x => x.title || '').filter(Boolean);
      const snippets = (web?.items || []).map(x => x.snippet || '').filter(Boolean);
      const joined = `${titles.join(' • ')} • ${snippets.join(' • ')}`;

      // BRAND
      let brandNorm =
        canonBrandFromText(`${inBrand} ${joined}`) ||
        properBrandCase(inBrand);

      // CATEGORIA
      const category = pickCategory(`${inName} ${joined}`);

      // PRODOTTO (nome pulito e “normalizzato” dai titoli)
      let prodFromWeb = guessProductFromTitles(titles, brandNorm);
      let normalizedName = cleanName(prodFromWeb || inName);
      normalizedName = normalizedName.replace(/\bgr?\.?\b/ig,'').trim();
      if (!normalizedName) normalizedName = cleanName(inName);

      // IMMAGINE (img→og:image→cse_image)
      let imageUrl = '';
      if (img?.items?.length) {
        const best = img.items.find(x => brandNorm && (x.title||'').toLowerCase().includes(brandNorm.toLowerCase())) || img.items[0];
        imageUrl = (best?.link || '').trim();
      }
      if (!imageUrl && web?.items?.length) {
        for (const w of web.items) {
          const og = w?.pagemap?.metatags?.[0]?.['og:image'];
          const cs = w?.pagemap?.cse_image?.[0]?.src;
          const any = og || cs;
          if (any && /^https?:\/\//i.test(any)) { imageUrl = any; break; }
        }
      }

      out.push({
        sourceName: inName,
        brand: brandNorm,               // brand canonico
        normalizedName,                 // nome ripulito (no pesi/pack)
        category,
        desc: snippets[0] || '',
        imageUrl
      });
    }

    res.status(200).json({
      ok:true,
      items: out,
      meta:{ count: out.length, hasKey:!!key, hasCxWeb:!!cxWeb, hasCxImg:!!cxImg }
    });
  } catch (e) {
    res.status(200).json({ ok:false, error: e?.message || String(e) });
  }
}
