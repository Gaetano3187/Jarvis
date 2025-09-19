// pages/api/finances/ingest.js
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

const TBL_FIN = 'jarvis_finanze';

function toNum(n){ const v = Number(n); return Number.isFinite(v) ? v : 0; }
function isoDate(s){
  if (!s) return new Date().toISOString().slice(0,10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? new Date().toISOString().slice(0,10) : d.toISOString().slice(0,10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });

  // ✅ server client con cookie di supabase (auth helpers gestisce tutto)
  const supabase = createServerSupabaseClient({ req, res });

  const { data: { session }, error: authErr } = await supabase.auth.getSession();
  if (authErr || !session?.user) {
    return res.status(401).json({ ok:false, error:'Not authenticated' });
  }
  const user = session.user;

  try {
    const {
      store = '',
      purchaseDate,
      payment_method = 'cash',
      card_label = null,
      items = [],
      totalPaid = 0,
      receiptTotalAuthoritative = false
    } = req.body || {};

    const day = isoDate(purchaseDate);

    const sumFromLines = (Array.isArray(items) ? items : []).reduce((s, it) => s + (toNum(it.priceTotal)), 0);
    let grand = (receiptTotalAuthoritative && toNum(totalPaid) > 0) ? toNum(totalPaid) : toNum(sumFromLines);
    grand = Number(grand.toFixed(2));

    const amount = -Math.abs(grand);
    const descr = `Spesa ${String(store||'').trim()}`;

    const row = {
      user_id: user.id,     // ✅ forzato lato server
      date: day,
      amount,
      description: descr,
      method: payment_method,
      card_label
    };

    const { error: insErr } = await supabase.from(TBL_FIN).insert(row);
    if (insErr) throw insErr;

    return res.status(200).json({ ok:true, inserted: 1, usedTotal: grand });
  } catch (e) {
    console.error('[finances/ingest]', e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
