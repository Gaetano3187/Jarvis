// lib/brainQuery.js
// Interpreta domande ITA e chiama /api/finances/analytics

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
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

function parsePeriod(text) {
  const t = text.toLowerCase();
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
      end: endD.toISOString().slice(0, 10)
    };
  }
  if (/\bquest[oa]?\s*mes/.test(t)) return monthBounds();
  if (/\bquest[oa]?\s*ann/.test(t)) return yearBounds();

  // date esplicite
  const m1 = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m1) return { start: `${m1[1]}-${m1[2]}-${m1[3]}`, end: `${m1[1]}-${m1[2]}-${m1[3]}` };
  const m2 = t.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (m2) {
    const dd = m2[1].padStart(2, '0');
    const mm = m2[2].padStart(2, '0');
    const yyyy = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return { start: `${yyyy}-${mm}-${dd}`, end: `${yyyy}-${mm}-${dd}` };
  }
  return null;
}

function extractProduct(text) {
  const t = text.replace(/["'“”]/g, '').toLowerCase();
  const m = t.match(/\b(?:di|del|della|dello|dei|degli|delle|il|la|lo|i|gli|le)\s+(.+)/);
  if (m) return m[1].trim();
  const m2 = t.match(/\b(?:per|su)\s+(.+)/);
  if (m2) return m2[1].trim();
  return t.trim();
}

export function classifyQuery(text) {
  const original = String(text || '').trim();
  const low = original.toLowerCase();
  const period = parsePeriod(low);

  // INVENTORY / SCORTE
  if (/cosa\s+manca\b|in\s+esauriment|da\s+comprare|devo\s+comprare|consigli\s+di\s+acquisto/.test(low)) {
    return { domain: 'inventory', action: 'shopping_recommendations', filters: { raw: original } };
  }
  if (/\besaurit[oi]\b/.test(low)) {
    return { domain: 'inventory', action: 'out_of_stock', filters: { raw: original] } }; // <-- NO! fixed below
  }
  // ^^^ RIGA SOPRA ERA IL PROBLEMA TIPICO (parentesi quadra errata). RIMOSSO NEL BLOCCO CORRETTO SOTTO.
}
