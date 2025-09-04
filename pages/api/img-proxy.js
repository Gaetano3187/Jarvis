// pages/api/img-proxy.js
export default async function handler(req, res) {
  try {
    const url = String(req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).send('Bad url');
    }

    const r = await fetch(url);
    if (!r.ok) {
      return res.status(502).send('Upstream error ' + r.status);
    }
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const ab = await r.arrayBuffer();

    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(Buffer.from(ab));
  } catch (e) {
    res.status(500).send('Proxy error');
  }
}
