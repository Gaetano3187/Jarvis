// lib/financeSummary.js
import { supabase } from '@/lib/supabaseClient';

const PAYDAY_DAY = 10;
const CATEGORY_ID_VARIE = '075ce548-15a9-467c-afc8-8b156064eeb6';

function isoLocal(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}
export function computeCurrentPayPeriod(today = new Date(), paydayDay = PAYDAY_DAY) {
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  const thisPayday = new Date(y, m, paydayDay);
  let start, end;
  if (d >= paydayDay) { start = thisPayday; end = new Date(y, m + 1, paydayDay - 1); }
  else { start = new Date(y, m - 1, paydayDay); end = new Date(y, m, paydayDay - 1); }
  const startDate = isoLocal(start);
  const endDate = isoLocal(end);
  const monthKey = endDate.slice(0, 7);
  return { startDate, endDate, monthKey };
}
function parseAmountLoose(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calcola tutti i numeri che ti servono ovunque (pagina & chat).
 * Se passi hideVarieCashAfterClear=true, esclude le spese cash della categoria VARIE dal saldo “Soldi in tasca”.
 */
export async function getFinanceSummary({ hideVarieCashAfterClear = false } = {}) {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error('Sessione scaduta');

  const { startDate, endDate, monthKey } = computeCurrentPayPeriod(new Date(), PAYDAY_DAY);
  const dateStartTS = `${startDate}T00:00:00`;
  const dateEndTS   = `${endDate}T23:59:59`;

  // --- Entrate del periodo
  const { data: inc, error: incErr } = await supabase
    .from('incomes')
    .select('amount, received_at, received_date')
    .eq('user_id', user.id)
    .or(
      `and(received_date.gte.${startDate},received_date.lte.${endDate}),` +
      `and(received_at.gte.${dateStartTS},received_at.lte.${dateEndTS})`
    );
  if (incErr) throw incErr;
  const entratePeriodo = (inc || []).reduce((t, r) => t + parseAmountLoose(r.amount), 0);

  // --- Carryover mese
  const { data: co, error: coErr } = await supabase
    .from('carryovers')
    .select('amount')
    .eq('user_id', user.id)
    .eq('month_key', monthKey)
    .maybeSingle();
  if (coErr) throw coErr;
  const carryAmount = parseAmountLoose(co?.amount || 0);

  // --- Movimenti contanti manuali (pocket_cash)
  const { data: pc, error: pcErr } = await supabase
    .from('pocket_cash')
    .select('delta, amount, direction, moved_at, moved_date, note')
    .eq('user_id', user.id)
    .or(
      `and(moved_date.gte.${startDate},moved_date.lte.${endDate}),` +
      `and(moved_at.gte.${dateStartTS},moved_at.lte.${dateEndTS})`
    );
  if (pcErr) throw pcErr;
  const pocketManualRows = (pc || []).map((row) => {
    const eff = (row.delta != null)
      ? parseAmountLoose(row.delta)
      : (row.amount != null ? (row.direction === 'in' ? 1 : -1) * parseAmountLoose(row.amount) : 0);
    return { amount: eff };
  });

  // --- Spese cash provenienti da finances
  const { data: finAll, error: finAllErr } = await supabase
    .from('finances')
    .select('id, description, amount, spent_at, spent_date, category_id, payment_method')
    .eq('user_id', user.id)
    .or(
      `and(spent_date.gte.${startDate},spent_date.lte.${endDate}),` +
      `and(spent_at.gte.${dateStartTS},spent_at.lte.${dateEndTS})`
    );
  if (finAllErr) throw finAllErr;

  const ELECTRONIC_TOKENS = [
    'carta','carta di credito','credito','debito','pos','visa','mastercard','amex',
    'paypal','iban','bonifico','satispay','apple pay','google pay'
  ];
  const isElectronicByText = (desc) => {
    const t = String(desc || '').toLowerCase();
    return ELECTRONIC_TOKENS.some(k => t.includes(k));
  };
  const isCashByFields = (row) => {
    const pm = String(row.payment_method || '').toLowerCase();
    if (pm === 'cash' || pm === 'contanti') return true;
    if (pm && pm !== 'cash' && pm !== 'contanti') return false;
    return !isElectronicByText(row.description);
  };

  let cashRows = (finAll || []).filter(isCashByFields).map(f => ({
    amount: -Math.abs(parseAmountLoose(f.amount)),
    category_id: f.category_id,
  }));
  if (hideVarieCashAfterClear) {
    cashRows = cashRows.filter(r => r.category_id !== CATEGORY_ID_VARIE);
  }

  // --- Aggregati
  const pocketRows = [...pocketManualRows, ...cashRows];
  const pocketBalance = pocketRows.reduce((t, r) => t + (r.amount || 0), 0);
  const prelieviContanti = pocketManualRows
    .filter(r => r.amount > 0)
    .reduce((t, r) => t + r.amount, 0);

  const saldoDisponibile = Math.max(0, entratePeriodo + carryAmount - prelieviContanti);

  return {
    period: { startDate, endDate, monthKey },
    entratePeriodo,
    carryAmount,
    prelieviContanti,
    pocketBalance,
    saldoDisponibile,
  };
}
