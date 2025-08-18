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
function daysBetweenISO(fromISO, toISO){
  if (!fromISO || !toISO) return 0;
  const a = new Date(fromISO); const b = new Date(toISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86400000));
}
/** Residuo “vivo”: applica calo giornaliero dal momento dell’ultima misura/ancora */
function liveResidueUnits(s){
  const base = residueUnitsOf(s);
  const anchor = s.consumptionAnchorAt || s.lastRestockAt || '';
  const day = Number(s.avgDailyUnits || 0);
  if (!anchor || day <= 0) return base;
  const nowISO = new Date().toISOString().slice(0,10);
  const days = daysBetweenISO(anchor, nowISO);
  return Math.max(0, base - day * days);
}
/** Aggiorna media consumo partendo da una misura puntuale del residuo */
function updateAvgFromMeasurement(old, measuredUnits){
  const anchor = old.consumptionAnchorAt || old.lastRestockAt;
  if (!anchor) return Number(old.avgDailyUnits || 0);
  const baseline = baselineUnitsOf(old);
  const nowISO = new Date().toISOString().slice(0,10);
  const days = Math.max(1, daysBetweenISO(anchor, nowISO));
  const used = Math.max(0, baseline - Math.max(0, Number(measuredUnits || 0)));
  const day = used / days;
  const prev = Number(old.avgDailyUnits || 0);
  return prev ? (0.6*prev + 0.4*day) : day;
}

