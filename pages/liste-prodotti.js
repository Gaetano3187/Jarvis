// pages/liste-prodotti.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { Pencil, Trash2, Camera, Calendar } from 'lucide-react';
import dynamic from 'next/dynamic';

/* =====================================================================================
   CONFIG / ENDPOINTS
===================================================================================== */
const DEBUG = false;
const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };

const CLOUD_SYNC = true;
const CLOUD_TABLE = 'jarvis_liste_state';
let __supabase = null;

const API_VISION           = '/api/vision';          // Vision-first
const API_OCR              = '/api/ocr';             // Fallback OCR (solo testo)
const API_ASSISTANT_TEXT   = '/api/assistant';       // Parsing/estrazione strutturata
const API_STT              = '/api/stt';             // Speech-to-Text
const API_FINANCES_INGEST  = '/api/finances/ingest'; // Spese
const API_PRODUCTS_ENRICH  = '/api/products/enrich'; // Normalizza + immagini

const DEFAULT_PACKS_IF_MISSING = true;
const OCR_IMAGE_MAXSIDE = 1200;
const OCR_IMAGE_QUALITY = 0.66;

const LS_VER = 1;
const LS_KEY = 'jarvis_liste_prodotti@v1';

/* =====================================================================================
   LEXICON base + estensioni
===================================================================================== */
const GROCERY_LEXICON = [
  'latte','latte zymil','yogurt','burro','uova','mozzarella','parmigiano',
  'pane','pasta','riso','farina','zucchero','olio evo','olio di semi','aceto',
  'passata di pomodoro','pelati','tonno in scatola','piselli','fagioli',
  'biscotti','merendine','fette biscottate','marmellata','nutella','caffè',
  'acqua naturale','acqua frizzante','birra','vino',
  'detersivo lavatrice','pods lavatrice','ammorbidente','candeggina',
  'detersivo piatti','pastiglie lavastoviglie',
  'carta igienica','carta casa','sacchi spazzatura',
  'mele','banane','arance','limoni','zucchine','melanzane','pomodori','patate'
];

(function extendLexicon() {
  const add = (arr) => arr.forEach(t => { if (t && !GROCERY_LEXICON.some(x => normKey(x)===normKey(t))) GROCERY_LEXICON.push(t); });
  add(['prosciutto cotto','prosciutto crudo','bresaola','speck','mortadella','salame','pancetta','salsiccia','wurstel','porchetta','arrosto di tacchino']);
  add(['latte uht','latte senza lattosio','yogurt greco','panna','ricotta','burrata','scamorza','provola','parmigiano reggiano','grana padano','pecorino','gorgonzola','stracchino','robiola','brie','crescenza','philadelphia','formaggio spalmabile','kefir']);
  add(['pan bauletto','pan carrè','grissini','cracker','taralli','piadina','tortillas','focaccia','cornetti','croissant','fette biscottate','pangrattato','pan grattugiato','pan carré']);
  add(['spaghetti','penne','fusilli','rigatoni','lasagne','gnocchi','ravioli','tortellini','riso arborio','riso carnaroli','riso basmati','farina 00','semola','lievito per dolci','lievito di birra','cous cous','farro','orzo','quinoa','polenta']);
  add(['polpa di pomodoro','pomodori pelati','concentrato di pomodoro','pesto','ragù','olio extravergine di oliva','aceto balsamico','zucchero di canna','sale fino','sale grosso','pepe','sgombro','legumi in scatola','ceci','fagioli borlotti','lenticchie','piselli','mais','olive','capperi','dado da brodo','maionese','ketchup','senape','salsa barbecue','salsa di soia','spezie','origano','basilico','rosmarino','curry','paprika','curcuma','cannella','zafferano']);
  add(['cereali','corn flakes','muesli','granola','biscotti integrali','crostatine','plumcake','marmellata','confettura','miele','crema di arachidi']);
  add(['cioccolato','barrette','caramelle','liquirizia','gomme da masticare','salatini','mandorle','nocciole','pistacchi','anacardi','noci','pinoli','patatine','popcorn','yo-yo','fiesta']);
  add(['acqua naturale','acqua frizzante','succo di frutta','tè freddo','caffè capsule','caffè cialde','bevanda vegetale','bibita cola','aranciata','birra','spumante']);
  add(['piselli surgelati','spinaci surgelati','minestrone surgelato','patatine surgelate','bastoncini di pesce','pizza surgelata','gelato','sorbetto']);
  add(['insalata','lattuga','rucola','pomodori','zucchine','melanzane','peperoni','carote','sedano','cetrioli','cipolle','aglio','patate','zucca','broccoli','cavolfiore','asparagi','carciofi','funghi','finocchi','verza']);
  add(['banane','mele','pere','arance','limoni','mandarini','kiwi','uva','fragole','mirtilli','lamponi','ananas','mango','melone','anguria','pesche','albicocche','prugne','fichi','melagrana','avocado','cachi']);
  add(['pannolini','salviettine umidificate','omogeneizzati','latte in polvere','crocchette cane','crocchette gatto','lettiera gatti']);
  add(['detersivo lavatrice','pods lavatrice','ammorbidente','smacchiatore','candeggina','igienizzante bucato','detersivo capi delicati','perle profuma-bucato']);
  add(['detersivo piatti','pastiglie lavastoviglie','gel lavastoviglie','sale lavastoviglie','brillantante lavastoviglie']);
  add(['sgrassatore cucina','detergente multiuso','detergente vetri','detergente pavimenti','detergente bagno','anticalcare','gel wc','igienizzante superfici','cera parquet']);
  add(['carta igienica','carta casa','scottex','fazzoletti','tovaglioli','sacchi spazzatura','sacchetti immondizia','sacchetti freezer','pellicola','alluminio','carta forno','guanti lattice','panni microfibra','buste gelo','sacchetti zip','mocio','ricariche mocio','scopa','teli copritutto','accendifuoco','sacchetti aspirapolvere','deumidificatore ricariche','rotolo bio con maniglie']);
  add(['sapone mani','bagnoschiuma','shampoo','balsamo','dentifricio','collutorio','spazzolino','deodorante','assorbenti','cotton fioc','crema mani']);
})();

/* =====================================================================================
   UTILITY / NORMALIZZAZIONI
===================================================================================== */
const UNIT_SYNONYMS = '(?:unit(?:a|à)?|unit\\b|pz\\.?|pezz(?:i|o)\\.?|bottiglie?|busta(?:e)?|bustine?|lattin(?:a|e)|barattol(?:o|i)|vasett(?:o|i)|vaschett(?:a|e)|brick|cartocc(?:io|i)|fett(?:a|e)|uova|capsul(?:a|e)|pods|rotol(?:o|i)|fogli(?:o|i))';
const PACK_SYNONYMS = '(?:conf(?:e(?:zioni)?)?|confezione|pacc?hi?|pack|multipack|scatol(?:a|e)|carton(?:e|i))';

function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
var isSimilar = typeof isSimilar === 'function' ? isSimilar : function(a, b){
  const na = normKey(a), nb = normKey(b);
  if (!na || !nb) return false;
  if (na===nb) return true;
  if (na.length>=3 && (nb.includes(na)||na.includes(nb))) return true;
  const A=new Set(na.split(' ').filter(Boolean)); const B=new Set(nb.split(' ').filter(Boolean));
  let inter=0; A.forEach(t=>{ if(B.has(t)) inter++; });
  const union = new Set([...A,...B]).size; const j=inter/union;
  return j>=.5 || (inter>=1 && (A.size===1 || B.size===1));
};
function productKey(name='', brand=''){ return `${normKey(name)}|${normKey(brand)}`; }

