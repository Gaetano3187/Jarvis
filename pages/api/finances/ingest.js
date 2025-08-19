/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/finances/ingest.js
export const config = { api: { bodyParser: true }, runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY; // <- fallback al tuo nome variabile

const admin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { 'x-application-name': 'jarvis-assistant/finances-ingest' },
        },
      })
    : null;

// ——— CORS helper ———
function setCors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const toDate = (s) => {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const d = String(m[1]).padStart(2, '0'),
      M = String(m[2]).padStart(2, '0');
    let y = String(m[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  return null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const isUUID = (s) =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );

function mapItemsToRows({
  user_id,
  category_id,
  store_name,
  spent_at,
  payment_method,
  card_label,
  items,
}) {
  const out = [];
  for (const p of Array.isArray(items) ? items : []) {
    const name = (p?.name || '').trim();
    const brand = (p?.brand || '').trim();
    const packs = toNum(p?.packs) ?? 0;
    const upp = toNum(p?.unitsPerPack) ?? 0;

    let qty = 1;
    if (packs && upp) qty = packs * upp;
    else if (packs) qty = packs;
    else if (upp) qty = upp;

    const priceTotal = toNum(p?.priceTotal);
    const priceEach = toNum(p?.priceEach);
    const amount =
      priceTotal != null
        ? priceTotal
        : priceEach != null && qty != null
        ? Number((priceEach * qty).toFixed(2))
        : 0;

    const currency = (p?.currency || 'EUR').trim() || 'EUR';
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
      payment_method: payment_method || 'cash',
      card_label: card_label || null,
      product_id: p?.product_id || null,

      // colonne duplicate del tuo schema
      categoria: null,
      descrizione: description || null,
      importo: amount,
      spent_date: spent_at || null,
      date: spent_at ? `${spent_at} 00:00:00` : null,
    });
  }
  return out;
}

export default async function handler(req, res) {
  // CORS per tutte le richieste
  setCors(res, req.headers.origin);

  // Preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res
      .status(405)
      .json({ ok: false, error: 'Method Not Allowed', method: req.method });
  }

  try {
    if (!admin) {
      return res
        .status(500)
        .json({ ok: false, error: 'Supabase env vars mancanti' });
    }

    const {
      user_id,
      category_id: rawCategoryId = null,
      store = '',
      purchaseDate = '',
      items = [],
      payment_method: rawPM = 'cash',
      card_label = null,
    } = req.body || {};

    if (!user_id)
      return res
        .status(400)
        .json({ ok: false, error: 'user_id obbligatorio' });
    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: 'items deve essere un array non vuoto' });
    }

    // enum payment_method: limitiamo ai valori noti
    const ALLOWED_PM = new Set(['cash', 'card', 'bank', 'other']);
    const payment_method = ALLOWED_PM.has(String(rawPM || '').toLowerCase())
      ? String(rawPM).toLowerCase()
      : 'cash';

    // verifica FK categoria: se non UUID o non esiste ⇒ null (evita errori 500)
    let category_id = isUUID(rawCategoryId) ? rawCategoryId : null;
    if (category_id) {
      const { data: cat, error: catErr } = await admin
        .from('finance_categories')
        .select('id')
        .eq('id', category_id)
        .maybeSingle();
      if (catErr || !cat) category_id = null;
    }

    const spent_at = toDate(purchaseDate) || todayISO();

    const rows = mapItemsToRows({
      user_id,
      category_id,
      store_name: (store || '').trim() || null,
      spent_at,
      payment_method,
      card_label,
      items,
    });

    // normalizzazioni finali
    for (const r of rows) {
      if (!isUUID(r.product_id)) r.product_id = null;
      if (r.amount == null || Number.isNaN(r.amount)) r.amount = 0;
      if (r.qty == null || Number.isNaN(r.qty)) r.qty = 1;
    }

    const { error } = await admin.from('finances').upsert(rows, {
      onConflict: 'user_id,category_id,spent_at,description,amount,qty',
      ignoreDuplicates: false,
      defaultToNull: true,
    });

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message || 'DB error',
        code: error.code || null,
        details: error.details || null,
        hint: error.hint || null,
      });
    }

    return res.status(200).json({ ok: true, count: rows.length });
  } catch (e) {
    console.error('[finances/ingest] fatal', e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || 'Server error' });
  }
}
