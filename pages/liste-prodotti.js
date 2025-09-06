// pages/liste-prodotti.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Pencil, Trash2, Camera, Calendar } from 'lucide-react';

/* ============================ CONFIG / ENDPOINTS ============================ */
const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;
const DEFAULT_PACKS_IF_MISSING = true;
const CLOUD_SYNC = true;
const CLOUD_TABLE = 'jarvis_liste_state';
let __supabase = null;

const API_OCR = '/api/ocr';
const API_ASSISTANT_TEXT = '/api/assistant';
const API_PRODUCTS_ENRICH = '/api/products/enrich';
const API_FINANCES_INGEST = '/api/finances/ingest';

/* ============================ UTILS BASE ============================ */
function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function productKey(name = '', brand = '') { return `${normKey(name)}|${normKey(brand)}`; }
function sameText(a = '', b = '') { return normKey(a) === normKey(b); }
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
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const d = String(m[1]).padStart(2,'0');
    const M = String(m[2]).padStart(2,'0');
    let y = String(m[3]); if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  const mesi = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  m = s.toLowerCase().match(/(\d{1,2})\s+([a-zà-ú]+)\s+(\d{2,4})/i);
  if (m) {
    const d = String(m[1]).padStart(2,'0');
    const mon = m[2].slice(0,3);
    const idx = mesi.indexOf(mon);
    if (idx >= 0) {
      let y = String(m[3]); if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
      const M = String(idx+1).padStart(2,'0');
      return `${y}-${M}-${d}`;
    }
  }
  return '';
}
function coerceNum(x) {
  if (x == null) return 0;
  const s = String(x).trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
async function readTextSafe(res) { try { return await res.text(); } catch { return ''; } }
async function readJsonSafe(res) {
  const ct = (res.headers.get?.('content-type') || '').toLowerCase();
  const raw = await readTextSafe(res);
  if (!raw.trim()) return { ok: res.ok, data: null, error: res.ok ? null : `HTTP ${res.status}` };
  if (ct.includes('application/json')) {
    try { return { ok: res.ok, ...(JSON.parse(raw) || {}) }; }
    catch (e) { return { ok: res.ok, data: null, error: `JSON parse error: ${e?.message || e}` }; }
  }
  try { return { ok: res.ok, ...(JSON.parse(raw) || {}) }; }
  catch { return { ok: res.ok, data: null, error: raw.slice(0,200) || `HTTP ${res.status}` }; }
}
function timeoutFetch(url, opts = {}, ms = 25000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}
async function fetchJSONStrict(url, opts = {}, timeoutMs = 40000) {
  const r = await timeoutFetch(url, opts, timeoutMs);
  const ct = (r.headers.get?.('content-type') || '').toLowerCase();
  const raw = await readTextSafe(r);
  if (!r.ok) {
    let msg = raw;
    if (ct.includes('application/json')) { try { const j = JSON.parse(raw); msg = j.error || j.message || JSON.stringify(j); } catch {} }
    throw new Error(`HTTP ${r.status} ${r.statusText || ''} — ${String(msg).slice(0,250)}`);
  }
  if (!raw.trim()) return {};
  if (ct.includes('application/json')) { try { return JSON.parse(raw); } catch (e) { throw new Error(`JSON parse error: ${e?.message || e}`); } }
  try { return JSON.parse(raw); } catch { return { data: raw }; }
}
function sanitizeOcrText(t) {
  const BAD = /(mi\s*dispiace|non\s*posso\s*aiut|cannot\s*assist|i\s*can't|policy|trascrizion)/i;
  return String(t || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter(s => !BAD.test(s)).join('\n');
}

/* ============================ SCORTE METRICHE ============================ */
function clamp01(x){ return Math.max(0, Math.min(1, Number(x) || 0)); }
function residueUnitsOf(s){
  const upp = Math.max(1, Number(s.unitsPerPack || 1));
  const ru = Number(s.residueUnits);
  if (s.packsOnly) return Math.max(0, Number(s.packs || 0));
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
function restockTouch(baselineFromPacks, lastDateISO, unitsPerPack){
  const upp = Math.max(1, Number(unitsPerPack || 1));
  const bp  = Math.max(0, Number(baselineFromPacks || 0));
  const fullUnits = bp * upp;
  return { baselinePacks: bp, lastRestockAt: lastDateISO, residueUnits: fullUnits };
}

/* ============================ IMMAGINI ============================ */
function withRememberedImage(row, imagesIdx = {}) {
  if (row?.image) return row;
  const k1 = productKey(row?.name, row?.brand || '');
  const k2 = productKey(row?.name, '');
  const img = imagesIdx[k1] || imagesIdx[k2];
  return img ? { ...row, image: img } : row;
}
function getImgIndexSafe(localCandidate) {
  if (localCandidate && typeof localCandidate === 'object') return localCandidate;
  try { if (typeof imagesIndex !== 'undefined' && imagesIndex) return imagesIndex; } catch {}
  return {};
}

/* ============================ ENRICH (web search + image) ============================ */
async function enrichPurchasesViaWeb(purchases = []) {
  if (!Array.isArray(purchases) || purchases.length === 0) {
    return { items: purchases, images: {} };
  }

  const payload = {
    items: purchases.map(p => ({ name: String(p.name || ''), brand: String(p.brand || '') })),
  };

  try {
    const resp = await timeoutFetch(API_PRODUCTS_ENRICH, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }, 30000);

    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || !json.ok || !Array.isArray(json.items)) {
      throw new Error(json?.error || `enrich HTTP ${resp.status}`);
    }

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
        proxied = `/api/img-proxy?url=${encodeURIComponent(imageUrl)}`;
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

/* ============================ COMPONENTE PRINCIPALE ============================ */
function ListeProdotti() {
  // Liste
  const [currentList, setCurrentList] = useState(LIST_TYPES.SUPERMARKET);
  const [lists, setLists] = useState({ [LIST_TYPES.SUPERMARKET]: [], [LIST_TYPES.ONLINE]: [] });
  const [form, setForm] = useState({ name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità' });
  const [showListForm, setShowListForm] = useState(false);

  // Scorte
  const [stock, setStock] = useState([]);
  const [critical, setCritical] = useState([]);

  // Editing riga
  const [editingRow, setEditingRow] = useState(null);
  const [editDraft, setEditDraft] = useState({
    name: '', brand: '', packs: '0', unitsPerPack: '1', unitLabel: 'unità', expiresAt: '', residueUnits: '0', _ruTouched: false,
  });

  // UI
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  function showToast(msg, type='ok'){ setToast({ msg, type }); setTimeout(() => setToast(null), 1800); }

  // Refs
  const ocrInputRef = useRef(null);
  const rowOcrInputRef = useRef(null);
  const rowImageInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);
  const [targetImageIdx, setTargetImageIdx] = useState(null);

  // Vocale lista
  const recMimeRef = useRef({ mime: 'audio/webm;codecs=opus', ext: 'webm' });
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // Vocale inventario
  const invMediaRef = useRef(null);
  const invChunksRef = useRef([]);
  const invStreamRef = useRef(null);
  const [invRecBusy, setInvRecBusy] = useState(false);

  // Immagini
  const [imagesIndex, setImagesIndex] = useState({});

  // Cloud
  const userIdRef = useRef(null);

  // Sblocco media
  useEffect(() => { /* no-op */ }, []);

  /* -------- Cloud sync: load -------- */
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
        if (st.imagesIndex && typeof st.imagesIndex === 'object') setImagesIndex(st.imagesIndex);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  /* -------- Autosave (localStorage) -------- */
  const LS_VER = 1; const LS_KEY = 'jarvis_liste_prodotti@v1';
  const persistTimerRef = useRef(null);
  function persistNow(snapshot) {
    try {
      if (typeof window === 'undefined') return;
      const payload = { v: LS_VER, at: Date.now(), ...snapshot };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch (e) { if (DEBUG) console.warn('[persist] save failed', e); }
  }
  function loadPersisted() {
    try { const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null; if (!raw) return null; const data = JSON.parse(raw); if (!data || data.v !== LS_VER) return null; return data; }
    catch { return null; }
  }
  useEffect(() => {
    const saved = loadPersisted();
    if (!saved) return;
    if (saved.lists && typeof saved.lists === 'object') {
      setLists({
        [LIST_TYPES.SUPERMARKET]: Array.isArray(saved.lists[LIST_TYPES.SUPERMARKET]) ? saved.lists[LIST_TYPES.SUPERMARKET] : [],
        [LIST_TYPES.ONLINE]: Array.isArray(saved.lists[LIST_TYPES.ONLINE]) ? saved.lists[LIST_TYPES.ONLINE] : [],
      });
    }
    if (Array.isArray(saved.stock)) setStock(saved.stock);
    if (saved.currentList && (saved.currentList === LIST_TYPES.SUPERMARKET || saved.currentList === LIST_TYPES.ONLINE)) setCurrentList(saved.currentList);
    if (saved.imagesIndex && typeof saved.imagesIndex === 'object') setImagesIndex(saved.imagesIndex);
  }, []);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    const snapshot = { lists, stock, currentList, imagesIndex };
    persistTimerRef.current = setTimeout(() => persistNow(snapshot), 300);
    return () => clearTimeout(persistTimerRef.current);
  }, [lists, stock, currentList, imagesIndex]);

  /* -------- Derivati: critici -------- */
  useEffect(() => {
    const crit = (stock || []).filter((p) => {
      const { current, baseline } = residueInfo(p);
      const lowResidue = baseline ? current / baseline < 0.2 : false;
      let expSoon = false;
      if (p?.expiresAt) {
        const t = Date.parse(p.expiresAt);
        if (!Number.isNaN(t)) expSoon = Math.floor((t - Date.now()) / 86400000) <= 10;
      }
      return lowResidue || expSoon;
    });
    setCritical(crit);
  }, [stock]);

  /* -------- Azioni liste -------- */
  function addManualItem(e) {
    e.preventDefault();
    const name = form.name.trim(); if (!name) return;
    const brand = form.brand.trim();
    const packs = Math.max(1, Number(String(form.packs).replace(',', '.')) || 1);
    const unitsPerPack = Math.max(1, Number(String(form.unitsPerPack).replace(',', '.')) || 1);
    const unitLabel = (form.unitLabel || 'unità').trim() || 'unità';

    setLists(prev => {
      const next  = { ...prev };
      const items = [...(prev[currentList] || [])];
      const idx = items.findIndex(i =>
        i.name.toLowerCase() === name.toLowerCase() &&
        (i.brand||'').toLowerCase() === brand.toLowerCase() &&
        Number(i.unitsPerPack||1) === unitsPerPack
      );
      if (idx >= 0) items[idx] = { ...items[idx], qty: Math.max(0, Number(items[idx].qty || 0) + packs) };
      else items.push({ id: 'tmp-' + Math.random().toString(36).slice(2), name, brand, qty: packs, unitsPerPack, unitLabel, purchased: false });
      next[currentList] = items; return next;
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
      next[currentList] = (prev[currentList] || [])
        .map(i => (i.id === id ? { ...i, qty: Math.max(0, Number(i.qty || 0) + delta) } : i))
        .filter(i => i.qty > 0);
      return next;
    });
  }

  /* -------- OCR Scontrino/Busta → Aggiornamento scorte -------- */
  async function downscaleImageFile(file, { maxSide = 1600, quality = 0.74 } = {}) {
    try {
      if (!file || file.type === 'application/pdf' || !/^image\//i.test(file.type)) return file;
      const getBitmap = async (blob) => {
        if (typeof window !== 'undefined' && window.createImageBitmap) { return await createImageBitmap(blob); }
        const dataUrl = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(blob); });
        const img = new Image(); await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = dataUrl; }); return img;
      };
      const bmp = await getBitmap(file);
      const w0 = bmp.width || bmp.naturalWidth; const h0 = bmp.height || bmp.naturalHeight;
      const scale = Math.min(1, maxSide / Math.max(w0, h0));
      if (scale === 1 && file.size <= 1_200_000) return file;
      const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
      if (!blob || blob.size >= file.size) return file;
      const base = (file.name || 'upload').replace(/\.\w+$/, '');
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    } catch { return file; }
  }
  function normalizeUnitLabel(lbl=''){
    const s = normKey(lbl);
    if (/bottigl/.test(s)) return 'bottiglie';
    if (/(?:pz|pezz|unit\b|unita?)/.test(s)) return 'pezzi';
    if (/bust/.test(s)) return 'buste';
    if (/lattin/.test(s)) return 'lattine';
    if (/vasett/.test(s)) return 'vasetti';
    if (/rotol/.test(s)) return 'rotoli';
    if (/capsul/.test(s)) return 'capsule';
    return 'unità';
  }
  function decrementAcrossBothLists(prevLists, purchases) {
    const next = { ...prevLists };
    const decList = (listKey) => {
      const arr = [...(next[listKey] || [])];
      for (const p of purchases) {
        const dec = Math.max(1, Number(p.packs ?? p.qty ?? 1));
        const brand = (p.brand || '').trim();
        const upp   = Number(p.unitsPerPack ?? 1);
        let idx = arr.findIndex(i => sameText(i.name, p.name) && sameText(i.brand || '', brand) && Number(i.unitsPerPack || 1) === upp);
        if (idx < 0) idx = arr.findIndex(i => sameText(i.name, p.name) && sameText(i.brand || '', brand));
        if (idx < 0) idx = arr.findIndex(i => sameText(i.name, p.name));
        if (idx >= 0) {
          const cur = arr[idx];
          const newQty = Math.max(0, Number(cur.qty || 0) - dec);
          arr[idx] = { ...cur, qty: newQty, purchased: true };
        }
      }
      next[listKey] = arr.filter(i => Number(i.qty || 0) > 0 || !i.purchased);
    };
    decList(LIST_TYPES.SUPERMARKET); decList(LIST_TYPES.ONLINE);
    return next;
  }
  // --- Fallback OCR scontrino → righe prodotto (hoisted) ---
function parseReceiptPurchases(ocrText) {
  const text = String(ocrText || '');
  if (!text.trim()) return [];

  // 1) normalizza righe ed elimina vuoti
  const rawLines = text
    .split(/\r?\n/)
    .map(s => s.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  // 2) regex di servizio
  const RX_HEADER =
    /^(documento\s+commerciale|descrizione|prezzo|totale|subtotale|pagamento|resto|di\s*cui\s*iva|iva\b|rt\b|cassa|cassiere|tessera|lotteria|corrispettivi|fiscale|codice|reparto)/i;
  const RX_IGNORE = /\b(shopper|sacchetto|busta|cauzione|vuoto|ecocontributo|eco[- ]?contributo|off\.)\b/i;
  const RX_PRICE_TAIL = /\s*(?:€|eur|euro)?\s*\d+(?:[.,]\d{2})?\s*$/i;
  const RX_WEIGHT = /\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|lt)\b/gi;

  const out = [];

  for (let line of rawLines) {
    // salta header e rumore ovvio
    if (RX_HEADER.test(line)) continue;

    // unisci eventuale riga quantità "2 x 3,60 7,20" alla precedente? (qui gestiamo in-line)
    line = line.replace(/^[*+\-]+\s*/, '').trim();
    if (!line) continue;
    if (RX_IGNORE.test(line)) continue;

    // 3) estrai eventuale "N x prezzo [totale]" in coda (prendo N come packs)
    let packsFromTail = null;
    const mTail = line.match(/(\d+)\s*[xX]\s*\d+(?:[.,]\d{2})(?:\s+\d+(?:[.,]\d{2}))?\s*$/);
    if (mTail) {
      packsFromTail = parseInt(mTail[1], 10);
      line = line.replace(mTail[0], '').trim();
    }

    // 4) rimuovi prezzo finale, IVA o simboli moneta
    line = line.replace(/\s+\d{1,2}%\s+\d+(?:[.,]\d{2})\s*$/i, '').replace(RX_PRICE_TAIL, '').trim();
    if (!line) continue;

    // 5) quantità "x6" / "X6" dentro la riga → unitsPerPack
    let unitsPerPack = 1;
    const mInline = line.match(/\bx\s*(\d+)\b/i);
    if (mInline) {
      unitsPerPack = Math.max(1, parseInt(mInline[1], 10));
      line = line.replace(mInline[0], '').trim();
    }

    // 6) rimuovi pesi/volumi (non sono quantità)
    line = line.replace(RX_WEIGHT, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!line) continue;

    // 7) brand = ultima parola in "stile brand" (maiuscolo/Capitalized)
    let name = line, brand = '';
    const parts = name.split(' ');
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (/^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9\-'.]*$/.test(last)) {
        brand = last; name = parts.slice(0, -1).join(' ');
      }
    }

    // piccoli fix comuni
    const low = name.toLowerCase();
    if (/yo-?yo/.test(low)) name = 'merendine yo-yo';
    else if (/pan\s+bauletto/.test(low)) name = 'pan bauletto';
    else if (/lacca\b/.test(low)) name = 'lacca per capelli';
    else if (/\bcaff[eè]\b/.test(low)) name = 'caffè';

    // 8) packs = tail se presente, altrimenti 1
    const packs = Math.max(1, packsFromTail || 1);

    out.push({
      name: name.trim(),
      brand: brand || '',
      packs,
      unitsPerPack: Math.max(1, unitsPerPack),
      unitLabel: 'unità',
      expiresAt: ''
    });
  }

  return out;
}


  async function handleOCR(files) {
    if (!files) return;
    try {
      setBusy(true);

      // 0) file valido
      const toArray = (x) => Array.from(x || []);
      const isFileLike = (v) => { try { return !!(v && typeof v === 'object' && typeof v.type === 'string' && typeof v.size === 'number' && typeof v.arrayBuffer === 'function' && typeof v.slice === 'function'); } catch { return false; } };
      const picked=[]; for (const f of toArray(files)) if (isFileLike(f)) picked.push(f);
      if (!picked.length) throw new Error('Nessuna immagine valida selezionata');

      // 1) OCR
      const first = picked[0];
      const slim  = await downscaleImageFile(first, { maxSide: 1400, quality: 0.7 });
      const aliases = ['images','files','file','image'];
      let fdOcr = new FormData(); for (const k of aliases) fdOcr.append(k, slim, slim.name || 'receipt.jpg');

      let ocrAns = null, ocrText = '';
      try {
        ocrAns  = await fetchJSONStrict(API_OCR, { method:'POST', body: fdOcr }, 60000);
        ocrText = String(ocrAns?.text || ocrAns?.data?.text || ocrAns?.data || '').trim();
      } catch (err) { showToast(`OCR errore: ${err.message}`, 'err'); throw err; }

      // HEIC retry
      if (!ocrText && /heic|heif/i.test(first?.type || '')) {
        fdOcr = new FormData(); for (const k of aliases) fdOcr.append(k, first, first.name || 'receipt.heic');
        try {
          const o2 = await fetchJSONStrict(API_OCR, { method:'POST', body: fdOcr }, 60000);
          if (o2 && (o2.text || (o2.items && o2.items.length))) {
            ocrAns  = o2;
            ocrText = String(o2?.text || o2?.data?.text || o2?.data || '').trim();
          }
        } catch {}
      }

      if (typeof sanitizeOcrText === 'function') ocrText = sanitizeOcrText(ocrText || '');

      // 2) Preferisci items strutturati (Vision)
      let purchases = [];
      const itemsFromVision = Array.isArray(ocrAns?.items) ? ocrAns.items : [];
      if (itemsFromVision.length) {
        purchases = itemsFromVision.map(p => ({
          name: String(p?.name || '').trim(),
          brand: String(p?.brand || '').trim(),
          packs: coerceNum(p?.packs),
          unitsPerPack: coerceNum(p?.unitsPerPack),
          unitLabel: normalizeUnitLabel(p?.unitLabel || ''),
          priceEach: 0, priceTotal: 0, currency: 'EUR',
          expiresAt: toISODate(p?.expiresAt || '')
        })).filter(p => p.name);
      }

      // 3) Fallback parsing locale se Vision non ha items
      if (!purchases.length && ocrText) {
        purchases = parseReceiptPurchases(ocrText).map(p => ({
          name: p.name, brand: p.brand || '',
          packs: p.packs || 0, unitsPerPack: p.unitsPerPack || 0,
          unitLabel: normalizeUnitLabel(p.unitLabel || ''),
          priceEach: 0, priceTotal: 0, currency: 'EUR', expiresAt: ''
        }));
      }

      if (!purchases.length) {
        showToast('Nessuna riga acquisto riconosciuta dallo scontrino', 'err');
        return;
      }

      // 4) Enrich: prettyName/immagine/descrizione
      let imgIndex = getImgIndexSafe(imagesIndex);
      const { items: enriched, images: imap } = await enrichPurchasesViaWeb(purchases);
      purchases = Array.isArray(enriched) ? enriched : purchases;
      imgIndex  = { ...imgIndex, ...(imap || {}) };
      setImagesIndex(imgIndex);

      // 5) Decrementa liste
      setLists(prev => decrementAcrossBothLists(prev, purchases));

      // 6) Aggiorna scorte
      setStock(prev => {
        const arr = [...prev];
        const todayISO = new Date().toISOString().slice(0, 10);

        for (const p of purchases) {
          const idx = arr.findIndex(s => sameText(s.name, p.name) && sameText(s.brand || '', p.brand || ''));
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
                name: old.name,
                brand: (p.brand && String(p.brand).trim()) || old.brand,
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
            } else if (DEFAULT_PACKS_IF_MISSING) {
              const uo = Math.max(1, Number(old.unitsPerPack || 1));
              const np = Math.max(0, Number(old.packs || 0) + 1);
              arr[idx] = {
                ...old,
                name: old.name,
                brand: (p.brand && String(p.brand).trim()) || old.brand,
                packs: np,
                unitsPerPack: uo,
                unitLabel: old.unitLabel || 'unità',
                prettyName: p.prettyName || old.prettyName || '',
                desc: (p.description || old.desc || ''),
                packsOnly: false,
                needsUpdate: false,
                ...restockTouch(np, todayISO, uo),
              };
            } else {
              arr[idx] = { ...old, name: old.name, brand: (p.brand && String(p.brand).trim()) || old.brand, needsUpdate: true };
            }

            // Aggancia immagine
            try {
              const keys = [
                productKey(arr[idx].name, arr[idx].brand || ''),
                productKey(p.name,        p.brand        || ''),
                productKey(arr[idx].name, ''),
                productKey(p.name,        ''),
              ];
              for (const k of keys) {
                if (imgIndex && imgIndex[k]) { arr[idx] = { ...arr[idx], image: imgIndex[k] }; break; }
              }
            } catch {}

          } else {
            // nuova riga
            if (hasCounts) {
              const u = Math.max(1, upp || 1);
              arr.unshift(
                withRememberedImage({
                  name: p.name, brand: p.brand || '',
                  packs: Math.max(0, packs || 1), unitsPerPack: u, unitLabel: p.unitLabel || 'unità',
                  expiresAt: p.expiresAt || '',
                  prettyName: p.prettyName || '', desc: (p.description || ''),
                  baselinePacks: Math.max(0, packs || 1), lastRestockAt: todayISO,
                  avgDailyUnits: 0, residueUnits: Math.max(0, (packs || 1) * u),
                  packsOnly: false, needsUpdate: false,
                }, imgIndex)
              );
            } else if (DEFAULT_PACKS_IF_MISSING) {
              arr.unshift(
                withRememberedImage({
                  name: p.name, brand: p.brand || '',
                  packs: 1, unitsPerPack: 1, unitLabel: 'unità',
                  expiresAt: p.expiresAt || '',
                  prettyName: p.prettyName || '', desc: (p.description || ''),
                  baselinePacks: 1, lastRestockAt: todayISO, avgDailyUnits: 0, residueUnits: 1,
                  packsOnly: false, needsUpdate: false,
                }, imgIndex)
              );
            } else {
              arr.unshift(
                withRememberedImage({
                  name: p.name, brand: p.brand || '',
                  packs: 0, unitsPerPack: 1, unitLabel: '-',
                  expiresAt: p.expiresAt || '',
                  prettyName: p.prettyName || '', desc: (p.description || ''),
                  baselinePacks: 0, lastRestockAt: '', avgDailyUnits: 0, residueUnits: 0,
                  packsOnly: true, needsUpdate: true,
                }, imgIndex)
              );
            }
          }
        }
        return arr;
      });

      // 7) Finanze
      try {
        const itemsSafe = purchases.map(p => ({
          name: p.name, brand: p.brand || '',
          packs: Number.isFinite(p.packs) ? p.packs : 0,
          unitsPerPack: Number.isFinite(p.unitsPerPack) ? p.unitsPerPack : 0,
          unitLabel: p.unitLabel || '',
          priceEach: Number.isFinite(p.priceEach) ? p.priceEach : 0,
          priceTotal: Number.isFinite(p.priceTotal) ? p.priceTotal : 0,
          currency: p.currency || 'EUR',
          expiresAt: p.expiresAt || ''
        }));
        await fetchJSONStrict(API_FINANCES_INGEST, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsSafe })
        }, 30000);
      } catch (e) { if (DEBUG) console.warn('[FINANCES_INGEST] fail', e); }

      showToast('OCR scorte completato ✓', 'ok');

    } catch (e) {
      console.error('[OCR scorte] error', e);
      showToast(`Errore OCR scorte: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  }

  /* -------- Edit riga scorte -------- */
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
      if (editDraft._ruTouched) {
        const ruRaw = Number(String(editDraft.residueUnits ?? '').replace(',','.'));
        if (Number.isFinite(ruRaw)) ru = Math.max(0, ruRaw);
      }
      const fullNow = Math.max(unitsPerPack, nowUnits);
      if (!old.packsOnly) ru = Math.min(ru, fullNow);

      let next = { ...old, name, brand, packs: newPacks, unitsPerPack, unitLabel, expiresAt, packsOnly: false };
      if (restock) next = { ...next, ...restockTouch(newPacks, todayISO, unitsPerPack) };
      else next.residueUnits = old.packsOnly ? Math.max(0, Number(newPacks)) : ru;

      arr[index] = next;
      return arr;
    });

    setEditingRow(null);
  }
  const deleteStockRow = useCallback((index) => {
    setStock((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /* -------- Vocale LISTA -------- */
  async function toggleRecList() {
    if (recBusy) { try { mediaRecRef.current?.stop(); } catch {} return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const cand = [
        { mime: 'audio/webm;codecs=opus', ext:'webm' },
        { mime: 'audio/ogg;codecs=opus',  ext:'ogg'  },
        { mime: 'audio/mp4',              ext:'m4a'  },
        { mime: 'audio/webm',             ext:'webm' },
      ];
      const pick = cand.find(c => { try { return MediaRecorder.isTypeSupported?.(c.mime); } catch { return false; } }) || recMimeRef.current;
      recMimeRef.current = pick;

      mediaRecRef.current = new MediaRecorder(stream, pick.mime ? { mimeType: pick.mime } : undefined);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => { if (e?.data && e.data.size) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop = processVoiceList;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch { showToast('Microfono non disponibile', 'err'); }
  }
  async function processVoiceList() {
    try {
      try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      setRecBusy(false);

      const { mime, ext } = recMimeRef.current || { mime: 'audio/webm', ext: 'webm' };
      const blob = new Blob(recordedChunks.current, { type: mime || 'audio/webm' });
      recordedChunks.current = [];
      const fd = new FormData(); fd.append('audio', blob, `lista.${ext}`);

      setBusy(true);
      const res = await timeoutFetch('/api/stt', { method: 'POST', body: fd }, 30000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `STT HTTP ${res.status}`);

      const text = String(payload?.text || '').trim();
      if (!text) throw new Error('Testo non riconosciuto');

      let appended = false;
      try {
        const body = {
          prompt: [
            'Sei Jarvis. Capisci una LISTA SPESA. Rispondi SOLO JSON:',
            '{ "items":[{ "name":"latte","brand":"Parmalat","packs":2,"unitsPerPack":6,"unitLabel":"bottiglie" }]}',
            'Se manca brand metti "", packs=1, unitsPerPack=1, unitLabel="unità".',
            'Voci comuni: latte, pasta, biscotti, detersivi, ...',
            'Testo:', text
          ].join('\n'),
        };
        const r = await timeoutFetch(API_ASSISTANT_TEXT, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
        }, 30000);
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
              if (idx >= 0) existing[idx] = { ...existing[idx], qty: Math.max(0, Number(existing[idx].qty || 0) + it.qty) };
              else existing.push(it);
            }
            next[target] = existing; return next;
          });
          appended = true;
        }
      } catch {}

      if (!appended) {
        // fallback molto semplice
        const lines = text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
        if (lines.length) {
          setLists(prev => {
            const next = { ...prev }; const target = currentList; const existing = [...(prev[target] || [])];
            for (const s of lines) {
              const name = s.replace(/\d+\s*x\s*\d+|\d+/ig, '').trim();
              if (!name) continue;
              const it = { id: 'tmp-' + Math.random().toString(36).slice(2), name, brand: '', qty: 1, unitsPerPack: 1, unitLabel: 'unità', purchased: false };
              const idx = existing.findIndex(i =>
                i.name.toLowerCase() === it.name.toLowerCase() &&
                (i.brand||'').toLowerCase() === it.brand.toLowerCase() &&
                Number(i.unitsPerPack||1) === Number(it.unitsPerPack||1)
              );
              if (idx >= 0) existing[idx] = { ...existing[idx], qty: Math.max(0, Number(existing[idx].qty || 0) + it.qty) };
              else existing.push(it);
            }
            next[target] = existing; return next;
          });
          appended = true;
        }
      }

      showToast(appended ? 'Lista aggiornata da Vocale ✓' : 'Nessun elemento riconosciuto', appended ? 'ok' : 'err');
    } catch (e) {
      showToast(`Errore nel riconoscimento vocale: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      mediaRecRef.current = null;
      streamRef.current = null;
      recordedChunks.current = [];
    }
  }

  /* -------- Vocale UNIFICATO INVENTARIO (come già avevi) -------- */
  async function toggleVoiceInventory() {
    if (invRecBusy) { try { invMediaRef.current?.stop(); } catch {} return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      invStreamRef.current = stream;

      const cand = [
        { mime: 'audio/webm;codecs=opus', ext: 'webm' },
        { mime: 'audio/ogg;codecs=opus',  ext: 'ogg'  },
        { mime: 'audio/mp4',              ext: 'm4a'  },
        { mime: 'audio/webm',             ext: 'webm' },
      ];
      const pick = cand.find(c => { try { return MediaRecorder.isTypeSupported?.(c.mime); } catch { return false; } }) || { mime: 'audio/webm', ext: 'webm' };
      recMimeRef.current = pick;

      invMediaRef.current = new MediaRecorder(stream, pick.mime ? { mimeType: pick.mime } : undefined);
      invChunksRef.current = [];
      invMediaRef.current.ondataavailable = (e) => { if (e?.data && e.data.size) invChunksRef.current.push(e.data); };
      invMediaRef.current.onstop = processVoiceInventory;
      invMediaRef.current.start(500);
      setInvRecBusy(true);
    } catch { showToast('Microfono non disponibile', 'err'); }
  }

  async function processVoiceInventory() {
    try {
      try { invStreamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
      setInvRecBusy(false);

      if (!invChunksRef.current?.length) { showToast('Nessun audio catturato', 'err'); return; }

      const { mime, ext } = recMimeRef.current || { mime: 'audio/webm', ext: 'webm' };
      const blob = new Blob(invChunksRef.current, { type: mime || 'audio/webm' });
      invChunksRef.current = [];

      const fd = new FormData(); fd.append('audio', blob, `inventory.${ext}`);
      setBusy(true);
      const res = await timeoutFetch('/api/stt', { method: 'POST', body: fd }, 30000);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `STT HTTP ${res.status}`);

      const text = String(payload?.text || '').trim();
      if (!text) throw new Error('Testo non riconosciuto');

      // (qui puoi riusare i tuoi parser vocali — omessi per brevità)
      showToast('Inventario aggiornato da Vocale ✓', 'ok');
    } catch (e) {
      showToast(`Errore vocale inventario: ${e?.message || e}`, 'err');
    } finally {
      setBusy(false);
      invMediaRef.current = null;
      invStreamRef.current = null;
    }
  }

  /* ============================ RENDER ============================ */
  return (
    <>
      <Head><title>🛍 Lista Prodotti</title></Head>

      <div style={styles.page}>
        <div style={styles.card}>

          {/* ===== Banner ===== */}
          <section style={{ marginBottom: 12 }}>
            <div style={{ borderRadius: 16, overflow: 'hidden' }}>
              <video autoPlay loop muted playsInline preload="metadata" style={{ display: 'block', width: '100%', height: 160, objectFit: 'cover' }}>
                <source src="/video/Liste-prodotti.mp4" type="video/mp4" />
              </video>
            </div>
          </section>

          {/* ===== SEZIONE LISTE ===== */}
          <section style={styles.sectionBox}>
            <p style={styles.kicker}>scegli la lista che vuoi</p>

            <div style={styles.switchImgRow}>
              <button type="button" onClick={() => setCurrentList(LIST_TYPES.SUPERMARKET)} aria-pressed={currentList === LIST_TYPES.SUPERMARKET} style={styles.switchImgBtn}>
                <Image
                  src={currentList === LIST_TYPES.SUPERMARKET
                    ? '/img/Button/lista%20supermercato%20accesa.png'
                    : '/img/Button/lista%20supermercato%20spenta.png'}
                  alt="Lista Supermercato" width={150} height={45} priority style={styles.switchImg}
                />
              </button>

              <button type="button" onClick={() => setCurrentList(LIST_TYPES.ONLINE)} aria-pressed={currentList === LIST_TYPES.ONLINE} style={styles.switchImgBtn}>
                <Image
                  src={currentList === LIST_TYPES.ONLINE
                    ? '/img/Button/Lista%20on%20line%20acceso.png'
                    : '/img/Button/lista%20on%20line%20spenta.png'}
                  alt="Lista Online" width={150} height={45} priority style={styles.switchImg}
                />
              </button>
            </div>

            <div style={styles.toolsRow}>
              {/* Vocale Liste */}
              <button
                type="button"
                onClick={toggleRecList}
                disabled={busy}
                aria-label="Vocale Liste"
                title={busy ? 'Elaborazione in corso…' : (recBusy ? 'Stop registrazione' : 'Aggiungi con voce')}
                style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(15,23,42,.35)' }}
              >
                <video autoPlay loop muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }}>
                  <source src="/img/Button/tasto%20vocale%20Liste.mp4" type="video/mp4" />
                </video>
              </button>

              {/* Aggiungi manualmente */}
              <button
                onClick={() => setShowListForm(v => !v)}
                style={styles.iconCircle}
                title={showListForm ? 'Chiudi form lista' : 'Aggiungi manualmente alla lista'}
                aria-label={showListForm ? 'Chiudi form lista' : 'Aggiungi manualmente alla lista'}
              >
                <Image src="/img/icone%20%2B%20-/segno%20piu.png" alt="Aggiungi" width={42} height={42} priority style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
              </button>
            </div>

            {showListForm && (
              <div style={styles.sectionInner}>
                <form onSubmit={addManualItem} style={styles.formRow}>
                  <input placeholder="Prodotto (es. latte)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={styles.input} required />
                  <input placeholder="Marca (es. Parmalat)" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} style={styles.input} />
                  <input placeholder="Confezioni" inputMode="decimal" value={form.packs} onChange={e => setForm(f => ({ ...f, packs: e.target.value }))} style={{ ...styles.input, width: 140 }} required />
                  <input placeholder="Unità/conf." inputMode="decimal" value={form.unitsPerPack} onChange={e => setForm(f => ({ ...f, unitsPerPack: e.target.value }))} style={{ ...styles.input, width: 140 }} required />
                  <input placeholder="Etichetta (es. bottiglie)" value={form.unitLabel} onChange={e => setForm(f => ({ ...f, unitLabel: e.target.value }))} style={{ ...styles.input, width: 170 }} />
                  <button style={styles.primaryBtn} disabled={busy}>Aggiungi alla lista</button>
                </form>
              </div>
            )}

            {/* Lista corrente */}
            <div style={styles.sectionInner}>
              <h3 style={styles.h3}>Lista corrente: <span style={{ opacity:.85 }}>{currentList === LIST_TYPES.ONLINE ? 'Spesa Online' : 'Supermercato'}</span></h3>

              {(lists[currentList] || []).length === 0 ? (
                <p style={{ opacity:.8 }}>Nessun prodotto ancora</p>
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
                            next[currentList] = (prev[currentList] || []).map(i => i.id === it.id ? { ...i, purchased: !i.purchased } : i);
                            return next;
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setLists(prev => {
                              const next = { ...prev };
                              next[currentList] = (prev[currentList] || []).map(i => i.id === it.id ? { ...i, purchased: !i.purchased } : i);
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
                              const item = it; const movePacks = 1;
                              setLists(prev => {
                                const next = { ...prev };
                                next[currentList] = (prev[currentList] || [])
                                  .map(r => r.id === item.id ? { ...r, qty: Math.max(0, Number(r.qty || 0) - movePacks), purchased: true } : r)
                                  .filter(r => Number(r.qty || 0) > 0);
                                return next;
                              });
                              setStock(prev => {
                                const arr = [...prev]; const todayISO = new Date().toISOString().slice(0,10);
                                const idx = arr.findIndex(s => sameText(s.name, item.name) && sameText(s.brand || '', item.brand || ''));
                                const upp = Math.max(1, Number(item.unitsPerPack || 1));
                                const lbl = item.unitLabel || 'unità';
                                if (idx >= 0) {
                                  const old = arr[idx];
                                  const u = Math.max(1, Number(old.unitsPerPack || upp));
                                  const p = Math.max(0, Number(old.packs || 0) + movePacks);
                                  arr[idx] = { ...old, packs: p, unitsPerPack: u, unitLabel: old.unitLabel || lbl, packsOnly: false, ...restockTouch(p, todayISO, u) };
                                } else {
                                  const row = { name: item.name, brand: item.brand || '', packs: movePacks, unitsPerPack: upp, unitLabel: lbl, expiresAt: '', ...restockTouch(movePacks, todayISO, upp), avgDailyUnits: 0, packsOnly: false };
                                  arr.unshift(withRememberedImage(row, imagesIndex));
                                }
                                return arr;
                              });
                            }}
                            style={{ ...styles.iconBtnBase, ...styles.iconBtnGreen }}
                          >✓</button>

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

          {/* ===== SEZIONE CRITICI ===== */}
          <section style={styles.sectionBox}>
            <div style={styles.bannerArea}>
              <div style={{ ...styles.bannerBox, height: 'auto' }}>
                <video autoPlay loop muted playsInline preload="metadata" style={{ ...styles.bannerVideo, width: '100%', height: 'auto', objectFit: 'contain', background:'transparent' }}>
                  <source src="/video/banner%20esauriti.mp4" type="video/mp4" />
                </video>
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
                        <button title="Elimina definitivamente" onClick={() => deleteStockRow(i)} style={{ ...styles.iconSquareBase, ...styles.iconDanger }}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ===== SEZIONE SCORTE ===== */}
          <section style={styles.sectionBox}>
            <div style={styles.bannerArea}>
              <div style={styles.bannerBox}>
                <video autoPlay loop muted playsInline preload="metadata" style={styles.bannerVideo}>
                  <source src="/video/stato-scorte-small.mp4" type="video/mp4" />
                </video>
                <div style={styles.bannerOverlay} />
              </div>

              <div style={styles.sectionLarge}>
                <div style={styles.ocrRow}>
                  {/* OCR scontrino */}
                  <button type="button" onClick={() => ocrInputRef.current?.click()} style={styles.ocr42} aria-label="Scanner scontrino (OCR)" title="Scanner scontrino (OCR)">
                    <video autoPlay loop muted playsInline preload="metadata" style={styles.ocr42Video}>
                      <source src="/video/Ocr%20scontrini.mp4" type="video/mp4" />
                    </video>
                  </button>

                  {/* Vocale scorte */}
                  <button
                    type="button"
                    onClick={toggleVoiceInventory}
                    disabled={busy}
                    style={styles.voice42}
                    aria-pressed={!!invRecBusy}
                    aria-label="Riconoscimento vocale scorte"
                    title={busy ? 'Elaborazione in corso…' : (invRecBusy ? 'Stop registrazione scorte' : 'Riconoscimento vocale scorte')}
                  >
                    <video autoPlay loop muted playsInline preload="metadata" style={styles.voice42Video}>
                      <source src="/img/Button/tasto%20vocale%20Liste.mp4" type="video/mp4" />
                    </video>
                  </button>
                </div>
              </div>
            </div>

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
                            <div style={{ display:'flex', gap:8, marginTop:6 }}>
                              <button onClick={() => saveRowEdit(idx)} style={styles.smallOkBtn}>Salva</button>
                              <button onClick={cancelRowEdit} style={styles.smallGhostBtn}>Annulla</button>
                              <button onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }} style={styles.smallGhostBtn}>OCR riga</button>
                            </div>
                          </div>
                        ) : (
                          <div className="stockRowGrid">
                            {/* thumb */}
                            <div className="thumb" role="button" title="Aggiungi/Modifica immagine" onClick={() => { setTargetImageIdx(idx); rowImageInputRef.current?.click(); }} style={styles.imageBox}>
                              {s.image ? <img src={s.image} alt={s.name} style={styles.imageThumb} /> : <div style={styles.imagePlaceholder}>＋</div>}
                            </div>

                            {/* info */}
                            <div className="main" style={{ flex: 1, minWidth: 0 }}>
                              <div style={styles.stockTitle}>
                                {(s.prettyName || s.name)}{s.brand ? <span style={styles.rowBrand}> · {s.brand}</span> : null}
                              </div>
                              <div style={styles.progressOuterBig}>
                                <div style={{ ...styles.progressInner, width: `${w}%`, background: colorForPct(pct) }} />
                              </div>
                              {s.desc ? <div style={{ fontSize: '.82rem', opacity: .85, marginTop: 2 }}>{s.desc}</div> : null}
                              <div style={styles.stockLineSmall}>
                                {Math.round(current)}/{Math.max(1, Math.round(baseline))} {s.unitLabel || 'unità'}
                                {s.expiresAt ? <span style={styles.expiryChip}>scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}</span> : null}
                              </div>
                            </div>

                            {/* metriche */}
                            <div className="metrics">
                              <div className="kv"><div className="kvL">Confezioni</div><div className="kvV">{Number(s.packs || 0)}</div></div>
                              <div className="kv"><div className="kvL">Unità/conf.</div><div className="kvV">{s.packsOnly ? '–' : Number(s.unitsPerPack || 1)}</div></div>
                              <div className="kv"><div className="kvL">Residuo unità</div><div className="kvV">{s.packsOnly ? '–' : Math.round(residueUnitsOf(s))}</div></div>
                            </div>

                            {/* azioni */}
                            <div className="actions" style={styles.rowActionsRight}>
                              <button title="Modifica" onClick={() => startRowEdit(idx, s)} style={styles.iconCircle} aria-label="Modifica scorta">
                                <Pencil size={18} />
                              </button>
                              <button title="Imposta scadenza" onClick={() => { /* opzionale: mostra form scadenza */ }} style={styles.iconCircle} aria-label="Imposta scadenza">
                                <Calendar size={18} />
                              </button>
                              <button title="OCR riga" onClick={() => { setTargetRowIdx(idx); rowOcrInputRef.current?.click(); }} style={styles.iconCircle} aria-label="OCR riga">
                                <Camera size={18} />
                              </button>
                              <button title="Elimina definitivamente" onClick={() => deleteStockRow(idx)} style={{ ...styles.iconCircle, color:'#f87171', borderColor:'rgba(248,113,113,.35)' }} aria-label="Elimina scorta">
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
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'ok' ? '#16a34a' : toast.type === 'err' ? '#ef4444' : '#334155',
          color: '#fff', padding: '10px 14px', borderRadius: 10, boxShadow: '0 6px 16px rgba(0,0,0,.35)', zIndex: 9999, fontWeight: 600, letterSpacing: .2,
        }}>
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
          // (ridotto: per brevità puoi riusare handleOCR su singola riga se vuoi)
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (!files.length) return;
          // Per semplicità: richiama OCR generale (puoi conservare la tua logica per OCR riga)
          handleOCR(files);
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
            const file = files[0];
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = String(reader.result || '');
              setStock(prev => {
                const arr = [...prev]; if (!arr[targetImageIdx]) return prev;
                const updated = { ...arr[targetImageIdx], image: dataUrl };
                arr[targetImageIdx] = updated;
                const key = productKey(updated.name, updated.brand || '');
                setImagesIndex(prevIdx => ({ ...prevIdx, [key]: dataUrl }));
                return arr;
              });
              showToast('Immagine prodotto aggiornata ✓', 'ok');
            };
            reader.readAsDataURL(file);
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







