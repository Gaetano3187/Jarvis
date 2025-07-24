import { supabase } from '../../../lib/supabaseClient';\n
';';

export default async function handler(req, res) {
  // Recupera l'utente autenticato (token passato dall'app, semplificato)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('expenses')
      .select('categoria, importo')
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });

    const totals = data.reduce((acc, row) => {
      acc[row.categoria] = (acc[row.categoria] || 0) + row.importo;
      return acc;
    }, {});

    return res.status(200).json({ totals });
  }

  if (req.method === 'POST') {
    const { categoria, esercizio, data: date, importo, dettagli } = req.body;

    const { error } = await supabase.from('expenses').insert([
      {
        user_id: user.id,
        categoria,
        esercizio,
        data: date,
        importo,
        dettagli,
      },
    ]);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
