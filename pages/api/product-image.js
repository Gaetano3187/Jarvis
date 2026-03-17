// pages/api/product-image.js
// Cerca immagine prodotto alimentare italiano
// Strategia: Open Food Facts (IT → World) → Bing Images scraping → null
//
// GET /api/product-image?q=Latte+Zymil+senza+lattosio+1+litro&brand=Zymil

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const query = String(req.query.q || '').trim()
  const brand = String(req.query.brand || '').trim()

  if (!query) return res.status(400).json({ error: 'Query mancante' })

  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000')

  try {
    // 1. Open Food Facts IT
    const off1 = await searchOFF(brand ? `${brand} ${query}` : query, brand, 'it')
    if (off1) return res.status(200).json({ ok: true, imageUrl: off1, source: 'off-it' })

    // 2. Open Food Facts world
    const off2 = await searchOFF(brand ? `${brand} ${query}` : query, brand, 'world')
    if (off2) return res.status(200).json({ ok: true, imageUrl: off2, source: 'off-world' })

    // 3. Open Food Facts solo brand
    if (brand) {
      const off3 = await searchOFF(brand, '', 'world')
      if (off3) return res.status(200).json({ ok: true, imageUrl: off3, source: 'off-brand' })
    }

    // 4. Bing Images scraping
    const bing = await searchBing(brand ? `${brand} ${query}` : query)
    if (bing) return res.status(200).json({ ok: true, imageUrl: bing, source: 'bing' })

    return res.status(200).json({ ok: false, imageUrl: null })
  } catch (err) {
    console.error('[product-image]', err?.message)
    return res.status(200).json({ ok: false, imageUrl: null })
  }
}

async function searchOFF(terms, brand, locale) {
  try {
    const url = `https://${locale}.openfoodfacts.org/cgi/search.pl` +
      `?search_terms=${encodeURIComponent(terms)}` +
      `&search_simple=1&action=process&json=1&page_size=8` +
      `&fields=product_name,brands,image_front_url,image_url,image_front_thumb_url`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'JarvisApp/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const products = (data?.products || []).filter(p =>
      p.image_front_url || p.image_url || p.image_front_thumb_url
    )
    if (!products.length) return null
    let best = brand
      ? products.find(p => String(p.brands || '').toLowerCase().includes(brand.toLowerCase()))
      : null
    if (!best) best = products[0]
    const img = best.image_front_url || best.image_url || best.image_front_thumb_url
    if (!img) return null
    return img.replace(/\.(\d+)\.jpg$/, '.400.jpg').replace(/(?<!\.400)\.jpg$/, '.400.jpg')
  } catch { return null }
}

async function searchBing(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query + ' confezione')}&count=5&safeSearch=Moderate`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'it-IT,it;q=0.9',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!resp.ok) return null
    const html = await resp.text()
    const matches = [...html.matchAll(/"murl":"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi)]
    const urls = matches
      .map(m => m[1].replace(/\\u0026/g, '&'))
      .filter(u => !u.includes('bing.com') && !u.includes('microsoft.com') && u.startsWith('https'))
    return urls[0] || null
  } catch { return null }
}