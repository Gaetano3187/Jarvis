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
      payment_method = 'cash',
      card_label = null,
      items = [],
      totalPaid = 0,
      receipt_id,                    // ⬅️ per collegarsi a /spese-casa
      link_label,                    // es. "Spesa Maxi Store Decò (2025-09-24)"
      link_path,                     // es. "/spese-casa?rid=<uuid>"
      receiptTotalAuthoritative = true
    } = req.body || {};

    // Validazioni minime
    if (!user_id || !purchaseDate) {
      return res.status(400).json({ error: 'user_id e purchaseDate sono obbligatori' });
    }
    if (!receipt_id) {
      // Lo richiediamo per coerenza col linking cross-pagina
      return res.status(400).json({ error: 'receipt_id è obbligatorio per il linking' });
    }

    const day = toIsoDate(purchaseDate);

    // Totale: privilegia il totalPaid se autorevole, altrimenti somma righe
    const sumLines = (Array.isArray(items) ? items : []).reduce(
      (s, it) => s + toNumber(it?.priceTotal ?? it?.price_total),
      0
    );
    let grand = receiptTotalAuthoritative && toNumber(totalPaid) > 0
      ? toNumber(totalPaid)
      : sumLines;
    grand = Math.round(grand * 100) / 100;

    if (!grand) {
      return res.status(400).json({ error: 'Importo totale nullo: totalPaid o items.priceTotal mancanti' });
    }

    // 1) Inserisce la TESTA SPESA (importo negativo)
    const description =
      (link_label ? `${link_label} — clicca per dettagli` : `Spesa ${String(store || '').trim()} — clicca per dettagli`);

    const headRow = {
      user_id,
      date: day,
      amount: -Math.abs(grand),  // spesa = negativo
      description,
      method: payment_method,
      card_label
    };

    const { data: headIns, error: headErr } = await supabase
      .from(TABLE_HEAD)
      .insert(headRow)
      .select('id')
      .single();

    if (headErr) throw headErr;

    // 2) (Opzionale) righe analitiche per statistiche/store ranking
    if (Array.isArray(items) && items.length) {
      const rows = items.map(p => ({
        user_id,
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
      if (linesErr) throw linesErr;
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
