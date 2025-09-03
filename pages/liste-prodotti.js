// pages/liste-prodotti.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Camera, Plus, Calendar } from 'lucide-react';
import {
  visionFirstParseFromFiles,
  enrichPurchasesViaWeb
} from '@/lib/receipt-pipeline';

/* ===========================================================
   SHIMS REVIEW (se la modale non è più usata, evita errori)
=========================================================== */
// eslint-disable-next-line no-var
var registerReviewSetters = (typeof registerReviewSetters === 'function') ? registerReviewSetters : function noop(){};
// eslint-disable-next-line no-var
var openValidation       = (typeof openValidation       === 'function') ? openValidation       : function noop(){};
// eslint-disable-next-line no-var
var handleReviewChange   = (typeof handleReviewChange   === 'function') ? handleReviewChange   : function noop(){};

/* ===========================================================
   BASE LEXICON (minimo, espandibile)
=========================================================== */
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

// Sinonimi quantità (per parser vocale/manuale)
const UNIT_SYNONYMS = '(?:unit(?:a|à)?|unit\\b|pz\\.?|pezz(?:i|o)\\.?|bottiglie?|busta(?:e)?|bustine?|lattin(?:a|e)|barattol(?:o|i)|vasett(?:o|i)|vaschett(?:a|e)|brick|cartocc(?:io|i)|fett(?:a|e)|uova|capsul(?:a|e)|pods|rotol(?:o|i)|fogli(?:o|i))';
const PACK_SYNONYMS = '(?:conf(?:e(?:zioni)?)?|confezione|pacc?hi?|pack|multipack|scatol(?:a|e)|carton(?:e|i))';

/* ===========================================================
   COSTANTI / CONFIG
=========================================================== */
const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;
const DEFAULT_PACKS_IF_MISSING = true;

const API_ASSISTANT_TEXT = '/api/assistant';
const API_OCR = '/api/ocr';
const API_FINANCES_INGEST = '/api/finances/ingest';

const LS_VER = 1;
const LS_KEY = 'jarvis_liste_prodotti@v1';

/* ===========================================================
   UTILS DI BASE
=========================================================== */
function normKey(str=''){
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s{2,}/g,' ')
    .trim();
}
function productKey(name='', brand=''){ return `${normKey(name)}|${normKey(brand)}`; }

function normalizeUnitLabel(lbl=''){
  const s = normKey(lbl);
  if (/bottigl/.test(s)) return 'bottiglie';
  if (/(?:pz|pezz|unit\b|unita?)/.test(s)) return 'pezzi';
  if (/bust/.test(s)) return 'buste';
  if (/lattin/.test(s)) return 'lattine';
  if (/vasett/.test(s)) return 'vasetti';
  if (/barattol/.test(s)) return 'barattoli';
  if (/vaschett/.test(s)) return 'vaschette';
  if (/rotol/.test(s)) return 'rotoli';
  if (/capsul/.test(s)) return 'capsule';
  if (/uova/.test(s)) return 'uova';
  return 'unità';
}
function normalizeBrandName(s){
  const t = String(s||'').trim();
  if (/^\s*m\s*bianco\b|mbianco\b/i.test(t) || /mulino\s*bianco/i.test(t)) return 'Mulino Bianco';
  return t;
}
function normalizeProductName(n){ return String(n||'').trim(); }

/* isSimilar SHIM (una sola volta) */
// eslint-disable-next-line no-var
var isSimilar = (typeof isSimilar === 'function') ? isSimilar : function isSimilar(a, b) {
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
};

/* ===========================================================
   ALIASES con contesto (NO categorie sui receipt)
=========================================================== */
function applyLearnedAliases({ name, brand }, learned, ctx = {}) {
  let n = name || '', b = brand || '';
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

  // alias MARCA
  if (learned?.aliases?.brand) {
    for (const [pat, repl] of Object.entries(learned.aliases.brand)) {
      const re = new RegExp(`\\b${esc(pat)}\\b`, 'i');
      if (re.test(b) || re.test(n)) { b = repl; n = n.replace(re,'').trim(); }
    }
  }
  // alias PRODOTTO: NON su dati da scontrino/vision
  if (ctx.mode !== 'receipt' && learned?.aliases?.product) {
    for (const [pat, repl] of Object.entries(learned.aliases.product)) {
      const re = new RegExp(`\\b${esc(pat)}\\b`, 'i');
      if (re.test(n)) n = n.replace(re, repl).trim();
    }
  }
  return { name:n, brand:b };
}

/* ===========================================================
   Quantità implicite dal nome (x2, 2×6, 6 pezzi/uova…)
=========================================================== */
function impliedQuantitiesFromName(name=''){
  let packs = 0, upp = 0, unitLabel = '';

  const mX = name.match(/\(x(\d+)\)/i);
  if (mX) packs = Math.max(packs, parseInt(mX[1],10));

  const mCombo = name.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (mCombo){ packs = Math.max(packs, parseInt(mCombo[1],10)); upp = Math.max(upp, parseInt(mCombo[2],10)); }

  const mUnits = name.match(/\b(\d+)\s*(pz|pezzi|capsule|bottiglie|uova|rotoli|lattine|vasetti)\b/i);
  if (mUnits){ upp = Math.max(upp, parseInt(mUnits[1],10)); unitLabel = normalizeUnitLabel(mUnits[2]); }

  return { packs, upp, unitLabel };
}

/* ===========================================================
   Sanitizzazione quantità (NO pesi/lavaggi come UPP)
=========================================================== */
const MEASURE_TOKEN_RE = /\b\d+(?:[.,]\d+)?\s*(kg|g|gr|ml|cl|l|lt)\b/i;
const DIMENSION_RE     = /\b\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?\s*(cm|mm|m)\b/i;
const UNIT_WORD_RE     = /\b(pz|pezzi|capsule|bottiglie|uova|rotoli|lattine|vasetti)\b/i;

