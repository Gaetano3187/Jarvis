// /pages/api/spese-casa/ingest.js
import { createClient } from '@supabase/supabase-js';

const TABLE = 'jarvis_spese_casa';

function toNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}
function normalizeDate(input) {
  const today = new Date().toISOString().slice(0, 10);
  const s = (typeof input === 'string' ? input.trim() : '');
  if (!s) return today;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? today : d.toISOString().slice(0, 10);
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

  // Client server-side con JWT del client (RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: req.headers.authorization || '' } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    }
  );

  // ✅ Verifica autenticazione
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return res.status(401).json({ error: 'Not authenticated (missing/invalid JWT)' });
  }

  try {
    const {
      user_id,                        // opzionale: se presente deve combaciare col JWT
      store = '',
      purchaseDate,                   // può essere vuota/invalid -> normalizziamo
      items = [],
      totalPaid = 0,
      receipt_id,                     // ⬅️ OBBLIGATORIO per linking
      link_label,                     // echo per la UI
      link_path,                      // echo per la UI
      receiptTotalAuthoritative = true
    } = req.body || {};

    const uid = user_id ?? userData.user.id;
    if (user_id && user_id !== userData.user.id) {
      return res.status(403).json({ error: 'user_id mismatch with JWT' });
    }
    if (!receipt_id) {
      return res.status(400).json({ error: 'receipt_id è obbligatorio' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items è vuoto' });
    }

    // 🔒 Data SEMPRE valida (mai "")
    const day = normalizeDate(purchaseDate);
    const lines = items.map(normalizeLine).filter(r => r.name);

    // Doc_total in prima riga se totalPaid è valido e autorevole
    const docTotalForFirst =
      receiptTotalAuthoritative && toNumber(totalPaid) > 0
        ? Number(toNumber(totalPaid).toFixed(2))
        : null;

    const rows = lines.map((r, i) => ({
      user_id: uid,
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

    const { error: insErr, count } = await supabase.from(TABLE).insert(rows, { count: 'exact' });
    if (insErr) {
      return res.status(400).json({
        error: insErr.message || 'Insert failed',
        code: insErr.code || null,
        details: insErr.details || null,
        hint: insErr.hint || null,
        debug: { day }
      });
    }

    return res.status(200).json({
      ok: true,
      inserted: count || rows.length,
      receipt_id,
      link_label: link_label || null,
      link_path: link_path || null,
      day
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
