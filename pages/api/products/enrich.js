// pages/api/products/enrich.js
// Usa Bing Web + Image Search per arricchire nome/categoria/descrizione e ottenere un'immagine prodotto.
// Richiede: BING_API_KEY nello .env (.env.local in dev)

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const BING = process.env.BING_API_KEY && process.env.BING_API_KEY.trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const out = [];

    // Fallback categorie semplici
    const CATS = [
      { re: /\b(spugna|spugne|sponge|ondattiva)\b/i, cat: 'Pulizia casa · Spugne' },
      { re: /\b(paglietta|scouring|steel wool)\b/i,  cat: 'Pulizia casa · Pagliette' },
      { re: /\b(detersivo|detergente|ammorbidente|lavatrice)\b/i, cat: 'Pulizia casa · Detergenti' },
      { re: /\b(shampoo|bagnoschiuma|sapone|doccia|dentifricio)\b/i, cat: 'Igiene personale' },
      { re: /\b(carta igienica|carta casa|rotoli|fazzoletti|tovaglioli)\b/i, cat: 'Casa · Carta' },
      { re: /\b(capsule|cialde|caff[eè])\b/i, cat: 'Alimentari · Caffè' },
      { re: /\b(pasta|spaghetti|penne|riso|biscotti|merendine|tonno|passata)\b/i, cat: 'Alimentari' },
    ];

    const bingSearch = async (q) => {
      const u = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}&mkt=it-IT&setLang=it`;
      const r = await fetch(u, { headers: { 'Ocp-Apim-Subscription-Key': BING }});
      if (!r.ok) throw new Error('bing web ' + r.status);
      return r.json();
    };

    const bingImages = async (q) => {
      const u = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(q)}&mkt=it-IT&safeSearch=Moderate&imageType=Photo`;
      const r = await fetch(u, { headers: { 'Ocp-Apim-Subscription-Key': BING }});
      if (!r.ok) throw new Error('bing img ' + r.status);
      return r.json();
    };

    for (const it of items) {
      const name = String(it?.name || '').trim();
      const brand = String(it?.brand || '').trim();
      if (!name) continue;

      let norm = name;
      let category = '';
      let desc = '';
      let imageUrl = '';

      // Costruisci query
      const q = brand ? `${brand} ${name}` : name;

      // Prova web + immagini
      let page = null, pics = null;
      if (BING) {
        try { page = await bingSearch(q); } catch {}
        try { pics = await bingImages(q); } catch {}
      }

      // Usa risultati testo per desc/categoria
      if (page?.webPages?.value?.length) {
        // prendi prime 2-3 fonti
        const first = page.webPages.value.slice(0, 3);
        const joinedTitle = first.map(v => v.name || '').join(' • ');
        const joinedSnippet = first.map(v => v.snippet || '').join(' • ');
        const hay = `${name} ${brand} ${joinedTitle} ${joinedSnippet}`;

        // categoria
        for (const c of CATS) { if (c.re.test(hay)) { category = c.cat; break; } }

        // descrizione breve
        desc = (first[0]?.snippet || first[1]?.snippet || first[0]?.name || '').trim();
      }

      // Nome "umano": se capiamo che sono spugne Vileda Ondattiva etc.
      const all = `${brand} ${name} ${(desc||'')}`.toLowerCase();
      if (/\b(ondattiva|spugna|spugne|sponge)\b/.test(all) && /\bvileda\b/.test(all)) {
        norm = 'Spugne Vileda Ondattiva Colors';
        if (!category) category = 'Pulizia casa · Spugne';
        if (!desc) desc = 'spugne multiuso antigraffio adatte anche a superfici delicate';
      } else if (category && brand) {
        const tail = category.split('·')[1]?.trim() || category;
        norm = `${tail} ${brand}`.trim(); // es. "Spugne Vileda"
      }

      // Immagine: scegli una “photo” coerente
      if (pics?.value?.length) {
        // preferisci immagini col brand nel titolo
        const cand = [...pics.value]
          .sort((a, b) => ((b.encodingFormat === 'jpeg') - (a.encodingFormat === 'jpeg')))
          .slice(0, 8);

        let best = cand.find(x => (x.name||'').toLowerCase().includes((brand||'').toLowerCase())) || cand[0];
        imageUrl = (best?.contentUrl || best?.hostPageUrl || '').trim();
      }

      out.push({
        sourceName: name,
        brand,
        normalizedName: norm,
        category,
        desc,
        imageUrl,
      });
    }

    return res.status(200).json({ ok: true, items: out });
  } catch (e) {
    return res.status(200).json({ ok:false, error: e?.message || String(e) });
  }
}
