// pages/api/qr-text.js
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { url } = req.body || {};
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Invalid url' });

    const r = await fetch(url, { headers: { 'User-Agent': 'Jarvis/1.0 (+qr-text)' } });
    const html = await r.text();

    // strip HTML → testo semplice
    const text = String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20000); // limite sicurezza

    return res.status(200).json({ ok: true, text });
  } catch (e) {
    console.error('qr-text error', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
