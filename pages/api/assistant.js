// pages/api/assistant.js
import { askAssistant } from '../../lib/assistant'; // ← named import, non default

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Metodo ${req.method} non consentito`);
  }

  try {
    const risposta = await askAssistant(req.body.prompt);
    return res.status(200).json({ answer: risposta });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
