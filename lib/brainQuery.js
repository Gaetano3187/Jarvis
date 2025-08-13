// lib/brainQuery.js
// Parser robusto per interrogazioni su FINANZE + SCORTE/LISTE.
// Restituisce { action, domain?, filters } da inviare a /api/finances/analytics (unico endpoint).
// Il backend può usare "action" per instradare (es. azioni inventory vs finanze).

function norm(s='') {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/\s+/g,' ')
    .trim();
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parsePeriod(text) {
  const t = norm(text);
  const now = new Date();
  let start=null, end=null, granularity=null;

  if (/\boggi\b/.test(t)) { start=end=iso(now); granularity='day'; return {start,end,granularity}; }
  if (/\bieri\b/.test(t)) { const d=new Date(now); d.setDate(d.getDate()-1); start=end=iso(d); granularity='day'; return {start,end,granularity}; }
  if (/\bquesta?\s+settimana\b/.test(t)) {
    const d1 = new Date(now); const dow=(now.getDay()+6)%7; d1.setDate(now.getDate()-dow);
    const d2 = new Date(d1); d2.setDate(d1.getDate()+6);
    return { start: iso(d1), end: iso(d2), granularity:'week' };
  }
  if (/\bquesto\s+mese\b/.test(t)) {
    const d1=new Date(now.getFullYear(), now.getMonth(), 1);
    const d2=new Date(now.getFullYear(), now.getMonth()+1, 0);
    return { start: iso(d1), end: iso(d2), granularity:'month' };
  }
  if (/\bquest[oa]\s+ann[oi]\b/.test(t)) {
    const d1=new Date(now.getFullYear(),0,1), d2=new Date(now.getFullYear(),11,31);
    return { start: iso(d1), end: iso(d2), granularity:'year' };
  }
  // dd/mm/yyyy
  const mdy = t.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (mdy) {
    let [ , dd, mm, yy ] = mdy;
    if (yy.length===2) yy = (Number(yy)<50 ? '20':'19')+yy;
    const d = new Date(Number(yy), Number(mm)-1, Number(dd));
    return { start: iso(d), end: iso(d), granularity:'day' };
  }
  // mm/yyyy
  const my = t.match(/\b(\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (my) {
    let [ , mm, yy ] = my;
    if (yy.length===2) yy = (Number(yy)<50 ? '20':'19')+yy;
    const d1=new Date(Number(yy), Number(mm)-1, 1);
    const d2=new Date(Number(yy), Number(mm), 0);
    return { start: iso(d1), end: iso(d2), granularity:'month' };
  }
  return { start:null, end:null, granularity:null };
}

function extractProduct(text) {
  const t = norm(text);
  // prova dopo articoli / parole marker
  const m1 = t.match(/\b(?:il|lo|la|i|gli|le)\s+([a-z0-9\-\s\']{3,}?)(?:\s+dove|\s+quanto|\s+con|$)/i);
  if (m1) return m1[1].trim();
  // “di <prodotto>”
  const m2 = t.match(/\bdi\s+([a-z0-9\-\s\']{3,})/i);
  if (m2) return m2[1].trim();
  // parole chiave tipiche
  const m3 = t.match(/\b(latte|pane|pasta|prosciutto san daniele|prosciutto crudo|yogurt|biscotti|uova|mozzarella|tonno|riso|caffe|olio|zucchero|farina|acqua minerale)\b/);
  if (m3) return m3[1].trim();
  return null;
}

function detectListType(text) {
  const t = norm(text);
  if (/\bonline\b/.test(t)) return 'online';
  if (/\bsupermercat|spesa\b/.test(t)) return 'supermercato';
  return null;
}

/* ===== Classifier principale ===== */
export function classifyQuery(userText) {
  const t = norm(userText);
  const period = parsePeriod(t);

  /* ----------------- FINANZE ----------------- */
  // Totale speso
  if (/\bquanto\b.*\bspes[oa]\b|\bspesa totale\b/.test(t)) {
    return { domain:'finances', action:'total_spent', filters:{ period } };
  }
  // Prodotti comprati
  if (/\b(cosa|quali)\s+(ho\s+)?comprat[oaie]\b|\belenco prodotti\b/.test(t)) {
    return { domain:'finances', action:'products_purchased', filters:{ period } };
  }
  // Frequenza acquisto
  if (/\bfrequenza\b|\bquanto\s+spesso\b|\bogni\s+quanto\b/.test(t)) {
    return { domain:'finances', action:'purchase_frequency', filters:{ period, product: extractProduct(t) } };
  }
  // Dove ho pagato di meno / prezzo minimo
  if (/\b(dove|in quale negozio)\b.*\bpagat[oa].*\bmeno\b|\bprezzo\s+minimo\b/.test(t)) {
    return { domain:'finances', action:'cheapest_merchant', filters:{ period, product: extractProduct(t) } };
  }
  // Trend prezzo
  if (/\btrend\b.*\bprezz/i.test(t) || /\bprezzo\b.*\b(negli?|ultimi)\b/.test(t)) {
    return { domain:'finances', action:'price_trend', filters:{ product: extractProduct(t), period } };
  }
  // Ultimo acquisto
  if (/\bultim[oa]\s+acquisto\b|\bquando\b.*\bho\b.*\bcomprat[oa]\b/.test(t)) {
    return { domain:'finances', action:'last_purchase', filters:{ product: extractProduct(t) } };
  }
  // Categoria totale / dettaglio
  const catMap = {
    'spese casa': ['spese casa','supermercato','market','alimentari','spesa'],
    'vestiti': ['vestiti','abbigliamento','scarpe','boutique','outlet'],
    'cene e aperitivi': ['cene e aperitivi','ristorante','pizzeria','aperitivo','trattoria','osteria','bar'],
  };
  for (const cat in catMap) {
    if (catMap[cat].some(k=>t.includes(k))) {
      if (/\bquanto\b|\btotale\b|\bspes[oa]\b/.test(t)) {
        return { domain:'finances', action:'category_total', filters:{ period, category:cat } };
      }
      return { domain:'finances', action:'category_breakdown', filters:{ period, category:cat } };
    }
  }

  /* ----------------- SCORTE / INVENTORY ----------------- */
  // Cosa manca a casa / fuori scorta
  if (/\b(cosa\s+manca|cosa\s+devo\s+comprare|devo\s+comprare\?)\b/.test(t)) {
    return { domain:'inventory', action:'shopping_recommendations', filters:{
      low_stock_threshold: 0.2, days_to_expiry: 10, include_out_of_stock:true
    }};
  }
  if (/\b(manc[aai]|finito|esaurit[oi])\b/.test(t)) {
    return { domain:'inventory', action:'out_of_stock', filters:{} };
  }
  // Prodotti in esaurimento
  if (/\bin\s+esauriment[oa]\b|\bscars[io]\b|\bquasi\b\s+finit[oi]/.test(t)) {
    return { domain:'inventory', action:'low_stock', filters:{ low_stock_threshold: 0.2 } };
  }
  // Scadenze ravvicinate
  if (/\bscad(enz|e|ono)\b|\bscad[eo]no\b|\bprossime\s+scadenze\b/.test(t)) {
    return { domain:'inventory', action:'near_expiry', filters:{ days_to_expiry: 10 } };
  }
  // Stato scorta di un prodotto
  if (/\b(quanta?|quanto)\s+(scorta|ne\s+ho|me\s+ne\s+rimane)\b|\bresiduo\b/.test(t)) {
    return { domain:'inventory', action:'stock_status', filters:{ product: extractProduct(t) } };
  }
  // Consumo medio + esaurimento stimato
  if (/\bconsumo\b|\bquanto\b.*\bconsum[oa]\b|\bquando\b.*\brestero?\s+senza\b|\bfinir[aà]\b/.test(t)) {
    return { domain:'inventory', action:'consumption_rate', filters:{ product: extractProduct(t) } };
  }
  if (/\bquando\b.*\b(termin|finisc)e\b/.test(t)) {
    return { domain:'inventory', action:'runout_eta', filters:{ product: extractProduct(t) } };
  }

  /* ----------------- LISTE DELLA SPESA ----------------- */
  // Mostra lista
  if (/\b(mostr|vedi|visualizza)\b.*\blista\b/.test(t)) {
    return { domain:'lists', action:'show_list', filters:{ list_type: detectListType(t) } };
  }
  // Aggiungi alla lista
  if (/\b(aggiung[ei]|metti)\b.*\b(lista|carrello)\b/.test(t)) {
    return { domain:'lists', action:'add_to_list', filters:{ list_type: detectListType(t), product: extractProduct(t) } };
  }
  // Rimuovi dalla lista
  if (/\b(rimuov[ei]|togli)\b.*\b(lista|carrello)\b/.test(t)) {
    return { domain:'lists', action:'remove_from_list', filters:{ list_type: detectListType(t), product: extractProduct(t) } };
  }
  // Suggerimenti di acquisto (espliciti)
  if (/\b(cosa\s+devo\s+comprare|suggerimenti\s+di\s+acquisto|lista\s+consigliata)\b/.test(t)) {
    return { domain:'inventory', action:'shopping_recommendations', filters:{ low_stock_threshold:0.2, days_to_expiry:10, include_out_of_stock:true } };
  }

  /* ----------------- FALLBACK NATURALE ----------------- */
  return { domain:null, action:'natural_language', filters:{ raw:userText, period } };
}

export async function runQueryFromText(text) {
  const q = classifyQuery(text);
  try {
    const res = await fetch('/api/finances/analytics', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(q),
    });
    if (!res.ok) throw new Error(`Analytics HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('Analytics non raggiungibile; ritorno debug locale.', err);
    return { ok:false, result:null, debug:q };
  }
}
