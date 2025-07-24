import { supabase } from '../../../import { supabase } from 'lib/supabaseClient.ts
';';

export default async function handler(req, res) {
  const { id } = req.query;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'PUT') {
    const { categoria, esercizio, data: date, importo, dettagli } = req.body;
    const { error } = await supabase
      .from('expenses')
      .update({ categoria, esercizio, data: date, importo, dettagli })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
