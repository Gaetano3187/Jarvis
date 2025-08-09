// pages/api/assistant-ocr.js
export const config = {
  api: { bodyParser: true, externalResolver: true },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    // inoltra 1:1 allo stesso progetto
    const upstream = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // il body rimane identico a quello che mandava la pagina prima
      body: JSON.stringify(req.body || {}),
    });

    const payload = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(payload);
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
