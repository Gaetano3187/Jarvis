import { supabase } from '@/lib/supabaseClient';

export default async function handler(req, res) {
  const {
    query: { id },
    method,
    body,
  } = req;

  switch (method) {
    // ── GET /api/expenses/[id] ──────────────────────
    case 'GET': {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', id)
        .single();

      if (error) return res.status(404).json({ error: error.message });
      return res.status(200).json(data);
    }

    // ── PUT /api/expenses/[id] ──────────────────────
    case 'PUT': {
      const { amount, category, date, note } = body;
      const { error } = await supabase
        .from('expenses')
        .update({ amount, category, date, note })
        .eq('id', id);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // ── DELETE /api/expenses/[id] ───────────────────
    case 'DELETE': {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(204).end();
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
