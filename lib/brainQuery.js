// lib/brainQuery.js — versione compatibile con parser TS/ESLint

function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDays(baseISO, delta) {
  const d = new Date(baseISO);
  d.setDate(d.getDate() + delta);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function monthBounds(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function yearBounds(date = new Date()) {
  const y = date.getFullYear();
  return { start: y + '-01-01', end: y + '-12-31' };
}

function parsePeriod(text) {
  const t = String(text || '').toLowerCase();

  if (/\boggi\b/.test(t)) {
    const d = todayISO();
    return { start: d, end: d };
  }
  if (/\bier[oi]\b/.test(t)) {
    const d = addDays(todayISO(), -1);
    return { start: d, end: d };
  }
  if (/\bquesta?\s*settiman/.test(t)) {
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // lun=0
    const startD = new Date(today);
    startD.setDate(today.getDate() - dow);
    const endD = new Date(startD);
    endD.setDate(startD.getDate() + 6);
    return {
      start: startD.toISOString().slice(0, 10),
      end: endD.toISOString().slice(0, 10),
    };
  }
  if (/\bquest[oa]?\s*mes/.test(t)) return monthBounds();
  if (/\bquest[oa]?\s*ann/.test(t)) return yearBounds();

  // YYYY-MM-DD
  const m1 = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m1) {
    return { start: m1[1] + '-' + m1[2] + '-' + m1[3], end: m1[1] + '-' + m1[2] + '-' + m1[3] };
  }

  // DD/MM/YYYY (anche varianti con - .)
  const m2 = t.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (m2) {
    const dd = m2[1].padStart(2, '0');
    const mm = m2[2].padStart(2, '0');
    const yyyy = m2[3].length === 2 ? '20' + m2[3] : m2[3];
    return { start: yyyy + '-' + mm + '-' + dd, end: yyyy + '-' + mm + '-' + dd };
  }

  return null;
}

function extractProduct(text) {
  const t = String(text || '').replace(/["'“”]/g, '').toLowerCase();
  let m = t.match(/\b(?:di|del|della|dello|dei|degli|delle|il|la|lo|i|gli|le)\s+(.+)/);
  if (m && m[1]) return m[1].trim();
  m = t.match(/\b(?:per|su)\s+(.+)/);
  if (m && m[1]) return m[1].trim();
  return t.trim();
}

export function classifyQuery(text) {
  const original = String(text || '').trim();
  const low = original.toLowerCase();
  const period = parsePeriod(low);

  // INVENTARIO / SCORTE
  if (/cosa\s+manca\b|in\s+esauriment|da\s+comprare|devo\s+comprare|consigli\s+di\s+acquisto/.test(low)) {
    return { domain: 'inventory', action: 'shopping_recommendations', filters: { raw: original } };
  }
  if (/\besaurit[oi]\b/.test(low)) {
    return { domain: 'inventory', action: 'out_of_stock', filters: { raw: original } };
  }
  if (/in\s+scadenz|prossim[ea]\s+scadenz/.test(low)) {
    return { domain: 'inventory', action: 'near_expiry', filters: { raw: original } };
  }
  if (/quanta\s+scorta|quanta\s+ne\s+ho|stato\s+scorta|residuo/.test(low)) {
    return { domain: 'inventory', action: 'stock_status', filters: { product: extractProduct(low), raw: original } };
  }
  if (/consumo\s+medio/.test(low)) {
    return { domain: 'inventory', action: 'consumption_rate', filters: { product: extractProduct(low), raw: original } };
  }
  if (/quando\s+finira|data\s+esauriment/.test(low)) {
    return { domain: 'inventory', action: 'runout_eta', filters: { product: extractProduct(low), raw: original } };
  }

  // LISTE
  if (/mostra\s+lista\b|\belenco\s+lista\b/.test(low)) {
    const type = /online/.test(low) ? 'online' : 'supermercato';
    return { domain: 'lists', action: 'show_list', filters: { list_type: type, raw: original } };
  }
  if (/(aggiungi|metti|inserisci)\b/.test(low) && /lista/.test(low)) {
    const type = /online/.test(low) ? 'online' : 'supermercato';
    const m = low.match(/(?:aggiungi|metti|inserisci)\s+(.+?)\s+(?:alla|a|in)\s+lista/);
    const prodPart = m && m[1] ? m[1] : low.replace(/.*(?:aggiungi|metti|inserisci)\s+/, '').replace(/\s+alla?.*$/, '');
    const product = prodPart.trim();
    return { domain: 'lists', action: 'add_to_list', filters: { list_type: type, product, raw: original } };
  }
  if (/(rimuovi|togli|elimina)\b/.test(low) && /lista/.test(low)) {
    const type = /online/.test(low) ? 'online' : 'supermercato';
    const product = low.replace(/.*(?:rimuovi|togli|elimina)\s+/, '').replace(/\s+da.*$/, '').trim();
    return { domain: 'lists', action: 'remove_from_list', filters: { list_type: type, product, raw: original } };
  }

  // FINANZE
  if (/quanto\s+ho\s+spes[oa]|\bspesa\s+totale\b/.test(low)) {
    return { domain: 'finances', action: 'total_spent', filters: { period, raw: original } };
  }
  if (/(categoria|spese\s+casa|vestiti|cene\s+e\s+aperitivi)/.test(low) && /(dettaglio|quanto|spes[oa]|totale|lista|elenco)/.test(low)) {
    let cat = null;
    if (/spese\s+casa/.test(low)) cat = 'spese casa';
    else if (/vestiti/.test(low)) cat = 'vestiti';
    else if (/cene\s+e\s+aperitivi/.test(low)) cat = 'cene e aperitivi';

    if (/dettaglio|lista|elenco/.test(low)) {
      return { domain: 'finances', action: 'category_breakdown', filters: { category: cat, period, raw: original } };
    }
    return { domain: 'finances', action: 'category_total', filters: { category: cat, period, raw: original } };
  }
  if (/quali\s+prodott[iy]?\s+ho\s+comprat[oi]/.test(low)) {
    return { domain: 'finances', action: 'products_purchased', filters: { period, raw: original } };
  }
  if (/prezzo\s+piu\s+bass|dove\s+l'?ho\s+pagat[oa]\s+di\s+meno/.test(low)) {
    return { domain: 'finances', action: 'cheapest_merchant', filters: { product: extractProduct(low), period, raw: original } };
  }
  if (/trend\s+prezz|andamento\s+prezz/.test(low)) {
    return { domain: 'finances', action: 'price_trend', filters: { product: extractProduct(low), raw: original } };
  }
  if (/ultimo\s+acquisto/.test(low)) {
    return { domain: 'finances', action: 'last_purchase', filters: { product: extractProduct(low), raw: original } };
  }

  // fallback
  return { domain: 'finances', action: 'total_spent', filters: { period, raw: original } };
}

export async function runQueryFromText(text) {
  const q = classifyQuery(text);
  try {
    const res = await fetch('/api/finances/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...q, utterance: text }),
    });
    if (!res.ok) throw new Error('Analytics HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return { ok: false, result: null, debug: q, error: msg };
  }
}
