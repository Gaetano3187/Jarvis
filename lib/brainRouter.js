// lib/brainRouter.js
import { createClient } from '@supabase/supabase-js';

/* =========== CONFIG DB (adatta se necessario) =========== */
const T = {
  SPESE: 'spese',
  MOV: 'movimenti',
  PRODOTTI: 'prodotti',
  LISTINI: 'listini',
  SCONTRINI: 'scontrini',
  RIGHE: 'righe_scontrino',
};
const COL = {
  data: 'data',
  importo: 'importo',
  categoria: 'categoria',
  nome: 'nome',
  scadenza: 'scadenza',
  scorta_attuale: 'scorta_attuale',
  scorta_minima: 'scorta_minima',
  consumo_medio: 'consumo_giornaliero_medio',
  scorta_unita: 'scorta_unita',
  prodotto_id: 'prodotto_id',
  quantita: 'quantita',
  tipo: 'tipo',
  prezzo_unitario: 'prezzo_unitario',
  fornitore: 'fornitore',
  scontrino_id: 'scontrino_id',
};

/* =========== SUPABASE (server-side) =========== */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/* =========== UTIL =========== */
const USER_NAME = process.env.NEXT_PUBLIC_USER_NAME || 'Gaetano'; // saluto personalizzato

const fmtEUR = (x) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(x||0);
const iso = (d) => d.toISOString().slice(0,10);
const norm = (s='') => s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();

function withGreeting(answer, first) {
  if (!first) return answer;
  return `Ciao ${USER_NAME}, ${answer}`;
}

function monthIndex(itName) {
  const m = {gennaio:0,febbraio:1,marzo:2,aprile:3,maggio:4,giugno:5,luglio:6,agosto:7,settembre:8,ottobre:9,novembre:10,dicembre:11};
  return m[itName] ?? null;
}
export function parseRange(text, now=new Date()){
  const t = norm(text);
  if(/\b(questo|corrente)\s+mese\b/.test(t)){
    const y=now.getFullYear(), m=now.getMonth();
    return {label:'questo mese', from:iso(new Date(Date.UTC(y,m,1))), to:iso(new Date(Date.UTC(y,m+1,1)))};
  }
  if(/\bmese\s+(scorso|precedente)\b/.test(t)){
    const y=now.getFullYear(), m=now.getMonth();
    return {label:'mese scorso', from:iso(new Date(Date.UTC(y,m-1,1))), to:iso(new Date(Date.UTC(y,m,1)))};
  }
  const mm = t.match(/\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b(?:\s+(\d{2,4}))?/);
  if(mm){
    const mi = monthIndex(mm[1]); let y = now.getFullYear();
    if(mm[2]){ const yy = parseInt(mm[2],10); y = (yy<100)?2000+yy:yy; }
    return {label:`${mm[1]} ${y}`, from:iso(new Date(Date.UTC(y,mi,1))), to:iso(new Date(Date.UTC(y,mi+1,1)))};
  }
  // default: questo mese
  const y=now.getFullYear(), m=now.getMonth();
  return {label:'questo mese', from:iso(new Date(Date.UTC(y,m,1))), to:iso(new Date(Date.UTC(y,m+1,1)))};
}

/* =========== Intent detection =========== */
function detectIntent(text){
  const t = norm(text);
  if (/\b(speso|spese|totale)\b/.test(t)) {
    if (/\bcategoria|per categoria|breakdown\b/.test(t)) return {intent:'SPENT_BY_CATEGORY'};
    return {intent:'TOTAL_SPENT'};
  }
  if (/\b(prezzo|costa|pag(o|ato) meno|miglior prezzo)\b/.test(t)) return {intent:'BEST_PRICE'};
  if (/\b(ando|trend|storico)\b/.test(t) && /\bprezzo\b/.test(t)) return {intent:'PRICE_TRENDS'};
  if (/\b(scorte|scorta|magazzino|stock)\b/.test(t)) return {intent:'STOCK_STATUS'};
  if (/\b(quando finisce|esauriment|restano|giorni)\b/.test(t)) return {intent:'DAYS_TO_DEPLETION'};
  if (/\b(scadenza|scadono|in scadenza|expiry)\b/.test(t)) return {intent:'EXPIRING_PRODUCTS'};
  if (/\b(devo comprare|cosa comprare|consigli acquisto|lista)\b/.test(t)) return {intent:'SHOPPING_SUGGESTIONS'};
  if (/\b(scontrini|scontrino|ricevut)\b/.test(t)) return {intent:'RECEIPT_LOOKUP'};
  if (/\b(storico|cronologia)\b/.test(t) && /\bprodotto\b/.test(t)) return {intent:'PRODUCT_HISTORY'};
  if (/\b(dove|negozio|fornitore).*(meno|economico|conveniente)\b/.test(t)) return {intent:'WHERE_BOUGHT_CHEAPEST'};
  return {intent:'TOTAL_SPENT'};
}

