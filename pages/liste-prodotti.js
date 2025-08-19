
// pages/liste-prodotti.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Pencil, Trash2, Camera } from 'lucide-react';

/* ====================== Costanti / Config ====================== */
const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;

/* ====================== Feature toggles / safety ====================== */
// Se l’OCR / vocale trova il prodotto ma non capisce le quantità,
const DEFAULT_PACKS_IF_MISSING = true;


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

// chiave univoca per nome+marca
function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function productKey(name = '', brand = '') {
  return `${normKey(name)}|${normKey(brand)}`;
}

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
      imagesIndex: snapshot.imagesIndex || {}, // nuovo indice immagini
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
// Rileva frasi che indicano un valore ASSOLUTO (SET) invece di sommare
function hasAbsoluteKeywords(text) {
  const t = normKey(text);
  // esempi supportati:
  // "sono 6 bottiglie", "restano 2 pacchi", "rimangono 4",
  // "ci sono ancora 3", "ancora 5"
  return /\b(sono|resta(?:no)?|rimane(?:no)?|rimangono|rimasto|rimasti|rimaste|ci\s+sono\s+ancora|ancora)\b/.test(t);
}
// Sinonimi ampi per UNITA' e per CONFEZIONI (packs)
const UNIT_SYNONYMS = '(?:unit(?:a|à)?|unit\\b|pz\\.?|pezz(?:i|o)\\.?|bottiglie?|busta(?:e)?|bustine?|lattin(?:a|e)|barattol(?:o|i)|vasett(?:o|i)|vaschett(?:a|e)|brick|cartocc(?:io|i)|fett(?:a|e)|uova|compresse?|pastiglie?|pillol(?:a|e)|monouso|fogli(?:o|i)|rotol(?:o|i)|bicchier(?:e|i)|capsul(?:a|e))';
const PACK_SYNONYMS = '(?:conf(?:e(?:zioni)?)?|confezione|pacc?hi?|pack|multipack|scatol(?:a|e)|carton(?:e|i))';


/* ====================== Parser liste rapide ====================== */
function extractPackInfo(str){
  const raw = normKey(str);

  // parole → numeri (un|uno|una = 1, ecc.)
  const WORD_MAP = { un:1, uno:1, una:1, due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7, otto:8, nove:9, dieci:10 };
  const s = raw.replace(/\b(un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/g, (w)=>String(WORD_MAP[w]||w));

  let packs = 1;
  let unitsPerPack = 1;
  let unitLabel = 'unità';

  // include anche 'unit' senza accento per tollerare "unit"
  const UNIT_TERMS = '(?:pz|pezzi|unit(?:a|à)?|unit\\b|barrett[e]?|vasett[i]?|uova|bottiglie?|merendine?|bustin[ae]|monouso)';

  let m;

  // "2 confezioni da 6 bottiglie" / "1 confezione da 6 unità"
  m = s.match(new RegExp(`(\\d+)\\s*(?:conf(?:e(?:zioni)?)?|pacc?hi?|scatol[ae])\\s*(?:da|x)\\s*(\\d+)\\s*(${UNIT_TERMS})?`, 'i'));
  if (m){
    packs = Number(m[1]);
    unitsPerPack = Number(m[2]);
    const lab = (m[3] || 'unità').replace(/^(?:pz|pezzi|unit|unita?)$/,'unità');
    unitLabel = /bottigl/i.test(lab) ? 'bottiglie' : 'unità';
    return { packs, unitsPerPack, unitLabel, explicit: true };
  }

  // "2 confezioni 6 bottiglie" / "2 confezioni 6 unità"
  m = s.match(new RegExp(`(\\d+)\\s*(?:conf(?:e(?:zioni)?)?|pacc?hi?)\\b.*?\\b(\\d+)\\s*(${UNIT_TERMS})?`, 'i'));
  if (m){
    packs = Number(m[1]);
    unitsPerPack = Number(m[2]);
    const lab = (m[3] || 'unità').replace(/^(?:pz|pezzi|unit|unita?)$/,'unità');
    unitLabel = /bottigl/i.test(lab) ? 'bottiglie' : 'unità';
    return { packs, unitsPerPack, unitLabel, explicit: true };
  }

  // "4x125" → prendo 4 come unitsPerPack
  m = s.match(/(\d+)\s*[x×]\s*\d+/i);
  if (m){
    packs = 1;
    unitsPerPack = Number(m[1]);
    return { packs, unitsPerPack, unitLabel, explicit: true };
  }

  // "... 6 bottiglie" | "... 6 unit"
  m = s.match(new RegExp(`(\\d+)\\s*(${UNIT_TERMS})\\b`, 'i'));
  if (m){
    packs = 1;
    unitsPerPack = Number(m[1]);
    const lab = (m[2] || 'unità').replace(/^(?:pz|pezzi|unit|unita?)$/,'unità');
    unitLabel = /bottigl/i.test(lab) ? 'bottiglie' : 'unità';
    return { packs, unitsPerPack, unitLabel, explicit: false };
  }

  // "... 2 confezioni" (solo pacchi)
  m = s.match(new RegExp(`(\\d+)\\s*(bottiglie?|pacc?hi?|scatol[ae]|conf(?:e(?:zioni)?)?)`, 'i'));
  if (m){
    packs = Number(m[1]);
    unitsPerPack = 1;
    const tok = m[2] || '';
    unitLabel = /^bott/i.test(tok) ? 'bottiglie' : 'unità';
    return { packs, unitsPerPack, unitLabel, explicit: false };
  }

  // "2 kg zucchero" → tratta come pacchi=2
  m = s.match(/^(\d+(?:[.,]\d+)?)(?=\s+[a-z])/i);
  if (m){
    packs = Number(String(m[1]).replace(',','.')) || 1;
    unitsPerPack = 1;
    return { packs, unitsPerPack, unitLabel, explicit: false };
  }

  return { packs, unitsPerPack, unitLabel, explicit: false };
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
    const packs = Number(packInfo.packs || 1);

    // ripulisci eventuale quantità iniziale “2 latte …”
    let rest = s;
    const mQtyLead = rest.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
    if (mQtyLead) rest = mQtyLead[2].trim();

    // name / brand (se l’ultima parola è Capitalized la tratto come brand)
    let name = rest;
    let brand = '';

    const marca = rest.match(/\b(?:marca|brand)\s+([^\s].*)$/i);
    if (marca) {
      brand = marca[1].trim();
      name = rest.replace(marca[0], '').trim();
    } else {
      const parts = rest.split(' ');
      if (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (/^[A-ZÀ-ÖØ-Þ]/.test(last)) {
          brand = last;
          name = parts.slice(0, -1).join(' ');
        }
      }
    }

    name = name.replace(/\s{2,}/g, ' ').trim();
    brand = brand.replace(/\s{2,}/g, ' ').trim();
    if (!name) continue;

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

/* === NEW: helper per errori chiari e JSON rigoroso === */
async function readTextSafe(res){
  try { return await res.text(); } catch { return ''; }
}

async function fetchJSONStrict(url, opts={}, timeoutMs=40000){
  const r = await timeoutFetch(url, opts, timeoutMs);
  const ct = (r.headers.get?.('content-type') || '').toLowerCase();
  const raw = await readTextSafe(r);

  if (!r.ok) {
    let msg = raw;
    if (ct.includes('application/json')) {
      try {
        const j = JSON.parse(raw);
        msg = j.error || j.message || JSON.stringify(j);
      } catch {}
    }
    throw new Error(`HTTP ${r.status} ${r.statusText || ''} — ${String(msg).slice(0,250)}`);
  }

  if (!raw.trim()) return {};
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw); } catch (e) { throw new Error(`JSON parse error: ${e?.message||e}`); }
  }
  try { return JSON.parse(raw); } catch { return { data: raw }; }
}

// ——— Helpers robusti per immagini/Blob (usati da handleOCR e OCR riga) ———
function isBlobish(v){
  try {
    return !!(v && typeof v === 'object'
      && typeof v.type === 'string'
      && typeof v.size === 'number'
      && typeof v.arrayBuffer === 'function'
      && typeof v.slice === 'function');
  } catch { return false; }
}

function dataUrlToBlob(dataUrl) {
  try {
    const [head, base64] = String(dataUrl || '').split(',');
    const m = head.match(/data:(.*?);base64/i);
    const mime = m ? m[1] : 'application/octet-stream';
    const bin = atob(base64 || '');
    const len = bin.length;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  } catch { return null; }
}

