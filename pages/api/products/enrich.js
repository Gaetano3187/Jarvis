export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    // ---- ENV
    const pickEnv = (keys) => {
      for (const k of keys) {
        const v = process.env[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return '';
    };
    const GOOGLE_KEY    = pickEnv(['GOOGLE_API_KEY','GOOGLE_SEARCH_API_KEY','GOOGLE_CUSTOM_SEARCH_KEY','NEXT_PUBLIC_GOOGLE_API_KEY']);
    const GOOGLE_CX     = pickEnv(['GOOGLE_CSE_ID','GOOGLE_SEARCH_ENGINE_ID','GOOGLE_CX','NEXT_PUBLIC_GOOGLE_CSE_ID']);
    const GOOGLE_CX_IMG = pickEnv(['GOOGLE_CSE_ID_IMG','GOOGLE_SEARCH_ENGINE_ID_IMG','GOOGLE_CX_IMG','NEXT_PUBLIC_GOOGLE_CSE_ID_IMG']) || GOOGLE_CX;

    if (!GOOGLE_KEY || !GOOGLE_CX) {
      return res.status(200).json({
        ok: false,
        error: !GOOGLE_KEY ? 'GOOGLE_API_KEY mancante' : 'GOOGLE_CSE_ID mancante',
      });
    }

    const itemsIn = Array.isArray(req.body?.items) ? req.body.items : [];

    // ---- Pulizia artefatti scontrino
    const GRAMS_RE     = /\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|lt|ml|cl)\b/gi;
    const MULTI_RE     = /\b\d+\s*[x×]\s*\d+\b/gi;
    const ASTERISK_RE  = /\b[A-Z]{1,3}\*?\b/g;      // es. "VI*", "V*" (spesso sigle casse)
    const JUNK_WORDS   = /\b(off\.?|promo|omaggio)\b/gi;

    const cleanName = (s='') =>
      String(s)
        .replace(GRAMS_RE,' ')
        .replace(MULTI_RE,' ')
        .replace(ASTERISK_RE,' ')
        .replace(JUNK_WORDS,' ')
        .replace(/[()]/g,' ')
        .replace(/\s{2,}/g,' ')
        .trim();

    const CATS = [
      { re: /\b(spugna|spugne|ondattiva|sponge)\b/i,         cat: 'Pulizia casa · Spugne' },
      { re: /\b(paglietta|scouring|steel\s*wool)\b/i,        cat: 'Pulizia casa · Pagliette' },
      { re: /\b(detersiv|detergent|ammorbidente|lavatrice)\b/i, cat: 'Pulizia casa · Detergenti' },
      { re: /\b(shampoo|bagnoschiuma|sapone|doccia|dentifricio)\b/i, cat: 'Igiene personale' },
      { re: /\b(carta igienica|carta casa|rotoli|fazzoletti|tovaglioli)\b/i, cat: 'Casa · Carta' },
      { re: /\b(capsule|cialde|caff[èe])\b/i,               cat: 'Alimentari · Caffè' },
      { re: /\b(pasta|spaghetti|penne|riso|biscotti|merendine|tonno|passata)\b/i, cat: 'Alimentari' },
    ];

    const googleWeb = async (q) => {
      const p = new URLSearchParams({ key: GOOGLE_KEY, cx: GOOGLE_CX, q, lr:'lang_it', gl:'it', cr:'countryIT', num:'5', safe:'active' });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`);
      if (!r.ok) throw new Error('google web ' + r.status);
      return r.json();
    };
    const googleImages = async (q) => {
      const p = new URLSearchParams({ key: GOOGLE_KEY, cx: GOOGLE_CX_IMG, q, searchType:'image', imgType:'photo', lr:'lang_it', gl:'it', num:'10', safe:'active' });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${p}`);
      if (!r.ok) throw new Error('google img ' + r.status);
      return r.json();
    };

    // punteggio semplice per titoli/snippet rispetto alla query
    const score = (q, text) => {
      const A = new Set(cleanName(q).toLowerCase().split(/\s+/).filter(Boolean));
      const B = new Set(cleanName(text).toLowerCase().split(/\s+/).filter(Boolean));
      let inter = 0; for (const t of A) if (B.has(t)) inter++;
      return inter / Math.max(1, A.size);
    };

    const out = [];
    for (const it of itemsIn) {
      const brand = String(it?.brand || '').trim();
      const src   = String(it?.name  || '').trim();
      if (!src) continue;

      const packs = Number(it?.packs || 0);
      const upp   = Number(it?.unitsPerPack || 0);
      const uLab  = String(it?.unitLabel || '').trim();

      const qtyHint = upp > 1 ? `${upp} ${uLab||'pezzi'}` : (packs > 1 ? `${packs} confezioni` : '');
      const q = [brand, src, qtyHint].filter(Boolean).join(' ').trim();

      let normalizedName = cleanName(src);
      let category = '';
      let desc = '';
      let imageUrl = '';

      let web = null, imgs = null;
      try { web  = await googleWeb(q);  } catch {}
      try { imgs = await googleImages(q);} catch {}

      if (web?.items?.length) {
        // prendi il documento più “simile”
        const best = [...web.items]
          .map(w => ({ w, s: score(q, `${w.title||''} ${w.snippet||''}`) }))
          .sort((a,b)=>b.s-a.s)[0];

        const hay = `${src} ${brand} ${best?.w?.title||''} ${best?.w?.snippet||''}`;
        for (const c of CATS) { if (c.re.test(hay)) { category = c.cat; break; } }
        desc = (best?.w?.snippet || '').trim();
      }

      // Heuristica “vileda spugne”
      const low = `${brand} ${src} ${desc}`.toLowerCase();
      if (/\bvileda\b/.test(low) && /\b(spugna|spugne|ondattiva|sponge)\b/.test(low)) {
        normalizedName = `Spugne Vileda multicolor${upp>1?` ${upp}`:''}`.trim();
        category ||= 'Pulizia casa · Spugne';
        desc      ||= 'spugne multiuso antigraffio';
      } else {
        // non peggiorare: se la normalizzazione è troppo “povera” mantieni l’originale ripulito
        const cleaned = cleanName(src);
        if (cleaned.split(' ').length >= normalizedName.split(' ').length) {
          normalizedName = cleaned;
        }
        // prova ad aggiungere brand se non presente
        if (brand && !new RegExp(`\\b${brand}\\b`, 'i').test(normalizedName)) {
          normalizedName = `${normalizedName} ${brand}`.trim();
        }
        // append compatto di quantità note
        if (upp > 1) normalizedName += ` (x${upp})`;
      }

      if (imgs?.items?.length) {
        const list = imgs.items.slice(0, 10);
        const bestImg = list.find(x => (x.title||'').toLowerCase().includes((brand||'').toLowerCase()))
                      || list[0];
        imageUrl = (bestImg?.link || '').trim();
      }
      if (!imageUrl && web?.items?.length) {
        for (const w of web.items) {
          const og = w.pagemap?.metatags?.[0]?.['og:image'];
          const cs = w.pagemap?.cse_image?.[0]?.src;
          const any = og || cs;
          if (any && /^https?:\/\//i.test(any)) { imageUrl = any; break; }
        }
      }

      out.push({
        sourceName: src,
        brand,
        normalizedName,
        category,
        desc,
        imageUrl
      });
    }

    return res.status(200).json({ ok: true, items: out });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
}