/* =========== Helpers DB =========== */
async function getProductByNameLike(name){
  const { data, error } = await sb.from(T.PRODOTTI).select('*').ilike(COL.nome, `%${name}%`).limit(1);
  if(error) throw error;
  return data?.[0] || null;
}

/* =========== Handlers =========== */
async function totalSpent({ text, first }){
  const r = parseRange(text);
  const { data, error } = await sb.from(T.SPESE).select(`${COL.importo}`).gte(COL.data, r.from).lt(COL.data, r.to);
  if(error) return { intent:'TOTAL_SPENT', answer: withGreeting('si è verificato un errore leggendo le spese.', first), data:{ error } };

  const tot = (data||[]).reduce((s,row)=>s+Number(row[COL.importo]||0),0);
  const euro = fmtEUR(tot);

  // frasetta nello stile richiesto: "nel mese di agosto hai speso 1.000 €"
  let label = r.label;
  const m = label.match(/^(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+\d{4})?$/i);
  if (m) label = `nel mese di ${m[1]}`;

  const line = `${label} hai speso ${euro}.`;
  return { intent:'TOTAL_SPENT', answer: withGreeting(line, first), data:{ range:r, totale:tot, rows:data?.length||0 } };
}

async function spentByCategory({ text, first }){
  const r = parseRange(text);
  const { data, error } = await sb.from(T.SPESE).select(`${COL.categoria}, ${COL.importo}`).gte(COL.data, r.from).lt(COL.data, r.to);
  if(error) return { intent:'SPENT_BY_CATEGORY', answer: withGreeting('errore nel recupero delle categorie.', first), data:{ error } };

  const byCat = {};
  (data||[]).forEach((row)=>{ const k=row[COL.categoria]||'Senza categoria'; byCat[k]=(byCat[k]||0)+Number(row[COL.importo]||0); });
  const arr = Object.entries(byCat).map(([categoria,tot])=>({categoria, tot})).sort((a,b)=>b.tot-a.tot);
  const top = arr.slice(0,5).map(x=>`${x.categoria}: ${fmtEUR(x.tot)}`).join(' · ') || '—';

  return { intent:'SPENT_BY_CATEGORY', answer: withGreeting(`Top categorie in ${r.label}: ${top}`, first), data:{ range:r, breakdown:arr } };
}

async function bestPrice({ text, first }){
  const m = text.match(/(?:del|di|per)\s+(.+)$/i) || text.match(/prezzo\s+(.+)$/i);
  const q = (m?.[1] || text).trim();
  const prod = await getProductByNameLike(q);
  if (!prod) return { intent:'BEST_PRICE', answer: withGreeting('non ho trovato il prodotto richiesto.', first), data:{ query:q } };

  const { data, error } = await sb
    .from(T.RIGHE)
    .select(`prezzo_unitario:${COL.prezzo_unitario}, s:${COL.scontrino_id}`)
    .eq(COL.prodotto_id, prod.id)
    .order(COL.prezzo_unitario,{ ascending:true })
    .limit(1);

  if (error) return { intent:'BEST_PRICE', answer: withGreeting('non riesco a leggere i prezzi storici.', first), data:{ error } };
  const best = data?.[0];
  if (!best) return { intent:'BEST_PRICE', answer: withGreeting('non ho prezzi storici per questo prodotto.', first), data:{ product: prod.nome } };

  let luogo = '—', dataPrezzo = null;
  try {
    const { data: scontr } = await sb.from(T.SCONTRINI).select(`${COL.fornitore}, ${COL.data}`).eq('id', best.s).maybeSingle();
    if (scontr?.[COL.fornitore]) luogo = scontr[COL.fornitore];
    dataPrezzo = scontr?.[COL.data] || null;
  } catch {}

  const line = `il ${prod.nome} costa meno ${luogo !== '—' ? `da ${luogo}` : 'nel fornitore rilevato'} a ${fmtEUR(best.prezzo_unitario)}${dataPrezzo ? ` (${dataPrezzo})` : ''}.`;
  return { intent:'BEST_PRICE', answer: withGreeting(line, first), data:{ product: prod, best, fornitore: luogo, dataPrezzo } };
}