function guessExt(mime='') {
  const m = (mime || '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('heic')) return 'heic';
  return 'bin';
}

async function collectImageBlobs(input) {
  const list = Array.from(input || []);
  const out = [];
  for (const f of list) {
    if (isBlobish(f)) {
      out.push({ blob: f, name: (f.name || `upload.${guessExt(f.type)}`) });
      continue;
    }
    if (typeof f === 'string') {
      if (f.startsWith('data:')) {
        const b = dataUrlToBlob(f);
        if (b) out.push({ blob: b, name: `upload.${guessExt(b.type)}` });
        continue;
      }
      if (/^(blob:|https?:)/i.test(f)) {
        try {
          const resp = await fetch(f);
          const b = await resp.blob();
          out.push({ blob: b, name: `upload.${guessExt(b.type)}` });
        } catch {}
        continue;
      }
    }
    if (f && typeof f === 'object') {
      const maybe = f.file || f.blob;
      if (isBlobish(maybe)) {
        out.push({ blob: maybe, name: (f.name || `upload.${guessExt(maybe.type)}`) });
        continue;
      }
      const url = f.preview || f.uri || f.url;
      if (typeof url === 'string' && /^(data:|blob:|https?:)/i.test(url)) {
        try {
          if (url.startsWith('data:')) {
            const b = dataUrlToBlob(url);
            if (b) out.push({ blob: b, name: `upload.${guessExt(b.type)}` });
          } else {
            const resp = await fetch(url);
            const b = await resp.blob();
            out.push({ blob: b, name: `upload.${guessExt(b.type)}` });
          }
        } catch {}
        continue;
      }
    }
  }
  return out;
}

/* ====================== Calcoli scorte ====================== */
function clamp01(x){ return Math.max(0, Math.min(1, Number(x) || 0)); }
function residueUnitsOf(s){
  const upp = Math.max(1, Number(s.unitsPerPack || 1));
  const ru = Number(s.residueUnits);
  if (s.packsOnly) return Math.max(0, Number(s.packs || 0)); // barra sui pacchi in modalità solo confezioni
  if (Number.isFinite(ru)) return Math.max(0, ru);
  return Math.max(0, Number(s.packs || 0) * upp);
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
    'Sei Jarvis, estrattore strutturato di SCONTRINI. RISPONDI SOLO JSON con lo schema ESATTO sotto.',
    '{',
    '  "store":"",                 // punto vendita (anche ragione sociale)',
    '  "purchaseDate":"",          // YYYY-MM-DD se presente',
    '  "purchases":[               // RIGHE ARTICOLO',
    '    {',
    '      "name":"",              // prodotto normalizzato usando il lessico',
    '      "brand":"",             // marca breve, altrimenti ""',
    '      "packs":0,              // n. confezioni (se indicato) - default 0',
    '      "unitsPerPack":0,       // n. unità per confezione (se indicato) - default 0',
    '      "unitLabel":"",         // "unità", "bottiglie", "pezzi", "buste", ...',
    '      "priceEach":0,          // prezzo unitario se deducibile, altrimenti 0',
    '      "priceTotal":0,         // totale riga, altrimenti 0',
    '      "currency":"",          // es. "EUR" se deducibile',
    '      "expiresAt":""          // YYYY-MM-DD se compare una scadenza',
    '    }',
    '  ]',
    '}',
    '',
    'REGOLE:',
    `- Normalizza i nomi prodotti rispetto a questo LESSICO: ${LEX}`,
    '- Ignora intestazioni generiche, subtotali, IVA, metodi di pagamento, resto, numeri d’ordine.',
    '- Se non trovi un campo, metti valore "vuoto": stringa vuota "", numeri 0.',
    '- Riconosci unità tipiche: unità, pz/pezzo/pezzi, bottiglia/e, busta/e, lattina/e, vasetto/i, barattolo/i, vaschetta/e, foglio/i, rotolo/i, capsula/e…',
    '- packs/unitsPerPack: usa pattern tipo "2x6", "2 conf da 6", "2 confezioni 6 pezzi", "6 bottiglie" (=> packs=1, unitsPerPack=6).',
    '- purchaseDate: usa la data stampata sullo scontrino (NON la data/ora attuali).',
    '',
    '--- TESTO OCR INIZIO ---',
    ocrText,
    '--- TESTO OCR FINE ---'
  ].join('\n');
}
function buildOcrStockBagPrompt(ocrText, lexicon = []) {
  const LEX = Array.isArray(lexicon) && lexicon.length ? lexicon.join(', ') : 'latte, pane, pasta, uova, ...';
  return [
    'Sei Jarvis, estrattore da FOTO DI PRODOTTI (busta della spesa, etichette, pacchi).',
    'RISPONDI SOLO JSON con questo schema:',
    '{ "items":[ { "name":"", "brand":"", "packs":0, "unitsPerPack":0, "unitLabel":"", "expiresAt":"" } ] }',
    '',
    `LESSICO di riferimento: ${LEX}`,
    'REGOLE:',
    '- Se vedi quantità tipo "2x6", "2 conf da 6", "6 bottiglie" compila packs/unitsPerPack/unitLabel.',
    '- Se non ricavi packs/unitsPerPack lascia 0 e unitLabel "".',
    '- Scadenza (YYYY-MM-DD) se presente sull’etichetta.',
    '- Se non vedi nulla di utile, restituisci items: [].',
    '',
    '--- TESTO OCR INIZIO ---',
    ocrText,
    '--- TESTO OCR FINE ---'
  ].join('\n');
}
function buildUnifiedRowPrompt(ocrText, { name = '', brand = '' } = {}) {
  return [
    'Sei Jarvis. Hai OCR di una ETICHETTA/PRODOTTO o porzione di scontrino riferita a UNA SOLA VOCE.',
    'RISPONDI SOLO JSON con schema esatto:',
    '{ "name":"", "brand":"", "packs":0, "unitsPerPack":0, "unitLabel":"", "expiresAt":"" }',
    '',
    `Vincoli: se possibile mantieni name≈"${name}" e brand≈"${brand}"`,
    '- Estrai quantità come: packs (confezioni), unitsPerPack (unità per confezione), unitLabel (pezzi/bottiglie/...)',
    '- Se non deduci packs/unitsPerPack lascia 0 e unitLabel ""',
    '- Scadenza in formato YYYY-MM-DD se presente',
    '',
    '--- TESTO OCR INIZIO ---',
    ocrText,
    '--- TESTO OCR FINE ---'
  ].join('\n');
}

/* ====================== Parser fallback OCR ====================== */
function parseReceiptPurchases(ocrText) {
  const rawLines = String(ocrText || '')
    .split(/\r?\n/)
    .map(s => s.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  // unisci righe "quantità" tipo "2 X 3,60 7,20" alla riga precedente
  const lines = [];
  for (const ln of rawLines) {
    if (/^\d+\s*[xX]\s*\d+(?:[.,]\d{2})(?:\s+\d+(?:[.,]\d{2}))?\s*$/i.test(ln)) {
      if (lines.length) lines[lines.length - 1] += ' ' + ln;
      else lines.push(ln);
      continue;
    }
    lines.push(ln);
  }

  const HEADER_RE = /^\s*(totale|subtotale|di\s*cui\s*iva|iva\b|pagamento|resto|importo|pezz[i]?|cassa|cassiere|transaz|documento|negozio|art\b|rt\b)/i;
  const IGNORE_RE = /\b(shopper|sacchetto|busta|cauzione|vuoto)\b/i;

  const out = [];
  for (let raw of lines) {
    if (HEADER_RE.test(raw)) continue;
    if (/^\d{6,}$/.test(raw)) continue; // codici a barre/plu isolati

    // togli marcatori iniziali e trattini
    let work = raw.replace(/^[T*+\-]+\s*/, '').trim();
    if (!work) continue;

    // quantità su coda "N x prezzo [totale]"
    let packsFromTail = null;
    const tailQty = work.match(/(\d+)\s*[xX]\s*\d+(?:[.,]\d{2})(?:\s+\d+(?:[.,]\d{2}))?\s*$/);
    if (tailQty) {
      packsFromTail = parseInt(tailQty[1], 10);
      work = work.replace(tailQty[0], '').trim();
    }

    // rimuovi coda "IVA% prezzo", oppure "€ prezzo", oppure solo "prezzo"
    work = work
      .replace(/\s+\d{1,2}%\s+\d+(?:[.,]\d{2})\s*$/i, '')
      .replace(/(?:€|eur|euro)\s*\d+(?:[.,]\d{2})\s*$/i, '')
      .replace(/\s+\d+(?:[.,]\d{2})\s*$/i, '')
      .trim();

    if (IGNORE_RE.test(work)) continue;

    // quantità inline "X6"
    let packsInline = null;
    const mInline = work.match(/\b[xX]\s*(\d+)\b/);
    if (mInline) {
      packsInline = parseInt(mInline[1], 10);
      work = work.replace(mInline[0], '').trim();
    }

    // rimuovi pesi/volumi "250 g", "1,5 L", ecc.
    work = work.replace(/\b(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|lt))\b/gi, '').replace(/\s{2,}/g, ' ').trim();

    // brand = ultima parola in MAIUSCOLO
    let name = work, brand = '';
    const parts = name.split(' ');
    if (parts.length > 1 && /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9\-'.]*$/.test(parts[parts.length - 1])) {
      brand = parts.pop();
      name = parts.join(' ');
    }

    const txt = name.toLowerCase();

    // normalizzazioni "intelligenti" per i casi visti
    if (/prezzemol/.test(txt)) name = 'prezzemolo';
    else if (/pane\s+e\s+pizza/.test(txt)) name = 'farina pane e pizza';
    else if (/pecor.*igt/.test(txt)) name = 'vino pecorino igt';
    else if (/pan\s+bauletto/.test(txt)) name = 'pan bauletto bianco';
    else if (/yo-?yo/.test(txt)) name = 'merendine yo-yo';
    else if (/lacca\b/i.test(name)) name = 'lacca per capelli';
    else if (/pantene.*shampoo/i.test(name)) name = 'shampoo';
    else if (/latte\s+zymil/i.test(name)) name = 'latte';
    else if (/salsiccia/i.test(name)) name = 'salsiccia';
    else if (/candeggin/i.test(name) || /ace/i.test(brand)) name = 'candeggina';
    else if (/\bcaff[eè]\b/.test(txt)) name = 'caffè';

    const packs = packsFromTail || packsInline || 1;

    out.push({
      name: name.trim(),
      brand: brand || '',
      packs: Math.max(1, packs),
      unitsPerPack: 1,
      unitLabel: 'unità',
      expiresAt: ''
    });
  }
  return out;
}


