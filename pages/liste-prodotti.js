// pages/liste-prodotti.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Camera, Plus, Calendar } from 'lucide-react';
import dynamic from 'next/dynamic';

/*** === AI-only Receipt Extraction: definire PRIMA di ogni utilizzo === ***/

// Schema atteso dal modello (usato solo come payload: costante non hoistata → deve stare prima)
const RECEIPT_SCHEMA = {
  title: 'ReceiptExtraction',
  type: 'object',
  additionalProperties: false,
  properties: {
    store: { type: 'string' },
    purchaseDate: { type: 'string' },
    purchases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name:        { type: 'string' },
          brand:       { type: 'string' },
          packs:       { type: 'number' },
          unitsPerPack:{ type: 'number' },
          unitLabel:   { type: 'string' },
          priceEach:   { type: 'number' },
          priceTotal:  { type: 'number' },
          currency:    { type: 'string' },
          expiresAt:   { type: 'string' }
        },
        required: ['name','brand','packs','unitsPerPack','unitLabel','priceEach','priceTotal','currency','expiresAt']
      }
    }
  },
  required: ['store','purchaseDate','purchases']
};

// Funzione dichiarativa (function declaration) → HOISTED: non entra in TDZ
async function askAssistantJSON(prompt, schema) {
  try {
    const body = schema
      ? { prompt, response_format: 'json_schema', schemaName: schema.title || 'Schema', schema }
      : { prompt };

    const res = await timeoutFetch(
      API_ASSISTANT_TEXT,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      45000
    );

    const safe = await readJsonSafe(res);
    let answer = safe?.answer ?? safe?.data ?? safe;

    if (typeof answer === 'string') {
      try { answer = JSON.parse(answer); } catch { answer = null; }
    }
    if (answer && answer.ok && answer.data) {
      try { return typeof answer.data === 'string' ? JSON.parse(answer.data) : answer.data; }
      catch { return answer.data; }
    }
    return answer || null;
  } catch (e) {
    try { console.warn('[askAssistantJSON] fail:', e); } catch {}
    return null;
  }
}


// ===== BASE LEXICON (minimo, espandibile) =====
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

// Sinonimi quantità per i parser (vocale/regex)
const UNIT_SYNONYMS = '(?:unit(?:a|à)?|unit\\b|pz\\.?|pezz(?:i|o)\\.?|bottiglie?|busta(?:e)?|bustine?|lattin(?:a|e)|barattol(?:o|i)|vasett(?:o|i)|vaschett(?:a|e)|brick|cartocc(?:io|i)|fett(?:a|e)|uova|capsul(?:a|e)|pods|rotol(?:o|i)|fogli(?:o|i))';
const PACK_SYNONYMS = '(?:conf(?:e(?:zioni)?)?|confezione|pacc?hi?|pack|multipack|scatol(?:a|e)|carton(?:e|i))';

// ===== REVIEW BRIDGE (module-scope): permette a openValidation di aprire la modale =====
let __reviewSetters = null;
function registerReviewSetters(setters){ __reviewSetters = setters; }

// usa NEXT_PUBLIC_USE_AGENT_POST=1 per abilitarlo in prod
const USE_AGENT_POST = process.env.NEXT_PUBLIC_USE_AGENT_POST === '1';

// ===== Helper “learning” SHIM per evitare ReferenceError =====
function applyLearnedAliases({ name, brand }, learned){
  let n = name || '', b = brand || '';
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if (learned?.aliases?.brand) {
    for (const [pat, repl] of Object.entries(learned.aliases.brand)) {
      const re = new RegExp(`\\b${esc(pat)}\\b`, 'i');
      if (re.test(b) || re.test(n)) { b = repl; n = n.replace(re,'').trim(); }
    }
  }
  if (learned?.aliases?.product) {
    for (const [pat, repl] of Object.entries(learned.aliases.product)) {
      const re = new RegExp(`\\b${esc(pat)}\\b`, 'i');
      if (re.test(n)) n = n.replace(re, repl).trim();
    }
  }
  return { name:n, brand:b };
}
function normalizeBrandName(s){ 
  const t = String(s||'');
  if (/^\s*m\s*bianco\b|mbianco\b/i.test(t) || /mulino\s*bianco/i.test(t)) return 'Mulino Bianco';
  return t.trim();
}
function normalizeProductName(n){ return String(n||'').trim(); }
function rememberItems(arr){ /* no-op minimo */ }

/* ====================== Costanti / Config ====================== */
const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;

/* ====================== Feature toggles / safety ====================== */
const DEFAULT_PACKS_IF_MISSING = true;

// —— Cloud sync (Supabase)
const CLOUD_SYNC = true;
const CLOUD_TABLE = 'jarvis_liste_state';
let __supabase = null;

/* ====================== Endpoints esistenti ====================== */
const API_ASSISTANT_TEXT = '/api/assistant';
const API_OCR = '/api/ocr';
const API_FINANCES_INGEST = '/api/finances/ingest';
const API_PRODUCTS_ENRICH = '/api/products/enrich';

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
/* ===== Match rigoroso per NON accorpare righe tra loro ===== */
function sameText(a = '', b = '') { return normKey(a) === normKey(b); }

function isSameProductStrict(aName, aBrand, bName, bBrand) {
  const na = normKey(aName), nb = normKey(bName);
  const ba = normKey(aBrand), bb = normKey(bBrand);
  if (!na || !nb) return false;
  if (na === nb) { if (ba && bb) return ba === bb; return true; }
  if (ba && bb && ba === bb) {
    if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) return true;
  }
  return false;
}
function findStockIndexStrict(arr, p) {
  const name = String(p?.name || '');
  const brand = String(p?.brand || '');
  let idx = arr.findIndex(s => isSameProductStrict(s?.name, s?.brand || '', name, brand));
  if (idx >= 0) return idx;
  if (brand) idx = arr.findIndex(s => sameText(s?.name, name) && !normKey(s?.brand || ''));
  return idx;
}