function residueInfo(s){
  const current  = liveResidueUnits(s);
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
function buildInventoryIntentPrompt(speechText, lexicon = [], knownProducts = []) {
  const LEX = Array.isArray(lexicon) && lexicon.length ? lexicon.join(', ') : 'latte, pane, pasta, uova, ...';
  const KNOWN = Array.isArray(knownProducts) && knownProducts.length ? knownProducts.join(', ') : '';
  return [
    'Sei Jarvis. Interpreta il parlato relativo a SCORTE di dispensa.',
    'Rispondi SOLO in JSON con uno di questi formati:',
    '',
    '{ "intent":"stock_update", "updates":[ { "name":"", "mode":"packs|units", "value":0, "unitsPerPack":1, "unitLabel":"unità" } ] }',
    '{ "intent":"expiry", "expiries":[ { "name":"", "expiresAt":"YYYY-MM-DD" } ] }',
    '{ "intent":"none" }',
    '',
    'REGOLE:',
    '- Se citi scadenze (es. "latte scade il 15/08/2025") → intent=expiry.',
    '- Se citi quantità (es. "due pacchi di pasta", "5 vasetti di yogurt") → intent=stock_update.',
    '- name: normalizza usando questo lessico come guida: ' + LEX,
    (KNOWN ? ('- Prodotti noti: ' + KNOWN) : ''),
    '- mode: "packs" se parli di confezioni, "units" se parli di pezzi/vasetti/bottiglie.',
    '- unitsPerPack: se deducibile (es. 6 bottiglie per confezione), altrimenti 1.',
    '- unitLabel: es. "unità", "bottiglie", "vasetti".',
    '',
    'TESTO:',
    speechText
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
    consumptionAnchorAt: lastDateISO, // l’ancora coincide con il riempimento
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

      // Carica stato dal cloud (se esiste). Se manca la colonna `state`, ignora.
      const { data: row, error } = await __supabase
        .from(CLOUD_TABLE)
        .select('state')
        .eq('user_id', uid)
        .maybeSingle();

      if (error) {
        // Gestione "column does not exist" (42703) o messaggio equivalente
        const msg = (error.message || '').toLowerCase();
        if (error.code === '42703' || msg.includes('column') && msg.includes('does not exist')) {
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
  const snapshot = { lists, stock, currentList };

  cloudTimerRef.current = setTimeout(async () => {
    try {
      await __supabase
        .from(CLOUD_TABLE)
        .upsert(
          { user_id: userIdRef.current, state: snapshot },
          { onConflict: 'user_id' }
        );
    } catch (e) {
      // Se la colonna non esiste, ignora senza interrompere l’app
      const msg = (e?.message || '').toLowerCase?.() || '';
      if (DEBUG && !(msg.includes('column') && msg.includes('does not exist'))) {
        console.warn('[cloud upsert] fail', e);
      }
    }
  }, 400);

  return () => clearTimeout(cloudTimerRef.current);
}, [lists, stock, currentList]);

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

  // Crea (o sostituisce) un hub valido se quello esistente è corrotto/incompatibile
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

  // Usa registrazioni idempotenti per evitare duplicati se la pagina si rimonta
  const safeRegDS = (def) => {
    if (!hub._datasources.has(def.name)) hub.registerDataSource(def);
  };

  safeRegDS({
    name: 'scorte-complete',
    fetch: () => {
      return (stock || []).map((s) => {
        const upp = Math.max(1, Number(s.unitsPerPack || 1));
        const residueUnits = liveResidueUnits(s);
        const baselineUnits = Math.max(
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
        const currentUnits = liveResidueUnits(s);
        const bp = Number(s.baselinePacks);
        const baselineUnits = Math.max(upp, (Number.isFinite(bp) && bp > 0 ? bp * upp : Number(s.packs || 0) * upp));
        return baselineUnits > 0 && currentUnits / baselineUnits < 0.2;
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
        const currentUnits = liveResidueUnits(s);
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

  safeRegDS({
    name: 'liste-spesa',
    fetch: () => {
      const data = lists || {};
      return Object.entries(data).flatMap(([type, items]) =>
        (items || [])
          .filter((it) => !it.purchased && it.qty > 0)
          .map((it) => ({
            listType: type,
            name: String(it.name || '').trim(),
            brand: String(it.brand || '').trim(),
            qty: Number(it.qty || 0),
            unitsPerPack: Number(it.unitsPerPack || 1),
            unitLabel: String(it.unitLabel || 'unità').trim(),
          }))
      );
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
      const currentUnits = liveResidueUnits(p);
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
                residueUnits: pack.packs * (pack.unitsPerPack || 1),
                consumptionAnchorAt: todayISO,
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
      residueUnits: row.residueUnits ?? initRU,
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
      const wasUnits = Number(old.packs || 0) * uppOld;
      const nowUnits = newPacks * unitsPerPack;
      const restock = nowUnits > wasUnits;

      let ru = residueUnitsOf(old);
      const ruTouched = Object.prototype.hasOwnProperty.call(editDraft, '_ruTouched') ? !!editDraft._ruTouched : false;
      let avgDailyUnits = old.avgDailyUnits || 0;

      if (ruTouched) {
        const ruRaw = Number(String(editDraft.residueUnits ?? '').replace(',','.'));
        if (Number.isFinite(ruRaw)) {
          ru = Math.max(0, ruRaw);
          // nuova misura → aggiorno media
          avgDailyUnits = updateAvgFromMeasurement(old, ru);
        }
      }
      const fullNow = Math.max(unitsPerPack, nowUnits);
      ru = Math.min(ru, fullNow);

      // se è restock, aggiorna media con computeNewAvgDailyUnits
      if (restock) {
        avgDailyUnits = computeNewAvgDailyUnits(old, newPacks);
      }

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
      } else if (ruTouched) {
        next.residueUnits = ru;
        next.consumptionAnchorAt = todayISO; // riparti da questa lettura
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
      const measured = Math.max(0, Math.min(Number(setUnits || 0), baseline));
      const avg = updateAvgFromMeasurement(row, measured);
      const todayISO = new Date().toISOString().slice(0,10);
      arr[index] = { ...row, residueUnits: measured, avgDailyUnits: avg, consumptionAnchorAt: todayISO };
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

  /* =================== Vocale UNIFICATO INVENTARIO =================== */
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
              const avg = computeNewAvgDailyUnits(old, newPacks);
              arr[j] = {
                ...old,
                packs: newPacks,
                unitsPerPack: up,
                avgDailyUnits: avg,
                ...restockTouch(newPacks, todayISO, up)
              };
            } else {
              // units → residueUnits (impostazione residuo o incremento residuo)
              const upp = Math.max(1, Number(old.unitsPerPack || u._upp || 1));
              const baseline = baselineUnitsOf(old) || upp;
              const targetUnits = absolute
                ? Math.max(0, Math.min(Number(u.value||0), baseline))
                : Math.max(0, Math.min(residueUnitsOf(old) + Number(u.value||0), baseline));
              const avg = updateAvgFromMeasurement(old, targetUnits);
              arr[j] = { ...old, residueUnits: targetUnits, avgDailyUnits: avg, consumptionAnchorAt: todayISO };
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
                                const avg = computeNewAvgDailyUnits(old, newPacks);
                                arr[idx] = { ...old, packs: newPacks, unitsPerPack: upp, unitLabel: old.unitLabel || moveLabel, avgDailyUnits: avg, ...restockTouch(newPacks, todayISO, upp) };
                              } else {
                                arr.unshift({
                                  name: item.name, brand: item.brand || '',
                                  packs: movePacks, unitsPerPack: moveUPP, unitLabel: moveLabel,
                                  expiresAt: '', avgDailyUnits: 0, ...restockTouch(movePacks, todayISO, moveUPP)
                                });
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
                                        const avg = computeNewAvgDailyUnits(old, newPacks);
                    arr[idx] = {
                      ...old,
                      packs: newPacks,
                      unitsPerPack: Math.max(1, Number(old.unitsPerPack || unitsPerPack)),
                      unitLabel: old.unitLabel || unitLabel,
                      expiresAt: ex || old.expiresAt || '',
                      avgDailyUnits: avg,
                      ...restockTouch(newPacks, todayISO, Math.max(1, Number(old.unitsPerPack || unitsPerPack))),
                    };
                  } else {
                    arr.unshift({
                      name, brand,
                      packs,
                      unitsPerPack,
                      unitLabel,
                      expiresAt: ex,
                      avgDailyUnits: 0,
                      ...restockTouch(packs, todayISO, unitsPerPack),
                    });
                  }
                  return arr;
                });
                setShowStockForm(false);
                setStockForm({ name:'', brand:'', packs:'1', unitsPerPack:'1', unitLabel:'unità', expiresAt:'' });
                showToast('Scorta aggiunta/aggiornata ✓', 'ok');
              }} style={{ display:'grid', gap:8, gridTemplateColumns:'repeat(6, minmax(0, 1fr))', alignItems:'center' }}>
                <input placeholder="Prodotto" value={stockForm.name} onChange={e=>setStockForm(s=>({...s, name:e.target.value}))} style={styles.input} required />
                <input placeholder="Marca" value={stockForm.brand} onChange={e=>setStockForm(s=>({...s, brand:e.target.value}))} style={styles.input} />
                <input placeholder="Confezioni" inputMode="decimal" value={stockForm.packs} onChange={e=>setStockForm(s=>({...s, packs:e.target.value}))} style={styles.input} />
                <input placeholder="Unità/conf." inputMode="decimal" value={stockForm.unitsPerPack} onChange={e=>setStockForm(s=>({...s, unitsPerPack:e.target.value}))} style={styles.input} />
                <input placeholder="Etichetta (es. bottiglie)" value={stockForm.unitLabel} onChange={e=>setStockForm(s=>({...s, unitLabel:e.target.value}))} style={styles.input} />
                <input placeholder="Scadenza (YYYY-MM-DD o 15/08/2025)" value={stockForm.expiresAt} onChange={e=>setStockForm(s=>({...s, expiresAt:e.target.value}))} style={styles.input} />
                <div style={{ gridColumn:'1 / -1', display:'flex', gap:8 }}>
                  <button className="btn" style={styles.primaryBtn}>Salva scorta</button>
                  <button type="button" onClick={()=>setShowStockForm(false)} style={styles.actionGhost}>Annulla</button>
                </div>
              </form>
            )}

            {/* Form scadenze manuali */}
            {showExpiryForm && (
              <form onSubmit={(e)=>{ e.preventDefault();
                const nm = (expiryForm.name||'').trim(); if(!nm) return;
                const ex = toISODate(expiryForm.expiresAt||''); if(!ex){ showToast('Data non valida', 'err'); return; }
                setStock(prev=>{
                  const arr=[...prev];
                  const i = arr.findIndex(s=>isSimilar(s.name, nm));
                  if(i>=0) arr[i] = { ...arr[i], expiresAt: ex };
                  else arr.unshift({ name:nm, brand:'', packs:0, unitsPerPack:1, unitLabel:'unità', expiresAt:ex, baselinePacks:0, lastRestockAt:'', avgDailyUnits:0, residueUnits:0 });
                  return arr;
                });
                setExpiryForm({ name:'', expiresAt:'' });
                setShowExpiryForm(false);
                showToast('Scadenza impostata ✓', 'ok');
              }} style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
                <input placeholder="Prodotto" value={expiryForm.name} onChange={e=>setExpiryForm(s=>({...s, name:e.target.value}))} style={styles.input} required />
                <input placeholder="Scadenza (YYYY-MM-DD o 15/08/2025)" value={expiryForm.expiresAt} onChange={e=>setExpiryForm(s=>({...s, expiresAt:e.target.value}))} style={styles.input} required />
                <button style={styles.primaryBtn}>Salva scadenza</button>
                <button type="button" onClick={()=>setShowExpiryForm(false)} style={styles.actionGhost}>Annulla</button>
              </form>
            )}

            {/* Elenco scorte */}
            {(stock||[]).length === 0 ? (
              <p style={{ opacity:.8, marginTop:8 }}>Nessuna scorta registrata.</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:10 }}>
                {stock.map((s, idx) => {
                  const { current, baseline, pct } = residueInfo(s);
                  const soon = isExpiringSoon(s, 10);
                  return (
                    <div key={`${s.name}-${idx}`} style={styles.stockRow}>
                      <div style={{ display:'flex', gap:12, alignItems:'center', flex:1 }}>
                        <img src={s.image || '/img/placeholder.svg'} alt="" width={48} height={48} style={styles.stockImage} />
                        <div style={styles.stockColLeft}>
                          <div style={styles.stockName}>
                            {s.name}
                            {s.brand ? <span style={styles.stockBrand}> · {s.brand}</span> : null}
                          </div>
                          <div style={styles.stockMeta}>
                            {s.packs} conf · {s.unitsPerPack} {s.unitLabel} /conf · residuo stimato {Math.round(current)} / {Math.max(1, Math.round(baseline))} {s.unitLabel}
                            {s.expiresAt ? (
                              <span style={{ ...styles.statusPill, marginLeft:8, background: soon ? '#ef4444' : '#334155' }}>
                                {soon ? '⚠︎' : '🗓'} Scade: {s.expiresAt}
                              </span>
                            ) : null}
                          </div>
                          <div style={styles.meterTrack}>
                            <div style={{ ...styles.meterFill, width: `${Math.round(clamp01(pct)*100)}%`, background: colorForPct(pct) }} />
                          </div>
                        </div>
                      </div>

                      {/* Azioni riga scorte */}
                      {editingRow === idx ? (
                        <div style={styles.editRow}>
                          <input value={editDraft.name} onChange={e=>handleEditDraftChange('name', e.target.value)} placeholder="Prodotto" style={styles.editInput} />
                          <input value={editDraft.brand} onChange={e=>handleEditDraftChange('brand', e.target.value)} placeholder="Marca" style={styles.editInput} />
                          <input value={editDraft.packs} onChange={e=>handleEditDraftChange('packs', e.target.value)} placeholder="Confezioni" inputMode="decimal" style={styles.editInput} />
                          <input value={editDraft.unitsPerPack} onChange={e=>handleEditDraftChange('unitsPerPack', e.target.value)} placeholder="Unità/conf." inputMode="decimal" style={styles.editInput} />
                          <input value={editDraft.unitLabel} onChange={e=>handleEditDraftChange('unitLabel', e.target.value)} placeholder="Etichetta" style={styles.editInput} />
                          <input value={editDraft.expiresAt} onChange={e=>handleEditDraftChange('expiresAt', e.target.value)} placeholder="YYYY-MM-DD o 15/08/2025" style={styles.editInput} />
                          <input value={editDraft.residueUnits} onChange={e=>handleEditDraftChange('residueUnits', e.target.value)} placeholder="Residuo unità (misurato)" inputMode="decimal" style={styles.editInput} />

                          <div style={styles.editActions}>
                            <button onClick={()=>saveRowEdit(idx)} style={styles.saveBtn}>Salva</button>
                            <button onClick={cancelRowEdit} style={styles.cancelBtn}>Annulla</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                          <button onClick={()=>startRowEdit(idx, s)} style={styles.editBtn}>✏️ Modifica</button>
                          <button onClick={()=>applyDeltaToStock(idx, { setUnits: Math.max(0, Math.round(current) - Math.max(1, Math.round((s.avgDailyUnits||0)))) })} style={styles.smallBtn} title="Scala una giornata">–1 giorno</button>
                          <button onClick={()=>applyDeltaToStock(idx, { setUnits: Math.min(Math.round(baseline), Math.round(current)+Math.max(1, Math.round((s.avgDailyUnits||0)))) })} style={styles.smallBtn} title="Aggiungi una giornata">+1 giorno</button>
                          <button onClick={()=>{ setTargetImageIdx(idx); rowImageInputRef.current?.click(); }} style={styles.smallBtn}>🖼️ Immagine</button>
                          <button onClick={()=>setStock(prev => prev.filter((_,i)=>i!==idx))} style={styles.dangerBtn}>Elimina</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sezione OCR riga lista (etichetta/scontrino) */}
          <input ref={rowOcrInputRef} type="file" accept="image/*" multiple hidden
            onChange={async (e) => {
              const files = Array.from(e.target.files||[]);
              e.target.value = '';
              const id = targetRowIdx;
              setTargetRowIdx(null);
              if (!id || !files.length) return;

              const item = (lists[currentList]||[]).find(x => x.id === id);
              if (!item) return;

              try {
                setBusy(true);
                const fdOcr = new FormData();
                files.forEach(f=>fdOcr.append('images', f));
                const ocrRes = await timeoutFetch(API_OCR, { method:'POST', body: fdOcr }, 40000);
                const ocrJson = await readJsonSafe(ocrRes);
                if (!ocrJson.ok) throw new Error(ocrJson.error || `HTTP ${ocrRes.status}`);
                const ocrText = String(ocrJson?.text || '').trim();

                const prompt = buildUnifiedRowPrompt(ocrText, { name:item.name, brand:item.brand });
                const r = await timeoutFetch(API_ASSISTANT_TEXT, {
                  method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt })
                }, 30000);
                const safe = await readJsonSafe(r);
                const answer = safe?.answer || safe?.data || safe;
                const parsed = typeof answer === 'string' ? (()=>{ try { return JSON.parse(answer);} catch { return null; } })() : answer;

                if (parsed && (parsed.name || parsed.expiresAt || parsed.unitsPerPack || parsed.packs)) {
                  // Aggiorna voce lista
                  setLists(prev=>{
                    const next={...prev};
                    next[currentList] = (prev[currentList]||[]).map(x=>{
                      if (x.id !== id) return x;
                      return {
                        ...x,
                        name: parsed.name || x.name,
                        brand: (parsed.brand ?? x.brand) || '',
                        unitsPerPack: Math.max(1, Number(parsed.unitsPerPack || x.unitsPerPack || 1)),
                        unitLabel: parsed.unitLabel || x.unitLabel || 'unità',
                        qty: Number.isFinite(Number(parsed.packs)) && Number(parsed.packs)>0 ? Number(parsed.packs) : x.qty,
                      };
                    });
                    return next;
                  });

                  // Se c'è scadenza, prova ad aggiornarla in scorte
                  if (parsed.expiresAt) {
                    const ex = toISODate(parsed.expiresAt);
                    if (ex) {
                      setStock(prev=>{
                        const arr=[...prev];
                        const j = arr.findIndex(s=>isSimilar(s.name, parsed.name||item.name));
                        if (j>=0) arr[j] = { ...arr[j], expiresAt: ex };
                        return arr;
                      });
                    }
                  }
                  showToast('Riga aggiornata da OCR ✓', 'ok');
                } else {
                  showToast('Nessun dato utile dalla foto', 'err');
                }
              } catch (e) {
                console.error('[row OCR] error', e);
                showToast('Errore OCR riga', 'err');
              } finally {
                setBusy(false);
              }
            }}
          />

          {/* Input OCR globale & immagine riga scorte */}
          <input ref={ocrInputRef} type="file" accept="image/*" multiple hidden onChange={(e)=>{ const f=[...e.target.files||[]]; e.target.value=''; handleOCR(f); }} />
          <input ref={rowImageInputRef} type="file" accept="image/*" hidden onChange={(e)=>{ const f=[...e.target.files||[]]; const i=targetImageIdx; setTargetImageIdx(null); if(f.length && Number.isFinite(i)) handleRowImage(f, i); }} />

          {/* Toast */}
          {toast && (
            <div style={{ ...styles.toast, background: toast.type==='ok' ? 'rgba(34,197,94,.9)' : 'rgba(239,68,68,.9)' }}>
              {toast.msg}
            </div>
          )}
        </div>
      </div>
    </>

  );
}

/* =================== Stili inline (coerenti con la UI precedente) =================== */
const styles = {
  page: {
    minHeight:'100vh',
    padding:'24px 16px',
    background:'radial-gradient(1200px 600px at 20% -10%, rgba(59,130,246,.15), transparent), radial-gradient(1000px 500px at 120% 10%, rgba(236,72,153,.12), transparent), linear-gradient(180deg,#0b1220,#0a0f1a 60%, #0b1220)',
    color:'#e5e7eb',
  },
  card: {
    maxWidth:1100, margin:'0 auto',
    background:'rgba(15,23,42,.35)',
    backdropFilter:'blur(6px)',
    border:'1px solid rgba(148,163,184,.15)',
    borderRadius:18, padding:16,
    boxShadow:'0 10px 30px rgba(0,0,0,.25)'
  },
  headerRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:8 },
  title3d:{
    margin:0, fontSize:'1.6rem', letterSpacing:.6, fontWeight:800,
    textShadow:'0 2px 0 #1b2230, 0 0 14px rgba(140,200,255,.35), 0 0 2px rgba(255,255,255,.25)'
  },
  homeBtn:{ padding:'8px 12px', borderRadius:10, background:'linear-gradient(180deg,#1f2937,#111827)', color:'#e5e7eb', border:'1px solid rgba(148,163,184,.25)', textDecoration:'none' },
  actionGhost:{ padding:'8px 12px', borderRadius:10, border:'1px solid rgba(148,163,184,.25)', background:'transparent', color:'#e5e7eb' },

  switchRow:{ display:'flex', gap:8, margin:'8px 0 4px' },
  switchBtn:{ padding:'8px 12px', borderRadius:10, border:'1px solid rgba(148,163,184,.25)', background:'transparent', color:'#cbd5e1' },
  switchBtnActive:{ padding:'8px 12px', borderRadius:10, border:'1px solid rgba(59,130,246,.6)', background:'rgba(59,130,246,.15)', color:'#e5e7eb', boxShadow:'0 0 20px rgba(59,130,246,.25) inset' },

  toolsRow:{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:8 },
  voiceBtn:{ padding:'8px 12px', borderRadius:10, border:'1px solid rgba(59,130,246,.5)', background:'rgba(30,64,175,.4)', color:'#e5e7eb' },
  primaryBtn:{ padding:'8px 12px', borderRadius:10, border:'1px solid rgba(34,197,94,.5)', background:'rgba(22,163,74,.35)', color:'#e5e7eb' },

  sectionLarge:{ marginTop:14 },
  sectionLifted:{ marginTop:14, padding:12, borderRadius:14, background:'rgba(2,6,23,.45)', border:'1px solid rgba(148,163,184,.15)' },
  sectionHeaderRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' },

  formRow:{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0, 1fr)) 160px', gap:8 },
  input:{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid rgba(148,163,184,.25)', background:'rgba(15,23,42,.6)', color:'#e5e7eb' },

  h3:{ margin:'8px 0', fontSize:'1.1rem', color:'#f3f4f6' },

  listCardRed:{
    display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
    padding:12, borderRadius:12,
    background:'linear-gradient(180deg, rgba(239,68,68,.18), rgba(127,29,29,.18))',
    border:'1px solid rgba(239,68,68,.35)',
    cursor:'pointer'
  },
  listCardRedBought:{ opacity:.65, filter:'grayscale(.3)' },
  rowLeft:{ display:'flex', flexDirection:'column' },
  rowName:{ fontWeight:700, fontSize:16 },
  rowBrand:{ opacity:.85, fontWeight:600 },
  rowMeta:{ opacity:.9, fontSize:13, marginTop:2 },
  badgeBought:{ marginLeft:8, padding:'2px 8px', borderRadius:999, fontSize:12, background:'rgba(34,197,94,.2)', border:'1px solid rgba(34,197,94,.5)' },
  badgeToBuy:{ marginLeft:8, padding:'2px 8px', borderRadius:999, fontSize:12, background:'rgba(234,179,8,.15)', border:'1px solid rgba(234,179,8,.45)' },

  rowActions:{ display:'flex', gap:6, alignItems:'center' },
  iconBtnBase:{ width:34, height:34, borderRadius:9, border:'1px solid rgba(148,163,184,.25)', background:'rgba(15,23,42,.6)', color:'#e5e7eb' },
  iconBtnGreen:{ border:'1px solid rgba(34,197,94,.55)', background:'rgba(22,163,74,.25)' },
  iconBtnDark:{},
  ocrPillBtn:{ padding:'8px 10px', borderRadius:10, border:'1px solid rgba(59,130,246,.5)', background:'rgba(30,64,175,.35)', color:'#e5e7eb' },
  trashBtn:{ padding:'8px 10px', borderRadius:10, border:'1px solid rgba(239,68,68,.55)', background:'rgba(127,29,29,.35)', color:'#fecaca' },

  stockRow:{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, padding:12, borderRadius:12, border:'1px solid rgba(148,163,184,.18)', background:'rgba(15,23,42,.45)' },
  stockImage:{ objectFit:'cover', borderRadius:10, border:'1px solid rgba(148,163,184,.25)' },
  stockColLeft:{ display:'flex', flexDirection:'column', gap:6, minWidth:0 },
  stockName:{ fontWeight:800, fontSize:16 },
  stockBrand:{ opacity:.85, fontWeight:600 },
  stockMeta:{ opacity:.9, fontSize:13 },
  meterTrack:{ width:'100%', height:8, background:'rgba(2,6,23,.8)', borderRadius:999, border:'1px solid rgba(148,163,184,.2)', overflow:'hidden', marginTop:6 },
  meterFill:{ height:'100%' },

  statusPill:{ padding:'2px 8px', borderRadius:999, border:'1px solid rgba(148,163,184,.35)', fontSize:12, color:'#e5e7eb' },

  editBtn:{ padding:'8px 10px', borderRadius:10, border:'1px solid rgba(59,130,246,.5)', background:'rgba(30,64,175,.35)', color:'#e5e7eb' },
  smallBtn:{ padding:'8px 10px', borderRadius:10, border:'1px solid rgba(148,163,184,.25)', background:'rgba(15,23,42,.6)', color:'#e5e7eb' },
  dangerBtn:{ padding:'8px 10px', borderRadius:10, border:'1px solid rgba(239,68,68,.55)', background:'rgba(127,29,29,.35)', color:'#fecaca' },

  editRow:{ display:'grid', gridTemplateColumns:'repeat(7, minmax(0, 1fr))', gap:8, alignItems:'center' },
  editInput:{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1px solid rgba(148,163,184,.25)', background:'rgba(2,6,23,.7)', color:'#e5e7eb' },
  editActions:{ gridColumn:'1 / -1', display:'flex', gap:8, justifyContent:'flex-end' },
  saveBtn:{ padding:'8px 12px', borderRadius:10, border:'1px solid rgba(34,197,94,.5)', background:'rgba(22,163,74,.35)', color:'#e5e7eb' },
  cancelBtn:{ padding:'8px 12px', borderRadius:10, border:'1px solid rgba(148,163,184,.25)', background:'transparent', color:'#e5e7eb' },

  toast:{ position:'fixed', right:16, bottom:16, padding:'10px 14px', borderRadius:10, color:'#0b1220', fontWeight:700, boxShadow:'0 10px 25px rgba(0,0,0,.3)' },
};

