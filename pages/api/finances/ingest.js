// pages/api/finances/ingest.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Parse JSON
  let raw;
  try {
    raw = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Body non valido (JSON)' });
  }

  // 2) Validazione minima
  const items = Array.isArray(raw.items) ? raw.items : null;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'items deve essere un array non vuoto' });
  }

  const cleanedItems = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const name = String(it.name || '').trim();
    if (!name) return res.status(400).json({ error: `items[${i}].name è obbligatorio` });
    cleanedItems.push({
      name,
      brand: String(it.brand || ''),
      packs: Number.isFinite(it.packs) ? it.packs : 0,
      unitsPerPack: Number.isFinite(it.unitsPerPack) ? it.unitsPerPack : 0,
      unitLabel: String(it.unitLabel || ''),
      priceEach: Number.isFinite(it.priceEach) ? it.priceEach : 0,
      priceTotal: Number.isFinite(it.priceTotal) ? it.priceTotal : 0,
      currency: String(it.currency || 'EUR'),
      expiresAt: String(it.expiresAt || ''),
    });
  }

  const input = {
    user_id: typeof raw.user_id === 'string' && raw.user_id ? raw.user_id : null,
    store: String(raw.store || ''),
    purchaseDate: String(raw.purchaseDate || ''),
    payment_method: raw.payment_method === 'card' ? 'card' : 'cash',
    card_label: raw.card_label ?? null,
    items: cleanedItems,
  };

  // 3) Se Supabase non è configurato -> OK no-op (niente 500)
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(200).json({
      ok: true,
      noop: true,
      reason: 'SUPABASE_DISABLED',
      echo: input,
    });
  }

  // 4) Insert su Supabase (import dentro la funzione, no top-level await)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    const TABLE = process.env.JARVIS_FINANCES_TABLE || 'jarvis_finances';
    const rows = input.items.map(it => ({
      user_id: input.user_id,
      store: input.store || null,
      purchase_date: input.purchaseDate || null,
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
      expires_at: it.expiresAt || null,

      created_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from(TABLE).insert(rows);
    if (error) {
      return res.status(200).json({
        ok: true,
        warning: 'SUPABASE_INSERT_FAILED',
        message: error.message,
        echo: input,
      });
    }

    return res.status(200).json({ ok: true, inserted: rows.length });
  } catch (e) {
    return res.status(500).json({ error: `Supabase error: ${e?.message || e}` });
  }
}