/* SAFETY SHIM — garantisce che isSimilar esista nel modulo */
var isSimilar = isSimilar || function isSimilar(a, b) {
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

function productKey(name = '', brand = '') {
  return `${normKey(name)}|${normKey(brand)}`;
}

/* ====================== Cloud: sanitizer stato per upsert ====================== */
function stripForCloud(state = {}) {
  const safeList = (arr) =>
    (Array.isArray(arr) ? arr : []).map((it) => ({
      id: String(it?.id ?? ''),
      name: String(it?.name ?? ''),
      brand: String(it?.brand ?? ''),
      qty: Number(it?.qty ?? 0),
      unitsPerPack: Number(it?.unitsPerPack ?? 1),
      unitLabel: String(it?.unitLabel ?? 'unità'),
      purchased: !!it?.purchased,
    }));

  const lists = state?.lists || {};
  const safeLists = {
    [LIST_TYPES.SUPERMARKET]: safeList(lists[LIST_TYPES.SUPERMARKET]),
    [LIST_TYPES.ONLINE]:      safeList(lists[LIST_TYPES.ONLINE]),
  };

  const safeStock = (Array.isArray(state?.stock) ? state.stock : []).map((s) => {
    const base = {
      name: String(s?.name ?? ''),
      brand: String(s?.brand ?? ''),
      packs: Number(s?.packs ?? 0),
      unitsPerPack: Number(s?.unitsPerPack ?? 1),
      unitLabel: String(s?.unitLabel ?? 'unità'),
      expiresAt: String(s?.expiresAt ?? ''),
      baselinePacks: Number(s?.baselinePacks ?? 0),
      lastRestockAt: String(s?.lastRestockAt ?? ''),
      avgDailyUnits: Number(s?.avgDailyUnits ?? 0),
      residueUnits: Number(
        s?.residueUnits ?? (Number(s?.packs ?? 0) * Number(s?.unitsPerPack ?? 1))
      ),
      packsOnly: !!s?.packsOnly,
    };

    const img = s?.image;
    if (typeof img === 'string') {
      const isHttp = /^https?:\/\//i.test(img);
      const isProxy = img.startsWith('/api/img-proxy?');
      if (isHttp && img.length <= 2000) base.image = img;
      else if (isProxy) {
        try {
          const abs = (typeof window !== 'undefined' && window.location)
            ? `${window.location.origin}${img}`
            : img;
          if (/^https?:\/\//i.test(abs) && abs.length <= 2000) base.image = abs;
        } catch {}
      }
    }
    return base;
  });

  const imagesIndex = {};
  const source = (state?.imagesIndex && typeof state.imagesIndex === 'object')
    ? state.imagesIndex
    : {};

  for (const [k, v] of Object.entries(source)) {
    if (typeof v !== 'string') continue;
    if (/^https?:\/\//i.test(v)) {
      if (v.length <= 2000) imagesIndex[k] = v;
      continue;
    }
    if (v.startsWith('/api/img-proxy?')) {
      try {
        const abs = (typeof window !== 'undefined' && window.location)
          ? `${window.location.origin}${v}`
          : v;
        if (/^https?:\/\//i.test(abs) && abs.length <= 2000) imagesIndex[k] = abs;
      } catch {}
    }
  }

  const learned =
    state?.learned && typeof state.learned === 'object'
      ? {
          products: state.learned.products || {},
          aliases: state.learned.aliases || { product: {}, brand: {} },
          keepTerms: state.learned.keepTerms || {},
        }
      : undefined;

  const currentList = [LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].includes(state?.currentList)
    ? state.currentList
    : LIST_TYPES.SUPERMARKET;

  const _ts = Date.now();

  return { _ts, lists: safeLists, stock: safeStock, currentList, imagesIndex, learned };
}

function loadPersisted() {
  try {
    const raw =
      typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
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
      imagesIndex: snapshot.imagesIndex || {},
      learned: snapshot.learned || learned,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[persist] save failed', e);
  }
}

/* ==================== LEXICON EXTENSION + QUANTITY SANITIZER + PROMPTS (SAFE) ==================== */
(() => {
  if (typeof GROCERY_LEXICON === 'undefined') return;

  const __hasLex = (term) =>
    Array.isArray(GROCERY_LEXICON) &&
    GROCERY_LEXICON.some((x) => normKey(x) === normKey(term));
  const __lexAdd = (arr) => {
    arr.forEach((t) => { if (t && !__hasLex(t)) GROCERY_LEXICON.push(t); });
  };

  // … (omessi: definizioni LEX_* come nel tuo blocco) …
})();

// ——— Sanitizzazione quantità ——…
const MEASURE_TOKEN_RE = /\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|lt|ml|cl|m³|m3|mq|m²|cm|mm)\b/gi;
const DIMENSION_RE     = /\b\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?\s*(?:cm|mm|m)\b/gi;
const SUSPECT_UPP = new Set([125,200,220,225,230,240,250,280,300,330,350,375,400,450,454,500,700,720,733,750,800,900,910,930,950,1000,1250,1500,1750,2000]);

function cleanupPurchasesQuantities(list) {
  return (Array.isArray(list) ? list : []).map((p) => {
    const out = { ...p };
    const joined = `${String(out.name || '')} ${String(out.brand || '')}`.toLowerCase();
    const hasMeasure = (joined.match(MEASURE_TOKEN_RE) || []).length > 0 || (joined.match(DIMENSION_RE) || []).length > 0;
    const u = Math.max(0, Number(out.unitsPerPack || 0));
    const packs = Math.max(0, Number(out.packs || 0));
    const piecesHit = /\b(pz|pezzi|bottigli|capsul|pods|bust|lattin|vasett|rotol|fogli|uova|brick)\b/i.test(
      normKey(`${out.unitLabel || ''} ${joined}`)
    );
    const looksWeightNumber = !piecesHit && (hasMeasure || SUSPECT_UPP.has(u));
    if ((hasMeasure && u > 1) || looksWeightNumber) {
      out.unitsPerPack = 1;
      out.unitLabel = 'unità';
      if (!packs) out.packs = 1;
    }
    return out;
  });
}

// … (altri helper invariati) …

/* ====================== Fetch helpers / util varie ====================== */
async function readJsonSafe(res) {
  const ct = (res.headers.get?.('content-type') || '').toLowerCase();
  const raw = (await res.text?.()) || '';
  if (!raw.trim()) return { ok: res.ok, data: null, error: res.ok ? null : `HTTP ${res.status}` };
  if (ct.includes('application/json')) {
    try { return { ok: res.ok, ...(JSON.parse(raw) || {}) }; }
    catch (e) { return { ok: res.ok, data: null, error: `JSON parse error: ${e?.message || e}` }; }
  }
  try { return { ok: res.ok, ...(JSON.parse(raw) || {}) }; }
  catch { return { ok: res.ok, data: null, error: raw.slice(0, 200) || `HTTP ${res.status}` }; }
}
function ensureArray(x) { return Array.isArray(x) ? x : []; }
function timeoutFetch(url, opts = {}, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(t));
}
// Indice immagini sicuro (evita ReferenceError in SSR/CSR)
function getImgIndexSafe(localCandidate) {
  if (localCandidate && typeof localCandidate === 'object') return localCandidate;
  try { if (typeof imagesIndex !== 'undefined' && imagesIndex) return imagesIndex; } catch {}
  try { if (typeof mergedImagesIndex !== 'undefined' && mergedImagesIndex) return mergedImagesIndex; } catch {}
  return {};
}

async function readTextSafe(res) { try { return await res.text(); } catch { return ''; } }
async function fetchJSONStrict(url, opts = {}, timeoutMs = 40000) {
  const r = await timeoutFetch(url, opts, timeoutMs);
  const ct = (r.headers.get?.('content-type') || '').toLowerCase();
  const raw = await readTextSafe(r);
  if (!r.ok) {
    let msg = raw;
    if (ct.includes('application/json')) { try { const j = JSON.parse(raw); msg = j.error || j.message || JSON.stringify(j); } catch {} }
    throw new Error(`HTTP ${r.status} ${r.statusText || ''} — ${String(msg).slice(0, 250)}`);
  }
  if (!raw.trim()) return {};
  if (ct.includes('application/json')) { try { return JSON.parse(raw); } catch (e) { throw new Error(`JSON parse error: ${e?.message || e}`); } }
  try { return JSON.parse(raw); } catch { return { data: raw }; }
}

// ===== ENRICH: mantieni SEMPRE il nome OCR; aggiungi prettyName/brand/desc/immagine =====
async function enrichPurchasesViaWeb(purchases = []) {
  if (!Array.isArray(purchases) || purchases.length === 0) return { items: purchases, images: {} };

  const payload = { items: purchases.map(p => ({ name: String(p.name || ''), brand: String(p.brand || '') })) };

  try {
    const resp = await timeoutFetch(API_PRODUCTS_ENRICH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 30000);

    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || !json.ok || !Array.isArray(json.items)) throw new Error(json?.error || `enrich HTTP ${resp.status}`);

    const keyFull = (n, b) => `${normKey(n)}|${normKey(b||'')}`;
    const byFull = new Map();
    const byName = new Map();
    for (const x of json.items) {
      const sn = String(x.sourceName || '');
      const br = String(x.brand || '');
      byFull.set(keyFull(sn, br), x);
      if (!byName.has(normKey(sn))) byName.set(normKey(sn), x);
    }

    const imagesMap = {};
    let improved = 0;

    const out = purchases.map((p) => {
      const n0 = String(p.name || '').trim();
      const b0 = String(p.brand || '').trim();

      const hit = byFull.get(keyFull(n0, b0)) || byName.get(normKey(n0));
      const prettyName   = String(hit?.normalizedName || '').trim();
      const inferredBrand= String(hit?.brand || '').trim();
      const finalBrand   = b0 || inferredBrand;
      const shortDesc    = String(hit?.shortDescription || hit?.category || '').trim();

      let proxied = '';
      const imageUrl = hit?.imageUrl;
      if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
        const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
        proxied = origin ? `${origin}/api/img-proxy?url=${encodeURIComponent(imageUrl)}` : `/api/img-proxy?url=${encodeURIComponent(imageUrl)}`;
      }
      if (proxied) {
        imagesMap[productKey(n0, finalBrand)] = proxied;
        imagesMap[productKey(n0, '')] ||= proxied;
      }

      if ((prettyName && prettyName !== n0) || (finalBrand !== b0) || proxied || shortDesc) improved++;

      return { ...p, name: n0, prettyName: prettyName || '', brand: finalBrand, description: shortDesc };
    });

    try { console.log('[enrich applied]', { requested: purchases.length, improved }); } catch {}
    return { items: out, images: imagesMap };
  } catch (err) {
    console.warn('[enrich] fail:', err);
    return { items: purchases, images: {} };
  }
}