function loadPersisted() {
  try {
    const raw = typeof window!=='undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== LS_VER) return null;
    return data;
  } catch { return null; }
}
function persistNow(snapshot, learned) {
  try {
    if (typeof window === 'undefined') return;
    const payload = {
      v: LS_VER,
      at: Date.now(),
      lists: snapshot.lists,
      stock: snapshot.stock,
      currentList: snapshot.currentList,
      imagesIndex: snapshot.imagesIndex || {},
      learned: snapshot.learned || learned || { products:{}, aliases:{product:{},brand:{}}, keepTerms:{}, discardTerms:{} },
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch(e){ console.warn('[persist] save failed', e); }
}

function stripForCloud(state = {}) {
  const safeList = (arr) => (Array.isArray(arr)?arr:[]).map(it=>({
    id:String(it?.id??''), name:String(it?.name??''), brand:String(it?.brand??''),
    qty:Number(it?.qty??0), unitsPerPack:Number(it?.unitsPerPack??1),
    unitLabel:String(it?.unitLabel??'unità'), purchased:!!it?.purchased
  }));
  const lists = state.lists || {};
  const safeLists = {
    [LIST_TYPES.SUPERMARKET]: safeList(lists[LIST_TYPES.SUPERMARKET]),
    [LIST_TYPES.ONLINE]: safeList(lists[LIST_TYPES.ONLINE]),
  };
  const safeStock = (Array.isArray(state.stock)?state.stock:[]).map(s=>{
    const base = {
      name:String(s?.name??''), brand:String(s?.brand??''),
      packs:Number(s?.packs??0), unitsPerPack:Number(s?.unitsPerPack??1),
      unitLabel:String(s?.unitLabel??'unità'), expiresAt:String(s?.expiresAt??''),
      baselinePacks:Number(s?.baselinePacks??0), lastRestockAt:String(s?.lastRestockAt??''),
      avgDailyUnits:Number(s?.avgDailyUnits??0),
      residueUnits:Number(s?.residueUnits ?? (Number(s?.packs||0)*Number(s?.unitsPerPack||1))),
      packsOnly:!!s?.packsOnly
    };
    const img=s?.image;
    if (typeof img==='string' && /^https?:\/\//i.test(img) && img.length<=500) base.image = img;
    return base;
  });
  const imagesIndex={};
  const srcIdx = (state.imagesIndex && typeof state.imagesIndex==='object')?state.imagesIndex:{};
  for (const [k,v] of Object.entries(srcIdx)) if (typeof v==='string' && /^https?:\/\//i.test(v) && v.length<=500) imagesIndex[k]=v;
  const learned = (state.learned && typeof state.learned==='object')
    ? { products:state.learned.products||{}, aliases:state.learned.aliases||{product:{},brand:{}}, keepTerms:state.learned.keepTerms||{} }
    : { products:{}, aliases:{product:{},brand:{}}, keepTerms:{} };

  const currentList = [LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].includes(state.currentList) ? state.currentList : LIST_TYPES.SUPERMARKET;
  return { _ts:Date.now(), lists:safeLists, stock:safeStock, currentList, imagesIndex, learned };
}

/* =====================================================================================
   OCR / ASSISTANT / ENRICH HELPERS
===================================================================================== */
async function readTextSafe(res){ try { return await res.text(); } catch { return ''; } }
async function timeoutFetch(url, opts={}, ms=25000){
  const ctrl = new AbortController(); const t=setTimeout(()=>ctrl.abort(), ms);
  try { return await fetch(url, {...opts, signal: ctrl.signal}); }
  finally { clearTimeout(t); }
}
async function fetchJSONStrict(url, opts={}, ms=40000){
  const r = await timeoutFetch(url, opts, ms);
  const ct = (r.headers.get?.('content-type')||'').toLowerCase();
  const raw = await readTextSafe(r);
  if (!r.ok){
    let msg=raw;
    if (ct.includes('application/json')) { try { const j=JSON.parse(raw); msg=j.error||j.message||JSON.stringify(j); } catch{} }
    throw new Error(`HTTP ${r.status} ${r.statusText||''} — ${String(msg).slice(0,250)}`);
  }
  if (!raw.trim()) return {};
  if (ct.includes('application/json')) { try { return JSON.parse(raw); } catch(e){ throw new Error(`JSON parse error: ${e?.message||e}`); } }
  try { return JSON.parse(raw); } catch { return { data: raw }; }
}

function buildDirectReceiptPrompt(ocrText){
  return [
    'Sei Jarvis. Estrai le righe di UN SCONTRINO da TESTO OCR.',
    'Non normalizzare nomi/brand. Rispondi SOLO JSON:',
    '{ "store":"", "purchaseDate":"", "purchases":[{"name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","priceEach":0,"priceTotal":0,"currency":"EUR","expiresAt":""}] }',
    'Quantità SOLO se esplicite (2x6, 2 confezioni da 6, 6 bottiglie). Pesi/volumi NON sono quantità.',
    '--- INIZIO OCR ---', ocrText, '--- FINE OCR ---'
  ].join('\n');
}

async function ocrWithVisionOrFallback(files) {
  // 1) Prova Vision: ci aspettiamo { ok:true, purchases?, store?, purchaseDate?, text? }
  try {
    const fd = new FormData();
    files.forEach((f,i)=>fd.append('images', f, f.name || `img_${i}.jpg`));
    fd.append('task','receipt');
    const vRes = await fetchJSONStrict(API_VISION, { method:'POST', body: fd }, 60000);
    if (vRes && (Array.isArray(vRes.purchases) || vRes.text)) return vRes;
  } catch (e){ if (DEBUG) console.warn('[Vision fail]', e); }

  // 2) Fallback OCR testo
  const fd = new FormData();
  files.forEach((f,i)=>fd.append('images', f, f.name || `img_${i}.jpg`));
  const ocr = await fetchJSONStrict(API_OCR, { method:'POST', body: fd }, 60000);
  return { ok:true, text: String(ocr?.text||ocr?.data||'') };
}

/* =====================================================================================
   SANITIZZAZIONI / PARSER
===================================================================================== */
const MEASURE_TOKEN_RE = /\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|lt|ml|cl|m³|m3|mq|m²|cm|mm)\b/gi;
const DIMENSION_RE     = /\b\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?\s*(?:cm|mm|m)\b/gi;
const SUSPECT_UPP = new Set([125,200,220,225,230,240,250,280,300,330,350,375,400,450,454,500,700,720,733,750,800,900,910,930,950,1000,1250,1500,1750,2000]);

function cleanupPurchasesQuantities(list){
  return (Array.isArray(list)?list:[]).map(p=>{
    const out={...p};
    const joined = `${String(out.name||'')} ${String(out.brand||'')}`.toLowerCase();
    const hasMeasure = (joined.match(MEASURE_TOKEN_RE)||[]).length>0 || (joined.match(DIMENSION_RE)||[]).length>0;
    const u = Math.max(0, Number(out.unitsPerPack||0));
    const packs = Math.max(0, Number(out.packs||0));
    const piecesHit = /\b(pz|pezzi|bottigli|capsul|pods|bust|lattin|vasett|rotol|fogli|uova|brick)\b/i
      .test(normKey(`${out.unitLabel||''} ${joined}`));
    const looksWeightNumber = !piecesHit && (hasMeasure || SUSPECT_UPP.has(u));
    if ((hasMeasure && u>1) || looksWeightNumber){
      out.unitsPerPack = 1; out.unitLabel = 'unità'; if (!packs) out.packs = 1;
    }
    return out;
  });
}

function parseReceiptPurchases(ocrText){
  const rawLines = String(ocrText||'').split(/\r?\n/).map(s=>s.replace(/\s{2,}/g,' ').trim()).filter(Boolean);
  const lines=[];
  for (const ln of rawLines){
    if (/^\d+\s*[xX]\s*\d+(?:[.,]\d{2})(?:\s+\d+(?:[.,]\d{2}))?\s*$/i.test(ln)){
      if (lines.length) lines[lines.length-1]+=' '+ln; else lines.push(ln);
      continue;
    }
    lines.push(ln);
  }
  const HEADER=/^\s*(totale|subtotale|di\s*cui\s*iva|iva\b|pagamento|resto|importo|pezz[i]?|cassa|cassiere|transaz|documento|documento\s+commerciale|descrizione|prezzo|\beuro\b|€|negozio|p\.?iva|tel|maxistore|deco)\b/i;
  const IGNORE=/\b(shopper|sacchetto|busta|cauzione|vuoto|off\.)\b/i;

  const out=[];
  for (let raw of lines){
    if (HEADER.test(raw)) continue;
    if (/^\d{6,}$/.test(raw)) continue;
    let work = raw.replace(/^[T*+\-]+\s*/, '').trim();
    if (!work) continue;

    let packsFromTail=null;
    const tailQty=work.match(/(\d+)\s*[xX]\s*\d+(?:[.,]\d{2})(?:\s+\d+(?:[.,]\d{2}))?\s*$/);
    if (tailQty){ packsFromTail=parseInt(tailQty[1],10); work = work.replace(tailQty[0],'').trim(); }

    work = work
      .replace(/\s+\d{1,2}%\s+\d+(?:[.,]\d{2})\s*$/i,'')
      .replace(/(?:€|eur|euro)\s*\d+(?:[.,]\d{2})\s*$/i,'')
      .replace(/\s+\d+(?:[.,]\d{2})\s*$/i,'')
      .trim();

    if (IGNORE.test(work)) continue;

    let packsInline=null; const mInline=work.match(/\b[xX]\s*(\d+)\b/);
    if (mInline){ packsInline=parseInt(mInline[1],10); work=work.replace(mInline[0],'').trim(); }

    work = work.replace(/\b(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|lt))\b/gi,'')
               .replace(/\s{2,}/g,' ')
               .trim();

    let name=work, brand='';
    const parts=name.split(' ');
    if (parts.length>1 && /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9\-'.]*$/.test(parts[parts.length-1])){
      brand=parts.pop(); name=parts.join(' ');
    }

    const txt=name.toLowerCase();
    if (/prezzemol/.test(txt)) name='prezzemolo';
    else if (/pane\s+e\s+pizza/.test(txt)) name='farina pane e pizza';
    else if (/pecor.*igt/.test(txt)) name='vino pecorino igt';
    else if (/pan\s+bauletto/.test(txt)) name='pan bauletto bianco';
    else if (/yo-?yo/.test(txt)) name='merendine yo-yo';
    else if (/lacca\b/i.test(name)) name='lacca per capelli';
    else if (/pantene.*shampoo/i.test(name)) name='shampoo';
    else if (/latte\s+zymil/i.test(name)) name='latte';
    else if (/salsiccia/i.test(name)) name='salsiccia';
    else if (/candeggin/i.test(name) || /ace/i.test(brand)) name='candeggina';
    else if (/\bcaff[eè]\b/.test(txt)) name='caffè';

    const packs=packsFromTail||packsInline||1;

    out.push({
      name:name.trim(), brand:brand||'', packs:Math.max(1,packs),
      unitsPerPack:1, unitLabel:'unità', expiresAt:''
    });
  }
  return out;
}

function parseReceiptMeta(ocrText){
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  let purchaseDate=''; for (const ln of lines){ const iso=toISODate(ln); if (iso){ purchaseDate=iso; break; } }
  const bad=/(totale|iva|imp|euro|€|tel|cassa|scontrino|fiscale|subtot|pagamento|contanti|resto)/i;
  let store=''; for(const ln of lines){ const hasLetters=/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(ln); if (hasLetters && !bad.test(ln) && ln.length>=3){ store=ln.replace(/\s{2,}/g,' ').trim(); break; } }
  return { store, purchaseDate };
}

function toISODate(any){
  const s=String(any||'').trim(); if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const num=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (num){ const d=String(num[1]).padStart(2,'0'); const M=String(num[2]).padStart(2,'0'); let y=String(num[3]); if (y.length===2) y=(Number(y)>=70?'19':'20')+y; return `${y}-${M}-${d}`; }
  const mIt=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  const mm=s.toLowerCase().match(/(\d{1,2})\s+([a-zà-ú]+)\s+(\d{2,4})/i);
  if (mm){ const d=String(mm[1]).padStart(2,'0'); const mon=mm[2].slice(0,3); const idx=mIt.indexOf(mon); if (idx>=0){ let y=String(mm[3]); if (y.length===2) y=(Number(y)>=70?'19':'20')+y; const M=String(idx+1).padStart(2,'0'); return `${y}-${M}-${d}`; } }
  return '';
}

/* =====================================================================================
   SCORTE: calcoli
===================================================================================== */
function clamp01(x){ return Math.max(0, Math.min(1, Number(x)||0)); }
function residueUnitsOf(s){
  const upp=Math.max(1, Number(s.unitsPerPack||1)); const ru=Number(s.residueUnits);
  if (s.packsOnly) return Math.max(0, Number(s.packs||0));
  if (Number.isFinite(ru)) return Math.max(0, ru);
  return Math.max(0, Number(s.packs||0)*upp);
}
function baselineUnitsOf(s){
  const upp=Math.max(1, Number(s.unitsPerPack||1));
  if (s.packsOnly) return Math.max(1, Number(s.baselinePacks||s.packs||1));
  const bp=Number(s.baselinePacks); const base=(Number.isFinite(bp)&&bp>0?bp*upp:Number(s.packs||0)*upp);
  return Math.max(upp, base);
}
function residueInfo(s){ const current=residueUnitsOf(s), baseline=baselineUnitsOf(s); const pct=baseline?clamp01(current/baseline):1; return { current, baseline, pct }; }
const RESIDUE_THRESHOLDS = { green: .60, amber: .30 };
function colorForPct(p){ const x=clamp01(p); if (x>=RESIDUE_THRESHOLDS.green) return '#16a34a'; if (x>=RESIDUE_THRESHOLDS.amber) return '#f59e0b'; return '#ef4444'; }
function computeNewAvgDailyUnits(old, newPacks){
  const upp=Math.max(1, Number(old.unitsPerPack||1));
  const oldUnits=Number(old.packs||0)*upp, newUnits=Number(newPacks||0)*upp;
  let avg=old?.avgDailyUnits||0;
  if (old?.lastRestockAt && newUnits<oldUnits){
    const days=Math.max(1,(Date.now()-new Date(old.lastRestockAt).getTime())/86400000);
    const usedUnits=oldUnits-newUnits; const day=usedUnits/days;
    avg = avg ? (0.6*avg + 0.4*day) : day;
  }
  return avg;
}
function restockTouch(baselineFromPacks, lastDateISO, unitsPerPack){
  const upp=Math.max(1, Number(unitsPerPack||1)); const bp=Math.max(0, Number(baselineFromPacks||0)); const fullUnits=bp*upp;
  return { baselinePacks:bp, lastRestockAt:lastDateISO, residueUnits:fullUnits };
}

/* =====================================================================================
   MISC UTIL
===================================================================================== */
let __reviewSetters = null;
function registerReviewSetters(setters){ __reviewSetters=setters; }
function nonEmpty(s){ return String(s||'').trim(); }
function intOr(x, d=0){ const n=Number(String(x).replace(',','.')); return Number.isFinite(n)?Math.trunc(n):d; }
function posIntOr(x, d=0){ return Math.max(0, intOr(x,d)); }

function guessProductName(chunk){
  let best='', bestLen=0;
  for (const lex of GROCERY_LEXICON){ if (isSimilar(chunk, lex) && lex.length>bestLen){ best=lex; bestLen=lex.length; } }
  if (!best){ const t=normKey(chunk).split(' ').filter(Boolean); if (t.length) best=t.slice(0,2).join(' '); }
  return best.trim();
}

/* =====================================================================================
   COMPONENTE
===================================================================================== */
function ListeProdotti(){
  // Liste
  const [currentList, setCurrentList] = useState(LIST_TYPES.SUPERMARKET);
  const [lists, setLists] = useState({ [LIST_TYPES.SUPERMARKET]:[], [LIST_TYPES.ONLINE]:[] });
  const [form, setForm] = useState({ name:'', brand:'', packs:'1', unitsPerPack:'1', unitLabel:'unità' });
  const [showListForm, setShowListForm] = useState(false);

  // Scorte
  const [stock, setStock] = useState([]);
  const [critical, setCritical] = useState([]);

  // UI
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null), 1800); };

  // Edit riga scorte
  const [editingRow, setEditingRow] = useState(null);
  const [editDraft, setEditDraft] = useState({ name:'', brand:'', packs:'0', unitsPerPack:'1', unitLabel:'unità', expiresAt:'', residueUnits:'0', _ruTouched:false });

  // Review (stub, disattivata)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState([]);
  const [reviewPick, setReviewPick] = useState({});
  const [pendingOcrMeta, setPendingOcrMeta] = useState(null);
  useEffect(()=>{ registerReviewSetters({ setReviewItems, setReviewPick, setPendingOcrMeta, setReviewOpen }); },[]);

  // Learning
  const [learned, setLearned] = useState({ products:{}, aliases:{product:{},brand:{}}, keepTerms:{}, discardTerms:{} });

  // Vocale lista
  const recMimeRef = useRef({ mime:'audio/webm;codecs=opus', ext:'webm' });
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // Vocale inventario
  const invMediaRef = useRef(null);
  const invChunksRef = useRef([]);
  const invStreamRef = useRef(null);
  const [invRecBusy, setInvRecBusy] = useState(false);

  // OCR inputs
  const ocrInputRef = useRef(null);
  const rowOcrInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);

  // Upload immagine per riga scorte
  const rowImageInputRef = useRef(null);
  const [targetImageIdx, setTargetImageIdx] = useState(null);

  // Scorte manuali (UI opzionale)
  const [showStockForm, setShowStockForm] = useState(false);
  const [stockForm, setStockForm] = useState({ name:'', brand:'', packs:'1', unitsPerPack:'1', unitLabel:'unità', expiresAt:'' });

  // Scadenze manuali
  const [showExpiryForm, setShowExpiryForm] = useState(false);
  const [expiryForm, setExpiryForm] = useState({ name:'', expiresAt:'' });

  // Immagini memo
  const [imagesIndex, setImagesIndex] = useState({});

  // Persist debounce + cross-tab timestamp
  const persistTimerRef = useRef(null);
  const lastLocalAtRef = useRef(0);

  // CLOUD sync
  const userIdRef = useRef(null);
  const cloudTimerRef = useRef(null);

  /* ---------- Cloud: load iniziale ---------- */
  useEffect(()=>{
    if (!CLOUD_SYNC) return;
    let mounted = true;
    (async ()=>{
      try{
        const mod = await import('@/lib/supabaseClient').catch(()=>null);
        if (!mod?.supabase) return;
        __supabase = mod.supabase;

        const { data: userData } = await __supabase.auth.getUser();
        const uid = userData?.user?.id || null;
        if (mounted) userIdRef.current = uid;
        if (!uid) return;

        const { data: row, error } = await __supabase.from(CLOUD_TABLE).select('state').eq('user_id', uid).maybeSingle();
        if (error){ const msg=(error.message||'').toLowerCase(); if (!(error.code==='42703' || (msg.includes('column')&&msg.includes('does not exist')))) { if (DEBUG) console.warn('[cloud] load error',error);} return; }
        const st=row?.state; if (!st) return;

        setLists({
          [LIST_TYPES.SUPERMARKET]: Array.isArray(st.lists?.[LIST_TYPES.SUPERMARKET]) ? st.lists[LIST_TYPES.SUPERMARKET] : [],
          [LIST_TYPES.ONLINE]:      Array.isArray(st.lists?.[LIST_TYPES.ONLINE])      ? st.lists[LIST_TYPES.ONLINE]      : [],
        });
        if (Array.isArray(st.stock)) setStock(st.stock);
        if ([LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].includes(st.currentList)) setCurrentList(st.currentList);
        if (st.learned && typeof st.learned==='object') setLearned(st.learned);
        if (st.imagesIndex && typeof st.imagesIndex==='object') setImagesIndex(st.imagesIndex);
      }catch(e){ if (DEBUG) console.warn('[cloud init] skipped', e); }
    })();
    return ()=>{ mounted=false; };
  },[]);

  /* ---------- Cloud: upsert debounce ---------- */
  useEffect(()=>{
    if (!CLOUD_SYNC || !__supabase) return;
    if (!userIdRef.current) return;
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    const cloudState = stripForCloud({ lists, stock, currentList, learned, imagesIndex });
    const payload = { user_id: userIdRef.current, state: cloudState };
    cloudTimerRef.current = setTimeout(async ()=>{
      try{ await __supabase.from(CLOUD_TABLE).upsert(payload, { onConflict:'user_id' }); }
      catch(e){ if (DEBUG) console.warn('[cloud upsert] fail', e); }
    }, 1200);
    return ()=>clearTimeout(cloudTimerRef.current);
  },[lists, stock, currentList, learned, imagesIndex]);

  /* ---------- Hydration locale ---------- */
  useEffect(()=>{
    if (typeof window==='undefined') return;
    const saved=loadPersisted(); if (!saved) return;
    if (saved.lists && typeof saved.lists==='object') {
      setLists({
        [LIST_TYPES.SUPERMARKET]: Array.isArray(saved.lists[LIST_TYPES.SUPERMARKET]) ? saved.lists[LIST_TYPES.SUPERMARKET] : [],
        [LIST_TYPES.ONLINE]:      Array.isArray(saved.lists[LIST_TYPES.ONLINE])      ? saved.lists[LIST_TYPES.ONLINE]      : [],
      });
    }
    if (Array.isArray(saved.stock)) setStock(saved.stock);
    if (saved.currentList && (saved.currentList===LIST_TYPES.SUPERMARKET || saved.currentList===LIST_TYPES.ONLINE)) setCurrentList(saved.currentList);
    if (saved.imagesIndex && typeof saved.imagesIndex==='object') setImagesIndex(saved.imagesIndex);
    if (saved.learned && typeof saved.learned==='object') setLearned(saved.learned);
  },[]);

  /* ---------- Autosave locale ---------- */
  useEffect(()=>{
    if (typeof window==='undefined') return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    const snapshot={ lists, stock, currentList, imagesIndex, learned };
    persistTimerRef.current=setTimeout(()=>{
      try{
        persistNow(snapshot, learned);
        lastLocalAtRef.current = Date.now();
      }catch(e){ if (DEBUG) console.warn('[persistNow] failed', e); }
    }, 350);
    return ()=>{ if (persistTimerRef.current) clearTimeout(persistTimerRef.current); };
  },[lists, stock, currentList, imagesIndex, learned]);

  /* ---------- Sync tra tab ---------- */
  useEffect(()=>{
    if (typeof window==='undefined') return;
    const onStorage = ()=>{
      const saved=loadPersisted();
      if (!saved || saved.v!==LS_VER) return;
      const savedAt=Number(saved.at||0);
      if (savedAt && savedAt < Number(lastLocalAtRef.current||0)) return;
      setLists({
        [LIST_TYPES.SUPERMARKET]: Array.isArray(saved.lists?.[LIST_TYPES.SUPERMARKET]) ? saved.lists[LIST_TYPES.SUPERMARKET] : [],
        [LIST_TYPES.ONLINE]:      Array.isArray(saved.lists?.[LIST_TYPES.ONLINE])      ? saved.lists[LIST_TYPES.ONLINE]      : [],
      });
      setStock(Array.isArray(saved.stock)?saved.stock:[]);
      setCurrentList(saved.currentList===LIST_TYPES.ONLINE?LIST_TYPES.ONLINE:LIST_TYPES.SUPERMARKET);
      setImagesIndex(saved.imagesIndex && typeof saved.imagesIndex==='object'?saved.imagesIndex:{});
      lastLocalAtRef.current = savedAt || Date.now();
    };
    window.addEventListener('storage', onStorage);
    return ()=>window.removeEventListener('storage', onStorage);
  },[]);

  /* ---------- Critici ---------- */
  useEffect(()=>{
    const crit=(stock||[]).filter(p=>{
      const { current, baseline } = residueInfo(p);
      const lowResidue = baseline ? (current/baseline)<0.20 : false;
      const expSoon = daysToExpiry(p?.expiresAt)<=10;
      return lowResidue || expSoon;
    });
    setCritical(crit);
  },[stock]);

  /* ---------- Azioni LISTE ---------- */
  function addManualItem(e){
    e.preventDefault();
    const name=form.name.trim(); if (!name) return;
    const brand=form.brand.trim();
    const packs=Math.max(1, Number(String(form.packs).replace(',','.'))||1);
    const unitsPerPack=Math.max(1, Number(String(form.unitsPerPack).replace(',','.'))||1);
    const unitLabel=(form.unitLabel||'unità').trim()||'unità';

    setLists(prev=>{
      const next={...prev}; const items=[...(prev[currentList]||[])];
      const idx = items.findIndex(i =>
        i.name.toLowerCase()===name.toLowerCase() &&
        (i.brand||'').toLowerCase()===brand.toLowerCase() &&
        Number(i.unitsPerPack||1)===unitsPerPack
      );
      if (idx>=0) items[idx]={...items[idx], qty:Math.max(0, Number(items[idx].qty||0)+packs)};
      else items.push({ id:'tmp-'+Math.random().toString(36).slice(2), name, brand, qty:packs, unitsPerPack, unitLabel, purchased:false });
      next[currentList]=items; return next;
    });
    lastLocalAtRef.current=Date.now();
    setForm({ name:'', brand:'', packs:'1', unitsPerPack:'1', unitLabel:'unità' });
    setShowListForm(false);
  }
  function removeItem(id){
    setLists(prev=>{ const next={...prev}; next[currentList]=(prev[currentList]||[]).filter(i=>i.id!==id); return next; });
    lastLocalAtRef.current=Date.now();
  }
  function incQty(id, delta){
    setLists(prev=>{
      const next={...prev};
      next[currentList]=(prev[currentList]||[])
        .map(i => (i.id===id ? { ...i, qty:Math.max(0, Number(i.qty||0)+delta) } : i))
        .filter(i=>i.qty>0);
      return next;
    });
    lastLocalAtRef.current=Date.now();
  }

  /* ---------- Edit scorte ---------- */
  function startRowEdit(index,row){
    const initRU=String(Number(row.packs||0)*Number(row.unitsPerPack||1));
    setEditingRow(index);
    setEditDraft({
      name:row.name||'', brand:row.brand||'',
      packs:String(Number(row.packs??0)), unitsPerPack:String(Number(row.unitsPerPack??1)),
      unitLabel:row.unitLabel||'unità',
      expiresAt:row.expiresAt||'',
      residueUnits: row.packsOnly ? String(Number(row.packs||0)) : (row.residueUnits ?? initRU),
      _ruTouched:false
    });
  }
  function handleEditDraftChange(field, value){ setEditDraft(prev=>({ ...prev, [field]:value, ...(field==='residueUnits'?{_ruTouched:true}:null) })); }
  function cancelRowEdit(){ setEditingRow(null); setEditDraft({ name:'',brand:'',packs:'0',unitsPerPack:'1',unitLabel:'unità',expiresAt:'',residueUnits:'0',_ruTouched:false }); }

  function saveRowEdit(index){
    setStock(prev=>{
      const arr=[...prev]; const old=arr[index]; if (!old) return prev;
      const name=(editDraft.name||'').trim(); const brand=(editDraft.brand||'').trim();
      const unitsPerPack=Math.max(1, Number(String(editDraft.unitsPerPack).replace(',','.'))||1);
      const unitLabel=(editDraft.unitLabel||'unità').trim()||'unità';
      const expiresAt=toISODate(editDraft.expiresAt||'');
      const newPacks=Math.max(0, Number(String(editDraft.packs).replace(',','.'))||0);
      const todayISO=new Date().toISOString().slice(0,10);

      const uppOld=Math.max(1, Number(old.unitsPerPack||1));
      const wasUnits= old.packsOnly ? Number(old.packs||0) : (Number(old.packs||0)*uppOld);
      const nowUnits=newPacks*unitsPerPack;
      const restock=nowUnits>wasUnits;

      let ru=residueUnitsOf(old);
      if (editDraft._ruTouched){ const ruRaw=Number(String(editDraft.residueUnits??'').replace(',','.')); if (Number.isFinite(ruRaw)) ru=Math.max(0, ruRaw); }
      const fullNow=Math.max(unitsPerPack, nowUnits); if (!old.packsOnly) ru=Math.min(ru, fullNow);
      const avgDailyUnits=computeNewAvgDailyUnits(old, newPacks);

      let next={ ...old, name, brand, packs:newPacks, unitsPerPack, unitLabel, expiresAt, avgDailyUnits, packsOnly:false };
      if (restock) next={ ...next, ...restockTouch(newPacks, todayISO, unitsPerPack) };
      else next.residueUnits = old.packsOnly ? Math.max(0, Number(newPacks)) : ru;

      arr[index]=next; return arr;
    });
    setEditingRow(null);
  }

  /* ---------- Immagini riga ---------- */
  async function handleRowImage(files, idx){
    const file=(files&&files[0])||null; if (!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const dataUrl=String(reader.result||'');
      setStock(prev=>{
        const arr=[...prev]; if (!arr[idx]) return prev;
        const updated={ ...arr[idx], image:dataUrl }; arr[idx]=updated;
        const key=productKey(updated.name, updated.brand||'');
        setImagesIndex(prevIdx=>({ ...prevIdx, [key]: dataUrl }));
        return arr;
      });
      showToast('Immagine prodotto aggiornata ✓', 'ok');
    };
    reader.readAsDataURL(file);
  }

  /* ---------- Voce: Lista ---------- */
  async function toggleRecList(){
    if (recBusy){ try{ mediaRecRef.current?.stop(); }catch{} return; }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({ audio:true });
      streamRef.current=stream; mediaRecRef.current=new MediaRecorder(stream);
      recordedChunks.current=[]; mediaRecRef.current.ondataavailable=(e)=>{ if (e.data?.size) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop=processVoiceList;
      mediaRecRef.current.start(); setRecBusy(true);
    }catch{ alert('Microfono non disponibile'); }
  }
  async function processVoiceList(){
    const blob=new Blob(recordedChunks.current, { type:'audio/webm' });
    const fd=new FormData(); fd.append('audio', blob, 'voice.webm');
    try{
      setBusy(true);
      const res=await timeoutFetch(API_STT,{method:'POST', body:fd},25000);
      const j=await res.json().catch(()=>({}));
      const text=String(j?.text||'').trim(); if (!text) throw new Error('Testo non riconosciuto');

      // Prova Assistant parsing
      let appended=false;
      try{
        const payload = {
          prompt:[
            'Sei Jarvis. Capisci una LISTA SPESA. Rispondi SOLO JSON:',
            '{ "items":[{ "name":"latte","brand":"Parmalat","packs":2,"unitsPerPack":6,"unitLabel":"bottiglie" }]}',
            'Se manca brand "", packs 1, unitsPerPack 1, unitLabel "unità".',
            'Voci comuni: '+GROCERY_LEXICON.join(', '),
            'Testo:', text
          ].join('\n')
        };
        const r=await timeoutFetch(API_ASSISTANT_TEXT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},25000);
        const safe=await r.json().catch(()=>null);
        const answer = safe?.answer || safe?.data || safe;
        const parsed = typeof answer==='string' ? (()=>{
          try{ return JSON.parse(answer); }catch{ return null; }
        })() : answer;
        const arr = Array.isArray(parsed?.items) ? parsed.items : [];
        if (arr.length){
          setLists(prev=>{
            const next={...prev}; const target=currentList; const existing=[...(prev[target]||[])];
            for (const raw of arr){
              const it={
                id:'tmp-'+Math.random().toString(36).slice(2),
                name:String(raw.name||'').trim(),
                brand:String(raw.brand||'').trim(),
                qty:Math.max(1, Number(raw.packs||raw.qty||1)),
                unitsPerPack:Math.max(1, Number(raw.unitsPerPack||1)),
                unitLabel:String(raw.unitLabel||'unità'), purchased:false
              };
              if (!it.name) continue;
              const idx=existing.findIndex(i =>
                i.name.toLowerCase()===it.name.toLowerCase() &&
                (i.brand||'').toLowerCase()===it.brand.toLowerCase() &&
                Number(i.unitsPerPack||1)===Number(it.unitsPerPack||1)
              );
              if (idx>=0) existing[idx]={...existing[idx], qty:Number(existing[idx].qty||0)+it.qty};
              else existing.push(it);
            }
            next[target]=existing; return next;
          });
          appended=true;
        }
      }catch{}

      if (!appended){
        // Fallback: split semplice
        const items = text.split(/[,;\n]+/g).map(s=>s.trim()).filter(Boolean);
        if (items.length){
          setLists(prev=>{
            const next={...prev}; const target=currentList; const existing=[...(prev[target]||[])];
            for (const raw of items){
              const name=guessProductName(raw)||raw;
              const it={ id:'tmp-'+Math.random().toString(36).slice(2), name, brand:'', qty:1, unitsPerPack:1, unitLabel:'unità', purchased:false };
              const idx=existing.findIndex(i =>
                i.name.toLowerCase()===it.name.toLowerCase() &&
                (i.brand||'').toLowerCase()===(it.brand||'').toLowerCase() &&
                Number(i.unitsPerPack||1)===Number(it.unitsPerPack||1)
              );
              if (idx>=0) existing[idx]={...existing[idx], qty:Number(existing[idx].qty||0)+1};
              else existing.push(it);
            }
            next[target]=existing; return next;
          });
          appended=true;
        }
      }
      showToast(appended ? 'Lista aggiornata da Vocale ✓' : 'Nessun elemento riconosciuto', appended?'ok':'err');
    }catch{ alert('Errore nel riconoscimento vocale'); }
    finally{
      setRecBusy(false); setBusy(false);
      try{ streamRef.current?.getTracks?.().forEach(t=>t.stop()); }catch{}
      mediaRecRef.current=null; streamRef.current=null; recordedChunks.current=[];
    }
  }

  /* ---------- Voce: Inventario ---------- */
  async function toggleVoiceInventory(){
    if (invRecBusy){ try{ invMediaRef.current?.stop(); }catch{} return; }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({ audio:true });
      invStreamRef.current=stream;
      invMediaRef.current=new MediaRecorder(stream);
      invChunksRef.current=[]; invMediaRef.current.ondataavailable=(e)=>{ if (e?.data && e.data.size) invChunksRef.current.push(e.data); };
      invMediaRef.current.onstop=processVoiceInventory;
      invMediaRef.current.start(500);
      setInvRecBusy(true);
    }catch{ alert('Microfono non disponibile'); }
  }
  async function processVoiceInventory(){
    try{
      try{ invStreamRef.current?.getTracks?.().forEach(t=>t.stop()); }catch{}
      setInvRecBusy(false);

      if (!invChunksRef.current.length){ showToast('Nessun audio catturato','err'); return; }
      const blob=new Blob(invChunksRef.current, { type:'audio/webm' }); invChunksRef.current=[];
      const fd=new FormData(); fd.append('audio', blob, 'inventory.webm');

      setBusy(true);
      const res=await timeoutFetch(API_STT,{method:'POST', body:fd},25000);
      const payload=await res.json().catch(()=>({})); if (!res.ok) throw new Error(payload?.error||`HTTP ${res.status}`);
      const text=String(payload?.text||'').trim(); if (!text) throw new Error('Testo non riconosciuto');

      // Scadenze
      const expPairs = parseExpiryPairs(text, GROCERY_LEXICON, stock.map(s=>s.name));
      if (expPairs.length){
        setStock(prev=>{
          const arr=[...prev];
          for (const ex of expPairs){
            const i=arr.findIndex(s=>isSimilar(s.name, ex.name));
            if (i>=0) arr[i]={ ...arr[i], expiresAt: ex.expiresAt };
            else arr.unshift({ name:ex.name, brand:'', packs:0, unitsPerPack:1, unitLabel:'unità', expiresAt:ex.expiresAt, baselinePacks:0, lastRestockAt:'', avgDailyUnits:0, residueUnits:0, packsOnly:false });
          }
          return arr;
        });
      }

      // Quantità
      const t=normKey(text);
      const wantsAbs = /(porta\s+a|imposta\s+a|metti\s+a|fissa\s+a|in\s+totale|totali|ora\s+sono|adesso\s+sono|fai\s+che\s+siano)/i.test(t);
      const UNIT = UNIT_SYNONYMS; const PACK=PACK_SYNONYMS;
      const parts = t.split(/[,;]+/g).map(s=>s.trim()).filter(Boolean);
      const updates=[];
      const WORD_MAP = { un:1, uno:1, una:1, due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7, otto:8, nove:9, dieci:10 };

      for (const rawChunk of parts){
        if (/scad|scadenza|scade|entro/.test(rawChunk)) continue;
        if (/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(rawChunk)) continue;
        if (/\b20\d{2}\b/.test(rawChunk)) continue;

        const chunks = rawChunk.split(/\s+e\s+/g).map(s=>s.trim()).filter(Boolean);
        for (const chunk of chunks){
          const name=guessProductName(chunk); if (!name) continue;
          const src = chunk.replace(/\b(un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/gi, (m)=>WORD_MAP[m.toLowerCase()] ?? m);

          let m = src.match(new RegExp(`(\\d+)\\s*${PACK}\\s*(?:da|x)\\s*(\\d+)\\s*(?:${UNIT})?`,'i'));
          if (m){ updates.push({ name, mode:'packs', value:Number(m[1]), _upp:Number(m[2]), explicit:true, forceSet:wantsAbs }); continue; }

          m = src.match(/(\d+)\s*[x×]\s*(\d+)/i);
          if (m){ updates.push({ name, mode:'packs', value:Number(m[1]), _upp:Number(m[2]), explicit:true, forceSet:wantsAbs }); continue; }

          m = src.match(new RegExp(`(\\d+)\\s*${PACK}.*?\\b(\\d+)\\s*(?:${UNIT})?`,'i'));
          if (m){ updates.push({ name, mode:'packs', value:Number(m[1]), _upp:Number(m[2]), explicit:true, forceSet:wantsAbs }); continue; }

          m = src.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIT})\\b`,'i'));
          if (m){ updates.push({ name, mode:'units', value:Number(String(m[1]).replace(',','.')), forceSet:wantsAbs }); continue; }

          m = src.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${PACK})\\b`,'i'));
          if (m){ updates.push({ name, mode:'packs', value:Number(String(m[1]).replace(',','.')), forceSet:wantsAbs }); continue; }

          const mNum = src.match(/(\d+(?:[.,]\d+)?)\s*$/);
          if (mNum){ const v=Number(String(mNum[1]).replace(',','.')); updates.push({ name, mode:'units', value:v, forceSet:wantsAbs }); }
        }
      }

      if (updates.length){
        setStock(prev=>{
          const arr=[...prev]; const todayISO=new Date().toISOString().slice(0,10);
          const unitsUpdated=new Set();
          for (const u of updates){
            const j=arr.findIndex(s=>isSimilar(s.name,u.name));
            const abs=!!u.forceSet;

            if (j<0){
              if (u.mode==='packs'){
                const packs=Math.max(0, Number(u.value||0));
                if (u.explicit && Number(u._upp||1)>1){
                  const up=Math.max(1, Number(u._upp||1));
                  const row={ name:u.name, brand:'', packs, unitsPerPack:up, unitLabel:'unità', expiresAt:'', ...restockTouch(packs, todayISO, up), avgDailyUnits:0, packsOnly:false };
                  arr.unshift(row);
                }else{
                  const row={ name:u.name, brand:'', packs, unitsPerPack:1, unitLabel:'conf.', expiresAt:'', ...restockTouch(packs,todayISO,1), avgDailyUnits:0, packsOnly:true, residueUnits:packs };
                  arr.unshift(row);
                }
              }else{
                const units=Math.max(0, Number(u.value||1));
                arr.unshift({ name:u.name, brand:'', packs:1, unitsPerPack:1, unitLabel:'unità', expiresAt:'', baselinePacks:1, lastRestockAt:todayISO, avgDailyUnits:0, residueUnits:units, packsOnly:false });
                unitsUpdated.add(normKey(u.name));
              }
              continue;
            }

            const old=arr[j];
            if (u.mode==='packs'){
              const uppFromVoice=Math.max(1, Number(u._upp||1));
              const packsNew = abs ? Math.max(0, Number(u.value||0)) : Math.max(0, Number(old.packs||0) + Number(u.value||0));
              if (u.explicit && uppFromVoice>1){
                arr[j]={ ...old, packs:packsNew, unitsPerPack:uppFromVoice, unitLabel:old.unitLabel||'unità', packsOnly:false, ...restockTouch(packsNew, todayISO, uppFromVoice) };
              }else{
                arr[j]={ ...old, packs:packsNew, unitsPerPack:1, unitLabel:'conf.', packsOnly:true, residueUnits:packsNew, ...restockTouch(packsNew, todayISO, 1) };
              }
            }else{ // units
              const upp=Math.max(1, Number(old.unitsPerPack||1));
              const baseline=baselineUnitsOf(old)||upp;
              const current=residueUnitsOf(old);
              const targetUnits = abs ? Math.max(0, Math.min(Number(u.value||0), baseline)) : Math.max(0, Math.min(current + Number(u.value||0), baseline));
              arr[j]={ ...old, packsOnly:false, residueUnits:targetUnits };
              unitsUpdated.add(normKey(u.name));
            }
          }
          if (unitsUpdated.size>0){
            for (let k=0;k<arr.length;k++){
              const row=arr[k]; if (!row) continue;
              if (!unitsUpdated.has(normKey(row.name))) continue;
              const upp=Math.max(1, Number(row.unitsPerPack||1));
              if (upp>1 && Number.isFinite(Number(row.residueUnits))){
                const ruInt=Math.max(0, Math.round(Number(row.residueUnits)));
                const newPacks = ruInt===0 ? 0 : (ruInt % upp === 0 ? Math.max(1, ruInt/upp) : 1);
                if (newPacks !== Number(row.packs||0)) arr[k]={ ...row, packs:newPacks };
              }
            }
          }
          return arr;
        });
      }

      showToast((expPairs.length||updates.length)?'Inventario aggiornato da Vocale ✓':'Nessun dato inventario riconosciuto', (expPairs.length||updates.length)?'ok':'err');
    }catch(e){ console.error('[voice inventory] error', e); showToast(`Errore vocale inventario: ${e?.message||e}`,'err'); }
    finally{ setBusy(false); invMediaRef.current=null; invStreamRef.current=null; }
  }

  /* ---------- OCR Scontrino/Busta → Scorte ---------- */
  async function downscaleImageFile(file,{maxSide=OCR_IMAGE_MAXSIDE,quality=OCR_IMAGE_QUALITY}={}){
    try{
      if (!file || file.type==='application/pdf' || !/^image\//i.test(file.type)) return file;
      const getBitmap=async(blob)=>{
        if (typeof window!=='undefined' && window.createImageBitmap) return await createImageBitmap(blob);
        const dataUrl=await new Promise((ok,ko)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=ko; r.readAsDataURL(blob); });
        const img=new Image(); await new Promise((ok,ko)=>{ img.onload=ok; img.onerror=ko; img.src=dataUrl; }); return img;
      };
      const bmp=await getBitmap(file);
      const w0=bmp.width||bmp.naturalWidth, h0=bmp.height||bmp.naturalHeight;
      const scale=Math.min(1, maxSide/Math.max(w0,h0)); if (scale===1 && file.size<=1_200_000) return file;
      const w=Math.max(1, Math.round(w0*scale)), h=Math.max(1, Math.round(h0*scale));
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d'); ctx.drawImage(bmp,0,0,w,h);
      const blob=await new Promise(ok=>canvas.toBlob(ok,'image/jpeg',quality)); if (!blob) return file;
      if (blob.size>=file.size) return file;
      const base=(file.name||'upload').replace(/\.\w+$/,''); return new File([blob], `${base}.jpg`, { type:'image/jpeg' });
    }catch{ return file; }
  }
  function sanitizeOcrText(t){
    const BAD=/(mi\s*dispiace|non\s*posso\s*aiut|cannot\s*assist|i\s*can't|policy|trascrizion)/i;
    return String(t||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).filter(s=>!BAD.test(s)).join('\n');
  }

  async function handleOCR(files){
    if (!files) return;
    try{
      setBusy(true);
      const picked = Array.from(files||[]).filter(f=>f && typeof f==='object' && typeof f.type==='string' && typeof f.size==='number');
      if (!picked.length) throw new Error('Nessuna immagine valida');

      const slim = await downscaleImageFile(picked[0], { maxSide:OCR_IMAGE_MAXSIDE, quality:OCR_IMAGE_QUALITY });
      const visionAns = await ocrWithVisionOrFallback([slim]);

      let store='', purchaseDate=''; let purchases=[];
      if (Array.isArray(visionAns?.purchases) && visionAns.purchases.length){
        purchases = visionAns.purchases.map(p=>({
          name:String(p?.name||'').trim(), brand:String(p?.brand||'').trim(),
          packs:Number(p?.packs||0), unitsPerPack:Number(p?.unitsPerPack||0),
          unitLabel:String(p?.unitLabel||'').trim(), priceEach:Number(p?.priceEach||0),
          priceTotal:Number(p?.priceTotal||0), currency:String(p?.currency||'EUR').trim()||'EUR',
          expiresAt:toISODate(p?.expiresAt||'')
        })).filter(p=>p.name);
        store = String(visionAns?.store||'').trim(); purchaseDate = toISODate(visionAns?.purchaseDate||'');
      } else {
        const ocrText = sanitizeOcrText(String(visionAns?.text||''));
        if (ocrText){
          // prova Assistant per parsing diretto
          try{
            const prompt = buildDirectReceiptPrompt(ocrText);
            const r = await timeoutFetch(API_ASSISTANT_TEXT, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt}) }, 45000);
            const safe=await r.json().catch(()=>null);
            const answer = safe?.answer || safe?.data || safe;
            const parsed = typeof answer==='string' ? ( ()=>{ try{return JSON.parse(answer);}catch{return null;} } )() : answer;
            if (parsed && Array.isArray(parsed.purchases)){
              purchases = parsed.purchases.map(p=>({
                name:String(p?.name||'').trim(), brand:String(p?.brand||'').trim(),
                packs:Number(p?.packs||0), unitsPerPack:Number(p?.unitsPerPack||0),
                unitLabel:String(p?.unitLabel||'').trim(), priceEach:Number(p?.priceEach||0),
                priceTotal:Number(p?.priceTotal||0), currency:String(p?.currency||'EUR').trim()||'EUR',
                expiresAt:toISODate(p?.expiresAt||'')
              })).filter(p=>p.name);
              store = String(parsed?.store||'').trim(); purchaseDate = toISODate(parsed?.purchaseDate||'');
            }
          }catch{}
          if (!purchases.length) purchases = parseReceiptPurchases(ocrText).map(p=>({ ...p, priceEach:0, priceTotal:0, currency:'EUR' }));
          if (!store && !purchaseDate){ const meta=parseReceiptMeta(ocrText); store=meta.store; purchaseDate=meta.purchaseDate; }
        }
      }

      if (!purchases.length){ showToast('Nessuna riga acquistata riconosciuta','err'); return; }

      // Normalizza quantità pazze
      purchases = cleanupPurchasesQuantities(purchases);

      // Enrich web: nomi/brand + immagini proxy
      let mergedImagesIndex=imagesIndex;
      try{
        const { items:enriched, images:imap } = await (async()=>await enrichPurchasesViaWeb(purchases))();
        if (Array.isArray(enriched) && enriched.length) purchases=enriched;
        mergedImagesIndex={ ...(imagesIndex||{}), ...(imap||{}) };
        setImagesIndex(mergedImagesIndex);
      }catch{}

      // Ricorda termini
      // (stub) rememberItems(purchases,{alsoLexicon:false});

      // Decrementa liste
      setLists(prev=>{
        const next={...prev};
        const dec = (listKey)=>{
          const arr=[...(next[listKey]||[])];
          for (const p of purchases){
            const decv=Math.max(1, Number(p.packs ?? p.qty ?? 1));
            const brand = (p.brand||'').trim(); const upp=Number(p.unitsPerPack??1);
            let idx = arr.findIndex(i=>isSimilar(i.name, p.name) && (!brand || isSimilar(i.brand||'', brand)) && Number(i.unitsPerPack||1)===upp);
            if (idx<0) idx = arr.findIndex(i=>isSimilar(i.name,p.name) && (!brand || isSimilar(i.brand||'',brand)));
            if (idx<0) idx = arr.findIndex(i=>isSimilar(i.name,p.name));
            if (idx>=0){ const cur=arr[idx]; const newQty=Math.max(0, Number(cur.qty||0)-decv); arr[idx]={...cur, qty:newQty, purchased:true}; }
          }
          next[listKey]=arr.filter(i=>Number(i.qty||0)>0 || !i.purchased);
        };
        dec(LIST_TYPES.SUPERMARKET); dec(LIST_TYPES.ONLINE);
        return next;
      });

      // Aggiorna scorte
      setStock(prev=>{
        const arr=[...prev]; const todayISO=new Date().toISOString().slice(0,10);
        for (const p of purchases){
          const idx=arr.findIndex(s=>isSimilar(s.name,p.name) && (!p.brand || isSimilar(s.brand||'',p.brand)));
          const packs=Math.max(0, Number(p.packs||0)); const upp=Math.max(1, Number(p.unitsPerPack||0));
          const hasCounts = packs>0 || upp>0;
          if (idx>=0){
            const old=arr[idx];
            if (hasCounts){
              const newP=Math.max(0, Number(old.packs||0) + (packs||0));
              const newU=Math.max(1, Number(old.unitsPerPack||upp||1));
              arr[idx]={ ...old, name:(p.name||old.name), brand:(p.brand||old.brand), packs:newP, unitsPerPack:newU, unitLabel:old.unitLabel||p.unitLabel||'unità', expiresAt:p.expiresAt||old.expiresAt||'', packsOnly:false, ...restockTouch(newP, todayISO, newU) };
            }else if (DEFAULT_PACKS_IF_MISSING){
              const uo=Math.max(1, Number(old.unitsPerPack||1));
              const np=Math.max(0, Number(old.packs||0)+1);
              arr[idx]={ ...old, name:(p.name||old.name), brand:(p.brand||old.brand), packs:np, unitsPerPack:uo, unitLabel:old.unitLabel||'unità', packsOnly:false, ...restockTouch(np, todayISO, uo) };
            }else{
              arr[idx]={ ...old, name:(p.name||old.name), brand:(p.brand||old.brand), needsUpdate:true };
            }
            // immagine
            const k=productKey(arr[idx].name, arr[idx].brand||''); const remembered=mergedImagesIndex?.[k];
            if (remembered && !arr[idx].image) arr[idx]={ ...arr[idx], image:remembered };
          }else{
            if (hasCounts){
              const u=Math.max(1, upp||1);
              arr.unshift({ name:p.name, brand:p.brand||'', packs:Math.max(0,packs||1), unitsPerPack:u, unitLabel:p.unitLabel||'unità', expiresAt:p.expiresAt||'', baselinePacks:Math.max(0,packs||1), lastRestockAt:todayISO, avgDailyUnits:0, residueUnits:Math.max(0,(packs||1)*u), packsOnly:false });
            }else if (DEFAULT_PACKS_IF_MISSING){
              arr.unshift({ name:p.name, brand:p.brand||'', packs:1, unitsPerPack:1, unitLabel:'unità', expiresAt:p.expiresAt||'', baselinePacks:1, lastRestockAt:todayISO, avgDailyUnits:0, residueUnits:1, packsOnly:false });
            }else{
              arr.unshift({ name:p.name, brand:p.brand||'', packs:0, unitsPerPack:1, unitLabel:'-', expiresAt:p.expiresAt||'', baselinePacks:0, lastRestockAt:'', avgDailyUnits:0, residueUnits:0, packsOnly:true, needsUpdate:true });
            }
            // immagine remembered
            const k=productKey(p.name, p.brand||''); const remembered=mergedImagesIndex?.[k];
            if (remembered) arr[0].image = remembered;
          }
        }
        return arr;
      });

      // Finanze
      try{
        const itemsSafe=purchases.map(p=>({
          name:p.name, brand:p.brand||'', packs:Number(p.packs||0), unitsPerPack:Number(p.unitsPerPack||0),
          unitLabel:p.unitLabel||'', priceEach:Number(p.priceEach||0), priceTotal:Number(p.priceTotal||0),
          currency:p.currency||'EUR', expiresAt:p.expiresAt||''
        }));
        await fetchJSONStrict(API_FINANCES_INGEST, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...(userIdRef.current?{user_id:userIdRef.current}:{}) , ...(store?{store}:{}), ...(purchaseDate?{purchaseDate}:{}), payment_method:'cash', card_label:null, items:itemsSafe }) }, 30000);
      }catch(e){ showToast(`Finanze: ${e.message}`,'err'); }

      showToast('OCR scorte (Vision) completato ✓','ok');
    }catch(e){ console.error('[OCR scorte] error', e); showToast(`Errore OCR scorte: ${e?.message||e}`,'err'); }
    finally{ setBusy(false); if (ocrInputRef.current) ocrInputRef.current.value=''; }
  }

  /* ---------- OCR riga (foto etichetta o voce specifica) ---------- */
  function buildUnifiedRowPrompt(ocrText,{name='',brand=''}={}){
    return [
      'Sei Jarvis. Hai OCR di una ETICHETTA/PRODOTTO o porzione di scontrino per UNA SOLA VOCE.',
      'RISPONDI SOLO JSON: { "name":"", "brand":"", "packs":0, "unitsPerPack":0, "unitLabel":"", "expiresAt":"" }',
      `Mantieni se possibile name≈"${name}" e brand≈"${brand}".`,
      'Quantità SOLO se esplicite; scadenza in YYYY-MM-DD se presente.',
      '--- OCR INIZIO ---', ocrText, '--- OCR FINE ---'
    ].join('\n');
  }

