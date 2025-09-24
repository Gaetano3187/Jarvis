// /pages/api/spese-casa/ingest.js
import { createClient } from '@supabase/supabase-js';

const TABLE = 'jarvis_spese_casa';

function toNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}
function toIsoDate(s) {
  if (!s) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}
function normalizeLine(it = {}) {
  const packs = Math.max(1, toNumber(it.packs ?? it.qty ?? 1));
  const upp   = Math.max(1, toNumber(it.unitsPerPack ?? 1));
  const totalUnits = packs * upp;

  let priceEach  = toNumber(it.priceEach);
  let priceTotal = toNumber(it.priceTotal);

  if (totalUnits <= 1) {
    const val = priceEach || priceTotal;
    priceEach = val;
    priceTotal = val;
  } else {
    if (priceEach) {
      priceTotal = Number((priceEach * totalUnits).toFixed(2));
    } else {
      priceEach = totalUnits ? Number((priceTotal / totalUnits).toFixed(4)) : 0;
    }
  }

  return {
    name: (it.name || '').trim(),
    brand: (it.brand || '').trim() || null,
    packs,
    units_per_pack: upp,
    unit_label: it.unitLabel || it.uom || 'unità',
    price_each: priceEach,
    price_total: priceTotal,
    currency: it.currency || 'EUR',
    expires_at: it.expiresAt || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ✅ Client server-side per questa richiesta (RLS via JWT del client)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: req.headers.authorization || '' } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    }
  );

  try {
    const {
      user_id,
      store = '',
      purchaseDate,
      items = [],
      totalPaid = 0,
      receipt_id,                        // ⬅️ obbligatoria per il linking
      link_label,                        // (echo, non salvato a DB qui)
      link_path,                         // (echo, non salvato a DB qui)
      receiptTotalAuthoritative = true,  // se true, usa totalPaid come doc_total prima riga
    } = req.body || {};

    if (!user_id || !purchaseDate || !receipt_id) {
      return res.status(400).json({ error: 'user_id, purchaseDate e receipt_id sono obbligatori' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items è vuoto' });
    }

    const day = toIsoDate(purchaseDate);
    const lines = items.map(normalizeLine).filter(r => r.name);

    const docTotalForFirst =
      receiptTotalAuthoritative && toNumber(totalPaid) > 0
        ? Number(toNumber(totalPaid).toFixed(2))
        : null;

    const rows = lines.map((r, i) => ({
      user_id,
      store: store || null,
      purchase_date: day,
      doc_total: i === 0 ? docTotalForFirst : null,
      name: r.name,
      brand: r.brand,
      packs: r.packs,
      units_per_pack: r.units_per_pack,
      unit_label: r.unit_label,
      price_each: r.price_each,
      price_total: r.price_total,
      currency: r.currency,
      expires_at: r.expires_at,
      receipt_id,
    }));

    const { error: insErr, count } = await supabase
      .from(TABLE)
      .insert(rows, { count: 'exact' });
    if (insErr) throw insErr;

    return res.status(200).json({
      ok: true,
      inserted: count || rows.length,
      receipt_id,
      link_path: link_path || null,
      link_label: link_label || null,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
