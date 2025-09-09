// pages/api/finances/ingest.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  // Helpers
  const toStr = (v, d='') => String(v ?? d).trim();
  const toNum = (v, d=0) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
  const toInt = (v, d=0) => Math.trunc(toNum(v, d));
  const toISO = (s) => {
    const v = toStr(s,''); if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!m) return v;
    const d = String(m[1]).padStart(2,'0');
    const M = String(m[2]).padStart(2,'0');
    let y = String(m[3]); if (y.length===2) y = (Number(y)>=70?'19':'20')+y;
    return `${y}-${M}-${d}`;
  };

  // Parse
  let raw; try { raw = typeof req.body==='string' ? JSON.parse(req.body) : (req.body||{}); }
  catch { return res.status(400).json({ error: 'Body non valido (JSON)' }); }

  const items = Array.isArray(raw.items) ? raw.items : [];
  if (!items.length) return res.status(400).json({ error: 'items deve essere un array non vuoto' });

  const user_id = toStr(raw.user_id,'');
  if (!user_id) return res.status(400).json({ error: 'user_id richiesto (service role)' });

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Supabase service role non configurata' });

  const TABLE = process.env.JARVIS_FINANCES_TABLE || 'jarvis_finances';

  const rows = items.map(it => ({
    user_id,
    store: toStr(raw.store) || null,
    purchase_date: toISO(raw.purchaseDate) || null,
    payment_method: raw.payment_method === 'card' ? 'card' : 'cash',
    card_label: raw.card_label ?? null,

    name: toStr(it.name),
    brand: toStr(it.brand) || null,
    packs: toInt(it.packs, 0),
    units_per_pack: toInt(it.unitsPerPack, 0),
    unit_label: toStr(it.unitLabel) || null,
    price_each: toNum(it.priceEach, 0),
    price_total: toNum(it.priceTotal, 0),
    currency: toStr(it.currency, 'EUR') || 'EUR',
    expires_at: toISO(it.expiresAt) || null,

    created_at: new Date().toISOString(),
  }));

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{ persistSession:false } });
    const { error } = await supabase.from(TABLE).insert(rows, { returning:'minimal' });
    if (error) {
      console.error('[FINANCES_INGEST] insert error', { code:error.code, message:error.message, details:error.details, hint:error.hint });
      return res.status(500).json({
        error: 'SUPABASE_INSERT_FAILED',
        code: error.code, message: error.message, details: error.details, hint: error.hint,
        sampleRow: rows[0],
      });
    }
    return res.status(200).json({ ok:true, inserted: rows.length });
  } catch (e) {
    return res.status(500).json({ error: `Supabase error: ${e?.message || e}` });
  }
}
