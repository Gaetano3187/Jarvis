// pages/api/assistant.js ----------------------------------------------------
import askAssistant from '../../lib/assistant'; // ← 2 livelli su

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const answer = await askAssistant(prompt);
    return res.status(200).json({ answer });
  } catch (error) {
    console.error('/api/assistant error:', error);
    return res
      .status(500)
      .json({ error: 'Assistant failed', details: String(error) });
  }
}
