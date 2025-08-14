// lib/brainHub.js
//
// Hub lato client: raccoglie dati dal bridge, risponde subito se possibile,
// altrimenti chiama /api/assistant passando un "context" compatto.
//
// Esporta: runQueryFromTextLocal(text, opts?)

function take(obj, key, fallback = {}) {
  if (!obj) return fallback;
  const v = obj[key];
  return v == null ? fallback : v;
}

// ---------------- Bridge collector ----------------
export function collectBridge() {
  if (typeof window === 'undefined') return {};
  const data = window.__JARVIS_DATA__ || {};

  // Sezioni note (estendile liberamente)
  const entrate = take(data, 'entrate', {});
  const scorte  = take(data, 'scorte',  {});     // { prodotti[], daComprare[], inEsaurimento[], inScadenza[] }
  const spese   = take(data, 'spese',   {});     // { periodo:{startDate,endDate}, totaliPerCategoria:{}, ... }
  const cene    = take(data, 'cene',    {});     // { totaliPerMese:{'2025-08': 123.45}, ... }
  const vestiti = take(data, 'vestiti', {});     // opzionale

  return { entrate, scorte, spese, cene, vestiti };
}

// ---------------- Utils ----------------
const itMonths = {
  'gennaio':1,'febbraio':2,'marzo':3,'aprile':4,'maggio':5,'giugno':6,
  'luglio':7,'agosto':8,'settembre':9,'ottobre':10,'novembre':11,'dicembre':12
};
function parseMonthKeyIT(q, fallbackKey) {
  const t = (q||'').toLowerCase();
  const m = Object.keys(itMonths).find(k => t.includes(k));
  if (!m) return fallbackKey; // es. "2025-08"
  const mm = String(itMonths[m]).padStart(2,'0');
  const y = (t.match(/\b(20\d{2})\b/)||[])[1] || new Date().getFullYear();
  return `${y}-${mm}`;
}
function euro(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '0,00';
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------- Intent router (risposte immediate) ----------------
function routeLocal(text, ctx) {
  const q = (text || '').trim().toLowerCase();
  const { entrate, scorte, spese, cene } = ctx;

  // —— Entrate / saldo / spese periodo corrente —— //
  if (/(saldo disponibile|quanto.*saldo|quanti soldi (ho|abbiamo) disponibili)/i.test(q)) {
    const v = Number(entrate?.saldoDisponibile ?? 0);
    return { ok:true, result: `Saldo disponibile: € ${euro(v)}.` };
  }
  if (/(soldi in tasca|contanti in tasca|cash in tasca)/i.test(q)) {
    const v = Number(entrate?.soldiInTasca ?? 0);
    return { ok:true, result: `Contanti in tasca: € ${euro(v)}.` };
  }
  if (/(entrate.*(periodo|mese)|quanto.*incassato)/i.test(q)) {
    const v = Number(entrate?.entratePeriodo ?? 0);
    return { ok:true, result: `Entrate del periodo: € ${euro(v)}.` };
  }
  if (/(spese.*(periodo|mese)|quanto.*speso)/i.test(q)) {
    const v = Number(entrate?.spesePeriodo ?? 0);
    return { ok:true, result: `Spese in contanti del periodo: € ${euro(v)}.` };
  }

  // —— Spese per categoria / pagina cene, vestiti, ecc. —— //
  // Esempi: "quanto ho speso di cene in agosto 2025", "spesa vestiti di agosto"
  if (/(cene|aperitivi)/i.test(q)) {
    const defaultKey = (entrate?.endDate || '').slice(0,7); // es. "2025-08"
    const monthKey = parseMonthKeyIT(q, defaultKey);
    const tot = Number(cene?.totaliPerMese?.[monthKey] ?? 0);
    return { ok:true, result: `Cene/Aperitivi in ${monthKey}: € ${euro(tot)}.` };
  }
  if (/(vestiti|abbigliamento)/i.test(q)) {
    const defaultKey = (entrate?.endDate || '').slice(0,7);
    const monthKey = parseMonthKeyIT(q, defaultKey);
    const tot = Number(spese?.totaliPerCategoria?.vestiti?.[monthKey] ?? 0);
    return { ok:true, result: `Vestiti in ${monthKey}: € ${euro(tot)}.` };
  }
  if (/(spese casa|spese.*casa)/i.test(q)) {
    const defaultKey = (entrate?.endDate || '').slice(0,7);
    const monthKey = parseMonthKeyIT(q, defaultKey);
    const tot = Number(spese?.totaliPerCategoria?.casa?.[monthKey] ?? 0);
    return { ok:true, result: `Spese casa in ${monthKey}: € ${euro(tot)}.` };
  }

  // —— Scorte / liste —— //
  if (/(cosa devo comprare|cosa manca|lista della spesa|da comprare)/i.test(q)) {
    const arr = scorte?.daComprare || [];
    if (!arr.length) return { ok:true, result: 'Al momento non manca nulla 🧺' };
    return { ok:true, result: `Da comprare: ${arr.map(p => p.nome || p.name).join(', ')}.` };
  }
  if (/(in scadenza|scadono|prodotti in scadenza)/i.test(q)) {
    const arr = scorte?.inScadenza || [];
    if (!arr.length) return { ok:true, result: 'Nessun prodotto in scadenza a breve ✅' };
    const out = arr.map(p => {
      const nome = p.nome || p.name;
      const d = (p.scadenza || p.expiry || '').toString().slice(0,10);
      return `${nome}${d ? ` (${d})` : ''}`;
    });
    return { ok:true, result: `In scadenza: ${out.join(', ')}.` };
  }
  if (/(in esaurimento|quasi finiti|scorte basse)/i.test(q)) {
    const arr = scorte?.inEsaurimento || [];
    if (!arr.length) return { ok:true, result: 'Nessun prodotto in esaurimento ✅' };
    return { ok:true, result: `In esaurimento: ${arr.map(p => p.nome || p.name).join(', ')}.` };
  }
  if (/(stato scorte|come sono le scorte|quanti prodotti)/i.test(q)) {
    const tot = (scorte?.prodotti || []).length;
    return { ok:true, result: `Totale prodotti a magazzino: ${tot}.` };
  }

  // —— Redirect “apri pagina …” —— //
  if (/apri.*(liste|prodotti)/i.test(q)) return { ok:true, redirect:'/liste-prodotti' };
  if (/apri.*(finanze|entrate|spese)/i.test(q)) return { ok:true, redirect:'/finanze' };
  if (/apri.*(cene|aperitivi)/i.test(q)) return { ok:true, redirect:'/cene-aperitivi' };

  return null; // nessun intent locale
}

// ---------------- Chiamata al modello (fallback) ----------------
async function askAssistantWithContext(text, ctx) {
  // Stringa compatta per il modello (evita payload giganteschi)
  const slim = {
    entrate: {
      startDate: ctx.entrate?.startDate,
      endDate  : ctx.entrate?.endDate,
      saldoDisponibile: ctx.entrate?.saldoDisponibile,
      entratePeriodo  : ctx.entrate?.entratePeriodo,
      spesePeriodo    : ctx.entrate?.spesePeriodo,
      soldiInTasca    : ctx.entrate?.soldiInTasca,
      carryoverMese   : ctx.entrate?.carryoverMese,
    },
    scorte: {
      daComprare : (ctx.scorte?.daComprare || []).slice(0,100),
      inScadenza : (ctx.scorte?.inScadenza || []).slice(0,100),
      inEsaurimento: (ctx.scorte?.inEsaurimento || []).slice(0,100),
    },
    spese: {
      totaliPerCategoria: ctx.spese?.totaliPerCategoria || {},
    },
    cene: {
      totaliPerMese: ctx.cene?.totaliPerMese || {}
    }
  };

  const system = [
    'Sei Jarvis, assistente dell’app di gestione familiare.',
    'Rispondi in italiano, sintetico.',
    'Se la domanda richiede numeri presenti in "context", usa SOLO quelli.',
    'Se i dati non ci sono, dillo chiaramente o suggerisci la pagina da aprire.',
  ].join('\n');

  const prompt = [
    `Utente: ${text}`,
    '',
    'context:',
    JSON.stringify(slim)
  ].join('\n');

  const res = await fetch('/api/assistant', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ system, prompt })
  });
  const out = await res.json();
  if (!res.ok || out.error) throw new Error(out.error || String(res.status));
  // La tua /api/assistant restituisce {answer:string}
  return { ok:true, result: out.answer?.trim?.() || 'Nessuna risposta.' };
}

// ---------------- API pubblica ----------------
export async function runQueryFromTextLocal(text, opts = {}) {
  const ctx = collectBridge();

  // 1) Intent locale (istantaneo)
  const quick = routeLocal(text, ctx);
  if (quick) return quick;

  // 2) Fallback: modello con context
  try {
    return await askAssistantWithContext(text, ctx);
  } catch (err) {
    console.error('[assistant fallback error]', err);
    return { ok:false, result:'Errore nel modello.' };
  }
}
