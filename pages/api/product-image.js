// pages/api/product-image.js
// Cerca immagine prodotto - strategia multipla con fallback robusti

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const query = String(req.query.q || '').trim()
  const brand = String(req.query.brand || '').trim()
  if (!query) return res.status(400).json({ error: 'Query mancante' })

  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000')

  // ── 1. Google CSE (se configurato) ────────────────────────────────────────
  const apiKey = process.env.GOOGLE_API_KEY
  const cseId  = process.env.GOOGLE_CSE_ID
  if (apiKey && cseId) {
    try {
      const q = brand ? `${brand} ${query}` : query
      const params = new URLSearchParams({
        key: apiKey, cx: cseId, q,
        searchType: 'image', num: '3',
        imgSize: 'MEDIUM', safe: 'active',
      })
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`,
        { signal: AbortSignal.timeout(5000) })
      if (r.ok) {
        const d = await r.json()
        const img = d?.items?.[0]?.link
        if (img) {
          console.log(`[product-image] Google OK: ${img.slice(0,60)}`)
          return res.status(200).json({ ok: true, imageUrl: img, source: 'google' })
        }
      } else {
        const err = await r.json().catch(() => ({}))
        console.log(`[product-image] Google error: ${err?.error?.message}`)
      }
    } catch (e) { console.log(`[product-image] Google exception: ${e.message}`) }
  }

  // ── 2. Open Food Facts ────────────────────────────────────────────────────
  for (const locale of ['it', 'world']) {
    try {
      const terms = brand ? `${brand} ${query}` : query
      const url = `https://${locale}.openfoodfacts.org/cgi/search.pl?` +
        `search_terms=${encodeURIComponent(terms)}&search_simple=1&action=process` +
        `&json=1&page_size=5&fields=brands,image_front_url,image_url`
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'JarvisApp/1.0 (gaetano3187@gmail.com)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) { console.log(`[product-image] OFF-${locale} HTTP ${r.status}`); continue }
      const d = await r.json()
      const products = (d?.products || []).filter(p => p.image_front_url || p.image_url)
      if (!products.length) { console.log(`[product-image] OFF-${locale} no results`); continue }
      const best = brand
        ? (products.find(p => String(p.brands||'').toLowerCase().includes(brand.toLowerCase())) || products[0])
        : products[0]
      const img = best.image_front_url || best.image_url
      if (img) {
        console.log(`[product-image] OFF-${locale} OK: ${img.slice(0,60)}`)
        return res.status(200).json({ ok: true, imageUrl: img, source: `off-${locale}` })
      }
    } catch (e) { console.log(`[product-image] OFF-${locale} exception: ${e.message}`) }
  }

  console.log(`[product-image] No image found for: ${query}`)
  return res.status(200).json({ ok: false, imageUrl: null })
}