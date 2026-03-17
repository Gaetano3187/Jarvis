// pages/api/product-image.js
// Cerca immagine prodotto via Open Food Facts (gratuito, no API key)
// GET /api/product-image?q=Latte+Zymil+1L&brand=Zymil

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const query = String(req.query.q || '').trim()
  const brand = String(req.query.brand || '').trim()
  if (!query) return res.status(400).json({ error: 'Query mancante' })

  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000')

  // Prova Google CSE se configurato
  const apiKey = process.env.GOOGLE_API_KEY
  const cseId  = process.env.GOOGLE_CSE_ID
  if (apiKey && cseId) {
    try {
      const q = brand ? `${brand} ${query}` : query
      const url = `https://www.googleapis.com/customsearch/v1?` + new URLSearchParams({
        key: apiKey, cx: cseId, q, searchType: 'image', num: 3,
        imgSize: 'MEDIUM', safe: 'active', gl: 'it',
      })
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (r.ok) {
        const d = await r.json()
        const img = d?.items?.[0]?.link
        if (img) return res.status(200).json({ ok: true, imageUrl: img, source: 'google' })
      }
    } catch {}
  }

  // Fallback: Open Food Facts
  for (const locale of ['it', 'world']) {
    try {
      const terms = brand ? `${brand} ${query}` : query
      const url = `https://${locale}.openfoodfacts.org/cgi/search.pl?` +
        `search_terms=${encodeURIComponent(terms)}&search_simple=1&action=process&json=1` +
        `&page_size=5&fields=brands,image_front_url,image_url`
      const r = await fetch(url, {
        headers: { 'User-Agent': 'JarvisApp/1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      })
      if (!r.ok) continue
      const d = await r.json()
      const products = (d?.products || []).filter(p => p.image_front_url || p.image_url)
      if (!products.length) continue
      const best = brand
        ? (products.find(p => String(p.brands||'').toLowerCase().includes(brand.toLowerCase())) || products[0])
        : products[0]
      const img = best.image_front_url || best.image_url
      if (img) return res.status(200).json({ ok: true, imageUrl: img.replace(/\.jpg$/, '.400.jpg'), source: `off-${locale}` })
    } catch {}
  }

  return res.status(200).json({ ok: false, imageUrl: null })
}