function sanitizeReceiptQuantities(list = []) {
  return (Array.isArray(list) ? list : []).map(p => {
    const impl = impliedQuantitiesFromName(p.name || '');
    let packs = Math.max(1, Number(p.packs || impl.packs || 1));
    let upp   = Math.max(1, Number(p.unitsPerPack || impl.upp || 1));
    let unitLabel = normalizeUnitLabel(p.unitLabel || impl.unitLabel || (upp>1 ? 'pezzi' : 'unità'));

    const name = String(p.name || '');
    const hasLavaggi   = /\blavaggi?\b/i.test(name);
    const hasMeasure   = MEASURE_TOKEN_RE.test(name) || DIMENSION_RE.test(name);
    const hasUnitWord  = UNIT_WORD_RE.test(name);

    if (hasLavaggi) { upp = 1; unitLabel = 'unità'; }
    if (hasMeasure && !hasUnitWord) { upp = 1; unitLabel = 'unità'; }
    if (upp > 12 && !hasUnitWord) { upp = 1; unitLabel = 'unità'; }
    if (/uova/i.test(name) && /\b6\b/.test(name)) { upp = 6; unitLabel = 'uova'; }

    return {
      ...p,
      packs,
      unitsPerPack: upp,
      unitLabel,
      priceEach: Number(p.priceEach || 0),
      priceTotal: Number(p.priceTotal || 0),
      currency: p.currency || 'EUR'
    };
  });
}

/* ===========================================================
   Merge intelligente (non sommare formati di pasta diversi)
=========================================================== */
function canonicalName(raw='') {
  const s = normKey(raw);
  let t = s
    .replace(/\b\d+(?:[.,]\d+)?\s*(kg|g|gr|ml|cl|l|lt)\b/g, ' ')
    .replace(/\b\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?\s*(cm|mm|m)\b/g, ' ')
    .replace(/\s{2,}/g,' ')
    .trim();

  const keep = ['rigatoni','penne rigate','spaghettoni','bucatini','fusilli','spaghetti','lasagne','ravioli','tortellini','gnocchi'];
  for (const k of keep) { if (t.includes(k)) return k; }
  return t || s;
}

function localMerge(items = []) {
  const map = new Map();
  for (const p of (Array.isArray(items) ? items : [])) {
    const displayName = normalizeProductName(p.name || '');
    const brand = normalizeBrandName(p.brand || '');
    const upp   = Math.max(1, Number(p.unitsPerPack || 1));
    const keyName = canonicalName(displayName);
    const key     = `${productKey(keyName, brand)}|${upp}`;

    const prev = map.get(key) || {
      name: displayName,
      brand,
      unitsPerPack: upp,
      unitLabel: normalizeUnitLabel(p.unitLabel || (upp>1?'pezzi':'unità')),
      packs: 0,
      priceEach: Number(p.priceEach || 0),
      priceTotal: 0,
      currency: p.currency || 'EUR',
      expiresAt: p.expiresAt || ''
    };

    prev.packs      += Math.max(1, Number(p.packs || 1));
    prev.priceTotal += Number(p.priceTotal || 0);

    map.set(key, prev);
  }
  return [...map.values()];
}

/* Back-compat: se da qualche parte si richiama ancora cleanupPurchasesQuantities,
   facciamola puntare alla nuova sanitizzazione. */
function cleanupPurchasesQuantities(list){ return sanitizeReceiptQuantities(list); }

/* ===========================================================
   Filtro non-merce (shopper/cauzioni…)
=========================================================== */
function isNonMerch(name='', brand=''){
  const s = `${name} ${brand}`.toLowerCase();
  return /\b(shopper|sacchetto|busta|eco[- ]?contributo|ecocontributo|cauzione|vuoto(?:\s*a\s*rendere)?)\b/i.test(s);
}

/* ===========================================================
   Pipeline pubblica: vision → clean → merge
   USO in handleOCR:
   const purchases = normalizeReceiptPurchases(vision.purchases, { learned });
=========================================================== */
function normalizeReceiptPurchases(raw = [], { learned } = {}) {
  if (!Array.isArray(raw)) return [];

  let arr = raw.map(p => ({
    name: String(p?.name||'').trim(),
    brand: String(p?.brand||'').trim(),
    packs: Number(p?.packs||0),
    unitsPerPack: Number(p?.unitsPerPack||0),
    unitLabel: String(p?.unitLabel||''),
    priceEach: Number(p?.priceEach||0),
    priceTotal: Number(p?.priceTotal||0),
    currency: String(p?.currency||'EUR'),
    expiresAt: String(p?.expiresAt||'')
  })).filter(p => p.name);

  // alias (solo MARCA su receipt)
  if (learned) {
    arr = arr.map(p => {
      const a = applyLearnedAliases({ name:p.name, brand:p.brand }, learned, { mode:'receipt' });
      return { ...p, name:a.name, brand:a.brand };
    });
  }

  // quantità sane
  arr = sanitizeReceiptQuantities(arr);

  // filtra non-merce
  arr = arr.filter(p => !isNonMerch(p.name, p.brand));

  // merge finale
  return localMerge(arr);
}