/* ====================== Calcoli scorte ====================== */
// … (invariati: clamp01, residueUnitsOf, residueInfo, ecc.) …

/* ====================== Applica aggiunte (liste+scorte+finanze) ====================== */
async function applyAdditionalPurchases(addItems, meta = {}) {
  if (!Array.isArray(addItems) || !addItems.length) return;

  // 1) Decrementa liste
  setLists(prev => decrementAcrossBothLists(prev, addItems));

  // 2) Aggiorna scorte (match rigoroso + mantieni name OCR; usa prettyName/desc solo per display)
  setStock(prev => {
    const arr = [...prev];
    const todayISO = new Date().toISOString().slice(0, 10);
    const imgIdx = getImgIndexSafe(imagesIndex); // 👈 indice immagini sicuro

    for (const p of addItems) {
      const idx = findStockIndexStrict(arr, p);
      const packs = Math.max(0, Number(p.packs || 0));
      const upp   = Math.max(1, Number(p.unitsPerPack || 1));
      const hasCounts = packs > 0 || upp > 0;

      if (idx >= 0) {
        const old = arr[idx];

        if (hasCounts) {
          const newP = Math.max(0, Number(old.packs || 0) + packs);
          const newU = Math.max(1, Number(old.unitsPerPack || upp));

          let updated = {
            ...old,
            name: old.name,
            brand: (p.brand || old.brand || '').trim(),
            packs: newP,
            unitsPerPack: newU,
            unitLabel: old.unitLabel || p.unitLabel || 'unità',
            expiresAt: p.expiresAt || old.expiresAt || '',
            prettyName: p.prettyName || old.prettyName || '',
            desc: (p.description || old.desc || ''),
            packsOnly: false,
            needsUpdate: false,
            ...restockTouch(newP, todayISO, newU),
          };

          // Aggancia immagine se disponibile
          try {
            if (!updated.image) {
              const keys = [
                productKey(updated.name, updated.brand || ''),
                productKey(p.name || updated.name, p.brand || updated.brand || ''),
                productKey(updated.name, ''),
              ];
              for (const k of keys) { if (imgIdx[k]) { updated.image = imgIdx[k]; break; } }
            }
          } catch {}

          arr[idx] = updated;

        } else {
          if (DEFAULT_PACKS_IF_MISSING) {
            const uo = Math.max(1, Number(old.unitsPerPack || 1));
            const np = Math.max(0, Number(old.packs || 0) + 1);

            let updated = {
              ...old,
              name: old.name,
              brand: (p.brand || old.brand || '').trim(),
              packs: np,
              unitsPerPack: uo,
              unitLabel: old.unitLabel || 'unità',
              prettyName: p.prettyName || old.prettyName || '',
              desc: (p.description || old.desc || ''),
              packsOnly: false,
              needsUpdate: false,
              ...restockTouch(np, todayISO, uo),
            };

            try {
              if (!updated.image) {
                const keys = [ productKey(updated.name, updated.brand || ''), productKey(updated.name, '') ];
                for (const k of keys) { if (imgIdx[k]) { updated.image = imgIdx[k]; break; } }
              }
            } catch {}

            arr[idx] = updated;

          } else {
            arr[idx] = { ...old, needsUpdate: true };
          }
        }

      } else {
        // nuova riga scorte
        const baseRow = {
          name: p.name,
          brand: p.brand || '',
          unitLabel: p.unitLabel || 'unità',
          expiresAt: p.expiresAt || '',
          prettyName: p.prettyName || '',
          desc: (p.description || ''),
        };

        if (hasCounts) {
          arr.unshift(withRememberedImage({
            ...baseRow,
            packs,
            unitsPerPack: upp,
            baselinePacks: packs,
            lastRestockAt: todayISO,
            avgDailyUnits: 0,
            residueUnits: packs * upp,
            packsOnly: false,
            needsUpdate: false
          }, imgIdx));
        } else if (DEFAULT_PACKS_IF_MISSING) {
          arr.unshift(withRememberedImage({
            ...baseRow,
            packs: 1,
            unitsPerPack: 1,
            baselinePacks: 1,
            lastRestockAt: todayISO,
            avgDailyUnits: 0,
            residueUnits: 1,
            packsOnly: false,
            needsUpdate: false
          }, imgIdx));
        } else {
          arr.unshift(withRememberedImage({
            ...baseRow,
            packs: 0,
            unitsPerPack: 1,
            unitLabel: '-',
            baselinePacks: 0,
            lastRestockAt: '',
            avgDailyUnits: 0,
            residueUnits: 0,
            packsOnly: true,
            needsUpdate: true
          }, imgIdx));
        }
      }
    }
    return arr;
  });

  // 3) Finanze
  try {
    const itemsSafe = addItems.map(p => ({
      name: p.name,
      brand: p.brand || '',
      packs: Number(p.packs || 0),
      unitsPerPack: Number(p.unitsPerPack || 0),
      unitLabel: p.unitLabel || '',
      priceEach: Number(p.priceEach || 0),
      priceTotal: Number(p.priceTotal || 0),
      currency: p.currency || 'EUR',
      expiresAt: p.expiresAt || '',
    }));
    await fetchJSONStrict(
      API_FINANCES_INGEST,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(userIdRef.current ? { user_id: userIdRef.current } : {}),
          ...(pendingOcrMeta?.store ? { store: pendingOcrMeta.store } : {}),
          ...(pendingOcrMeta?.purchaseDate ? { purchaseDate: pendingOcrMeta.purchaseDate } : {}),
          payment_method: 'cash',
          card_label: null,
          items: itemsSafe,
        }),
      },
      30000
    );
  } catch (e) {
    if (DEBUG) console.warn('[FINANCES_INGEST] review add fail', e);
  }
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
const ENABLE_REVIEW = false;