function coerceNum(x){
  if (x == null) return 0;
  const s = String(x).trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function parseByLexicon(ocrText, lexicon = []) {
  const s = normKey(ocrText);
  const counts = Object.create(null);

  for (const term of lexicon) {
    const k = normKey(term);
    if (!k) continue;
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`, 'g');
    const m = s.match(re);
    if (m) counts[term] = (counts[term] || 0) + m.length;
  }

  return Object.entries(counts).map(([name, count]) => ({
    name,
    brand: '',
    packs: Math.max(1, count), // se appare 2 volte, metto 2 confezioni
    unitsPerPack: 1,
    unitLabel: 'unità',
    priceEach: 0,
    priceTotal: 0,
    currency: 'EUR',
    expiresAt: ''
  }));
}


function parseReceiptMeta(ocrText) {
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  // Data
  let purchaseDate = '';
  for (const ln of lines) {
    const iso = toISODate(ln);
    if (iso) { purchaseDate = iso; break; }
  }
  // Store
  const bad = /(totale|iva|imp|euro|€|tel|cassa|scontrino|fiscale|subtot|pagamento|contanti|resto)/i;
  let store = '';
  for (const ln of lines) {
    const hasLetters = /[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(ln);
    if (hasLetters && !bad.test(ln) && ln.length >= 3) { store = ln.replace(/\s{2,}/g,' ').trim(); break; }
  }
  return { store, purchaseDate };
}

function normalizeUnitLabel(lbl=''){
  const s = normKey(lbl);
  if (/bottigl/.test(s)) return 'bottiglie';
  if (/(?:pz|pezz|unit\b|unita?)/.test(s)) return 'pezzi';          // uniformo "unità/pz/pezzi" → "pezzi"
  if (/bust/.test(s)) return 'buste';
  if (/lattin/.test(s)) return 'lattine';
  if (/vasett/.test(s)) return 'vasetti';
  if (/barattol/.test(s)) return 'barattoli';
  if (/vaschett/.test(s)) return 'vaschette';
  if (/rotol/.test(s)) return 'rotoli';
  if (/fogli?/.test(s)) return 'fogli';
  if (/capsul/.test(s)) return 'capsule';
  return 'unità';
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
  const absoluteGlobal = wantsAbsoluteSet(text) || (typeof hasAbsoluteKeywords === 'function' && hasAbsoluteKeywords(text));

  // parole → numeri
  const WORD_MAP = { un:1, uno:1, una:1, due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7, otto:8, nove:9, dieci:10 };
  const wordToNum = (chunk) => {
    const m = chunk.match(/\b(un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/i);
    return m ? (WORD_MAP[m[1].toLowerCase()] || NaN) : NaN;
  };

  for (let rawChunk of parts) {
    if (/scad|scadenza|scade|entro/.test(rawChunk)) continue;
    if (/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(rawChunk)) continue;
    if (/\b20\d{2}\b/.test(rawChunk)) continue;

    const chunks = rawChunk.split(/\s+e\s+/g).map(s => s.trim()).filter(Boolean);

    for (const chunk of chunks) {
      const name = guessProductName(chunk);
      if (!name) continue;

      const forceSet = (typeof hasAbsoluteKeywords === 'function' && hasAbsoluteKeywords(chunk));
      // 1) Struttura esplicita: "2 confezioni da 6 bottiglie"
      const mExplicit = chunk.match(new RegExp(`(\\d+)\\s*${PACK_SYNONYMS}\\s*(?:da|x)\\s*(\\d+)\\s*(?:${UNIT_SYNONYMS})?`, 'i'));
      if (mExplicit) {
        const packs = Math.max(1, Number(mExplicit[1] || 1));
        const upp   = Math.max(1, Number(mExplicit[2] || 1));
        res.push({ name, mode:'packs', value:packs, op:'restockExplicit', _packs:packs, _upp:upp, explicit:true, forceSet });
        continue;
      }
      // Trasforma parole-numeri italiane in cifre (globale)
function numberWordsToDigits(str) {
  if (!str) return '';
  const MAP = {
    un:1, uno:1, una:1,
    due:2, tre:3, quattro:4, cinque:5,
    sei:6, sette:7, otto:8, nove:9, dieci:10
  };
  return String(str).replace(
    /\b(un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/gi,
    (m) => String(MAP[m.toLowerCase()] ?? m)
  );
  
  // *** NEW: normalizzo i numeri in cifre per i match ***
  const cN = numberWordsToDigits(chunk);
}
      // 2) "2 confezioni 6 bottiglie"
      const mBoth = chunk.match(new RegExp(`(\\d+)\\s*${PACK_SYNONYMS}.*?\\b(\\d+)\\s*(?:${UNIT_SYNONYMS})?`, 'i'));
      if (mBoth) {
        const packs = Math.max(1, Number(mBoth[1] || 1));
        const upp   = Math.max(1, Number(mBoth[2] || 1));
        res.push({ name, mode:'packs', value:packs, op:'restockExplicit', _packs:packs, _upp:upp, explicit:true, forceSet });
        continue;
      }

      // 3) Solo UNITA': "... 6 bottiglie / 6 pezzi / 6 unit"
      const mUnits = chunk.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIT_SYNONYMS})\\b`, 'i'));
      if (mUnits) {
        const value = Math.max(0, Number(String(mUnits[1]).replace(',','.')) || 0);
        res.push({ name, mode:'units', value, op: (forceSet || absoluteGlobal) ? 'set' : 'maybeResidue', _packs:1, _upp:value, explicit:false, forceSet });
        continue;
      }

      // 4) Solo PACCHI: "... 3 confezioni / 2 pacchi / 1 scatola"
      const mPacks = chunk.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${PACK_SYNONYMS})\\b`, 'i'));
      if (mPacks) {
        const value = Math.max(0, Number(String(mPacks[1]).replace(',','.')) || 0);
        res.push({ name, mode:'packs', value, op: (forceSet || absoluteGlobal) ? 'set' : 'maybeResidue', _packs:value, _upp:1, explicit:false, forceSet });
        continue;
      }

      // 5) Numero scritto come parola (senza tag): prova a dedurre
      const wnum = wordToNum(chunk);
      if (Number.isFinite(wnum)) {
        // Se contiene parole di unità → units, altrimenti pacchi
        const looksUnits = new RegExp(UNIT_SYNONYMS, 'i').test(chunk);
        const looksPacks = new RegExp(PACK_SYNONYMS, 'i').test(chunk);
        if (looksUnits && !looksPacks) {
          res.push({ name, mode:'units', value: wnum, op: (forceSet || absoluteGlobal) ? 'set' : 'maybeResidue', _packs:1, _upp:wnum, explicit:false, forceSet });
        } else {
          res.push({ name, mode:'packs', value: wnum, op: (forceSet || absoluteGlobal) ? 'set' : 'maybeResidue', _packs:wnum, _upp:1, explicit:false, forceSet });
        }
        continue;
      }

      // 6) Fallback su numero finale isolato
      const mNum = chunk.match(/(\d+(?:[.,]\d+)?)\s*$/);
      if (mNum) {
        const value = Math.max(0, Number(String(mNum[1]).replace(',','.')) || 0);
        // prova a capire da parole presenti
        const looksUnits = new RegExp(UNIT_SYNONYMS, 'i').test(chunk);
        const looksPacks = new RegExp(PACK_SYNONYMS, 'i').test(chunk);
        if (looksUnits && !looksPacks) {
          res.push({ name, mode:'units', value, op:(forceSet || absoluteGlobal)?'set':'maybeResidue', _packs:1, _upp:value, explicit:false, forceSet });
        } else if (looksPacks && !looksUnits) {
          res.push({ name, mode:'packs', value, op:(forceSet || absoluteGlobal)?'set':'maybeResidue', _packs:value, _upp:1, explicit:false, forceSet });
        } else {
          // ambiguo → considera units (caso più comune)
          res.push({ name, mode:'units', value, op:(forceSet || absoluteGlobal)?'set':'maybeResidue', _packs:1, _upp:value, explicit:false, forceSet });
        }
      }
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
// ==== Audio Recorder helpers (robust MIME) ====
function pickAudioMime(){
  if (typeof window === 'undefined' || !window.MediaRecorder) {
    return { mime: 'audio/webm', ext: 'webm' };
  }
  const cand = [
    { mime: 'audio/webm;codecs=opus', ext:'webm' },
    { mime: 'audio/ogg;codecs=opus',  ext:'ogg'  },
    { mime: 'audio/mp4',              ext:'m4a'  },
    { mime: 'audio/webm',             ext:'webm' },
  ];
  for (const c of cand) {
    try {
      if (MediaRecorder.isTypeSupported?.(c.mime)) return c;
    } catch(_) {}
  }
  return { mime: '', ext: 'webm' }; // fallback
}


/* ====================== Utility immagini ====================== */
function withRememberedImage(row, imagesIdx) {
  if (row?.image) return row;
  const key = productKey(row?.name, row?.brand || '');
  const img = imagesIdx?.[key];
  if (img) return { ...row, image: img };
  return row;
}

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
    expiresAt: '',
    residueUnits: '0',
    _ruTouched: false,
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

const recMimeRef = useRef({ mime: 'audio/webm;codecs=opus', ext: 'webm' });

  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // Vocale inventario unificato
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

  // 🔥 indice immagini: { "latte|parmalat": "data:image/..." }
  const [imagesIndex, setImagesIndex] = useState({});

  const curItems = lists[currentList] || [];

  /* =================== Cloud Sync (Supabase) — opzionale =================== */
  const userIdRef = useRef(null);

  useEffect(() => {
    if (!CLOUD_SYNC) return;
    let mounted = true;

    (async () => {
      try {
        // Importa solo se il client esiste; altrimenti non sincronizzare (no crash)
        const mod = await import('@/lib/supabaseClient').catch(() => null);
        if (!mod?.supabase) return;

        __supabase = mod.supabase;

        // Prende l'utente loggato (se non loggato → esci silenziosamente)
        const { data: userData, error: authErr } = await __supabase.auth.getUser();
        if (authErr) return;
        const uid = userData?.user?.id || null;
        if (mounted) userIdRef.current = uid;
        if (!uid) return;

        // Carica stato dal cloud (se esiste).
        const { data: row, error } = await __supabase
          .from(CLOUD_TABLE)
          .select('state')
          .eq('user_id', uid)
          .maybeSingle();

        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (error.code === '42703' || (msg.includes('column') && msg.includes('does not exist'))) {
            if (DEBUG) console.warn('[cloud] colonna state assente: skip load');
          } else if (DEBUG) {
            console.warn('[cloud] load error', error);
          }
          return;
        }

        const st = row?.state;
        if (!st) return;

        setLists({
          [LIST_TYPES.SUPERMARKET]: Array.isArray(st.lists?.[LIST_TYPES.SUPERMARKET]) ? st.lists[LIST_TYPES.SUPERMARKET] : [],
          [LIST_TYPES.ONLINE]: Array.isArray(st.lists?.[LIST_TYPES.ONLINE]) ? st.lists[LIST_TYPES.ONLINE] : [],
        });
        if (Array.isArray(st.stock)) setStock(st.stock);
        if ([LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].includes(st.currentList)) {
          setCurrentList(st.currentList);
        }
        if (st.imagesIndex && typeof st.imagesIndex === 'object') {
          setImagesIndex(st.imagesIndex);
        }
      } catch (e) {
        if (DEBUG) console.warn('[cloud init] skipped', e);
      }
    })();

    return () => { mounted = false; };
  }, []);

  const cloudTimerRef = useRef(null);
  useEffect(() => {
    if (!CLOUD_SYNC || !__supabase) return;
    if (!userIdRef.current) return;

    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    const snapshot = { lists, stock, currentList, imagesIndex };

    cloudTimerRef.current = setTimeout(async () => {
      try {
        await __supabase
          .from(CLOUD_TABLE)
          .upsert(
            { user_id: userIdRef.current, state: snapshot },
            { onConflict: 'user_id' }
          );
      } catch (e) {
        // fix parser: niente optional chaining su call
        const msg = (e?.message || '').toLowerCase();
        if (DEBUG && !(msg.includes('column') && msg.includes('does not exist'))) {
          console.warn('[cloud upsert] fail', e);
        }
      }
    }, 400);

    return () => clearTimeout(cloudTimerRef.current);
  }, [lists, stock, currentList, imagesIndex]);

  /* === Brain Hub – versione robusta (evita forme incompatibili) === */
  const HUB_KEY = '__jarvisBrainHub_v2';

  function getHub() {
    if (typeof window === 'undefined') return null;
    const h = window[HUB_KEY];

    const isValid =
      h &&
      typeof h === 'object' &&
      typeof h.registerDataSource === 'function' &&
      typeof h.registerCommand === 'function' &&
      h._datasources instanceof Map &&
      h._commands instanceof Map;

    if (isValid) return h;

    const hub = {
      _datasources: new Map(),
      _commands: new Map(),
      registerDataSource(def) {
        if (!def?.name) return;
        this._datasources.set(def.name, def);
      },
      registerCommand(def) {
        if (!def?.name) return;
        this._commands.set(def.name, def);
      },
      async ask(name, payload) {
        const ds = this._datasources.get(name);
        return ds?.fetch(payload);
      },
      async run(name, payload) {
        const cmd = this._commands.get(name);
        return cmd?.execute(payload);
      },
      list() {
        return {
          datasources: [...this._datasources.keys()],
          commands: [...this._commands.keys()],
        };
      },
    };

    window[HUB_KEY] = hub;
    return hub;
  }

  useEffect(() => {
    const hub = getHub();
    if (!hub) return;

    const safeRegDS = (def) => {
      if (!hub._datasources.has(def.name)) hub.registerDataSource(def);
    };

    safeRegDS({
      name: 'scorte-complete',
      fetch: () => {
        return (stock || []).map((s) => {
          const upp = Math.max(1, Number(s.unitsPerPack || 1));
          const residueUnits = s.packsOnly
            ? Math.max(0, Number(s.packs || 0))
            : (Number.isFinite(Number(s.residueUnits))
                ? Math.max(0, Number(s.residueUnits))
                : Math.max(0, Number(s.packs || 0) * upp));
          const baselineUnits = s.packsOnly
            ? Math.max(1, Number(s.baselinePacks || s.packs || 1))
            : Math.max(
                upp,
                Number(s.baselinePacks) > 0 ? Number(s.baselinePacks) * upp : Number(s.packs || 0) * upp
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
            expiresAt: s.expiresAt || '',
          };
        });
      },
    });

    safeRegDS({
      name: 'scorte-esaurimento',
      fetch: () => {
        return (stock || []).filter((s) => {
          const upp = Math.max(1, Number(s.unitsPerPack || 1));
          const currentUnits = s.packsOnly
            ? Math.max(0, Number(s.packs || 0))
            : (Number.isFinite(Number(s.residueUnits)) ? Math.max(0, Number(s.residueUnits)) : Math.max(0, Number(s.packs || 0) * upp));
          const baselineUnits = s.packsOnly
            ? Math.max(1, Number(s.baselinePacks || s.packs || 1))
            : Math.max(upp, (Number(s.baselinePacks) > 0 ? Number(s.baselinePacks) * upp : Number(s.packs || 0) * upp));
          return baselineUnits > 0 && (currentUnits / baselineUnits) < 0.2;
        });
      },
    });

    safeRegDS({
      name: 'scorte-scadenza',
      fetch: ({ entroGiorni = 10 } = {}) => (stock || []).filter((s) => isExpiringSoon(s, entroGiorni)),
    });

    safeRegDS({
      name: 'scorte-giorni-esaurimento',
      fetch: () => {
        const out = [];
        for (const s of stock || []) {
          const upp = Math.max(1, Number(s.unitsPerPack || 1));
          const currentUnits = s.packsOnly
            ? Math.max(0, Number(s.packs || 0))
            : (Number.isFinite(Number(s.residueUnits)) ? Math.max(0, Number(s.residueUnits)) : Math.max(0, Number(s.packs || 0) * upp));
          const day = Number(s.avgDailyUnits || 0);
          const days = day > 0 ? Math.ceil(currentUnits / day) : null;
          out.push({
            name: s.name,
            brand: s.brand || '',
            unitLabel: s.unitLabel || 'unità',
            residueUnits: currentUnits,
            avgDailyUnits: day,
            daysToDepletion: days,
          });
        }
        return out;
      },
    });
  }, [stock, lists]);

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
    if (saved.imagesIndex && typeof saved.imagesIndex === 'object') {
      setImagesIndex(saved.imagesIndex);
    }
  }, []);

  /* =================== Autosave debounce (locale) =================== */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    const snapshot = { lists, stock, currentList, imagesIndex };
    persistTimerRef.current = setTimeout(() => { persistNow(snapshot); }, 300);
    return () => clearTimeout(persistTimerRef.current);
  }, [lists, stock, currentList, imagesIndex]);

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
      setImagesIndex(saved.imagesIndex && typeof saved.imagesIndex === 'object' ? saved.imagesIndex : {});
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /* =================== Derivati: critici =================== */
  useEffect(() => {
    const crit = stock.filter(p => {
      const current = residueUnitsOf(p);
      const baseline = baselineUnitsOf(p);
      const pct = baseline ? (current / baseline) : 1;
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

 /* ====================== Helpers immagini/Blob – UNICA COPIA ====================== */
function isBlobish(v){ 
  try { 
    return !!(v && typeof v==='object' && typeof v.type==='string' && typeof v.size==='number' && typeof v.arrayBuffer==='function' && typeof v.slice==='function'); 
  } catch { return false; } 
}
function dataUrlToBlob(dataUrl){ 
  try { 
    const [head, base64]=String(dataUrl||'').split(','); 
    const m=head.match(/data:(.*?);base64/i); 
    const mime=m?m[1]:'application/octet-stream'; 
    const bin=atob(base64||''); 
    const u8=new Uint8Array(bin.length); 
    for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); 
    return new Blob([u8],{type:mime}); 
  } catch { return null; } 
}
function guessExt(mime=''){ 
  const m=(mime||'').toLowerCase(); 
  if(m.includes('pdf'))return'pdf'; 
  if(m.includes('png'))return'png'; 
  if(m.includes('jpeg')||m.includes('jpg'))return'jpg'; 
  if(m.includes('webp'))return'webp'; 
  if(m.includes('heic'))return'heic'; 
  return'bin'; 
}
async function collectImageBlobs(input){
  const list = Array.from(input || []); 
  const out=[];
  for (const f of list){
    if (isBlobish(f)){ out.push({ blob:f, name:f.name || `upload.${guessExt(f.type)}` }); continue; }
    if (typeof f === 'string'){
      if (f.startsWith('data:')){ const b=dataUrlToBlob(f); if (b) out.push({ blob:b, name:`upload.${guessExt(b.type)}` }); continue; }
      if (/^(blob:|https?:)/i.test(f)){ try { const resp=await fetch(f); const b=await resp.blob(); out.push({ blob:b, name:`upload.${guessExt(b.type)}` }); } catch {} continue; }
    }
    if (f && typeof f === 'object'){
      const maybe=f.file || f.blob;
      if (isBlobish(maybe)){ out.push({ blob:maybe, name:f.name || `upload.${guessExt(maybe.type)}` }); continue; }
      const url=f.preview || f.uri || f.url;
      if (typeof url === 'string' && /^(data:|blob:|https?:)/i.test(url)){
        try {
          if (url.startsWith('data:')){ const b=dataUrlToBlob(url); if (b) out.push({ blob:b, name:`upload.${guessExt(b.type)}` }); }
          else { const resp=await fetch(url); const b=await resp.blob(); out.push({ blob:b, name:`upload.${guessExt(b.type)}` }); }
        } catch {}
      }
    }
  }
  return out;
}

/* ====================== Prompt builder OCR Riga ====================== */
function buildUnifiedRowPrompt(ocrText, { name = '', brand = '' } = {}) {
  return [
    'Sei Jarvis. Hai OCR di una ETICHETTA/PRODOTTO o porzione di scontrino riferita a UNA SOLA VOCE.',
    'RISPONDI SOLO JSON con schema esatto:',
    '{ "name":"", "brand":"", "packs":0, "unitsPerPack":0, "unitLabel":"", "expiresAt":"" }',
    '',
    `Vincoli: se possibile mantieni name≈"${name}" e brand≈"${brand}"`,
    '- Estrai quantità come: packs, unitsPerPack, unitLabel',
    '- Se non deduci packs/unitsPerPack lascia 0 e unitLabel ""',
    '- Scadenza in formato YYYY-MM-DD se presente',
    '',
    '--- TESTO OCR INIZIO ---',
    ocrText,
    '--- TESTO OCR FINE ---'
  ].join('\n');
}

/* ====================== Decrementa liste da scontrino ====================== */
function decrementAcrossBothLists(prevLists, purchases) {
  const next = { ...prevLists };

  const decList = (listKey) => {
    const arr = [...(next[listKey] || [])];
    for (const p of purchases) {
      const dec = Math.max(1, Number(p.packs ?? p.qty ?? 1));
      const brand = (p.brand || '').trim();
      const upp = Number(p.unitsPerPack ?? 1);

      // match progressivo
      let idx = arr.findIndex(i =>
        isSimilar(i.name, p.name) &&
        (!brand || isSimilar(i.brand || '', brand)) &&
        Number(i.unitsPerPack || 1) === upp
      );
      if (idx < 0) idx = arr.findIndex(i => isSimilar(i.name, p.name) && (!brand || isSimilar(i.brand||'', brand)));
      if (idx < 0) idx = arr.findIndex(i => isSimilar(i.name, p.name));

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
/* ====================== OCR Scontrino/Busta → Aggiornamento scorte ====================== */
async function handleOCR(files) {
  if (!files) return;
  try {
    setBusy(true);

    // accetta SOLO FileList/Array<File> dall'input
    const toArray = (x) => Array.from(x || []);
    const isFileLike = (v) => {
      try {
        return !!(v && typeof v === 'object' &&
          typeof v.type === 'string' &&
          typeof v.size === 'number' &&
          typeof v.arrayBuffer === 'function' &&
          typeof v.slice === 'function');
      } catch { return false; }
    };

    const picked = [];
    for (const f of toArray(files)) if (isFileLike(f)) picked.push(f);
    if (!picked.length) throw new Error('Nessuna immagine valida selezionata');

    // 1) OCR → testo (invio con ALIAS multipli per massima compatibilità)
    const fdOcr = new FormData();
    for (const f of picked) {
      const ext = (f.type || '').split('/')[1] || 'jpg';
      const name = f.name || `upload.${ext}`;
      fdOcr.append('images', f, name);
      fdOcr.append('files',  f, name);
      fdOcr.append('file',   f, name);
      fdOcr.append('image',  f, name);
    }

    let ocrText = '';
    try {
      const ocrAns = await fetchJSONStrict(API_OCR, { method: 'POST', body: fdOcr }, 45000);
      ocrText = String(ocrAns?.text || ocrAns?.data?.text || ocrAns?.data || '').trim();
    } catch (err) {
      showToast(`OCR errore: ${err.message}`, 'err');
      throw err; // interrompe il flusso in caso di 400/500 OCR
    }
    // TAP & guard
try {
  if (typeof window !== 'undefined') window.__jarvisLastOCR = { len: ocrText.length, text: ocrText };
  console.info('[OCR len]', ocrText.length, 'preview:', ocrText.slice(0,300));
} catch {}
if (!ocrText) {
  throw new Error('OCR vuoto: controlla /api/ocr (env OPENAI_API_KEY, file multipart, content-type)');
}


    // -------- PARSER SCONTRINO (AI) --------
    let parsed = null;
    if (ocrText) {
      const promptTicket = buildOcrAssistantPrompt(ocrText, GROCERY_LEXICON);
      try {
        const r = await timeoutFetch(API_ASSISTANT_TEXT, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ prompt: promptTicket })
        }, 35000);
        const safe = await readJsonSafe(r);
        const answer = safe?.answer || safe?.data || safe;
        parsed = typeof answer === 'string'
          ? (() => { try { return JSON.parse(answer); } catch { return null; } })()
          : answer;
      } catch (e) {
        if (DEBUG) console.warn('[ASSISTANT ticket parse] fallito', e);
      }
    }

    // Meta da OCR grezzo (fallback per store/data)
    const meta = parseReceiptMeta(ocrText || '');
    let store = (parsed?.store || meta.store || '').trim();
    let purchaseDate = toISODate(parsed?.purchaseDate || meta.purchaseDate || '');

    // Righe acquisto parse AI
    let purchases = ensureArray(parsed?.purchases).map(p => ({
      name: String(p?.name||'').trim(),
      brand: String(p?.brand||'').trim(),
      packs: coerceNum(p?.packs),
      unitsPerPack: coerceNum(p?.unitsPerPack),
      unitLabel: normalizeUnitLabel(p?.unitLabel||''),
      priceEach: coerceNum(p?.priceEach),
      priceTotal: coerceNum(p?.priceTotal),
      currency: String(p?.currency||'').trim() || 'EUR',
      expiresAt: toISODate(p?.expiresAt || '')
    })).filter(p => p.name);

    // -------- PARSER "BUSTA/ETICHETTA" (AI) se scontrino vuoto --------
    if (!purchases.length) {
      const promptBag = buildOcrStockBagPrompt(ocrText || '(immagine senza testo)', GROCERY_LEXICON);
      try {
        const r2 = await timeoutFetch(API_ASSISTANT_TEXT, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ prompt: promptBag })
        }, 35000);
        const safe2 = await readJsonSafe(r2);
        const answer2 = safe2?.answer || safe2?.data || safe2;
        const parsed2 = typeof answer2 === 'string'
          ? (() => { try { return JSON.parse(answer2); } catch { return null; } })()
          : answer2;

        purchases = ensureArray(parsed2?.items).map(p => ({
          name: String(p?.name||'').trim(),
          brand: String(p?.brand||'').trim(),
          packs: coerceNum(p?.packs),
          unitsPerPack: coerceNum(p?.unitsPerPack),
          unitLabel: normalizeUnitLabel(p?.unitLabel||''),
          priceEach: 0, priceTotal: 0, currency: 'EUR',
          expiresAt: toISODate(p?.expiresAt || '')
        })).filter(p => p.name);
      } catch (e) {
        if (DEBUG) console.warn('[ASSISTANT bag parse] fallito', e);
      }
    }

    // -------- Fallback locale riga-per-riga --------
    if (!purchases.length && ocrText) {
      purchases = parseReceiptPurchases(ocrText).map(p => ({
        name: p.name, brand: p.brand || '',
        packs: p.packs || 0, unitsPerPack: p.unitsPerPack || 0,
        unitLabel: normalizeUnitLabel(p.unitLabel || ''),
        priceEach: 0, priceTotal: 0, currency: 'EUR', expiresAt: ''
      }));
      // ---- Super-fallback a lessico (ultimo tentativo) ----
if (!purchases.length && ocrText) {
  purchases = parseByLexicon(ocrText, GROCERY_LEXICON);
}

// Se ancora vuoto => esci senza fare finti aggiornamenti
if (!purchases.length) {
  showToast('Nessuna riga acquisto riconosciuta dallo scontrino', 'err');
  return; // il finally chiude busy e reset input
}

    }

    if (!purchases.length) {
      showToast('Nessuna riga acquisto riconosciuta dallo scontrino', 'err');
    }
if (!purchases.length) {
  showToast('Nessuna riga acquisto riconosciuta dallo scontrino', 'err');
  return; // <-- interrompe la funzione; il finally chiuderà busy
}
    // TAP console: cosa ha prodotto il parser
try {
  if (typeof window !== 'undefined') window.__jarvisPurchases = purchases;
  console.table((Array.isArray(purchases) ? purchases : []).map(p => ({
    name: p.name, brand: p.brand, packs: p.packs,
    upp: p.unitsPerPack, lbl: p.unitLabel, desc: p._desc
  })));
} catch {}

// Early exit se davvero vuoto (evita finto "completato")
if (!Array.isArray(purchases) || purchases.length === 0) {
  showToast('Nessuna riga acquisto riconosciuta dallo scontrino', 'err');
  return;
}
// Rimuovi righe non-merce (shopper, busta, cauzioni, vuoti, ecc.)
const DISCARD_RE = /\b(shopper|sacchetto|busta|cauzione|vuoto)\b/i;
purchases = (Array.isArray(purchases) ? purchases : []).filter(
  p => p && p.name && !DISCARD_RE.test(String(p.name))
);

    // 2) Decrementa le LISTE acquisti
    if (purchases.length) {
      setLists(prev => decrementAcrossBothLists(prev, purchases));
    }
    

    // 3) Aggiorna SCORTE (flag rosso se mancano quantità)
setStock(prev => {
  const arr = [...prev];
  const todayISO = new Date().toISOString().slice(0,10);

  for (const p of purchases) {
    const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
    const packs = coerceNum(p.packs);
    const upp   = coerceNum(p.unitsPerPack);
    const hasCounts = packs > 0 || upp > 0;

    if (idx >= 0) {
      const old = arr[idx];
      if (hasCounts) {
        const newPacks = Math.max(0, Number(old.packs || 0) + (packs || 0));
        const nextUpp  = Math.max(1, Number(old.unitsPerPack || upp || 1));
        arr[idx] = {
          ...old,
          packs: newPacks,
          unitsPerPack: nextUpp,
          unitLabel: old.unitLabel || p.unitLabel || 'unità',
          expiresAt: p.expiresAt || old.expiresAt || '',
          packsOnly: false,
          needsUpdate: false,
          ...restockTouch(newPacks, todayISO, nextUpp)
        };
      } else {
        // ✅ Nessuna quantità dall’OCR: se attivo, aggiungi 1 conf. di default
        if (DEFAULT_PACKS_IF_MISSING) {
          const uppOld   = Math.max(1, Number(old.unitsPerPack || 1));
          const newPacks = Math.max(0, Number(old.packs || 0) + 1);
          arr[idx] = {
            ...old,
            packs: newPacks,
            unitsPerPack: uppOld,
            unitLabel: old.unitLabel || 'unità',
            packsOnly: false,
            needsUpdate: false,
            ...restockTouch(newPacks, todayISO, uppOld)
          };
        } else {
          arr[idx] = { ...old, needsUpdate: true };
        }
      }
    } else {
      if (hasCounts) {
        const u = Math.max(1, upp || 1);
        const row = {
          name: p.name, brand: p.brand || '',
          packs: Math.max(0, packs || 1),
          unitsPerPack: u, unitLabel: p.unitLabel || 'unità',
          expiresAt: p.expiresAt || '',
          baselinePacks: Math.max(0, packs || 1),
          lastRestockAt: todayISO, avgDailyUnits: 0,
          residueUnits: Math.max(0, (packs || 1) * u),
          packsOnly: false, needsUpdate: false
        };
        arr.unshift(withRememberedImage(row, imagesIndex));
      } else {
        // ✅ Nuova riga senza quantità: se attivo, crea con 1 conf. di default
        if (DEFAULT_PACKS_IF_MISSING) {
          const row = {
            name: p.name, brand: p.brand || '',
            packs: 1, unitsPerPack: 1, unitLabel: 'unità',
            expiresAt: p.expiresAt || '',
            baselinePacks: 1,
            lastRestockAt: todayISO, avgDailyUnits: 0,
            residueUnits: 1,
            packsOnly: false, needsUpdate: false
          };
          arr.unshift(withRememberedImage(row, imagesIndex));
        } else {
          const row = {
            name: p.name, brand: p.brand || '',
            packs: 0, unitsPerPack: 1, unitLabel: '-',
            expiresAt: p.expiresAt || '',
            baselinePacks: 0, lastRestockAt: '',
            avgDailyUnits: 0, residueUnits: 0,
            packsOnly: true, needsUpdate: true
          };
          arr.unshift(withRememberedImage(row, imagesIndex));
        }
      }
    }
  }
  return arr;
});

  // 4) FINANZE + SUCCESS TOAST — non inviare se non ci sono items
const hasPurchases = Array.isArray(purchases) && purchases.length > 0;
let financesOk = true;

if (hasPurchases) {
  try {
    const itemsSafe = purchases.map(p => ({
      name: p.name,
      brand: p.brand || '',
      packs: Number.isFinite(p.packs) ? p.packs : 0,
      unitsPerPack: Number.isFinite(p.unitsPerPack) ? p.unitsPerPack : 0,
      unitLabel: p.unitLabel || '',
      priceEach: Number.isFinite(p.priceEach) ? p.priceEach : 0,
      priceTotal: Number.isFinite(p.priceTotal) ? p.priceTotal : 0,
      currency: p.currency || 'EUR',
      expiresAt: p.expiresAt || ''
    }));

    const payload = {
      ...(userIdRef.current ? { user_id: userIdRef.current } : {}),
      ...(store ? { store } : {}),
      ...(purchaseDate ? { purchaseDate } : {}),
      payment_method: 'cash',
      card_label: null,
      items: itemsSafe
    };

    const r = await fetchJSONStrict(API_FINANCES_INGEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 30000);

    if (DEBUG) console.log('[FINANCES_INGEST OK]', r);
  } catch (e) {
    financesOk = false;
    console.warn('[FINANCES_INGEST] fail', e);
    showToast(`Finanze: ${e.message}`, 'err');
  }
} else {
  if (DEBUG) console.log('[FINANCES_INGEST] SKIP — no items');
}

// ✅ SUCCESS solo se davvero abbiamo aggiornato e Finanze non è fallito
if (hasPurchases && financesOk) {
  showToast('OCR scorte completato ✓', 'ok');
}
} catch (e) {
  console.error('[OCR scorte] error', e);
  showToast(`Errore OCR scorte: ${e?.message || e}`, 'err');
} finally {
  setBusy(false);
  if (ocrInputRef.current) ocrInputRef.current.value = '';
}
} // <-- FINE handleOCR

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
      residueUnits: row.packsOnly ? String(Number(row.packs||0)) : (row.residueUnits ?? initRU),
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
      name: '', brand: '', packs: '0', unitsPerPack: '1', unitLabel: 'unità', expiresAt: '', residueUnits: '0', _ruTouched:false
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
      const wasUnits = old.packsOnly ? Number(old.packs||0) : Number(old.packs || 0) * uppOld;
      const nowUnits = newPacks * unitsPerPack;
      const restock = nowUnits > wasUnits;

      let ru = residueUnitsOf(old);
      const ruTouched = Object.prototype.hasOwnProperty.call(editDraft, '_ruTouched') ? !!editDraft._ruTouched : false;
      if (ruTouched) {
        const ruRaw = Number(String(editDraft.residueUnits ?? '').replace(',','.'));
        if (Number.isFinite(ruRaw)) ru = Math.max(0, ruRaw);
      }
      const fullNow = Math.max(unitsPerPack, nowUnits);
      if (!old.packsOnly) ru = Math.min(ru, fullNow);

      const avgDailyUnits = computeNewAvgDailyUnits(old, newPacks);

      let next = {
        ...old,
        name, brand,
        packs: newPacks,
        unitsPerPack, unitLabel,
        expiresAt,
        avgDailyUnits,
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
  function applyDeltaToStock(index, { setUnits }) {
    setStock(prev => {
      const arr = [...prev];
      const row = arr[index];
      if (!row) return prev;
      if (row.packsOnly) {
        const baselinePacks = Math.max(1, Number(row.baselinePacks || row.packs || 1));
        const clampedP = Math.max(0, Math.min(Number(setUnits || 0), baselinePacks));
        arr[index] = { ...row, packs: clampedP };
        return arr;
      }
      const baseline = baselineUnitsOf(row) || Math.max(1, Number(row.unitsPerPack || 1));
      const clamped = Math.max(0, Math.min(Number(setUnits || 0), baseline));
      arr[index] = { ...row, residueUnits: clamped, packsOnly:false };
      return arr;
    });
  }
  function deleteStockRow(index){
  setStock(prev => prev.filter((_, i) => i !== index));
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
        const updated = { ...arr[idx], image: dataUrl };
        arr[idx] = updated;

        // salva in indice immagini
        const key = productKey(updated.name, updated.brand || '');
        setImagesIndex(prevIdx => ({ ...prevIdx, [key]: dataUrl }));

        return arr;
      });
      showToast('Immagine prodotto aggiornata ✓', 'ok');
    };
    reader.readAsDataURL(file);
  }

  /* =================== Vocale LISTA =================== */
  async function toggleRecList() {
    if (recBusy) { try { mediaRecRef.current?.stop(); } catch (e) {} return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => { if (e.data?.size) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop = processVoiceList;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch (e) {
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
      } catch (e) {}
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
    } catch (e) {
      alert('Errore nel riconoscimento vocale');
    } finally {
      setRecBusy(false);
      setBusy(false);
      try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch (e) {}
      mediaRecRef.current = null;
      streamRef.current = null;
      recordedChunks.current = [];
    }
  }

  /* =================== Vocale UNIFICATO INVENTARIO =================== */
async function toggleVoiceInventory() {
  if (invRecBusy) { try { invMediaRef.current?.stop(); } catch(e) {} return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    invStreamRef.current = stream;

    const { mime, ext } = pickAudioMime();
    recMimeRef.current = { mime, ext };

    invMediaRef.current = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    invChunksRef.current = [];
    invMediaRef.current.ondataavailable = (e) => { if (e?.data && e.data.size) invChunksRef.current.push(e.data); };
    invMediaRef.current.onstop = processVoiceInventory;
    invMediaRef.current.start(500);
    setInvRecBusy(true);
  } catch (e) {
    alert('Microfono non disponibile');
  }
}

async function processVoiceInventory() {
  try {
    // Stop microfono e chiudi recorder
    try {
      const tracks = invStreamRef.current && invStreamRef.current.getTracks ? invStreamRef.current.getTracks() : [];
      tracks && tracks.forEach(t => t.stop());
    } catch (e) {}
    setInvRecBusy(false);

    // Nessun audio?
    if (!invChunksRef.current || invChunksRef.current.length === 0) {
      if (DEBUG) console.warn('[STT inventory] Nessun chunk audio');
      showToast('Nessun audio catturato', 'err');
      return;
    }

    // Blob audio con MIME corretto per il device
    const { mime, ext } = recMimeRef.current || { mime: 'audio/webm', ext: 'webm' };
    const blob = new Blob(invChunksRef.current, { type: mime || 'audio/webm' });
    invChunksRef.current = [];

    // Invio allo STT
    const fd = new FormData();
    fd.append('audio', blob, `inventory.${ext}`);

    setBusy(true);
    const res = await timeoutFetch('/api/stt', { method: 'POST', body: fd }, 25000);

    let payload = {};
    try { payload = await res.json(); } catch (e) {}
    if (!res.ok) {
      const msg = payload && payload.error ? `: ${payload.error}` : '';
      throw new Error(`STT HTTP ${res.status}${msg}`);
    }

    const text = String(payload && payload.text ? payload.text : '').trim();
    if (!text) throw new Error('Testo non riconosciuto');

    if (DEBUG) console.log('[STT inventory text]', text);

    // 1) Scadenze dal parlato
    const expPairs = parseExpiryPairs(text, GROCERY_LEXICON, stock.map(s => s.name));

    // 2) Aggiornamenti quantità (parser vocale)
    const updates = parseStockUpdateText(text);
    const todayISO = new Date().toISOString().slice(0, 10);

    // "SET assoluto" globale se il testo contiene parole chiave (sono / restano / ci sono ancora / ecc.)
    const absoluteGlobal =
      wantsAbsoluteSet(text) ||
      (typeof hasAbsoluteKeywords === 'function'
        ? hasAbsoluteKeywords(text)
        : /\b(sono|resta(?:no)?|rimane(?:no)?|rimangono|rimasto|rimasti|rimaste|ci\s+sono\s+ancora|ancora)\b/i.test(normKey(text)));

    // Applica scadenze
    if (expPairs.length) {
      setStock(prev => {
        const arr = [...prev];
        for (const ex of expPairs) {
          const i = arr.findIndex(s => isSimilar(s.name, ex.name));
          if (i >= 0) {
            arr[i] = { ...arr[i], expiresAt: ex.expiresAt };
          } else {
            arr.unshift(withRememberedImage({
              name: ex.name, brand: '', packs: 0, unitsPerPack: 1, unitLabel: 'unità',
              expiresAt: ex.expiresAt, baselinePacks: 0, lastRestockAt: '', avgDailyUnits: 0, residueUnits: 0, packsOnly: false
            }, imagesIndex));
          }
        }
        return arr;
      });
    }

    // Helper per modalità "solo confezioni"
    const makePacksOnly = (base) => ({
      ...base,
      unitsPerPack: 1,
      unitLabel: 'conf.',
      packsOnly: true,
      residueUnits: Math.max(0, Number(base.packs || 0)), // barra sui pacchi
    });

    // Applica quantità (pacchi / unità) con normalizzazione finale per gli aggiornamenti a unità
    if (updates.length) {
      setStock(prev => {
        const arr = [...prev];

        // ⬅ traccia di quali prodotti sono stati aggiornati a UNITÀ (per normalizzare a fine ciclo)
        const unitsUpdated = new Set();

        for (const u of updates) {
          const j = arr.findIndex(s => isSimilar(s.name, u.name));
          const abs = (u && u.forceSet === true) ? true : absoluteGlobal; // SET per-chunk o globale

          if (j < 0) {
            // Crea riga nuova
            if (u.mode === 'packs') {
              const packs = Math.max(0, Number(u.value || u._packs || 0));
              if (u.explicit && u._upp > 1) {
                const up = Math.max(1, Number(u._upp || 1));
                const row = {
                  name: u.name, brand: '', packs,
                  unitsPerPack: up, unitLabel: 'unità',
                  expiresAt: '', ...restockTouch(packs, todayISO, up), avgDailyUnits: 0, packsOnly: false
                };
                arr.unshift(withRememberedImage(row, imagesIndex));
              } else {
                const row = makePacksOnly({
                  name: u.name, brand: '', packs,
                  expiresAt: '', ...restockTouch(packs, todayISO, 1), avgDailyUnits: 0
                });
                arr.unshift(withRememberedImage(row, imagesIndex));
              }
            } else {
              // mode: 'units' → imposta residuo unità
              const units = Math.max(0, Number(u.value || 1));
              const base = {
                name: u.name, brand: '', packs: 1,
                unitsPerPack: 1, unitLabel: 'unità',
                expiresAt: '', baselinePacks: 1, lastRestockAt: todayISO, avgDailyUnits: 0,
                residueUnits: units, packsOnly: false
              };
              arr.unshift(withRememberedImage(base, imagesIndex));
              unitsUpdated.add(normKey(u.name));
            }
            continue;
          }

          // Aggiorna riga esistente
          const old = arr[j];

          if (u.op === 'restockExplicit' || u.mode === 'packs') {
            // Aggiornamento a pacchi
            const uppFromVoice = Math.max(1, Number(u._upp || 1));
            const packsNew = abs
              ? Math.max(0, Number(u.value || u._packs || 0))                          // SET
              : Math.max(0, Number(old.packs || 0) + Number(u.value || u._packs || 0)); // SOMMA

            if (u.explicit && uppFromVoice > 1) {
              // Pacchi + UPP noti → reset pieno
              arr[j] = {
                ...old,
                packs: packsNew,
                unitsPerPack: uppFromVoice,
                unitLabel: old.unitLabel || 'unità',
                packsOnly: false,
                ...restockTouch(packsNew, todayISO, uppFromVoice)
              };
            } else {
              // Solo pacchi → packsOnly
              arr[j] = makePacksOnly({
                ...old,
                packs: packsNew,
                ...restockTouch(packsNew, todayISO, 1)
              });
            }
          } else {
            // Aggiornamento a unità → residuo unità (ricalcolo confezioni dopo il loop)
            const upp = Math.max(1, Number(old.unitsPerPack || 1));
            const baseline = baselineUnitsOf(old) || upp;
            const current = residueUnitsOf(old);
            const targetUnits = abs
              ? Math.max(0, Math.min(Number(u.value || 0), baseline))                   // SET
              : Math.max(0, Math.min(current + Number(u.value || 0), baseline));        // SOMMA

            arr[j] = { ...old, packsOnly: false, residueUnits: targetUnits };
            unitsUpdated.add(normKey(u.name));
          }
        }

        // ⬅ NORMALIZZAZIONE FINALE:
        // per ogni prodotto aggiornato a UNITÀ, ricalcola "packs" da residueUnits se UPP è noto.
        if (unitsUpdated.size > 0) {
          for (let k = 0; k < arr.length; k++) {
            const row = arr[k];
            if (!row || !unitsUpdated.has(normKey(row.name))) continue;

            const upp = Math.max(1, Number(row.unitsPerPack || 1));
            if (upp > 1 && Number.isFinite(Number(row.residueUnits))) {
              const ruInt = Math.max(0, Math.round(Number(row.residueUnits)));
              // packs = 0 se RU=0; se RU multiplo intero di UPP → RU/UPP; altrimenti 1
              const newPacks =
                ruInt === 0 ? 0 :
                (ruInt % upp === 0 ? Math.max(1, ruInt / upp) : 1);

              if (newPacks !== Number(row.packs || 0)) {
                arr[k] = { ...row, packs: newPacks };
              }
            }
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
    showToast(`Errore vocale inventario: ${e && e.message ? e.message : String(e)}`, 'err');
  } finally {
    setBusy(false);
    invMediaRef.current = null;
    invStreamRef.current = null;
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
                try { localStorage.removeItem(LS_KEY); } catch (e) {}
                setLists({ [LIST_TYPES.SUPERMARKET]: [], [LIST_TYPES.ONLINE]: [] });
                setStock([]);
                setCurrentList(LIST_TYPES.SUPERMARKET);
                setImagesIndex({});
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
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
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
                        ...styles.listCardRed,
                        ...(isBought ? styles.listCardRedBought : null)
                      }}
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

                      <div style={styles.rowActions} onClick={e => e.stopPropagation()}>
                        {/* ✓ conferma: scala 1 conf. e aggiorna scorte */}
                        <button
                          title="Segna come comprato (–1 conf. e aggiorna scorte)"
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
                              const moveUPP = Math.max(1, Number(item.unitsPerPack || 1));
                              const moveLabel = item.unitLabel || 'unità';
                              if (idx >= 0) {
                                const old = arr[idx];
                                const upp = Math.max(1, Number(old.unitsPerPack || moveUPP));
                                const newPacks = Math.max(0, Number(old.packs || 0) + movePacks);
                                arr[idx] = { ...old, packs: newPacks, unitsPerPack: upp, unitLabel: old.unitLabel || moveLabel, packsOnly:false, ...restockTouch(newPacks, todayISO, upp) };
                              } else {
                                const row = {
                                  name: item.name, brand: item.brand || '',
                                  packs: movePacks, unitsPerPack: moveUPP, unitLabel: moveLabel,
                                  expiresAt: '', ...restockTouch(movePacks, todayISO, moveUPP), avgDailyUnits: 0, packsOnly:false
                                };
                                arr.unshift(withRememberedImage(row, imagesIndex));
                              }
                              return arr;
                            });
                          }}
                          style={{ ...styles.iconBtnBase, ...styles.iconBtnGreen }}
                        >✓</button>

                        <button title="–1" onClick={() => incQty(it.id, -1)} style={{ ...styles.iconBtnBase, ...styles.iconBtnDark }}>−</button>
                        <button title="+1" onClick={() => incQty(it.id, +1)} style={{ ...styles.iconBtnBase, ...styles.iconBtnDark }}>+</button>

                        <button
                          title="OCR riga (foto etichetta/scontrino — scadenza/quantità)"
                          onClick={() => { setTargetRowIdx(it.id); rowOcrInputRef.current?.click(); }}
                          style={styles.ocrPillBtn}
                        >OCR riga</button>

                        <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.trashBtn}>🗑</button>
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
                const unitsPerPack = Math.max(1, Number(String(stockForm.unitsPerPack).replace(',', '.')) || 1);
                const unitLabel = (stockForm.unitLabel || 'unità').trim() || 'unità';
                const ex = toISODate(stockForm.expiresAt || '');
                const todayISO = new Date().toISOString().slice(0,10);
                setStock(prev => {
                  const arr = [...prev];
                  const idx = arr.findIndex(s => isSimilar(s.name, name) && (!brand || isSimilar(s.brand||'', brand)));
                  if (idx >= 0) {
                    const old = arr[idx];
                    const newPacks = Number(old.packs || 0) + packs;
                    const upp = Math.max(1, Number(old.unitsPerPack || unitsPerPack));
                    arr[idx] = {
                      ...old,
                      packs: newPacks,
                      unitsPerPack: upp,
                      unitLabel: old.unitLabel || unitLabel,
                      expiresAt: ex || old.expiresAt || '',
                      packsOnly:false,
                      ...restockTouch(newPacks, todayISO, upp)
                    };
                  } else {
                    const row = {
                      name, brand,
                      packs, unitsPerPack, unitLabel,
                      expiresAt: ex || '',
                      baselinePacks: packs,
                      lastRestockAt: todayISO,
                      avgDailyUnits: 0,
                      residueUnits: packs * unitsPerPack,
                      image: '',
                      packsOnly:false
                    };
                    arr.unshift(withRememberedImage(row, imagesIndex));
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
                    arr.unshift(withRememberedImage({
                      name, brand:'', packs:0, unitsPerPack:1, unitLabel:'unità',
                      expiresAt: iso, baselinePacks:0, lastRestockAt:'', avgDailyUnits:0, residueUnits:0, packsOnly:false
                    }, imagesIndex));
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

  {/* Azione elimina */}
  <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:8 }}>
    <button
      title="Elimina definitivamente"
      onClick={() => {
        const idx = stock.findIndex(
          ss => isSimilar(ss.name, s.name) && ((ss.brand||'') === (s.brand||''))
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
                              {/* Campo edit residuo unità / o pacchi se packsOnly */}
                              <input style={{...styles.input, width:190}} inputMode="decimal" value={editDraft.residueUnits}
                                     onChange={e=>handleEditDraftChange('residueUnits', e.target.value)} placeholder="Residuo unità o pacchi" />
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
                            {/* Riga: immagine | nome+barra | confezioni | unità/conf | residuo unità | azioni */}
                            <div style={styles.stockRow}>
                              {/* Colonna immagine */}
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

                              {/* Nome + barra */}
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
                                <div style={styles.kvValue}>{s.packsOnly ? '–' : Number(s.unitsPerPack || 1)}</div>
                              </div>

                              {/* Residuo unità */}
                              <div style={styles.kvCol}>
                                <div style={styles.kvLabel}>Residuo unità</div>
                                <div style={styles.kvValue}>{s.packsOnly ? '–' : Math.round(residueUnitsOf(s))}</div>
                              </div>

                              {/* Azioni riga */}
                            <div style={styles.rowActionsRight}>
  {/* Modifica (matita) */}
  <button
    title="Modifica"
    onClick={() => startRowEdit(idx, s)}
    style={{ ...styles.iconSquareBase }}
  >
    <Pencil size={18} />
  </button>

  {/* Elimina definitivamente (cestino) */}
  <button
    title="Elimina definitivamente"
    onClick={() => deleteStockRow(idx)}
    style={{ ...styles.iconSquareBase, ...styles.iconDanger }}
  >
    <Trash2 size={18} />
  </button>

  {/* OCR riga (fotocamera) */}
  <button
    title="OCR riga"
    onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }}
    style={{ ...styles.iconSquareBase }}
  >
    <Camera size={18} />
  </button>
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
                  packsOnly:false
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
                  packsOnly:false,
                  ...restockTouch(newPacks || old.packs || 0, todayISO, newUPP)
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
                  packsOnly:false
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

/* =================== Styles (identici) =================== */
const styles = {
  page: {
    minHeight:'100vh',
    background:'radial-gradient(1200px 1200px at 10% -10%, rgba(90,130,160,.25), transparent), radial-gradient(1200px 1200px at 110% 10%, rgba(60,110,140,.25), transparent), linear-gradient(180deg, #0b1520, #0e1b27 60%, #0b1520)',
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

  sectionLarge:{ marginTop:18, padding:12, borderRadius:14, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.05)' },
  sectionLifted:{ marginTop:18, padding:14, borderRadius:16, background:'rgba(0,0,0,.25)', border:'1px solid rgba(255,255,255,.08)', boxShadow:'0 6px 16px rgba(0,0,0,.35)' },
  sectionHeaderRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, gap:8 },

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

  // === NUOVI STILI PER LE ICONE ===
  iconSquareBase: {
    width: 38, height: 38, minWidth: 38,
    display: 'grid', placeItems: 'center',
    borderRadius: 12,
    border: '1px solid #4b5563',
    background: 'linear-gradient(180deg,#1f2937,#111827)',
    color: '#e5e7eb',
    boxShadow: '0 2px 8px rgba(0,0,0,.35)',
    cursor: 'pointer'
  },
  iconDanger: {
    color: '#f87171'
  }

}; // ⬅️ chiusura dell’oggetto styles
