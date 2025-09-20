// pages/api/spese-casa/delete.js
// Cancella una riga di public.jarvis_spese_casa per id (RLS garantisce che sia del proprio utente)

import { createClient } from '@supabase/supabase-js';

const TBL = 'jarvis_spese_casa';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return res.status(401).json({ ok:false, error:'Not authenticated' });

  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok:false, error:'Missing id' });

    // RLS di delete garantisce che possano essere cancellate solo righe dell'utente
    const { data, error } = await supabase.from(TBL).delete().eq('id', id).select('id'); // select per sapere quante

    if (error) throw error;
    return res.status(200).json({ ok:true, deleted: data?.length || 0 });
  } catch (e) {
    console.error('[spese-casa/delete]', e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
