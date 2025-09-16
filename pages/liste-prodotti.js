// pages/liste-prodotti.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Camera, Calendar } from 'lucide-react';

/* =========================================================================================
   LESSICO BASE (estendibile)
========================================================================================= */
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

const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;

/* =========================================================================================
   UTILITY DI NORMALIZZAZIONE (ROBUSTE) — NIENTE PESI COME QUANTITÀ
========================================================================================= */
function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function isSimilar(a, b) {
  const na = normKey(a), nb = normKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 3 && (nb.includes(na) || na.includes(nb))) return true;
  const A = new Set(na.split(' ').filter(Boolean));
  const B = new Set(nb.split(' ').filter(Boolean));
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
  const union = new Set([...A, ...B]).size;
  const j = inter / union;
  return j >= 0.5 || (inter >= 1 && (A.size === 1 || B.size === 1));
}
function toISODate(any) {
  const s = String(any || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const num = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (num) {
    const d = String(num[1]).padStart(2, '0');
    const M = String(num[2]).padStart(2, '0');
    let y = String(num[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  const mIt = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  const mm = s.toLowerCase().match(/(\d{1,2})\s+([a-zà-ú]+)\s+(\d{2,4})/i);
  if (mm) {
    const d = String(mm[1]).padStart(2, '0');
    const mon = mm[2].slice(0,3);
    const idx = mIt.indexOf(mon);
    if (idx >= 0) {
      let y = String(mm[3]);
      if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
      const M = String(idx+1).padStart(2, '0');
      return `${y}-${M}-${d}`;
    }
  }
  return '';
}

// ——— pattern per misure/dimensioni
const MEASURE_TOKEN_RE = /\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|lt|ml|cl)\b/gi;
const DIMENSION_RE     = /\b\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?\s*(?:cm|mm|m)\b/gi;
function isWeightOrVolumeLabel(lbl='') {
  const s = String(lbl).toLowerCase().trim();
  return /^(?:g|gr|kg|ml|cl|l|lt|grammi?|litri?)$/.test(s);
}
// UPP “sospetti” (mai pezzi reali)
const SUSPECT_UPP = new Set([125,200,220,225,230,240,250,280,300,330,350,375,400,410,450,454,480,500,700,720,733,750,800,900,910,930,950,1000,1250,1500,1750,2000]);

// drop righe amministrative
const NON_PRODUCT_RE = /\b(carta\s+\*{2,}|bancomat|pos|resto|sconto|arrotondamento|pagamento|totale|imponibile|ventilazione|iva|di\s+cui\s+iva)\b/i;
function shouldDropName(name=''){ return NON_PRODUCT_RE.test(String(name)); }

// brand canonici frequenti
const BRAND_ALIASES = {
  'm. bianco':'Mulino Bianco','mulino bianco':'Mulino Bianco',
  'saiwa':'Saiwa','san carlo':'San Carlo',
  'ferrero':'Ferrero','motta':'Motta','parmalat':'Parmalat','arborea':'Arborea',
  'de cecco':'De Cecco','kimbo':'Kimbo','pantene':'Pantene','nivea':'Nivea','malizia':'Malizia','vileda':'Vileda'
};
function canonBrand(b=''){ const k = normKey(b); return BRAND_ALIASES[k] || (b ? b.trim() : ''); }

// famiglie per euristiche
function productFamily(name=''){
  const s = normKey(name);
  if (/\bfiesta\b/.test(s)) return 'fam:fiesta';
  if (/\byo[-\s]?yo\b/.test(s)) return 'fam:yoyo';
  if (/\bpods?\b/.test(s)) return 'fam:pods';
  if (/\buova?\b/.test(s)) return 'fam:eggs';
  if (/\bspaghett|rigaton|penne|bucatini|fusill|mezze?\b/.test(s)) return 'fam:pasta';
  return 'fam:?';
}

// latte attrs
function milkAttrs(name=''){
  const s = normKey(name);
  const fat = /\bintero\b/.test(s) ? 'fat:i'
            : /\b(ps|parzialmente|semi|parz)\b/.test(s) ? 'fat:ps'
            : /\bscrem\b/.test(s) ? 'fat:s'
            : 'fat:?';
  const lf  = /\b(zymil|senza lattosio|delact|s\/la)\b/.test(s) ? 'lf:1' : 'lf:0';
  return `${fat}|${lf}`;
}

// chiave canonica per merge
function canonicalKey(p) {
  const brand = canonBrand(p.brand || '');
  let base = normKey(p.name || '')
    .replace(/\b(doc|uht|classico|classica|regular|regolare|shop|offerta|bio|igt|docg)\b/g,' ')
    .replace(/\b(\d+(?:[.,]\d+)?\s*(?:g|gr|kg|ml|cl|l|lt))\b/g, ' ')
    .replace(/\b(\d+)\s*(pz|pezzi|x|×)\b/g, ' ')
    .replace(/\s+/g,' ').trim();
  const fam  = productFamily(p.name || '');
  if (fam === 'fam:pasta') base = base.replace(/\b(\d{3,4})\b/g, ' ').trim();
  const milk = /latte\b/.test(base) ? ('|' + milkAttrs(p.name || '')) : '';
  return `${brand}|${base}|${fam}${milk}`;
}

/** Neutralizza SEMPRE pesi/volumi come quantità */
function cleanupPurchasesQuantities(list) {
  return (Array.isArray(list) ? list : []).map(p => {
    const out = { ...p };
    out.packs = Math.max(0, Number(out.packs || 0));
    out.unitsPerPack = Math.max(0, Number(out.unitsPerPack || 0));
    out.unitLabel = String(out.unitLabel || '').trim();

    if (isWeightOrVolumeLabel(out.unitLabel)) {
      out.unitsPerPack = 1; out.unitLabel = 'unità'; if (!out.packs) out.packs = 1;
    }

    const joined = `${String(out.name||'')} ${String(out.brand||'')}`.toLowerCase();

    // pattern UI tipo "500/500 g", "1000/1000 g"
    if (/\b(\d{2,5})\s*\/\s*\1\s*(?:g|gr|kg|ml|cl|l|lt)\b/i.test(joined)) {
      out.unitsPerPack = 1; out.unitLabel = 'unità'; if (!out.packs) out.packs = 1;
    }

    const hasMeasure = (joined.match(MEASURE_TOKEN_RE) || []).length > 0 || (joined.match(DIMENSION_RE) || []).length > 0;
    const piecesHit = /\b(pz|pezzi?|bottigli|capsul|pods?|bust|lattin|vasett|rotol|fogli|uova|brick|fette)\b/i
      .test(`${out.unitLabel} ${joined}`);
    const looksWeightNumber = !piecesHit && (hasMeasure || SUSPECT_UPP.has(out.unitsPerPack));

    if (looksWeightNumber) {
      out.unitsPerPack = 1; out.unitLabel = 'unità'; if (!out.packs) out.packs = 1;
    }

    if (!out.packs) out.packs = 1;
    if (!out.unitsPerPack) out.unitsPerPack = 1;
    if (!out.unitLabel) out.unitLabel = 'unità';

    return out;
  });
}

// fix prodotto/brand noti + famiglie
function sanitizeUnits(item) {
  const out = { ...item };
  out.brand = canonBrand(out.brand || '');
  const fam = productFamily(out.name || '');

  if (SUSPECT_UPP.has(Number(out.unitsPerPack || 0)) || isWeightOrVolumeLabel(out.unitLabel || '') || fam === 'fam:pasta') {
    out.unitsPerPack = 1; out.unitLabel = 'unità';
  }
  if (fam === 'fam:pods') {
    out.brand = out.brand || 'Dash';
    if (!out.unitsPerPack || out.unitLabel==='unità') { out.unitsPerPack = 30; out.unitLabel = 'pod'; }
  }
  if (fam === 'fam:fiesta') { out.brand = 'Ferrero'; if (!out.unitsPerPack || out.unitLabel==='unità') { out.unitsPerPack = 10; out.unitLabel = 'pezzi'; } }
  if (fam === 'fam:yoyo')   { out.brand = 'Motta';   if (!out.unitsPerPack || out.unitLabel==='unità') { out.unitsPerPack = 10; out.unitLabel = 'pezzi'; } }
  if (fam === 'fam:eggs')   { if (!out.unitsPerPack || out.unitsPerPack === 1) { out.unitsPerPack = 6; out.unitLabel = 'uova'; } }

  // correzioni ad hoc frequenti
  if (/espresso in gran/i.test(out.name)) out.name = 'Caffè espresso in grani';
  if (/caseificio/i.test(out.name)) { out.brand = 'Caseificio S. Stefano'; out.name = 'Formaggio fresco'; }

  return out;
}

function dedupeAndFix(items = []) {
  const map = new Map();
  for (const r of items) {
    const p = sanitizeUnits(r);
    const key = canonicalKey(p);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        ...p,
        packs: Math.max(1, Number(p.packs || 1)),
        unitsPerPack: Math.max(1, Number(p.unitsPerPack || 1)),
        unitLabel: p.unitLabel || 'unità'
      });
      continue;
    }
    cur.packs = Math.max(1, Number(cur.packs || 1)) + Math.max(1, Number(p.packs || 1));
    // scegli UPP più informativo
    const better = (a, b, aL, bL) => {
      if (aL === 'unità' && bL !== 'unità') return [b, bL];
      if (bL === 'unità' && aL !== 'unità') return [a, aL];
      return [Math.max(a, b), aL || bL || 'unità'];
    };
    const [u, lbl] = better(
      Math.max(1, Number(cur.unitsPerPack || 1)),
      Math.max(1, Number(p.unitsPerPack || 1)),
      cur.unitLabel || 'unità',
      p.unitLabel || 'unità'
    );
    cur.unitsPerPack = u; cur.unitLabel = lbl;

    // expiry → min
    const a = /^\d{4}-\d{2}-\d{2}$/.test(cur.expiresAt || '') ? cur.expiresAt : null;
    const b = /^\d{4}-\d{2}-\d{2}$/.test(p.expiresAt || '') ? p.expiresAt : null;
    if (!a && b) cur.expiresAt = b; else if (a && b && b < a) cur.expiresAt = b;

    cur.priceTotal = (Number(cur.priceTotal) || 0) + (Number(p.priceTotal) || 0);
  }
  return Array.from(map.values());
}

