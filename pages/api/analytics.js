// pages/api/analytics.js 
import { classifyQuery } from '../../lib/brainQuery';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

const fmtEUR = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
});

function ensureRange({ date_from, date_to }) {
  if (date_from && date_to) return { date_from, date_to };
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { date_from: from.toISOString(), date_to: to.toISOString() };
}

function pickKey(row, candidates) {
  const keys = Object.keys(row || {});
  const lower = keys.map((k) => k.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx >= 0) return keys[idx];
  }
  // fallback per pattern
  const patterns = candidates.map((c) => new RegExp(c.replace(/_/g, '[ _]?'), 'i'));
  for (const k of keys) if (patterns.some((rx) => rx.test(k))) return k;
  return null;
}

async function tryFetchAnyTable(limit = 1000) {
  if (!supabase) return { table: null, rows: [] };
  const candidates = [
    'expenses',
    'spese',
    'expense_items',
    'transactions',
    'movements',
    'uscite',
    'entries',
    'registrazioni',
    'costs',
  ];
  for (const table of candidates) {
    const { data, error } = await supabase.from(table).select('*').limit(limit);
    if (!error && Array.isArray(data)) {
      // anche se vuoto, è una tabella valida
      return { table, rows: data };
    }
  }
  return { table: null, rows: [] };
}

function computeTotals(rows, range, categoryRegex) {
  if (!rows || rows.length === 0) {
    return { total: 0, count: 0, usedKeys: {} };
  }

  const sample = rows[0];
  const amountKey = pickKey(sample, [
    'amount',
    'importo',
    'value',
    'valore',
    'total',
    'totale',
    'price',
    'prezzo',
    'costo',
    'sum',
  ]);
  const dateKey = pickKey(sample, [
    'date',
    'data',
    'created_at',
    'timestamp',
    'ts',
    'when',
  ]);
  const categoryKey = pickKey(sample, ['category', 'categoria', 'type', 'tipo', 'tag']);
  const merchantKey = pickKey(sample, [
    'merchant',
    'fornitore',
    'payee',
    'negozio',
    'store',
    'supplier',
  ]);

  const from = new Date(range.date_from).getTime();
  const to = new Date(range.date_to).getTime();

  let total = 0;
  let count = 0;

  for (const r of rows) {
    if (!amountKey) continue;

    const raw = r[amountKey];
    const amt =
      typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
    if (!Number.isFinite(amt)) continue;

    if (dateKey) {
      const t = new Date(r[dateKey]).getTime();
      if (Number.isFinite(t) && (t < from || t > to)) continue;
    }

    if (categoryRegex) {
      const vals = [];
      if (categoryKey && r[categoryKey] != null) vals.push(String(r[categoryKey]));
      if (merchantKey && r[merchantKey] != null) vals.push(String(r[merchantKey]));
      const text = vals.join(' ').toLowerCase();
      if (!categoryRegex.test(text)) continue;
    }

    total += amt;
    count += 1;
  }

  return { total, count, usedKeys: { amountKey, dateKey, categoryKey, merchantKey } };
}

export default async function handler(req, res) {
  // Preflight CORS (se mai servisse)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const { utterance = '', classification: clientClass, date_from, date_to } =
      req.body || {};
    const classification = clientClass || classifyQuery(utterance || '');
    const range = ensureRange({ date_from, date_to });

    const intent = classification?.intent || 'finances.echo';
    const category = classification?.filters?.category || null;

    let categoryRegex = null;
    if (intent === 'finances.category_total') {
      if (category === 'bollette') {
        categoryRegex = /(bollett|utenze|luce|gas|internet|telefono|acqua)/i;
      } else if (category) {
        const safe = String(category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        categoryRegex = new RegExp(safe, 'i');
      }
    }

    // Prova DB, altrimenti rispondi in "mock"
    let mode = 'mock';
    let table = null;
    let rows = [];
    let totals = { total: 0, count: 0, usedKeys: {} };

    if (supabase) {
      const found = await tryFetchAnyTable();
      table = found.table;
      rows = found.rows;
      if (table) {
        totals = computeTotals(rows, range, categoryRegex);
        mode = 'db';
      } else {
        mode = 'mock';
      }
    }

    const base =
      intent === 'finances.category_total'
        ? `Hai speso ${fmtEUR.format(totals.total)} per ${category || 'la categoria richiesta'} nel periodo.`
        : intent === 'finances.total'
        ? `La spesa totale nel periodo è ${fmtEUR.format(totals.total)}.`
        : `Totale nel periodo: ${fmtEUR.format(totals.total)}.`;

    const note =
      mode === 'db'
        ? ''
        : ` (Nota: risultato ${
            supabase
              ? 'vuoto perché non ho trovato una tabella/colonne compatibili'
              : 'di esempio: Supabase non è configurato nelle variabili d’ambiente'
          }).`;

    return res.status(200).json({
      ok: true,
      answer: base + note,
      intent,
      input: utterance,
      period: range,
      category: category || null,
      totals: {
        amount: totals.total,
        formatted: fmtEUR.format(totals.total),
        count: totals.count,
      },
      source: {
        mode, // 'db' | 'mock'
        table,
        usedKeys: totals.usedKeys,
        supabaseConfigured: Boolean(supabase),
      },
    });
  } catch (err) {
    console.error('[analytics] error:', err);
    // Rispondiamo comunque 200 per non bloccare la UI
    return res.status(200).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
}
