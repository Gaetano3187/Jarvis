// pages/api/img-proxy.js

// opzionale: consenti solo questi domini (evita uso come open-proxy/SSRF)
const ALLOWED_HOSTS = [
  /(^|\.)googleusercontent\.com$/i,
  /(^|\.)gstatic\.com$/i,
  /(^|\.)cloudfront\.net$/i,
  /(^|\.)amazon\.com$/i,
  /(^|\.)amazon\.(it|de|fr|es|co\.uk)$/i,
  /(^|\.)static\-ssl\.microsoft\.com$/i,
  /(^|\.)shopifycdn\.com$/i,
  // aggiungi altri che ti servono (esselunga, coop, ecc.)
];

export default async function handler(req, res) {
  try {
    // metodi ammessi
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).send('Method not allowed');
    }

    const raw = String(req.query.url || '').trim();
    if (!raw) return res.status(400).send('Bad url');

    let target;
    try {
      target = new URL(raw);
    } catch {
      return res.status(400).send('Bad url');
    }
    if (!/^https?:$/i.test(target.protocol)) {
      return res.status(400).send('Only http/https');
    }

    // allow-list domini (commenta questo blocco se vuoi permettere il “qualsiasi”)
    const host = target.hostname;
    const allowed = ALLOWED_HOSTS.some(rx => rx.test(host));
    if (!allowed) {
      return res.status(403).send('Host not allowed');
    }

    const upstream = await fetch(target.toString(), {
      // forwardiamo un minimo di UA per retail CDN
      headers: { 'User-Agent': 'Jarvis-ImgProxy/1.0' },
      // niente credenziali
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return res.status(502).send('Upstream error ' + upstream.status);
    }

    const ct = upstream.headers.get('content-type') || '';
    // accetta solo immagini
    if (!/^image\//i.test(ct)) {
      return res.status(415).send('Unsupported content-type: ' + ct);
    }

    // CORS + cache CDN
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
    res.setHeader('Content-Type', ct);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    // stream → meno memoria rispetto a arrayBuffer()
    const reader = upstream.body.getReader();
    res.status(200);
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    res.status(500).send('Proxy error');
  }
}
