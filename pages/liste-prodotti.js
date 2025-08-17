// pages/liste-prodotti.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

/* ====================== Costanti / Config ====================== */
const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;

// —— Cloud sync (Supabase) — opzionale, auto-noop se non presente
const CLOUD_SYNC = true;                       // lascia true: prova a sincronizzare se /lib/supabaseClient esiste
const CLOUD_TABLE = 'jarvis_liste_state';      // { user_id text, state jsonb, updated_at timestamptz default now() }
let __supabase = null;

/* ====================== Endpoints esistenti ====================== */
const API_ASSISTANT_TEXT = '/api/assistant';
const API_OCR = '/api/ocr';
const API_FINANCES_INGEST = '/api/finances/ingest';

/* ====================== Persistenza locale ====================== */
const LS_VER = 1;
const LS_KEY = 'jarvis_liste_prodotti@v1';

function loadPersisted() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== LS_VER) return null;
    return data;
  } catch {
    return null;
  }
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
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[persist] save failed', e);
  }
}

/* ====================== Lessico supermercato ====================== */
const GROCERY_LEXICON = [
  'latte','latte ps','latte parzialmente scremato','latte intero','latte uht','latte zymil',
  'yogurt','burro','mozzarella','ricotta','parmigiano','grana padano','formaggio spalmabile',
  'pane','pasta','spaghetti','penne','fusilli','rigatoni','riso','farina','zucchero','sale','olio evo','olio di semi','aceto','passata di pomodoro','pelati',
  'biscotti','cereali','fette biscottate','marmellata','nutella','caffè','caffe','the','tè',
  'pollo','petto di pollo','bistecche','tritato','prosciutto','tonno in scatola','salmone',
  'piselli surgelati','spinaci surgelati','patatine surgelate','gelato',
  'detersivo','detersivo piatti','detersivo lavatrice','ammorbidente','candeggina','spugne','carta igienica','scottex','sacchetti immondizia',
  'insalata','pomodori','zucchine','melanzane','patate','cipolle','aglio','mele','banane','arance','limoni',
  'uova','acqua','birra','vino','tortillas','piadine','affettati','ferrero fiesta'
];

/* ====================== Utils testo ====================== */
function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function tokens(str){ return new Set(normKey(str).split(' ').filter(Boolean)); }
function isSimilar(a,b){
  const na=normKey(a), nb=normKey(b);
  if(!na||!nb) return false;
  if(na===nb) return true;
  if(na.length>=3 && (nb.includes(na)||na.includes(nb))) return true;
  const A=tokens(a), B=tokens(b);
  let inter=0; A.forEach(t=>{ if(B.has(t)) inter++; });
  const union = new Set([...A,...B]).size;
  const j = inter/union;
  return j>=0.5 || (inter>=1 && (A.size===1 || B.size===1));
}
function wantsAbsoluteSet(text) {
  const t = normKey(text);
  return /(porta\s+a|imposta\s+a|metti\s+a|fissa\s+a|in\s+totale|totali|ora\s+sono|adesso\s+sono|fai\s+che\s+siano)/i.test(t);
}

/* ====================== Parser liste rapide ====================== */
function extractPackInfo(str){
  const s = normKey(str);
  let packs = 1;
  let unitsPerPack = 1;
  let unitLabel = 'unità';

  const UNIT_TERMS = '(?:pz|pezzi|unit[aà]|barrett[e]?|vasett[i]?|uova|bottiglie?|merendine?|bustin[ae]|monouso)';

  let m = s.match(new RegExp(String.raw`(\d+)\s*(?:conf(?:e(?:zioni)?)?|pacc?hi?|scatol[ae])\s*(?:da|x)\s*(\d+)\s*(?:${UNIT_TERMS})?`, 'i'));
  if (m){
    packs = Number(m[1]);
    unitsPerPack = Number(m[2]);
    const u = (m[3] || 'unità').replace(/pz|pezzi/i,'unità');
    unitLabel = u;
    return { packs, unitsPerPack, unitLabel };
  }
  m = s.match(/(\d+)\s*[x×]\s*\d+\s*(?:g|kg|ml|cl|l|lt)?/i);
  if (m){
    packs = 1;
    unitsPerPack = Number(m[1]);
    return { packs, unitsPerPack, unitLabel };
  }
  m = s.match(new RegExp(String.raw`(\d+)\s*${UNIT_TERMS}\b`, 'i'));
  if (m){
    packs = 1;
    unitsPerPack = Number(m[1]);
    unitLabel = m[2] ? m[2].replace(/pz|pezzi/i,'unità') : 'unità';
    return { packs, unitsPerPack, unitLabel };
  }
  m = s.match(new RegExp(String.raw`(\d+)\s*(bottiglie?|pacc?hi?|scatol[ae]|conf(?:e(?:zioni)?)?)`, 'i'));
  if (m){
    packs = Number(m[1]);
    unitsPerPack = 1;
    unitLabel = (/^bott/i.test(m[2]) ? 'bottiglie' : 'unità');
    return { packs, unitsPerPack, unitLabel };
  }
  m = s.match(/^(\d+(?:[.,]\d+)?)\s+[a-z]/i);
  if (m){
    packs = Number(String(m[1]).replace(',','.')) || 1;
    unitsPerPack = 1;
    return { packs, unitsPerPack, unitLabel };
  }
  return { packs, unitsPerPack, unitLabel };
}
function parseLinesToItems(text) {
  const chunks = String(text || '')
    .split(/[\n,;]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  const items = [];
  for (const raw of chunks) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const packInfo = extractPackInfo(s);
    let packs = Number(packInfo.packs || 1);

    let rest = s;
    const mQtyLead = rest.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
    if (mQtyLead) rest = mQtyLead[2].trim();

    let name = rest, brand = '';
    const marca = rest.match(/\b(?:marca|brand)\s+([^\s].*)$/i);
    if (marca) {
      brand = marca[1].trim();
      name = rest.replace(marca[0], '').trim();
    } else {
      const parts = rest.split(' ');
      if (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (/^[A-ZÀ-ÖØ-Þ]/.test(last)) { brand = last; name = parts.slice(0, -1).join(' '); }
      }
    }
    name = name.replace(/\s{2,}/g, ' ').trim();
    brand = brand.replace(/\s{2,}/g, ' ').trim();

    if (name) {
      items.push({
        id: 'tmp-' + Math.random().toString(36).slice(2),
        name,
        brand: brand || '',
        qty: Number.isFinite(packs) && packs > 0 ? packs : 1,
        unitsPerPack: Number(packInfo.unitsPerPack || 1),
        unitLabel: packInfo.unitLabel || 'unità',
        purchased: false,
      });
    }
  }
  return items;
}