/* =================== Render =================== */
return (
  <>
  
    <Head><title>🛍 Lista Prodotti</title></Head>
    

    <div style={styles.page}>
      <div style={styles.card}>

        {/* ===== SEZIONE 1 — BANNER FULL WIDTH ===== */}
     <section className="lp-sec1">
  <div className="lp-sec1__frame">
    <video
      className="lp-sec1__video"
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      poster="/video/stato-scorte.png"
    >
      <section className="lp-sec1 glass">
  <div className="lp-sec1__frame">
    <video className="lp-sec1__video" autoPlay loop muted playsInline preload="none">
      <source src="/video/Liste-prodotti.mp4" type="video/mp4" />
    </video>
  </div>
</section>
      <source src="/video/Liste-prodotti.mp4" type="video/mp4" />
    </video>
  </div>
</section>



        {/* ===== SEZIONE 2 — LISTE ===== */}
        <section style={styles.sectionBox}>
          <p style={styles.kicker}>scegli la lista che vuoi</p>

          {/* i due tasti (già presenti) */}
          <div style={styles.switchImgRow}>
            {/* Supermercato */}
            <button
              type="button"
              onClick={() => setCurrentList(LIST_TYPES.SUPERMARKET)}
              aria-pressed={currentList === LIST_TYPES.SUPERMARKET}
              style={styles.switchImgBtn}
              title="Lista Supermercato"
            >
              <Image
                src={
                  currentList === LIST_TYPES.SUPERMARKET
                    ? '/img/Button/lista%20supermercato%20accesa.png'
                    : '/img/Button/lista%20supermercato%20spenta.png'
                }
                alt="Lista Supermercato"
                width={150}
                height={45}
                priority
                style={styles.switchImg}
              />
            </button>

            {/* Online */}
            <button
              type="button"
              onClick={() => setCurrentList(LIST_TYPES.ONLINE)}
              aria-pressed={currentList === LIST_TYPES.ONLINE}
              style={styles.switchImgBtn}
              title="Lista Online"
            >
              <Image
                src={
                  currentList === LIST_TYPES.ONLINE
                    ? '/img/Button/Lista%20on%20line%20acceso.png'
                    : '/img/Button/lista%20on%20line%20spenta.png'
                }
                alt="Lista Online"
                width={150}
                height={45}
                priority
                style={styles.switchImg}
              />
            </button>
          </div>

          {/* comandi lista (vocale + +) */}
          <div style={styles.toolsRow}>

{/* VOCALE LISTE – 42x42, rilievo senza alone, ritaglio preciso */}
<button
  type="button"
  onClick={toggleRecList}
  disabled={busy}
  aria-label="Vocale Liste"
  title={busy ? 'Elaborazione in corso…' : (recBusy ? 'Stop registrazione' : 'Aggiungi con voce')}
  style={{
    width: 42,
    height: 42,
    padding: 0,
    border: 'none',
    borderRadius: 12,
    display: 'inline-grid',
    placeItems: 'center',
    cursor: 'pointer',
    background: 'transparent',      // nessun fondale/alone
    boxShadow: 'none',              // nessun alone esterno
    overflow: 'visible'
  }}
>
  {/* “cornice” con rilievo (solo ombre INSET) */}
  <div
    style={{
      width: '100%',
      height: '100%',
      borderRadius: 12,
      background: '#0f172a',        // scuro, come gli altri comandi
      // rilievo: highlight in alto + ombra in basso, solo inset
      boxShadow:
        'inset 0 1px 0.1px rgba(255,255,255,.28), ' +  // luce alto
        'inset 0 -3px 0.5px rgba(0,0,0,.55), ' +          // ombra basso
        'inset 0 0 0 0.5px rgba(255,255,255,.08)',        // filo interno
      overflow: 'hidden'           // taglia eventuali sbordi della maschera interna
    }}
  >
    {/* maschera interna: regola padding per “quanto” ritagliare */}
    <div
      style={{
        width: 'calc(100% - 6px)',  // = 3px per lato → ritaglio preciso
        height: 'calc(100% - 6px)',
        margin: 3,
        borderRadius: 10,
        overflow: 'hidden'          // QUI avviene il ritaglio del video
      }}
    >
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'cover',
          filter: 'none'            // IMPORTANTISSIMO: elimina qualsiasi alone/glow ereditato
        }}
      >
        <source src="/img/Button/tasto%20vocale%20Liste.mp4" type="video/mp4" />
      </video>
    </div>
  </div>
