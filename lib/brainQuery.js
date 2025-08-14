// lib/brainQuery.js
// Interpreta domande in ITA → { domain, action, filters } e chiama /api/finances/analytics
// Copre: finanze (quanto ho speso ...), scorte (cosa manca? in esaurimento?),
// liste (mostra/aggiungi/rimuovi ...), prezzo minimo, trend, ultimo acquisto, ecc.

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function addDays(baseISO, delta) {
  const d = new Date(baseISO); d.setDate(d.getDate()+delta);
  return d.toISOString().slice(0,10);
}
function monthBounds(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0,10);
  const end = new Date(Date.UTC(y, m+1, 0)).toISOString().slice(0,10);
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
  if (/\bquest[oa]?\s*settiman/.test(t)) {
    // lun → dom della settimana corrente (semplice: 7 giorni da oggi retro)
    const today = new Date();
    const day = (today.getDay()+6)%7; // lun=0
    const startD = new Date(today); startD.setDate(today.getDate() - day);
    const endD = new Date(startD);  endD.setDate(startD.getDate() + 6);
    return { start: startD.toISOString().slice(0,10), end: endD.toISOString().slice(0,10) };
  }
  if (/\bquest[oa]?\s*mes/.test(t)) {
    return monthBounds();
  }
  if (/\bquest[oa]?\s*ann/.test(t)) {
    return yearBounds();
  }
  // dd/mm/yyyy o yyyy-mm-dd in domanda
  const m1 = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m1) return { start: `${m1[1]}-${m1[2]}-${m1[3]}`, end: `${m1[1]}-${m1[2]}-${m1[3]}` };
  const m2 = t.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (m2) {
    const dd = m2[1].padStart(2,'0'), mm = m2[2].padStart(2,'0');
    const yyyy = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return { start: `${yyyy}-${mm}-${dd}`, end: `${yyyy}-${mm}-${dd}` };
  }
  return null; // senza periodo → lo gestisce l’endpoint
}

function extractProduct(text) {
  const t = text.replace(/["“”']/g,'').toLowerCase();
  // prendi parole dopo "del|della|di|il|la|lo|i|gli|le|su"
  const m = t.match(/\b(?:di|del|della|dello|dei|degli|delle|il|la|lo|i|gli|le)\s+(.+)/);
  if (m) return m[1].trim();
  // fallback: dopo “per” o “su”
  const m2 = t.match(/\b(?:per|su)\s+(.+)/);
  if (m2) return m2[1].trim();
  return t.trim();
}

export function classifyQuery(text) {
  const t = String(text || '').trim();
  const low = t.toLowerCase();

  const period = parsePeriod(low);

  // ====== INVENTORY / SCORTE ======
  if (/cosa\s+manca\b|in\s+esauriment|da\s+comprare|cosa\s+devo\s+comprare|consigli\s+di\s+acquisto/.test(low)) {
    return { domain: 'inventory', action: 'shopping_recommendations', filters: { raw: t } };
  }
  if (/esaurit[oi]\b/.test(low)) {
    return { domain: 'inventory', action: 'out_of_stock', filters: { raw: t } };
  }
  if (/in\s+scadenz|prossim[ea]\s+scadenz/.test(low)) {
    return { domain: 'inventory', action: 'near_expiry', filters: { raw: t } };
  }
  if (/quanta\s+scorta|quanta\s+ne\s+ho|stato\s+scorta|residuo/.test(low)) {
    return { domain: 'inventory', action: 'stock_status', filters: { product: extractProduct(low), raw: t } };
  }
  if (/consumo\s+medio/.test(low)) {
    return { domain: 'inventory', action: 'consumption_rate', filters: { product: extractProduct(low), raw: t } };
  }
  if (/quando\s+finir[aà]|data\s+esauriment/.test(low)) {
    return { domain: 'inventory', action: 'runout_eta', filters: { product: extractProduct(low), raw: t } };
  }

  // ====== LISTE ======
  if (/mostra\s+lista\b|\belenco\s+lista\b/.test(low)) {
    const type = /online/.test(low) ? 'online' : 'supermercato';
    return { domain: 'lists', action: 'show_list', filters: { list_type: type, raw: t } };
  }
  if (/(aggiungi|metti|inserisci)\b/.test(low) && /lista/.test(low)) {
    const type = /online/.test(low) ? 'online' : 'supermercato';
    // prodotto: parole tra "aggiungi" e "alla/a/alla lista"
    const m = low.match(/(?:aggiungi|metti|inserisci)\s+(.+?)\s+(?:alla|alla\s+lista|a\s+lista|in\s+lista|alla\s+lista)/);
    const product = (m?.[1] || low.replace(/.*(?:aggiungi|metti|inserisci)\s+/, '').replace(/\s+alla.*$/, '')).trim();
    return { domain: 'lists', action: 'add_to_list', filters: { list_type: type, product, raw: t } };
  }
  if (/(rimuovi|togli|elimina)\b/.test(low) && /lista/.test(low)) {
    const type = /online/.test(low) ? 'online' : 'supermercato';
    const product = low.replace(/.*(?:rimuovi|togli|elimina)\s+/, '').replace(/\s+da.*$/, '').trim();
    return { domain: 'lists', action: 'remove_from_list', filters: { list_type: type, product, raw: t } };
  }

  // ====== FINANZE ======
  if (/quanto\s+ho\s+spes[oa]/.test(low) || /\bspesa\s+totale\b/.test(low)) {
    return { domain: 'finances', action: 'total_spent', filters: { period, raw: t } };
  }
  if (/categoria\b|spese\s+casa|vestiti|cene\s+e\s+aperitivi/.test(low) && /dettaglio|quanto|spes[oa]/.test(low)) {
    // individua categoria per nome
    let cat = null;
    if (/spese\s+casa/.test(low)) cat = 'spese casa';
    else if (/vestiti/.test(low)) cat = 'vestiti';
    else if (/cene\s+e\s+aperitivi/.test(low)) cat = 'cene e aperitivi';
    if (/dettaglio|lista|elenco/.test(low)) {
      return { domain: 'finances', action: 'category_breakdown', filters: { category: cat, period, raw: t } };
    }
    return { domain: 'finances', action: 'category_total', filters: { category: cat, period, raw: t } };
  }
  if (/qual[i]?\s+prodott[i]?\s+ho\s+comprat[oi]/.test(low)) {
    return { domain: 'finances', action: 'products_purchased', filters: { period, raw: t } };
  }
  if (/prezzo\s+pi[uù]\s+bass|dove\s+l[’']?ho\s+pagat[oa]\s+di\s+meno/.test(low)) {
    return { domain: 'finances', action: 'cheapest_merchant', filters: { product: extractProduct(low), period, raw: t } };
  }
  if (/trend\s+prezz|andamento\s+prezz/.test(low)) {
    return { domain: 'finances', action: 'pric
