// pages/api/brain.js
export default async function handler(req, res) {
  // CORS base (ok anche per preflight)
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res
      .status(200)
      .json({ ok: true, route: 'brain', method: 'GET' });
  }

  if (req.method === 'POST') {
    try {
      // In Pages Router, se arriva JSON, Next te lo mette già in req.body (quando fetch con Content-Type: application/json)
      const body = (typeof req.body === 'object' && req.body) ? req.body : {};
      const { handleBrainRequest } = await import('@/lib/brainRouter.js');
      const result = await handleBrainRequest(body);
      const status = result?.ok === false ? 400 : 200;
      return res.status(status).json({ ok: true, ...result });
    } catch (e) {
      console.error('Brain API error:', e);
      return res.status(500).json({ ok: false, error: 'Internal error' });
    }
  }

  res.setHeader('Allow', 'GET,POST,OPTIONS,HEAD');
  return res.status(405).end('Method Not Allowed');
}