/* =========================================================================================
   PERSISTENZA LOCALE / CLOUD
========================================================================================= */
const LS_VER = 1;
const LS_KEY = 'jarvis_liste_prodotti@v1';
const CLOUD_SYNC = true;
const CLOUD_TABLE = 'jarvis_liste_state';
let __supabase = null;

function loadPersisted() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== LS_VER) return null;
    return data;
  } catch { return null; }
}
function persistNow(snapshot) {
  try {
    if (typeof window === 'undefined') return;
    const payload = {
      v: LS_VER,
      at: Date.now(),
      lists: snapshot.lists,
      stock: snapshot.stock,
      currentList: snapshot.currentList,
      imagesIndex: snapshot.imagesIndex || {},
      learned: snapshot.learned || { products:{}, aliases:{ product:{}, brand:{} }, keepTerms:{} }
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch (e) { console.warn('[persist] save failed', e); }
}

function productKey(name = '', brand = '') { return `${normKey(name)}|${normKey(brand)}`; }
function withRememberedImage(row, imagesIdx) {
  if (row?.image) return row;
  const key = productKey(row?.name, row?.brand || '');
  const img = imagesIdx?.[key];
  if (img) return { ...row, image: img };
  return row;
}

/* =========================================================================================
   FETCH / API UTILS
========================================================================================= */
function timeoutFetch(url, opts = {}, ms = 90000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(t))
    .catch(err => {
      if (err?.name === 'AbortError') {
        const why = ctrl.signal?.reason || 'timeout';
        throw new Error(`Abort/Timeout (${why}) dopo ${Math.round(ms/1000)}s`);
      }
      throw err;
    });
}
async function fetchJSONStrict(url, opts = {}, timeoutMs = 90000) {
  try {
    const r = await timeoutFetch(url, opts, timeoutMs);
    const ct = (r.headers.get?.('content-type') || '').toLowerCase();
    const raw = await r.text?.() || '';
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText || ''} — ${raw.slice(0,250)}`);
    if (!raw.trim()) return {};
    if (ct.includes('application/json')) return JSON.parse(raw);
    try { return JSON.parse(raw); } catch { return { data: raw }; }
  } catch (e) {
    if (/Abort|Timeout/i.test(String(e?.message||''))) {
      const r2 = await timeoutFetch(url, opts, Math.max(120000, timeoutMs+30000));
      const ct2 = (r2.headers.get?.('content-type') || '').toLowerCase();
      const raw2 = await r2.text?.() || '';
      if (!r2.ok) throw new Error(`HTTP ${r2.status} ${r2.statusText || ''} — ${raw2.slice(0,250)}`);
      if (!raw2.trim()) return {};
      if (ct2.includes('application/json')) return JSON.parse(raw2);
      try { return JSON.parse(raw2); } catch { return { data: raw2 }; }
    }
    throw e;
  }
}
async function readJsonSafe(res) {
  const ct = (res.headers?.get?.('content-type') || '').toLowerCase();
  const raw = await (res.text?.() || Promise.resolve(''));
  if (!raw.trim()) return { ok: res.ok, data: null, error: res.ok ? null : `HTTP ${res.status}` };
  if (ct.includes('application/json')) {
    try { return { ok: res.ok, ...(JSON.parse(raw) || {}) }; }
    catch (e) { return { ok: res.ok, data: null, error: `JSON parse error: ${e?.message || e}` }; }
  }
  try { return { ok: res.ok, ...(JSON.parse(raw) || {}) }; }
  catch { return { ok: res.ok, data: null, error: raw.slice(0,200) || `HTTP ${res.status}` }; }
}

/* =========================================================================================
   PROMPT BUILDERS OCR
========================================================================================= */
function buildOcrAssistantPrompt(ocrText, lexicon = []) {
  const LEX = Array.isArray(lexicon) && lexicon.length ? lexicon.join(', ') : 'latte, pasta, biscotti, detersivi, ...';
  return [
    'Sei Jarvis, estrattore strutturato di SCONTRINI. RISPONDI SOLO JSON con lo schema esatto:',
    '{ "store":"", "purchaseDate":"", "purchases":[{"name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","priceEach":0,"priceTotal":0,"currency":"","expiresAt":""}] }',
    'Regole: normalizza i nomi rispetto a questo lessico: ' + LEX,
    'NON interpretare pesi/volumi/dimensioni come quantità; packs/unitsPerPack solo con pattern espliciti (2x6, 2 conf da 6, 6 bottiglie).',
    'Ignora subtotali, IVA, metodi di pagamento, sconti (OFF.).',
    '--- INIZIO ---', ocrText, '--- FINE ---'
  ].join('\n');
}
function buildOcrStockBagPrompt(ocrText, lexicon = []) {
  const LEX = Array.isArray(lexicon) && lexicon.length ? lexicon.join(', ') : 'latte, pane, buste freezer, ...';
  return [
    'Sei Jarvis: da foto di prodotti/buste estrai SOLO JSON { "items":[{ "name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","expiresAt":"" }] }',
    'NON usare pesi/volumi/dimensioni come quantità; quantità solo con pattern espliciti.',
    'Lessico: ' + LEX,
    '--- INIZIO ---', ocrText, '--- FINE ---'
  ].join('\n');
}

/* =========================================================================================
   PARSER FALLBACK
========================================================================================= */
function coerceNum(x){
  if (x == null) return 0;
  const s = String(x).trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function parseReceiptMeta(ocrText) {
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  let purchaseDate = '';
  for (const ln of lines) {
    const iso = toISODate(ln);
    if (iso) { purchaseDate = iso; break; }
  }
  const bad = /(totale|iva|imp|euro|€|tel|cassa|scontrino|fiscale|subtot|pagamento|contanti|resto)/i;
  let store = '';
  for (const ln of lines) {
    const hasLetters = /[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(ln);
    if (hasLetters && !bad.test(ln) && ln.length >= 3) { store = ln.replace(/\s{2,}/g,' ').trim(); break; }
  }
  return { store, purchaseDate };
}
function parseReceiptPurchases(ocrText) {
  const rawLines = String(ocrText || '')
    .split(/\r?\n/).map(s => s.replace(/\s{2,}/g, ' ').trim()).filter(Boolean);

  const lines = [];
  for (const ln of rawLines) {
    if (/^\d+\s*[xX]\s*\d+(?:[.,]\d{2})(?:\s+\d+(?:[.,]\d{2}))?\s*$/i.test(ln)) {
      if (lines.length) lines[lines.length - 1] += ' ' + ln;
      else lines.push(ln);
      continue;
    }
    lines.push(ln);
  }

  const HEADER_RE = /^\s*(totale|subtotale|di\s*cui\s*iva|iva\b|pagamento|resto|importo|pezz[i]?|cassa|cassiere|transaz|documento|documento\s+commerciale|descrizione|prezzo|\beuro\b|€|negozio|p\.?iva|tel|maxistore|deco)\b/i;
  const IGNORE_RE = /\b(shopper|sacchetto|busta|cauzione|vuoto|off\.)\b/i;

  const out = [];
  for (let raw of lines) {
    if (HEADER_RE.test(raw)) continue;
    if (/^\d{6,}$/.test(raw)) continue;

    let work = raw.replace(/^[T*+\-]+\s*/, '').trim();
    if (!work) continue;

    let packsFromTail = null;
    const tailQty = work.match(/(\d+)\s*[xX]\s*\d+(?:[.,]\d{2})(?:\s+\d+(?:[.,]\d{2}))?\s*$/);
    if (tailQty) {
      packsFromTail = parseInt(tailQty[1], 10);
      work = work.replace(tailQty[0], '').trim();
    }
    work = work
      .replace(/\s+\d{1,2}%\s+\d+(?:[.,]\d{2})\s*$/i, '')
      .replace(/(?:€|eur|euro)\s*\d+(?:[.,]\d{2})\s*$/i, '')
      .replace(/\s+\d+(?:[.,]\d{2})\s*$/i, '')
      .trim();

    if (IGNORE_RE.test(work)) continue;

    let packsInline = null;
    const mInline = work.match(/\b[xX]\s*(\d+)\b/);
    if (mInline) {
      packsInline = parseInt(mInline[1], 10);
      work = work.replace(mInline[0], '').trim();
    }

    work = work.replace(/\b(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|lt))\b/gi, '').replace(/\s{2,}/g, ' ').trim();

    let name = work, brand = '';
    const parts = name.split(' ');
    if (parts.length > 1 && /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9\-'.]*$/.test(parts[parts.length - 1])) {
      brand = parts.pop();
      name = parts.join(' ');
    }

    const txt = name.toLowerCase();
    if (/prezzemol/.test(txt)) name = 'prezzemolo';
    else if (/pan\s+bauletto/.test(txt)) name = 'pan bauletto bianco';
    else if (/yo-?yo/.test(txt)) name = 'merendine yo-yo';
    else if (/lacca\b/i.test(name)) name = 'lacca per capelli';
    else if (/pantene.*shampoo/i.test(name)) name = 'shampoo';
    else if (/latte\s+zymil/i.test(name)) name = 'latte';
    else if (/candeggin/i.test(name)) name = 'candeggina';
    else if (/\bcaff[eè]\b/.test(txt)) name = 'caffè';

    const packs = packsFromTail || packsInline || 1;

    out.push({
      name: name.trim(),
      brand: brand || '',
      packs: Math.max(1, packs),
      unitsPerPack: 1,      // ⬅ fallback locale: MAI dedurre pezzi da pesi
      unitLabel: 'unità',
      expiresAt: ''
    });
  }
  return out;
}

/* =========================================================================================
   CALCOLI SCORTE
========================================================================================= */
function clamp01(x){ return Math.max(0, Math.min(1, Number(x) || 0)); }
function residueUnitsOf(s){
  if (s?.packsOnly) return Math.max(0, Number(s?.packs || 0));
  const upp = Math.max(1, Number(s?.unitsPerPack || 1));
  const ru  = Number(s?.residueUnits);
  return Number.isFinite(ru) ? Math.max(0, ru) : Math.max(0, Number(s?.packs || 0) * upp);
}
function baselineUnitsOf(s){
  const upp = Math.max(1, Number(s.unitsPerPack || 1));
  if (s.packsOnly) return Math.max(1, Number(s.baselinePacks || s.packs || 1));
  const bp  = Number(s.baselinePacks);
  const base = Number.isFinite(bp) && bp > 0 ? bp * upp : Number(s.packs || 0) * upp;
  return Math.max(upp, base);
}
function residueInfo(s){
  const current  = residueUnitsOf(s);
  const baseline = baselineUnitsOf(s);
  const pct = baseline ? clamp01(current / baseline) : 1;
  return { current, baseline, pct };
}
const RESIDUE_THRESHOLDS = { green: 0.60, amber: 0.30 };
function colorForPct(p){
  const x = clamp01(p);
  if (x >= RESIDUE_THRESHOLDS.green) return '#16a34a';
  if (x >= RESIDUE_THRESHOLDS.amber) return '#f59e0b';
  return '#ef4444';
}
function restockTouch(baselineFromPacks, lastDateISO, unitsPerPack){
  const upp = Math.max(1, Number(unitsPerPack || 1));
  const bp  = Math.max(0, Number(baselineFromPacks || 0));
  const fullUnits = bp * upp;
  return {
    baselinePacks: bp,
    lastRestockAt: lastDateISO,
    residueUnits: fullUnits,
    driftBaseRU: fullUnits,
    driftBaseAt: lastDateISO,
  };
}

/* =========================================================================================
   COMPONENTE
========================================================================================= */
export default function ListeProdotti() {
  const [currentList, setCurrentList] = useState(LIST_TYPES.SUPERMARKET);
  const [lists, setLists] = useState({ [LIST_TYPES.SUPERMARKET]: [], [LIST_TYPES.ONLINE]: [] });

  const [stock, setStock] = useState([]);
  const [critical, setCritical] = useState([]);

  const [form, setForm] = useState({ name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità' });
  const [showListForm, setShowListForm] = useState(false);

  const [editingRow, setEditingRow] = useState(null);
  const [editDraft, setEditDraft] = useState({
    name: '', brand: '', packs: '0', unitsPerPack: '1', unitLabel: 'unità', expiresAt: '', residueUnits: '0', _ruTouched: false,
  });

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  function showToast(msg, type='ok'){ setToast({ msg, type }); setTimeout(() => setToast(null), 2000); }

  const stockLockRef = useRef(0);
  const persistTimerRef = useRef(null);

  // OCR inputs / immagini
  const ocrInputRef = useRef(null);
  const rowOcrInputRef = useRef(null);
  const rowImageInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);
  const [targetImageIdx, setTargetImageIdx] = useState(null);

  const [imagesIndex, setImagesIndex] = useState({});
  const userIdRef = useRef(null);

  // Cloud sync (Supabase)
  useEffect(() => {
    if (!CLOUD_SYNC) return;
    let mounted = true;
    (async () => {
      try {
        const mod = await import('@/lib/supabaseClient').catch(() => null);
        if (!mod?.supabase) return;
        __supabase = mod.supabase;
        const { data: userData } = await __supabase.auth.getUser();
        const uid = userData?.user?.id || null;
        if (mounted) userIdRef.current = uid;
        if (!uid) return;
        const { data: row } = await __supabase.from(CLOUD_TABLE).select('state').eq('user_id', uid).maybeSingle();
        const st = row?.state;
        if (!st) return;
        setLists({
          [LIST_TYPES.SUPERMARKET]: Array.isArray(st.lists?.[LIST_TYPES.SUPERMARKET]) ? st.lists[LIST_TYPES.SUPERMARKET] : [],
          [LIST_TYPES.ONLINE]: Array.isArray(st.lists?.[LIST_TYPES.ONLINE]) ? st.lists[LIST_TYPES.ONLINE] : [],
        });
        if (Array.isArray(st.stock)) setStock(st.stock);
        if ([LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].includes(st.currentList)) setCurrentList(st.currentList);
      } catch (e) { if (DEBUG) console.warn('[cloud init] skipped', e); }
    })();
    return () => { mounted = false; };
  }, []);

  // Cloud upsert debounce (senza immagini)
  const cloudTimerRef = useRef(null);
  useEffect(() => {
    if (!CLOUD_SYNC || !__supabase) return;
    if (!userIdRef.current) return;
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    const cloudState = {
      lists: {
        [LIST_TYPES.SUPERMARKET]: (lists?.[LIST_TYPES.SUPERMARKET] || []).map(({ image, ...r }) => r),
        [LIST_TYPES.ONLINE]: (lists?.[LIST_TYPES.ONLINE] || []).map(({ image, ...r }) => r),
      },
      stock: (stock || []).map(({ image, ...r }) => r),
      currentList
    };
    cloudTimerRef.current = setTimeout(async () => {
      try {
        await __supabase.from(CLOUD_TABLE).upsert({ user_id: userIdRef.current, state: cloudState }, { onConflict: 'user_id' });
      } catch (e) { if (DEBUG) console.warn('[cloud upsert] fail', e); }
    }, 5000);
    return () => clearTimeout(cloudTimerRef.current);
  }, [lists, stock, currentList]);

  // Hydration locale
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = loadPersisted();
    if (!saved) return;
    if (stockLockRef.current && Date.now() < stockLockRef.current) return;
    if (saved.lists && typeof saved.lists === 'object') {
      setLists({
        [LIST_TYPES.SUPERMARKET]: Array.isArray(saved.lists[LIST_TYPES.SUPERMARKET]) ? saved.lists[LIST_TYPES.SUPERMARKET] : [],
        [LIST_TYPES.ONLINE]: Array.isArray(saved.lists[LIST_TYPES.ONLINE]) ? saved.lists[LIST_TYPES.ONLINE] : [],
      });
    }
    if (Array.isArray(saved.stock)) setStock(saved.stock);
    if (saved.currentList && (saved.currentList === LIST_TYPES.SUPERMARKET || saved.currentList === LIST_TYPES.ONLINE)) {
      setCurrentList(saved.currentList);
    }
    if (saved.imagesIndex && typeof saved.imagesIndex === 'object') setImagesIndex(saved.imagesIndex);
  }, []);

  // Autosave locale
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    const snapshot = { lists, stock, currentList, imagesIndex, learned:{ products:{}, aliases:{ product:{}, brand:{} }, keepTerms:{} } };
    persistTimerRef.current = setTimeout(() => { persistNow(snapshot); }, 300);
    return () => clearTimeout(persistTimerRef.current);
  }, [lists, stock, currentList, imagesIndex]);

  // Critici
  useEffect(() => {
    const crit = stock.filter(p => {
      const current = residueUnitsOf(p);
      const baseline = baselineUnitsOf(p);
      const pct = baseline ? (current / baseline) : 1;
      const lowResidue = pct < 0.20;
      const expSoon   = (() => {
        if (!p?.expiresAt) return false;
        const d = new Date(p.expiresAt); if (Number.isNaN(d.getTime())) return false;
        const days = Math.floor((d - new Date()) / 86400000);
        return days <= 10;
      })();
      return lowResidue || expSoon;
    });
    setCritical(crit);
  }, [stock]);

  /* -------------------------------------------------------------------------------------
     LISTE
  ------------------------------------------------------------------------------------- */
  function addManualItem(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const brand = form.brand.trim();
    const packs = Math.max(1, Number(String(form.packs).replace(',', '.')) || 1);
    const unitsPerPack = Math.max(1, Number(String(form.unitsPerPack).replace(',', '.')) || 1);
    const unitLabel = (form.unitLabel || 'unità').trim() || 'unità';

    setLists(prev => {
      const next = { ...prev };
      const items = [...(prev[currentList] || [])];
      const idx = items.findIndex(i =>
        i.name.toLowerCase() === name.toLowerCase() &&
        (i.brand||'').toLowerCase() === brand.toLowerCase() &&
        Number(i.unitsPerPack||1) === unitsPerPack
      );
      if (idx >= 0) {
        items[idx] = { ...items[idx], qty: Number(items[idx].qty || 0) + packs };
      } else {
        items.push({
          id: 'tmp-' + Math.random().toString(36).slice(2),
          name, brand, qty: packs, unitsPerPack, unitLabel, purchased: false
        });
      }
      next[currentList] = items;
      return next;
    });

    setForm({ name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità' });
    setShowListForm(false);
  }
  function removeItem(id) {
    setLists(prev => {
      const next = { ...prev };
      next[currentList] = (prev[currentList] || []).filter(i => i.id !== id);
      return next;
    });
  }
  function incQty(id, delta) {
    setLists(prev => {
      const next = { ...prev };
      next[currentList] = (prev[currentList] || []).map(i => (
        i.id === id ? { ...i, qty: Math.max(0, Number(i.qty || 0) + delta) } : i
      )).filter(i => i.qty > 0);
      return next;
    });
  }

  /* -------------------------------------------------------------------------------------
     OCR SCONTRINO / BUSTE → SCORTE + FINANZE (senza modale)
  ------------------------------------------------------------------------------------- */
  const API_ASSISTANT_TEXT = '/api/assistant';
  const API_OCR = '/api/ocr';
  const API_FINANCES_INGEST = '/api/finances/ingest';

  async function handleOCR(files) {
    if (!files) return;
    if (busy) return;
    setBusy(true);

    let purchases = [];
    let store = '';
    let purchaseDate = '';

    // 0) pick primo file valido
    const list = Array.from(files || []);
    const isFileLike = (v) => !!(v && typeof v === 'object' && typeof v.type === 'string' && typeof v.size === 'number');
    const picked = list.filter(isFileLike);
    if (!picked.length) { setBusy(false); return; }

    try {
      const first = picked[0];
      const aliases = ['images', 'files', 'file', 'image'];

      // 1) OCR
      const fdOcr = new FormData();
      for (const k of aliases) fdOcr.append(k, first, first.name || 'receipt.jpg');
      let ocrAns = await fetchJSONStrict(API_OCR, { method: 'POST', body: fdOcr }, 90000);
      let ocrText = String(ocrAns?.text || ocrAns?.data?.text || ocrAns?.data || '').trim();

      // Vision one-shot
      if (Array.isArray(ocrAns?.purchases) && ocrAns.purchases.length) {
        purchases = ocrAns.purchases.map(p => ({
          name: String(p.name||'').trim(),
          brand: String(p.brand||'').trim(),
          packs: coerceNum(p.packs),
          unitsPerPack: coerceNum(p.unitsPerPack),
          unitLabel: String(p.unitLabel || '').trim() || 'unità',
          priceEach: coerceNum(p.priceEach),
          priceTotal: coerceNum(p.priceTotal),
          currency: String(p.currency||'').trim() || 'EUR',
          expiresAt: toISODate(p.expiresAt || '')
        }));
        store        = String(ocrAns.store || '').trim();
        purchaseDate = toISODate(ocrAns.purchaseDate || '');
      }

      // HEIC retry
      if (!ocrText && /heic|heif/i.test(first?.type || '')) {
        const fd2 = new FormData();
        for (const k of aliases) fd2.append(k, first, first.name || 'receipt.heic');
        const o2 = await fetchJSONStrict(API_OCR, { method:'POST', body: fd2 }, 90000);
        if (o2 && (o2.text || (o2.items && o2.items.length))) {
          ocrAns = o2;
          ocrText = String(o2?.text || o2?.data?.text || o2?.data || '').trim();
        }
      }

      // 2) items buste
      if (!purchases.length && Array.isArray(ocrAns?.items) && ocrAns.items.length) {
        purchases = ocrAns.items.map(p => ({
          name: String(p?.name || '').trim(),
          brand: String(p?.brand || '').trim(),
          packs: coerceNum(p?.packs),
          unitsPerPack: coerceNum(p?.unitsPerPack),
          unitLabel: String(p?.unitLabel || '').trim() || 'unità',
          priceEach: 0, priceTotal: 0, currency: 'EUR',
          expiresAt: toISODate(p?.expiresAt || '')
        })).filter(p => p.name);
      }

      // 3) Parser scontrino testo → JSON (fallback)
      if (!purchases.length && ocrText) {
        const promptTicket = buildOcrAssistantPrompt(ocrText, GROCERY_LEXICON);
        try {
          const r = await timeoutFetch(API_ASSISTANT_TEXT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: promptTicket })
          }, 60000);
          const safe = await readJsonSafe(r);
          const answer = safe?.answer || safe?.data || safe;
          const parsed = typeof answer === 'string' ? (() => { try { return JSON.parse(answer); } catch { return null; } })() : answer;
          if (parsed?.purchases) {
            purchases = (parsed.purchases || []).map(p => ({
              name: String(p?.name||'').trim(),
              brand: String(p?.brand||'').trim(),
              packs: coerceNum(p?.packs),
              unitsPerPack: coerceNum(p?.unitsPerPack),
              unitLabel: String(p?.unitLabel||'').trim() || 'unità',
              priceEach: coerceNum(p?.priceEach),
              priceTotal: coerceNum(p?.priceTotal),
              currency: String(p?.currency||'').trim() || 'EUR',
              expiresAt: toISODate(p?.expiresAt || '')
            })).filter(p => p.name);
          }
        } catch (e) { if (DEBUG) console.warn('[ASSISTANT parse] fallback KO', e); }
      }

      // 4) Fallback locale puro
      if (!purchases.length && ocrText) {
        purchases = parseReceiptPurchases(ocrText).map(p => ({
          name: p.name, brand: p.brand || '', packs: p.packs || 0, unitsPerPack: 1,
          unitLabel: 'unità', priceEach: 0, priceTotal: 0, currency: 'EUR', expiresAt: ''
        }));
      }

      // Meta da testo se mancano
      if (!store || !purchaseDate) {
        const meta = parseReceiptMeta(ocrText || '');
        store        = (store || meta.store || '').trim();
        purchaseDate = toISODate(purchaseDate || meta.purchaseDate || '');
      }

      if (!purchases.length) { showToast('Nessuna riga acquisto riconosciuta', 'err'); return; }

      // 5) Filtra amministrative + normalizza quantità (no pesi come pezzi)
      purchases = purchases.filter(p => p.name && !shouldDropName(p.name));
      purchases = cleanupPurchasesQuantities(purchases);

      // 6) Normalizzazione web/LLM (opzionale)
      try {
        const resp = await timeoutFetch('/api/normalize', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            items: purchases.map(p => ({ name:p.name, brand:p.brand||'' })),
            locale:'it-IT',
            trace: true
          })
        }, 60000);
        const raw = await resp.text();
        let j = null; try { j = JSON.parse(raw); } catch {}
        if (resp.ok && j?.ok && Array.isArray(j.results)) {
          const results = j.results;
          purchases = purchases.map((p, i) => {
            const r = results[i]?.out;
            if (!r) return p;
            const normName   = String(r.normalizedName || '').trim();
            const canonBrand = String(r.canonicalBrand || '').trim();
            const out = { ...p, name: normName || p.name, brand: canonBrand || p.brand || '' };
            // image thumb
            if (r.imageUrl) {
              const proxied = `/api/img-proxy?url=${encodeURIComponent(r.imageUrl)}&w=256&h=256&fit=cover&format=jpg`;
              out.image = proxied; out.imageDirect = r.imageUrl;
              const key = productKey(out.name, out.brand||'');
              setImagesIndex(prev => (prev && prev[key] === proxied) ? prev : { ...prev, [key]: proxied });
            }
            return out;
          });
        }
      } catch (e) { if (DEBUG) console.warn('[normalize web] skip', e); }

      // 7) Dedupe robusto
      const itemsReady = dedupeAndFix(purchases);

      // 8) Update Liste (decremento su match esatto nome+brand+UPP)
      setLists(prev => {
        const next = { ...prev };
        const keyNB = (name = '', brand = '') => `${normKey(name)}|${normKey(brand)}`;
        const findListIndexExact = (arr = [], p = {}) => {
          const key = keyNB(p?.name, p?.brand || '');
          const upp = Number(p?.unitsPerPack ?? 1) || 1;
          return arr.findIndex(i =>
            keyNB(i?.name, i?.brand || '') === key &&
            Number(i?.unitsPerPack || 1) === upp
          );
        };
        const decList = (listKey) => {
          const arr = [...(next[listKey] || [])];
          for (const p of itemsReady) {
            const idx = findListIndexExact(arr, p);
            if (idx < 0) continue;
            const dec = Math.max(1, Number(p.packs || 1));
            const cur = arr[idx];
            const newQty = Math.max(0, Number(cur?.qty || 0) - dec);
            arr[idx] = { ...cur, qty: newQty, purchased: true };
          }
          next[listKey] = arr.filter(i => Number(i.qty || 0) > 0 || !i.purchased);
        };
        decList(LIST_TYPES.SUPERMARKET);
        decList(LIST_TYPES.ONLINE);
        return next;
      });

      // 9) Update Scorte (neutralizza di nuovo UPP sospetti in ingresso)
      setStock(prev => {
        const arr = [...prev];
        const todayISO = new Date().toISOString().slice(0,10);

        for (const p of itemsReady) {
          let packs = Math.max(0, Number(p.packs || 0));
          let upp   = Math.max(1, Number(p.unitsPerPack || 1));
          let unitL = p.unitLabel || 'unità';

          if (SUSPECT_UPP.has(upp) || isWeightOrVolumeLabel(unitL)) {
            upp = 1; unitL = 'unità';
          }

          // match esatto per chiave grezza: name|brand|upp
          const keyExact = `${normKey(p.name)}|${normKey(p.brand||'')}|${upp}`;
          const idx = arr.findIndex(s => `${normKey(s.name)}|${normKey(s.brand||'')}|${Number(s.unitsPerPack||1)}` === keyExact);

          if (idx >= 0) {
            const old = arr[idx];
            const newP = Math.max(0, Number(old.packs || 0) + packs);
            arr[idx] = {
              ...old,
              name: p.name,
              brand: p.brand || old.brand,
              packs: newP,
              unitsPerPack: upp,
              unitLabel: old.unitLabel || unitL,
              expiresAt: p.expiresAt || old.expiresAt || '',
              packsOnly: false,
              ...restockTouch(newP, todayISO, upp),
              ...( !old.image && p.image ? { image: p.image } : {} ),
            };
          } else {
            const row = withRememberedImage({
              name: p.name,
              brand: p.brand || '',
              packs: packs || 1,
              unitsPerPack: upp,
              unitLabel: unitL,
              expiresAt: p.expiresAt || '',
              baselinePacks: packs || 1,
              lastRestockAt: todayISO,
              avgDailyUnits: 0,
              residueUnits: (packs || 1) * upp,
              packsOnly: false,
              needsUpdate: false,
              image: p.image || ''
            }, imagesIndex);
            arr.unshift(row);
          }
        }
        return arr;
      });

      // 10) Finanze
      try {
        const payload = {
          ...(userIdRef.current ? { user_id: userIdRef.current } : {}),
          ...(store ? { store } : {}),
          ...(purchaseDate ? { purchaseDate } : {}),
          payment_method:'cash', card_label:null,
          items: itemsReady.map(p => ({
            name: p.name,
            brand: p.brand || '',
            packs: Number(p.packs || 0),
            unitsPerPack: Number(p.unitsPerPack || 0),
            unitLabel: p.unitLabel || '',
            priceEach: Number(p.priceEach || 0),
            priceTotal: Number(p.priceTotal || 0),
            currency: p.currency || 'EUR',
            expiresAt: p.expiresAt || ''
          }))
        };
        await fetchJSONStrict(API_FINANCES_INGEST, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
        }, 40000);
        showToast('OCR scorte + Finanze completati ✓', 'ok');
      } catch (e) {
        console.warn('[FINANCES_INGEST] fail', e);
        showToast(`Finanze: ${e.message}`, 'err');
      }
    } catch (e) {
      console.error('[OCR scorte] error', e);
      showToast(`Errore OCR scorte: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  }

  /* -------------------------------------------------------------------------------------
     EDIT RIGA SCORTE
  ------------------------------------------------------------------------------------- */
  function startRowEdit(index, row){
    const initRU = String(Number(row.packs || 0) * Number(row.unitsPerPack || 1));
    setEditingRow(index);
    setEditDraft({
      name: row.name || '',
      brand: row.brand || '',
      packs: String(Number(row.packs ?? 0)),
      unitsPerPack: String(Number(row.unitsPerPack ?? 1)),
      unitLabel: row.unitLabel || 'unità',
      expiresAt: row.expiresAt || '',
      residueUnits: row.packsOnly ? String(Number(row.packs||0)) : (row.residueUnits ?? initRU),
      _ruTouched: false,
    });
  }
  function handleEditDraftChange(field, value){
    setEditDraft(prev => ({ ...prev, [field]: value, ...(field === 'residueUnits' ? { _ruTouched: true } : null) }));
  }
  function cancelRowEdit(){
    setEditingRow(null);
    setEditDraft({ name: '', brand: '', packs: '0', unitsPerPack: '1', unitLabel: 'unità', expiresAt: '', residueUnits: '0', _ruTouched:false });
  }
  function saveRowEdit(index){
    setStock(prev => {
      const arr = [...prev];
      const old = arr[index];
      if (!old) return prev;

      const name = (editDraft.name || '').trim();
      const brand = (editDraft.brand || '').trim();
      let unitsPerPack = Math.max(1, Number(String(editDraft.unitsPerPack).replace(',','.')) || 1);
      let unitLabel = (editDraft.unitLabel || 'unità').trim() || 'unità';
      const expiresAt = toISODate(editDraft.expiresAt || '');
      const newPacks = Math.max(0, Number(String(editDraft.packs).replace(',','.')) || 0);

      // neutralizza pesi:
      if (SUSPECT_UPP.has(unitsPerPack) || isWeightOrVolumeLabel(unitLabel)) {
        unitsPerPack = 1; unitLabel = 'unità';
      }

      const todayISO = new Date().toISOString().slice(0,10);
      const uppOld = Math.max(1, Number(old.unitsPerPack || 1));
      const wasUnits = old.packsOnly ? Number(old.packs||0) : Number(old.packs || 0) * uppOld;
      const nowUnits = newPacks * unitsPerPack;
      const restock = nowUnits > wasUnits;

      let ru = residueUnitsOf(old);
      const ruTouched = !!editDraft._ruTouched;
      if (ruTouched) {
        const ruRaw = Number(String(editDraft.residueUnits ?? '').replace(',','.'));
        if (Number.isFinite(ruRaw)) ru = Math.max(0, ruRaw);
      }
      const fullNow = Math.max(unitsPerPack, nowUnits);
      if (!old.packsOnly) ru = Math.min(ru, fullNow);

      let next = {
        ...old,
        name, brand,
        packs: newPacks,
        unitsPerPack, unitLabel,
        expiresAt,
        packsOnly: false
      };

      if (restock) {
        next = { ...next, ...restockTouch(newPacks, todayISO, unitsPerPack) };
      } else {
        next.residueUnits = old.packsOnly ? Math.max(0, Number(newPacks)) : ru;
      }

      arr[index] = next;
      return arr;
    });

    setEditingRow(null);
  }
  function deleteStockRow(index){ setStock(prev => prev.filter((_, i) => i !== index)); }

  // Immagine riga
  async function handleRowImage(files, idx) {
    const file = (files && files[0]) || null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setStock(prev => {
        const arr = [...prev];
        if (!arr[idx]) return prev;
        const updated = { ...arr[idx], image: dataUrl };
        arr[idx] = updated;
        const key = productKey(updated.name, updated.brand || '');
        setImagesIndex(prevIdx => ({ ...prevIdx, [key]: dataUrl }));
        return arr;
      });
      showToast('Immagine prodotto aggiornata ✓', 'ok');
    };
    reader.readAsDataURL(file);
  }

  /* =========================================================================================
     RENDER
  ========================================================================================== */
  return (
    <>
      <Head><title>🛍 Lista Prodotti</title></Head>

      <div style={styles.page}>
        <div style={styles.card}>

          {/* SEZ 1 — switch liste */}
          <section style={styles.sectionBox}>
            <p style={styles.kicker}>scegli la lista che vuoi</p>

            <div style={styles.switchImgRow}>
              <button
                type="button"
                onClick={() => setCurrentList(LIST_TYPES.SUPERMARKET)}
                aria-pressed={currentList === LIST_TYPES.SUPERMARKET}
                style={styles.switchImgBtn}
                title="Lista Supermercato"
              >
                <Image
                  src={ currentList === LIST_TYPES.SUPERMARKET
                    ? '/img/Button/lista%20supermercato%20accesa.png'
                    : '/img/Button/lista%20supermercato%20spenta.png' }
                  alt="Lista Supermercato"
                  width={150}
                  height={45}
                  priority
                  style={styles.switchImg}
                />
              </button>

              <button
                type="button"
                onClick={() => setCurrentList(LIST_TYPES.ONLINE)}
                aria-pressed={currentList === LIST_TYPES.ONLINE}
                style={styles.switchImgBtn}
                title="Lista Online"
              >
                <Image
                  src={ currentList === LIST_TYPES.ONLINE
                    ? '/img/Button/Lista%20on%20line%20acceso.png'
                    : '/img/Button/lista%20on%20line%20spenta.png' }
                  alt="Lista Online"
                  width={150}
                  height={45}
                  priority
                  style={styles.switchImg}
                />
              </button>
            </div>

            <div style={styles.toolsRow}>
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

            {showListForm && (
              <div style={styles.sectionInner}>
                <form onSubmit={addManualItem} style={styles.formRow}>
                  <input placeholder="Prodotto" value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} style={styles.input} required />
                  <input placeholder="Marca" value={form.brand} onChange={e=>setForm(f=>({...f, brand:e.target.value}))} style={styles.input} />
                  <input placeholder="Confezioni" inputMode="decimal" value={form.packs} onChange={e=>setForm(f=>({...f, packs:e.target.value}))} style={{ ...styles.input, width: 140 }} required />
                  <input placeholder="Unità/conf." inputMode="decimal" value={form.unitsPerPack} onChange={e=>setForm(f=>({...f, unitsPerPack:e.target.value}))} style={{ ...styles.input, width: 140 }} required />
                  <input placeholder="Etichetta (es. bottiglie)" value={form.unitLabel} onChange={e=>setForm(f=>({...f, unitLabel:e.target.value}))} style={{ ...styles.input, width: 170 }} />
                  <button style={styles.primaryBtn} disabled={busy}>Aggiungi alla lista</button>
                </form>
              </div>
            )}

            {/* lista corrente */}
            <div style={styles.sectionInner}>
              <h3 style={styles.h3}>Lista corrente: <span style={{opacity:.85}}>{currentList === LIST_TYPES.ONLINE ? 'Spesa Online' : 'Supermercato'}</span></h3>
              {(lists[currentList] || []).length === 0 ? (
                <p style={{ opacity: .8 }}>Nessun prodotto ancora</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(lists[currentList] || []).map((it) => {
                    const isBought = !!it.purchased;
                    return (
                      <div key={it.id} style={{ ...styles.listCardRed, ...(isBought ? styles.listCardRedBought : null) }}>
                        <div style={styles.rowLeft}>
                          <div style={styles.rowName}>{it.name}{it.brand ? <span style={styles.rowBrand}> · {it.brand}</span> : null}</div>
                          <div style={styles.rowMeta}>{it.qty} conf. × {it.unitsPerPack} {it.unitLabel} {isBought ? <span style={styles.badgeBought}>preso</span> : <span style={styles.badgeToBuy}>da prendere</span>}</div>
                        </div>
                        <div style={styles.rowActions}>
                          <button title="–1" onClick={() => incQty(it.id, -1)} style={{ ...styles.iconBtnBase, ...styles.iconBtnDark }}>−</button>
                          <button title="+1" onClick={() => incQty(it.id, +1)} style={{ ...styles.iconBtnBase, ...styles.iconBtnDark }}>+</button>
                          <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.trashBtn}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* SEZ 2 — CRITICI */}
          <section style={styles.sectionBox}>
            {critical.length === 0 ? (
              <p style={{ opacity: .8, marginTop: 4 }}>Nessun prodotto critico.</p>
            ) : (
              <div style={styles.critListWrap}>
                {critical.map((s, i) => {
                  const { current, baseline, pct } = residueInfo(s);
                  const w = Math.round(pct * 100);
                  return (
                    <div key={i} style={styles.critRow}>
                      <div style={styles.critName}>{s.name}{s.brand ? <span style={styles.rowBrand}> · {s.brand}</span> : null}</div>
                      <div style={styles.progressOuterCrit}><div style={{ ...styles.progressInner, width: `${w}%`, background: colorForPct(pct) }} /></div>
                      <div style={styles.critMeta}>
                        {Math.round(current)}/{Math.max(1, Math.round(baseline))} {s.unitLabel || 'unità'}
                        {s.expiresAt ? <span style={styles.expiryChip}>scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}</span> : null}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:8 }}>
                        <button
                          title="Elimina definitivamente"
                          onClick={() => { const idx = stock.findIndex(ss => isSimilar(ss.name, s.name) && ((ss.brand || '') === (s.brand || ''))); if (idx >= 0) deleteStockRow(idx); }}
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

          {/* SEZ 3 — SCORTE */}
          <section style={styles.sectionBox}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
              <button type="button" onClick={() => ocrInputRef.current?.click()} style={styles.ocr42} aria-label="Scanner scontrino (OCR)" title="Scanner scontrino (OCR)">
                <video autoPlay loop muted playsInline preload="metadata" style={styles.ocr42Video}><source src="/video/Ocr%20scontrini.mp4" type="video/mp4" /></video>
              </button>
              <h4 style={{margin:0}}>Tutte le scorte</h4>
            </div>

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
                        <div>
                          <div style={styles.formRowWrap}>
                            <input style={styles.input} value={editDraft.name} onChange={e => handleEditDraftChange('name', e.target.value)} />
                            <input style={styles.input} value={editDraft.brand} onChange={e => handleEditDraftChange('brand', e.target.value)} placeholder="Marca" />
                          </div>
                          <div style={styles.formRowWrap}>
                            <input style={{ ...styles.input, width: 120 }} inputMode="decimal" value={editDraft.packs} onChange={e => handleEditDraftChange('packs', e.target.value)} placeholder="Confezioni" />
                            <input style={{ ...styles.input, width: 140 }} inputMode="decimal" value={editDraft.unitsPerPack} onChange={e => handleEditDraftChange('unitsPerPack', e.target.value)} placeholder="Unità/conf." />
                            <input style={{ ...styles.input, width: 150 }} value={editDraft.unitLabel} onChange={e => handleEditDraftChange('unitLabel', e.target.value)} placeholder="Etichetta" />
                          </div>
                          <div style={styles.formRowWrap}>
                            <input style={{ ...styles.input, width: 220 }} value={editDraft.expiresAt} onChange={e => handleEditDraftChange('expiresAt', e.target.value)} placeholder="YYYY-MM-DD o 15/08/2025" />
                            <input style={{ ...styles.input, width: 190 }} inputMode="decimal" value={editDraft.residueUnits} onChange={e => handleEditDraftChange('residueUnits', e.target.value)} placeholder="Residuo unità o pacchi" />
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button onClick={() => saveRowEdit(idx)} style={styles.smallOkBtn}>Salva</button>
                            <button onClick={cancelRowEdit} style={styles.smallGhostBtn}>Annulla</button>
                            <button onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }} style={styles.smallGhostBtn}>OCR riga</button>
                          </div>
                        </div>
                      ) : (
                        <div className="stockRowGrid" style={{ display:'grid', gridTemplateColumns:'56px 1fr auto', gap:10, alignItems:'center' }}>
                          <div className="thumb" role="button" title="Aggiungi/Modifica immagine" onClick={() => { setTargetImageIdx(idx); rowImageInputRef.current?.click(); }} style={styles.imageBox}>
                            {s.image ? (
                              <img
                                src={s.image || s.imageDirect || ''}
                                data-direct={s.imageDirect || ''}
                                alt={s.name}
                                style={styles.imageThumb}
                                onError={(e) => {
                                  const direct = e.currentTarget.getAttribute('data-direct');
                                  if (direct && e.currentTarget.src !== direct) e.currentTarget.src = direct;
                                }}
                              />
                            ) : (<div style={styles.imagePlaceholder}>＋</div>)}
                          </div>
                          <div className="main" style={{ flex: 1, minWidth: 0 }}>
                            <div style={styles.stockTitle}>{s.name}{s.brand ? <span style={styles.rowBrand}> · {s.brand}</span> : null}</div>
                            <div style={styles.progressOuterBig}><div style={{ ...styles.progressInner, width: `${w}%`, background: colorForPct(pct) }} /></div>
                            <div style={styles.stockLineSmall}>
                              {Math.round(current)}/{Math.max(1, Math.round(baseline))} {s.unitLabel || 'unità'}
                              {s.expiresAt ? (<span style={styles.expiryChip}>scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}</span>) : null}
                            </div>
                          </div>
                          <div className="actions" style={styles.rowActionsRight}>
                            <button title="Modifica" onClick={() => startRowEdit(idx, s)} style={styles.iconCircle} aria-label="Modifica scorta"><Pencil size={18} /></button>
                            <button title="Imposta scadenza" onClick={() => { /* semplice shortcut: apre editing */ startRowEdit(idx, s); }} style={styles.iconCircle} aria-label="Imposta scadenza"><Calendar size={18} /></button>
                            <button title="OCR riga" onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }} style={styles.iconCircle} aria-label="OCR riga"><Camera size={18} /></button>
                            <button title="Elimina definitivamente" onClick={() => deleteStockRow(idx)} style={{ ...styles.iconCircle, color:'#f87171', borderColor:'rgba(248,113,113,.35)' }} aria-label="Elimina scorta"><Trash2 size={18} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: toast.type === 'ok' ? '#16a34a' : toast.type === 'err' ? '#ef4444' : '#334155',
            color: '#fff', padding: '10px 14px', borderRadius: 10, boxShadow: '0 6px 16px rgba(0,0,0,.35)', zIndex: 9999,
            fontWeight: 600, letterSpacing: .2,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* INPUT NASCOSTI */}
      <input
        ref={ocrInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => { const files = Array.from(e.target.files || []); if (!files.length) return; handleOCR(files); e.target.value = ''; }}
      />
      <input
        ref={rowOcrInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        hidden
        onChange={async (e) => { e.target.value = ''; /* OCR riga: per semplicità usa handleOCR generico su singola immagine */ const files = Array.from(e.target.files || []); if (files.length) await handleOCR(files.slice(0,1)); setTargetRowIdx(null); }}
      />
      <input
        ref={rowImageInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []); e.target.value = '';
          if (files.length && typeof targetImageIdx === 'number') { handleRowImage(files, targetImageIdx); setTargetImageIdx(null); }
        }}
      />
    </>
  );
}

/* =================== Styles (identici) =================== */
const styles = {
  page: {
    minHeight: '100vh',
    background: 'transparent',
    padding: '24px 16px',
    color: '#f8f1dc',
    textShadow: '0 0 6px rgba(255,245,200,.15)',
  },

  // Card trasparente
  card: {
    maxWidth: 1000,
    margin: '0 auto',
    background: 'transparent',
    backdropFilter: 'none',
    border: '1px solid rgba(255,255,255,.06)',
    borderRadius: 18,
    padding: 16,
    boxShadow: 'none',
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
  }

