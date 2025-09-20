// pages/api/spese-casa/ingest.js
 import { createClient } from '@supabase/supabase-js';
 import { randomUUID } from 'node:crypto';

const TBL_SPESA = 'jarvis_spese_casa';

function toNum(n){ const v = Number(n); return Number.isFinite(v) ? v : 0; }
function isoDate(s){
  if (!s) return new Date().toISOString().slice(0,10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? new Date().toISOString().slice(0,10) : d.toISOString().slice(0,10);
}
function normalizeLine(it) {
  const packs = Math.max(1, toNum(it.packs ?? it.qty ?? 1));
  const upp   = Math.max(1, toNum(it.unitsPerPack ?? 1));
  const totalUnits = packs * upp;
  let priceEach  = toNum(it.priceEach);
  let priceTotal = toNum(it.priceTotal);

  if (totalUnits <= 1) { const val = priceEach || priceTotal; priceEach = val; priceTotal = val; }
  else { if (priceEach) priceTotal = Number((priceEach * totalUnits).toFixed(2)); else priceEach = totalUnits ? Number((priceTotal/totalUnits).toFixed(4)) : 0; }

  return {
    name: (it.name||'').trim(),
    brand: (it.brand||'').trim() || null,
    packs,
    units_per_pack: upp,
    unit_label: (it.unitLabel || it.uom || 'unità'),
    price_each: priceEach,
    price_total: priceTotal,
    currency: it.currency || 'EUR',
    expires_at: it.expiresAt || null,
  };
}

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
    const {
      store = '',
      purchaseDate,
      totalPaid = 0,
      items = [],
      receiptTotalAuthoritative = false,
      receipt_id: ridFromBody
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok:false, error:'No items' });
    }

    const storeLabel = String(store || '').trim();
    const day = isoDate(purchaseDate);
    const lines = items.map(normalizeLine).filter(r => r.name);

    // genera o riusa un receipt_id
const rid = String(ridFromBody || (globalThis.crypto?.randomUUID?.() ?? randomUUID()));

    // applica doc_total alla prima riga del gruppo, se passato come autorevole
    const docForFirst = (receiptTotalAuthoritative && toNum(totalPaid) > 0)
      ? Number(toNum(totalPaid).toFixed(2))
      : 0;

    const rows = lines.map((r, idx) => ({
      user_id: user.id,
      store: storeLabel || null,
      purchase_date: day,
      doc_total: idx === 0 ? docForFirst : 0,
      receipt_id: rid,
      ...r,
    }));

    const { error: insErr } = await supabase.from(TBL_SPESA).insert(rows);
    if (insErr) throw insErr;

    return res.status(200).json({
      ok: true,
      inserted: rows.length,
      doc_total_applied: docForFirst,
      receipt_id: rid,
      group: { store: storeLabel, date: day }
    });
  } catch (e) {
    console.error('[spese-casa/ingest]', e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