/* ==== DIRECT RECOGNITION (stile ChatGPT Web) ==== */
const DIRECT_RECOGNITION = true;

/** Prompt “diretto”: nessuna normalizzazione, nessun sinonimo, mantieni i nomi come sullo scontrino */
function buildDirectReceiptPrompt(ocrText) {
  return [
    'Sei Jarvis. Estrai SOLO le RIGHE PRODOTTO da un TESTO OCR di SCONTRINO.',
    'Mantieni i nomi esattamente come appaiono (nessuna normalizzazione). "brand" solo se è scritto nella STESSA riga.',
    '',
    'RISPOSTA SOLO JSON:',
    '{ "store":"", "purchaseDate":"", "purchases":[{"name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","priceEach":0,"priceTotal":0,"currency":"EUR","expiresAt":""}] }',
    '',
    'ESCLUDI SEMPRE (NON inserirli in purchases):',
    '- intestazioni/forme societarie (SRL/SPA/a socio unico), P.IVA/CF/REA, indirizzi (via/v.le/p.zza/corso/Km/CAP), città/provincia, email/PEC/telefono',
    '- RT/cassa/cassiere/codici a barre, metodo di pagamento, RESTO/SUBTOTALE/TOTALE/di cui IVA',
    '- righe promozionali, shopper/sacchetti, ecocontributi, cauzioni/vuoti',
    '',
    'Quantità:',
    '- Imposta packs/unitsPerPack SOLO se espliciti (es. "2x6", "2 confezioni da 6", "6 bottiglie").',
    '- Pesi/volumi/dimensioni (g, kg, ml, L, cm) NON sono quantità → lascia packs=0, unitsPerPack=0, unitLabel="".',
    '',
    'Prezzi:',
    '- priceEach se c’è prezzo unitario; altrimenti 0.',
    '- priceTotal è il totale della riga prodotto.',
    '- currency: "EUR" se non indicato.',
    '',
    'Date/Store:',
    '- purchaseDate come "YYYY-MM-DD" se presente nello scontrino.',
    '- store: solo nome esercizio (non includere indirizzo o forma societaria).',
    '',
    '--- INIZIO OCR ---',
    ocrText,
    '--- FINE OCR ---',
  ].join('\n');
}
// --- Media workaround (safe no-op, evita errori in SSR/CSR) ---
function theMediaWorkaround() {
  // non fare nulla: serve solo a mantenere compatibile il codice esistente
  // Se in futuro vuoi “sbloccare” l’audio su iOS/Chrome:
  // try { if (typeof window !== 'undefined') { /* eventuale warm-up audio */ } } catch {}
}



