export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error:'Method not allowed. Use POST.' });
  }
  return res.status(200).json({ text: 'API OK – assistant-ask è live', mono: true });
}
