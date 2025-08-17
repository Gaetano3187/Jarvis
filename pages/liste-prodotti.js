// pages/liste-prodotti.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

/* ====================== Costanti / Config ====================== */
const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;

// Endpoints esistenti
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
function totalUnitsOf(s){ return (Number(s.packs||0) * Number(s.unitsPerPack||1)); }
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
function buildExpiryPrompt(itemName, brand, ocrText) {
  const tag = brand ? `${itemName} (marca ${brand})` : itemName;
  return [
    'Sei Jarvis, estrattore scadenze da etichette/scontrini.',
    'Cerca SOLO la scadenza riferita al prodotto indicato.',
    'Rispondi SOLO in JSON con schema: { "expiries":[{ "name":"", "expiresAt":"YYYY-MM-DD" }] }',
    '- Se non trovi una data chiara, restituisci {"expiries":[]}.',
    '',
    `PRODOTTO TARGET: "${tag}"`,
    '',
    'ESEMPI:',
    'Input:',
    '  Prodotto: "latte (marca Parmalat)"',
    '  Testo OCR: "LATTE PS PARMALAT 1L SCAD 15/07/2025 lotto 18"',
    'Output:',
    '{ "expiries":[{ "name":"latte", "expiresAt":"2025-07-15" }] }',
    '',
    'ADESSO ESTRARRE DAL TESTO OCR QUI SOTTO.',
    '--- TESTO OCR INIZIO ---',
    ocrText,
    '--- TESTO OCR FINE ---'
  ].join('\n');
}
function buildInventoryIntentPrompt(text) {
  return [
    'Sei Jarvis. Capisci un comando VOCALE per SCORTE & SCADENZE.',
    'Decidi l’intento e produci SOLO JSON conforme agli schemi:',
    '',
    'Se è aggiornamento scorte:',
    '{ "intent":"stock_update", "updates":[ { "name":"latte", "mode":"packs|units", "value":3 } ] }',
    '',
    'Se è scadenze:',
    '{ "intent":"expiry", "expiries":[ { "name":"latte", "expiresAt":"YYYY-MM-DD" } ] }',
    '',
    'REGOLE:',
    '- Se compaiono date o parole: "scad", "scadenza", "scade", "entro", usa intent="expiry".',
    '- Altrimenti usa intent="stock_update".',
    '- Normalizza i nomi ai prodotti comuni (latte, pasta, yogurt, ecc.).',
    '- "bottiglie/pacchi/confezioni/scatole" ⇒ mode="packs". "unità/pz/pezzi/vasetti/uova/barrette" ⇒ mode="units".',
    '- value è un numero. Ignora numeri che sembrano anni (es. 2025) per stock_update.',
    '',
    'ESEMPI:',
    'Testo: "il latte scade il 15/07/2025 e lo yogurt il 10 agosto 2025"',
    'Output: { "intent":"expiry", "expiries":[{"name":"latte","expiresAt":"2025-07-15"},{"name":"yogurt","expiresAt":"2025-08-10"}] }',
    '',
    'Testo: "latte sono 3 bottiglie, pasta 4 pacchi, ferrero fiesta 3 unità"',
    'Output: { "intent":"stock_update", "updates":[{"name":"latte","mode":"packs","value":3},{"name":"pasta","mode":"packs","value":4},{"name":"ferrero fiesta","mode":"units","value":3}] }',
    '',
    'Testo utente:',
    text
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
      .replace(/\s{2,}/g,' ')
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
function looksLikeSetResidue(text) {
  const t = normKey(text);
  return /\b(sono|ce\s+ne\s+sono|ce\s+n'?e\s+sono|ne\s+ho|adesso\s+sono|ora\s+sono|in\s+totale\s+sono)\b/.test(t);
}
function hasExplicitPackStructure(text){
  const s = normKey(text);
  return /(?:conf(?:e(?:zioni)?)?|pacc?hi?|scatol[ae])\s*(?:da|x)\s*\d+/.test(s);
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
function theMediaWorkaround(){
  // Alcuni browser mobile richiedono una chiamata “user-gesture” prima dell’audio.
  // Qui non serve realmente nulla: la lasciamo no-op per evitare ReferenceError.
  return;
}

/* ====================== Component principale ====================== */
export default function ListeProdotti() {
  const [currentList, setCurrentList] = useState(LIST_TYPES.SUPERMARKET);
  const [lists, setLists] = useState({
    [LIST_TYPES.SUPERMARKET]: [],
    [LIST_TYPES.ONLINE]: [],
  });

  // Form Lista (ora in pannello apribile)
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

  // Vocale: LISTA
  theMediaWorkaround();
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // Vocale: INVENTARIO UNIFICATO
  const invMediaRef = useRef(null);
  const invChunksRef = useRef([]);
  const invStreamRef = useRef(null);
  const [invRecBusy, setInvRecBusy] = useState(false);

  // OCR input (scontrini)
  const ocrInputRef = useRef(null);

  // OCR scadenza per riga
  const rowOcrInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);

  // Form Aggiunta Scorta manuale (opzionale, lo teniamo dietro a bottone)
  const [stockForm, setStockForm] = useState({
    name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità', expiresAt: ''
  });
  const [showStockForm, setShowStockForm] = useState(false);

  // Form inserimento manuale scadenze (richiesto)
  const [expiryForm, setExpiryForm] = useState({ name: '', expiresAt: '' });
  const [showExpiryForm, setShowExpiryForm] = useState(false);

  const curItems = lists[currentList] || [];

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
            return (stockRef.current || []).map(s => {
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
            return (stockRef.current || []).filter(s => {
              const { current, baseline } = residueInfo(s);
              return baseline > 0 && current / baseline < 0.20;
            });
          }
        });
        hub.registerDataSource({
          name: 'scorte-scadenza',
          fetch: ({ entroGiorni = 10 } = {}) => {
            return (stockRef.current || []).filter(s => isExpiringSoon(s, entroGiorni));
          }
        });
        hub.registerDataSource({
          name: 'scorte-giorni-esaurimento',
          fetch: () => {
            const out = [];
            for (const s of (stockRef.current || [])) {
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
            const data = listsRef.current || {};
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
            const items = (listsRef.current?.[cur] || []).filter(i => !i.purchased && i.qty > 0);
            return items.map(i => ({
              listType: cur,
              name: i.name, brand: i.brand || '', qty: i.qty,
              unitsPerPack: i.unitsPerPack || 1, unitLabel: i.unitLabel || 'unità'
            }));
          }
        });

        hub.registerCommand({
          name: 'imposta-scadenze',
          execute: (text) => {
            const expiries = parseExpiryPairs(
              text,
              GROCERY_LEXICON,
              (stockRef.current || []).map(s => s.name)
            );
            if (!expiries.length) return 'Nessuna scadenza riconosciuta.';
            let updated = 0;
            setStock(prev => {
              const arr = [...prev];
              for (let i=0;i<arr.length;i++){
                const hit = expiries.find(e => isSimilar(e.name, arr[i].name));
                if (hit?.expiresAt) {
                  const iso = toISODate(hit.expiresAt);
                  if (iso) { arr[i] = { ...arr[i], expiresAt: iso }; updated++; }
                }
              }
              return arr;
            });
            return updated ? `Aggiornate ${updated} scadenze.` : 'Nessuna scadenza aggiornata.';
          }
        });
        hub.registerCommand({
          name: 'aggiorna-scorte',
          execute: (text) => {
            const updates = parseStockUpdateText(text);
            if (!updates.length) return 'Nessun aggiornamento scorte riconosciuto.';
            let applied = 0;
            setStock(prev => {
              const arr = [...prev];
              const todayISO = new Date().toISOString().slice(0, 10);
              for (const u of updates) {
                const idx = arr.findIndex(s => isSimilar(s.name, u.name));
                const hintedPacks = Math.max(1, Number(u._packs || 1));
                const hintedUPP   = Math.max(1, Number(u._upp || 1));

                if (idx >= 0) {
                  const old = arr[idx];
                  const upp = Math.max(1, Number(old.unitsPerPack || 1));

                  if (u.op === 'restockExplicit') {
                    const np = Math.max(0, Number(old.packs || 0) + hintedPacks);
                    const nupp = Math.max(1, hintedUPP || upp);
                    arr[idx] = { ...old, packs: np, unitsPerPack: nupp, unitLabel: old.unitLabel || 'unità', ...restockTouch(np, todayISO, nupp) };
                    applied++; continue;
                  }
                  if (u.op === 'set' || u.mode === 'units' || u.mode === 'packs') {
                    const asUnits = (u.mode === 'units');
                    const valueUnits = asUnits ? Math.max(0, Number(u.value || 0)) : Math.max(0, Number(u.value || 0) * upp);
                    arr[idx] = { ...old, residueUnits: valueUnits };
                    applied++; continue;
                  }
                } else {
                  if (u.op === 'restockExplicit') {
                    arr.unshift({
                      name: u.name, brand: '',
                      packs: hintedPacks, unitsPerPack: hintedUPP, unitLabel: 'unità',
                      expiresAt: '', ...restockTouch(hintedPacks, todayISO, hintedUPP), avgDailyUnits: 0
                    });
                    applied++; continue;
                  }
                  const asUnitsLike = (u.mode === 'units');
                  if (asUnitsLike) {
                    const upp = Math.max(1, Number(u.value || 1));
                    arr.unshift({
                      name: u.name, brand: '',
                      packs: 1, unitsPerPack: upp, unitLabel: 'unità',
                      expiresAt: '', ...restockTouch(1, todayISO, upp), avgDailyUnits: 0
                    });
                  } else {
                    const p = Math.max(1, Number(u.value || 1));
                    arr.unshift({
                      name: u.name, brand: '',
                      packs: p, unitsPerPack: 1, unitLabel: 'unità',
                      expiresAt: '', ...restockTouch(p, todayISO, 1), avgDailyUnits: 0
                    });
                  }
                  applied++;
                }
              }
              return arr;
            });
            return applied ? `Aggiornate ${applied} scorte.` : 'Nessuna scorta aggiornata.';
          }
        });
        hub.registerCommand({
          name: 'imposta-residuo',
          execute: ({ name, units }) => {
            if (!name || units == null) return 'Parametri mancanti.';
            let ok = false;
            setStock(prev => {
              const arr = [...prev];
              const i = arr.findIndex(s => isSimilar(s.name, name));
              if (i >= 0) {
                const upp = Math.max(1, Number(arr[i].unitsPerPack || 1));
                const baseline = Math.max(upp, Number(arr[i].baselinePacks || arr[i].packs || 0) * upp);
                const clamped = Math.max(0, Math.min(Number(units || 0), baseline));
                arr[i] = { ...arr[i], residueUnits: clamped };
                ok = true;
              }
              return arr;
            });
            return ok ? `Impostato residuo per ${name}.` : `Prodotto "${name}" non trovato.`;
          }
        });
        hub.registerCommand({
          name: 'set-confezioni',
          execute: ({ name, packs, unitsPerPack, unitLabel }) => {
            if (!name) return 'Nome mancante.';
            const p = Math.max(0, Number(packs || 0));
            const upp = Math.max(1, Number(unitsPerPack || 1));
            const ulabel = (unitLabel || 'unità').trim() || 'unità';
            let done = false;

            setStock(prev => {
              const arr = [...prev];
              const i = arr.findIndex(s => isSimilar(s.name, name));
              const todayISO = new Date().toISOString().slice(0,10);
              if (i >= 0) {
                arr[i] = { ...arr[i], packs: p, unitsPerPack: upp, unitLabel: ulabel, ...restockTouch(p, todayISO, upp) };
                done = true;
              } else {
                arr.unshift({
                  name, brand:'', packs:p, unitsPerPack:upp, unitLabel: ulabel,
                  expiresAt:'', ...restockTouch(p, todayISO, upp), avgDailyUnits:0
                });
                done = true;
              }
              return arr;
            });

            return done ? `Impostate confezioni per ${name}.` : `Impossibile impostare ${name}.`;
          }
        });
        hub.registerCommand({
          name: 'aggiungi-alla-lista',
          execute: ({ name, brand = '', packs = 1, unitsPerPack = 1, unitLabel = 'unità', listType }) => {
            if (!name) return 'Nome prodotto mancante.';
            const target = listType && listsRef.current?.[listType] ? listType : currentListRef.current;

            setLists(prev => {
              const next = { ...prev };
              const items = [...(prev[target] || [])];
              const idx = items.findIndex(i =>
                i.name.toLowerCase() === name.toLowerCase() &&
                (i.brand||'').toLowerCase() === brand.toLowerCase() &&
                Number(i.unitsPerPack||1) === Number(unitsPerPack||1)
              );
              if (idx >= 0) {
                items[idx] = { ...items[idx], qty: Number(items[idx].qty || 0) + Math.max(1, Number(packs || 1)) };
              } else {
                items.push({
                  id: 'tmp-' + Math.random().toString(36).slice(2),
                  name, brand, qty: Math.max(1, Number(packs || 1)),
                  unitsPerPack: Math.max(1, Number(unitsPerPack || 1)),
                  unitLabel, purchased: false
                });
              }
              next[target] = items;
              return next;
            });

            return `Aggiunto "${name}" alla lista ${target}.`;
          }
        });
        hub.registerCommand({
          name: 'segna-comprato',
          execute: ({ name, amount = 1, listType }) => {
            const allLists = [LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE];
            const targets = listType && allLists.includes(listType) ? [listType] : allLists;
            let done = false;

            setLists(prev => {
              const next = { ...prev };
              for (const key of targets) {
                const arr = [...(next[key] || [])];
                const idx = arr.findIndex(i => isSimilar(i.name, name));
                if (idx >= 0) {
                  const it = arr[idx];
                  const movePacks = Math.max(1, Math.min(Number(it.qty || 0), Number(amount || 1)));
                  const moveUPP   = Math.max(1, Number(it.unitsPerPack || 1));
                  const moveLabel = it.unitLabel || 'unità';

                  arr[idx] = { ...it, qty: Math.max(0, Number(it.qty || 0) - movePacks), purchased: true };
                  next[key] = arr.filter(i => Number(i.qty || 0) > 0 || !i.purchased);

                  setStock(prevStock => {
                    const st = [...prevStock];
                    const todayISO = new Date().toISOString().slice(0, 10);
                    const j = st.findIndex(s => isSimilar(s.name, it.name) && (!it.brand || isSimilar(s.brand || '', it.brand)));
                    if (j >= 0) {
                      const old = st[j];
                      const upp = Math.max(1, Number(old.unitsPerPack || moveUPP));
                      const newPacks = Math.max(0, Number(old.packs || 0) + movePacks);
                      st[j] = { ...old, packs: newPacks, unitsPerPack: upp, unitLabel: old.unitLabel || moveLabel, ...restockTouch(newPacks, todayISO, upp) };
                    } else {
                      st.unshift({
                        name: it.name, brand: it.brand || '',
                        packs: movePacks, unitsPerPack: moveUPP, unitLabel: moveLabel,
                        expiresAt: '', ...restockTouch(movePacks, todayISO, moveUPP), avgDailyUnits: 0
                      });
                    }
                    return st;
                  });

                  done = true;
                  break;
                }
              }
              return next;
            });

            return done ? `Segnato "${name}" come comprato.` : `Prodotto "${name}" non trovato nelle liste.`;
          }
        });
        hub.registerCommand({
          name: 'rispondi',
          execute: async (textRaw) => {
            const text = (textRaw || '').toLowerCase();

            if (/cosa\s+devo\s+comprare|cosa\s+compr(are|o)\s+oggi|lista\s+(di\s+)?oggi/.test(text)) {
              const items = await hub.ask('lista-oggi');
              if (!items?.length) return 'La lista di oggi è vuota.';
              const rows = items.map(i => `• ${i.name}${i.brand?` (${i.brand})`:''} — ${i.qty} conf. × ${i.unitsPerPack} ${i.unitLabel}`).join('\n');
              return `Ecco la lista di oggi:\n${rows}`;
            }
            if (/in\s+esaurimento|quasi\s+finiti|scorte\s+basse/.test(text)) {
              const crit = await hub.ask('scorte-esaurimento');
              if (!crit?.length) return 'Nessun prodotto in esaurimento.';
              const lines = crit.map(p => {
                const { current, baseline } = residueInfo(p);
                const pct = Math.round((current / Math.max(1, baseline)) * 100);
                return `• ${p.name}${p.brand?` (${p.brand})`:''} — ${Math.round(current)}/${Math.round(baseline)} unità (${pct}%)`;
              }).join('\n');
              return `Prodotti in esaurimento:\n${lines}`;
            }
            const mEntro = text.match(/entro\s+(\d{1,3})\s+giorni/);
            if (/in\s+scadenza|scadono|scadenze/.test(text) || mEntro) {
              const entro = mEntro ? Number(mEntro[1]) : 10;
              const exp = await hub.ask('scorte-scadenza', { entroGiorni: entro });
              if (!exp?.length) return `Nessun prodotto in scadenza entro ${entro} giorni.`;
              const lines = exp.map(p => `• ${p.name}${p.brand?` (${p.brand})`:''} — scade il ${new Date(p.expiresAt).toLocaleDateString('it-IT')}`).join('\n');
              return `Prodotti in scadenza entro ${entro} giorni:\n${lines}`;
            }
            const mDays = text.match(/(quanti|quanto)\s+giorni.*(mancano|all'esaurimento|per\s+finire).*([a-z0-9\sàèéìòù]+)/i);
            if (mDays) {
              const prod = (mDays[3] || '').trim();
              const all = await hub.ask('scorte-giorni-esaurimento');
              const hit = (all || []).find(p => isSimilar(p.name, prod));
              if (!hit) return `Non trovo "${prod}" fra le scorte.`;
              if (hit.daysToDepletion == null) return `Non ho abbastanza dati per stimare i giorni per "${hit.name}".`;
              return `Per ${hit.name} mancano circa ${hit.daysToDepletion} giorni all’esaurimento.`;
            }
            if (/scad/.test(text)) {
              return hub.run('imposta-scadenze', text);
            }
            if (/\b(pacch|conf|scatol|bottigl|unit|pz|pezzi|uova|vasetti|barrette|merendine|bustine)\b|\d+\s*$/.test(text)) {
              return hub.run('aggiorna-scorte', text);
            }
            const tryExp = parseExpiryPairs(text, GROCERY_LEXICON, (stockRef.current||[]).map(s=>s.name));
            if (tryExp.length) return hub.run('imposta-scadenze', text);
            const tryUpd = parseStockUpdateText(text);
            if (tryUpd.length) return hub.run('aggiorna-scorte', text);

            return 'Non ho capito la richiesta (scorte/lista/scadenze). Riprova con: "cosa devo comprare oggi", "prodotti in esaurimento", "il latte scade il 15/01/2025", "pasta 3 pacchi", ecc.';
          }
        });

        if (cancelled) return;
        if (typeof window !== 'undefined') {
          window.jarvisBrain = getHub();
        }
      }

      wireBrain();
      return () => { cancelled = true; };
    }, []);
  }

  /* =================== Hydration iniziale =================== */
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

  /* =================== Autosave debounce =================== */
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
  function markBought(id, amount = 1) {
    const item = (lists[currentList] || []).find(i => i.id === id);
    if (!item) return;

    const movePacks = Math.max(1, Math.min(Number(item.qty || 0), Number(amount || 1)));
    const moveUPP   = Math.max(1, Number(item.unitsPerPack || 1));
    const moveLabel = item.unitLabel || 'unità';

    setLists(prev => {
      const next = { ...prev };
      next[currentList] = (prev[currentList] || [])
        .map(i => {
          if (i.id !== id) return i;
          const newQty = Math.max(0, Number(i.qty || 0) - movePacks);
          return { ...i, qty: newQty, purchased: true };
        })
        .filter(i => Number(i.qty || 0) > 0);
      return next;
    });

    setStock(prev => {
      const arr = [...prev];
      const todayISO = new Date().toISOString().slice(0, 10);

      const idx = arr.findIndex(
        s => isSimilar(s.name, item.name) && (!item.brand || isSimilar(s.brand || '', item.brand))
      );

      if (idx >= 0) {
        const old = arr[idx];
        const upp = Math.max(1, Number(old.unitsPerPack || moveUPP));
        const newPacks = Math.max(0, Number(old.packs || 0) + movePacks);

        arr[idx] = {
          ...old,
          packs: newPacks,
          unitsPerPack: upp,
          unitLabel: old.unitLabel || moveLabel,
          ...restockTouch(newPacks, todayISO, upp),
        };
      } else {
        arr.unshift({
          name: item.name,
          brand: item.brand || '',
          packs: movePacks,
          unitsPerPack: moveUPP,
          unitLabel: moveLabel,
          expiresAt: '',
          ...restockTouch(movePacks, todayISO, moveUPP),
          avgDailyUnits: 0,
        });
      }
      return arr;
    });
  }
  // Ripristina "annulla" (click destro): semplicemente togli il flag purchased
  function unmarkBought(id){
    setLists(prev => {
      const next = { ...prev };
      next[currentList] = (prev[currentList] || []).map(i => i.id === id ? { ...i, purchased: false } : i);
      return next;
    });
  }

  /* =================== Vocale: LISTA =================== */
  async function toggleRecList() {
    if (recBusy) {
      try { mediaRecRef.current?.stop(); } catch {}
      return;
    }
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
            '{ "items":[{ "name":"latte","brand":"Parmalat","packs":2,"unitsPerPack":6,"unitLabel":"bottiglie" }, ...] }',
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

  /* =================== OCR scontrini (con decremento in entrambe le liste) =================== */
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

  /* =================== Scorte aggiunta manuale (dietro pulsante) =================== */
  function addManualStock(e) {
    e.preventDefault();
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
          residueUnits: packs * unitsPerPack
        });
      }
      return arr;
    });

    setStockForm({ name:'', brand:'', packs:'1', unitsPerPack:'1', unitLabel:'unità', expiresAt:'' });
    setShowStockForm(false);
    showToast('Scorta aggiunta ✓', 'ok');
  }

  /* =================== Inserimento manuale SCADENZE (dietro pulsante) =================== */
  function addManualExpiry(e){
    e.preventDefault();
    const name = (expiryForm.name || '').trim();
    const iso  = toISODate(expiryForm.expiresAt || '');
    if (!name || !iso) {
      showToast('Nome o data non validi', 'err');
      return;
    }
    let updated = false;
    setStock(prev => {
      const arr = [...prev];
      const i = arr.findIndex(s => isSimilar(s.name, name));
      if (i >= 0) {
        arr[i] = { ...arr[i], expiresAt: iso };
        updated = true;
      } else {
        // se non esiste la scorta, la creiamo minimale (0 conf) per memorizzare la scadenza
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
  }

  /* =================== Reset locale =================== */
  function resetLocalData() {
    try { localStorage.removeItem(LS_KEY); } catch {}
    setLists({ [LIST_TYPES.SUPERMARKET]: [], [LIST_TYPES.ONLINE]: [] });
    setStock([]);
    setCurrentList(LIST_TYPES.SUPERMARKET);
    showToast('Dati locali azzerati', 'ok');
  }

  /* =================== Vocale UNIFICATO: SCADENZE + SCORTE =================== */
  async function toggleVoiceInventory() {
    if (invRecBusy) {
      try { invMediaRef.current?.stop(); } catch {}
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      invStreamRef.current = stream;
      invMediaRef.current = new MediaRecorder(stream);
      invChunksRef.current = [];
      invMediaRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size) invChunksRef.current.push(e.data);
      };
      invMediaRef.current.onstop = processVoiceInventory;
      invMediaRef.current.start();
      setInvRecBusy(true);
    } catch {
      alert('Microfono non disponibile');
    }
  }
  async function processVoiceInventory() {
    const blob = new Blob(invChunksRef.current, { type: 'audio/webm' });
    const fd = new FormData();
    fd.append('audio', blob, 'inventory.webm');

    try {
      setBusy(true);
      const res = await timeoutFetch('/api/stt', { method: 'POST', body: fd }, 25000);
      const { text } = await res.json();
      if (!text) {
        showToast('Nessun testo riconosciuto', 'err');
        return;
      }

      const looksExpiry = /scad|scadenza|scade|entro|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/i.test(text);

      let expiries = parseExpiryPairs(text, GROCERY_LEXICON, stock.map(s => s.name));
      let updates  = parseStockUpdateText(text);

      if (looksExpiry && expiries.length === 0) {
        try {
          const prompt = buildInventoryIntentPrompt(text);
          const r = await timeoutFetch(API_ASSISTANT_TEXT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
          }, 25000);
          const safe = await readJsonSafe(r);
          const answer = safe?.answer || safe?.data || safe;
          const parsed = typeof answer === 'string'
            ? (() => { try { return JSON.parse(answer); } catch { return null; } })()
            : answer;
          if (parsed?.intent === 'expiry') {
            const ex = ensureArray(parsed?.expiries)
              .map(e => ({ name: String(e.name || '').trim(), expiresAt: toISODate(e.expiresAt) }))
              .filter(e => e.name && e.expiresAt);
            if (ex.length) expiries = ex;
          }
        } catch (e) {
          if (DEBUG) console.warn('[Assistant expiry fallback error]', e);
        }
      }

      if (updates.length === 0 && !looksExpiry) {
        try {
          const prompt = buildInventoryIntentPrompt(text);
          const r = await timeoutFetch(API_ASSISTANT_TEXT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
          }, 25000);
          const safe = await readJsonSafe(r);
          const answer = safe?.answer || safe?.data || safe;
          const parsed = typeof answer === 'string'
            ? (() => { try { return JSON.parse(answer); } catch { return null; } })()
            : answer;
          if (parsed?.intent === 'stock_update') {
            const up = ensureArray(parsed?.updates)
              .map(u => ({
                name: String(u.name || '').trim(),
                mode: (u.mode === 'units' ? 'units' : 'packs'),
                value: Math.max(0, Number(u.value || 0)),
                op: 'add'
              }))
              .filter(u => u.name && u.value > 0);
            if (up.length) updates = up;
          }
        } catch (e) {
        }
      }

      let expiryHits = 0;
      if (expiries.length) {
        setStock(prev => {
          const arr = [...prev];
          for (const p of expiries) {
            const idx = arr.findIndex(s => isSimilar(s.name, p.name));
            if (idx >= 0) {
              arr[idx] = { ...arr[idx], expiresAt: p.expiresAt || arr[idx].expiresAt };
              expiryHits++;
            }
          }
          return arr;
        });
      }

      let applied = 0;
      if (updates.length) {
        setStock(prev => {
          const arr = [...prev];
          const todayISO = new Date().toISOString().slice(0, 10);

          for (const u of updates) {
            const idx = arr.findIndex(s => isSimilar(s.name, u.name));
            const explicit = (u.op === 'restockExplicit');
            const hintedPacks = Math.max(1, Number(u._packs || 1));
            const hintedUPP   = Math.max(1, Number(u._upp || 1));

            if (idx >= 0) {
              const old = arr[idx];
              const upp = Math.max(1, Number(old.unitsPerPack || 1));
              const packs = Math.max(0, Number(old.packs || 0));

              if (explicit) {
                const np = Math.max(0, packs + hintedPacks);
                const nupp = Math.max(1, hintedUPP || upp);
                arr[idx] = {
                  ...old, packs: np, unitsPerPack: nupp, unitLabel: old.unitLabel || 'unità',
                  ...restockTouch(np, todayISO, nupp)
                };
                applied++;
                continue;
              }

              const ru = Math.max(0, Number(u.value || 0) || 0);
              arr[idx] = { ...old, residueUnits: ru };
              applied++;
              continue;
            }

            if (explicit) {
              arr.unshift({
                name: u.name, brand: '', packs: hintedPacks, unitsPerPack: hintedUPP, unitLabel: 'unità',
                expiresAt: '', ...restockTouch(hintedPacks, todayISO, hintedUPP), avgDailyUnits: 0
              });
              applied++;
              continue;
            }

            const asUnitsLike = (u.mode === 'units');
            if (asUnitsLike) {
              const upp = Math.max(1, Number(u.value || 1));
              arr.unshift({
                name: u.name, brand: '', packs: 1, unitsPerPack: upp, unitLabel: 'unità',
                expiresAt: '', ...restockTouch(1, todayISO, upp), avgDailyUnits: 0
              });
            } else {
              const p = Math.max(1, Number(u.value || 1));
              arr.unshift({
                name: u.name, brand: '', packs: p, unitsPerPack: 1, unitLabel: 'unità',
                expiresAt: '', ...restockTouch(p, todayISO, 1), avgDailyUnits: 0
              });
            }
            applied++;
          }
          return arr;
        });
      }

      if (expiryHits && applied)      showToast(`Aggiornate ${expiryHits} scadenze e ${applied} scorte ✓`, 'ok');
      else if (expiryHits)            showToast(`Aggiornate ${expiryHits} scadenze ✓`, 'ok');
      else if (applied)               showToast(`Aggiornate ${applied} scorte ✓`, 'ok');
      else                            showToast('Nessuna scorta/scadenza riconosciuta', 'err');
    } catch (e) {
      console.error('[Voice Inventory] error', e);
      showToast(`Errore vocale inventario: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      setInvRecBusy(false);
      try { invStreamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
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
              <button onClick={resetLocalData} style={styles.actionGhost} title="Cancella i dati locali">↺ Reset locale</button>
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
            {/* NUOVO: bottone che apre il form manuale lista */}
            <button onClick={() => setShowListForm(v => !v)} style={styles.primaryBtn}>
              {showListForm ? '– Chiudi form lista' : '➕ Aggiungi manualmente alla lista corrente'}
            </button>
          </div>

          {/* Form aggiunta manuale (Lista) — ora a comparsa */}
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
              <p style={{opacity:.8, marginTop: 6}}>
                Esempi voce: “2 confezioni da 6 yogurt muller”, “latte 1 confezione da 6 bottiglie”, “uova 10”.
              </p>
            </div>
          )}

          {/* Lista corrente */}
          <div style={styles.sectionLarge}>
            <h3 style={styles.h3}>
              Lista corrente: <span style={{ opacity: 0.85 }}>{currentList === LIST_TYPES.ONLINE ? 'Spesa Online' : 'Supermercato'}</span>
            </h3>

            {curItems.length === 0 ? (
              <p style={{ opacity: 0.8 }}>Nessun prodotto ancora</p>
            ) : (
              <div style={styles.listGrid}>
                {curItems.map((it) => {
                  const isBought = !!it.purchased;
                  return (
                    <div
                      key={it.id}
                      role="button"
                                           tabIndex={0}
                      onClick={() => {
                        // Click riga = toggle rosso/verde (non scala la quantità)
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
                          {it.name}
                          {it.brand ? <span style={styles.rowBrand}> · {it.brand}</span> : null}
                        </div>
                        <div style={styles.rowMeta}>
                          {it.qty} conf. × {it.unitsPerPack} {it.unitLabel}
                          {isBought ? <span style={styles.badgeBought}>preso</span> : <span style={styles.badgeToBuy}>da prendere</span>}
                        </div>
                      </div>

                      <div style={styles.rowActions} onClick={e => e.stopPropagation()}>
                        {/* Compra (–1 conf) = scala quantità e sposta a scorte */}
                        <button title="Segna come comprato (–1 conf. e aggiorna scorte)"
                                onClick={() => markBought(it.id, 1)}
                                style={styles.smallOkBtn}>✓</button>

                        <button title="–1" onClick={() => incQty(it.id, -1)} style={styles.smallQtyBtn}>−</button>
                        <button title="+1" onClick={() => incQty(it.id, +1)} style={styles.smallQtyBtn}>+</button>

                        {/* OCR scadenza per questa riga */}
                        <button
                          title="OCR scadenza (foto etichetta/scontrino di questo prodotto)"
                          onClick={() => { setTargetRowIdx(it.id); rowOcrInputRef.current?.click(); }}
                          style={styles.smallGhostBtn}
                        >OCR scad.</button>

                        {/* Annulla stato 'preso' se messo per errore (tasto destro) */}
                        <button title="Annulla 'preso'" onClick={() => unmarkBought(it.id)} style={styles.smallGhostBtn}>↺</button>

                        {/* Elimina riga */}
                        <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.smallDangerBtn}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* --- OCR Scontrino globale --- */}
          <div style={styles.sectionLarge}>
            <h3 style={styles.h3}>📸 OCR Scontrino</h3>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button
                onClick={() => ocrInputRef.current?.click()}
                style={styles.primaryBtn}
                disabled={busy}
              >Carica foto scontrino</button>
              <p style={{ opacity:.8, margin:0 }}>Riconosce acquisti, riduce la lista e aggiorna le scorte.</p>
            </div>
          </div>

          {/* --- Sezione Scorte / Inventario --- */}
          <div style={styles.sectionLifted}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.h3}>🏠 Stato Scorte</h3>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={toggleVoiceInventory} style={styles.voiceBtn} disabled={busy}>
                  {invRecBusy ? '⏹️ Stop' : '🎙 Vocale Scorte/Scadenze'}
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
              <form onSubmit={addManualStock} style={styles.formRow}>
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
              <form onSubmit={addManualExpiry} style={styles.formRow}>
                <input style={styles.input} placeholder="Prodotto" value={expiryForm.name}
                       onChange={e=>setExpiryForm(f=>({...f,name:e.target.value}))} required />
                <input style={{...styles.input, width:220}} placeholder="Scadenza (YYYY-MM-DD o 15/08/2025)" value={expiryForm.expiresAt}
                       onChange={e=>setExpiryForm(f=>({...f,expiresAt:e.target.value}))} required />
                <button style={styles.primaryBtn} disabled={busy}>Imposta scadenza</button>
              </form>
            )}

            {/* Critici in evidenza */}
            <div style={{ marginTop: 8 }}>
              <h4 style={styles.h4}>⚠️ In esaurimento / in scadenza</h4>
              {critical.length === 0 ? (
                <p style={{ opacity:.8, marginTop:4 }}>Nessun prodotto critico.</p>
              ) : (
                <div style={styles.stockGrid}>
                  {critical.map((s, i) => {
                    const { current, baseline, pct } = residueInfo(s);
                    const w = Math.round(pct*100);
                    return (
                      <div key={i} style={styles.stockCardCritical}>
                        <div style={styles.stockTitle}>
                          {s.name}{s.brand ? <span style={styles.rowBrand}> · {s.brand}</span> : null}
                        </div>
                        <div style={styles.progressOuter}>
                          <div style={{ ...styles.progressInner, width: `${w}%`, background: colorForPct(pct) }} />
                        </div>
                        <div style={styles.stockLineSmall}>
                          {Math.round(current)}/{Math.max(1, Math.round(baseline))} {s.unitLabel || 'unità'}
                          {s.expiresAt ? <span style={styles.expiryChip}>scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Elenco scorte completo */}
            <div style={{ marginTop: 12 }}>
              <h4 style={styles.h4}>Tutte le scorte</h4>
              {stock.length === 0 ? (
                <p style={{ opacity:.8 }}>Nessuna scorta registrata.</p>
              ) : (
                <div style={styles.stockGrid}>
                  {stock.map((s, idx) => {
                    const { current, baseline, pct } = residueInfo(s);
                    const w = Math.round(pct*100);
                    const zebra = idx % 2 === 0;
                    return (
                      <div key={idx} style={{ ...(zebra ? styles.stockCardZ1 : styles.stockCardZ2) }}>
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
                              >OCR scad.</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={styles.stockTitle}>
                              {s.name}{s.brand ? <span style={styles.rowBrand}> · {s.brand}</span> : null}
                            </div>
                            <div style={styles.progressOuter}>
                              <div style={{ ...styles.progressInner, width: `${w}%`, background: colorForPct(pct) }} />
                            </div>
                            <div style={styles.stockLineSmall}>
                              {Math.round(current)}/{Math.max(1, Math.round(baseline))} {s.unitLabel || 'unità'}
                              {s.expiresAt ? <span style={styles.expiryChip}>scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}</span> : null}
                            </div>
                            <div style={{ display:'flex', gap:8, marginTop:6 }}>
                              <button onClick={()=>startRowEdit(idx, s)} style={styles.smallGhostBtn}>Modifica</button>
                              <button
                                onClick={() => applyDeltaToStock(idx, { setUnits: 0 })}
                                style={styles.smallDangerBtn}
                                title="Imposta residuo a 0"
                              >Svuota</button>
                              <button
                                title="OCR scadenza per questo prodotto"
                                onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }}
                                style={styles.smallGhostBtn}
                              >OCR scad.</button>
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

      {/* input file unico per OCR scadenza di riga */}
      <input
        ref={rowOcrInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        hidden
        onChange={async (e) => {
          const file = (e.target.files || [])[0];
          e.target.value = '';
          if (!file) return;

          // Determina prodotto target: se targetRowIdx è un id di lista, prendi da lista; se è indice scorte, prendi da stock
          let itemName = '';
          let brand = '';
          const byId = (lists[currentList] || []).find(i => i.id === targetRowIdx);
          if (byId) {
            itemName = byId.name;
            brand = byId.brand || '';
          } else if (typeof targetRowIdx === 'number' && stock[targetRowIdx]) {
            itemName = stock[targetRowIdx].name;
            brand = stock[targetRowIdx].brand || '';
          } else {
            showToast('Elemento non trovato per OCR scadenza', 'err');
            return;
          }

          try {
            setBusy(true);
            const fd = new FormData();
            fd.append('images', file);
            const ocrRes = await timeoutFetch(API_OCR, { method:'POST', body: fd }, 30000);
            const o = await readJsonSafe(ocrRes);
            if (!o.ok) throw new Error(o.error || 'Errore OCR');
            const ocrText = String(o.text || '').trim();
            if (!ocrText) throw new Error('Nessun testo letto');

            // Chiedi solo la scadenza del prodotto target
            const prompt = buildExpiryPrompt(itemName, brand, ocrText);
            const r = await timeoutFetch(API_ASSISTANT_TEXT, {
              method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt })
            }, 25000);
            const safe = await readJsonSafe(r);
            const answer = safe?.answer || safe?.data || safe;
            const parsed = typeof answer === 'string' ? (()=>{ try { return JSON.parse(answer); } catch { return null; } })() : answer;
            const ex = ensureArray(parsed?.expiries).map(e => toISODate(e.expiresAt)).filter(Boolean)[0];

            if (!ex) { showToast('Nessuna data trovata', 'err'); return; }

            setStock(prev => {
              const arr = [...prev];
              // prova a colpire prima per nome+brand
              let hit = arr.findIndex(s => isSimilar(s.name, itemName) && (!brand || isSimilar(s.brand||'', brand)));
              if (hit < 0) hit = arr.findIndex(s => isSimilar(s.name, itemName));
              if (hit >= 0) {
                arr[hit] = { ...arr[hit], expiresAt: ex };
                return arr;
              }
              // se non c'è scorta, crea segnaposto con la scadenza
              arr.unshift({
                name: itemName, brand: brand || '',
                packs: 0, unitsPerPack: 1, unitLabel: 'unità',
                expiresAt: ex, baselinePacks: 0, lastRestockAt: '', avgDailyUnits: 0, residueUnits: 0
              });
              return arr;
            });
            showToast('Scadenza aggiornata ✓', 'ok');
          } catch (err) {
            console.error('[Row OCR expiry]', err);
            showToast(`Errore OCR scadenza: ${err?.message || err}`, 'err');
          } finally {
            setBusy(false);
            setTargetRowIdx(null);
          }
        }}
      />
    </>
  );
}

/* =================== Styles =================== */
const styles = {
  page: {
    minHeight:'100vh',
    background:'radial-gradient(1200px 1200px at 10% -10%, rgba(90,130,160,.25), transparent), radial-gradient(1200px 1200px at 110% 10%, rgba(60,110,140,.25), transparent), linear-gradient(180deg, #0b1520, #0e1b27 60%, #0b1520)',
    padding:'24px 16px',
    color:'#f8f1dc' /* beige chiaro con un filo di giallo */,
    textShadow:'0 0 6px rgba(255,245,200,.15)'
  },
  card: {
  maxWidth:1000, margin:'0 auto',
  background:'transparent',                   // <— TRASPARENTE
  backdropFilter:'none',
  border:'1px solid rgba(255,255,255,.06)',
  borderRadius:18, padding:16,
  boxShadow:'0 12px 40px rgba(0,0,0,.0)'      // <— via l’ombra scura
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
  primaryBtn:{ padding:'10px 14px', borderRadius:12, border:'1px solid #3f6212', background:'linear-gradient(180deg,#4d7c0f,#3f6212)', color:'#eff6ff', fontWeight:700 },

  sectionLarge:{ marginTop:10, padding:12, borderRadius:14, background:'rgba(18,26,38,.55)', border:'1px solid rgba(255,255,255,.06)' },
  sectionLifted:{ marginTop:14, padding:12, borderRadius:16, background:'rgba(28,36,50,.62)', border:'1px solid rgba(255,255,255,.08)', boxShadow:'0 12px 32px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.03)' },
  sectionHeaderRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:8 },

  h3:{ margin:'0 0 6px', fontSize:'1.2rem', fontWeight:800, letterSpacing:.5, textShadow:'0 0 10px rgba(160,225,255,.25)' },
  h4:{ margin:'2px 0 6px', fontSize:'1rem', fontWeight:800, opacity:.95 },

  formRow:{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' },
  formRowWrap:{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', marginTop:6 },
  input:{
    flex:'1 1 180px', minWidth:170, padding:'10px 12px', borderRadius:12,
    background:'rgba(8,14,22,.75)', color:'#f8f1dc', border:'1px solid #334155', outline:'none'
  },

  listGrid:{ display:'grid', gridTemplateColumns:'1fr', gap:8 },
  rowButton:{
    display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'10px 12px',
    borderRadius:14, cursor:'pointer', userSelect:'none', boxShadow:'0 8px 18px rgba(0,0,0,.35)'
  },
  rowButtonToBuy:{
    background:'linear-gradient(180deg,#7f1d1d,#450a0a)', border:'1px solid #7f1d1d', color:'#fff4ea'
  },
  rowButtonBought:{
    background:'linear-gradient(180deg,#166534,#064e3b)', border:'1px solid #166534', color:'#ecfeff'
  },
  rowLeft:{ display:'flex', flexDirection:'column' },
  rowName:{ fontWeight:800, letterSpacing:.4, marginBottom:2 },
  rowBrand:{ opacity:.85, fontWeight:600 },
  rowMeta:{ opacity:.9, fontSize:'.92rem' },
  rowActions:{ display:'flex', gap:6, alignItems:'center' },

  smallQtyBtn:{ padding:'6px 10px', borderRadius:10, border:'1px solid #334155', background:'rgba(17,24,39,.75)', color:'#e5e7eb', fontWeight:800 },
  smallOkBtn:{ padding:'6px 10px', borderRadius:10, border:'1px solid #166534', background:'linear-gradient(180deg,#16a34a,#15803d)', color:'#052e13', fontWeight:900 },
  smallGhostBtn:{ padding:'6px 10px', borderRadius:10, border:'1px solid #334155', background:'transparent', color:'#e5e7eb' },
  smallDangerBtn:{ padding:'6px 10px', borderRadius:10, border:'1px solid #7f1d1d', background:'linear-gradient(180deg,#991b1b,#7f1d1d)', color:'#fff0ea' },

  badgeBought:{ marginLeft:8, padding:'2px 8px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:'.78rem', fontWeight:800 },
  badgeToBuy:{ marginLeft:8, padding:'2px 8px', borderRadius:999, background:'rgba(239,68,68,.22)', border:'1px solid rgba(239,68,68,.4)', fontSize:'.78rem', fontWeight:800 },

  stockGrid:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 },
  stockCardCritical:{
    padding:10, borderRadius:14, background:'linear-gradient(180deg,rgba(60,35,35,.85),rgba(40,20,20,.9))',
    border:'1px solid rgba(255,120,120,.25)', boxShadow:'0 10px 22px rgba(0,0,0,.38)'
  },
  stockCardZ1:{
    padding:10, borderRadius:14, background:'linear-gradient(180deg,rgba(22,30,44,.9),rgba(16,22,34,.9))',
    border:'1px solid rgba(255,255,255,.06)'
  },
  stockCardZ2:{
    padding:10, borderRadius:14, background:'linear-gradient(180deg,rgba(18,26,40,.9),rgba(14,20,30,.9))',
    border:'1px solid rgba(255,255,255,.07)', filter:'saturate(1.08)'
  },
  stockTitle:{ fontWeight:800, marginBottom:6 },
  progressOuter:{ height:8, borderRadius:999, background:'rgba(255,255,255,.08)', overflow:'hidden', border:'1px solid rgba(255,255,255,.1)' },
  progressInner:{ height:'100%', borderRadius:999, transition:'width .25s ease' },
  stockLineSmall:{ marginTop:6, opacity:.92, fontSize:'.92rem', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' },
  expiryChip:{ padding:'2px 8px', borderRadius:999, background:'rgba(250,204,21,.18)', border:'1px solid rgba(250,204,21,.35)', fontWeight:700 }
};