/* ====================== Component principale ====================== */
function ListeProdotti() {
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
        //if (st.imagesIndex && typeof st.imagesIndex === 'object') setImagesIndex(st.imagesIndex);
      } catch (e) {
        if (DEBUG) console.warn('[cloud init] skipped', e);
      }
    })();

    return () => { mounted = false; };
  }, []);

/* ==== Helpers per stato "safe" (solo utilità locali, nessun return qui) ==== */
const safeStock = (stock || []).map((s) => {
  const base = { ...s };
  const img = base.image;
  // rimuovi immagini non http/https o troppo lunghe (evita base64 pesanti)
  if (!(typeof img === 'string' && /^https?:\/\//i.test(img) && img.length <= 500)) {
    delete base.image;
  }
  return base;
}); // <-- CHIUSURA map CORRETTA

const safeImagesIndex = {};
if (imagesIndex && typeof imagesIndex === 'object') {
  for (const [k, v] of Object.entries(imagesIndex)) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v) && v.length <= 500) {
      safeImagesIndex[k] = v;
    }
  }
}

const safeLearned =
  learned && typeof learned === 'object'
    ? learned
    : { products: {}, aliases: { product: {}, brand: {} }, keepTerms: {}, discardTerms: {} };

const cur = [LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].includes(currentList)
  ? currentList
  : LIST_TYPES.SUPERMARKET;
// (niente return qui)


  const cloudTimerRef = useRef(null);
  useEffect(() => {
    if (!CLOUD_SYNC || !__supabase) return;
    if (!userIdRef.current) return;

    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);

    // NON mandiamo imagesIndex in cloud, e togliamo field .image
   const cloudState = stripForCloud({ lists, stock, currentList, learned, imagesIndex });

    const payload = { user_id: userIdRef.current, state: cloudState };

    cloudTimerRef.current = setTimeout(async () => {
      try {
        await __supabase
          .from(CLOUD_TABLE)
          .upsert(payload, { onConflict: 'user_id' }); // returning minimal
      } catch (e) {
        if (DEBUG) console.warn('[cloud upsert] fail', e);
      }
    }, 1200);

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
    }

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
      [LIST_TYPES.SUPERMARKET]: Array.isArray(saved.lists[LIST_TYPES.SUPERMARKET])
        ? saved.lists[LIST_TYPES.SUPERMARKET]
        : [],
      [LIST_TYPES.ONLINE]: Array.isArray(saved.lists[LIST_TYPES.ONLINE])
        ? saved.lists[LIST_TYPES.ONLINE]
        : [],
    });
  }

  if (Array.isArray(saved.stock)) setStock(saved.stock);

  if (
    saved.currentList &&
    (saved.currentList === LIST_TYPES.SUPERMARKET || saved.currentList === LIST_TYPES.ONLINE)
  ) {
    setCurrentList(saved.currentList);
  }

  if (saved.imagesIndex && typeof saved.imagesIndex === 'object') {
    setImagesIndex(saved.imagesIndex);
  }

  if (saved.learned && typeof saved.learned === 'object') {
    setLearned(saved.learned);
  }
}, []);


/* =================== Autosave debounce (locale) =================== */
// tiene traccia dell’ultimo salvataggio locale applicato (per confronto negli eventi storage)
const lastLocalAtRef = useRef(0);

useEffect(() => {
  if (typeof window === 'undefined') return;

  // clear eventuale debounce precedente
  if (persistTimerRef.current) clearTimeout(persistTimerRef.current);

  // snapshot dell’attuale stato che vogliamo persistere
  const snapshot = { lists, stock, currentList, imagesIndex, learned };

  // debounce breve per ridurre I/O su localStorage
  persistTimerRef.current = setTimeout(() => {
    try {
      // salva su localStorage (persistNow imposta anche "at")
      persistNow(snapshot);
      // aggiorna il timestamp locale per i confronti cross-tab
      lastLocalAtRef.current = Date.now();
    } catch (e) {
      if (DEBUG) console.warn('[persistNow] failed', e);
    }
  }, 300);

  return () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  };
}, [lists, stock, currentList, imagesIndex, learned]);

