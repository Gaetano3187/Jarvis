// lib/brainQuery.js

/**
 * Piccolo parser di intenti + client per l'endpoint /api/analytics.
 * Funziona lato client. Non usa dipendenze esterne.
 */

/** Converte un token periodo in un range di date ISO (locale) */
function periodToRange(periodToken) {
  const now = new Date();
  const atMidnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  let from, to;

  switch (periodToken) {
    case 'today': {
      const d = atMidnight(now);
      from = d;
      to = endOfDay(now);
      break;
    }
    case 'yesterday': {
      const d = new Date(atMidnight(now).getTime() - 24 * 60 * 60 * 1000);
      from = d;
      to = endOfDay(d);
      break;
    }
    case 'this_week': {
      // Lunedì come inizio settimana
      const day = now.getDay(); // 0=Dom (usa 1=Lun)
      const mondayDiff = (day === 0 ? -6 : 1 - day);
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayDiff);
      from = atMidnight(monday);
      const sunday = new Date(from);
      sunday.setDate(from.getDate() + 6);
      to = endOfDay(sunday);
      break;
    }
    case 'last_week': {
      const day = now.getDay();
      const mondayDiff = (day === 0 ? -6 : 1 - day) - 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayDiff);
      from = atMidnight(monday);
      const sunday = new Date(from);
      sunday.setDate(from.getDate() + 6);
      to = endOfDay(sunday);
      break;
    }
    case 'this_year': {
      from = new Date(now.getFullYear(), 0, 1);
      to = endOfDay(new Date(now.getFullYear(), 11, 31));
      break;
    }
    case 'last_year': {
      const y = now.getFullYear() - 1;
      from = new Date(y, 0, 1);
      to = endOfDay(new Date(y, 11, 31));
      break;
    }
    case 'last_month': {
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      from = new Date(y, m, 1);
      to = endOfDay(new Date(y, m + 1, 0));
      break;
    }
    case 'this_month':
    default: {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      break;
    }
  }

  return {
    date_from: from.toISOString(),
    date_to: to.toISOString(),
  };
}

/** Estrae un token periodo dalla frase (fallback: this_month) */
function extractPeriod(text) {
  const t = text.toLowerCase();

  if (/(oggi)\b/.test(t)) return 'today';
  if (/(ieri)\b/.test(t)) return 'yesterday';

  if (/(questa\s+settimana|in\s+questa\s+settimana)\b/.test(t)) return 'this_week';
  if (/(settimana\s+scorsa|scorsa\s+settimana)\b/.test(t)) return 'last_week';

  if (/(quest[oa]\s+ann[oa]|quest'anno)\b/.test(t)) return 'this_year';
  if (/(ann[oa]\s+scors[oa])\b/.test(t)) return 'last_year';

  if (/(quest[oa]\s+mese|in\s+questo\s+mese)\b/.test(t)) return 'this_month';
  if (/(mese\s+scorso|scorso\s+mese)\b/.test(t)) return 'last_month';

  return 'this_month';
}

/** Normalizza nomi categoria a un set coerente */
function normalizeCategory(text) {
  const t = text.toLowerCase();

  // Utenze/bollette
  if (/(bollett|utenze|luce|gas|internet|telefono|acqua)\b/.test(t)) return 'bollette';

  // Altri esempi che puoi ampliare
  if (/(spesa|supermercato|market|grocery)\b/.test(t)) return 'spesa';
  if (/(affitto|rent)\b/.test(t)) return 'affitto';
  if (/(trasporti?|benzina|carburante|metro|bus|treno)\b/.test(t)) return 'trasporti';

  return null;
}

/**
 * Classifica la frase in un'intenzione comprensibile dal backend.
 * Ritorna: { domain, action, filters, period, intent }
 */
export function classifyQuery(text) {
  const original = text || '';
  const low = original.trim().toLowerCase();
  const period = extractPeriod(low);

  // 1) Utenze / Bollette (quanto ho pagato di bolletta questo mese, ecc.)
  if (/(bollett|utenze|luce|gas|internet|telefono|acqua)/.test(low) &&
      /(quanto|spes[oa]|totale|pagat[oa]|spend[oi])/.test(low)) {
    return {
      intent: 'finances.category_total',
      domain: 'finances',
      action: 'category_total',
      filters: { category: 'bollette', raw: original },
      period,
    };
  }

  // 2) Totale spese generiche in un periodo
  if (/(quanto|totale).*(spes[oa]|spend[oi])/.test(low) ||
      /(spes[oa]|spend[oi]).*(totale|complessiv[ao])/.test(low)) {
    return {
      intent: 'finances.total',
      domain: 'finances',
      action: 'total',
      filters: { raw: original },
      period,
    };
  }

  // 3) Totale per categoria generica (es. "quanto per spesa questo mese")
  const cat = normalizeCategory(low);
  if (cat && /(quanto|spes[oa]|totale|pagat[oa]|spend[oi])/.test(low)) {
    return {
      intent: 'finances.category_total',
      domain: 'finances',
      action: 'category_total',
      filters: { category: cat, raw: original },
      period,
    };
  }

  // 4) Fallback: echo/ricerca libera
  return {
    intent: 'finances.echo',
    domain: 'finances',
    action: 'echo',
    filters: { raw: original },
    period,
  };
}

/**
 * Client per /api/analytics che aggiunge range date e classificazione.
 * Ritorna sempre un oggetto { ok: boolean, data?, error?, status? }.
 */
export async function runQueryFromText(text, options = {}) {
  const classification = classifyQuery(text);
  const { date_from, date_to } = periodToRange(classification.period);

  const payload = {
    utterance: text,
    classification,
    date_from,
    date_to,
    ...('extra' in options ? options.extra : null),
  };

  const controller = new AbortController();
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      let msg = '';
      try { msg = await res.text(); } catch { /* no-op */ }
      return { ok: false, status: res.status, error: msg || 'HTTP error' };
    }

    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: 'Risposta JSON non valida dal server' };

    return { ok: true, data };
  } catch (err) {
    const isAbort = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
    return { ok: false, error: isAbort ? 'timeout' : (err?.message || String(err)) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Alias mantenuto per retrocompatibilità con i componenti che lo importano.
 * È semplicemente la stessa cosa di classifyQuery().
 */
export function parseAssistantPrompt(text) {
  return classifyQuery(text);
}

export default {
  classifyQuery,
  runQueryFromText,
  parseAssistantPrompt,
};