</button>
            <button
              onClick={() => setShowListForm(v => !v)}
              style={styles.iconCircle}
              title={showListForm ? 'Chiudi form lista' : 'Aggiungi manualmente alla lista'}
              aria-label={showListForm ? 'Chiudi form lista' : 'Aggiungi manualmente alla lista'}
            >
              <Image
                src="/img/icone%20%2B%20-/segno%20piu.png"
                alt="Aggiungi"
                width={42}
                height={42}
                priority
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </button>
          </div>

          {/* form lista (se aperto) */}
          {showListForm && (
            <div style={styles.sectionInner}>
              <form onSubmit={addManualItem} style={styles.formRow}>
                <input
                  placeholder="Prodotto (es. latte)"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={styles.input}
                  required
                />
                <input
                  placeholder="Marca (es. Parmalat)"
                  value={form.brand}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  style={styles.input}
                />
                <input
                  placeholder="Confezioni"
                  inputMode="decimal"
                  value={form.packs}
                  onChange={e => setForm(f => ({ ...f, packs: e.target.value }))}
                  style={{ ...styles.input, width: 140 }}
                  required
                />
                <input
                  placeholder="Unità/conf."
                  inputMode="decimal"
                  value={form.unitsPerPack}
                  onChange={e => setForm(f => ({ ...f, unitsPerPack: e.target.value }))}
                  style={{ ...styles.input, width: 140 }}
                  required
                />
                <input
                  placeholder="Etichetta (es. bottiglie)"
                  value={form.unitLabel}
                  onChange={e => setForm(f => ({ ...f, unitLabel: e.target.value }))}
                  style={{ ...styles.input, width: 170 }}
                />
                <button style={styles.primaryBtn} disabled={busy}>Aggiungi alla lista</button>
              </form>
            </div>
          )}

          {/* lista corrente */}
          <div style={styles.sectionInner}>
            <h3 style={styles.h3}>
              Lista corrente:{' '}
              <span style={{ opacity: .85 }}>
                {currentList === LIST_TYPES.ONLINE ? 'Spesa Online' : 'Supermercato'}
              </span>
            </h3>

            {(lists[currentList] || []).length === 0 ? (
              <p style={{ opacity: .8 }}>Nessun prodotto ancora</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(lists[currentList] || []).map((it) => {
                  const isBought = !!it.purchased;
                  return (
                    <div
                      key={it.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setLists(prev => {
                          const next = { ...prev };
                          next[currentList] = (prev[currentList] || []).map(i =>
                            i.id === it.id ? { ...i, purchased: !i.purchased } : i
                          );
                          return next;
                        });
                        
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setLists(prev => {
                            const next = { ...prev };
                            next[currentList] = (prev[currentList] || []).map(i =>
                              i.id === it.id ? { ...i, purchased: !i.purchased } : i
                            );
                            return next;
                          });
                        }
                      }}
                      style={{ ...styles.listCardRed, ...(isBought ? styles.listCardRedBought : null) }}
                    >
                      <div style={styles.rowLeft}>
                        <div style={styles.rowName}>
                          {it.name}{it.brand ? <span style={styles.rowBrand}> · {it.brand}</span> : null}
                        </div>
                        <div style={styles.rowMeta}>
                          {it.qty} conf. × {it.unitsPerPack} {it.unitLabel}
                          {isBought ? <span style={styles.badgeBought}>preso</span> : <span style={styles.badgeToBuy}>da prendere</span>}
                        </div>
                      </div>

                      <div style={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                        <button
                          title="Segna come comprato"
                          onClick={() => {
                            const item = it;
                            const movePacks = 1;

                            setLists(prev => {
                              const next = { ...prev };
                              next[currentList] = (prev[currentList] || [])
                                .map(r => r.id === item.id ? { ...r, qty: Math.max(0, Number(r.qty || 0) - movePacks), purchased: true } : r)
                                .filter(r => Number(r.qty || 0) > 0);
                              return next;
                            });

                            setStock(prev => {
                              const arr = [...prev];
                              const todayISO = new Date().toISOString().slice(0, 10);
                              const idx = arr.findIndex(
                                s => isSimilar(s.name, item.name) && (!item.brand || isSimilar(s.brand || '', item.brand))
                              );
                              const upp = Math.max(1, Number(item.unitsPerPack || 1));
                              const lbl = item.unitLabel || 'unità';

                              if (idx >= 0) {
                                const old = arr[idx];
                                const u = Math.max(1, Number(old.unitsPerPack || upp));
                                const p = Math.max(0, Number(old.packs || 0) + movePacks);
                                arr[idx] = {
                                  ...old,
                                  packs: p,
                                  unitsPerPack: u,
                                  unitLabel: old.unitLabel || lbl,
                                  packsOnly: false,
                                  ...restockTouch(p, todayISO, u),
                                };
                              } else {
                                const row = {
                                  name: item.name,
                                  brand: item.brand || '',
                                  packs: movePacks,
                                  unitsPerPack: upp,
                                  unitLabel: lbl,
                                  expiresAt: '',
                                  ...restockTouch(movePacks, todayISO, upp),
                                  avgDailyUnits: 0,
                                  packsOnly: false,
                                };
                                arr.unshift(withRememberedImage(row, imagesIndex));
                              }
                              return arr;
                            });
                          }}
                          style={{ ...styles.iconBtnBase, ...styles.iconBtnGreen }}
                        >
                          ✓
                        </button>

                        <button title="–1" onClick={() => incQty(it.id, -1)} style={{ ...styles.iconBtnBase, ...styles.iconBtnDark }}>−</button>
                        <button title="+1" onClick={() => incQty(it.id, +1)} style={{ ...styles.iconBtnBase, ...styles.iconBtnDark }}>+</button>

                        <button title="OCR riga" onClick={() => { setTargetRowIdx(it.id); rowOcrInputRef.current?.click(); }} style={styles.ocrPillBtn}>OCR riga</button>
                        <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.trashBtn}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ===== SEZIONE 3 — ESAURIMENTO/SCADENZA ===== */}
<section style={styles.sectionBox}>

  {/* Banner “esauriti” (no tagli) */}
  <div style={styles.bannerArea}>
    <div style={{ ...styles.bannerBox, height: 'auto' }}>
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        style={{
          ...styles.bannerVideo,
          width: '100%',
          height: 'auto',
          objectFit: 'contain',      // niente crop
          objectPosition: 'center',  // centra il video
          background: 'transparent',
          display: 'block'
        }}
      >
        <source src="/video/banner%20esauriti.mp4" type="video/mp4" />
      </video>
      {/* opzionale: lascia l’overlay se ti piace l’effetto */}
      <div style={styles.bannerOverlay} />
    </div>
  </div>
  {critical.length === 0 ? (
    <p style={{ opacity: .8, marginTop: 4 }}>Nessun prodotto critico.</p>
  ) : (
    <div style={styles.critListWrap}>
      {critical.map((s, i) => {
        const { current, baseline, pct } = residueInfo(s);
        const w = Math.round(pct * 100);
        return (
          <div key={i} style={styles.critRow}>
            <div style={styles.critName}>
              {s.name}{s.brand ? <span style={styles.rowBrand}> · {s.brand}</span> : null}
            </div>
            <div style={styles.progressOuterCrit}>
              <div style={{ ...styles.progressInner, width: `${w}%`, background: colorForPct(pct) }} />
            </div>
            <div style={styles.critMeta}>
              {Math.round(current)}/{Math.max(1, Math.round(baseline))} {s.unitLabel || 'unità'}
              {s.expiresAt ? <span style={styles.expiryChip}>scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}</span> : null}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:8 }}>
              <button
                title="Elimina definitivamente"
                onClick={() => {
                  const idx = stock.findIndex(
                    ss => isSimilar(ss.name, s.name) && ((ss.brand || '') === (s.brand || ''))
                  );
                  if (idx >= 0) deleteStockRow(idx);
                }}
                style={{ ...styles.iconSquareBase, ...styles.iconDanger }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  )}
</section>


        {/* ===== SEZIONE 4 — DISPENSA (TUTTE LE SCORTE) ===== */}
        <section style={styles.sectionBox}>
          {/* Banner largo con video + tasti sotto */}
          <div style={styles.bannerArea}>
            <div style={styles.bannerBox}>
              <video
                autoPlay
                loop
                muted
                playsInline
                preload="none"
                poster="/video/stato-scorte.png"
                style={styles.bannerVideo}
              >
                <source src="/video/stato-scorte-small.mp4" type="video/mp4" />
              </video>
              <div style={styles.bannerOverlay} />
            </div>

            {/* Tasti sotto il banner */}
            <div style={styles.sectionLarge}>
              <div style={styles.ocrRow}>
          {/* OCR scontrino — tasto 42x42 con video */}
<button
  type="button"
  onClick={() => ocrInputRef.current?.click()}
  style={styles.ocr42}
  aria-label="Scanner scontrino (OCR)"
  title="Scanner scontrino (OCR)"
>
  <video
    autoPlay
    loop
    muted
    playsInline
    preload="metadata"
    style={styles.ocr42Video}
    // opzionale: poster iniziale
    // poster="/video/ocr-scontrini-poster.jpg"
  >
    <source src="/video/Ocr%20scontrini.mp4" type="video/mp4" />
  </video>
</button>
      {/* 🔊 Tasto vocale scorte – 42x42, ritagliato */}
<button
  type="button"
  onClick={toggleVoiceInventory}
  disabled={busy}
  style={styles.voice42}           // << usa questo stile
  aria-pressed={!!invRecBusy}
  aria-label="Riconoscimento vocale scorte"
  title={
    busy
      ? 'Elaborazione in corso…'
      : (invRecBusy ? 'Stop registrazione scorte' : 'Riconoscimento vocale scorte')
  }
>
  <video
    autoPlay
    loop
    muted
    playsInline
    preload="metadata"
    style={styles.voice42Video}    // << e questo stile
  >
    <source src="/img/Button/tasto%20vocale%20Liste.mp4" type="video/mp4" />
  </video>
</button>


               {/* ➕ Aggiungi manualmente */}
<button
  type="button"
  onClick={() => setShowListForm(v => !v)}
  style={styles.plusRound42}
  aria-label={showListForm ? 'Chiudi form lista' : 'Aggiungi manualmente'}
  title={showListForm ? 'Chiudi form lista' : 'Aggiungi manualmente'}
>
  {/* usa Next/Image se ce l’hai importato come `Image` */}
  <Image
    src="/img/icone%20%2B%20-/segno%20piu.png"  // "icone + -/segno piu.png"
    alt="Aggiungi"
    width={26}
    height={26}
    priority
    style={{
      display: 'block',
      width: 26,
      height: 26,
      objectFit: 'contain',
      filter: 'drop-shadow(0 0 4px rgba(0,0,0,.35))',
    }}
  />
</button>
{/* 🗓️ Inserisci scadenza */}
<button
  type="button"
  onClick={() => setShowExpiryForm(v => !v)}
  style={styles.calendarRound42}               // stesso look del tasto +
  aria-label={showExpiryForm ? 'Chiudi scadenza manuale' : 'Inserisci scadenza'}
  title={showExpiryForm ? 'Chiudi scadenza manuale' : 'Inserisci scadenza'}
>
  <Image
    src="/img/icone%20%2B%20-/Calendario.png"
    alt="Inserisci scadenza"
    width={26}
    height={26}
    priority
    style={{
      display: 'block',
      width: 26,
      height: 26,
      objectFit: 'contain',
      filter: 'drop-shadow(0 0 4px rgba(0,0,0,.35))'
    }}
  />
</button>

              </div>
            </div>
          </div>

{/* Scorte complete — LAYOUT A RIGHE */}
<div style={{ marginTop: 12 }}>
  <h4 style={styles.h4}>Tutte le scorte</h4>

  {stock.length === 0 ? (
    <p style={{ opacity: .8 }}>Nessuna scorta registrata.</p>
  ) : (
    <div style={styles.stockList}>
      {stock.map((s, idx) => {
        const { current, baseline, pct } = residueInfo(s);
        const w = Math.round(pct * 100);
        const zebra = idx % 2 === 0;

        return (
          <div key={idx} style={{ ...(zebra ? styles.stockLineZ1 : styles.stockLineZ2) }}>
            {editingRow === idx ? (
              /* --- Modalità editing --- */
              <div>
                <div style={styles.formRowWrap}>
                  <input
                    style={styles.input}
                    value={editDraft.name}
                    onChange={e => handleEditDraftChange('name', e.target.value)}
                  />
                  <input
                    style={styles.input}
                    value={editDraft.brand}
                    onChange={e => handleEditDraftChange('brand', e.target.value)}
                    placeholder="Marca"
                  />
                </div>
                <div style={styles.formRowWrap}>
                  <input
                    style={{ ...styles.input, width: 120 }}
                    inputMode="decimal"
                    value={editDraft.packs}
                    onChange={e => handleEditDraftChange('packs', e.target.value)}
                    placeholder="Confezioni"
                  />
                  <input
                    style={{ ...styles.input, width: 140 }}
                    inputMode="decimal"
                    value={editDraft.unitsPerPack}
                    onChange={e => handleEditDraftChange('unitsPerPack', e.target.value)}
                    placeholder="Unità/conf."
                  />
                  <input
                    style={{ ...styles.input, width: 150 }}
                    value={editDraft.unitLabel}
                    onChange={e => handleEditDraftChange('unitLabel', e.target.value)}
                    placeholder="Etichetta"
                  />
                </div>
                <div style={styles.formRowWrap}>
                  <input
                    style={{ ...styles.input, width: 220 }}
                    value={editDraft.expiresAt}
                    onChange={e => handleEditDraftChange('expiresAt', e.target.value)}
                    placeholder="YYYY-MM-DD o 15/08/2025"
                  />
                  <input
                    style={{ ...styles.input, width: 190 }}
                    inputMode="decimal"
                    value={editDraft.residueUnits}
                    onChange={e => handleEditDraftChange('residueUnits', e.target.value)}
                    placeholder="Residuo unità o pacchi"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button onClick={() => saveRowEdit(idx)} style={styles.smallOkBtn}>Salva</button>
                  <button onClick={cancelRowEdit} style={styles.smallGhostBtn}>Annulla</button>
                  <button
                    onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }}
                    style={styles.smallGhostBtn}
                  >
                    OCR riga
                  </button>
                </div>
              </div>
            ) : (
              /* --- Modalità visualizzazione (responsive) --- */
              <div className="stockRowGrid">
                {/* thumb */}
                <div
                  className="thumb"
                  role="button"
                  title="Aggiungi/Modifica immagine"
                  onClick={() => { setTargetImageIdx(idx); rowImageInputRef.current?.click(); }}
                  style={styles.imageBox}
                >
                  {s.image ? (
                    <img src={s.image} alt={s.name} style={styles.imageThumb} />
                  ) : (
                    <div style={styles.imagePlaceholder}>＋</div>
                  )}
                </div>

                {/* info principali */}
                <div className="main" style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.stockTitle}>
                    {s.name}{s.brand ? <span style={styles.rowBrand}> · {s.brand}</span> : null}
                  </div>
                  <div style={styles.progressOuterBig}>
                    <div style={{ ...styles.progressInner, width: `${w}%`, background: colorForPct(pct) }} />
                  </div>
                  <div style={styles.stockLineSmall}>
                    {Math.round(current)}/{Math.max(1, Math.round(baseline))} {s.unitLabel || 'unità'}
                    {s.expiresAt ? (
                      <span style={styles.expiryChip}>
                        scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* metriche compatte */}
                <div className="metrics">
                  <div className="kv">
                    <div className="kvL">Confezioni</div>
                    <div className="kvV">{Number(s.packs || 0)}</div>
                  </div>
                  <div className="kv">
                    <div className="kvL">Unità/conf.</div>
                    <div className="kvV">{s.packsOnly ? '–' : Number(s.unitsPerPack || 1)}</div>
                  </div>
                  <div className="kv">
                    <div className="kvL">Residuo unità</div>
                    <div className="kvV">{s.packsOnly ? '–' : Math.round(residueUnitsOf(s))}</div>
                  </div>
                </div>

                {/* azioni */}
                <div className="actions" style={styles.rowActionsRight}>
                  <button
                    title="Modifica"
                    onClick={() => startRowEdit(idx, s)}
                    style={styles.iconCircle}
                    aria-label="Modifica scorta"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    title="Imposta scadenza"
                    onClick={() => { setShowExpiryForm(true); setExpiryForm({ name: s.name, expiresAt: s.expiresAt || '' }); }}
                    style={styles.iconCircle}
                    aria-label="Imposta scadenza"
                  >
                    <Calendar size={18} />
                  </button>
                  <button
                    title="OCR riga"
                    onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }}
                    style={styles.iconCircle}
                    aria-label="OCR riga"
                  >
                    <Camera size={18} />
                  </button>
                  <button
                    title="Elimina definitivamente"
                    onClick={() => deleteStockRow(idx)}
                    style={{ ...styles.iconCircle, color:'#f87171', borderColor:'rgba(248,113,113,.35)' }}
                    aria-label="Elimina scorta"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}
</div>
        </section>

      </div>
    </div>

    {/* TOAST */}
    {toast && (
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          background:
            toast.type === 'ok'
              ? '#16a34a'
              : toast.type === 'err'
              ? '#ef4444'
              : '#334155',
          color: '#fff',
          padding: '10px 14px',
          borderRadius: 10,
          boxShadow: '0 6px 16px rgba(0,0,0,.35)',
          zIndex: 9999,
          fontWeight: 600,
          letterSpacing: .2,
        }}
      >
        {toast.msg}
      </div>
     )}
    {/* Modale disattivata */}


    {/* INPUT NASCOSTI */}
    <input
      ref={ocrInputRef}
      type="file"
      accept="image/*,application/pdf"
      multiple
      hidden
      onChange={(e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        handleOCR(files);
        e.target.value = '';
      }}
    />

    <input
      ref={rowOcrInputRef}
      type="file"
      accept="image/*,application/pdf"
      capture="environment"
      multiple
      hidden
      onChange={async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;

        // Chi è la riga target? (lista o scorte)
        let itemName = '';
        let brand = '';
        let stockIndex = -1;

        const byId = (lists[currentList] || []).find(i => i.id === targetRowIdx);
        if (byId) {
          itemName = byId.name;
          brand = byId.brand || '';
        } else if (typeof targetRowIdx === 'number' && stock[targetRowIdx]) {
          stockIndex = targetRowIdx;
          itemName = stock[stockIndex].name;
          brand = stock[stockIndex].brand || '';
        } else {
          showToast('Elemento non trovato per OCR riga', 'err');
          return;
        }

        try {
          setBusy(true);

          // OCR di tutte le immagini caricate
          const fd = new FormData();
          files.forEach(f => fd.append('images', f));
          const ocrRes = await timeoutFetch(API_OCR, { method: 'POST', body: fd }, 35000);
          const ocr = await readJsonSafe(ocrRes);
          if (!ocr.ok) throw new Error(ocr.error || 'Errore OCR');
          const ocrText = String(ocr.text || '').trim();
          if (!ocrText) throw new Error('Nessun testo letto');

          // Chiedi il pacchetto unificato
          const prompt = buildUnifiedRowPrompt(ocrText, { name: itemName, brand });
          const r = await timeoutFetch(API_ASSISTANT_TEXT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          }, 30000);
          const safe = await readJsonSafe(r);
          const answer = safe?.answer || safe?.data || safe;
          const parsed = typeof answer === 'string' ? (() => { try { return JSON.parse(answer); } catch { return null; } })() : answer;

          // Applica ai dati di scorta
          const upd = {
            name: String(parsed?.name || itemName || '').trim(),
            brand: String(parsed?.brand || brand || '').trim(),
            packs: Math.max(0, Number(parsed?.packs || 0)),
            unitsPerPack: Math.max(1, Number(parsed?.unitsPerPack || 1)),
            unitLabel: String(parsed?.unitLabel || 'unità').trim() || 'unità',
            expiresAt: toISODate(parsed?.expiresAt || ''),
          };

          const todayISO = new Date().toISOString().slice(0, 10);

          setStock(prev => {
            const arr = [...prev];

            if (stockIndex >= 0 && arr[stockIndex]) {
              const old = arr[stockIndex];
              const nowUnits = upd.packs * upd.unitsPerPack;
              const wasUnits = old.packsOnly
                ? Math.max(0, Number(old.packs || 0))
                : Math.max(0, Number(old.packs || 0) * Math.max(1, Number(old.unitsPerPack || 1)));
              const restock = nowUnits > wasUnits;

              let next = {
                ...old,
                name: upd.name || old.name,
                brand: upd.brand || old.brand,
                packs: (upd.packs || upd.packs === 0) ? upd.packs : old.packs || 0,
                unitsPerPack: upd.unitsPerPack || old.unitsPerPack || 1,
                unitLabel: upd.unitLabel || old.unitLabel || 'unità',
                expiresAt: upd.expiresAt || old.expiresAt || '',
                packsOnly: false,
              };
              if (restock) {
                next = { ...next, ...restockTouch(next.packs, todayISO, next.unitsPerPack) };
              }
              arr[stockIndex] = next;
              return arr;
            }

            // Se partiva da lista: crea/aggiorna scorta corrispondente
            const j = arr.findIndex(s => isSimilar(s.name, upd.name) && (!upd.brand || isSimilar(s.brand || '', upd.brand)));
            if (j >= 0) {
              const old = arr[j];
              const newPacks = Math.max(0, Number(upd.packs || 0));
              const newUPP = Math.max(1, Number(upd.unitsPerPack || old.unitsPerPack || 1));
              arr[j] = {
                ...old,
                name: upd.name || old.name,
                brand: upd.brand || old.brand,
                packs: newPacks || old.packs || 0,
                unitsPerPack: newUPP,
                unitLabel: upd.unitLabel || old.unitLabel || 'unità',
                expiresAt: upd.expiresAt || old.expiresAt || '',
                packsOnly: false,
                ...restockTouch(newPacks || old.packs || 0, todayISO, newUPP),
              };
            } else {
              const p = Math.max(0, Number(upd.packs || 0));
              const u = Math.max(1, Number(upd.unitsPerPack || 1));
              const row = {
                name: upd.name || itemName,
                brand: upd.brand || brand || '',
                packs: p,
                unitsPerPack: u,
                unitLabel: upd.unitLabel || 'unità',
                expiresAt: upd.expiresAt || '',
                baselinePacks: p,
                lastRestockAt: todayISO,
                avgDailyUnits: 0,
                residueUnits: p * u,
                image: '',
                packsOnly: false,
              };
              arr.unshift(withRememberedImage(row, imagesIndex));
            }
            return arr;
          });

          showToast('Riga aggiornata da OCR ✓', 'ok');
        } catch (err) {
          console.error('[Row OCR unified]', err);
          showToast(`Errore OCR riga: ${err?.message || err}`, 'err');
        } finally {
          setBusy(false);
          setTargetRowIdx(null);
        }
              
      }}
    />

    <input
      ref={rowImageInputRef}
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      onChange={(e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length && typeof targetImageIdx === 'number') {
          handleRowImage(files, targetImageIdx);
          setTargetImageIdx(null);
        }
      }}
    />
  </>
);

   
}
/* =================== Styles (identici) =================== */
const styles = {
    page: {
    minHeight:'100vh',
    // completamente trasparente per mostrare lo sfondo globale
    background:'transparent',
    padding:'24px 16px',
    color:'#f8f1dc',
    textShadow:'0 0 6px rgba(255,245,200,.15)'
  },


  // Card trasparente
  card: {
    maxWidth:1000, margin:'0 auto',
    background:'transparent',
    backdropFilter:'none',
    border:'1px solid rgba(255,255,255,.06)',
    borderRadius:18, padding:16,
    boxShadow:'none'
  },

  headerRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:8 },
  title3d:{
    margin:0, fontSize:'1.6rem', letterSpacing:.6, fontWeight:800,
    textShadow:'0 2px 0 #1b2230, 0 0 14px rgba(140,200,255,.35), 0 0 2px rgba(255,255,255,.25)'
  },
  homeBtn:{ padding:'8px 12px', borderRadius:10, background:'linear-gradient(180deg,#1f2937,#111827)', color:'#e5e7eb', border:'1px solid #334155' },
  actionGhost:{ padding:'8px 12px', borderRadius:10, background:'transparent', color:'#cbd5e1', border:'1px solid #334155' },

  switchRow:{ display:'flex', gap:8, marginTop:4, marginBottom:10, flexWrap:'wrap' },
  switchBtn:{ padding:'10px 14px', borderRadius:999, border:'1px solid #334155', background:'rgba(17,24,39,.6)', color:'#e5e7eb' },
  switchBtnActive:{ padding:'10px 14px', borderRadius:999, border:'1px solid #65a30d', background:'linear-gradient(180deg,#166534,#14532d)', color:'#ecfccb', boxShadow:'inset 0 0 0 1px rgba(255,255,255,.08), 0 8px 18px rgba(0,0,0,.35)' },

  toolsRow:{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', margin:'8px 0 2px' },
  voiceBtn:{ padding:'10px 14px', borderRadius:12, border:'1px solid #334155', background:'linear-gradient(180deg,#0ea5e9,#0284c7)', color:'#05243a', fontWeight:800 },
  primaryBtn:{ padding:'10px 14px', borderRadius:12, border:'1px solid #334155', background:'linear-gradient(180deg,#16a34a,#15803d)', color:'#f0fdf4', fontWeight:700 },

    sectionLarge: {
    marginTop:18,
    padding:12,
    borderRadius:14,
    background:'transparent',                  // ← trasparente
    border:'1px solid rgba(255,255,255,.06)',  // bordo leggero
    boxShadow:'none'                           // niente ombra grigia
  },
  sectionLifted: {
    marginTop:18,
    padding:14,
    borderRadius:16,
    background:'transparent',                  // ← trasparente
    border:'1px solid rgba(255,255,255,.08)',
    boxShadow:'none'                           // niente ombra grigia
  },
  // —————————————————— Aggiungi questi nuovi stili ——————————————————
    iconCircle: {
    width:38, height:38, minWidth:38,
    display:'grid', placeItems:'center',
    borderRadius:999,
    border:'1px solid rgba(255,255,255,.18)',
    background:'rgba(15,23,42,.35)',   // vetro scuro trasparente
    color:'#e5e7eb',
    boxShadow:'0 2px 8px rgba(0,0,0,.35)',
    cursor:'pointer'
  },

  h3:{ margin:'6px 0 10px', fontSize:'1.25rem', fontWeight:700, color:'#f9fafb' },
  h4:{ margin:'6px 0 6px', fontSize:'1.05rem', fontWeight:700, color:'#e5e7eb' },

  // LISTA PRODOTTI: card rosse a pillola + bottoni icona
  listCardRed: {
    display:'flex',
    justifyContent:'space-between',
    alignItems:'center',
    gap:10,
    padding:'12px 14px',
    borderRadius:16,
    cursor:'pointer',
    userSelect:'none',
    background:'linear-gradient(180deg, #7f1d1d, #991b1b)',
    border:'1px solid #450a0a',
    boxShadow:'inset 0 0 0 1px rgba(255,255,255,.04), 0 8px 18px rgba(0,0,0,.35)',
  },
  listCardRedBought: {
    background:'linear-gradient(180deg, #166534, #14532d)',
    border:'1px solid #0f5132',
    textDecoration:'line-through',
    opacity:.9
  },
  iconBtnBase:{
    width:36, height:36, minWidth:36,
    display:'grid', placeItems:'center',
    borderRadius:999,
    border:'1px solid rgba(255,255,255,.15)',
    background:'rgba(15,23,42,.55)',
    color:'#f8fafc',
    fontWeight:800,
    boxShadow:'0 2px 8px rgba(0,0,0,.35)'
  },
  iconBtnGreen:{
    background:'linear-gradient(180deg, #16a34a, #15803d)',
    border:'1px solid #166534',
    color:'#ffffff'
  },
  iconBtnDark:{
    background:'linear-gradient(180deg, #0f172a, #111827)',
    border:'1px solid #334155',
    color:'#e5e7eb'
  },
  ocrPillBtn:{
    padding:'8px 12px',
    borderRadius:12,
    border:'1px solid #7f1d1d',
    background:'linear-gradient(180deg, #991b1b, #7f1d1d)',
    color:'#fde68a',
    fontWeight:700
  },
  trashBtn:{
    padding:'8px 10px',
    borderRadius:12,
    border:'1px solid #4b5563',
    background:'linear-gradient(180deg,#1f2937,#111827)',
    color:'#f87171',
    fontWeight:700
  },

  // LISTA — testo
  rowLeft:{ flex:1, minWidth:0 },
  rowName:{ fontSize:'1.05rem', fontWeight:600, color:'#fff' },
  rowBrand:{ opacity:.8, fontWeight:400, marginLeft:4 },
  rowMeta:{ fontSize:'.85rem', opacity:.85, marginTop:2 },
  badgeBought:{ marginLeft:6, padding:'2px 6px', borderRadius:8, background:'#166534', color:'#dcfce7', fontSize:'.75rem' },
  badgeToBuy:{ marginLeft:6, padding:'2px 6px', borderRadius:8, background:'#7f1d1d', color:'#fee2e2', fontSize:'.75rem' },
  rowActions:{ display:'flex', gap:6, alignItems:'center' },
  rowActionsRight:{ display:'flex', gap:6, alignItems:'center', marginLeft:10 },

  // STOCK / SCORTE
  stockList:{ display:'flex', flexDirection:'column', gap:6, marginTop:6 },
  stockLineZ1:{ background:'rgba(255,255,255,.02)', padding:10, borderRadius:10 },
  stockLineZ2:{ background:'rgba(0,0,0,.15)', padding:10, borderRadius:10 },
  stockRow:{ display:'flex', alignItems:'center', gap:10 },
  stockTitle:{ fontSize:'1rem', fontWeight:600, marginBottom:4 },
  stockLineSmall:{ fontSize:'.85rem', opacity:.9, marginTop:2 },

  imageBox:{
    width:56, height:56, borderRadius:10,
    border:'1px dashed #64748b',
    display:'grid', placeItems:'center',
    overflow:'hidden',
    cursor:'pointer',
    background:'rgba(255,255,255,.04)'
  },
  imageThumb:{ width:'100%', height:'100%', objectFit:'cover' },
  imagePlaceholder:{ fontSize:'1.5rem', color:'#94a3b8' },

  kvCol:{ minWidth:90, textAlign:'center' },
  kvLabel:{ fontSize:'.75rem', opacity:.75 },
  kvValue:{ fontSize:'1rem', fontWeight:600 },

  progressOuterBig:{ height:10, background:'rgba(255,255,255,.1)', borderRadius:6, overflow:'hidden', marginTop:2 },
  progressOuterCrit:{ height:8, background:'rgba(255,255,255,.08)', borderRadius:6, overflow:'hidden', flex:1 },
  progressInner:{ height:'100%' },

  critListWrap:{ display:'flex', flexDirection:'column', gap:6 },
  critRow:{ display:'flex', alignItems:'center', gap:10, padding:6, borderRadius:8, background:'rgba(255,255,255,.04)' },
  critName:{ flex:1, fontWeight:600 },
  critMeta:{ fontSize:'.8rem', opacity:.9 },
  expiryChip:{ marginLeft:6, padding:'1px 5px', borderRadius:6, background:'#7f1d1d', color:'#fee2e2', fontSize:'.7rem' },

  // Bottoni piccoli
  smallOkBtn:{ padding:'6px 10px', borderRadius:8, background:'#16a34a', color:'#fff', fontWeight:700, border:'none' },
  smallGhostBtn:{ padding:'6px 10px', borderRadius:8, background:'transparent', border:'1px solid #475569', color:'#e2e8f0' },
  smallDangerBtn:{ padding:'6px 10px', borderRadius:8, background:'#991b1b', border:'1px solid #7f1d1d', color:'#fee2e2' },

  formRow:{ display:'flex', flexWrap:'wrap', gap:8, marginTop:6 },
  formRowWrap:{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' },
   input:{
    flex:1,
    minWidth:120,
    padding:'8px 10px',
    borderRadius:8,
    border:'1px solid #475569',
    background:'rgba(15,23,42,.65)',
    color:'#f1f5f9'
  }, // ⬅️ VIRGOLA QUI
  iconSquareBase: {
    width: 38,
    height: 38,
    minWidth: 38,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 12,
    border: '1px solid #4b5563',
    background: 'linear-gradient(180deg,#1f2937,#111827)',
    color: '#e5e7eb',
    boxShadow: '0 2px 8px rgba(0,0,0,.35)',
    cursor: 'pointer',
  },

    iconDanger: {
    color: '#f87171',
  },


  sectionLarge: {
    marginTop: '2rem',
    padding: '1rem',
  },

  // ===== VIDEO OCR "GRANDE" (full width, come titolo + tasto) =====
  ocrVideoBtnXL: {
    all: 'unset',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    minHeight: 84,
    padding: '10px 14px',
    borderRadius: 14,
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    boxShadow: '0 8px 20px rgba(0,0,0,.28)',
    transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
  },

  ocrVideoXL: {
    display: 'block',
    height: 64,
    width: 'auto',
    objectFit: 'contain',
    pointerEvents: 'none',
    filter: 'drop-shadow(0 0 10px rgba(120,220,255,.55)) drop-shadow(0 0 22px rgba(80,200,255,.35))',
  },

  ocrVideoLabel: {
    flex: 1,
    fontWeight: 800,
    fontSize: '1.25rem',
    letterSpacing: '.02em',
    color: '#e6f7ff',
    textShadow: '0 0 10px rgba(120,220,255,.55), 0 0 18px rgba(80,200,255,.35)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
    ocrVideoBtn: {
    all: 'unset',
    cursor: 'pointer',
    display: 'inline-block',
    borderRadius: 12,
    overflow: 'hidden',
    width: 84,
    height: 84,
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    boxShadow: '0 4px 12px rgba(0,0,0,.25)',
    transition:
      'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
  },

  ocrVideo: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none', // così il click passa al button
    filter:
      'drop-shadow(0 0 6px rgba(120,220,255,.45)) drop-shadow(0 0 14px rgba(80,200,255,.25))',
  },
    ocrRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },

  ocrVideoBtn: {
    all: 'unset',
    cursor: 'pointer',
    display: 'inline-block',
    borderRadius: 14,
    overflow: 'hidden',
    width: 96,   // 👈 leggermente più grande
    height: 96,  // 👈 leggermente più grande
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    boxShadow: '0 4px 12px rgba(0,0,0,.25)',
    transition:
      'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
  },

  ocrVideo: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
    filter:
      'drop-shadow(0 0 6px rgba(120,220,255,.45)) drop-shadow(0 0 14px rgba(80,200,255,.25))',
  },

  ocrText: {
    flex: 1,
    fontSize: '1.05rem',
    fontWeight: 500,
    fontFamily: "'Poppins', 'Inter', sans-serif", // 👈 carattere elegante e moderno
    color: '#e6f7ff',
    textShadow:
      '0 0 6px rgba(120,220,255,.45), 0 0 12px rgba(80,200,255,.25)',
    lineHeight: 1.4,
  },
  switchImgRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 14,
  },
  switchImgBtn: {
    all: 'unset',
    cursor: 'pointer',
    display: 'inline-grid',
    placeItems: 'center',
    borderRadius: 12,
    background: 'rgba(255,255,255,.04)',
    border: '1px solid rgba(255,255,255,.08)',
    boxShadow: '0 6px 16px rgba(0,0,0,.28)',
    transition: 'transform .18s ease, box-shadow .18s ease',
  },
  switchImg: {
    display: 'block',
    width: '100%',
    height: 'auto',
  },
    switchImgBtn: {
    appearance: 'none',
    border: 0,
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    lineHeight: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',

    /* --- Arrotondamento e maschera --- */
    borderRadius: 16,
    overflow: 'hidden',

    /* --- Effetto rilievo / vetro --- */
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(4px)',
    boxShadow:
      'inset 0 1px 3px rgba(255,255,255,.25), ' +  // highlight interno
      '0 4px 12px rgba(0,0,0,.35)',                 // ombra esterna
    border: '1px solid rgba(255,255,255,.12)',

    transition: 'transform .18s ease, box-shadow .18s ease',
  },

  switchImgBtnHover: {
    transform: 'translateY(-2px) scale(1.02)',
    boxShadow:
      'inset 0 1px 3px rgba(255,255,255,.25), ' +
      '0 8px 20px rgba(0,0,0,.45)',
    borderColor: 'rgba(148,233,255,.35)',
  },

  switchImg: {
    display: 'block',
    width: '100%',
    height: 'auto',
    pointerEvents: 'none',   // clic solo sul button
    borderRadius: 16,        // segue il contenitore
  },
