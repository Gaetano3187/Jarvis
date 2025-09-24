// pages/api/finances/ingest.js
// Inserisce 1 riga in public.jarvis_finanze per il movimento sintetico (spesa negativa)

// /pages/api/finances/ingest.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ✅ crea un client server-side per questa richiesta, propagando il JWT del client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: req.headers.authorization || '' } } }
  );

  try {
    const {
      user_id,
      store,
      purchaseDate,
      payment_method = 'cash',
      card_label = null,
      items = [],
      totalPaid = 0,
      receipt_id,
      link_label,
      link_path,
    } = req.body || {};

    if (!user_id || !purchaseDate || !receipt_id) {
      return res.status(400).json({ error: 'user_id, purchaseDate e receipt_id sono obbligatori' });
    }

    // 1) testa spesa su jarvis_finanze (importo negativo)
    const head = {
      user_id,
      date: purchaseDate,
      amount: Number(-Math.abs(totalPaid || 0)),
      description: link_label
        ? `${link_label} — clicca per dettagli`
        : `Spesa ${store || ''} — clicca per dettagli`,
      method: payment_method,
      card_label,
    };

    const { error: e1, data: d1 } = await supabase
      .from('jarvis_finanze')
      .insert(head)
      .select('id')
      .single();
    if (e1) throw e1;

    // 2) righe analitiche opzionali
    if (Array.isArray(items) && items.length) {
      const rows = items.map(p => ({
        user_id,
        store,
        purchase_date: purchaseDate,
        payment_method,
        card_label,
        name: p.name || '',
        brand: p.brand || '',
        packs: Number(p.packs || 1),
        units_per_pack: Number(p.unitsPerPack || 1),
        unit_label: p.unitLabel || 'unità',
        price_each: Number(p.priceEach || 0),
        price_total: Number(p.priceTotal || 0),
        currency: p.currency || 'EUR',
        expires_at: p.expiresAt || null,
        location: null,
      }));
      const { error: e2 } = await supabase.from('jarvis_finances').insert(rows);
      if (e2) throw e2;
    }

    return res.status(200).json({ ok: true, receipt_id, link_path, finance_head_id: d1?.id || null });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}



const TBL_FIN = 'jarvis_finanze';

function toNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}
function isoDate(s) {
  if (!s) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ✅ JWT dal client (lib/http.js mette Authorization: Bearer …)
  const authHeader = req.headers.authorization || '';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const {
      store = '',
      purchaseDate,
      payment_method = 'cash',
      card_label = null,
      items = [],
      totalPaid = 0,
      receiptTotalAuthoritative = false,
    } = req.body || {};

    // Somma righe: supporta priceTotal (camel) e price_total (snake)
    const sumFromLines = (Array.isArray(items) ? items : []).reduce((sum, it) => {
      const line = toNum(it?.priceTotal ?? it?.price_total);
      return sum + line;
    }, 0);

    const day = isoDate(purchaseDate);
    let grand = receiptTotalAuthoritative && toNum(totalPaid) > 0
      ? toNum(totalPaid)
      : toNum(sumFromLines);
    grand = Number(grand.toFixed(2));

    // Se non arriva nulla, non ha senso inserire 0: blocca gentilmente
    if (!grand) {
      return res.status(400).json({ ok: false, error: 'Importo totale nullo: totalPaid o items.priceTotal mancanti' });
    }

    // Spesa = importo negativo
    const amount = -Math.abs(grand);
    const row = {
      user_id: user.id,
      date: day,
      amount,
      description: `Spesa ${String(store || '').trim()}`,
      method: payment_method,
      card_label,
    };

    // Ritorna l'id inserito per comodità
    const { data, error } = await supabase.from(TBL_FIN).insert(row).select('id').single();
    if (error) {
      return res.status(400).json({ ok: false, error: error.message || 'Insert failed' });
    }

    return res.status(200).json({ ok: true, inserted: 1, id: data?.id || null, usedTotal: grand });
  } catch (e) {
    console.error('[finances/ingest]', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
