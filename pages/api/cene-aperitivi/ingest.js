// pages/api/cene-aperitivi/ingest.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res){
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ error:'Method not allowed' }); }

  const str=(v,d='')=>String(v ?? d).trim();
  const num=(v,d=0)=>{ const n=Number(String(v ?? '').replace(',','.')); return Number.isFinite(n)?n:d; };
  const int=(v,d=0)=>Math.trunc(num(v,d));
  const toISO = (s) => { const v=str(s,''); if(!v) return null; if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); if(!m) return v;
    const d=String(m[1]).padStart(2,'0'), M=String(m[2]).padStart(2,'0'); let y=String(m[3]); if(y.length===2)y=(Number(y)>=70?'19':'20')+y; return `${y}-${M}-${d}`; };

  let raw; try { raw = typeof req.body==='string' ? JSON.parse(req.body) : (req.body||{}); }
  catch { return res.status(400).json({ error:'Body non valido (JSON)' }); }

  const items = Array.isArray(raw.items) ? raw.items : [];
  if (!items.length) return res.status(400).json({ error:'items deve essere un array non vuoto' });

  const user_id = str(raw.user_id,''); if (!user_id) return res.status(400).json({ error:'user_id richiesto (service role)' });

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error:'Supabase service role non configurata' });

  const TABLE = process.env.JARVIS_CENE_APERITIVI_TABLE || 'jarvis_cene_aperitivi';

  const rows = items.map(it => ({
    user_id,
    venue: str(raw.store) || null,
    purchase_date: toISO(raw.purchaseDate) || null,
    doc_total: num(raw.totalPaid, 0),

    item_name: str(it.name),
    brand: str(it.brand) || null,
    qty_packs: int(it.packs, 0),
    units_per_pack: int(it.unitsPerPack, 0),
    unit_label: str(it.unitLabel) || null,
    price_each: num(it.priceEach, 0),
    price_total: num(it.priceTotal, 0),
    currency: str(it.currency, 'EUR') || 'EUR',

    created_at: new Date().toISOString(),
  }));

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{ persistSession:false } });
    const { error } = await supabase.from(TABLE).insert(rows, { returning:'minimal' });
    if (error) {
      console.error('[CENE_APERITIVI_INGEST] insert error', error);
      return res.status(500).json({ error:'SUPABASE_INSERT_FAILED', message:error.message });
    }
    return res.status(200).json({ ok:true, inserted: rows.length });
  } catch (e) {
    return res.status(500).json({ error:`Supabase error: ${e?.message || e}` });
  }
}
