
// pages/liste-prodotti.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;

// Endpoints esistenti
const API_ASSISTANT_TEXT = '/api/assistant'; // usa il tuo assistant.js
const API_OCR = '/api/ocr';                  // usa il tuo ocr.js
const API_FINANCES_INGEST = '/api/finances/ingest';

/* ----------------- Lessico supermercato ----------------- */
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

/* ---------------- utils testo ---------------- */
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

/* ——— capisce se l’utente vuole “impostare a …” invece di aggiungere ——— */
function wantsAbsoluteSet(text) {
  const t = normKey(text);
  return /(porta\s+a|imposta\s+a|metti\s+a|fissa\s+a|in\s+totale|totali|ora\s+sono|adesso\s+sono|fai\s+che\s+siano)/i.test(t);
}

/* ---------------- parser liste (aggiunta rapida da testo) ---------------- */
function parseLinesToItems(text) {
  const chunks = String(text || '')
    .split(/[\n,;]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  const items = [];
  for (const raw of chunks) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;

    // Prova a ricavare confezioni/unità da testo
    const packInfo = extractPackInfo(s); // {packs, unitsPerPack, unitLabel}
    let packs = Number(packInfo.packs || 1);

    // Nome + brand
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
        qty: Number.isFinite(packs) && packs > 0 ? packs : 1, // qty = confezioni richieste nella lista
        unitsPerPack: Number(packInfo.unitsPerPack || 1),
        unitLabel: packInfo.unitLabel || 'unità',
        purchased: false,
      });
    }
  }
  return items;
}

/* ------------- helpers scadenze ------------- */
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

/** Parser scadenze più severo e ampliato */
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

/* ---------- fetch helpers robusti ---------- */
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

/* ---------------- Confezioni × Unità helpers ---------------- */
function totalUnitsOf(s){ return (Number(s.packs||0) * Number(s.unitsPerPack||1)); }
// clamp 0..1
function clamp01(x){ return Math.max(0, Math.min(1, Number(x) || 0)); }

// Calcola unità correnti, baseline e percentuale (usa baselinePacks come "pieno")
function residueUnitsOf(s){
  const upp = Math.max(1, Number(s.unitsPerPack || 1));
  const ru = Number(s.residueUnits);
  if (Number.isFinite(ru)) return Math.max(0, ru);
  // default: se mai impostato, usa packs*upp
  return Math.max(0, Number(s.packs || 0) * upp);
}
function baselineUnitsOf(s){
  const upp = Math.max(1, Number(s.unitsPerPack || 1));
  const bp  = Number(s.baselinePacks);
  const base = Number.isFinite(bp) && bp > 0 ? bp * upp : Number(s.packs || 0) * upp;
  return Math.max(upp, base);
}
// sostituisce la tua residueInfo precedente
function residueInfo(s){
  const current  = residueUnitsOf(s);
  const baseline = baselineUnitsOf(s);
  const pct = baseline ? clamp01(current / baseline) : 1;
  return { current, baseline, pct };
}

// Soglie colore: ≥60% verde, 30–59% ambra, <30% rosso
const RESIDUE_THRESHOLDS = { green: 0.60, amber: 0.30 };

function colorForPct(p){
  const x = clamp01(p);
  if (x >= RESIDUE_THRESHOLDS.green) return '#16a34a'; // verde
  if (x >= RESIDUE_THRESHOLDS.amber) return '#f59e0b'; // ambra
  return '#ef4444';                                    // rosso
}

// Giorni alla scadenza (∞ se non impostata/non valida)
function daysToExpiry(iso){
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  const now = new Date();
  return Math.floor((d - now) / 86400000);
}

// True se scade entro N giorni (default 10)
function isExpiringSoon(s, days=10){
  return daysToExpiry(s?.expiresAt) <= days;
}

/** Estrae {packs, unitsPerPack, unitLabel} da una stringa riga-prodotto */
function extractPackInfo(str){
  const s = normKey(str);

  let packs = 1;
  let unitsPerPack = 1;
  let unitLabel = 'unità';

  // unit terms extra: bottiglie, merendine, bustine, monouso
  const UNIT_TERMS = '(?:pz|pezzi|unit[aà]|barrett[e]?|vasett[i]?|uova|bottiglie?|merendine?|bustin[ae]|monouso)';

  // "2 confezioni da 6 [unit]" / "1 pacco x 10 pz" / "una confezione da 6 di latte"
  let m = s.match(new RegExp(String.raw`(\d+)\s*(?:conf(?:e(?:zioni)?)?|pacc?hi?|scatol[ae])\s*(?:da|x)\s*(\d+)\s*(?:${UNIT_TERMS})?`, 'i'));
  if (m){
    packs = Number(m[1]);
    unitsPerPack = Number(m[2]);
    const u = (m[3] || 'unità')
      .replace(/pz|pezzi/i,'unità');
    unitLabel = u;
    return { packs, unitsPerPack, unitLabel };
  }

  // "4x125" → 1 conf. da 4 unità (grammatura ignorata)
  m = s.match(/(\d+)\s*[x×]\s*\d+\s*(?:g|kg|ml|cl|l|lt)?/i);
  if (m){
    packs = 1;
    unitsPerPack = Number(m[1]);
    return { packs, unitsPerPack, unitLabel };
  }

  // "10 pz"/"10 unità"/"10 vasetti"/"10 uova"/"10 bottiglie"/"10 merendine"/"10 bustine"/"10 monouso"
  m = s.match(new RegExp(String.raw`(\d+)\s*${UNIT_TERMS}\b`, 'i'));
  if (m){
    packs = 1;
    unitsPerPack = Number(m[1]);
    unitLabel = m[2] ? m[2].replace(/pz|pezzi/i,'unità') : 'unità';
    return { packs, unitsPerPack, unitLabel };
  }

  // "3 bottiglie"/"2 pacchi"/"2 confezioni"/"2 scatole"
  m = s.match(new RegExp(String.raw`(\d+)\s*(bottiglie?|pacc?hi?|scatol[ae]|conf(?:e(?:zioni)?)?)`, 'i'));
  if (m){
    packs = Number(m[1]);
    unitsPerPack = 1;
    unitLabel = (/^bott/i.test(m[2]) ? 'bottiglie' : 'unità');
    return { packs, unitsPerPack, unitLabel };
  }

  // leading qty "2 latte" → 2 conf. da 1
  m = s.match(/^(\d+(?:[.,]\d+)?)\s+[a-z]/i);
  if (m){
    packs = Number(String(m[1]).replace(',','.')) || 1;
    unitsPerPack = 1;
    return { packs, unitsPerPack, unitLabel };
  }

  return { packs, unitsPerPack, unitLabel };
}

/* ------------- Prompt builder: scontrino ------------- */
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

/* ------------- Prompt builder: scadenza singola ------------- */
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