async function stockStatus({ text, first }){
  const m = text.match(/(?:di|del|per)\s+(.+)$/i);
  if (m) {
    const prod = await getProductByNameLike(m[1].trim());
    if (!prod) return { intent:'STOCK_STATUS', answer: withGreeting('prodotto non trovato.', first), data:{} };
    const sotto = prod[COL.scorta_minima] != null && Number(prod[COL.scorta_attuale]||0) <= Number(prod[COL.scorta_minima]||0);
    const ans = `${prod.nome}: in casa ${prod[COL.scorta_attuale]} ${prod[COL.scorta_unita]||''}${sotto?' (sotto scorta minima)':''}.`;
    return { intent:'STOCK_STATUS', answer: withGreeting(ans, first), data:{ product:prod } };
  }
  const { data, error } = await sb.from(T.PRODOTTI).select('*').not(COL.scorta_minima,'is',null);
  if (error) return { intent:'STOCK_STATUS', answer: withGreeting('errore lettura scorte.', first), data:{ error } };
  const critici = (data||[]).filter(p => Number(p[COL.scorta_attuale]||0) <= Number(p[COL.scorta_minima]||0))
                            .map(p => ({ id:p.id, nome:p.nome, scorta:p[COL.scorta_attuale], unita:p[COL.scorta_unita], scorta_min:p[COL.scorta_minima] }));
  const ans = critici.length ? `Prodotti sotto scorta: ${critici.map(x=>x.nome).join(', ')}.` : 'Nessun prodotto sotto scorta.';
  return { intent:'STOCK_STATUS', answer: withGreeting(ans, first), data:{ critici } };
}

async function daysToDepletion({ text, first }){
  const m = text.match(/(?:di|del|per)\s+(.+)$/i) || text.match(/(?:il|lo)\s+(.+)\??$/i);
  const q = (m?.[1] || text).trim();
  const prod = await getProductByNameLike(q);
  if (!prod) return { intent:'DAYS_TO_DEPLETION', answer: withGreeting('prodotto non trovato.', first), data:{ query:q } };

  let consumo = Number(prod[COL.consumo_medio]||0);
  if (!consumo) {
    const to = iso(new Date()); const from = iso(new Date(Date.now()-60*86400000));
    const { data: cons, error } = await sb
      .from(T.MOV)
      .select(`${COL.quantita}, ${COL.tipo}, ${COL.data}`)
      .eq(COL.prodotto_id, prod.id)
      .eq(COL.tipo, 'consumo')
      .gte(COL.data, from).lte(COL.data, to);
    if (!error && cons?.length) {
      const totale = cons.reduce((s,r)=>s+Number(r[COL.quantita]||0),0);
      consumo = totale / 60; // ≈ media giornaliera ultimi 60 gg
    }
  }
  if (!consumo) return { intent:'DAYS_TO_DEPLETION', answer: withGreeting(`non conosco il consumo medio di ${prod.nome}.`, first), data:{ product:prod } };

  const scorta = Number(prod[COL.scorta_attuale]||0);
  const giorni = Math.max(0, Math.ceil(scorta / consumo));
  const esaur = iso(new Date(Date.now()+giorni*86400000));
  const ans = `${prod.nome}: ≈ ${giorni} giorni rimasti (fino al ${esaur}).`;
  return { intent:'DAYS_TO_DEPLETION', answer: withGreeting(ans, first), data:{ product:prod, giorni, consumo_giornaliero:consumo, data_esaurimento:esaur } };
}

async function expiringProducts({ text, first }){
  const m = text.match(/(\d+)\s*(giorn|gg|days)/i);
  const days = m ? parseInt(m[1],10) : 14;
  const from = iso(new Date()); const to = iso(new Date(Date.now()+days*86400000));
  const { data, error } = await sb
    .from(T.PRODOTTI)
    .select(`${COL.nome}, ${COL.scadenza}`)
    .not(COL.scadenza,'is',null)
    .gte(COL.scadenza, from).lte(COL.scadenza, to)
    .order(COL.scadenza,{ ascending:true });
  if (error) return { intent:'EXPIRING_PRODUCTS', answer: withGreeting('errore lettura scadenze.', first), data:{ error } };

  if (!data?.length) return { intent:'EXPIRING_PRODUCTS', answer: withGreeting(`nessun prodotto in scadenza nei prossimi ${days} giorni.`, first), data:{ days } };

  const list = data.map(p => `${p[COL.nome]} (${p[COL.scadenza]})`).join(' · ');
  return { intent:'EXPIRING_PRODUCTS', answer: withGreeting(`in scadenza nei prossimi ${days} giorni: ${list}.`, first), data:{ days, prodotti:data } };
}

