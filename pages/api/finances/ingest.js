// /pages/api/finances/ingest.js
import { createClient } from '@supabase/supabase-js';

const TABLE_HEAD  = 'jarvis_finanze';   // riga "testa spesa" (totale negativo)
const TABLE_LINES = 'jarvis_finances';  // righe analitiche opzionali

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

  // ✅ Verifica autenticazione e coerenza user_id
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return res.status(401).json({ error: 'Not authenticated (missing/invalid JWT)' });
  }

  try {
    const {
      user_id,                        // opzionale: se presente deve combaciare col JWT
      store = '',
      purchaseDate,
      payment_method = 'cash',
      card_label = null,
      items = [],
      totalPaid = 0,
      receipt_id,                     // ⬅️ obbligatorio per il linking (non generarlo qui)
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

    const day = toIsoDate(purchaseDate);

    // Totale documento: preferisci totalPaid se autorevole, altrimenti somma righe
    const sumLines = (Array.isArray(items) ? items : []).reduce(
      (s, it) => s + toNumber(it?.priceTotal ?? it?.price_total),
      0
    );
    let grand = receiptTotalAuthoritative && toNumber(totalPaid) > 0 ? toNumber(totalPaid) : sumLines;
    grand = Math.round(grand * 100) / 100;
    if (!grand) {
      return res.status(400).json({ error: 'Importo totale nullo: totalPaid o items.priceTotal mancanti' });
    }

    // 1) TESTA SPESA (importo negativo)
    const description = link_label
      ? `${link_label} — clicca per dettagli`
      : `Spesa ${String(store || '').trim()} — clicca per dettagli`;

    const headRow = {
      user_id: uid,
      date: day,                  // 👈 sempre normalizzata
      amount: -Math.abs(grand),   // spesa = negativo
      description,
      method: payment_method,
      card_label
    };

    const { data: headIns, error: headErr } = await supabase
      .from(TABLE_HEAD)
      .insert(headRow)
      .select('id')
      .single();

    if (headErr) {
      return res.status(400).json({
        error: headErr.message || 'Insert head failed',
        code: headErr.code || null,
        details: headErr.details || null,
        hint: headErr.hint || null,
      });
    }

    // 2) RIGHE ANALITICHE (opzionali ma utili)
    if (Array.isArray(items) && items.length) {
      const rows = items.map(p => ({
        user_id: uid,
        store,
        purchase_date: day,
        payment_method,
        card_label,
        name: p?.name ?? '',
        brand: p?.brand ?? '',
        packs: toNumber(p?.packs ?? 1),
        units_per_pack: toNumber(p?.unitsPerPack ?? 1),
        unit_label: p?.unitLabel ?? 'unità',
        price_each: toNumber(p?.priceEach ?? 0),
        price_total: toNumber(p?.priceTotal ?? 0),
        currency: p?.currency ?? 'EUR',
        expires_at: p?.expiresAt ?? null,
        location: null
      }));

      const { error: linesErr } = await supabase.from(TABLE_LINES).insert(rows);
      if (linesErr) {
        return res.status(400).json({
          error: linesErr.message || 'Insert lines failed',
          code: linesErr.code || null,
          details: linesErr.details || null,
          hint: linesErr.hint || null,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      finance_head_id: headIns?.id ?? null,
      receipt_id,
      link_path: link_path || null,
      usedTotal: grand
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
