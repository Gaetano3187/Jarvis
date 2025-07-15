import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  const table = supabase.from('scorte');

  switch (req.method) {
    case 'GET': {
      const { data, error } = await table.select('*');
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    case 'POST': {
      const { error } = await table.insert(req.body);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ ok: true });
    }
    case 'PATCH': {
      const { id, ...rest } = req.body;
      const { error } = await table.update(rest).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    case 'DELETE': {
      const { id } = req.body;
      const { error } = await table.delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    default:
      res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