/* =================== Sync tra tab =================== */
useEffect(() => {
  if (typeof window === 'undefined') return;

  const onStorage = (e) => {
    if (e.key !== LS_KEY) return;

    const saved = loadPersisted();
    if (!saved || saved.v !== LS_VER) return;

    // evita che uno stato PIÙ VECCHIO proveniente da un’altra tab sovrascriva il nostro
    const savedAt = Number(saved.at || 0);
    if (savedAt && savedAt < Number(lastLocalAtRef.current || 0)) {
      if (DEBUG) console.log('[storage] ignorato stato più vecchio', {
        savedAt,
        localAt: lastLocalAtRef.current,
      });
      return;
    }

    // applica lo stato ricevuto e aggiorna il riferimento di ultimo "apply"
    setLists({
      [LIST_TYPES.SUPERMARKET]: Array.isArray(saved.lists?.[LIST_TYPES.SUPERMARKET])
        ? saved.lists[LIST_TYPES.SUPERMARKET]
        : [],
      [LIST_TYPES.ONLINE]: Array.isArray(saved.lists?.[LIST_TYPES.ONLINE])
        ? saved.lists[LIST_TYPES.ONLINE]
        : [],
    });
    setStock(Array.isArray(saved.stock) ? saved.stock : []);
    setCurrentList(
      saved.currentList === LIST_TYPES.ONLINE ? LIST_TYPES.ONLINE : LIST_TYPES.SUPERMARKET
    );
    setImagesIndex(
      saved.imagesIndex && typeof saved.imagesIndex === 'object' ? saved.imagesIndex : {}
    );

    lastLocalAtRef.current = savedAt || Date.now();
  };

  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}, []);

/* =================== Derivati: critici =================== */
// helper “safe” (non ridefinisce eventuali versioni globali)
function daysToExpirySafe(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((t - Date.now()) / 86400000);
}
function isExpiringSoonSafe(item, days = 10) {
  return daysToExpirySafe(item?.expiresAt) <= days;
}

useEffect(() => {
  const crit = (stock || []).filter((p) => {
    const current = residueUnitsOf(p);
    const baseline = baselineUnitsOf(p);
    const pct = baseline ? current / baseline : 1;
    const lowResidue = pct < 0.2;
    const expSoon = isExpiringSoonSafe(p, 10);
    return lowResidue || expSoon;
  });
  setCritical(crit);
}, [stock]);


// elimina una riga di scorte per indice (serve negli onClick)
const deleteStockRow = useCallback((index) => {
  setStock((prev) => prev.filter((_, i) => i !== index));
  // aggiorna subito il "lastAt" così eventuali storage più vecchi vengono ignorati
  lastLocalAtRef.current = Date.now();
}, []);