/* ===========================================================
   (Opzionale) parse meta e fallback testi OCR: lasciati invariati se già presenti
=========================================================== */
function toISODate(any) {
  const s = String(any || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m){ const d=m[1].padStart(2,'0'); const M=m[2].padStart(2,'0'); let y=m[3]; if (y.length===2) y=(Number(y)>=70?'19':'20')+y; return `${y}-${M}-${d}`; }
  return '';
}
function parseReceiptMeta(ocrText) {
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  let purchaseDate = '';
  for (const ln of lines) { const iso = toISODate(ln); if (iso) { purchaseDate = iso; break; } }
  const bad = /(totale|iva|imp|euro|€|tel|cassa|scontrino|fiscale|subtot|pagamento|contanti|resto)/i;
  let store = '';
  for (const ln of lines) {
    const hasLetters = /[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(ln);
    if (hasLetters && !bad.test(ln) && ln.length >= 3) { store = ln.replace(/\s{2,}/g,' ').trim(); break; }
  }
  return { store, purchaseDate };
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
  return { mime: '', ext: 'webm' };
}

/* ====================== Utility immagini ====================== */
function withRememberedImage(row, imagesIdx) {
  if (row?.image) return row;
  const key = productKey(row?.name, row?.brand || '');
  const img = imagesIdx?.[key];
  if (img) return { ...row, image: img };
  return row;
}
// Coercizioni/utility
function intOr(x, d=0){ const n = Number(String(x).replace(',','.')); return Number.isFinite(n) ? Math.trunc(n) : d; }
function posIntOr(x, d=0){ return Math.max(0, intOr(x, d)); }
function nonEmpty(s){ return String(s||'').trim(); }

/* ====================== Review helpers ====================== */
// Modifica una riga nella modale (usa i setter globali se disponibili)
function handleReviewChange(id, field, value){
  try {
    if (typeof __reviewSetters !== 'undefined' && __reviewSetters) {
      const { setReviewItems /*, setReviewPick*/ } = __reviewSetters;
      setReviewItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
    } else {
      // fallback: se in closure del componente
      setReviewItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
      try {
        const it = reviewItems.find(i => i.id === id);
        if (it) {
          const key = productKey(it.name, it.brand || '');
          setReviewPick(prev => ({ ...prev, [key]: true }));
        }
      } catch {}
    }
  } catch {}
}
function priceNum(x){ const n = Number(String(x).replace(',','.')); return Number.isFinite(n) ? n : 0; }
function derivePriceFields({ packs, priceEach, priceTotal }) {
  const p = Math.max(1, Number(packs || 1));
  let pe = priceNum(priceEach);
  let pt = priceNum(priceTotal);
  if (!pe && pt) pe = pt / p;           // se ho il totale ma non il “cadauno”
  if (!pt && pe) pt = pe * p;           // se ho il “cadauno” ma non il totale
  // arrotonda gentile
  pe = Math.round(pe * 100) / 100;
  pt = Math.round(pt * 100) / 100;
  return { priceEach: pe, priceTotal: pt };
}


// Normalizza le righe prima di aggiungerle
function normalizeReviewedItems(items){
  return (items||[]).map(p => {
    let name = nonEmpty(p.name);
    let brand = nonEmpty(p.brand);
    let packs = posIntOr(p.packs, 1);
    let upp   = posIntOr(p.unitsPerPack, 1);
    let unitLabel = nonEmpty(p.unitLabel) || (upp>1 ? 'pezzi' : 'unità');
    const expiresAt = toISODate(p.expiresAt || '');
    return { name, brand, packs, unitsPerPack: upp, unitLabel, expiresAt,
      priceEach: 0, priceTotal: 0, currency: 'EUR'
    };
  });
}

// Auto-normalizza le righe in modale in base ad alias/normalizzatori appresi
function autoNormalizeReview(){
  setReviewItems(prev => prev.map(it => {
    const ab = (typeof applyLearnedAliases === 'function')
      ? applyLearnedAliases({ name: it.name, brand: it.brand }, learned)
      : { name: it.name, brand: it.brand };
    const brand = (typeof normalizeBrandName === 'function') ? normalizeBrandName(ab.brand) : ab.brand;
    const name  = (typeof normalizeProductName === 'function') ? normalizeProductName(ab.name, brand, `${ab.name} ${brand}`) : ab.name;
    return { ...it, name: name || it.name, brand: brand || it.brand };
  }));
}

// Raccoglie voci NON riconosciute dall'OCR per la modale di validazione
function collectReviewCandidatesFromOCRText(ocrText, purchasesRecognized = []) {
  const existed = new Set((purchasesRecognized || []).map(p => normKey(p.name)));
  const out = [];
  const lines = String(ocrText || '')
    .split(/\r?\n/)
    .map(s => s.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  const KNOWN_BRANDS = ['Mulino Bianco','Ferrero','Motta','Lavazza','Parmalat','Zymil','Garofalo','Eridania',
    'Lenor','Dash','Arborea','Bufalart','Decò','Deco','Saiva','Barilla','Galbani','Santa Lucia'];

  for (let ln of lines) {
    if (/^(documento|descrizione|prezzo|totale|subtotale|pagamento|resto|di\s*cui\s*iva|iva|rt\b|cassa|cassiere|codice|tessera)\b/i.test(ln)) continue;
    if (/^\(off\.\b/i.test(ln)) continue;

    ln = ln.replace(/\s+vi\*?\s*$/i,'')
           .replace(/\s+(?:€|eur|euro)?\s*\d+(?:[.,]\d{2})\s*$/i,'')
           .trim();
    if (!ln) continue;

    let brand = '';
    for (const b of KNOWN_BRANDS) {
      if (new RegExp(`\\b${b.replace(/\s+/g,'\\s+')}\\b`, 'i').test(ln)) { brand = b; break; }
    }
    let name = ln;
    if (typeof normalizeBrandName === 'function') brand = normalizeBrandName(brand || ln);
    if (typeof normalizeProductName === 'function') name  = normalizeProductName(name, brand, ln);

    const key = normKey(name);
    if (!key || existed.has(key)) continue;

    const looksUpper  = /^[A-Z0-9À-ÖØ-Þ][A-Z0-9À-ÖØ-Þ .'-]{4,}$/.test(ln);
    const tokenAlpha  = (ln.match(/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/g) || []).length >= 2;
    if (!(looksUpper || tokenAlpha)) continue;

    out.push({
      id: 'rev-' + key,
      name: name.trim(),
      brand: brand && brand !== name ? brand : '',
      packs: 1, unitsPerPack: 1, unitLabel: 'unità',
      priceEach: 0, priceTotal: 0, currency: 'EUR',
      expiresAt: ''
    });
  }
  return out;
}

// Apri la modale con i candidati (usa i setter registrati)
function openValidation(discardedList, meta) {
  if (typeof __reviewSetters === 'undefined' || !__reviewSetters) return; // sicuro
  const { setReviewItems, setReviewPick, setPendingOcrMeta, setReviewOpen } = __reviewSetters;

  const uniq = new Map(), items = [];
  for (const p of discardedList || []) {
    const nm = nonEmpty(p?.name); if (!nm) continue;
    const br = nonEmpty(p?.brand);
    const key = productKey(nm, br);
    if (uniq.has(key)) continue;
    uniq.set(key, true);
    items.push({
      ...p,
      id: 'rev-' + key,
      name: nm,
      brand: br,
      packs: posIntOr(p?.packs, 1),
      unitsPerPack: posIntOr(p?.unitsPerPack, 1),
      unitLabel: nonEmpty(p?.unitLabel) || 'unità',
      expiresAt: toISODate(p?.expiresAt || '')
    });
  }
  if (items.length) {
    setReviewItems(items);
    setReviewPick(items.reduce((acc, it) => { acc[productKey(it.name, it.brand || '')] = true; return acc; }, {}));
    setPendingOcrMeta(meta || null);
    setReviewOpen(true);
  }
}

/* ====================== Applica aggiunte (liste+scorte+finanze) ====================== */
async function applyAdditionalPurchases(addItems, meta = {}) {
  if (!Array.isArray(addItems) || !addItems.length) return;

  // 1) Decrementa liste
  setLists(prev => decrementAcrossBothLists(prev, addItems));

  // 2) Aggiorna scorte
  setStock(prev => {
    const arr = [...prev]; const todayISO = new Date().toISOString().slice(0,10);
    for (const p of addItems) {
      const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
      const packs = Math.max(0, Number(p.packs || 0));
      const upp   = Math.max(1, Number(p.unitsPerPack || 1));
      const hasCounts = packs > 0 || upp > 0;

      if (idx >= 0) {
        const old = arr[idx];
        if (hasCounts) {
          const newP = Math.max(0, Number(old.packs || 0) + packs);
          const newU = Math.max(1, Number(old.unitsPerPack || upp));
          arr[idx] = { ...old, packs:newP, unitsPerPack:newU,
            unitLabel: old.unitLabel || p.unitLabel || 'unità',
            expiresAt: p.expiresAt || old.expiresAt || '',
            packsOnly:false, needsUpdate:false, ...restockTouch(newP, todayISO, newU) };
        } else {
          if (DEFAULT_PACKS_IF_MISSING) {
            const uo = Math.max(1, Number(old.unitsPerPack || 1));
            const np = Math.max(0, Number(old.packs || 0) + 1);
            arr[idx] = { ...old, packs:np, unitsPerPack:uo, unitLabel: old.unitLabel || 'unità',
              packsOnly:false, needsUpdate:false, ...restockTouch(np, todayISO, uo) };
          } else { arr[idx] = { ...old, needsUpdate:true }; }
        }
      } else {
        if (hasCounts) {
          arr.unshift(withRememberedImage({
            name:p.name, brand:p.brand || '', packs, unitsPerPack:upp, unitLabel:p.unitLabel || 'unità',
            expiresAt:p.expiresAt || '', baselinePacks:packs, lastRestockAt:todayISO, avgDailyUnits:0,
            residueUnits:packs*upp, packsOnly:false, needsUpdate:false
          }, imagesIndex));
        } else if (DEFAULT_PACKS_IF_MISSING) {
          arr.unshift(withRememberedImage({
            name:p.name, brand:p.brand || '', packs:1, unitsPerPack:1, unitLabel:'unità',
            expiresAt:p.expiresAt || '', baselinePacks:1, lastRestockAt:todayISO, avgDailyUnits:0,
            residueUnits:1, packsOnly:false, needsUpdate:false
          }, imagesIndex));
        } else {
          arr.unshift(withRememberedImage({
            name:p.name, brand:p.brand || '', packs:0, unitsPerPack:1, unitLabel:'-',
            expiresAt:p.expiresAt || '', baselinePacks:0, lastRestockAt:'', avgDailyUnits:0,
            residueUnits:0, packsOnly:true, needsUpdate:true
          }, imagesIndex));
        }
      }
    }
    return arr;
  });

  // 3) Finanze
  try {
    const itemsSafe = addItems.map(p => ({
      name:p.name, brand:p.brand||'', packs:Number(p.packs||0), unitsPerPack:Number(p.unitsPerPack||0),
      unitLabel:p.unitLabel||'', priceEach:Number(p.priceEach||0), priceTotal:Number(p.priceTotal||0),
      currency:p.currency||'EUR', expiresAt:p.expiresAt||''
    }));
    await fetchJSONStrict(API_FINANCES_INGEST, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        ...(userIdRef.current ? { user_id: userIdRef.current } : {}),
        ...(pendingOcrMeta?.store ? { store: pendingOcrMeta.store } : {}),
        ...(pendingOcrMeta?.purchaseDate ? { purchaseDate: pendingOcrMeta.purchaseDate } : {}),
        payment_method:'cash', card_label:null, items: itemsSafe
      })
    }, 30000);
  } catch(e){ if (DEBUG) console.warn('[FINANCES_INGEST] review add fail', e); }
}

// Conferma selezionati
async function applyReviewSelection() {
  const selected = reviewItems.filter(it => reviewPick[productKey(it.name, it.brand || '')]);
  setReviewOpen(false); setReviewItems([]); setReviewPick({});
  if (!selected.length) return;
  const cleaned = normalizeReviewedItems(selected);
  await applyAdditionalPurchases(cleaned, pendingOcrMeta || {});
  setPendingOcrMeta(null);
  showToast(`Aggiunti ${cleaned.length} articoli convalidati ✓`, 'ok');
}


/* ==== Toggle riconoscimento/agent (arricchimento attivo) ==== */
const ENRICH_MODE = 'on';         // 'off' | 'auto' | 'on'
const ASSIST_TIMEOUT_MS = 15000;  // timeout breve per l'agente
const OCR_IMAGE_MAXSIDE = 1200;
const OCR_IMAGE_QUALITY = 0.66;

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

  // Review (modale di convalida)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState([]);
  const [reviewPick, setReviewPick] = useState({});
  const [pendingOcrMeta, setPendingOcrMeta] = useState(null);

  // registra i setter per gli helper globali
  useEffect(() => {
    registerReviewSetters({ setReviewItems, setReviewPick, setPendingOcrMeta, setReviewOpen });
  }, []);

  // Learning (memoria prodotti/alias/keep)
  const [learned, setLearned] = useState({
    products: {},
    aliases: { product: {}, brand: {} },
    keepTerms: {},
    discardTerms: {}
  });

  // Vocale inventario unificato
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
        const mod = await import('@/lib/supabaseClient').catch(() => null);
        if (!mod?.supabase) return;
        __supabase = mod.supabase;

        const { data: userData, error: authErr } = await __supabase.auth.getUser();
        if (authErr) return;
        const uid = userData?.user?.id || null;
        if (mounted) userIdRef.current = uid;
        if (!uid) return;

        const { data: row, error } = await __supabase
          .from(CLOUD_TABLE)
          .select('state')
          .eq('user_id', uid)
          .maybeSingle();

        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (!(error.code === '42703' || (msg.includes('column') && msg.includes('does not exist')))) {
            if (DEBUG) console.warn('[cloud] load error', error);
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
        if (st.learned && typeof st.learned === 'object') setLearned(st.learned);
        // imagesIndex volutamente non da cloud
      } catch (e) {
        if (DEBUG) console.warn('[cloud init] skipped', e);
      }
    })();

    return () => { mounted = false; };
  }, []);

  // 👉 stripForCloud: rimuove solo le immagini e mantiene il resto
  function stripForCloud({ lists, stock, currentList, learned }) {
    const safeLists = {
      [LIST_TYPES.SUPERMARKET]: (lists?.[LIST_TYPES.SUPERMARKET] || []).map(({ image, ...r }) => r),
      [LIST_TYPES.ONLINE]: (lists?.[LIST_TYPES.ONLINE] || []).map(({ image, ...r }) => r),
    };
    const safeStock = (stock || []).map(({ image, ...r }) => r);
    const safeLearned =
      learned && typeof learned === 'object'
        ? learned
        : { products: {}, aliases: { product: {}, brand: {} }, keepTerms: {}, discardTerms: {} };
    return { lists: safeLists, stock: safeStock, currentList, learned: safeLearned };
  }

  const cloudTimerRef = useRef(null);
  useEffect(() => {
    if (!CLOUD_SYNC || !__supabase) return;
    if (!userIdRef.current) return;

    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);

    // NON mandiamo imagesIndex in cloud, e togliamo field .image
    const cloudState = stripForCloud({ lists, stock, currentList, learned });
    const payload = { user_id: userIdRef.current, state: cloudState };

    cloudTimerRef.current = setTimeout(async () => {
      try {
        await __supabase
          .from(CLOUD_TABLE)
          .upsert(payload, { onConflict: 'user_id' }); // returning minimal
      } catch (e) {
        if (DEBUG) console.warn('[cloud upsert] fail', e);
      }
    }, 5000);

    return () => clearTimeout(cloudTimerRef.current);
  }, [lists, stock, currentList, learned]);

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
          datasources: [...this._datasources.keys() ],
          commands:    [...this._commands.keys()    ],
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
  if (saved.learned && typeof saved.learned === 'object') {
  setLearned(saved.learned);
}

}

    
  }, []);

  /* =================== Autosave debounce (locale) =================== */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
   const snapshot = { lists, stock, currentList, imagesIndex, learned };
    persistTimerRef.current = setTimeout(() => { persistNow(snapshot); }, 300);
    return () => clearTimeout(persistTimerRef.current);
  }, [lists, stock, currentList, imagesIndex, learned]);

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
// === Ripulisce l'OCR da messaggi di rifiuto / policy ===
function sanitizeOcrText(t) {
  const BAD = /(mi\s*dispiace|non\s*posso\s*aiut|cannot\s*assist|i\s*can't|policy|trascrizion)/i;
  return String(t || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !BAD.test(s))   // elimina righe tipo “Mi dispiace…”
    .join('\n');
}

// === Helper: ridimensiona/comprime immagini prima dell'upload (mobile-friendly) ===
async function downscaleImageFile(file, { maxSide = 1600, quality = 0.74 } = {}) {
  try {
    // Non toccare PDF o file non immagine
    if (!file || file.type === 'application/pdf' || !/^image\//i.test(file.type)) return file;

    // Crea un bitmap (o <img> come fallback) per disegnare su canvas
    const getBitmap = async (blob) => {
      if (typeof window !== 'undefined' && window.createImageBitmap) {
        return await createImageBitmap(blob);
      }
      const dataUrl = await new Promise((ok, ko) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = ko;
        r.readAsDataURL(blob);
      });
      const img = new Image();
      await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = dataUrl; });
      return img;
    };

    const bmp = await getBitmap(file);
    const w0 = bmp.width || bmp.naturalWidth;
    const h0 = bmp.height || bmp.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));

    // Se già piccolo (<~1.2MB) o lato max <= maxSide, lascia stare
    if (scale === 1 && file.size <= 1_200_000) return file;

    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);

    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
    if (!blob) return file;

    // Se per qualche motivo non comprimiamo davvero, tieni l'originale
    if (blob.size >= file.size) return file;

    const base = (file.name || 'upload').replace(/\.\w+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    // In caso di errore, non bloccare il flusso: torna l’originale
    return file;
  }
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
function estimateCandidateLines(ocrText=''){
  const lines = String(ocrText).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const HEADER = /^(documento|descrizione|prezzo|totale|subtotale|pagamento|resto|iva|rt\b|cassa|cassiere|codice|tessera|\(off\.)/i;
  let count = 0;
  for (const ln of lines){
    if (HEADER.test(ln)) continue;
    if (ln.length < 4) continue;
    // euristica: riga con parole e senza sembrare solo prezzo
    if (/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(ln)) count++;
  }
  return count;
}

/* ====================== Vision-first → Liste, Scorte, Finanze (ChatGPT-like) ====================== */

/** Calcola totali scontrino da righe + meta */
function computeReceiptTotals(rows = [], meta = {}) {
  const currency = 'EUR';
  const subtotal = rows.reduce((s, r) => {
    const pe = Number(r.priceEach || 0);
    const pt = Number(r.priceTotal || 0);
    const pk = Math.max(1, Number(r.packs || 1));
    return s + (pt || (pe * pk));
  }, 0);

  // prova a leggere eventuali campi meta (se la tua /vision li passa)
  const paid   = Number(meta.paid || meta.paid_cash || meta.total_paid || subtotal) || subtotal;
  const change = Number(meta.change || 0);
  return { subtotal: Math.round(subtotal * 100) / 100, paid: Math.round(paid * 100) / 100, change: Math.round(change * 100) / 100, currency };
}

/** Normalizza righe receipt “alla ChatGPT” anche se manca il core (fallback gentile) */
function normalizeReceiptPurchasesSafe(raw = [], { learned } = {}) {
  // se hai già la versione “core” incollata prima, usiamo quella
  if (typeof normalizeReceiptPurchases === 'function') {
    return normalizeReceiptPurchases(raw, { learned });
  }
  // Fallback leggero: tipi, quantità minime, merge sobrio
  const MEASURE = /\b\d+(?:[.,]\d+)?\s*(kg|g|gr|ml|cl|l|lt)\b/i;
  const LAVAGGI = /\blavaggi?\b/i;
  const UNIT_RE = /\b(pz|pezzi|capsule|bottiglie|uova|rotoli|lattine|vasetti)\b/i;
  const out = (Array.isArray(raw) ? raw : []).map(p => {
    let name = String(p?.name || '').trim();
    let brand= String(p?.brand||'').trim();
    let packs = Math.max(1, Number(p?.packs || 1));
    let upp   = Math.max(1, Number(p?.unitsPerPack || 1));
    let unitLabel = normalizeUnitLabel(p?.unitLabel || (upp>1?'pezzi':'unità'));

    if (LAVAGGI.test(name)) { upp = 1; unitLabel = 'unità'; }
    if (MEASURE.test(name) && !UNIT_RE.test(name)) { upp = 1; unitLabel = 'unità'; }
    if (/uova/i.test(name) && /\b6\b/.test(name)) { upp = 6; unitLabel = 'uova'; }

    const priceEach  = Number(p?.priceEach || 0);
    const priceTotal = Number(p?.priceTotal || 0) || (priceEach * packs);

    return { name, brand, packs, unitsPerPack: upp, unitLabel, priceEach, priceTotal, currency:'EUR', expiresAt: String(p?.expiresAt||'') };
  });

  // merge semplice (stesso nome+marca+UPP)
  const map = new Map();
  for (const r of out) {
    const key = `${productKey(r.name, r.brand)}|${r.unitsPerPack}`;
    const prev = map.get(key) || { ...r, packs:0, priceTotal:0 };
    prev.packs += Math.max(1, Number(r.packs || 1));
    prev.priceTotal += Number(r.priceTotal || 0);
    prev.unitLabel = normalizeUnitLabel(prev.unitLabel || (prev.unitsPerPack>1?'pezzi':'unità'));
    map.set(key, prev);
  }
  return [...map.values()];
}

/** Inserisce in SCORTE una riga acquisto (merge se esiste) */
function upsertStockWithPurchase(arr, p, todayISO, imagesIndex) {
  const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
  const packs = Math.max(0, Number(p.packs || 0));
  const upp   = Math.max(1, Number(p.unitsPerPack || 1));
  const lbl   = p.unitLabel || (upp>1 ? 'pezzi' : 'unità');
  const hasCounts = packs > 0 || upp > 0;

  if (idx >= 0) {
    const old = arr[idx];
    if (hasCounts) {
      const newP = Math.max(0, Number(old.packs || 0) + packs);
      const newU = Math.max(1, Number(old.unitsPerPack || upp));
      arr[idx] = {
        ...old,
        packs:newP, unitsPerPack:newU,
        unitLabel: old.unitLabel || lbl,
        expiresAt: p.expiresAt || old.expiresAt || '',
        packsOnly:false, needsUpdate:false,
        ...restockTouch(newP, todayISO, newU)
      };
    } else if (DEFAULT_PACKS_IF_MISSING) {
      const uo = Math.max(1, Number(old.unitsPerPack || 1));
      const np = Math.max(0, Number(old.packs || 0) + 1);
      arr[idx] = {
        ...old,
        packs:np, unitsPerPack:uo,
        unitLabel: old.unitLabel || 'unità',
        packsOnly:false, needsUpdate:false,
        ...restockTouch(np, todayISO, uo)
      };
    } else {
      arr[idx] = { ...old, needsUpdate:true };
    }
  } else {
    if (hasCounts) {
      arr.unshift(withRememberedImage({
        name:p.name, brand:p.brand || '', packs, unitsPerPack:upp, unitLabel:lbl,
        expiresAt:p.expiresAt || '',
        baselinePacks:packs, lastRestockAt:todayISO, avgDailyUnits:0,
        residueUnits:packs*upp, packsOnly:false, needsUpdate:false
      }, imagesIndex));
    } else if (DEFAULT_PACKS_IF_MISSING) {
      arr.unshift(withRememberedImage({
        name:p.name, brand:p.brand || '',
        packs:1, unitsPerPack:1, unitLabel:'unità',
        expiresAt:p.expiresAt || '',
        baselinePacks:1, lastRestockAt:todayISO, avgDailyUnits:0,
        residueUnits:1, packsOnly:false, needsUpdate:false
      }, imagesIndex));
    } else {
      arr.unshift(withRememberedImage({
        name:p.name, brand:p.brand || '',
        packs:0, unitsPerPack:1, unitLabel:'-',
        expiresAt:p.expiresAt || '',
        baselinePacks:0, lastRestockAt:'', avgDailyUnits:0,
        residueUnits:0, packsOnly:true, needsUpdate:true
      }, imagesIndex));
    }
  }
}

/** === FUNZIONE PRINCIPALE: Vision-first → Liste, Scorte, Finanze === */
async function handleOCR(files) {
  if (!files) return;
  try {
    setBusy(true);

    // 0) pick file reale e downscale
    const arrFiles = Array.from(files || []).filter(f => f && typeof f === 'object' && typeof f.size === 'number');
    if (!arrFiles.length) { showToast('Nessuna immagine valida selezionata', 'err'); return; }
    const first = arrFiles[0];
    const slim  = (typeof downscaleImageFile === 'function')
      ? await downscaleImageFile(first, { maxSide: 1600, quality: 0.78 })
      : first;

    // 1) Vision-first (usa già il tuo endpoint lib/receipt-pipeline)
    const { meta: visionMeta = {}, purchases: rawVisionRows = [] } = await visionFirstParseFromFiles([slim]);

    // 2) Normalizza come ChatGPT + (opzionale) arricchisci UPP/label via web
    let purchases = normalizeReceiptPurchasesSafe(rawVisionRows, { learned });
    if (purchases.length === 0) {
      showToast('Nessuna riga riconosciuta', 'err');
      return;
    }

    try {
      const enriched = await enrichPurchasesViaWeb(purchases);
      // re-normalizza dopo enrichment (se hai il core userà quello, altrimenti fallback)
      purchases = normalizeReceiptPurchasesSafe(enriched, { learned });
    } catch (_) { /* ok, non bloccare */ }

    // 3) Decrementa entrambe le liste con le righe riconosciute
    setLists(prev => decrementAcrossBothLists(prev, purchases));

    // 4) Aggiorna SCORTE
    setStock(prev => {
      const arr = [...prev];
      const todayISO = new Date().toISOString().slice(0, 10);
      for (const p of purchases) upsertStockWithPurchase(arr, p, todayISO, imagesIndex);
      return arr;
    });

    // 5) Calcola totali e invia a FINANZE
    const meta = {
      store: String(visionMeta?.store || '').trim(),
      purchaseDate: toISODate(visionMeta?.purchaseDate || '')
    };
    const { subtotal, paid, change, currency } = computeReceiptTotals(purchases, visionMeta);

    const itemsSafe = purchases.map(p => ({
      name: p.name, brand: p.brand || '',
      packs: Number(p.packs || 0),
      unitsPerPack: Number(p.unitsPerPack || 0),
      unitLabel: p.unitLabel || '',
      priceEach: Number(p.priceEach || 0),
      priceTotal: Number(p.priceTotal || 0),
      currency: p.currency || currency,
      expiresAt: p.expiresAt || ''
    }));

    const payloadFin = {
      ...(userIdRef?.current ? { user_id: userIdRef.current } : {}),
      ...(meta.store ? { store: meta.store } : {}),
      ...(meta.purchaseDate ? { purchaseDate: meta.purchaseDate } : {}),
      receipt_subtotal: subtotal,
      paid_total: paid,
      change_total: change,
      payment_method: 'cash',
      // facoltativo: bucket/etichette lato server (“spese_casa”, “entrate_soldi_in_tasca” se gestisci i resti o cashback)
      buckets: ['spese_casa'],
      items: itemsSafe
    };

    try {
      await fetchJSONStrict(API_FINANCES_INGEST, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payloadFin)
      }, 30000);
    } catch (e) {
      if (DEBUG) console.warn('[FINANCES_INGEST] fail', e);
      showToast(`Finanze: ${e?.message || e}`, 'err');
    }

    showToast('Scontrino importato: liste, scorte e finanze aggiornate ✓', 'ok');
  } catch (e) {
    console.error('[handleOCR] error', e);
    showToast(`Errore OCR/Vision: ${e?.message || e}`, 'err');
  } finally {
    setBusy(false);
    if (ocrInputRef?.current) ocrInputRef.current.value = '';
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
    {reviewOpen && (
  <div style={{ position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,.55)', display:'grid', placeItems:'center' }}>
    <div style={{
      width:'min(920px, 94vw)', maxHeight:'82vh', overflow:'hidden',
      background:'rgba(17,24,39,.97)', border:'1px solid rgba(255,255,255,.12)',
      borderRadius:14, boxShadow:'0 20px 50px rgba(0,0,0,.6)', color:'#e5e7eb'
    }}>
      {/* Header */}
      <div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.08)'}}>
        <h3 style={{ margin:0, fontSize:'1.08rem', fontWeight:800 }}>Convalida & Modifica articoli</h3>
        <p style={{ margin:'4px 0 0', opacity:.85, fontSize:'.9rem' }}>
          Spunta gli articoli da aggiungere. Puoi modificare nome, marca e quantità prima di confermare.
        </p>
        <div style={{ marginTop:8, display:'flex', gap:8 }}>
          <button onClick={autoNormalizeReview} style={styles.smallGhostBtn} title="Applica normalizzazioni note">
            Auto-normalizza
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding:'10px 14px', overflowY:'auto', maxHeight:'58vh', display:'flex', flexDirection:'column', gap:10 }}>
        {reviewItems.map((it) => {
          const key = productKey(it.name, it.brand || '');
          const checked = !!reviewPick[key];

          return (
            <div key={it.id || key} style={{
              display:'grid',
              gridTemplateColumns:'24px 1.2fr 1fr 0.6fr 0.8fr 0.9fr 0.9fr auto',
              gap:10, alignItems:'center',
              padding:'10px 12px', borderRadius:10,
              background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.10)'
            }}>
              {/* Check */}
              <input
                type="checkbox"
                checked={checked}
                onChange={() => setReviewPick(prev => ({ ...prev, [key]: !checked }))}
                style={{ width:18, height:18 }}
              />

              {/* Nome */}
              <input
                value={it.name}
                onChange={(e) => handleReviewChange(it.id, 'name', e.target.value)}
                placeholder="Nome prodotto"
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #475569', background:'rgba(15,23,42,.65)', color:'#f1f5f9' }}
              />

              {/* Marca */}
              <input
                value={it.brand || ''}
                onChange={(e) => handleReviewChange(it.id, 'brand', e.target.value)}
                placeholder="Marca"
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #475569', background:'rgba(15,23,42,.65)', color:'#f1f5f9' }}
              />

              {/* Packs */}
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <button type="button" onClick={() => handleReviewChange(it.id, 'packs', Math.max(0, (parseInt(it.packs||1,10)||1)-1))} style={{ ...styles.iconSquareBase, width:32, height:32 }} title="-1">−</button>
                <input inputMode="numeric" value={String(it.packs ?? 1)} onChange={(e) => handleReviewChange(it.id, 'packs', Math.max(0, parseInt(e.target.value||'1',10)||1))} style={{ width:60, padding:'8px 10px', borderRadius:8, border:'1px solid #475569', background:'rgba(15,23,42,.65)', color:'#f1f5f9', textAlign:'center' }} />
                <button type="button" onClick={() => handleReviewChange(it.id, 'packs', (parseInt(it.packs||1,10)||1)+1)} style={{ ...styles.iconSquareBase, width:32, height:32 }} title="+1">+</button>
              </div>

              {/* UPP */}
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <button type="button" onClick={() => handleReviewChange(it.id, 'unitsPerPack', Math.max(1, (parseInt(it.unitsPerPack||1,10)||1)-1))} style={{ ...styles.iconSquareBase, width:32, height:32 }} title="-1">−</button>
                <input inputMode="numeric" value={String(it.unitsPerPack ?? 1)} onChange={(e) => handleReviewChange(it.id, 'unitsPerPack', Math.max(1, parseInt(e.target.value||'1',10)||1))} style={{ width:60, padding:'8px 10px', borderRadius:8, border:'1px solid #475569', background:'rgba(15,23,42,.65)', color:'#f1f5f9', textAlign:'center' }} />
                <button type="button" onClick={() => handleReviewChange(it.id, 'unitsPerPack', Math.max(1, (parseInt(it.unitsPerPack||1,10)||1)+1))} style={{ ...styles.iconSquareBase, width:32, height:32 }} title="+1">+</button>
              </div>

              {/* Etichetta unità */}
              <select
                value={it.unitLabel || 'unità'}
                onChange={(e) => handleReviewChange(it.id, 'unitLabel', e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #475569', background:'rgba(15,23,42,.65)', color:'#f1f5f9' }}
              >
                {['unità','pezzi','bottiglie','buste','lattine','vasetti','rotoli','capsule','brick','uova'].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>

              {/* Scadenza */}
              <input
                type="date"
                value={it.expiresAt || ''}
                onChange={(e) => handleReviewChange(it.id, 'expiresAt', e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #475569', background:'rgba(15,23,42,.65)', color:'#f1f5f9' }}
              />

              {/* Scarta riga */}
              <button
                type="button"
                onClick={() => setReviewPick(prev => ({ ...prev, [key]: false }))}
                style={{ ...styles.iconSquareBase, ...styles.iconDanger, width:36, height:36 }}
                title="Scarta"
              >🗑</button>
            </div>
          );
        })}
        {reviewItems.length === 0 && <p style={{ opacity:.8 }}>Nessun candidato da convalidare.</p>}
      </div>

      {/* Footer */}
      <div style={{ padding:'10px 14px', display:'flex', gap:8, borderTop:'1px solid rgba(255,255,255,.08)'}}>
        <button
          onClick={() => setReviewPick(reviewItems.reduce((acc, it) => { acc[productKey(it.name, it.brand || '')] = true; return acc; }, {}))}
          style={styles.smallGhostBtn}
        >Seleziona tutti</button>
        <button onClick={() => setReviewPick({})} style={styles.smallGhostBtn}>Deseleziona</button>
        <div style={{ flex:1 }} />
        <button onClick={() => { setReviewOpen(false); setReviewItems([]); setReviewPick({}); setPendingOcrMeta(null); }} style={styles.smallGhostBtn}>Annulla</button>
        <button onClick={applyReviewSelection} style={styles.smallOkBtn}>Aggiungi selezionati</button>
      </div>
    </div>
  </div>
)}
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
      {/* SAFE OVERRIDES SOLO per /liste-prodotti */}

   
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
  
}





