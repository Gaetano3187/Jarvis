// pages/api/products/enrich.js
// Google CSE (web + image), fallback og:image/cse_image, meta di debug + risoluzione ENV robusta

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      // 405 più corretto per metodo non consentito
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    // ====== ENV RESOLUTION (robusta: accetta più nomi/alias) ======
    const KEY_CANDIDATES = [
      'GOOGLE_API_KEY',                 // consigliato
      'GOOGLE_SEARCH_API_KEY',          // alias comune
      'GOOGLE_CUSTOM_SEARCH_KEY',       // alias
      'NEXT_PUBLIC_GOOGLE_API_KEY',     // (sconsigliato) public
    ];
    const CX_WEB_CANDIDATES = [
      'GOOGLE_CSE_ID',                  // consigliato
      'GOOGLE_SEARCH_ENGINE_ID',        // alias
      'GOOGLE_CX',                      // alias
      'NEXT_PUBLIC_GOOGLE_CSE_ID',      // (sconsigliato) public
    ];
    const CX_IMG_CANDIDATES = [
      'GOOGLE_CSE_ID_IMG',              // consigliato (separato immagini)
      'GOOGLE_SEARCH_ENGINE_ID_IMG',    // alias
      'GOOGLE_CX_IMG',                  // alias
      'NEXT_PUBLIC_GOOGLE_CSE_ID_IMG',  // (sconsigliato) public
    ];

    const pickEnv = (cands) => {
      for (const n of cands) {
        const v = process.env[n];
        if (typeof v === 'string' && v.trim()) return { name: n, value: v.trim() };
      }
      return { name: 'none', value: '' };
    };

    const keyPick   = pickEnv(KEY_CANDIDATES);
    const cxWebPick = pickEnv(CX_WEB_CANDIDATES);
    // se non c'è un CX immagini dedicato, fallback al CX web
    const cxImgPick = (() => {
      const p = pickEnv(CX_IMG_CANDIDATES);
      return p.value ? p : cxWebPick;
    })();

    const GOOGLE_KEY    = keyPick.value;
    const GOOGLE_CX     = cxWebPick.value;          // web
    const GOOGLE_CX_IMG = cxImgPick.value;          // image (o fallback web)

    // ====== GUARD esplicito se mancano KEY o CX ======
    if (!GOOGLE_KEY || !GOOGLE_CX) {
      return res.status(200).json({
        ok: false,
        error: !GOOGLE_KEY
          ? 'GOOGLE_API_KEY (o alias) non trovata a runtime. Imposta la variabile su Vercel e redeploy.'
          : 'GOOGLE_CSE_ID (o alias) non trovata.',
        meta: {
          hasKey: !!GOOGLE_KEY,
          hasCxWeb: !!GOOGLE_CX,
          hasCxImg: !!GOOGLE_CX_IMG,
          keyVarUsed: keyPick.name,
          cxVarUsed: cxWebPick.name,
          cxImgVarUsed: cxImgPick.name,
          count: 0,
        },
      });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    // Categorie euristiche minime
    const CATS = [
      { re: /\b(spugna|spugne|sponge|ondattiva)\b/i,                cat: 'Pulizia casa · Spugne' },
      { re: /\b(paglietta|scouring|steel wool)\b/i,                 cat: 'Pulizia casa · Pagliette' },
      { re: /\b(detersivo|detergente|ammorbidente|lavatrice)\b/i,   cat: 'Pulizia casa · Detergenti' },
      { re: /\b(shampoo|bagnoschiuma|sapone|doccia|dentifricio)\b/i,cat: 'Igiene personale' },
      { re: /\b(carta igienica|carta casa|rotoli|fazzoletti|tovaglioli)\b/i, cat: 'Casa · Carta' },
      { re: /\b(capsule|cialde|caff[eè])\b/i,                       cat: 'Alimentari · Caffè' },
      { re: /\b(pasta|spaghetti|penne|riso|biscotti|merendine|tonno|passata)\b/i, cat: 'Alimentari' },
    ];

    // Web Search
    const googleWeb = async (q) => {
      const p = new URLSearchParams({
        key: GOOGLE_KEY, cx: GOOGLE_CX, q,
        lr: 'lang_it', gl: 'it', cr: 'countryIT', num: '5', safe: 'active',
      });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`);
      if (!r.ok) throw new Error('google web ' + r.status);
      return r.json();
    };

    // Image Search
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
    for (const it of items) {
      const name  = String(it?.name || '').trim();
      const brand = String(it?.brand || '').trim();
      if (!name) continue;

      let normalizedName = name;
      let category = '';
      let desc = '';
      let imageUrl = '';

      const q = brand ? `${brand} ${name}` : name;

      let web = null, imgs = null;
      try { web  = await googleWeb(q);  } catch {}
      try { imgs = await googleImages(q);} catch {}

      if (web?.items?.length) {
        const first = web.items.slice(0, 3);
        const joinedTitle   = first.map(v => v.title   || '').join(' • ');
        const joinedSnippet = first.map(v => v.snippet || '').join(' • ');
        const hay = `${name} ${brand} ${joinedTitle} ${joinedSnippet}`;
        for (const c of CATS) { if (c.re.test(hay)) { category = c.cat; break; } }
        desc = (first[0]?.snippet || first[1]?.snippet || first[0]?.title || '').trim();
      }

      const all = `${brand} ${name} ${desc}`.toLowerCase();
      if (/(\bondattiva\b|\bspugna\b|\bspugne\b|\bsponge\b)/.test(all) && /\bvileda\b/.test(all)) {
        normalizedName = 'Spugne Vileda Ondattiva Colors';
        if (!category) category = 'Pulizia casa · Spugne';
        if (!desc) desc = 'spugne multiuso antigraffio adatte anche a superfici delicate';
      } else if (category && brand) {
        const tail = category.split('·')[1]?.trim() || category;
        normalizedName = `${tail} ${brand}`.trim();
      }

      if (imgs?.items?.length) {
        const cand = imgs.items.slice(0, 10);
        const best = cand.find(x => (x.title||'').toLowerCase().includes((brand||'').toLowerCase())) || cand[0];
        imageUrl = (best?.link || '').trim();
      }

      // Fallback immagine da pagemap (og:image / cse_image)
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
          const best2 = cand2.find(x => (x.title||'').toLowerCase().includes((brand||'').toLowerCase())) || cand2[0];
          imageUrl = (best2?.link || '').trim();
        } catch {}
      }

      out.push({ sourceName: name, brand, normalizedName, category, desc, imageUrl });
    }

    // meta di debug: verifica variabili realmente lette
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
