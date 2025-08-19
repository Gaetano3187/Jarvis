// pages/api/finances/ingest.js
export const config = { api: { bodyParser: true }, runtime: 'nodejs' };

export default async function handler(req, res) {
  // Log di diagnostica lato server
  console.log('[ingest] method:', req.method, 'url:', req.url);

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok:false, error:'Method Not Allowed', method: req.method });
  }

  try {
    const body = req.body || {};
    return res.status(200).json({ ok:true, echo: body });
  } catch (e) {
    console.error('[ingest] fatal', e);
    return res.status(500).json({ ok:false, error: e?.message || 'Server error' });
  }
}