voiceVideoBtn: {
  all: 'unset',
  cursor: 'pointer',
  display: 'inline-grid',
  placeItems: 'center',
  width: 96,
  height: 96,
  borderRadius: '50%',
  overflow: 'hidden',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  boxShadow: '0 4px 12px rgba(0,0,0,.35), inset 0 2px 6px rgba(255,255,255,.12)',
  transition: 'transform .18s ease, box-shadow .18s ease',
},
  voiceVideoBtn: {
    all: 'unset',
    cursor: 'pointer',
    display: 'inline-block',
    width: 100,    // quadrato più grande
    height: 100,
    borderRadius: 18,     // angoli arrotondati ma forma quadrata
    overflow: 'hidden',
    background: 'linear-gradient(180deg,#1f2937,#111827)', // base scura
    border: '1px solid rgba(255,255,255,.2)',
    boxShadow:
      'inset 0 1px 3px rgba(255,255,255,.25), ' + // highlight interno
      '0 6px 14px rgba(0,0,0,.45)',               // ombra esterna
    transition: 'transform .15s ease, box-shadow .15s ease',
  },

  voiceVideoBtnHover: {
    transform: 'translateY(-2px) scale(1.02)',
    boxShadow:
      'inset 0 1px 3px rgba(255,255,255,.25), ' +
      '0 10px 20px rgba(0,0,0,.55)',
    borderColor: 'rgba(148,233,255,.35)',
  },

  voiceVideo: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
    filter:
      'drop-shadow(0 0 6px rgba(120,220,255,.45)) ' +
      'drop-shadow(0 0 14px rgba(80,200,255,.25))',
  },
