// pages/api/finances/ingest.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ---------- helpers ----------
  const toStr = (v, d = '') => String(v ?? d).trim();
  const toNum = (v, d = 0) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : d;
  };
  const toInt = (v, d = 0) => {
    const n = Math.trunc(toNum(v, d));
    return Number.isFinite(n) ? n : d;
  };
  const toISO = (s) => {
    const v = toStr(s, '');
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;             // YYYY-MM-DD
    const m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m) {
      const d = String(m[1]).padStart(2, '0');
      const M = String(m[2]).padStart(2, '0');
      let y = String(m[3]); if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
      return `${y}-${M}-${d}`;
    }
    return v; // lascia passare (DB lato farà il cast se compatibile)
  };

  // ---------- parse body ----------
  let raw;
  try {
    raw = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Body non valido (JSON)' });
  }

  // ---------- validazione minima ----------
  const items = Array.isArray(raw.items) ? raw.items : null;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'items deve essere un array non vuoto' });
  }

  const cleanedItems = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const name = toStr(it.name);
    if (!name) return res.status(400).json({ error: `items[${i}].name è obbligatorio` });

    cleanedItems.push({
      name,
      brand: toStr(it.brand, ''),
      packs: toInt(it.packs, 0),
      unitsPerPack: toInt(it.unitsPerPack, 0),
      unitLabel: toStr(it.unitLabel, ''),
      priceEach: toNum(it.priceEach, 0),
      priceTotal: toNum(it.priceTotal, 0),
      currency: toStr(it.currency, 'EUR') || 'EUR',
      expiresAt: toStr(it.expiresAt, '') || null,
    });
  }

  const input = {
    user_id: toStr(raw.user_id, '') || null,
    store: toStr(raw.store, '') || null,
    purchaseDate: toISO(raw.purchaseDate) || null,
    payment_method: raw.payment_method === 'card' ? 'card' : 'cash',
    card_label: raw.card_label ?? null,
    items: cleanedItems,
  };

  // ---------- Supabase config (richiede SERVICE ROLE) ----------
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    // Meglio fallire “forte” invece di fingere il successo.
    return res.status(500).json({ error: 'Supabase service role non configurata' });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const TABLE = process.env.JARVIS_FINANCES_TABLE || 'jarvis_finances';

    const rows = input.items.map(it => ({
      user_id: input.user_id,                  // ⚠️ Assicurati che il client te lo passi (lo fai già)
      store: input.store,
      purchase_date: input.purchaseDate,       // colonna DATE o TIMESTAMP in Supabase
      payment_method: input.payment_method,
      card_label: input.card_label,

      name: it.name,
      brand: it.brand || null,
      packs: it.packs,
      units_per_pack: it.unitsPerPack,
      unit_label: it.unitLabel || null,
      price_each: it.priceEach,
      price_total: it.priceTotal,
      currency: it.currency,
      expires_at: it.expiresAt,

      created_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from(TABLE)
      .insert(rows, { returning: 'minimal' }); // più leggero

    if (error) {
      return res.status(500).json({
        error: 'SUPABASE_INSERT_FAILED',
        message: error.message,
      });
    }

    return res.status(200).json({ ok: true, inserted: rows.length });
  } catch (e) {
    return res.status(500).json({ error: `Supabase error: ${e?.message || e}` });
  }
}