/* =================== LISTE: azioni =================== */
function addManualItem(e) {
  e.preventDefault();
  const name = form.name.trim();
  if (!name) return;

  const brand = form.brand.trim();
  const packs = Math.max(1, Number(String(form.packs).replace(',', '.')) || 1);
  const unitsPerPack = Math.max(1, Number(String(form.unitsPerPack).replace(',', '.')) || 1);
  const unitLabel = (form.unitLabel || 'unità').trim() || 'unità';

  setLists((prev) => {
    const next = { ...prev };
    const items = [...(prev[currentList] || [])];

    const idx = items.findIndex(
      (i) =>
        i.name.toLowerCase() === name.toLowerCase() &&
        (i.brand || '').toLowerCase() === brand.toLowerCase() &&
        Number(i.unitsPerPack || 1) === unitsPerPack
    );

    if (idx >= 0) {
      items[idx] = {
        ...items[idx],
        qty: Math.max(0, Number(items[idx].qty || 0) + packs),
      };
    } else {
      items.push({
        id: 'tmp-' + Math.random().toString(36).slice(2),
        name,
        brand,
        qty: packs,
        unitsPerPack,
        unitLabel,
        purchased: false,
      });
    }

    next[currentList] = items;
    return next;
  });

  // aggiorna subito "lastAt" per proteggere da eventuali sync vecchi
  lastLocalAtRef.current = Date.now();

  setForm({ name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità' });
  setShowListForm(false);
}

function removeItem(id) {
  setLists((prev) => {
    const next = { ...prev };
    next[currentList] = (prev[currentList] || []).filter((i) => i.id !== id);
    return next;
  });
  lastLocalAtRef.current = Date.now();
}

function incQty(id, delta) {
  setLists((prev) => {
    const next = { ...prev };
    next[currentList] = (prev[currentList] || [])
      .map((i) => (i.id === id ? { ...i, qty: Math.max(0, Number(i.qty || 0) + delta) } : i))
      .filter((i) => i.qty > 0);
    return next;
  });
  lastLocalAtRef.current = Date.now();
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
    .filter(s => !BAD.test(s))
    .join('\n');
}
// === Helper: ridimensiona/comprime immagini prima dell'upload (mobile-friendly) ===
async function downscaleImageFile(file, { maxSide = 1600, quality = 0.74 } = {}) {
  try {
    if (!file || file.type === 'application/pdf' || !/^image\//i.test(file.type)) return file;

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
    if (scale === 1 && file.size <= 1_200_000) return file;

    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);

    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
    if (!blob) return file;
    if (blob.size >= file.size) return file;

    const base = (file.name || 'upload').replace(/\.\w+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
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
    const dec  = Math.max(1, Number(p.packs ?? p.qty ?? 1));
    const brand = (p.brand || '').trim();
    const upp   = Number(p.unitsPerPack ?? 1);

    // match esatto name+brand+UPP
    let idx = arr.findIndex(i =>
      sameText(i.name, p.name) &&
      sameText(i.brand || '', brand) &&
      Number(i.unitsPerPack || 1) === upp
    );
    // poi name+brand
    if (idx < 0)
      idx = arr.findIndex(i => sameText(i.name, p.name) && sameText(i.brand || '', brand));
    // poi solo name
    if (idx < 0)
      idx = arr.findIndex(i => sameText(i.name, p.name));

    if (idx >= 0) {
      const cur    = arr[idx];
      const newQty = Math.max(0, Number(cur.qty || 0) - dec);
      arr[idx]     = { ...cur, qty: newQty, purchased: true };
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
    if (/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(ln)) count++;
  }
  return count;
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
// === AI helper: chiama /api/assistant e prova a forzare il JSON ===
function askAssistantJSON(prompt, schema) {
  return (async () => {
    try {
      const body = schema
        ? {
            prompt,
            response_format: 'json_schema',  // se supportato dal backend
            schemaName: schema.title || 'Schema',
            schema,
          }
        : { prompt };

      const res = await timeoutFetch(
        API_ASSISTANT_TEXT,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        45000
      );

      const safe = await readJsonSafe(res);
      let answer = safe?.answer ?? safe?.data ?? safe;

      if (typeof answer === 'string') {
        try { answer = JSON.parse(answer); } catch { answer = null; }
      }
      if (answer && answer.ok && answer.data) {
        try { return typeof answer.data === 'string' ? JSON.parse(answer.data) : answer.data; }
        catch { return answer.data; }
      }
      return answer || null;
    } catch (e) {
      try { console.warn('[askAssistantJSON] fail:', e); } catch {}
      return null;
    }
  })();
}

// Schema atteso dal modello per l'estrazione scontrino (AI-only)
const RECEIPT_SCHEMA = {
  title: 'ReceiptExtraction',
  type: 'object',
  additionalProperties: false,
  properties: {
    store: { type: 'string' },
    purchaseDate: { type: 'string' }, // YYYY-MM-DD
    purchases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name:        { type: 'string' },
          brand:       { type: 'string' },
          packs:       { type: 'number' },
          unitsPerPack:{ type: 'number' },
          unitLabel:   { type: 'string' },
          priceEach:   { type: 'number' },
          priceTotal:  { type: 'number' },
          currency:    { type: 'string' },
          expiresAt:   { type: 'string' }
        },
        required: ['name','brand','packs','unitsPerPack','unitLabel','priceEach','priceTotal','currency','expiresAt']
      }
    }
  },
  required: ['store','purchaseDate','purchases']
};


/* ====================== OCR Scontrino/Busta → Aggiornamento scorte ====================== */
async function handleOCR(files) {
  if (!files) return;
  try {
    setBusy(true);

    // ——— 0) Filtra File validi ———
    const toArray = (x) => Array.from(x || []);
    const isFileLike = (v) => {
      try {
        return !!(v && typeof v === 'object' && typeof v.type === 'string' && typeof v.size === 'number' && typeof v.arrayBuffer === 'function' && typeof v.slice === 'function');
      } catch { return false; }
    };
    const picked = []; for (const f of toArray(files)) if (isFileLike(f)) picked.push(f);
    if (!picked.length) throw new Error('Nessuna immagine valida selezionata');

    // ——— 1) OCR immagine → testo (usa solo la prima foto, compressa) ———
    const first = picked[0];
    const slim  = await downscaleImageFile(first, { maxSide: OCR_IMAGE_MAXSIDE, quality: OCR_IMAGE_QUALITY });

    const aliases = ['images','files','file','image'];
    let fdOcr = new FormData();
    for (const k of aliases) fdOcr.append(k, slim, slim.name || 'receipt.jpg');

    let ocrAns = null, ocrText = '';
    try {
      ocrAns  = await fetchJSONStrict(API_OCR, { method:'POST', body: fdOcr }, 50000);
      ocrText = String(ocrAns?.text || ocrAns?.data?.text || ocrAns?.data || '').trim();
    } catch (err) {
      showToast(`OCR errore: ${err.message}`, 'err');
      throw err;
    }

    // Retry HEIC se serve
    if (!ocrText && /heic|heif/i.test(first?.type || '')) {
      fdOcr = new FormData(); for (const k of aliases) fdOcr.append(k, first, first.name || 'receipt.heic');
      try {
        const o2 = await fetchJSONStrict(API_OCR, { method:'POST', body: fdOcr }, 50000);
        if (o2 && (o2.text || (o2.items && o2.items.length))) {
          ocrAns = o2;
          ocrText = String(o2?.text || o2?.data?.text || o2?.data || '').trim();
        }
      } catch {}
    }

    if (typeof sanitizeOcrText === 'function') ocrText = sanitizeOcrText(ocrText || '');
// AI-only: JSON dal modello
let parsed = null;
if (ocrText) {
  const prompt = buildDirectReceiptPrompt(ocrText);
  // usa lo schema (già definito sopra); se il backend non lo supporta, fallback
  parsed = await askAssistantJSON(prompt, RECEIPT_SCHEMA) || await askAssistantJSON(prompt, null);
}

// ——— 3) Meta (store, data) ———
let store        = toISODate('') && ''; // init neutro
let purchaseDate = '';
if (parsed && typeof parsed === 'object') {
  store        = String(parsed.store || '').trim();
  purchaseDate = toISODate(parsed.purchaseDate || '');
}

// ——— 4) Righe acquisto (SOLO AI) ———
let purchases = [];
if (Array.isArray(parsed?.purchases) && parsed.purchases.length) {
  purchases = parsed.purchases.map(p => ({
    name: String(p?.name || '').trim(),
    brand: String(p?.brand || '').trim(),
    packs: coerceNum(p?.packs),
    unitsPerPack: coerceNum(p?.unitsPerPack),
    unitLabel: String(p?.unitLabel || '').trim(),
    priceEach: coerceNum(p?.priceEach),
    priceTotal: coerceNum(p?.priceTotal),
    currency: String(p?.currency || 'EUR').trim() || 'EUR',
    expiresAt: toISODate(p?.expiresAt || '')
  })).filter(p => p.name);
}

// (opzionale) log di controllo
try { console.log('[ai-only lines]', { ai: purchases.length }); } catch {}


// ——— 5) Filtro sicurezza anti-rumore ———
purchases = filterPurchasesNoise(purchases);

// No parser locale, no merge: se non c'è nulla fermati qui
if (!Array.isArray(purchases) || purchases.length === 0) {
  showToast('Nessuna riga acquisto riconosciuta dallo scontrino', 'err');
  return;
}



    // ——— 10) Memorizzazione termini (no-op se non usi) ———
    if (typeof rememberItems === 'function') rememberItems(purchases, { alsoLexicon: false });

    // ——— 11) Decrementa liste ———
    setLists(prev => decrementAcrossBothLists(prev, purchases));
// ——— 12) Aggiorna scorte ———
setStock(prev => {
  const arr = [...prev];
  const todayISO = new Date().toISOString().slice(0, 10);

  for (const p of purchases) {
  const idx = findStockIndexStrict(arr, p);
    const packs = coerceNum(p.packs);
    const upp   = coerceNum(p.unitsPerPack);
    const hasCounts = packs > 0 || upp > 0;

    if (idx >= 0) {
      const old = arr[idx];

      if (hasCounts) {
        const newP = Math.max(0, Number(old.packs || 0) + (packs || 0));
        const newU = Math.max(1, Number(old.unitsPerPack || upp || 1));
        arr[idx] = {
          ...old,
          // ✅ aggiorna anche nome/brand con quelli normalizzati
          name: (p.name && String(p.name).trim()) || old.name,
          brand: (p.brand && String(p.brand).trim()) || old.brand,
          packs: newP,
          unitsPerPack: newU,
          unitLabel: old.unitLabel || p.unitLabel || 'unità',
          expiresAt: p.expiresAt || old.expiresAt || '',
          packsOnly: false,
          needsUpdate: false,
          ...restockTouch(newP, todayISO, newU),
        };
      } else if (DEFAULT_PACKS_IF_MISSING) {
        const uo = Math.max(1, Number(old.unitsPerPack || 1));
        const np = Math.max(0, Number(old.packs || 0) + 1);
        arr[idx] = {
          ...old,
          // ✅ aggiorna anche nome/brand
          name: (p.name && String(p.name).trim()) || old.name,
          brand: (p.brand && String(p.brand).trim()) || old.brand,
          packs: np,
          unitsPerPack: uo,
          unitLabel: old.unitLabel || 'unità',
          packsOnly: false,
          needsUpdate: false,
          ...restockTouch(np, todayISO, uo),
        };
      } else {
        arr[idx] = {
          ...old,
          // ✅ mantieni l’aggiornamento name/brand anche qui
          name: (p.name && String(p.name).trim()) || old.name,
          brand: (p.brand && String(p.brand).trim()) || old.brand,
          needsUpdate: true,
        };
      }

      // ✅ aggancia subito l'immagine dall’enrichment (chiavi normalizzate + fallback)
      try {
        const keys = [
          productKey(arr[idx].name, arr[idx].brand || ''),
          productKey(p.name,        p.brand        || ''),
          productKey(arr[idx].name, ''), // fallback senza brand
          productKey(p.name,        '')
        ];
        let pic = '';
        if (mergedImagesIndex) {
          for (const k of keys) { if (mergedImagesIndex[k]) { pic = mergedImagesIndex[k]; break; } }
        }
        if (pic && !arr[idx].image) arr[idx] = { ...arr[idx], image: pic };
      } catch {}
    } else {
      if (hasCounts) {
        const u = Math.max(1, upp || 1);
        arr.unshift(
          withRememberedImage(
            {
              name: p.name,
              brand: p.brand || '',
              packs: Math.max(0, packs || 1),
              unitsPerPack: u,
              unitLabel: p.unitLabel || 'unità',
              expiresAt: p.expiresAt || '',
              baselinePacks: Math.max(0, packs || 1),
              lastRestockAt: todayISO,
              avgDailyUnits: 0,
              residueUnits: Math.max(0, (packs || 1) * u),
              packsOnly: false,
              needsUpdate: false,
            },
            mergedImagesIndex
          )
        );
      } else if (DEFAULT_PACKS_IF_MISSING) {
        arr.unshift(
          withRememberedImage(
            {
              name: p.name,
              brand: p.brand || '',
              packs: 1,
              unitsPerPack: 1,
              unitLabel: 'unità',
              expiresAt: p.expiresAt || '',
              baselinePacks: 1,
              lastRestockAt: todayISO,
              avgDailyUnits: 0,
              residueUnits: 1,
              packsOnly: false,
              needsUpdate: false,
            },
            mergedImagesIndex
          )
        );
      } else {
        arr.unshift(
          withRememberedImage(
            {
              name: p.name,
              brand: p.brand || '',
              packs: 0,
              unitsPerPack: 1,
              unitLabel: '-',
              expiresAt: p.expiresAt || '',
              baselinePacks: 0,
              lastRestockAt: '',
              avgDailyUnits: 0,
              residueUnits: 0,
              packsOnly: true,
              needsUpdate: true,
            },
            mergedImagesIndex
          )
        );
      }
    }
  }

  return arr;
});

    // ——— 13) Finanze ———
    let financesOk = true;
    try {
      const itemsSafe = purchases.map(p => ({
        name:p.name, brand:p.brand||'',
        packs:Number.isFinite(p.packs)?p.packs:0, unitsPerPack:Number.isFinite(p.unitsPerPack)?p.unitsPerPack:0,
        unitLabel:p.unitLabel||'', priceEach:Number.isFinite(p.priceEach)?p.priceEach:0, priceTotal:Number.isFinite(p.priceTotal)?p.priceTotal:0,
        currency:p.currency||'EUR', expiresAt:p.expiresAt||''
      }));
      const payload = {
        ...(userIdRef.current ? { user_id:userIdRef.current } : {}),
        ...(store ? { store } : {}),
        ...(purchaseDate ? { purchaseDate } : {}),
        payment_method:'cash', card_label:null,
        items: itemsSafe
      };
      await fetchJSONStrict(API_FINANCES_INGEST, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }, 30000);
    } catch (e) {
      financesOk = false;
      console.warn('[FINANCES_INGEST] fail', e);
      showToast(`Finanze: ${e.message}`, 'err');
    }

    if (financesOk) showToast('OCR scorte (diretto) completato ✓', 'ok');

  } catch (e) {
    console.error('[OCR scorte] error', e);
    showToast(`Errore OCR scorte: ${e?.message || e}`, 'err');
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
                             const idx = findStockIndexStrict(arr, p);
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







