// pages/api/finances/ingest.js
export const config = { api: { bodyParser: true }, runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

// ---- Supabase admin (server only) ----
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[finances/ingest] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-application-name': 'jarvis-assistant/finances-ingest' } }
});

// ---- utils ----
const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const toDate = (s) => {
  if (!s) return null;
  // accetta YYYY-MM-DD,  DD/MM/YYYY,  DD-MM-YYYY
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const d = String(m[1]).padStart(2, '0');
    const M = String(m[2]).padStart(2, '0');
    let y = String(m[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  return null;
};
const todayISO = () => new Date().toISOString().slice(0, 10);

// Map “items” OCR → righe tabella `public.finances`
function mapItemsToFinancesRows({ user_id, category_id, store_name, spent_at, payment_method, card_label, items }) {
  const out = [];
  for (const p of (Array.isArray(items) ? items : [])) {
    const name = (p?.name || '').trim();
    const brand = (p?.brand || '').trim();
    const packs = toNum(p?.packs) ?? 0;
    const upp   = toNum(p?.unitsPerPack) ?? 0;

    // qty: se ho packs*upp uso le unità totali, altrimenti preferisco packs>0 o upp>0, altrimenti 1
    let qty = null;
    if (packs && upp) qty = packs * upp;
    else if (packs)   qty = packs;
    else if (upp)     qty = upp;
    else              qty = 1;

    // amount: preferisci priceTotal; fallback priceEach * qty; fallback 0
    const priceTotal = toNum(p?.priceTotal);
    const priceEach  = toNum(p?.priceEach);
    const amount = (priceTotal != null) ? priceTotal
                  : (priceEach != null && qty != null) ? Number((priceEach * qty).toFixed(2))
                  : 0;

    const currency = (p?.currency || 'EUR').trim() || 'EUR';
    const expires  = toDate(p?.expiresAt);

    // descrizione: name + (brand) se presente
    const description = brand ? `${name} (${brand})` : name;

    out.push({
      user_id,
      category_id: category_id || null,
      qty,
      amount,
      currency,
      description,
      store_name,
      spent_at,
      payment_method: (payment_method || 'cash'),
      card_label: card_label || null,
      product_id: p?.product_id || null,
      // colonne alternative esistenti nella tua tabella: valorizziamo a spec minimale
      categoria: null,                 // opzionale: puoi mettere il nome categoria se lo vuoi duplicare
      descrizione: description || null,
      importo: amount,
      // campi data duplicati presenti nello schema:
      spent_date: spent_at || null,
      date: spent_at ? `${spent_at} 00:00:00` : null,
      // NOTA: trigger AFTER INSERT già gestiscono inventory/list, non tocchiamo altro
    });
  }
  return out;
}

// ---- handler ----
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const {
      user_id,                 // obbligatorio
      category_id = null,      // opzionale (es. id "casa")
      store = '',              // store_name
      purchaseDate = '',       // YYYY-MM-DD preferito
      items = [],
      payment_method = 'cash', // 'cash' | 'card' | ecc. (coerente col tuo enum)
      card_label = null        // es. "Visa", "Revolut", ecc.
    } = req.body || {};

    if (!user_id) {
      return res.status(400).json({ ok: false, error: 'user_id obbligatorio' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'items deve essere un array non vuoto' });
    }

    const spent_at = toDate(purchaseDate) || todayISO();
    const rows = mapItemsToFinancesRows({
      user_id,
      category_id,
      store_name: (store || '').trim() || null,
      spent_at,
      payment_method,
      card_label,
      items
    });

    // Upsert sulla unique naturale: user_id, category_id, spent_at, description, amount, qty
    const { error } = await admin
      .from('finances')
      .upsert(rows, {
        onConflict: 'user_id,category_id,spent_at,description,amount,qty',
        ignoreDuplicates: false,
        defaultToNull: true
      });

    if (error) {
      console.error('[finances/ingest] upsert error:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, count: rows.length });
  } catch (e) {
    console.error('[finances/ingest] fatal error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
}
