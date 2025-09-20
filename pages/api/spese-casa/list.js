// pages/api/spese-casa/list.js
// Elenca le righe di public.jarvis_spese_casa del proprio utente.
// Filtri opzionali: ?rid=<receipt_id>&store=<store>&date=YYYY-MM-DD

import { createClient } from '@supabase/supabase-js';

const TBL = 'jarvis_spese_casa';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return res.status(401).json({ ok:false, error:'Not authenticated' });

  try {
    const { rid, store, date } = req.query || {};

    let q = supabase.from(TBL).select('*').eq('user_id', user.id);

    if (rid)   q = q.eq('receipt_id', String(rid));
    if (store) q = q.eq('store', String(store));
    if (date)  q = q.eq('purchase_date', String(date));

    const { data, error } = await q
      .order('purchase_date', { ascending: false })
      .order('id', { ascending: true });

    if (error) throw error;
    return res.status(200).json({ ok:true, rows: data || [] });
  } catch (e) {
    console.error('[spese-casa/list]', e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
