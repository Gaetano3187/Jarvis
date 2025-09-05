// pages/api/products/enrich.js
// Arricchimento via Google Custom Search (web+image) con normalizzazione semplice
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    // ——— ENV robusta
    const pickEnv = (cands) => {
      for (const n of cands) {
        const v = process.env[n];
        if (typeof v === 'string' && v.trim()) return { name: n, value: v.trim() };
      }
      return { name: 'none', value: '' };
    };

    const KEY_CANDIDATES   = ['GOOGLE_API_KEY','GOOGLE_SEARCH_API_KEY','GOOGLE_CUSTOM_SEARCH_KEY','NEXT_PUBLIC_GOOGLE_API_KEY'];
    const CX_WEB_CANDIDATES= ['GOOGLE_CSE_ID','GOOGLE_SEARCH_ENGINE_ID','GOOGLE_CX','NEXT_PUBLIC_GOOGLE_CSE_ID'];
    const CX_IMG_CANDIDATES= ['GOOGLE_CSE_ID_IMG','GOOGLE_SEARCH_ENGINE_ID_IMG','GOOGLE_CX_IMG','NEXT_PUBLIC_GOOGLE_CSE_ID_IMG'];

    const keyPick   = pickEnv(KEY_CANDIDATES);
    const cxWebPick = pickEnv(CX_WEB_CANDIDATES);
    const cxImgPick = (() => {
      const p = pickEnv(CX_IMG_CANDIDATES);
      return p.value ? p : cxWebPick; // fallback al web CX
    })();

    const GOOGLE_KEY    = keyPick.value;
    const GOOGLE_CX     = cxWebPick.value;
    const GOOGLE_CX_IMG = cxImgPick.value;

    if (!GOOGLE_KEY || !GOOGLE_CX) {
      return res.status(200).json({
        ok: false,
        error: !GOOGLE_KEY
          ? 'GOOGLE_API_KEY non trovata'
          : 'GOOGLE_CSE_ID non trovato',
        meta: {
          hasKey: !!GOOGLE_KEY,
          hasCxWeb: !!GOOGLE_CX,
          hasCxImg: !!GOOGLE_CX_IMG,
          keyVarUsed: keyPick.name,
          cxVarUsed: cxWebPick.name,
          cxImgVarUsed: cxImgPick.name,
        },
      });
    }

    const itemsIn = Array.isArray(req.body?.items) ? req.body.items : [];

    // ——— Util: ripulisce pesi/volumi/dimensioni dal nome (es. "GR.500", "500g", "2x125")
    const CLEAN_RE = /\b(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|lt|ml|cl)|\d+\s*[x×]\s*\d+|gr\.*\s*\d+)\b/gi;
    const cleanName = (s='') => String(s).replace(CLEAN_RE,'').replace(/\s{2,}/g,' ').trim();

    const CATS = [
      { re: /\b(spugna|spugne|ondattiva|sponge)\b/i,         cat: 'Pulizia casa · Spugne' },
      { re: /\b(paglietta|scouring|steel\s*wool)\b/i,        cat: 'Pulizia casa · Pagliette' },
      { re: /\b(detersiv|detergent|ammorbidente|lavatrice)\b/i, cat: 'Pulizia casa · Detergenti' },
      { re: /\b(shampoo|bagnoschiuma|sapone|doccia|dentifricio)\b/i, cat: 'Igiene personale' },
      { re: /\b(carta igienica|carta casa|rotoli|fazzoletti|tovaglioli)\b/i, cat: 'Casa · Carta' },
      { re: /\b(capsule|cialde|caff[èe])\b/i,               cat: 'Alimentari · Caffè' },
      { re: /\b(pasta|spaghetti|penne|riso|biscotti|merendine|tonno|passata)\b/i, cat: 'Alimentari' },
    ];

    // Google CSE
    const googleWeb = async (q) => {
      const p = new URLSearchParams({
        key: GOOGLE_KEY, cx: GOOGLE_CX, q,
        lr: 'lang_it', gl: 'it', cr: 'countryIT',
        num: '5', safe: 'active',
      });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`);
      if (!r.ok) throw new Error('google web ' + r.status);
      return r.json();
    };

    const googleImages = async (q) => {
      const p = new URLSearchParams({
        key: GOOGLE_KEY, cx: GOOGLE_CX_IMG, q,
        searchType: 'image', imgType: 'photo', safe: 'active',
        lr: 'lang_it', gl: 'it', num: '10',
      });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`);
      if (!r.ok) throw new Error('google img ' + r.status);
      return r.json();
    };

    const out = [];
    for (const it of itemsIn) {
      const brand = String(it?.brand || '').trim();
      const srcNameRaw = String(it?.name || '').trim();
      if (!srcNameRaw) continue;

      const packs = Number(it?.packs || 0);
      const upp   = Number(it?.unitsPerPack || 0);
      const uLab  = String(it?.unitLabel || '').trim();

      // Query più precisa: brand + nome + indizi di pack/unità
      const qtyHint =
        upp > 1 ? `${upp} ${uLab || 'pezzi'}` :
        packs > 1 ? `${packs} confezioni` : '';

      const q = [brand, srcNameRaw, qtyHint].filter(Boolean).join(' ').trim();

      // fallback normalizzazione
      let normalizedName = cleanName(srcNameRaw);
      let category = '';
      let desc = '';
      let imageUrl = '';

      let web = null, imgs = null;
      try { web  = await googleWeb(q);  } catch {}
      try { imgs = await googleImages(q);} catch {}

      if (web?.items?.length) {
        const first = web.items.slice(0, 3);
        const joinedTitle   = first.map(v => v.title   || '').join(' • ');
        const joinedSnippet = first.map(v => v.snippet || '').join(' • ');
        const hay = `${srcNameRaw} ${brand} ${joinedTitle} ${joinedSnippet}`;
        for (const c of CATS) { if (c.re.test(hay)) { category = c.cat; break; } }
        desc = (first[0]?.snippet || first[1]?.snippet || first[0]?.title || '').trim();
      }

      // Heuristica: se Vileda + spugne → nome sintetico “bello”
      const low = `${brand} ${srcNameRaw} ${desc}`.toLowerCase();
      if (/\bvileda\b/.test(low) && /\b(spugna|spugne|ondattiva|sponge)\b/.test(low)) {
        const count = upp || packs || '';
        normalizedName = `Spugne Vileda multicolor${count ? ` ${count}` : ''}`.trim();
        if (!category) category = 'Pulizia casa · Spugne';
        if (!desc) desc = 'spugne multiuso antigraffio';
      } else {
        // altrimenti: “Categoria · Brand” o nome ripulito + brand
        const tail = (category.split('·')[1] || '').trim();
        if (tail && brand) normalizedName = `${tail} ${brand}`.trim();
        // se name è povero di info, mantieni il ripulito + brand
        if (normalizedName.length < 4) normalizedName = `${cleanName(srcNameRaw)} ${brand}`.trim();
      }

      if (imgs?.items?.length) {
        const cand = imgs.items.slice(0, 10);
        const best = cand.find(x => (x.title||'').toLowerCase().includes(brand.toLowerCase())) || cand[0];
        imageUrl = (best?.link || '').trim();
      }

      // Fallback og:image / cse_image
      if (!imageUrl && web?.items?.length) {
        for (const w of web.items) {
          const og = w.pagemap?.metatags?.[0]?.['og:image'];
          const cs = w.pagemap?.cse_image?.[0]?.src;
          const any = og || cs;
          if (any && /^https?:\/\//i.test(any)) { imageUrl = any; break; }
        }
      }

      // Secondo tentativo con query arricchita
      if (!imageUrl) {
        try {
          const imgs2 = await googleImages(`${q} foto`);
          const cand2 = imgs2?.items?.slice(0, 10) || [];
          const best2 = cand2.find(x => (x.title||'').toLowerCase().includes(brand.toLowerCase())) || cand2[0];
          imageUrl = (best2?.link || '').trim();
        } catch {}
      }

      out.push({
        sourceName: srcNameRaw,
        brand,
        normalizedName,
        category,
        desc,
        imageUrl
      });
    }

    return res.status(200).json({
      ok: true,
      items: out,
      meta: {
        hasKey: !!GOOGLE_KEY,
        hasCxWeb: !!GOOGLE_CX,
        hasCxImg: !!GOOGLE_CX_IMG,
        keyVarUsed: keyPick.name,
        cxVarUsed: cxWebPick.name,
        cxImgVarUsed: cxImgPick.name,
        count: out.length,
      },
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
}
