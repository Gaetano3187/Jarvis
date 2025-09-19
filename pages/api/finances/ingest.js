// pages/api/finances/ingest.js
// ⛳️ Da chiamare dal client usando postJSON di `lib/http.js`
// che aggiunge automaticamente: Authorization: Bearer <JWT>

import { createClient } from '@supabase/supabase-js';

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

  // ✅ Legge il Bearer passato dal client (postJSON di lib/http.js)
  const authHeader = req.headers.authorization || '';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );

  // ✅ Utente dalla sessione (serve alle policy RLS)
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return res.status(401).json({ ok:false, error:'Not authenticated' });

  try {
    const {
      // ❌ non serve user_id: viene forzato lato server
      store = '',
      purchaseDate,
      payment_method = 'cash',
      card_label = null,
      items = [],
      totalPaid = 0,
      receiptTotalAuthoritative = false
    } = req.body || {};

    const day = isoDate(purchaseDate);

    // totale di movimento: scontrino intero (negativo = spesa)
    const sumFromLines = (Array.isArray(items) ? items : []).reduce((s, it) => s + toNum(it.priceTotal), 0);
    let grand = (receiptTotalAuthoritative && toNum(totalPaid) > 0) ? toNum(totalPaid) : toNum(sumFromLines);
    grand = Number(grand.toFixed(2));

    const amount = -Math.abs(grand);
    const row = {
      user_id: user.id, // ✅ forza coerenza con RLS
      date: day,
      amount,
      description: `Spesa ${String(store || '').trim()}`,
      method: payment_method,
      card_label
    };

    const { error } = await supabase.from(TBL_FIN).insert(row);
    if (error) throw error;

    return res.status(200).json({ ok:true, inserted: 1, usedTotal: grand });
  } catch (e) {
    console.error('[finances/ingest]', e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
