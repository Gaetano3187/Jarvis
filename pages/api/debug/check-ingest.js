// pages/api/debug/check-ingest.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SURL || !SKEY) return res.status(500).json({ error:'SRK non configurata' });

  const uid = String(req.query.user_id || '').trim();
  if (!uid) return res.status(400).json({ error:'user_id richiesto ?user_id=...' });

  const supabase = createClient(SURL, SKEY, { auth:{ persistSession:false } });

  const tFin = process.env.JARVIS_FINANCES_TABLE || 'jarvis_finances';
  const tSC  = process.env.JARVIS_SPESE_CASA_TABLE || 'jarvis_spese_casa';

  const [fin, sc, st] = await Promise.all([
    supabase.from(tFin).select('store,purchase_date,name,price_total,created_at').eq('user_id', uid).order('created_at',{ascending:false}).limit(10),
    supabase.from(tSC).select('store,purchase_date,name,price_total,created_at').eq('user_id', uid).order('created_at',{ascending:false}).limit(10),
    supabase.from('jarvis_liste_state').select('state').eq('user_id', uid).maybeSingle()
  ]);

  if (fin.error) return res.status(500).json({ error:'FIN', message: fin.error.message });
  if (sc.error)  return res.status(500).json({ error:'SC', message: sc.error.message });

  const stock = (st.data?.state?.stock || []).slice(0, 15);

  return res.status(200).json({
    finances_last10: fin.data,
    spese_casa_last10: sc.data,
    stock_sample: stock
  });
}
