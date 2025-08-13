// lib/brainQuery.js
// Parser “domande” → azione strutturata per /api/finances/analytics

function norm(s='') {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim();
}

function parsePeriod(text) {
  const t = norm(text);
  const now = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  let start=null, end=null, granularity=null;

  if (/\boggi\b/.test(t)) {
    start = end = iso(now); granularity='day';
  } else if (/\bieri\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate()-1);
    start = end = iso(d); granularity='day';
  } else if (/\bquesto mese\b/.test(t)) {
    const d1 = new Date(now.getFullYear(), now.getMonth(), 1);
    const d2 = new Date(now.getFullYear(), now.getMonth()+1, 0);
    start = iso(d1); end = iso(d2); granularity='month';
  } else if (/\bquesto anno\b/.test(t)) {
    const d1 = new Date(now.getFullYear(), 0, 1);
    const d2 = new Date(now.getFullYear(), 11, 31);
    start = iso(d1); end = iso(d2); granularity='year';
  } else {
    // dd/mm/yyyy o mm/yyyy
    const mdy = t.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
    const my = t.match(/\b(\d{1,2})[\/\-\.](\d{2,4})\b/);
    if (mdy) {
      let [ , dd, mm, yy ] = mdy;
      if (yy.length===2) yy = (Number(yy)<50 ? '20':'19')+yy;
      const d = new Date(Number(yy), Number(mm)-1, Number(dd));
      start = end = iso(d); granularity='day';
    } else if (my) {
      let [ , mm, yy ] = my;
      if (yy.length===2) yy = (Number(yy)<50 ? '20':'19')+yy;
      const d1 = new Date(Number(yy), Number(mm)-1, 1);
      const d2 = new Date(Number(yy), Number(mm), 0);
      start = iso(d1); end = iso(d2); granularity='month';
    }
  }
  return { start, end, granularity };
}

function extractProduct(text) {
  // prendi tutto dopo “il/la/i/gli” fino a fine o “dove/quanto”
  const t = norm(text);
  const m = t.match(/\b(?:il|lo|la|i|gli|le)\s+([a-z0-9\-\'\s]{3,})(?:\b(dove|quanto|che)\b|$)/i);
  if (m) return m[1].trim();
  // fallback: dopo “prodotto|articolo|prosc(i)utto …”
  const m2 = t.match(/\b(prodotto|articolo|prosciutto|formaggio|vino|latte|pane)\s+([a-z0-9\-\'\s]{2,})/i);
  if (m2) return (m2[1] + ' ' + m2[2]).trim();
  return null;
}

export function classifyQuery(text) {
  const t = norm(text);
  const period = parsePeriod(t);

  // 1) Totale speso
  if (/\bquanto ho speso\b|\bspesa totale\b|\bspeso in totale\b/.test(t)) {
    return { action: 'total_spent', filters: { period } };
  }

  // 2) Prodotti comprati + quantità
  if (/\b(quali|che)\s+prodotti\b|\belenco prodotti\b|\bcosa ho comprato\b/.test(t)) {
    return { action: 'products_purchased', filters: { period } };
  }

  // 3) Frequenza acquisti
  if (/\bfrequenza\b|\bquanto spesso\b|\bogni quanto\b/.test(t)) {
    const product = extractProduct(t);
    return { action: 'purchase_frequency', filters: { period, product } };
  }

  // 4) Prezzo minimo per prodotto (dove l'ho pagato di meno)
  if (/\bdove\b.*\bpagat[oa]\b.*\bmeno\b|\bprezzo minimo\b/.test(t)) {
    const product = extractProduct(t);
    return { action: 'cheapest_merchant', filters: { period, product } };
  }

  // 5) Dettaglio categoria (es. cene e aperitivi, vestiti, spese casa)
  const catMap = {
    'cene e aperitivi': ['cene e aperitivi','ristorante','pizzeria','aperitivo','bar'],
    'vestiti': ['vestiti','abbigliamento','scarpe','boutique','outlet'],
    'spese casa': ['spese casa','supermercato','market','alimentari','spesa'],
  };
  for (const cat in catMap) {
    if (catMap[cat].some(k=>t.includes(k))) {
      if (/\bquanto\b|\bspeso\b|\btotale\b/.test(t)) {
        return { action: 'category_total', filters: { period, category: cat } };
      }
      return { action: 'category_breakdown', filters: { period, category: cat } };
    }
  }

  // fallback: lascia decidere al backend/assistant
  return { action: 'natural_language', filters: { raw: text, period } };
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
    console.warn('Analytics endpoint non disponibile, mostro solo azione:', q, err);
    return { ok: false, result: null, debug: q };
  }
}
