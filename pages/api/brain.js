// pages/api/brain.js
export default async function handler(req, res) {
  // CORS base
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, route: 'brain', method: 'GET' });
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'object' && req.body ? req.body : {};
      const { handleBrainRequest } = await import('@/lib/brainRouter.js');
      const brain = await handleBrainRequest(body);
      const status = brain?.ok === false ? 400 : 200;

      // 🔧 QUI la patch: esponi SEMPRE `result` (testo) e `debug` (oggetto completo)
      const resultText = typeof brain?.answer === 'string' ? brain.answer : JSON.stringify(brain);
      return res.status(status).json({
        ok: true,
        result: resultText,   // <- usato da home.js per mostrare la risposta
        debug: brain,         // <- utile se vuoi vedere i dettagli (intent, data)
        ...brain,
      });
    } catch (e) {
      console.error('Brain API error:', e);
      return res.status(500).json({ ok: false, error: 'Internal error' });
    }
  }

  res.setHeader('Allow', 'GET,POST,OPTIONS,HEAD');
  return res.status(405).end('Method Not Allowed');
}