async function receiptLookup({ text, first }){
  const r = parseRange(text);
  const { data, error } = await sb
    .from(T.SCONTRINI)
    .select(`id, ${COL.data}, ${COL.fornitore}, totale`)
    .gte(COL.data, r.from).lt(COL.data, r.to)
    .order(COL.data,{ ascending:false }).limit(10);
  if (error) return { intent:'RECEIPT_LOOKUP', answer: withGreeting('errore lettura scontrini.', first), data:{ error } };
  return { intent:'RECEIPT_LOOKUP', answer: withGreeting(`ultimi scontrini in ${r.label}: ${data.length}.`, first), data:{ range:r, scontrini:data } };
}

async function shoppingSuggestions({ first }){
  const { data, error } = await sb.from(T.PRODOTTI).select('*').not(COL.scorta_minima,'is',null);
  if (error) return { intent:'SHOPPING_SUGGESTIONS', answer: withGreeting('errore lettura scorte.', first), data:{ error } };
  const critici = (data||[]).map(p=>{
    const sc=Number(p[COL.scorta_attuale]||0), min=Number(p[COL.scorta_minima]||0); const deficit = min ? (sc/min) : 1e9;
    return { id:p.id, nome:p.nome, scorta:sc, unita:p[COL.scorta_unita], scorta_min:min, deficit };
  }).filter(x=>x.scorta<=x.scorta_min).sort((a,b)=>a.deficit-b.deficit);
  const ans = critici.length ? `da comprare: ${critici.slice(0,8).map(x=>x.nome).join(', ')}.` : 'nessuna urgenza di acquisto.';
  return { intent:'SHOPPING_SUGGESTIONS', answer: withGreeting(ans, first), data:{ critici } };
}

/* ======= Ingest stubs (se li usi) ======= */
async function saveVoiceExpense(text) {
  return { saved: true, parsed: { raw: text } };
}
async function saveReceiptOCR({ base64, raw }) {
  return { stored: true, bytes: base64 ? base64.length : 0, raw: raw ?? null };
}

/* =========== ENTRY POINT =========== */
export async function handleBrainRequest(body = {}){
  const { kind } = body;

  // Ingest
  if (kind === 'voiceIngest') {
    const text = body.text?.trim();
    if (!text) return { ok:false, error:'Missing text' };
    const r = await saveVoiceExpense(text);
    return { type:'voiceIngest', ...r };
  }
  if (kind === 'ocrIngest') {
    const { base64, raw } = body;
    if (!base64) return { ok:false, error:'Missing base64' };
    const r = await saveReceiptOCR({ base64, raw });
    return { type:'ocrIngest', ...r };
  }

  // Query
  const text  = (body.text ?? body.prompt ?? '').trim();
  const first = !!body.first;

  const { intent } = detectIntent(text);
  switch (intent) {
    case 'TOTAL_SPENT':          return totalSpent({ text, first });
    case 'SPENT_BY_CATEGORY':    return spentByCategory({ text, first });
    case 'BEST_PRICE':           return bestPrice({ text, first });
    case 'PRICE_TRENDS':         return { intent, answer: withGreeting('(TODO) trend prezzi', first), data:{} };
    case 'STOCK_STATUS':         return stockStatus({ text, first });
    case 'DAYS_TO_DEPLETION':    return daysToDepletion({ text, first });
    case 'EXPIRING_PRODUCTS':    return expiringProducts({ text, first });
    case 'SHOPPING_SUGGESTIONS': return shoppingSuggestions({ first });
    case 'RECEIPT_LOOKUP':       return receiptLookup({ text, first });
    case 'PRODUCT_HISTORY':      return { intent, answer: withGreeting('(TODO) storico prodotto', first), data:{} };
    case 'WHERE_BOUGHT_CHEAPEST':return bestPrice({ text, first });
    default:                     return totalSpent({ text, first });
  }
}
