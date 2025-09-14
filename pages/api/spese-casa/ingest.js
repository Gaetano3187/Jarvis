// pages/api/spese-casa/ingest.js
import { supabase } from '@/lib/supabaseClient';

const TBL_SPESA = 'jarvis_spese_casa';

function toNum(n) { const v = Number(n); return Number.isFinite(v) ? v : 0; }
function isoDate(s) {
  if (!s) return new Date().toISOString().slice(0,10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? new Date().toISOString().slice(0,10) : d.toISOString().slice(0,10);
}

function normalizeLine(it) {
  const packs = Math.max(1, toNum(it.packs ?? it.qty ?? 1));
  const upp   = Math.max(1, toNum(it.unitsPerPack ?? 1));
  const totalUnits = packs * upp;

  let priceEach  = toNum(it.priceEach);
  let priceTotal = toNum(it.priceTotal);

  if (totalUnits <= 1) {
    // singola unità: il letto vale sia unitario che totale
    const val = priceEach || priceTotal;
    priceEach = val;
    priceTotal = val;
  } else {
    if (priceEach) {
      priceTotal = Number((priceEach * totalUnits).toFixed(2));
    } else {
      // ho solo il totale: ricavo l'unitario
      priceEach = totalUnits ? Number((priceTotal / totalUnits).toFixed(4)) : 0;
    }
  }

  return {
    name: (it.name || '').trim(),
    brand: (it.brand || '').trim() || null,
    packs,
    units_per_pack: upp,
    unit_label: (it.unitLabel || it.uom || 'unità'),
    price_each: priceEach,
    price_total: priceTotal,
    currency: it.currency || 'EUR',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });

  try {
    const {
      user_id,
      store = '',
      purchaseDate,
      totalPaid = 0,
      items = [],
      receiptTotalAuthoritative = false,
    } = req.body || {};

    if (!user_id) return res.status(400).json({ ok:false, error:'Missing user_id' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ ok:false, error:'No items' });

    const storeLabel = String(store || '').trim();
    const day = isoDate(purchaseDate);

    // Normalizza tutte le righe
    const lines = items
      .map(normalizeLine)
      .filter(r => r.name); // scarta nomi vuoti

    // Controlla se per lo stesso gruppo (user+store+data) esiste già un doc_total
    const { data: existing, error: selErr } = await supabase
      .from(TBL_SPESA)
      .select('id, doc_total')
      .eq('user_id', user_id)
      .eq('store', storeLabel)
      .eq('purchase_date', day)
      .limit(1000);

    if (selErr) throw selErr;

    const groupHasDoc = (existing || []).some(r => toNum(r.doc_total) > 0);
    const docForFirst = (!groupHasDoc && (receiptTotalAuthoritative && toNum(totalPaid) > 0))
      ? Number(toNum(totalPaid).toFixed(2))
      : 0;

    // Prepara batch insert: prima riga con doc_total (se dovuto), le altre 0
    const rows = lines.map((r, idx) => ({
      user_id,
      store: storeLabel || null,
      purchase_date: day,
      doc_total: idx === 0 ? docForFirst : 0,
      ...r,
    }));

    const { error: insErr } = await supabase.from(TBL_SPESA).insert(rows);
    if (insErr) throw insErr;

    return res.status(200).json({
      ok: true,
      inserted: rows.length,
      doc_total_applied: docForFirst,
      group: { store: storeLabel, date: day }
    });
  } catch (e) {
    console.error('[spese-casa/ingest]', e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
