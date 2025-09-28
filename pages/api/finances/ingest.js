import { createClient } from '@supabase/supabase-js';

const TABLE_HEAD  = 'jarvis_finanze';
const TABLE_LINES = 'jarvis_finances';

const toNum = n => (Number.isFinite(Number(n)) ? Number(n) : 0);
const normDate = input => {
  const today = new Date().toISOString().slice(0,10);
  if (!input || typeof input !== 'string') return today;
  const s = input.trim();
  if (!s) return today;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? today : d.toISOString().slice(0,10);
};

export default async function handler(req, res) {
  // 🔓 Preflight & CORS (anche se sei same-origin, gestirlo evita 405 su OPTIONS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', received: req.method });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: req.headers.authorization || '' } },
      auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
    }
  );

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user?.id) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const {
      user_id, store = '', purchaseDate, payment_method = 'cash', card_label = null,
      items = [], totalPaid = 0, receipt_id, link_label, link_path,
      receiptTotalAuthoritative = true
    } = req.body || {};

    const uid = user_id ?? auth.user.id;
    if (user_id && user_id !== auth.user.id) return res.status(403).json({ error: 'user_id mismatch with JWT' });
    if (!receipt_id) return res.status(400).json({ error: 'receipt_id è obbligatorio' });

    // ✅ data sempre valida (mai stringa vuota)
    const day = normDate(purchaseDate);

    // totale documento
    const sumLines = (Array.isArray(items) ? items : []).reduce(
      (s,it)=> s + toNum(it?.priceTotal ?? it?.price_total), 0
    );
    let grand = receiptTotalAuthoritative && toNum(totalPaid) > 0 ? toNum(totalPaid) : sumLines;
    grand = Math.round(grand * 100) / 100;
    if (!grand) return res.status(400).json({ error: 'Importo totale nullo' });

    // 1) testa spesa (no .select() → non serve policy SELECT)
    const description = (link_label ? `${link_label} — clicca per dettagli` : `Spesa ${String(store||'').trim()} — clicca per dettagli`);
    const headRow = { user_id: uid, date: day, amount: -Math.abs(grand), description, method: payment_method, card_label };

    const { error: headErr } = await supabase
      .from(TABLE_HEAD)
      .insert(headRow, { returning: 'minimal' });
    if (headErr) return res.status(400).json({ error: headErr.message, debug: { day, method: req.method } });

    // 2) righe analitiche (opzionali)
    if (Array.isArray(items) && items.length) {
      const rows = items.map(p => ({
        user_id: uid, store, purchase_date: day, payment_method, card_label,
        name: p?.name ?? '', brand: p?.brand ?? '',
        packs: toNum(p?.packs ?? 1), units_per_pack: toNum(p?.unitsPerPack ?? 1),
        unit_label: p?.unitLabel ?? 'unità',
        price_each: toNum(p?.priceEach ?? 0), price_total: toNum(p?.priceTotal ?? 0),
        currency: p?.currency ?? 'EUR', expires_at: p?.expiresAt ?? null, location: null
      }));
      const { error: linesErr } = await supabase.from(TABLE_LINES).insert(rows, { returning: 'minimal' });
      if (linesErr) return res.status(400).json({ error: linesErr.message, debug: { day, method: req.method } });
    }

    return res.status(200).json({ ok: true, receipt_id, link_path: link_path || null, day, usedTotal: grand });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