iconCircle: {
  width: 42,
  height: 42,
  minWidth: 42,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 12, // più squadrato invece che cerchio
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(15,23,42,.35)',
  boxShadow: '0 2px 6px rgba(0,0,0,.4)',
  cursor: 'pointer',
  overflow: 'hidden',
},
headerRowScorte: {
  display: 'grid',
  gridTemplateColumns: '1fr auto', // banner | comandi
  alignItems: 'center',
  gap: 12,
  width: '100%',
},

// Banner sottile tipo "titolo"
headerBannerBox: {
  height: 96,                 // <- PUOI RENDERLO PIÙ SOTTILE (es. 80)
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 6px 16px rgba(0,0,0,.35)',
  background: 'rgba(0,0,0,.5)',
},

headerBannerVideo: {
  width: '100%',
  height: '160%',
  objectFit: 'cover',         // niente bande: riempie e taglia sopra/sotto
  objectPosition: 'center',   // centra (muletto + scritte)
  display: 'block',
},

headerActions: {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
},

headerIcon: {
  width: 42,
  height: 42,
  minWidth: 42,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(15,23,42,.35)',
  boxShadow: '0 2px 6px rgba(0,0,0,.4)',
  cursor: 'pointer',
},
headerRowScorte: {
  // wrapper del titolo "Stato Scorte": colonna, piena larghezza
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 10,
  width: '100%',
},