/* --------- Prompt builder: INTENTO VOCALE SCORTE/SCADENZE (unificato) --------- */
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

/* ------------- Fallback parser OCR locale (packs/units) ------------- */
function parseReceiptPurchases(ocrText) {
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const ignore = /(totale|iva|bancomat|contanti|resto|scontrino|cassa|cliente|sconto|subtotale|pagato|euro)/i;

  const out = [];
  for (let raw of lines) {
    if (ignore.test(raw)) continue;
    let name = raw;
    let brand = '';

    // brand: ultima parola capitalizzata (approssimazione)
    const parts = name.split(' ');
    if (parts.length>1 && /^[A-ZÀ-ÖØ-Þ]/.test(parts[parts.length-1])) {
      brand = parts.pop();
      name = parts.join(' ');
    }

    // normalizza nome
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
/** Trova il nome prodotto migliore in una frase usando il lessico */
function guessProductName(chunk) {
  let best = '';
  let bestLen = 0;
  for (const lex of GROCERY_LEXICON) {
    if (isSimilar(chunk, lex) && lex.length > bestLen) { best = lex; bestLen = lex.length; }
  }
  // fallback: prima parola significativa
  if (!best) {
    const t = normKey(chunk).split(' ').filter(Boolean);
    if (t.length) best = t.slice(0, 2).join(' ');
  }
  return best.trim();
}

/** True se la frase suona come “sono/ce ne sono/ne ho …” ⇒ set residuo (units) */
function looksLikeSetResidue(text) {
  const t = normKey(text);
  return /\b(sono|ce\s+ne\s+sono|ce\s+n'?e\s+sono|ne\s+ho|adesso\s+sono|ora\s+sono|in\s+totale\s+sono)\b/.test(t);
}

/* --------- Parser VOCALE per aggiornare scorte (robusto, ignora anni/date) --------- */
/* --------- Parser VOCALE per aggiornare scorte (esteso) --------- */
function parseStockUpdateText(text) {
  const t = normKey(text);

  // Spezzatura morbida
  const parts = t.split(/[,;]+/g).map(s => s.trim()).filter(Boolean);

  const res = [];
  const absolute = wantsAbsoluteSet(text); // “porta a … / imposta a …”

  for (let rawChunk of parts) {
    // Skip se parla di scadenze/date
    if (/scad|scadenza|scade|entro/.test(rawChunk)) continue;
    if (/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(rawChunk)) continue;
    if (/\b20\d{2}\b/.test(rawChunk)) continue;

    // Spezza su “ e ”, poi processa ogni pezzetto
    const chunks = rawChunk.split(/\s+e\s+/g).map(s => s.trim()).filter(Boolean);

    for (const chunk of chunks) {
      // 2.a) Caso “solo nome” → +1 confezione, 1 unità/conf., residuo aggiornato dal flusso applicativo
      if (!/\d/.test(chunk)) {
        const nameOnly = guessProductName(chunk);
        if (nameOnly) {
          res.push({ name: nameOnly, mode: 'packs', value: 1, op: 'add', _upp: 1 });
        }
        continue;
      }

      // 2.b) Caso “una confezione di latte da 6 bottiglie” (ordine libero)
      // Trova il nome presente nel chunk
      let name = '';
      for (const lex of GROCERY_LEXICON) { if (isSimilar(chunk, lex)) { name = lex; break; } }
      if (!name) name = guessProductName(chunk);

      // Estrai pattern confezioni/unità da testo completo
      const pack = extractPackInfo(chunk); // {packs, unitsPerPack, unitLabel}

      // 2.c) Caso “latte sono 2 bottiglie / sono due …” → set residuo (units), NO modifica packs/upp
      if (looksLikeSetResidue(chunk)) {
        // Trova numero + unità/“due”
        let m = chunk.match(/(\d+(?:[.,]\d+)?)\s*(bottiglie?|unit[aà]|pz|pezzi|vasetti|uova|barrette)?$/i);
        if (!m && /\b(due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/i.test(chunk)) {
          const map = { due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7, otto:8, nove:9, dieci:10 };
          const w = chunk.match(/\b(due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/i);
          if (w) m = [null, String(map[w[1].toLowerCase()]), '']; // finto match
        }
        const val = m ? Number(String(m[1]).replace(',','.')) : NaN;
        if (name && Number.isFinite(val) && val > 0) {
          res.push({ name, mode: 'units', value: val, op: 'setResidue' });
          continue;
        }
      }

      // 2.d) Caso classico “latte 3 bottiglie / pasta 2 pacchi …”
      const mClassic = chunk.match(/^(.*?)(?:\s+(?:sono|e'|è|=))?\s*(\d+(?:[.,]\d+)?)\s*(bottiglie?|bott|pacchi?|conf(?:e(?:zioni)?)?|scatol[ae]|unit[aà]|pz|pezzi|barrett[e]?|vasett[i]?|uova)?$/i);
      if (mClassic) {
        let nm = (mClassic[1]||'').trim();
        if (!nm) nm = name;
        for (const lex of GROCERY_LEXICON) { if (isSimilar(nm, lex)) { nm = lex; break; } }

        const value = Math.max(0, Number(String(mClassic[2]).replace(',','.')) || 0);
        if (!nm || !value) continue;

        const tag = (mClassic[3]||'').toLowerCase();
        const asUnits = /unit|pz|pezzi|barrett|vasett|uova|bott/.test(tag);
        const mode = asUnits ? 'units' : 'packs';
        const op = absolute ? 'set' : 'add';

        // Se abbiamo già capito le unità/conf. dal testo, portiamole nel payload (_upp)
        const _upp = Number(pack.unitsPerPack || (asUnits ? value : 1)) || 1;

        res.push({ name: nm, mode, value, op, _upp });
        continue;
      }

      // 2.e) Fallback “ho capito le confezioni dal testo”
      if (name && (pack.packs || pack.unitsPerPack)) {
        res.push({ name, mode: 'packs', value: Math.max(1, Number(pack.packs||1)), op: 'add', _upp: Math.max(1, Number(pack.unitsPerPack||1)) });
      }
    }
  }
  return res;
}

/* ---------- calcoli consumo/aggiornamento ---------- */
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
    residueUnits: fullUnits, // pieno al restock
  };
}
/* ---------------- component ---------------- */
export default function ListeProdotti() {
  const [currentList, setCurrentList] = useState(LIST_TYPES.SUPERMARKET);

  // Liste
  const [lists, setLists] = useState({
    [LIST_TYPES.SUPERMARKET]: [],
    [LIST_TYPES.ONLINE]: [],
  });

  // Form Lista (ora con confezioni + unità/conf.)
  const [form, setForm] = useState({ name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità' });

  // Scorte & critici
  // Record scorta:
  // { name, brand, packs, unitsPerPack, unitLabel, expiresAt?, baselinePacks?, lastRestockAt?, avgDailyUnits? }
  const [stock, setStock] = useState([]);
  const [critical, setCritical] = useState([]);
  // 
  const [editingRow, setEditingRow] = useState(null);
  const [editDraft, setEditDraft] = useState({
    name: '',
    brand: '',
    packs: '0',
    unitsPerPack: '1',
    unitLabel: 'unità',
    expiresAt: ''
  });
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
    _ruTouched: false,     // <-- nuovo flag
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

    // Le CONFEZIONI vengono SOLO dal campo "Confezioni"
    const newPacks = Math.max(0, Number(String(editDraft.packs).replace(',','.')) || 0);

    const todayISO = new Date().toISOString().slice(0,10);
    const uppOld = Math.max(1, Number(old.unitsPerPack || 1));
    const wasUnits = Math.max(0, Number(old.packs || 0) * uppOld);
    const nowUnits = Math.max(0, newPacks * unitsPerPack);
    const restock = nowUnits > wasUnits;

    // RESIDUO: indipendente dalle confezioni
    let ru = residueUnitsOf(old); // se assente → packs*upp
    const ruTouched = Object.prototype.hasOwnProperty.call(editDraft, '_ruTouched') ? !!editDraft._ruTouched : false;
    if (ruTouched) {
      const ruRaw = Number(String(editDraft.residueUnits ?? '').replace(',','.'));
      if (Number.isFinite(ruRaw)) ru = Math.max(0, ruRaw);
    }
    const fullNow = Math.max(unitsPerPack, nowUnits); // pieno attuale
    ru = Math.min(ru, fullNow); // mai oltre il pieno

    // Consumo medio stimato (se diminuisce rispetto all’ultimo restock)
    const avgDailyUnits = computeNewAvgDailyUnits(old, newPacks);

    // Componi l'oggetto finale
    let next = {
      ...old,
      name, brand,
      packs: newPacks,
      unitsPerPack, unitLabel,
      expiresAt,
      avgDailyUnits,
    };

    if (restock) {
      // aumento = restock → baseline e residueUnits al pieno
      next = { ...next, ...restockTouch(newPacks, todayISO, unitsPerPack) };
    } else {
      // nessun restock: aggiorna solo il residuo (clamp ≤ pieno)
      next.residueUnits = ru;
    }

    arr[index] = next;
    return arr;
  });

  setEditingRow(null);
}

  // Stato UI
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  

  // Vocale: LISTA
  theMediaWorkaround();
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // Vocale: INVENTARIO UNIFICATO (Scorte + Scadenze)
  const invMediaRef = useRef(null);
  const invChunksRef = useRef([]);
  const invStreamRef = useRef(null);
  const [invRecBusy, setInvRecBusy] = useState(false);

  // OCR input (scontrini)
  const ocrInputRef = useRef(null);

  // OCR scadenza per riga
  const rowOcrInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);
  

  // Form Aggiunta Scorta manuale
  const [stockForm, setStockForm] = useState({
    name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità', expiresAt: ''
    
  });

  const curItems = lists[currentList] || [];

 /* --------------- derivati: prodotti critici --------------- */
useEffect(() => {
  const crit = stock.filter(p => {
    const upp = Math.max(1, Number(p.unitsPerPack || 1));

    // Unità residue correnti: preferisci residueUnits se esiste, altrimenti packs*upp
    const ru = Number(p.residueUnits);
    const currentUnits = Number.isFinite(ru)
      ? Math.max(0, ru)
      : Math.max(0, Number(p.packs || 0) * upp);

    // Baseline: preferisci baselinePacks*upp; fallback packs*upp; minimo = upp
    const bp = Number(p.baselinePacks);
    const baselineUnits = Math.max(
      upp,
      (Number.isFinite(bp) && bp > 0 ? bp * upp : Number(p.packs || 0) * upp)
    );

    const pct = baselineUnits ? (currentUnits / baselineUnits) : 1;

    const lowResidue = pct < 0.20;          // <20% residuo
    const expSoon   = isExpiringSoon(p, 10); // scadenza entro 10 giorni

    return lowResidue || expSoon;
  });

  setCritical(crit);
}, [stock]);


  /* ---------------- LISTE: add/remove/inc/Comprato ---------------- */
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

 // Segna acquistato (confezioni) + aggiorna scorte
function markBought(id, amount = 1) {
  const item = (lists[currentList] || []).find(i => i.id === id);
  if (!item) return;

  const movePacks = Math.max(1, Math.min(Number(item.qty || 0), Number(amount || 1)));
  const moveUPP   = Math.max(1, Number(item.unitsPerPack || 1));
  const moveLabel = item.unitLabel || 'unità';

  // 1) aggiorna la lista
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

  // 2) aggiorna scorte (restock → baseline & residuo al pieno)
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
        ...restockTouch(newPacks, todayISO, upp), // <- passa anche UPP
      };
    } else {
      arr.unshift({
        name: item.name,
        brand: item.brand || '',
        packs: movePacks,
        unitsPerPack: moveUPP,
        unitLabel: moveLabel,
        expiresAt: '',
        ...restockTouch(movePacks, todayISO, moveUPP), // <- pieno al primo inserimento
        avgDailyUnits: 0,
      });
    }
    return arr;
  });
}


  /* ---------------- Vocale: LISTA (aggiunta veloce) ---------------- */
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
      if (DEBUG) console.log('[STT list] text:', text);
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

  /* ---------------- OCR: supporto decremento su entrambe le liste ---------------- */
 /* ---------------- OCR: supporto decremento su entrambe le liste (matcher tollerante) ---------------- */
function decrementAcrossBothLists(prevLists, purchases) {
  const next = { ...prevLists };

  const decList = (listKey) => {
    const arr = [...(next[listKey] || [])];

    for (const p of purchases) {
      const dec = Math.max(1, Number(p.packs ?? p.qty ?? 1));
      const brand = (p.brand || '').trim();
      const upp = Number(p.unitsPerPack ?? 1);

      // 1) match stretto: nome ~, brand (se presente) ~, unitsPerPack uguali
      let idx = arr.findIndex(i =>
        isSimilar(i.name, p.name) &&
        (!brand || isSimilar(i.brand || '', brand)) &&
        Number(i.unitsPerPack || 1) === upp
      );

      // 2) se non trovato: ignora unitsPerPack
      if (idx < 0) {
        idx = arr.findIndex(i =>
          isSimilar(i.name, p.name) &&
          (!brand || isSimilar(i.brand || '', brand))
        );
      }

      // 3) estremo: solo nome
      if (idx < 0) {
        idx = arr.findIndex(i => isSimilar(i.name, p.name));
      }

      if (idx >= 0) {
        const cur = arr[idx];
        const newQty = Math.max(0, Number(cur.qty || 0) - dec);
        arr[idx] = { ...cur, qty: newQty, purchased: true };
      }
    }

    // rimuovi dalla lista quelli portati a zero e marcati come comprati
    next[listKey] = arr.filter(i => Number(i.qty || 0) > 0 || !i.purchased);
  };

  decList(LIST_TYPES.SUPERMARKET);
  decList(LIST_TYPES.ONLINE);
  return next;
}


  /* ---------------- OCR: scontrini ---------------- */
  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      setBusy(true);

      // 1) OCR testo dallo scontrino
      const fdOcr = new FormData();
      files.forEach((f) => fdOcr.append('images', f));
      const ocrRes = await timeoutFetch(API_OCR, { method: 'POST', body: fdOcr }, 40000);
      const ocrJson = await readJsonSafe(ocrRes);
      if (!ocrJson.ok) throw new Error(ocrJson.error || `HTTP ${ocrRes.status}`);
      const ocrText = String(ocrJson?.text || '').trim();
      if (!ocrText) throw new Error('Risposta vuota dal servizio OCR');

      // 2) Estrazione strutturata con Assistant
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

      // fallback locale
      if (!purchases.length) purchases = parseReceiptPurchases(ocrText);

      // 3) aggiorna liste, scorte e finanze
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
                ...restockTouch(newPacks, todayISO)
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
                avgDailyUnits: 0
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

  function setResidualUnits(i) {
  const it = stock[i];
  if (!it) return;
  const upp = Math.max(1, Number(it.unitsPerPack || 1));
  const currentRU = Number.isFinite(Number(it.residueUnits))
    ? Math.max(0, Number(it.residueUnits))
    : Math.max(0, Number(it.packs || 0) * upp);

  const v = prompt(`Imposta Residuo unità per "${it.name}"`, String(Math.round(currentRU)));
  if (v == null) return;

  const units = Math.max(0, Number(String(v).replace(',','.')) || 0);
  // IMPORTANTISSIMO: aggiorna SOLO residueUnits (niente conversione in packs)
  applyDeltaToStock(i, { setUnits: units });
}


  /* ---------------- Modifica / Elimina scorte ---------------- */
 /* ---------------- Modifica / Elimina scorte ---------------- */
 
  function editStockRow(i) {
    const it = stock[i];
    if (!it) return;
    const name = prompt('Nome prodotto:', it.name);
    if (name == null || !name.trim()) return;
    const brand = prompt('Marca (opzionale):', it.brand || '');
    if (brand == null) return;

    const packsStr = prompt('Confezioni (può essere decimale es. 1.5):', String(it.packs ?? 0));
    if (packsStr == null) return;
    const packs = Math.max(0, Number(String(packsStr).replace(',','.')) || 0);

    const uppStr = prompt('Unità per confezione:', String(it.unitsPerPack ?? 1));
    if (uppStr == null) return;
    const unitsPerPack = Math.max(1, Number(String(uppStr).replace(',','.')) || 1);

    const unitLabel = prompt('Etichetta unità (es. unità, bottiglie, vasetti):', it.unitLabel || 'unità');
    if (unitLabel == null) return;

    const expStr = prompt('Scadenza (YYYY-MM-DD) opzionale:', it.expiresAt || '');
    const ex = expStr ? toISODate(expStr) : '';

    setStock(prev => {
      const arr = [...prev];
      const old = arr[i];
      const todayISO = new Date().toISOString().slice(0,10);
      const avgDailyUnits = computeNewAvgDailyUnits(old, packs);

      // aumento? allora è restock
      const uppOld = Math.max(1, Number(old.unitsPerPack || 1));
      const wasUnits = Number(old.packs || 0) * uppOld;
      const nowUnits = packs * unitsPerPack;
      const restock = nowUnits > wasUnits;

      arr[i] = {
        ...old,
        name: name.trim(),
        brand: (brand||'').trim(),
        packs, unitsPerPack, unitLabel,
        expiresAt: ex || '',
        avgDailyUnits,
        ...(restock ? restockTouch(packs, todayISO) : {})
      };
      return arr;
    });
  }

  function deleteStockRow(i) {
    const it = stock[i];
    if (!it) return;
    if (!confirm(`Eliminare "${it.name}${it.brand?   ` (${it.brand})`:''}" dalle scorte?`)) return;
    setStock(prev => prev.filter((_, idx) => idx !== i));
  }
  function editStockRow(i) {
    const it = stock[i];
    if (!it) return;
    const name = prompt('Nome prodotto:', it.name);
    if (name == null || !name.trim()) return;
    const brand = prompt('Marca (opzionale):', it.brand || '');
    if (brand == null) return;

    const packsStr = prompt('Confezioni (può essere decimale es. 1.5):', String(it.packs ?? 0));
    if (packsStr == null) return;
    const packs = Math.max(0, Number(String(packsStr).replace(',','.')) || 0);

    const uppStr = prompt('Unità per confezione:', String(it.unitsPerPack ?? 1));
    if (uppStr == null) return;
    const unitsPerPack = Math.max(1, Number(String(uppStr).replace(',','.')) || 1);

    const unitLabel = prompt('Etichetta unità (es. unità, bottiglie, vasetti):', it.unitLabel || 'unità');
    if (unitLabel == null) return;

    const expStr = prompt('Scadenza (YYYY-MM-DD) opzionale:', it.expiresAt || '');
    const ex = expStr ? toISODate(expStr) : '';

    setStock(prev => {
      const arr = [...prev];
      const old = arr[i];
      const todayISO = new Date().toISOString().slice(0,10);
      const avgDailyUnits = computeNewAvgDailyUnits(old, packs);

      // aumento? allora è restock
      const uppOld = Math.max(1, Number(old.unitsPerPack || 1));
      const wasUnits = Number(old.packs || 0) * uppOld;
      const nowUnits = packs * unitsPerPack;
      const restock = nowUnits > wasUnits;

      arr[i] = {
        ...old,
        name: name.trim(),
        brand: (brand||'').trim(),
        packs, unitsPerPack, unitLabel,
        expiresAt: ex || '',
        avgDailyUnits,
        ...(restock ? restockTouch(packs, todayISO) : {})
      };
      return arr;
    });
  }

  function deleteStockRow(i) {
    const it = stock[i];
    if (!it) return;
    if (!confirm(`Eliminare "${it.name}${it.brand?   ` (${it.brand})`:''}" dalle scorte?`)) return;
    setStock(prev => prev.filter((_, idx) => idx !== i));
  }

  /* ---------------- OCR scadenza per riga ---------------- */
  function openRowOcr(idx) {
    setTargetRowIdx(idx);
    rowOcrInputRef.current?.click();
  }
  async function handleRowOcrChange(files) {
    if (targetRowIdx == null || !files?.length) return;
    const row = stock[targetRowIdx];
    try {
      setBusy(true);

      const fd = new FormData();
      files.forEach((f)=>fd.append('images', f));
      const ocrRes = await timeoutFetch(API_OCR, { method:'POST', body: fd }, 30000);
      const ocrJson = await readJsonSafe(ocrRes);
      if (!ocrJson.ok) throw new Error(ocrJson.error || `HTTP ${ocrRes.status}`);
      const ocrText = String(ocrJson?.text || '').trim();
      if (!ocrText) throw new Error('Risposta vuota dal servizio OCR');

      const prompt = buildExpiryPrompt(row.name, row.brand || '', ocrText);
      const r = await timeoutFetch(API_ASSISTANT_TEXT, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt })
      }, 25000);
      const safe = await readJsonSafe(r);
      const answer = safe?.answer || safe?.data || safe;
      const parsed = typeof answer === 'string' ? (()=>{ try { return JSON.parse(answer);} catch { return null; } })() : answer;

      const ex = ensureArray(parsed?.expiries)[0];
      const iso = ex?.expiresAt ? toISODate(ex.expiresAt) : '';
      if (iso) {
        setStock(prev => {
          const arr = [...prev];
          if (arr[targetRowIdx]) arr[targetRowIdx] = { ...arr[targetRowIdx], expiresAt: iso };
          return arr;
        });
        showToast('Scadenza assegnata ✓', 'ok');
      } else {
        showToast('Scadenza non riconosciuta', 'err');
      }
    } catch (e) {
      console.error('[OCR row] error', e);
      showToast(`Errore OCR scadenza: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      setTargetRowIdx(null);
      if (rowOcrInputRef.current) rowOcrInputRef.current.value = '';
    }
  }

  /* ---------------- Vocale UNIFICATO: SCADENZE + AGGIORNA SCORTE ---------------- */
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
      if (DEBUG) console.log('[STT inventory] text:', text);
      if (!text) { showToast('Nessun testo riconosciuto', 'err'); return; }

      // Heuristica veloce
      const looksExpiry = /scad|scadenza|scade|entro|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/i.test(text);

      // Parser locali
      let localIntent = looksExpiry ? 'expiry' : 'stock_update';
      let localExpiries = looksExpiry ? parseExpiryPairs(text, GROCERY_LEXICON, stock.map(s=>s.name)) : [];
      let localUpdates = !looksExpiry ? parseStockUpdateText(text) : [];

      let intent = localIntent;
      let updates = localUpdates;
      let expiries = localExpiries;

      // Se locale non trova nulla, prova Assistant
      if ((intent === 'expiry' && !expiries.length) || (intent === 'stock_update' && !updates.length)) {
        try {
          const prompt = buildInventoryIntentPrompt(text);
          const r = await timeoutFetch(API_ASSISTANT_TEXT, {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt })
          }, 25000);
          const safe = await readJsonSafe(r);
          const answer = safe?.answer || safe?.data || safe;
          const parsed = typeof answer === 'string' ? (()=>{ try { return JSON.parse(answer);} catch { return null; } })() : answer;
          const pIntent = parsed?.intent;
          if (pIntent === 'expiry') {
            intent = 'expiry';
            expiries = ensureArray(parsed?.expiries).map(e => ({ name:String(e.name||'').trim(), expiresAt: toISODate(e.expiresAt) })).filter(e=>e.name && e.expiresAt);
          } else if (pIntent === 'stock_update') {
            intent = 'stock_update';
            updates = ensureArray(parsed?.updates).map(u => ({
              name:String(u.name||'').trim(),
              mode:(u.mode==='units'?'units':'packs'),
              value: Math.max(0, Number(u.value||0)),
              op: 'add' // di default aggiunge se non specificato
            })).filter(u => u.name && u.value>0);
          }
        } catch (e) {
          if (DEBUG) console.warn('[Assistant intent fallback error]', e);
        }
      }

      if (intent === 'expiry' && expiries.length) {
        let hit = 0;
        setStock(prev => {
          const arr = [...prev];
          for (const p of expiries) {
            const idx = arr.findIndex(s => isSimilar(s.name, p.name));
            if (idx >= 0) { arr[idx] = { ...arr[idx], expiresAt: p.expiresAt || arr[idx].expiresAt }; hit++; }
          }
          return arr;
        });
        showToast(hit ? `Aggiornate ${hit} scadenze ✓` : 'Nessun prodotto corrispondente', hit ? 'ok' : 'err');
        return;
      }

      if (intent === 'stock_update' && updates.length) {
        let applied = 0;
        setStock(prev => {
          const arr = [...prev];
          const todayISO = new Date().toISOString().slice(0,10);

          for (const u of updates) {
            let idx = arr.findIndex(s => isSimilar(s.name, u.name));
            const isSet = (u.op === 'set');
            const isUnits = (u.mode === 'units');

            if (idx < 0) {
              // crea nuova riga scorte
              if (isUnits) {
                if (isSet) {
                  arr.unshift({
                    name: u.name, brand: '',
                    packs: Math.max(1, Math.ceil(Number(u.value||1))),
                    unitsPerPack: 1, unitLabel:'unità',
                    expiresAt:'', baselinePacks: Math.max(1, Math.ceil(Number(u.value||1))),
                    lastRestockAt: todayISO, avgDailyUnits:0
                  });
                } else {
                  arr.unshift({
                    name: u.name, brand: '',
                    packs: 1, unitsPerPack: Math.max(1, Math.round(Number(u.value||1))), unitLabel:'unità',
                    expiresAt:'', baselinePacks:1,
                    lastRestockAt: todayISO, avgDailyUnits:0
                  });
                }
              } else {
                const p = Math.max(0, Number(u.value||0));
                arr.unshift({
                  name: u.name, brand: '',
                  packs: p, unitsPerPack:1, unitLabel:'unità',
                  expiresAt:'', baselinePacks: p,
                  lastRestockAt: todayISO, avgDailyUnits:0
                });
              }
              applied++;
              continue;
            }

            // Esiste già
            const old = arr[idx];
            const upp = Math.max(1, Number(old.unitsPerPack || 1));
            const unitLabel = old.unitLabel || 'unità';
            let packs = Number(old.packs || 0);

            if (isUnits) {
              const currentUnits = packs * upp;
              const valUnits = Math.max(0, Number(u.value || 0));
              const newUnits = isSet ? valUnits : (currentUnits + valUnits);
              packs = newUnits / upp; // confezioni decimali permesse
            } else {
              const valPacks = Math.max(0, Number(u.value || 0));
              packs = isSet ? valPacks : (packs + valPacks);
            }

            // consumo medio (unità/giorno) se diminuisce rispetto alla baseline precedente
            let avgDailyUnits = old?.avgDailyUnits || 0;
            if (old?.lastRestockAt && Number(old.baselinePacks||0) * upp > packs * upp) {
              const days = Math.max(1, (Date.now() - new Date(old.lastRestockAt).getTime())/86400000);
              const usedUnits = (Number(old.baselinePacks||0)*upp) - (packs*upp);
              const day = usedUnits / days;
              avgDailyUnits = avgDailyUnits ? (0.6*avgDailyUnits + 0.4*day) : day;
            }

            // riallineo baseline se è un restock
            const restock = (packs * upp) > (Number(old.packs || 0) * upp);
            const after = {
              ...old, packs, unitsPerPack: upp, unitLabel, avgDailyUnits
            };
            if (restock) {
              after.baselinePacks = packs;
              after.lastRestockAt = todayISO;
            }
            arr[idx] = after;
            applied++;
          }
          return arr;
        });
        showToast(applied ? `Aggiornate ${applied} scorte ✓` : 'Nessuna scorta aggiornata', applied ? 'ok' : 'err');
        return;
      }

      showToast('Nessuna scorta/scadenza riconosciuta', 'err');
    } catch (e) {
      console.error('[Voice Inventory] error', e);
      showToast(`Errore vocale inventario: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      setInvRecBusy(false);
      try { invStreamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      invMediaRef.current = null;
      invStreamRef.current = null;
      invChunksRef.current = [];
    }
  }

  /* ---------------- Aggiunta SCORTE manuale ---------------- */
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
          ...restockTouch(newPacks, todayISO)
        };
      } else {
        arr.unshift({
          name, brand,
          packs, unitsPerPack, unitLabel,
          expiresAt: ex || '',
          baselinePacks: packs,
          lastRestockAt: todayISO,
          avgDailyUnits: 0
        });
      }
      return arr;
    });

    setStockForm({ name:'', brand:'', packs:'1', unitsPerPack:'1', unitLabel:'unità', expiresAt:'' });
    showToast('Scorta aggiunta ✓', 'ok');
  }

  /* ---------------- render ---------------- */
  return (
    <>
      <Head><title>🛍 Lista Prodotti</title></Head>

      <div style={styles.page}>
        <div style={styles.card}>
          {/* Header */}
          <div style={styles.headerRow}>
            <h2 style={{margin:0}}>🛍 Lista Prodotti</h2>
            <Link href="/home" legacyBehavior><a style={styles.homeBtn}>Home</a></Link>
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
          </div>

          {/* Lista corrente */}
          <div style={styles.sectionLarge}>
            <h3 style={styles.h3}>
              Lista corrente: <span style={{opacity:.85}}>{currentList === LIST_TYPES.ONLINE ? 'Spesa Online' : 'Supermercato'}</span>
            </h3>

            {curItems.length === 0 ? (
              <p style={{opacity:.8}}>Nessun prodotto ancora</p>
            ) : (
              <div style={styles.listGrid}>
                {curItems.map((it) => (
                  <div key={it.id} style={styles.itemRow}>
                    <div style={styles.itemMain}>
                      <div style={styles.qtyBadge}>{it.qty}</div>
                      <div>
                        <div style={styles.itemName}>{it.name}</div>
                        <div style={styles.itemBrand}>
                          {it.brand || '—'} · {it.unitsPerPack} {it.unitLabel || 'unità'}/conf.
                        </div>
                      </div>
                    </div>
                    <div style={styles.itemActions}>
                      <button
                        title="Segna 1 acquistato"
                        onClick={() => markBought(it.id, 1)}
                        style={it.purchased ? styles.actionSuccess : styles.actionDanger}
                      >
                        {it.purchased ? '✔ Comprato 1' : 'Comprato 1'}
                      </button>

                      {Number(it.qty) > 1 && (
                        <button
                          title="Segna tutta la quantità come acquistata"
                          onClick={() => markBought(it.id, Number(it.qty))}
                          style={styles.actionSuccess}
                        >
                          ✅ Comprato tutto
                        </button>
                      )}

                      <div style={{display:'flex', gap:6}}>
                        <button title="Diminuisci confezioni" onClick={() => incQty(it.id, -1)} style={styles.actionGhost}>−</button>
                        <button title="Aumenta confezioni" onClick={() => incQty(it.id, +1)} style={styles.actionGhost}>＋</button>
                      </div>
                      <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.actionGhostDanger}>🗑 Elimina</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form aggiunta manuale (Lista) */}
          <div style={styles.sectionLarge}>
            <h3 style={styles.h3}>Aggiungi prodotto (Lista)</h3>
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

          {/* Prodotti in esaurimento / scadenza */}
          <div style={styles.sectionXL}>
            <h3 style={styles.h3}>📦 Prodotti in esaurimento / scadenza</h3>
            {critical.length === 0 ? (
              <p style={{opacity:.8}}>Nessun prodotto critico</p>
            ) : (
              <ul style={{margin:'6px 0 0', paddingLeft: '18px'}}>
                {critical.map((p, i) => (
                  <li key={i}>
                    {p.name} {p.brand ? (`(${p.brand})`) : ''} — {p.packs} conf. × {p.unitsPerPack} {p.unitLabel} = {totalUnitsOf(p)} unità
                    {p.expiresAt ? ` — Scadenza: ${new Date(p.expiresAt).toLocaleDateString('it-IT')}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Stato scorte */}
          <div style={styles.sectionXL}>
            <div style={styles.scorteHeader}>
              <h3 style={{...styles.h3, marginBottom:0}}>📊 Stato Scorte</h3>
              <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                {!invRecBusy ? (
                  <button onClick={toggleVoiceInventory} style={styles.voiceBtnSmall} disabled={busy}>🎙 Vocale Scadenze/Scorte</button>
                ) : (
                  <button onClick={toggleVoiceInventory} style={styles.voiceBtnSmallStop}>⏹️ Stop</button>
                )}
                <button onClick={() => ocrInputRef.current?.click()} style={styles.ocrBtnSmall} disabled={busy}>📷 OCR Scontrini</button>
                <input
                  ref={ocrInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  multiple
                  hidden
                  onChange={(e) => handleOCR(Array.from(e.target.files || []))}
                />
              </div>
            </div>

            {stock.length === 0 ? (
              <p style={{opacity:.8, marginTop:8}}>Nessun dato scorte</p>
            ) : (
              <table style={{...styles.table, marginTop:10}}>
                <thead>
                  <tr>
                    <th style={styles.th}>Prodotto</th>
                    <th style={styles.th}>Marca</th>
                    <th style={styles.th}>Confezioni</th>
                    <th style={styles.th}>Unità/conf.</th>
                    <th style={styles.th}>Residuo unità</th>
                    <th style={styles.th}>Scadenza</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
               <tbody>
  {stock.map((s, i) => {
    const isEditing = editingRow === i;

    return (
      <tr key={i}>
        {/* Prodotto */}
        <td style={styles.td}>
          {!isEditing ? (
            s.name
          ) : (
            <input
              value={editDraft.name}
              onChange={(e) => handleEditDraftChange('name', e.target.value)}
              style={styles.input}
            />
          )}
        </td>

        {/* Marca */}
        <td style={styles.td}>
          {!isEditing ? (
            s.brand || '-'
          ) : (
            <input
              value={editDraft.brand}
              onChange={(e) => handleEditDraftChange('brand', e.target.value)}
              style={styles.input}
            />
          )}
        </td>

        {/* Confezioni */}
        <td style={styles.td}>
          {!isEditing ? (
            (s.packs ?? 0).toFixed?.(2) ?? s.packs
          ) : (
            <input
              inputMode="decimal"
              value={editDraft.packs}
              onChange={(e) => handleEditDraftChange('packs', e.target.value)}
              style={{ ...styles.input, width: 120 }}
              placeholder="Confezioni"
            />
          )}
        </td>

        {/* Unità/conf. + Etichetta */}
        <td style={styles.td}>
          {!isEditing ? (
            <>
              {s.unitsPerPack ?? 1} {s.unitLabel || 'unità'}
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                inputMode="decimal"
                value={editDraft.unitsPerPack}
                onChange={(e) => handleEditDraftChange('unitsPerPack', e.target.value)}
                style={{ ...styles.input, width: 120 }}
                placeholder="Unità/conf."
              />
              <input
                value={editDraft.unitLabel}
                onChange={(e) => handleEditDraftChange('unitLabel', e.target.value)}
                style={{ ...styles.input, width: 150 }}
                placeholder="Etichetta"
              />
            </div>
          )}
        </td>

        {/* Residuo unità */}
       <td style={styles.td}>
  {(() => {
    const { current, baseline, pct } = residueInfo(s);

    if (editingRow === i) {
      const uppPreview = Math.max(1, Number(editDraft.unitsPerPack || s.unitsPerPack || 1));
      const ruPreviewRaw = Number(String(editDraft.residueUnits ?? '').replace(',','.'));
      const currentPreview = Number.isFinite(ruPreviewRaw) ? Math.max(0, ruPreviewRaw) : current;
      const baselinePreview = baseline || uppPreview;
      const pctPreview = clamp01(currentPreview / (baselinePreview || uppPreview));

      const expIso = (editDraft.expiresAt ?? s.expiresAt) || '';
      const soon = daysToExpiry(expIso) <= 10;

      const barColor = soon ? '#ef4444' : colorForPct(pctPreview);
      const isLow = soon || pctPreview < 0.20;

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            inputMode="decimal"
            value={editDraft.residueUnits ?? String(current)}
            onChange={(e) => handleEditDraftChange('residueUnits', e.target.value)}
            style={{ ...styles.input, width: 150 }}
            placeholder="Residuo unità"
          />
          <div style={styles.progressWrap} title={`${Math.round(currentPreview)}/${Math.round(baselinePreview)} unità`}>
            <div
              className={isLow ? 'jarvisLow' : undefined}
              style={{
                ...styles.progressBar,
                width: `${pctPreview * 100}%`,
                background: barColor,
              }}
            />
          </div>
        </div>
      );
    }

    const soon = isExpiringSoon(s);
    const barColor = soon ? '#ef4444' : colorForPct(pct);
    const isLow = soon || pct < 0.20;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{Math.round(current)}</span>
        <div style={styles.progressWrap} title={`${Math.round(current)}/${Math.round(baseline)} unità`}>
          <div
            className={isLow ? 'jarvisLow' : undefined}
            style={{
              ...styles.progressBar,
              width: `${pct * 100}%`,
              background: barColor,
            }}
          />
        </div>
      </div>
    );
  })()}
</td>

        {/* Scadenza */}
        <td style={styles.td}>
          {!isEditing ? (
            s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('it-IT') : '-'
          ) : (
            <input
              value={editDraft.expiresAt}
              onChange={(e) => handleEditDraftChange('expiresAt', e.target.value)}
              style={{ ...styles.input, width: 150 }}
              placeholder="YYYY-MM-DD"
            />
          )}
        </td>

        {/* Azioni: SOLO OCR / Modifica (o Salva/Annulla) / Elimina */}
        <td style={styles.td}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => openRowOcr(i)}
              style={styles.ocrInlineBtn}
              disabled={busy}
              title="Rileva scadenza da foto"
            >
              📷 OCR
            </button>

            {!isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => startRowEdit(i, s)}
                  style={styles.actionGhost}
                >
                  ✎ Modifica
                </button>
                <button
                  type="button"
                  onClick={() => deleteStockRow(i)}
                  style={styles.actionGhostDanger}
                >
                  🗑 Elimina
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => saveRowEdit(i)}
                  style={styles.actionSuccess}
                >
                  💾 Salva
                </button>
                <button
                  type="button"
                  onClick={cancelRowEdit}
                  style={styles.actionGhost}
                >
                  ✖ Annulla
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  })}
</tbody>
              </table>
            )}
            {/* input file unico per OCR scadenza di riga */}
            <input
              ref={rowOcrInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              hidden
              onChange={(e)=>handleRowOcrChange(Array.from(e.target.files||[]))}
            />
            <p style={{opacity:.75, marginTop:8}}>
              Esempi scadenze: “il latte scade il 15/07/2025; lo yogurt il 10 agosto 2025”.
            </p>
            <p style={{opacity:.75, marginTop:4}}>
              Esempi scorte: “latte sono 3 bottiglie, pasta 4 pacchi, ferrero fiesta 3 unità”.
              Per impostare il totale invece di aggiungere: “latte <b>porta a</b> 3 bottiglie”.
            </p>
          </div>

          {/* Aggiungi SCORTA manuale */}
          <div style={styles.sectionLarge}>
            <h3 style={styles.h3}>➕ Aggiungi scorta manuale</h3>
            <form onSubmit={addManualStock} style={styles.formRow}>
              <input placeholder="Prodotto (es. latte)" value={stockForm.name}
                     onChange={e => setStockForm(f => ({...f, name: e.target.value}))} style={styles.input} required />
              <input placeholder="Marca (opzionale)" value={stockForm.brand}
                     onChange={e => setStockForm(f => ({...f, brand: e.target.value}))} style={styles.input} />
              <input placeholder="Confezioni" inputMode="decimal" value={stockForm.packs}
                     onChange={e => setStockForm(f => ({...f, packs: e.target.value}))} style={{...styles.input, width:120}} required />
              <input placeholder="Unità/conf." inputMode="decimal" value={stockForm.unitsPerPack}
                     onChange={e => setStockForm(f => ({...f, unitsPerPack: e.target.value}))} style={{...styles.input, width:120}} required />
              <input placeholder="Etichetta unità (es. bottiglie)" value={stockForm.unitLabel}
                     onChange={e => setStockForm(f => ({...f, unitLabel: e.target.value}))} style={{...styles.input, width:180}} />
              <input placeholder="Scadenza YYYY-MM-DD (opz.)" value={stockForm.expiresAt}
                     onChange={e => setStockForm(f => ({...f, expiresAt: e.target.value}))} style={{...styles.input, width:200}} />
              <button style={styles.primaryBtn} disabled={busy}>Aggiungi alle scorte</button>
            </form>
            <p style={{opacity:.8, marginTop:6}}>
              Esempio: “Latte — confezioni 1 — unità/conf. 6 — etichetta bottiglie”.
            </p>
          </div>

          {/* Toast */}
          {toast && (
            <div style={{
              position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
              background: toast.type==='ok' ? '#16a34a' : (toast.type==='err' ? '#ef4444' : '#334155'),
              color:'#fff', padding:'10px 14px', borderRadius:10, boxShadow:'0 6px 16px rgba(0,0,0,.35)', zIndex:9999
            }}>
              {toast.msg}
            </div>
          )}
<style jsx>{`
  @keyframes jarvisPulse {
    0%   { box-shadow: 0 0 0 0 rgba(239,68,68,.65); }
    70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  .jarvisLow {
    animation: jarvisPulse 1.5s infinite;
  }
`}</style>

        </div>
      </div>
    </>
  );
}
/** Piccolo workaround per evitare warning su più MediaRecorder in certi browser */
function theMediaWorkaround(){}

/* ---------------- styles (ottimizzati) ---------------- */
const styles = {
  page: {
    width: '100%',
    minHeight: '100vh',
    background: '#0f172a',
    padding: 24, // più compatto per mobile
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontFamily:
      'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  },

  card: {
    width: '100%',
    maxWidth: 1000,
    background: 'rgba(0,0,0,.6)',
    borderRadius: 16,
    padding: 22,
    boxShadow: '0 6px 16px rgba(0,0,0,.3)',
  },

  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  homeBtn: {
    background: '#6366f1',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    textDecoration: 'none',
    fontWeight: 700,
  },

  switchRow: { display: 'flex', gap: 10, margin: '16px 0 10px', flexWrap: 'wrap' },
  switchBtn: {
    background: 'rgba(255,255,255,.08)',
    border: '1px solid rgba(255,255,255,.15)',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 600,
  },
  switchBtnActive: {
    background: '#06b6d4',
    border: 0,
    color: '#0b1220',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
  },

  toolsRow: { display: 'flex', flexWrap: 'wrap', gap: 10, margin: '12px 0 6px' },

  voiceBtn: {
    background: '#6366f1',
    border: 0,
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 12,
    cursor: 'pointer',
    fontWeight: 800,
  },

  sectionLarge: { marginTop: 30, marginBottom: 10 },
  sectionXL: { marginTop: 38, marginBottom: 12 },
  h3: { margin: '6px 0 12px' },

  listGrid: { display: 'flex', flexDirection: 'column', gap: 12 },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 12,
    padding: '10px 12px',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemMain: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 260, flex: 1 },
  qtyBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 10,
    background: 'rgba(99,102,241,.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
  },
  itemName: { fontSize: 16, fontWeight: 700, lineHeight: 1.1 },
  itemBrand: { fontSize: 12, opacity: 0.8 },

  itemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  actionSuccess: {
    background: '#16a34a',
    border: 0,
    color: '#fff',
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
  },
  actionDanger: {
    background: '#ef4444',
    border: 0,
    color: '#fff',
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
  },
  actionGhost: {
    background: 'rgba(255,255,255,.12)',
    border: '1px solid rgba(255,255,255,.2)',
    color: '#fff',
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
  },
  actionGhostDanger: {
    background: 'rgba(239,68,68,.1)',
    border: '1px solid rgba(239,68,68,.6)',
    color: '#fff',
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
  },

  formRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,.15)',
    background: 'rgba(255,255,255,.06)',
    color: '#fff',
    minWidth: 160, // -40px vs prima per stare su schermi stretti
    flex: '1 1 160px',
  },
  primaryBtn: {
    background: '#16a34a',
    border: 0,
    color: '#fff',
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'rgba(255,255,255,.04)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '10px',
    borderBottom: '1px solid rgba(255,255,255,.12)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px',
    borderBottom: '1px solid rgba(255,255,255,.08)',
    verticalAlign: 'middle',
  },

  scorteHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },

  voiceBtnSmall: {
    background: '#6366f1',
    border: 0,
    color: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  voiceBtnSmallStop: {
    background: '#ef4444',
    border: 0,
    color: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  ocrBtnSmall: {
    background: '#06b6d4',
    border: 0,
    color: '#0b1220',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
    ocrInlineBtn: {
    background: 'rgba(6,182,212,.15)',
    border: '1px solid rgba(6,182,212,.6)',
    color: '#e0fbff',
    padding: '6px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }, // <-- VIRGOLA QUI

  /* ---------- Badge “Giorni rimasti” ---------- */
  daysBadgeBase: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    height: 26,
    padding: '0 8px',
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  },
  daysBadgeGreen: {
    background: 'rgba(22,163,74,.18)',
    border: '1px solid rgba(22,163,74,.7)',
    color: '#dcfce7',
  },
  daysBadgeAmber: {
    background: 'rgba(245,158,11,.18)',
    border: '1px solid rgba(245,158,11,.7)',
    color: '#fffbeb',
  },
  daysBadgeRed: {
    background: 'rgba(239,68,68,.18)',
    border: '1px solid rgba(239,68,68,.7)',
    color: '#fee2e2',
  },
  daysBadgeGray: {
    background: 'rgba(148,163,184,.18)',
    border: '1px solid rgba(148,163,184,.6)',
    color: '#e2e8f0',
  },
  inputTable: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: '100%',
  minWidth: 0,
},
inputTableSm: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: 90,
  minWidth: 0,
},
inputTableXs: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: 110,
  minWidth: 0,
},
  inputTable: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: '100%',
  minWidth: 0,
},
inputTableSm: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: 90,
  minWidth: 0,
},
progressWrap: {
  position: 'relative',
  width: 120,
  height: 10,
  borderRadius: 999,
  background: 'rgba(255,255,255,.15)',
  overflow: 'hidden',
  flex: '0 0 120px',
},
progressBar: {
  position: 'absolute',
  left: 0,          // <-- usa left/top/bottom (NON inset)
  top: 0,
  bottom: 0,
  width: '0%',      // verrà sovrascritta inline con `${pct * 100}%`
  transition: 'width .25s ease, background-color .25s ease',
},

  inputTableXs: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: 110,
  minWidth: 0,
},

}; // <-- e chiudi l’oggetto con punto e virgola
