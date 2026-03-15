// pages/api/product-image.js
// Recupera l'immagine di un prodotto alimentare
// Strategia: Open Food Facts (gratuito, IT) → DuckDuckGo Images fallback
//
// GET /api/product-image?q=Latte+Zymil+1L&brand=Zymil
// Risposta: { ok: true, imageUrl: "https://..." }

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const query = String(req.query.q || '').trim()
  const brand = String(req.query.brand || '').trim()

  if (!query) return res.status(400).json({ error: 'Query mancante' })

  // Cache header — l'immagine di un prodotto non cambia
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')

  try {
    // ── 1. Open Food Facts ────────────────────────────────────────────────────
    const offUrl = `https://it.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&lc=it`
    
    const offResp = await fetch(offUrl, {
      headers: { 'User-Agent': 'JarvisApp/1.0 (personal finance assistant)' },
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    if (offResp?.ok) {
      const offData = await offResp.json().catch(() => null)
      const products = offData?.products || []

      // Cerca il prodotto con immagine, preferendo quello con marca corrispondente
      const withImage = products.filter(p => p.image_front_url || p.image_url || p.image_front_small_url)
      
      let best = null
      if (brand) {
        best = withImage.find(p =>
          String(p.brands || '').toLowerCase().includes(brand.toLowerCase())
        )
      }
      if (!best) best = withImage[0]

      if (best) {
        const imgUrl = best.image_front_url || best.image_url || best.image_front_small_url
        if (imgUrl) {
          // Usa versione media (400px) se disponibile
          const medUrl = imgUrl.replace('/images/products/', '/images/products/').replace('.jpg', '.400.jpg')
          return res.status(200).json({ ok: true, imageUrl: imgUrl, source: 'openfoodfacts' })
        }
      }
    }

    // ── 2. Fallback: DuckDuckGo Images (no API key) ───────────────────────────
    const ddgQuery = brand ? `${brand} ${query}` : query
    const ddgUrl = `https://duckduckgo.com/?q=${encodeURIComponent(ddgQuery + ' prodotto')}&iax=images&ia=images&format=json`

    // DuckDuckGo ha un endpoint token
    const tokenResp = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(ddgQuery)}&iax=images&ia=images`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(4000),
    }).catch(() => null)

    if (tokenResp?.ok) {
      const html = await tokenResp.text().catch(() => '')
      const vqdMatch = html.match(/vqd=([^&"]+)/)
      if (vqdMatch) {
        const vqd = vqdMatch[1]
        const imgResp = await fetch(
          `https://duckduckgo.com/i.js?q=${encodeURIComponent(ddgQuery)}&vqd=${vqd}&o=json&p=1`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://duckduckgo.com/' },
            signal: AbortSignal.timeout(4000),
          }
        ).catch(() => null)

        if (imgResp?.ok) {
          const imgData = await imgResp.json().catch(() => null)
          const results = imgData?.results || []
          const first = results.find(r => r.image && r.width > 100)
          if (first?.image) {
            return res.status(200).json({ ok: true, imageUrl: first.image, source: 'duckduckgo' })
          }
        }
      }
    }

    // ── 3. Nessuna immagine trovata ───────────────────────────────────────────
    return res.status(200).json({ ok: false, imageUrl: null })

  } catch (err) {
    console.error('[product-image]', err)
    return res.status(200).json({ ok: false, imageUrl: null })
  }
}