// Banner: piena larghezza, altezza controllabile
headerBannerBox: {
  width: '100%',
  height: 120,               // ← REGOLA qui l'altezza per far vedere muletto + scritta
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 6px 16px rgba(0,0,0,.35)',
  background: 'rgba(0,0,0,.5)',
},

headerBannerVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',        // riempie senza bande
  objectPosition: 'center',  // centra soggetti (muletto + scritta)
  display: 'block',
},

// Pulsanti sotto al banner
headerActions: {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
},
scorteSection: {
  position: 'relative',
  marginTop: 18,
  borderRadius: 16,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,.08)',
  // padding solo per il contenuto (il bg è assoluto)
},

scorteBg: {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  pointerEvents: 'none',
},

scorteBgVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
},

scorteBgOverlay: {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.45))',
},

scorteContent: {
  position: 'relative',
  zIndex: 1,
  padding: 14,
},

scorteHeader: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 8,
},
  /* ——— Banner largo con video + tasti sotto ——— */
bannerArea: {
  marginTop: 12,
},
bannerBox: {
  position: 'relative',
  width: '100%',
  height: 120,                 // ← altezza del banner (120–180 a gusto)
  borderRadius: 16,
  overflow: 'hidden',
  background: 'rgba(0,0,0,.6)',
  boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  border: '1px solid rgba(255,255,255,.10)',
},
bannerVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  backgroundColor: '#000', 
   objectPosition: 'right center', // 👈 sposta tutto a destra 
  display: 'block',
},
bannerOverlay: {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.45))',
  pointerEvents: 'none',
},
bannerButtons: {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginTop: 10,
  /* cambia l’allineamento qui: */
  justifyContent: 'flex-start', // 'center' | 'flex-end' | 'space-between'
},
/* === STILI BANNER STATO SCORTE === */
bannerArea: {
  width: '100%',
  margin: '24px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
},