/* ====================== Scadenze utils ====================== */
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
function parseExpiryPairs(text, lexicon = [], knownProducts = []) {
  if (DEBUG) console.log('[parseExpiryPairs] input:', text);
  const out = [];
  const norm = (x) => String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const s = norm(text);

  const KW = ['scad','scadenza','scade','entro','consumare','preferibilmente','da consumarsi','da consumare'];
  const DATE_RE = /((?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(?:\d{1,2}\s+[a-zà-ú]+\s+\d{2,4}))/i;

  const tokensArr = s.split(/\s+/);
  for (let i = 0; i < tokensArr.length; i++) {
    const win = tokensArr.slice(Math.max(0, i - 10), i + 10).join(' ');
    const dm = win.match(DATE_RE);
    if (!dm) continue;

    const hasKW = KW.some(k => win.includes(k));
    const iso = toISODate(dm[1]);
    if (!iso) continue;

    const synonyms = [
      ['caffe','caffè'],
      ['latte ps','latte parzialmente scremato','latte p.s.','latte p.s','latte p s'],
      ['latte uht','latte lunga conservazione']
    ];
    let chosen = '';
    let bestLen = 0;

    const testList = [...lexicon];
    synonyms.forEach(group => group.forEach(g => testList.push(g)));

    for (const p of testList) {
      const k = norm(p);
      if (k && win.includes(k) && k.length > bestLen) { chosen = p; bestLen = k.length; }
    }

    if (!chosen && Array.isArray(knownProducts) && knownProducts.length) {
      for (const kp of knownProducts) {
        const k = norm(kp);
        if (k && win.includes(k)) { chosen = kp; break; }
      }
    }

    if (!chosen && !hasKW) continue;
    if (chosen) out.push({ name: chosen, expiresAt: iso });
  }
  if (DEBUG) console.log('[parseExpiryPairs] valid matches:', out);
  return out;
}

/* ====================== Fetch helpers / util varie ====================== */
async function readJsonSafe(res) {
  const ct = (res.headers.get?.('content-type') || '').toLowerCase();
  const raw = await res.text?.() || '';
  if (DEBUG) console.log('[readJsonSafe] status:', res.status, 'ct:', ct, 'raw len:', raw.length, 'raw preview:', raw.slice(0,200));
  if (!raw.trim()) return { ok: res.ok, data: null, error: res.ok ? null : `HTTP ${res.status}` };
  if (ct.includes('application/json')) {
    try { return { ok: res.ok, ...(JSON.parse(raw) || {}) }; }
    catch (e) { return { ok: res.ok, data: null, error: `JSON parse error: ${e?.message || e}` }; }
  }
  try { return { ok: res.ok, ...(JSON.parse(raw) || {}) }; }
  catch { return { ok: res.ok, data: null, error: raw.slice(0,200) || `HTTP ${res.status}` }; }
}
function ensureArray(x) { return Array.isArray(x) ? x : []; }
function timeoutFetch(url, opts={}, ms=25000) {
  if (DEBUG) console.log('[fetch] →', url, opts);
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .then(r => { if (DEBUG) console.log('[fetch] ←', url, r.status); return r; })
    .finally(()=>clearTimeout(t));
}

/* ====================== Calcoli scorte ====================== */
function clamp01(x){ return Math.max(0, Math.min(1, Number(x) || 0)); }
function residueUnitsOf(s){
  const upp = Math.max(1, Number(s.unitsPerPack || 1));
  const ru = Number(s.residueUnits);
  if (Number.isFinite(ru)) return Math.max(0, ru);
  return Math.max(0, Number(s.packs || 0) * upp);
}
function baselineUnitsOf(s){
  const upp = Math.max(1, Number(s.unitsPerPack || 1));
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
function daysToExpiry(iso){
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  const now = new Date();
  return Math.floor((d - now) / 86400000);
}
function isExpiringSoon(s, days=10){
  return daysToExpiry(s?.expiresAt) <= days;
}
function totalUnitsOf(s){ return (Number(s.packs||0) * Number(s.unitsPerPack||1)); }

/* ====================== Prompt builders ====================== */
function buildOcrAssistantPrompt(ocrText, lexicon = []) {
  const LEX = Array.isArray(lexicon) && lexicon.length ? lexicon.join(', ') : 'latte, pane, pasta, uova, ...';
  return [
    'Sei Jarvis, estrattore strutturato di scontrini.',
    'DEVI rispondere SOLO in JSON con questo schema ESATTO:',
    '{ "purchases":[{ "name":"", "brand":"", "packs":1, "unitsPerPack":1, "unitLabel":"unità", "expiresAt":"" }], "expiries":[], "stock":[] }',
    '',
    'REGOLE:',
    '- Estrai SOLO righe che indicano prodotti acquistati.',
    '- IGNORA intestazioni, reparti, subtotali, TOTALE, IVA, sconti globali, contanti/bancomat, resto, numeri ordine, casse.',
    '- Normalizza i nomi usando questo lessico come guida (se simili, scegli la forma del lessico):',
    LEX,
    '- brand: stringa breve se deducibile (es. “Barilla”, “Parmalat”), altrimenti "".',
    '- packs: n. confezioni acquistate (default 1).',
    '- unitsPerPack: n. unità per confezione (se leggibile, es. 4X125 → 4).',
    '- unitLabel: etichetta unità (es. "unità", "bottiglie", "vasetti").',
    '- expiresAt: YYYY-MM-DD se presente; altrimenti "". ',
    '- Niente commenti, niente testo fuori dal JSON.',
    '',
    'ESEMPI:',
    'Input OCR:',
    '----------------------------------------',
    'IPER',
    'YOGURT FRAGOLA MULLER 4X125 1,99',
    'BURRO LURPAK 250G 2,39',
    'LATTE PS 1L SCAD 15/07/2025 1,29',
    '----------------------------------------',
    'Output JSON:',
    '{ "purchases":[',
    '  { "name":"yogurt", "brand":"Muller", "packs":1, "unitsPerPack":4, "unitLabel":"unità", "expiresAt":"" },',
    '  { "name":"burro", "brand":"Lurpak", "packs":1, "unitsPerPack":1, "unitLabel":"unità", "expiresAt":"" },',
    '  { "name":"latte", "brand":"", "packs":1, "unitsPerPack":1, "unitLabel":"unità", "expiresAt":"2025-07-15" }',
    '], "expiries":[{"name":"latte","expiresAt":"2025-07-15"}], "stock":[] }',
    '',
    'ADESSO ESTRARRE DAL TESTO OCR QUI SOTTO. RISPONDI SOLO CON IL JSON FINALE.',
    '--- TESTO OCR INIZIO ---',
    ocrText,
    '--- TESTO OCR FINE ---'
  ].join('\n');
}
function buildUnifiedRowPrompt(ocrText, { name, brand }) {
  const target = brand ? `${name} (marca ${brand})` : name;
  return [
    'Sei Jarvis. Unifica informazioni (scadenza ET/OU quantità) da una o più foto (etichetta/scontrino).',
    'Rispondi SOLO in JSON con schema ESATTO:',
    '{ "name":"", "brand":"", "packs":0, "unitsPerPack":1, "unitLabel":"unità", "expiresAt":"" }',
    '',
    `PRODOTTO TARGET: "${target}"`,
    'REGOLE:',
    '- Se dallo scontrino vedi “2 conf da 6”, allora packs=2, unitsPerPack=6, unitLabel appropriata ("unità"/"bottiglie"/ecc.).',
    '- Se la foto è solo etichetta, estrai solo expiresAt se presente.',
    '- Normalizza name al prodotto comune (latte, yogurt, pasta, ...).',
    '- brand breve (es. Barilla, Parmalat) se deducibile; altrimenti stringa vuota.',
    '- expiresAt nel formato YYYY-MM-DD; se non presente, stringa vuota.',
    '- Nessun testo fuori JSON.',
    '',
    'TESTO OCR (concatenato):',
    ocrText
  ].join('\n');
}

/* ====================== Parser fallback OCR ====================== */
function parseReceiptPurchases(ocrText) {
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const ignore = /(totale|iva|bancomat|contanti|resto|scontrino|cassa|cliente|sconto|subtotale|pagato|euro)/i;

  const out = [];
  for (let raw of lines) {
    if (ignore.test(raw)) continue;
    let name = raw;
    let brand = '';
    const parts = name.split(' ');
    if (parts.length>1 && /^[A-ZÀ-ÖØ-Þ]/.test(parts[parts.length-1])) {
      brand = parts.pop();
      name = parts.join(' ');
    }
    name = name
      .replace(/\b(\d+[gG]|kg|ml|l|cl)\b/g,'')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/\buht\b/g,'')
      .replace(/spaghetti|penne|fusilli|rigatoni/, 'pasta')
      .replace(/passata\b.*pomodoro|passata\b/, 'passata di pomodoro')
      .replace(/latte\b.*/, 'latte')
      .replace(/yogurt\b.*/, 'yogurt')
      .replace(/\bcaffe\b/g,'caffè');

    if (!name || name.length<2) continue;

    const pack = extractPackInfo(raw);
    out.push({
      name,
      brand: brand || '',
      packs: Number(pack.packs || 1),
      unitsPerPack: Number(pack.unitsPerPack || 1),
      unitLabel: pack.unitLabel || 'unità',
      expiresAt: ''
    });
  }
  return out;
}
function guessProductName(chunk) {
  let best = '';
  let bestLen = 0;
  for (const lex of GROCERY_LEXICON) {
    if (isSimilar(chunk, lex) && lex.length > bestLen) { best = lex; bestLen = lex.length; }
  }
  if (!best) {
    const t = normKey(chunk).split(' ').filter(Boolean);
    if (t.length) best = t.slice(0, 2).join(' ');
  }
  return best.trim();
}
function hasExplicitPackStructure(text){
  const s = normKey(text);
  return /(?:conf(?:e(?:zioni)?)?|pacc?hi?|scatol[ae])\s*(?:da|x)\s*\d+/.test(s);
}
function looksLikeSetResidue(text) {
  const t = normKey(text);
  return /\b(sono|ce\s+ne\s+sono|ce\s+n'?e\s+sono|ne\s+ho|adesso\s+sono|ora\s+sono|in\s+totale\s+sono)\b/.test(t);
}
function parseStockUpdateText(text) {
  const t = normKey(text);
  const parts = t.split(/[,;]+/g).map(s => s.trim()).filter(Boolean);

  const res = [];
  const absolute = wantsAbsoluteSet(text);

  for (let rawChunk of parts) {
    if (/scad|scadenza|scade|entro/.test(rawChunk)) continue;
    if (/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(rawChunk)) continue;
    if (/\b20\d{2}\b/.test(rawChunk)) continue;

    const chunks = rawChunk.split(/\s+e\s+/g).map(s => s.trim()).filter(Boolean);

    for (const chunk of chunks) {
      const name = guessProductName(chunk);
      if (!name) continue;

      const explicit = hasExplicitPackStructure(chunk);
      const pack = extractPackInfo(chunk);

      let m = chunk.match(/(\d+(?:[.,]\d+)?)\s*(bottiglie?|bott|pacchi?|conf(?:e(?:zioni)?)?|scatol[ae]|unit[aà]|pz|pezzi|barrett[e]?|vasett[i]?|uova|merendine?|bustin[ae]|monouso)?$/i);
      if (!m && /\b(due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/i.test(chunk)) {
        const map = { due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7, otto:8, nove:9, dieci:10 };
        const w = chunk.match(/\b(due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/i);
        m = w ? [null, String(map[w[1].toLowerCase()]), ''] : null;
      }

      const valNum = m ? Number(String(m[1]).replace(',','.')) : NaN;
      const tag = (m && m[2] ? m[2].toLowerCase() : '');

      if (!/\d/.test(chunk)) {
        res.push({ name, mode: 'units', value: 1, op: 'maybeResidue', _packs: 1, _upp: 1 });
        continue;
      }

      if (explicit) {
        const packs = Math.max(1, Number(pack.packs || 1));
        const upp   = Math.max(1, Number(pack.unitsPerPack || 1));
        res.push({ name, mode: 'packs', value: packs, op: 'restockExplicit', _packs: packs, _upp: upp });
        continue;
      }

      const asUnits = /unit|pz|pezzi|barrett|vasett|uova|bott|bottiglie|merendine?|bustin[ae]|monouso/.test(tag);
      const value = Number.isFinite(valNum) ? Math.max(0, valNum) : 0;
      if (!value) continue;

      const packsLike = /pacc|conf|scatol/.test(tag);
      const hintPacks = packsLike ? value : 1;
      const hintUpp   = packsLike ? 1 : value;

      res.push({
        name,
        mode: asUnits ? 'units' : 'packs',
        value,
        op: absolute ? 'set' : 'maybeResidue',
        _packs: Math.max(1, hintPacks),
        _upp: Math.max(1, hintUpp),
      });
    }
  }
  return res;
}

/* ====================== Consumi / restock helpers ====================== */
function computeNewAvgDailyUnits(old, newPacks) {
  const upp = Math.max(1, Number(old.unitsPerPack || 1));
  const oldUnits = Number(old.packs || 0) * upp;
  const newUnits = Number(newPacks || 0) * upp;
  let avg = old?.avgDailyUnits || 0;

  if (old?.lastRestockAt && newUnits < oldUnits) {
    const days = Math.max(1, (Date.now() - new Date(old.lastRestockAt).getTime())/86400000);
    const usedUnits = oldUnits - newUnits;
    const day = usedUnits / days;
    avg = avg ? (0.6*avg + 0.4*day) : day;
  }
  return avg;
}
function restockTouch(baselineFromPacks, lastDateISO, unitsPerPack){
  const upp = Math.max(1, Number(unitsPerPack || 1));
  const bp  = Math.max(0, Number(baselineFromPacks || 0));
  const fullUnits = bp * upp;
  return {
    baselinePacks: bp,
    lastRestockAt: lastDateISO,
    residueUnits: fullUnits,
  };
}

/* ====================== Piccola utility media (no-op sicura) ====================== */
function theMediaWorkaround(){ return; }

/* ====================== Component principale ====================== */
export default function ListeProdotti() {
  const [currentList, setCurrentList] = useState(LIST_TYPES.SUPERMARKET);
  const [lists, setLists] = useState({
    [LIST_TYPES.SUPERMARKET]: [],
    [LIST_TYPES.ONLINE]: [],
  });

  // Form Lista (apri/chiudi)
  const [form, setForm] = useState({ name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità' });
  const [showListForm, setShowListForm] = useState(false);

  // Scorte & critici
  const [stock, setStock] = useState([]);
  const [critical, setCritical] = useState([]);

  // Edit riga scorte
  const [editingRow, setEditingRow] = useState(null);
  const [editDraft, setEditDraft] = useState({
    name: '',
    brand: '',
    packs: '0',
    unitsPerPack: '1',
    unitLabel: 'unità',
    expiresAt: ''
  });

  // UI / Toast / Busy
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  function showToast(msg, type='ok'){
    setToast({ msg, type });
    setTimeout(() => setToast(null), 1800);
  }

  // Persistenza debounce
  const persistTimerRef = useRef(null);

  // Vocale lista
  theMediaWorkaround();
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // Vocale inventario unificato (RIPRISTINATO)
  const invMediaRef = useRef(null);
  const invChunksRef = useRef([]);
  const invStreamRef = useRef(null);
  const [invRecBusy, setInvRecBusy] = useState(false);

  // OCR input (scontrini)
  const ocrInputRef = useRef(null);

  // OCR UNICO di riga (multi-file)
  const rowOcrInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);

  // Upload immagine per riga scorte
  const rowImageInputRef = useRef(null);
  const [targetImageIdx, setTargetImageIdx] = useState(null);

  // Scorte manuali
  const [stockForm, setStockForm] = useState({ name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità', expiresAt: '' });
  const [showStockForm, setShowStockForm] = useState(false);

  // Scadenze manuali
  const [expiryForm, setExpiryForm] = useState({ name: '', expiresAt: '' });
  const [showExpiryForm, setShowExpiryForm] = useState(false);

  const curItems = lists[currentList] || [];

  /* =================== Cloud Sync (Supabase) — opzionale =================== */
  const userIdRef = useRef(null);
  useEffect(() => {
    if (!CLOUD_SYNC) return;
    let mounted = true;
    (async () => {
      try {
        const mod = await import('@/lib/supabaseClient').catch(()=>null);
        if (!mod?.supabase) return;
        __supabase = mod.supabase;
        const { data } = await __supabase.auth.getUser();
        const uid = data?.user?.id || null;
        if (mounted) userIdRef.current = uid;

        if (!uid) return; // non loggato → nessuna cloud load
        // Carica stato cloud (se esiste)
        const { data: rows, error } = await __supabase
          .from(CLOUD_TABLE)
          .select('state')
          .eq('user_id', uid)
          .maybeSingle();
        if (!error && rows?.state) {
          const st = rows.state;
          if (st?.lists) {
            setLists({
              [LIST_TYPES.SUPERMARKET]: Array.isArray(st.lists[LIST_TYPES.SUPERMARKET]) ? st.lists[LIST_TYPES.SUPERMARKET] : [],
              [LIST_TYPES.ONLINE]: Array.isArray(st.lists[LIST_TYPES.ONLINE]) ? st.lists[LIST_TYPES.ONLINE] : [],
            });
          }
          if (Array.isArray(st.stock)) setStock(st.stock);
          if (st.currentList && (st.currentList === LIST_TYPES.SUPERMARKET || st.currentList === LIST_TYPES.ONLINE)) {
            setCurrentList(st.currentList);
          }
        }
      } catch (e) {
        if (DEBUG) console.warn('[cloud init] skipped', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Upsert cloud a ogni modifica, con debounce leggero
  const cloudTimerRef = useRef(null);
  useEffect(() => {
    if (!CLOUD_SYNC || !__supabase) return;
    if (!userIdRef.current) return;
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    const snapshot = { lists, stock, currentList };
    cloudTimerRef.current = setTimeout(async () => {
      try {
        await __supabase
          .from(CLOUD_TABLE)
          .upsert({ user_id: userIdRef.current, state: snapshot }, { onConflict: 'user_id' });
      } catch (e) {
        if (DEBUG) console.warn('[cloud upsert] fail', e);
      }
    }, 400);
    return () => clearTimeout(cloudTimerRef.current);
  }, [lists, stock, currentList]);

  /* =================== Brain Hub (come nel tuo codice) =================== */
  {
    const stockRef = useRef(stock);
    const listsRef = useRef(lists);
    const currentListRef = useRef(currentList);
    useEffect(()=>{ stockRef.current = stock; }, [stock]);
    useEffect(()=>{ listsRef.current = lists; }, [lists]);
    useEffect(()=>{ currentListRef.current = currentList; }, [currentList]);

    function getHub() {
      if (typeof window === 'undefined') return null;
      window.__jarvisBrainHub = window.__jarvisBrainHub || {
        _datasources: new Map(),
        _commands: new Map(),
        registerDataSource(def){ this._datasources.set(def.name, def); },
        registerCommand(def){ this._commands.set(def.name, def); },
        async ask(name, payload){ const ds=this._datasources.get(name); return ds?.fetch(payload); },
        async run(name, payload){ const cmd=this._commands.get(name); return cmd?.execute(payload); },
        list(){ return { datasources:[...this._datasources.keys()], commands:[...this._commands.keys()]}; }
      };
      return window.__jarvisBrainHub;
    }

    useEffect(() => {
      let cancelled = false;

      async function wireBrain() {
        const hub = getHub();
        if (!hub) return;

        hub.registerDataSource({
          name: 'scorte-complete',
          fetch: () => {
            return (stock || []).map(s => {
              const upp = Math.max(1, Number(s.unitsPerPack || 1));
              const residueUnits = Number.isFinite(Number(s.residueUnits))
                ? Math.max(0, Number(s.residueUnits))
                : Math.max(0, Number(s.packs || 0) * upp);
              const baselineUnits = Math.max(
                upp,
                (Number(s.baselinePacks) > 0 ? Number(s.baselinePacks) * upp : Number(s.packs || 0) * upp)
              );
              const avgDailyUnits = Number(s.avgDailyUnits || 0);
              return {
                name: String(s.name || '').trim(),
                brand: String(s.brand || '').trim(),
                packs: Number(s.packs || 0),
                unitsPerPack: upp,
                unitLabel: s.unitLabel || 'unità',
                residueUnits,
                baselineUnits,
                avgDailyUnits,
                expiresAt: s.expiresAt || ''
              };
            });
          }
        });
        hub.registerDataSource({
          name: 'scorte-esaurimento',
          fetch: () => {
            return (stock || []).filter(s => {
              const { current, baseline } = residueInfo(s);
              return baseline > 0 && current / baseline < 0.20;
            });
          }
        });
        hub.registerDataSource({
          name: 'scorte-scadenza',
          fetch: ({ entroGiorni = 10 } = {}) => {
            return (stock || []).filter(s => isExpiringSoon(s, entroGiorni));
          }
        });
        hub.registerDataSource({
          name: 'scorte-giorni-esaurimento',
          fetch: () => {
            const out = [];
            for (const s of (stock || [])) {
              const upp = Math.max(1, Number(s.unitsPerPack || 1));
              const currentUnits = Number.isFinite(Number(s.residueUnits))
                ? Math.max(0, Number(s.residueUnits))
                : Math.max(0, Number(s.packs || 0) * upp);
              const day = Number(s.avgDailyUnits || 0);
              const days = day > 0 ? Math.ceil(currentUnits / day) : null;
              out.push({
                name: s.name, brand: s.brand || '', unitLabel: s.unitLabel || 'unità',
                residueUnits: currentUnits, avgDailyUnits: day, daysToDepletion: days
              });
            }
            return out;
          }
        });
        hub.registerDataSource({
          name: 'liste-spesa',
          fetch: () => {
            const data = lists || {};
            return Object.entries(data).flatMap(([type, items]) =>
              (items || [])
                .filter(it => !it.purchased && it.qty > 0)
                .map(it => ({
                  listType: type,
                  name: String(it.name || '').trim(),
                  brand: String(it.brand || '').trim(),
                  qty: Number(it.qty || 0),
                  unitsPerPack: Number(it.unitsPerPack || 1),
                  unitLabel: String(it.unitLabel || 'unità').trim()
                }))
            );
          }
        });
        hub.registerDataSource({
          name: 'lista-oggi',
          fetch: () => {
            const cur = currentListRef.current;
            const items = (lists?.[cur] || []).filter(i => !i.purchased && i.qty > 0);
            return items.map(i => ({
              listType: cur,
              name: i.name, brand: i.brand || '', qty: i.qty,
              unitsPerPack: i.unitsPerPack || 1, unitLabel: i.unitLabel || 'unità'
            }));
          }
        });
      }
      wireBrain();
      return () => { cancelled = true; };
    }, []);
  }

  /* =================== Hydration iniziale (locale) =================== */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = loadPersisted();
    if (!saved) return;

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
  }, []);

  /* =================== Autosave debounce (locale) =================== */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    const snapshot = { lists, stock, currentList };
    persistTimerRef.current = setTimeout(() => { persistNow(snapshot); }, 300);
    return () => clearTimeout(persistTimerRef.current);
  }, [lists, stock, currentList]);

  /* =================== Sync tra tab =================== */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e) => {
      if (e.key !== LS_KEY) return;
      const saved = loadPersisted();
      if (!saved) return;

      setLists({
        [LIST_TYPES.SUPERMARKET]: Array.isArray(saved.lists?.[LIST_TYPES.SUPERMARKET]) ? saved.lists[LIST_TYPES.SUPERMARKET] : [],
        [LIST_TYPES.ONLINE]: Array.isArray(saved.lists?.[LIST_TYPES.ONLINE]) ? saved.lists[LIST_TYPES.ONLINE] : [],
      });
      setStock(Array.isArray(saved.stock) ? saved.stock : []);
      setCurrentList(saved.currentList === LIST_TYPES.ONLINE ? LIST_TYPES.ONLINE : LIST_TYPES.SUPERMARKET);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /* =================== Derivati: critici =================== */
  useEffect(() => {
    const crit = stock.filter(p => {
      const upp = Math.max(1, Number(p.unitsPerPack || 1));
      const ru = Number(p.residueUnits);
      const currentUnits = Number.isFinite(ru)
        ? Math.max(0, ru)
        : Math.max(0, Number(p.packs || 0) * upp);
      const bp = Number(p.baselinePacks);
      const baselineUnits = Math.max(
        upp,
        (Number.isFinite(bp) && bp > 0 ? bp * upp : Number(p.packs || 0) * upp)
      );
      const pct = baselineUnits ? (currentUnits / baselineUnits) : 1;
      const lowResidue = pct < 0.20;
      const expSoon   = isExpiringSoon(p, 10);
      return lowResidue || expSoon;
    });
    setCritical(crit);
  }, [stock]);

  /* =================== LISTE: azioni =================== */
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

  /* =================== OCR scontrini (globale) =================== */
  function decrementAcrossBothLists(prevLists, purchases) {
    const next = { ...prevLists };
    const decList = (listKey) => {
      const arr = [...(next[listKey] || [])];
      for (const p of purchases) {
        const dec = Math.max(1, Number(p.packs ?? p.qty ?? 1));
        const brand = (p.brand || '').trim();
        const upp = Number(p.unitsPerPack ?? 1);
        let idx = arr.findIndex(i =>
          isSimilar(i.name, p.name) &&
          (!brand || isSimilar(i.brand || '', brand)) &&
          Number(i.unitsPerPack || 1) === upp
        );
        if (idx < 0) {
          idx = arr.findIndex(i =>
            isSimilar(i.name, p.name) &&
            (!brand || isSimilar(i.brand || '', brand))
          );
        }
        if (idx < 0) {
          idx = arr.findIndex(i => isSimilar(i.name, p.name));
        }
        if (idx >= 0) {
          const cur = arr[idx];
          const newQty = Math.max(0, Number(cur.qty || 0) - dec);
          arr[idx] = { ...cur, qty: newQty, purchased: true };
        }
      }
      next[listKey] = arr.filter(i => Number(i.qty || 0) > 0 || !i.purchased);
    };
    decList(LIST_TYPES.SUPERMARKET);
    decList(LIST_TYPES.ONLINE);
    return next;
  }
  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      setBusy(true);
      const fdOcr = new FormData();
      files.forEach((f) => fdOcr.append('images', f));
      const ocrRes = await timeoutFetch(API_OCR, { method: 'POST', body: fdOcr }, 40000);
      const ocrJson = await readJsonSafe(ocrRes);
      if (!ocrJson.ok) throw new Error(ocrJson.error || `HTTP ${ocrRes.status}`);
      const ocrText = String(ocrJson?.text || '').trim();
      if (!ocrText) throw new Error('Risposta vuota dal servizio OCR');

      const prompt = buildOcrAssistantPrompt(ocrText, GROCERY_LEXICON);
      const r = await timeoutFetch(API_ASSISTANT_TEXT, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt })
      }, 30000);
      const safe = await readJsonSafe(r);
      const answer = safe?.answer || safe?.data || safe;
      const parsed = typeof answer === 'string' ? (()=>{ try { return JSON.parse(answer);} catch { return null; } })() : answer;

      let purchases = ensureArray(parsed?.purchases);
      if (!purchases.length) purchases = parseReceiptPurchases(ocrText);

      if (purchases.length) {
        setLists(prev => decrementAcrossBothLists(prev, purchases));
        setStock(prev => {
          const arr = [...prev];
          const todayISO = new Date().toISOString().slice(0,10);
          for (const p of purchases) {
            const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
            const pack = {
              packs: Number(p.packs ?? p.qty ?? 1),
              unitsPerPack: Number(p.unitsPerPack ?? 1),
              unitLabel: p.unitLabel || 'unità'
            };
            if (idx >= 0) {
              const old = arr[idx];
              const newPacks = Number(old.packs || 0) + pack.packs;
              arr[idx] = {
                ...old,
                packs: newPacks,
                unitsPerPack: old.unitsPerPack || pack.unitsPerPack,
                unitLabel: old.unitLabel || pack.unitLabel,
                ...restockTouch(newPacks, todayISO, old.unitsPerPack || pack.unitsPerPack)
              };
            } else {
              arr.unshift({
                name: p.name, brand: p.brand || '',
                packs: pack.packs,
                unitsPerPack: pack.unitsPerPack,
                unitLabel: pack.unitLabel,
                expiresAt: '',
                baselinePacks: pack.packs,
                lastRestockAt: todayISO,
                avgDailyUnits: 0,
                residueUnits: pack.packs * (pack.unitsPerPack || 1)
              });
            }
          }
          return arr;
        });
        try {
          await fetch(API_FINANCES_INGEST, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ purchases })
          });
        } catch {}
      }

      showToast('OCR scontrino elaborato ✓', 'ok');
    } catch (e) {
      console.error('[OCR] error', e);
      showToast(`Errore OCR: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  }

  /* =================== Edit riga scorte =================== */
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
      residueUnits: initRU,
      _ruTouched: false,
    });
  }
  function handleEditDraftChange(field, value){
    setEditDraft(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'residueUnits' ? { _ruTouched: true } : null),
    }));
  }
  function cancelRowEdit(){
    setEditingRow(null);
    setEditDraft({
      name: '', brand: '', packs: '0', unitsPerPack: '1', unitLabel: 'unità', expiresAt: ''
    });
  }
  function saveRowEdit(index){
    setStock(prev => {
      const arr = [...prev];
      const old = arr[index];
      if (!old) return prev;

      const name = (editDraft.name || '').trim();
      const brand = (editDraft.brand || '').trim();
      const unitsPerPack = Math.max(1, Number(String(editDraft.unitsPerPack).replace(',','.')) || 1);
      const unitLabel = (editDraft.unitLabel || 'unità').trim() || 'unità';
      const expiresAt = toISODate(editDraft.expiresAt || '');

      const newPacks = Math.max(0, Number(String(editDraft.packs).replace(',','.')) || 0);

      const todayISO = new Date().toISOString().slice(0,10);
      const uppOld = Math.max(1, Number(old.unitsPerPack || 1));
      const wasUnits = Number(old.packs || 0) * uppOld;
      const nowUnits = newPacks * unitsPerPack;
      const restock = nowUnits > wasUnits;

      let ru = residueUnitsOf(old);
      const ruTouched = Object.prototype.hasOwnProperty.call(editDraft, '_ruTouched') ? !!editDraft._ruTouched : false;
      if (ruTouched) {
        const ruRaw = Number(String(editDraft.residueUnits ?? '').replace(',','.'));
        if (Number.isFinite(ruRaw)) ru = Math.max(0, ruRaw);
      }
      const fullNow = Math.max(unitsPerPack, nowUnits);
      ru = Math.min(ru, fullNow);

      const avgDailyUnits = computeNewAvgDailyUnits(old, newPacks);

      let next = {
        ...old,
        name, brand,
        packs: newPacks,
        unitsPerPack, unitLabel,
        expiresAt,
        avgDailyUnits,
      };

      if (restock) {
        next = { ...next, ...restockTouch(newPacks, todayISO, unitsPerPack) };
      } else {
        next.residueUnits = ru;
      }

      arr[index] = next;
      return arr;
    });

    setEditingRow(null);
  }
  function applyDeltaToStock(index, { setUnits }) {
    setStock(prev => {
      const arr = [...prev];
      const row = arr[index];
      if (!row) return prev;
      const upp = Math.max(1, Number(row.unitsPerPack || 1));
      const baseline = baselineUnitsOf(row) || upp;
      const clamped = Math.max(0, Math.min(Number(setUnits || 0), baseline));
      arr[index] = { ...row, residueUnits: clamped };
      return arr;
    });
  }

  /* =================== Gestione immagine riga scorte =================== */
  async function handleRowImage(files, idx) {
    const file = (files && files[0]) || null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setStock(prev => {
        const arr = [...prev];
        if (!arr[idx]) return prev;
        arr[idx] = { ...arr[idx], image: dataUrl };
        return arr;
      });
      showToast('Immagine prodotto aggiornata ✓', 'ok');
    };
    reader.readAsDataURL(file);
  }

  /* =================== Vocale LISTA =================== */
  async function toggleRecList() {
    if (recBusy) { try { mediaRecRef.current?.stop(); } catch {} return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => { if (e.data?.size) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop = processVoiceList;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch {
      alert('Microfono non disponibile');
    }
  }
  async function processVoiceList() {
    const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
    const fd = new FormData(); fd.append('audio', blob, 'voice.webm');
    try {
      setBusy(true);
      const res = await timeoutFetch('/api/stt', { method: 'POST', body: fd }, 25000);
      const { text } = await res.json();
      if (!text) throw new Error('Testo non riconosciuto');

      let appended = false;
      try {
        const payload = {
          prompt: [
            'Sei Jarvis. Capisci una LISTA SPESA. Rispondi SOLO JSON:',
            '{ "items":[{ "name":"latte","brand":"Parmalat","packs":2,"unitsPerPack":6,"unitLabel":"bottiglie" }]}',
            'Se manca brand metti "", packs default 1, unitsPerPack default 1, unitLabel default "unità".',
            'Voci comuni: ' + GROCERY_LEXICON.join(', '),
            'Testo:', text
          ].join('\n'),
        };
        const r = await timeoutFetch(API_ASSISTANT_TEXT, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
        }, 25000);
        const safe = await readJsonSafe(r);
        const answer = safe?.answer || safe?.data || safe;
        const parsed = typeof answer === 'string' ? (()=>{ try{ return JSON.parse(answer);}catch{return null;}})() : answer;
        const arr = Array.isArray(parsed?.items) ? parsed.items : [];
        if (arr.length) {
          setLists(prev => {
            const next = { ...prev };
            const target = currentList;
            const existing = [...(prev[target] || [])];
            for (const raw of arr) {
              const it = {
                id: 'tmp-' + Math.random().toString(36).slice(2),
                name: String(raw.name||'').trim(),
                brand: String(raw.brand||'').trim(),
                qty: Math.max(1, Number(raw.packs||raw.qty||1)),
                unitsPerPack: Math.max(1, Number(raw.unitsPerPack||1)),
                unitLabel: String(raw.unitLabel||'unità'),
                purchased: false,
              };
              if (!it.name) continue;
              const idx = existing.findIndex(i =>
                i.name.toLowerCase() === it.name.toLowerCase() &&
                (i.brand||'').toLowerCase() === it.brand.toLowerCase() &&
                Number(i.unitsPerPack||1) === Number(it.unitsPerPack||1)
              );
              if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + it.qty };
              else existing.push(it);
            }
            next[target] = existing;
            return next;
          });
          appended = true;
        }
      } catch {}
      if (!appended) {
        const local = parseLinesToItems(text);
        if (local.length) {
          setLists(prev => {
            const next = { ...prev };
            const target = currentList;
            const existing = [...(prev[target] || [])];
            for (const it of local) {
              const idx = existing.findIndex(i =>
                i.name.toLowerCase() === it.name.toLowerCase() &&
                (i.brand||'').toLowerCase() === (it.brand||'').toLowerCase() &&
                Number(i.unitsPerPack||1) === Number(it.unitsPerPack||1)
              );
              if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + Number(it.qty || 1) };
              else existing.push(it);
            }
            next[target] = existing;
            return next;
          });
          appended = true;
        }
      }
      showToast(appended ? 'Lista aggiornata da Vocale ✓' : 'Nessun elemento riconosciuto', appended ? 'ok' : 'err');
    } catch {
      alert('Errore nel riconoscimento vocale');
    } finally {
      setRecBusy(false);
      setBusy(false);
      try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      mediaRecRef.current = null;
      streamRef.current = null;
      recordedChunks.current = [];
    }
  }

  /* =================== Vocale UNIFICATO INVENTARIO (ripristinato) =================== */
  async function toggleVoiceInventory() {
    if (invRecBusy) { try { invMediaRef.current?.stop(); } catch {} return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      invStreamRef.current = stream;
      invMediaRef.current = new MediaRecorder(stream);
      invChunksRef.current = [];
      invMediaRef.current.ondataavailable = (e) => { if (e.data?.size) invChunksRef.current.push(e.data); };
      invMediaRef.current.onstop = processVoiceInventory;
      invMediaRef.current.start();
      setInvRecBusy(true);
    } catch {
      alert('Microfono non disponibile');
    }
  }
  async function processVoiceInventory() {
    const blob = new Blob(invChunksRef.current, { type: 'audio/webm' });
    const fd = new FormData(); fd.append('audio', blob, 'inventory.webm');
    try {
      setBusy(true);
      const res = await timeoutFetch('/api/stt', { method: 'POST', body: fd }, 25000);
      const { text } = await res.json();
      if (!text) throw new Error('Testo non riconosciuto');

      // 1) Scadenze dal parlato (se presenti)
      const expPairs = parseExpiryPairs(text, GROCERY_LEXICON, stock.map(s=>s.name));

      // 2) Aggiornamenti quantità / set residuo
      const updates = parseStockUpdateText(text);

      // Applica scadenze
      if (expPairs.length) {
        setStock(prev => {
          const arr = [...prev];
          for (const ex of expPairs) {
            const i = arr.findIndex(s => isSimilar(s.name, ex.name));
            if (i >= 0) arr[i] = { ...arr[i], expiresAt: ex.expiresAt };
            else arr.unshift({
              name: ex.name, brand:'', packs:0, unitsPerPack:1, unitLabel:'unità',
              expiresAt: ex.expiresAt, baselinePacks:0, lastRestockAt:'', avgDailyUnits:0, residueUnits:0
            });
          }
          return arr;
        });
      }

      // Applica quantità
      if (updates.length) {
        const todayISO = new Date().toISOString().slice(0,10);
        const absolute = wantsAbsoluteSet(text);
        setStock(prev => {
          const arr = [...prev];
          for (const u of updates) {
            const j = arr.findIndex(s => isSimilar(s.name, u.name));
            if (j < 0) {
              // crea con hint
              const packs = u.mode === 'packs' ? Math.max(0, Number(u.value||0)) : Math.max(0, Number(u._packs||1));
              const upp   = u.mode === 'packs' ? Math.max(1, Number(u._upp||1)) : Math.max(1, Number(u.value||1));
              arr.unshift({
                name: u.name, brand:'', packs, unitsPerPack: upp, unitLabel:'unità',
                expiresAt: '', ...restockTouch(packs, todayISO, upp), avgDailyUnits: 0, image:''
              });
              continue;
            }
            const old = arr[j];
            if (u.op === 'restockExplicit' || u.mode === 'packs') {
              // incremento o set a pacchi?
              const newPacks = absolute ? Math.max(0, Number(u.value||0)) : Math.max(0, Number(old.packs||0) + Number(u.value||0));
              const up = Math.max(1, Number(old.unitsPerPack || u._upp || 1));
              arr[j] = { ...old, packs: newPacks, unitsPerPack: up, ...restockTouch(newPacks, todayISO, up) };
            } else {
              // units → residueUnits (impostazione residuo o incremento residuo)
              const upp = Math.max(1, Number(old.unitsPerPack || u._upp || 1));
              const baseline = baselineUnitsOf(old) || upp;
              const targetUnits = absolute
                ? Math.max(0, Math.min(Number(u.value||0), baseline))
                : Math.max(0, Math.min(residueUnitsOf(old) + Number(u.value||0), baseline));
              arr[j] = { ...old, residueUnits: targetUnits };
            }
          }
          return arr;
        });
      }

      if (!expPairs.length && !updates.length) {
        showToast('Nessun dato inventario riconosciuto', 'err');
      } else {
        showToast('Inventario aggiornato da Vocale ✓', 'ok');
      }
    } catch (e) {
      console.error('[voice inventory] error', e);
      showToast('Errore vocale inventario', 'err');
    } finally {
      setInvRecBusy(false);
      setBusy(false);
      try { invStreamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      invMediaRef.current = null;
      invStreamRef.current = null;
      invChunksRef.current = [];
    }
  }

  /* =================== Render =================== */
  return (
    <>
      <Head><title>🛍 Lista Prodotti</title></Head>

      <div style={styles.page}>
        <div style={styles.card}>
          {/* Header */}
          <div style={styles.headerRow}>
            <h2 style={styles.title3d}>🛍 Lista Prodotti</h2>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <button onClick={()=>{
                try { localStorage.removeItem(LS_KEY); } catch {}
                setLists({ [LIST_TYPES.SUPERMARKET]: [], [LIST_TYPES.ONLINE]: [] });
                setStock([]);
                setCurrentList(LIST_TYPES.SUPERMARKET);
                showToast('Dati locali azzerati', 'ok');
              }} style={styles.actionGhost} title="Cancella i dati locali">↺ Reset locale</button>
              <Link href="/home" legacyBehavior><a style={styles.homeBtn}>Home</a></Link>
            </div>
          </div>

          {/* Switch lista */}
          <div style={styles.switchRow}>
            <button onClick={() => setCurrentList(LIST_TYPES.SUPERMARKET)}
                    style={currentList === LIST_TYPES.SUPERMARKET ? styles.switchBtnActive : styles.switchBtn}>
              Lista Supermercato
            </button>
            <button onClick={() => setCurrentList(LIST_TYPES.ONLINE)}
                    style={currentList === LIST_TYPES.ONLINE ? styles.switchBtnActive : styles.switchBtn}>
              Lista Spesa Online
            </button>
          </div>

          {/* Comandi Lista */}
          <div style={styles.toolsRow}>
            <button onClick={toggleRecList} style={styles.voiceBtn} disabled={busy}>
              {recBusy ? '⏹️ Stop' : '🎙 Vocale Lista'}
            </button>
            <button onClick={() => setShowListForm(v => !v)} style={styles.primaryBtn}>
              {showListForm ? '– Chiudi form lista' : '➕ Aggiungi manualmente alla lista corrente'}
            </button>
          </div>

          {/* Form aggiunta manuale Lista */}
          {showListForm && (
            <div style={styles.sectionLarge}>
              <form onSubmit={addManualItem} style={styles.formRow}>
                <input placeholder="Prodotto (es. latte)" value={form.name}
                      onChange={e => setForm(f => ({...f, name: e.target.value}))} style={styles.input} required />
                <input placeholder="Marca (es. Parmalat)" value={form.brand}
                      onChange={e => setForm(f => ({...f, brand: e.target.value}))} style={styles.input} />
                <input placeholder="Confezioni" inputMode="decimal" value={form.packs}
                      onChange={e => setForm(f => ({...f, packs: e.target.value}))} style={{...styles.input, width: 140}} required />
                <input placeholder="Unità/conf." inputMode="decimal" value={form.unitsPerPack}
                      onChange={e => setForm(f => ({...f, unitsPerPack: e.target.value}))} style={{...styles.input, width: 140}} required />
                <input placeholder="Etichetta (es. bottiglie)" value={form.unitLabel}
                      onChange={e => setForm(f => ({...f, unitLabel: e.target.value}))} style={{...styles.input, width: 170}} />
                <button style={styles.primaryBtn} disabled={busy}>Aggiungi alla lista</button>
              </form>
            </div>
          )}

          {/* Lista corrente */}
<div style={styles.sectionLarge}>
  <h3 style={styles.h3}>
    Lista corrente: <span style={{ opacity: 0.85 }}>{currentList === LIST_TYPES.ONLINE ? 'Spesa Online' : 'Supermercato'}</span>
  </h3>

  {(lists[currentList] || []).length === 0 ? (
    <p style={{ opacity: 0.8 }}>Nessun prodotto ancora</p>
  ) : (
    <div style={styles.listGrid}>
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
            onKeyDown={e => {
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
            style={{
              ...styles.rowButton,
              ...(isBought ? styles.rowButtonBought : styles.rowButtonToBuy)
            }}
          >
            <div style={styles.rowLeft}>
              <div style={styles.rowName}>
                {it.name}{it.brand ? <span style={styles.rowBrand}> · {it.brand}</span> : null}
              </div>
              <div style={styles.rowMeta}>
                {it.qty} conf. × {it.unitsPerPack} {it.unitLabel}
              </div>
            </div>

            <div style={styles.rowActions} onClick={e => e.stopPropagation()}>
              {/* OK → sposta subito in scorte */}
              <button
                title="Aggiungi 1 conf. alle scorte"
                onClick={() => {
                  const item = it;
                  const movePacks = 1;

                  // riduci qty in lista
                  setLists(prev => {
                    const next = { ...prev };
                    next[currentList] = (prev[currentList] || [])
                      .map(r => r.id === item.id ? { ...r, qty: Math.max(0, Number(r.qty || 0) - movePacks) } : r)
                      .filter(r => Number(r.qty || 0) > 0);
                    return next;
                  });

                  // aggiorna scorte
                  setStock(prev => {
                    const arr = [...prev];
                    const todayISO = new Date().toISOString().slice(0, 10);
                    const idx = arr.findIndex(
                      s => isSimilar(s.name, item.name) && (!item.brand || isSimilar(s.brand || '', item.brand))
                    );
                    const moveUPP = Math.max(1, Number(item.unitsPerPack || 1));
                    const moveLabel = item.unitLabel || 'unità';
                    if (idx >= 0) {
                      const old = arr[idx];
                      const upp = Math.max(1, Number(old.unitsPerPack || moveUPP));
                      const newPacks = Math.max(0, Number(old.packs || 0) + movePacks);
                      arr[idx] = { ...old, packs: newPacks, unitsPerPack: upp, unitLabel: old.unitLabel || moveLabel, ...restockTouch(newPacks, todayISO, upp) };
                    } else {
                      arr.unshift({
                        name: item.name, brand: item.brand || '',
                        packs: movePacks, unitsPerPack: moveUPP, unitLabel: moveLabel,
                        expiresAt: '', ...restockTouch(movePacks, todayISO, moveUPP), avgDailyUnits: 0
                      });
                    }
                    return arr;
                  });
                }}
                style={styles.smallOkBtn}
              >
                ✓
              </button>

              <button title="–1" onClick={() => incQty(it.id, -1)} style={styles.smallQtyBtn}>−</button>
              <button title="+1" onClick={() => incQty(it.id, +1)} style={styles.smallQtyBtn}>+</button>
              <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.smallDangerBtn}>🗑</button>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>
          {/* OCR Scontrino globale */}
          <div style={styles.sectionLarge}>
            <h3 style={styles.h3}>📸 OCR Scontrino</h3>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={() => ocrInputRef.current?.click()} style={styles.primaryBtn} disabled={busy}>
                Carica foto scontrino
              </button>
              <p style={{ opacity:.8, margin:0 }}>Riconosce acquisti, riduce la lista e aggiorna le scorte.</p>
            </div>
          </div>

          {/* Stato Scorte */}
          <div style={styles.sectionLifted}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.h3}>🏠 Stato Scorte</h3>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={toggleVoiceInventory} style={styles.voiceBtn} disabled={busy}>
                  {invRecBusy ? '⏹️ Stop' : '🎙 Vocale Scorte'}
                </button>
                <button onClick={() => setShowStockForm(v => !v)} style={styles.primaryBtn}>
                  {showStockForm ? '– Chiudi scorte manuali' : '➕ Aggiungi scorta manualmente'}
                </button>
                <button onClick={() => setShowExpiryForm(v => !v)} style={styles.primaryBtn}>
                  {showExpiryForm ? '– Chiudi scadenze manuali' : '🗓️ Inserisci scadenza manuale'}
                </button>
              </div>
            </div>

            {/* Form scorte manuali */}
            {showStockForm && (
              <form onSubmit={(e)=>{e.preventDefault();
                const name = stockForm.name.trim();
                if (!name) return;
                const brand = (stockForm.brand || '').trim();
                const packs = Math.max(0, Number(String(stockForm.packs).replace(',','.')) || 0);
                const unitsPerPack = Math.max(1, Number(String(stockForm.unitsPerPack).replace(',','.')) || 1);
                const unitLabel = (stockForm.unitLabel || 'unità').trim() || 'unità';
                const ex = toISODate(stockForm.expiresAt || '');
                const todayISO = new Date().toISOString().slice(0,10);
                setStock(prev => {
                  const arr = [...prev];
                  const idx = arr.findIndex(s => isSimilar(s.name, name) && (!brand || isSimilar(s.brand||'', brand)));
                  if (idx >= 0) {
                    const old = arr[idx];
                    const newPacks = Number(old.packs || 0) + packs;
                    arr[idx] = {
                      ...old,
                      packs: newPacks,
                      unitsPerPack: old.unitsPerPack || unitsPerPack,
                      unitLabel: old.unitLabel || unitLabel,
                      expiresAt: ex || old.expiresAt || '',
                      ...restockTouch(newPacks, todayISO, old.unitsPerPack || unitsPerPack)
                    };
                  } else {
                    arr.unshift({
                      name, brand,
                      packs, unitsPerPack, unitLabel,
                      expiresAt: ex || '',
                      baselinePacks: packs,
                      lastRestockAt: todayISO,
                      avgDailyUnits: 0,
                      residueUnits: packs * unitsPerPack,
                      image: ''
                    });
                  }
                  return arr;
                });
                setStockForm({ name:'', brand:'', packs:'1', unitsPerPack:'1', unitLabel:'unità', expiresAt:'' });
                setShowStockForm(false);
                showToast('Scorta aggiunta ✓', 'ok');
              }} style={styles.formRow}>
                <input style={styles.input} placeholder="Prodotto" value={stockForm.name}
                       onChange={e=>setStockForm(s=>({...s,name:e.target.value}))} required />
                <input style={styles.input} placeholder="Marca" value={stockForm.brand}
                       onChange={e=>setStockForm(s=>({...s,brand:e.target.value}))} />
                <input style={{...styles.input, width:120}} inputMode="decimal" placeholder="Confezioni" value={stockForm.packs}
                       onChange={e=>setStockForm(s=>({...s,packs:e.target.value}))} />
                <input style={{...styles.input, width:140}} inputMode="decimal" placeholder="Unità/conf." value={stockForm.unitsPerPack}
                       onChange={e=>setStockForm(s=>({...s,unitsPerPack:e.target.value}))} />
                <input style={{...styles.input, width:160}} placeholder="Etichetta (es. bottiglie)" value={stockForm.unitLabel}
                       onChange={e=>setStockForm(s=>({...s,unitLabel:e.target.value}))} />
                <input style={{...styles.input, width:170}} placeholder="Scadenza (YYYY-MM-DD o 15/08/2025)" value={stockForm.expiresAt}
                       onChange={e=>setStockForm(s=>({...s,expiresAt:e.target.value}))} />
                <button style={styles.primaryBtn} disabled={busy}>Aggiungi scorta</button>
              </form>
            )}

            {/* Form scadenze manuali */}
            {showExpiryForm && (
              <form onSubmit={(e)=>{e.preventDefault();
                const name = (expiryForm.name || '').trim();
                const iso  = toISODate(expiryForm.expiresAt || '');
                if (!name || !iso) { showToast('Nome o data non validi', 'err'); return; }
                let updated = false;
                setStock(prev => {
                  const arr = [...prev];
                  const i = arr.findIndex(s => isSimilar(s.name, name));
                  if (i >= 0) {
                    arr[i] = { ...arr[i], expiresAt: iso };
                    updated = true;
                  } else {
                    arr.unshift({
                      name, brand:'', packs:0, unitsPerPack:1, unitLabel:'unità',
                      expiresAt: iso, baselinePacks:0, lastRestockAt:'', avgDailyUnits:0, residueUnits:0
                    });
                    updated = true;
                  }
                  return arr;
                });
                if (updated) {
                  showToast('Scadenza impostata ✓', 'ok');
                  setExpiryForm({ name:'', expiresAt:'' });
                  setShowExpiryForm(false);
                } else {
                  showToast('Scadenza non aggiornata', 'err');
                }
              }} style={styles.formRow}>
                <input style={styles.input} placeholder="Prodotto" value={expiryForm.name}
                       onChange={e=>setExpiryForm(f=>({...f,name:e.target.value}))} required />
                <input style={{...styles.input, width:220}} placeholder="Scadenza (YYYY-MM-DD o 15/08/2025)" value={expiryForm.expiresAt}
                       onChange={e=>setExpiryForm(f=>({...f,expiresAt:e.target.value}))} required />
                <button style={styles.primaryBtn} disabled={busy}>Imposta scadenza</button>
              </form>
            )}

            {/* Critici */}
            <div style={{ marginTop: 8 }}>
              <h4 style={styles.h4}>⚠️ In esaurimento / in scadenza</h4>
              {critical.length === 0 ? (
                <p style={{ opacity:.8, marginTop:4 }}>Nessun prodotto critico.</p>
              ) : (
                <div style={styles.critListWrap}>
                  {critical.map((s, i) => {
                    const { current, baseline, pct } = residueInfo(s);
                    const w = Math.round(pct*100);
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scorte complete — LAYOUT A RIGHE */}
            <div style={{ marginTop: 12 }}>
              <h4 style={styles.h4}>Tutte le scorte</h4>
              {stock.length === 0 ? (
                <p style={{ opacity:.8 }}>Nessuna scorta registrata.</p>
              ) : (
                <div style={styles.stockList}>
                  {stock.map((s, idx) => {
                    const { current, baseline, pct } = residueInfo(s);
                    const w = Math.round(pct*100);
                    const zebra = idx % 2 === 0;
                    return (
                      <div key={idx} style={{ ...(zebra ? styles.stockLineZ1 : styles.stockLineZ2) }}>
                        {editingRow === idx ? (
                          <div>
                            <div style={styles.formRowWrap}>
                              <input style={styles.input} value={editDraft.name}
                                     onChange={e=>handleEditDraftChange('name', e.target.value)} />
                              <input style={styles.input} value={editDraft.brand}
                                     onChange={e=>handleEditDraftChange('brand', e.target.value)} placeholder="Marca" />
                            </div>
                            <div style={styles.formRowWrap}>
                              <input style={{...styles.input, width:120}} inputMode="decimal" value={editDraft.packs}
                                     onChange={e=>handleEditDraftChange('packs', e.target.value)} placeholder="Confezioni" />
                              <input style={{...styles.input, width:140}} inputMode="decimal" value={editDraft.unitsPerPack}
                                     onChange={e=>handleEditDraftChange('unitsPerPack', e.target.value)} placeholder="Unità/conf." />
                              <input style={{...styles.input, width:150}} value={editDraft.unitLabel}
                                     onChange={e=>handleEditDraftChange('unitLabel', e.target.value)} placeholder="Etichetta" />
                            </div>
                            <div style={styles.formRowWrap}>
                              <input style={{...styles.input, width:220}} value={editDraft.expiresAt}
                                     onChange={e=>handleEditDraftChange('expiresAt', e.target.value)} placeholder="YYYY-MM-DD o 15/08/2025" />
                              <input style={{...styles.input, width:190}} inputMode="decimal" value={editDraft.residueUnits}
                                     onChange={e=>handleEditDraftChange('residueUnits', e.target.value)} placeholder="Residuo unità" />
                            </div>
                            <div style={{ display:'flex', gap:8, marginTop:6 }}>
                              <button onClick={()=>saveRowEdit(idx)} style={styles.smallOkBtn}>Salva</button>
                              <button onClick={cancelRowEdit} style={styles.smallGhostBtn}>Annulla</button>
                              <button
                                onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }}
                                style={styles.smallGhostBtn}
                              >OCR riga</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Riga: immagine | nome+barra | confezioni | unità/conf | azioni */}
                            <div style={styles.stockRow}>
                              {/* Colonna immagine (più grande) */}
                              <div
                                style={styles.imageBox}
                                role="button"
                                title="Aggiungi/Modifica immagine"
                                onClick={() => { setTargetImageIdx(idx); rowImageInputRef.current?.click(); }}
                              >
                                {s.image ? (
                                  <img src={s.image} alt={s.name} style={styles.imageThumb} />
                                ) : (
                                  <div style={styles.imagePlaceholder}>＋</div>
                                )}
                              </div>

                              {/* Nome + barra (barra più alta) */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={styles.stockTitle}>
                                  {s.name}{s.brand ? <span style={styles.rowBrand}> · {s.brand}</span> : null}
                                </div>
                                <div style={styles.progressOuterBig}>
                                  <div style={{ ...styles.progressInner, width: `${w}%`, background: colorForPct(pct) }} />
                                </div>
                                <div style={styles.stockLineSmall}>
                                  {Math.round(current)}/{Math.max(1, Math.round(baseline))} {s.unitLabel || 'unità'}
                                  {s.expiresAt ? <span style={styles.expiryChip}>scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}</span> : null}
                                </div>
                              </div>

                              {/* Confezioni */}
                              <div style={styles.kvCol}>
                                <div style={styles.kvLabel}>Confezioni</div>
                                <div style={styles.kvValue}>{Number(s.packs || 0)}</div>
                              </div>

                              {/* Unità/conf. */}
                              <div style={styles.kvCol}>
                                <div style={styles.kvLabel}>Unità/conf.</div>
                                <div style={styles.kvValue}>{Number(s.unitsPerPack || 1)}</div>
                              </div>

                              {/* Azioni riga (allineate a destra) */}
                              <div style={styles.rowActionsRight}>
                                <button onClick={()=>startRowEdit(idx, s)} style={styles.smallGhostBtn}>Modifica</button>
                                <button onClick={() => applyDeltaToStock(idx, { setUnits: 0 })} style={styles.smallDangerBtn} title="Imposta residuo a 0">Svuota</button>
                                <button title="OCR (etichetta+scontrino) per questa riga" onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }} style={styles.smallGhostBtn}>OCR riga</button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* TOAST */}
          {toast && (
            <div style={{
              position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
              background: toast.type==='ok' ? '#16a34a' : (toast.type==='err' ? '#ef4444' : '#334155'),
              color:'#fff', padding:'10px 14px', borderRadius:10,
              boxShadow:'0 6px 16px rgba(0,0,0,.35)', zIndex:9999, fontWeight:600, letterSpacing:.2
            }}>
              {toast.msg}
            </div>
          )}
        </div>
      </div>

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

      {/* OCR UNICO di riga */}
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

            // 1) OCR di tutte le immagini caricate
            const fd = new FormData();
            files.forEach(f => fd.append('images', f));
            const ocrRes = await timeoutFetch(API_OCR, { method:'POST', body: fd }, 35000);
            const ocr = await readJsonSafe(ocrRes);
            if (!ocr.ok) throw new Error(ocr.error || 'Errore OCR');
            const ocrText = String(ocr.text || '').trim();
            if (!ocrText) throw new Error('Nessun testo letto');

            // 2) Chiedi il pacchetto unificato
            const prompt = buildUnifiedRowPrompt(ocrText, { name: itemName, brand });
            const r = await timeoutFetch(API_ASSISTANT_TEXT, {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ prompt })
            }, 30000);
            const safe = await readJsonSafe(r);
            const answer = safe?.answer || safe?.data || safe;
            const parsed = typeof answer === 'string' ? (()=>{ try { return JSON.parse(answer);} catch { return null; } })() : answer;

            // 3) Applica ai dati di scorta
            const upd = {
              name: String(parsed?.name || itemName || '').trim(),
              brand: String(parsed?.brand || brand || '').trim(),
              packs: Math.max(0, Number(parsed?.packs || 0)),
              unitsPerPack: Math.max(1, Number(parsed?.unitsPerPack || 1)),
              unitLabel: String(parsed?.unitLabel || 'unità').trim() || 'unità',
              expiresAt: toISODate(parsed?.expiresAt || '')
            };

            const todayISO = new Date().toISOString().slice(0,10);

            setStock(prev => {
              const arr = [...prev];

              if (stockIndex >= 0 && arr[stockIndex]) {
                const old = arr[stockIndex];
                const nowUnits = upd.packs * upd.unitsPerPack;
                const wasUnits = Math.max(0, Number(old.packs || 0) * Math.max(1, Number(old.unitsPerPack || 1)));
                const restock = nowUnits > wasUnits;

                let next = {
                  ...old,
                  name: upd.name || old.name,
                  brand: upd.brand || old.brand,
                  packs: (upd.packs || upd.packs === 0) ? upd.packs : old.packs || 0,
                  unitsPerPack: upd.unitsPerPack || old.unitsPerPack || 1,
                  unitLabel: upd.unitLabel || old.unitLabel || 'unità',
                  expiresAt: upd.expiresAt || old.expiresAt || ''
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
                  ...restockTouch(newPacks || old.packs || 0, todayISO, newUPP)
                };
              } else {
                const p = Math.max(0, Number(upd.packs || 0));
                const u = Math.max(1, Number(upd.unitsPerPack || 1));
                arr.unshift({
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
                  image: ''
                });
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

      {/* Input immagine prodotto */}
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

/* =================== Styles (completo con fix) =================== */
const styles = {
  page: {
    minHeight:'100vh',
    background:'radial-gradient(1200px 1200px at 10% -10%, rgba(90,130,160,.25), transparent), radial-gradient(1200px 1200px at 110% 10%, rgba(60,110,140,.25), transparent), linear-gradient(180deg, #0b1520, #0e1b27 60%, #0b1520)',
    padding:'24px 16px',
    color:'#f8f1dc',
    textShadow:'0 0 6px rgba(255,245,200,.15)'
  },

/ Card trasparente
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

  sectionLarge:{ marginTop:18, padding:12, borderRadius:14, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.05)' },
  sectionLifted:{ marginTop:18, padding:14, borderRadius:16, background:'rgba(0,0,0,.25)', border:'1px solid rgba(255,255,255,.08)', boxShadow:'0 6px 16px rgba(0,0,0,.35)' },
  sectionHeaderRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, gap:8 },

  h3:{ margin:'6px 0 10px', fontSize:'1.25rem', fontWeight:700, color:'#f9fafb' },
  h4:{ margin:'6px 0 6px', fontSize:'1.05rem', fontWeight:700, color:'#e5e7eb' },

  listGrid:{ display:'flex', flexDirection:'column', gap:6, marginTop:6 },
  rowButton:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', borderRadius:12, cursor:'pointer', userSelect:'none' },
  rowButtonToBuy:{ background:'rgba(17,24,39,.6)', border:'1px solid #334155' },
  rowButtonBought:{ background:'rgba(21,128,61,.4)', border:'1px solid #166534', textDecoration:'line-through', opacity:.75 },
  rowLeft:{ flex:1, minWidth:0 },
  rowName:{ fontWeight:600, fontSize:'1.05rem' },
  rowBrand:{ fontWeight:400, fontSize:'.95rem', opacity:.75 },
  rowMeta:{ fontSize:'.9rem', opacity:.85, marginTop:2 },
  rowActions:{ display:'flex', gap:6, marginLeft:12 },
  rowActionsRight:{ display:'flex', gap:6, marginLeft:'auto' },

  badgeToBuy:{ marginLeft:8, background:'#1e40af', color:'#bfdbfe', padding:'1px 6px', borderRadius:6, fontSize:'.8rem' },
  badgeBought:{ marginLeft:8, background:'#14532d', color:'#bbf7d0', padding:'1px 6px', borderRadius:6, fontSize:'.8rem' },

  smallOkBtn:{ padding:'2px 6px', borderRadius:6, background:'#16a34a', color:'#fff', border:'none', fontWeight:600 },
  smallDangerBtn:{ padding:'2px 6px', borderRadius:6, background:'#dc2626', color:'#fff', border:'none', fontWeight:600 },
  smallGhostBtn:{ padding:'2px 6px', borderRadius:6, background:'rgba(255,255,255,.1)', color:'#e5e7eb', border:'1px solid #334155', fontWeight:500 },
  smallQtyBtn:{ padding:'2px 6px', borderRadius:6, background:'rgba(255,255,255,.08)', color:'#f8fafc', border:'1px solid #334155', fontWeight:700 },

  formRow:{ display:'flex', flexWrap:'wrap', gap:8, margin:'6px 0' },
  formRowWrap:{ display:'flex', flexWrap:'wrap', gap:8, marginTop:6 },
  input:{ flex:1, minWidth:120, padding:'8px 10px', borderRadius:8, border:'1px solid #475569', background:'rgba(15,23,42,.6)', color:'#f1f5f9' },

  critListWrap:{ display:'flex', flexDirection:'column', gap:6, marginTop:4 },
  critRow:{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:10, background:'rgba(255,255,255,.05)' },
  critName:{ flex:1, fontWeight:600 },
  critMeta:{ fontSize:'.85rem', opacity:.85 },
  progressOuterCrit:{ flex:1, height:6, borderRadius:6, background:'rgba(255,255,255,.1)', overflow:'hidden' },
  progressOuterBig:{ marginTop:4, height:12, borderRadius:6, background:'rgba(255,255,255,.1)', overflow:'hidden' },
  progressInner:{ height:'100%' },

  expiryChip:{ marginLeft:6, background:'#7e22ce', color:'#f3e8ff', padding:'0 6px', borderRadius:6, fontSize:'.75rem' },

  stockList:{ display:'flex', flexDirection:'column', marginTop:6 },
  stockLineZ1:{ padding:'8px 10px', borderRadius:12, background:'rgba(255,255,255,.04)', marginBottom:4 },
  stockLineZ2:{ padding:'8px 10px', borderRadius:12, background:'rgba(0,0,0,.25)', marginBottom:4 },

  stockRow:{ display:'flex', alignItems:'center', gap:12 },
  stockTitle:{ fontWeight:600, fontSize:'1.05rem' },
  stockLineSmall:{ fontSize:'.85rem', opacity:.85, marginTop:2 },

  kvCol:{ minWidth:80, textAlign:'center' },
  kvLabel:{ fontSize:'.75rem', opacity:.7 },
  kvValue:{ fontWeight:700, fontSize:'1rem' },

  imageBox:{ width:64, height:64, borderRadius:12, background:'rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', cursor:'pointer' },
  imageThumb:{ width:'100%', height:'100%', objectFit:'cover' },
  imagePlaceholder:{ fontSize:'1.4rem', opacity:.5 }
};
