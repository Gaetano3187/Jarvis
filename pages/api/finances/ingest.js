/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/api/finances/ingest.js
export const config = { api: { bodyParser: true }, runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

/** UUID categoria "casa" */
const CATEGORY_ID_CASA = '4cfaac74-aab4-4d96-b335-6cc64de59afc';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const admin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { 'x-application-name': 'jarvis-assistant/finances-ingest' } },
      })
    : null;

// ——— CORS ———
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
    const d = String(m[1]).padStart(2, '0'), M = String(m[2]).padStart(2, '0');
    let y = String(m[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  return null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const isUUID = (s) =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

function coerceItemsArray(body) {
  // Accetta sia body.items che body.purchases
  const arr = Array.isArray(body?.items) ? body.items : (Array.isArray(body?.purchases) ? body.purchases : []);
  return Array.isArray(arr) ? arr : [];
}

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
  for (const p of items) {
    const name = (p?.name || '').trim();
    if (!name) continue;

    const brand = (p?.brand || '').trim();
    const packs = toNum(p?.packs) ?? toNum(p?.qty) ?? 1; // qty fallback
    const upp = toNum(p?.unitsPerPack) ?? 1;

    // qty complessivo = confezioni * unità/conf (se noti)
    const qty = Math.max(1, Number((packs || 1) * (upp || 1)));

    const priceTotal = toNum(p?.priceTotal);
    const priceEach = toNum(p?.priceEach);
    const amount =
      priceTotal != null ? priceTotal
      : priceEach != null ? Number((priceEach * qty).toFixed(2))
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
      product_id: isUUID(p?.product_id) ? p.product_id : null,

      // colonne alias (se presenti nello schema)
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
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    if (!admin) {
      return res.status(500).json({ ok: false, error: 'Supabase env vars mancanti' });
    }

    const body = req.body || {};
    const {
      user_id,
      category_id: rawCategory = null,
      store = '',
      purchaseDate = '',
      payment_method: rawPM = 'cash',
      card_label = null,
      currency = 'EUR',
      total_amount = null, // opzionale, non usato direttamente ora
    } = body;

    if (!user_id) return res.status(400).json({ ok: false, error: 'user_id obbligatorio' });

    // Prendi items o purchases
    const items = coerceItemsArray(body);
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'items deve essere un array non vuoto' });
    }

    // payment method
    const ALLOWED_PM = new Set(['cash', 'card', 'bank', 'other']);
    const payment_method = ALLOWED_PM.has(String(rawPM || '').toLowerCase())
      ? String(rawPM).toLowerCase()
      : 'cash';

    // category_id: forza a "casa" se non valido o mancante
    let category_id = isUUID(rawCategory) ? rawCategory : CATEGORY_ID_CASA;

    // (opzionale) verifica che la categoria esista; se no, rimetti "casa"
    if (category_id && category_id !== CATEGORY_ID_CASA) {
      const { data: cat, error: catErr } = await admin
        .from('finance_categories')
        .select('id')
        .eq('id', category_id)
        .maybeSingle();
      if (catErr || !cat) category_id = CATEGORY_ID_CASA;
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

    // normalizzazioni ultime
    for (const r of rows) {
      if (r.amount == null || Number.isNaN(r.amount)) r.amount = 0;
      if (r.qty == null || Number.isNaN(r.qty) || r.qty <= 0) r.qty = 1;
      if (!r.currency) r.currency = currency || 'EUR';
    }

    // 🧩 upsert con ritorno id reali
    const { data, error } = await admin
      .from('finances')
      .upsert(rows, {
        // chiave di conflitto realistica per “movimenti”:
        onConflict: 'user_id,category_id,spent_at,description',
        ignoreDuplicates: false,
        defaultToNull: true,
      })
      .select('id');

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message || 'DB error',
        code: error.code || null,
        details: error.details || null,
        hint: error.hint || null,
      });
    }

    const saved = Array.isArray(data) ? data.length : 0;
    return res.status(200).json({
      ok: true,
      saved,
      insertedIds: Array.isArray(data) ? data.map((r) => r.id) : [],
      category_id, // utile per il client
    });
  } catch (e) {
    console.error('[finances/ingest] fatal', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
}
