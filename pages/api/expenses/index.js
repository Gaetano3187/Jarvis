import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  const {
    method,
    body,
    headers: { authorization },
  } = req;

  // ↘️ se gestisci l’utente da JWT: const { user } = await supabase.auth.getUser(authorization);

  switch (method) {
    // ── GET /api/expenses ───────────────────────────
    case 'GET': {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    // ── POST /api/expenses ──────────────────────────
    case 'POST': {
      const { amount, category, date, note } = body;
      const { error } = await supabase
        .from('expenses')
        .insert({ amount, category, date, note });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ ok: true });
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