bannerBox: {
  position: 'relative',
  width: '100%',
  maxWidth: '100%',       // banner sempre a tutta larghezza sezione
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 6px 18px rgba(0,0,0,.4)',
},

bannerVideo: {
  display: 'block',
  width: '25%',
  height: '120px',        // 👈 altezza fissa ottimizzata per PC
  objectFit: 'cover',     // ritaglia solo sopra/sotto
  objectPosition: 'center', // centra scritta + muletto
  borderRadius: 14,
},

bannerOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.1)',
},

/* OCR + Tasti sotto al banner */
ocrRow: {
  display: 'flex',
  gap: 12,
  justifyContent: 'center',
  alignItems: 'center',
  flexWrap: 'wrap',
  marginTop: 8,
},

ocrVideoBtn: {
  width: 64,
  height: 64,
  borderRadius: 16,
  overflow: 'hidden',
  padding: 0,
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 10px rgba(0,0,0,.25)',
},

ocrVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
},

voiceVideoBtn: {
  width: 64,
  height: 64,
  borderRadius: 16,
  overflow: 'hidden',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 10px rgba(0,0,0,.25)',
},

voiceVideoBtnHover: {
  transform: 'scale(1.05)',
  transition: 'transform 0.2s ease',
},

voiceVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
},
/* === LAYOUT SEZIONI === */
sectionBox: {
  marginTop: 18,
  padding: 14,
  borderRadius: 16,
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.12)',
  boxShadow: '0 10px 24px rgba(0,0,0,.28)',
},
sectionInner: {
  marginTop: 10,
},

kicker: {
  margin: 0,
  marginBottom: 8,
  fontSize: '0.95rem',
  fontWeight: 700,
  letterSpacing: '.02em',
  textTransform: 'none',
  color: '#eaf7ff',
  textShadow: '0 1px 0 rgba(0,0,0,.45)',
  borderLeft: '3px solid rgba(148,233,255,.65)',
  paddingLeft: 10,
  opacity: .95,
},

/* === SEZIONE 1: BANNER FULL-BLEED === */
sec1FullBleed: {
  position: 'relative',
  width: '100%',
  /* altezza della “striscia” banner: regola a piacere */
  height: 160,                 // es: 140–200 per più/meno taglio
  borderRadius: 16,
  backgroundColor: '#4B4336',  
  boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  border: '1px solid rgba(255,255,255,.10)',
  margin: '8px 0 14px'
},

sec1Video: {
  width: '30%',
  height: '100%',
  display: 'block',
  objectFit: 'cover',          // riempi e taglia sopra/sotto
  /* sposta la “finestra” verticale per decidere cosa si vede */
  objectPosition: 'center 75%' // ↓ aumenta per scendere, ↓ diminuisci per salire
  // esempi: 'center 30%' (più alto), 'center 50%' (centrato), 'center 65%' (più basso)
},

sec1Overlay: {
  position: 'absolute',
  inset: 0,
  /* leggero velo per leggibilità */
  background: 'linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.08))',
  pointerEvents: 'none'
},
voiceVideoBtn: {
  position: 'relative',            // <— serve per ancorare la maschera
  width: 100,
  height: 100,
  borderRadius: 22,
  padding: 0,
  border: 'none',
  background: 'linear-gradient(180deg,#1f2937,#111827)',
  boxShadow: '0 6px 14px rgba(0,0,0,.45), inset 0 1px 3px rgba(255,255,255,.22)',
  cursor: 'pointer',
  overflow: 'visible'              // la maschera sotto farà il taglio
},

// “cornice” interna che definisce il ritaglio (puoi cambiare gli inset)
voiceCrop: {
  position: 'absolute',
  top: 10,                         // ← taglio sopra
  right: 10,                       // ← taglio a dx
  bottom: 10,                      // ← taglio sotto
  left: 10,                        // ← taglio a sx
  borderRadius: 18,                // raggio interno ≈ al rettangolo neon
  overflow: 'hidden',              // <— il vero taglio
  pointerEvents: 'none'            // il click passa al bottone
},

voiceVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  // opzionale: ritaglio ancora più preciso con angoli arrotondati
  // clipPath: 'inset(6% 6% 10% 6% round 18px)',
  filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' // niente alone aggiuntivo
},
voiceVideoBtn: {
  position: 'relative',
  width: 100, height: 100,
  borderRadius: 22,
  background: 'linear-gradient(180deg,#1f2937,#111827)',
  border: 'none', padding: 0, cursor: 'pointer',
  boxShadow: '0 6px 14px rgba(0,0,0,.45), inset 0 1px 3px rgba(255,255,255,.22)',
  overflow: 'visible'
},

// Maschera che taglia tutto fuori dal bordo giallo
voiceCrop: {
  position: 'absolute',
  inset: 10,                      // padding interno dal bordo esterno del tasto
  overflow: 'hidden',             // taglio fisico
  borderRadius: 18,
  // clip ancora più precisa (taglio in % su ogni lato)
  clipPath: 'inset(7% 6% 9% 6% round 18px)',
  WebkitClipPath: 'inset(7% 6% 9% 6% round 18px)'
},

voiceVideo: {
  width: '100%', height: '100%',
  objectFit: 'cover',
  display: 'block',
  borderRadius: 0, boxShadow: 'none'   // evita aloni/curve indesiderate
},
  ocr42: {
    width: 42,
    height: 42,
    minWidth: 42,
    minHeight: 42,
    padding: 0,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,.18)',
    background: 'transparent',           // fondo trasparente
    display: 'inline-grid',
    placeItems: 'center',
    overflow: 'hidden',                  // taglia il video perfettamente
    boxShadow:
      'inset 0 1px 1px rgba(255,255,255,.25),' + // piccolo highlight interno
      '0 2px 6px rgba(0,0,0,.35)',               // ombra esterna soft
    cursor: 'pointer',
  },

  ocr42Video: {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',      // riempie senza bande
    pointerEvents: 'none',   // il click passa al button
    transform: 'translateZ(0)', // evita aliasing/blur su alcuni browser
  },
  // contenitore 42x42 con ritaglio, rilievo leggero
  voice42: {
    width: 42,
    height: 42,
    borderRadius: 12,
    padding: 0,
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(0,0,0,.18)',
    display: 'inline-grid',
    placeItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,.35), inset 0 1px 1px rgba(255,255,255,.18)',
    overflow: 'hidden',        // 👉 taglia il video ai bordi arrotondati
    cursor: 'pointer'
  },

  // il video riempie e viene ritagliato dal contenitore
  voice42Video: {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',        // 👉 niente bande: riempi e ritaglia
    objectPosition: 'center'   // puoi anche provare 'center 55%' se vuoi scendere leggermente
  }
  
}; 
const ListeProdottiNoSSR = dynamic(() => Promise.resolve(ListeProdotti), { ssr: false });
export default ListeProdottiNoSSR;







