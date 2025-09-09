// pages/api/vini/ingest.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res){
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ error:'Method not allowed' }); }

  const str=(v,d='')=>String(v ?? d).trim();
  const num=(v,d=0)=>{ const n=Number(String(v ?? '').replace(',','.')); return Number.isFinite(n)?n:d; };

  let raw; try { raw = typeof req.body==='string' ? JSON.parse(req.body) : (req.body||{}); }
  catch { return res.status(400).json({ error:'Body non valido (JSON)' }); }

  const user_id = str(raw.user_id,''); if (!user_id) return res.status(400).json({ error:'user_id richiesto (service role)' });

  const wine = (raw.wine && typeof raw.wine==='object') ? raw.wine : null;
  const text = str(raw.text) || null;

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error:'Supabase service role non configurata' });

  const TABLE = process.env.JARVIS_VINI_TABLE || 'jarvis_vini';

  const row = {
    user_id,
    name: str(wine?.name) || null,
    winery: str(wine?.winery) || null,
    denomination: str(wine?.denomination) || null,
    region: str(wine?.region) || null,
    vintage: str(wine?.vintage) || null,
    alcohol_pct: num(wine?.alcohol_pct, 0),
    format_ml: Number.isFinite(Number(wine?.format_ml)) ? Number(wine?.format_ml) : 0,
    grape: str(wine?.grape) || null,
    notes: str(wine?.notes) || null,
    source_text: text,
    created_at: new Date().toISOString(),
  };

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{ persistSession:false } });
    const { error } = await supabase.from(TABLE).insert(row, { returning:'minimal' });
    if (error) {
      console.error('[VINI_INGEST] insert error', error);
      return res.status(500).json({ error:'SUPABASE_INSERT_FAILED', message:error.message });
    }
    return res.status(200).json({ ok:true, inserted: 1 });
  } catch (e) {
    return res.status(500).json({ error:`Supabase error: ${e?.message || e}` });
  }
}
