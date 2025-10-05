// pages/home.js
import React, { useRef, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabaseClient';

// Registratore (solo client)
const VoiceRecorder = dynamic(() => import('../components/VoiceRecorder'), { ssr: false });
// Import dinamico del brain (solo quando serve)
const getBrain = () => import('@/lib/brainHub');

/* ======================================================================================
   Config comportamento modale/chat
====================================================================================== */
const OPEN_CHAT_ON_OCR = false; // OCR silenzioso: niente modale, niente chat durante OCR

/* ======================================================================================
   Helpers generali
====================================================================================== */
function safeJSONStringify(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch {
    const seen = new WeakSet();
    return JSON.stringify(obj, (k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    }, 2);
  }
}
function formatResult(res) {
  if (!res && res !== 0) return 'Nessun risultato.';
  if (typeof res === 'string' || typeof res === 'number' || typeof res === 'boolean') return String(res);
  return safeJSONStringify(res);
}
function fmtEuro(n) { if (n==null||isNaN(n)) return '—'; try { return Number(n).toLocaleString('it-IT',{style:'currency',currency:'EUR'}); } catch { return `${n} €`; } }
function fmtInt(n) { if (n==null||isNaN(n)) return '—'; return Number(n).toLocaleString('it-IT'); }
function fmtPct(n) { if (n==null||isNaN(n)) return '—'; return `${Math.round(Number(n))}%`; }
function clampPct(n) { if (n==null||isNaN(n)) return null; return Math.max(0, Math.min(100, Number(n))); }

/* ======================================================================================
   Mini-charts (SVG puri)
====================================================================================== */
function svgBars(items, { max = 100, unit = '%', bg = '#0b0f14' } = {}) {
  const rows = items.slice(0, 10);
  const W = 420, H = 18 * rows.length + 24;
  const barW = 300;
  const svgRows = rows.map((r, i) => {
    const v = Math.max(0, Math.min(max, Number(r.value)||0));
    const w = (v / max) * barW;
    const y = 16 + i * 18;
    return `
      <text x="8" y="${y}" fill="#cdeafe" font-size="12">${r.label}</text>
      <rect x="160" y="${y-10}" width="${barW}" height="12" fill="#111827" rx="3" />
      <rect x="160" y="${y-10}" width="${w}" height="12" fill="#3b82f6" rx="3" />
      <text x="${160 + barW + 8}" y="${y}" fill="#cdeafe" font-size="12">${v}${unit}</text>`;
  }).join('\n');

  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" style="background:${bg}; border:1px solid #1f2a38; border-radius:12px">
    ${svgRows}
  </svg>`;
}

/* ======================================================================================
   OCR & normalizzazione: utilità robuste (anti-pesi, dedupe)
====================================================================================== */
const NON_PRODUCT_RE = /\b(carta\s+\*{2,}|bancomat|pos|resto|sconto|arrotondamento|pagamento|totale|imponibile|ventilazione|iva)\b/i;
function shouldDropName(name=''){ return NON_PRODUCT_RE.test(String(name||'')); }

function toISODate(any) {
  const s = String(any || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m1) {
    const d = String(m1[1]).padStart(2,'0');
    const M = String(m1[2]).padStart(2,'0');
    let y = String(m1[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  const mesi = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  const m2 = s.toLowerCase().match(/(\d{1,2})\s+([a-zà-ú]+)\s+(\d{2,4})/i);
  if (m2) {
    const d = String(m2[1]).padStart(2,'0');
    const mon = m2[2].slice(0,3);
    const idx = mesi.indexOf(mon);
    if (idx >= 0) {
      let y = String(m2[3]);
      if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
      const M = String(idx+1).padStart(2,'0');
      return `${y}-${M}-${d}`;
    }
  }
  return '';
}
function pickDateFromTexts(texts = []) {
  const joined = String((texts||[]).join('\n') || '');
  const m1 = joined.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/);
  if (m1) { const iso = toISODate(m1[1]); if (iso) return iso; }
  const m2 = joined.match(/(\d{1,2}\s+[a-zà-ú]+\s+\d{2,4})/i);
  if (m2) { const iso = toISODate(m2[1]); if (iso) return iso; }
  return '';
}
function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
const SUSPECT_UPP = new Set([125,200,220,225,230,240,250,280,300,330,350,375,400,410,450,454,480,500,700,720,733,750,800,900,910,930,950,1000,1500,2000]);
const MEASURE_TOKEN_RE = /\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|lt|ml|cl)\b/gi;
function isWeightOrVolumeLabel(lbl=''){ const s=String(lbl).toLowerCase().trim(); return /^(?:g|gr|kg|ml|cl|l|lt|grammi?|litri?)$/.test(s); }

const BRAND_ALIASES = {
  'm. bianco':'Mulino Bianco','mulino bianco':'Mulino Bianco',
  'saiwa':'Saiwa','san carlo':'San Carlo',
  'ferrero':'Ferrero','motta':'Motta','parmalat':'Parmalat','arborea':'Arborea',
  'de cecco':'De Cecco','kimbo':'Kimbo','pantene':'Pantene','nivea':'Nivea','malizia':'Malizia','vileda':'Vileda'
};
function canonBrand(b=''){ const k = normKey(b); return BRAND_ALIASES[k] || (b ? b.trim() : ''); }

function productFamily(name=''){
  const s = normKey(name);
  if (/\bfiesta\b/.test(s)) return 'fam:fiesta';
  if (/\byo[-\s]?yo\b/.test(s)) return 'fam:yoyo';
  if (/\bpods?\b/.test(s)) return 'fam:pods';
  if (/\buova?\b/.test(s)) return 'fam:eggs';
  if (/\bspaghett|rigaton|penne|bucatini|fusill|mezze?\b/.test(s)) return 'fam:pasta';
  return 'fam:?';
}
function milkAttrs(name=''){
  const s = normKey(name);
  const fat = /\bintero\b/.test(s) ? 'fat:i'
            : /\b(ps|parzialmente|semi|parz)\b/.test(s) ? 'fat:ps'
            : /\bscrem\b/.test(s) ? 'fat:s'
            : 'fat:?';
  const lf  = /\b(zymil|senza lattosio|delact|s\/la)\b/.test(s) ? 'lf:1' : 'lf:0';
  return `${fat}|${lf}`;
}
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

// neutralizza pesi/volumi; correzioni famiglie
function sanitizeUnits(item) {
  const out = { ...item };
  out.brand = canonBrand(out.brand || '');
  const fam = productFamily(out.name || '');

  if (SUSPECT_UPP.has(Number(out.unitsPerPack || 0)) || isWeightOrVolumeLabel(out.unitLabel || '') || fam === 'fam:pasta') {
    out.unitsPerPack = 1; out.unitLabel = 'unità';
  }
  if (fam === 'fam:pods') { out.brand = out.brand || 'Dash'; if (!out.unitsPerPack || out.unitLabel==='unità'){ out.unitsPerPack=30; out.unitLabel='pod'; } }
  if (fam === 'fam:fiesta'){ out.brand = 'Ferrero'; if (!out.unitsPerPack || out.unitLabel==='unità'){ out.unitsPerPack=10; out.unitLabel='pezzi'; } }
  if (fam === 'fam:yoyo')  { out.brand = 'Motta';   if (!out.unitsPerPack || out.unitLabel==='unità'){ out.unitsPerPack=10; out.unitLabel='pezzi'; } }
  if (fam === 'fam:eggs')  { if (!out.unitsPerPack || out.unitsPerPack===1){ out.unitsPerPack=6; out.unitLabel='uova'; } }

  if (/espresso in gran/i.test(out.name)) out.name = 'Caffè espresso in grani';
  if (/caseificio/i.test(out.name)) { out.brand='Caseificio S. Stefano'; out.name='Formaggio fresco'; }

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
    const better = (a, b, aL, bL) => {
      if (aL === 'unità' && bL !== 'unità') return [b, bL];
      if (bL === 'unità' && aL !== 'unità') return [a, aL];
      return [Math.max(a, b), aL || bL || 'unità'];
    };
    const [u, lbl] = better(Math.max(1, Number(cur.unitsPerPack||1)), Math.max(1, Number(p.unitsPerPack||1)), cur.unitLabel||'unità', p.unitLabel||'unità');
    cur.unitsPerPack = u; cur.unitLabel = lbl;
    const a = /^\d{4}-\d{2}-\d{2}$/.test(cur.expiresAt||'') ? cur.expiresAt : null;
    const b = /^\d{4}-\d{2}-\d{2}$/.test(p.expiresAt||'') ? p.expiresAt : null;
    if (!a && b) cur.expiresAt = b; else if (a && b && b < a) cur.expiresAt = b;
    cur.priceTotal = (Number(cur.priceTotal)||0) + (Number(p.priceTotal)||0);
  }
  return Array.from(map.values());
}
function normalizeItemForPipelines(p) {
  const packs = Math.max(1, Number(p.packs || p.qty || 1));
  const upp   = Math.max(1, Number(p.unitsPerPack || 1));
  const unit  = (p.unitLabel || p.uom || '').trim() || 'unità';
  return { ...p, packs, unitsPerPack: upp, unitLabel: unit, expiresAt: toISODate(p.expiresAt || p.expiry || p.scadenza || '') };
}
function enforceHybridUnitPrice(p) {
  const packs = Math.max(1, Number(p.packs || p.qty || 1));
  const upp   = Math.max(1, Number(p.unitsPerPack || 1));
  const totalUnits = packs * upp;
  const rawUnit  = Number(p.priceEach ?? p.price) || 0;
  const rawTotal = Number(p.priceTotal) || 0;
  let priceEach = 0, priceTotal = 0;
  if (totalUnits <= 1) { priceEach = rawUnit || rawTotal || 0; priceTotal = priceEach; }
  else { if (rawUnit) { priceEach = rawUnit; priceTotal = rawUnit * totalUnits; } else { priceEach = totalUnits ? (rawTotal/totalUnits) : 0; priceTotal = rawTotal; } }
  return { ...p, packs, unitsPerPack: upp, priceEach, priceTotal, currency: p.currency || 'EUR' };
}

/* ======================================================================================
   Fast image downscale (client) + concurrency limit
====================================================================================== */
async function downscaleImageFile(file, { maxSide = 1400, quality = 0.72 } = {}) {
  try {
    if (!file || !/^image\//i.test(file.type) || file.type === 'application/pdf') return file;
    const bitmap = await (async () => {
      if ('createImageBitmap' in window) return await createImageBitmap(file);
      const dataUrl = await new Promise((ok, ko) => {
        const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file);
      });
      const img = new Image(); await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = dataUrl; });
      return img;
    })();
    const w0 = bitmap.width || bitmap.naturalWidth, h0 = bitmap.height || bitmap.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    if (scale === 1 && file.size <= 1_200_000) return file;
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name || 'upload').replace(/\.\w+$/,'') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}
async function mapWithLimit(arr, limit, worker) {
  const out = new Array(arr.length);
  let i = 0; const running = new Set();
  async function run(k) { running.add(k); try { out[k] = await worker(arr[k], k); } finally { running.delete(k); if (i < arr.length) await run(i++); } }
  const n = Math.min(limit, arr.length);
  for (; i < n; i++) run(i);
  while (running.size) await new Promise(r => setTimeout(r, 10));
  return out;
}

/* ======================================================================================
   Unified AI helpers
====================================================================================== */
function classifyOcrText(raw='') {
  const s = String(raw || '').toLowerCase();
  const score = (keys) => keys.reduce((n,k)=> n + (s.includes(k) ? 1 : 0), 0);
  const receiptScore = score(['documento commerciale','scontrino','totale','subtotale','iva','resto','contanti','pagamento','euro','€','cassa','rt','cassiere','p.iva']);
  const wineLabelScore = score(['docg','doc','igt','denominazione','imbottigliato da','% vol','alc']);
  const rows = s.split(/\r?\n/).filter(l => l.trim());
  const yearRows = rows.filter(l => /\b(19|20)\d{2}\b/.test(l)).length;
  const euroRows = rows.filter(l => /€\s?\d/.test(l)).length;
  const wineWords = rows.filter(l => /\b(barolo|nebbiolo|chianti|amarone|etna|franciacorta|vermentino|greco|fiano|sagrantino|montepulciano|nero d'avola)\b/.test(l)).length;
  const wineListScore = (yearRows + euroRows + wineWords);
  if (wineListScore >= 6) return 'wine_list';
  if (wineLabelScore >= 3 && wineLabelScore > receiptScore) return 'wine_label';
  if (receiptScore >= 3) return 'receipt';
  return 'unknown';
}
function guessExpenseBucket(store='') {
  const s = String(store).toLowerCase();
  if (/\b(bar|ristorante|pizzeria|pub|bistrot|trattoria|enoteca|aperi)\b/.test(s)) return 'cene-aperitivi';
  return 'spese-casa';
}

async function postJSON(url, body, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token || '';

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: 'same-origin',
    });

    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!r.ok) throw new Error(json?.error || json?.message || `${r.status} ${text?.slice(0,180)}`);
    return json ?? { data: text };
  } finally {
    clearTimeout(t);
  }
}

/* ======================================================================================
   Home component
====================================================================================== */
const Home = () => {
  const fileInputRef = useRef(null);
  const [queryText, setQueryText] = useState('');
  const [busy, setBusy] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);

  const lastUserIntentRef = useRef({ text: '', sommelier: false });
  const wineListsRef = useRef([]);

  const router = useRouter();
  const deepLinkHandledRef = useRef(false);
  const speakModeRef = useRef(false);

  // mini-toast opzionale (feedback non intrusivo)
  const [toast, setToast] = useState(null);
  function showToast(txt) { setToast(txt); setTimeout(()=>setToast(null), 2200); }

  const [uid, setUid] = useState(null);
  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      setUid(user?.id || null);
    })();
  }, []);

  async function runBrainQuery(text, opts = {}) {
    const mod = await getBrain().catch(() => null);
    const fn = mod?.runQueryFromTextLocal || mod?.default?.runQueryFromTextLocal;
    if (typeof fn !== 'function') throw new Error('runQueryFromTextLocal non disponibile (brainHub)');
    return await fn(text, opts);
  }

  /* =================== TTS (opzionale) =================== */
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const ttsEnabledRef = useRef(false);
  const [voices, setVoices] = useState([]);
  const [voiceId, setVoiceId] = useState(null);
  const voicesRef = useRef([]); const selectedVoiceRef = useRef(null);

  function loadVoices() {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const synth = window.speechSynthesis; const list = synth.getVoices() || [];
      if (!list.length) return;
      const it = list.filter(v => String(v.lang || '').toLowerCase().startsWith('it'));
      const ordered = [...it, ...list.filter(v => !String(v.lang || '').toLowerCase().startsWith('it'))];
      voicesRef.current = ordered; setVoices(ordered);
      const saved = (typeof window !== 'undefined') ? localStorage.getItem('__tts_voice') : null;
      const chosen = ordered.find(v => v.name === saved) || it[0] || ordered[0] || null;
      setVoiceId(chosen ? chosen.name : null); selectedVoiceRef.current = chosen;
    } catch {}
  }
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const onVoices = () => loadVoices();
    synth.addEventListener('voiceschanged', onVoices); loadVoices();
    return () => synth.removeEventListener('voiceschanged', onVoices);
  }, []);
  useEffect(() => {
    try {
      if (!voiceId) return;
      if (typeof window !== 'undefined') localStorage.setItem('__tts_voice', voiceId);
      const v = voicesRef.current.find(v => v.name === voiceId) || null;
      selectedVoiceRef.current = v;
    } catch {}
  }, [voiceId]);
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('__tts_enabled') : null;
      const on = saved === '1'; setTtsEnabled(on); ttsEnabledRef.current = on;
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem('__tts_enabled', ttsEnabled ? '1' : '0');
      ttsEnabledRef.current = ttsEnabled;
    } catch {}
  }, [ttsEnabled]);
  function maybeSpeakMessage(msg) {
    try {
      if (!(ttsEnabledRef.current || speakModeRef.current)) return;
      const text = String(msg?.text || '').replace(/<[^>]+>/g, '').trim();
      if (!text) return;
      const synth = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null;
      const Utter = (typeof window !== 'undefined') ? window.SpeechSynthesisUtterance : null;
      if (!synth || typeof Utter !== 'function') return;
      const utt = new Utter(text);
      utt.lang = selectedVoiceRef.current?.lang || 'it-IT';
      if (selectedVoiceRef.current) utt.voice = selectedVoiceRef.current;
      synth.cancel(); synth.speak(utt);
    } catch (e) { console.warn('[TTS] skip', e); }
  }

  /* =================== OCR helpers unificati (fast + fallback) =================== */
  function normFromOcrHome(j = {}) {
    const kind = j?.kind || 'unknown';
    const text = String(j?.text || '');
    const meta = {
      store:   String(j?.meta?.store || j?.store || ''),
      address: String(j?.meta?.address || j?.address || ''),
      place:   String(j?.meta?.place   || j?.meta?.city || j?.place || j?.city || ''),
      purchaseDate: String(j?.meta?.purchaseDate || j?.purchaseDate || ''),
      totalPaid: Number(j?.meta?.totalPaid || j?.totalPaid || 0),
      currency: String(j?.meta?.currency || j?.currency || 'EUR'),
    };
    const purchases = Array.isArray(j?.purchases) ? j.purchases.map(p => ({
      name: String(p.name||'').trim(),
      brand: String(p.brand||'').trim(),
      packs: Number(p.packs || p.qty || 0),
      unitsPerPack: Number(p.unitsPerPack || 0),
      unitLabel: String(p.unitLabel || p.uom || ''),
      priceEach: Number(p.priceEach || 0),
      priceTotal: Number(p.priceTotal || 0),
      currency: String(p.currency || 'EUR'),
      expiresAt: String(p.expiresAt || p.expiry || p.scadenza || '')
    })) : [];
    return { kind, text, meta, purchases: purchases.map(normalizeItemForPipelines), wine: j?.wine || null, entries: j?.entries || null };
  }
  function normFromLegacyOcr(j = {}) {
    const text = String(j?.text || j?.data?.text || j?.data || '');
    const meta = {
      store: String(j?.store || ''),
      address: String(j?.address || ''),
      place: String(j?.place || j?.city || ''),
      purchaseDate: String(j?.purchaseDate || ''),
      totalPaid: Number(j?.totalPaid || 0),
      currency: String(j?.currency || 'EUR'),
    };
    const src = Array.isArray(j?.purchases) ? j.purchases : Array.isArray(j?.items) ? j.items : [];
    const purchases = src.map(p => ({
      name: String(p.name||'').trim(),
      brand: String(p.brand||'').trim(),
      packs: Number(p.packs || p.qty || 0),
      unitsPerPack: Number(p.unitsPerPack || 0),
      unitLabel: String(p.unitLabel || p.uom || ''),
      priceEach: Number(p.priceEach || 0),
      priceTotal: Number(p.priceTotal || 0),
      currency: String(p.currency || 'EUR'),
      expiresAt: String(p.expiresAt || p.expiry || p.scadenza || '')
    }));
    return { kind: 'receipt', text, meta, purchases: purchases.map(normalizeItemForPipelines), wine: null, entries: null };
  }

  // fast path: items-only
  async function fastItemsOnly(file) {
    const fd = new FormData(); fd.append('images', file, file.name || 'receipt.jpg');
    const r = await fetch('/api/ocrHome?mode=items-only', { method:'POST', body: fd });
    const j = await r.json().catch(()=> ({}));
    if (r.ok && j?.ok && Array.isArray(j.purchases) && j.purchases.length) {
      return j.purchases.map(p => ({
        name: String(p.name||'').trim(),
        brand: String(p.brand||'').trim(),
        packs: Number(p.packs||0),
        unitsPerPack: Number(p.unitsPerPack||0),
        unitLabel: String(p.unitLabel||''),
        priceEach: Number(p.priceEach||0),
        priceTotal: Number(p.priceTotal||0),
        currency: String(p.currency||'EUR'),
        expiresAt: String(p.expiresAt||'')
      }));
    }
    return null;
  }

  async function fetchOcrUnified(file) {
    // 0) fast attempt
    const quick = await fastItemsOnly(file);
    if (quick && quick.length) {
      return { kind:'receipt', text:'', meta:{}, purchases: quick.map(normalizeItemForPipelines) };
    }
    // 1) ocrHome full
    const fd = new FormData(); fd.append('images', file, file.name || 'upload.jpg');
    let r = await fetch('/api/ocrHome', { method: 'POST', body: fd });
    let j = null; try { j = await r.json(); } catch {}
    if (r.ok && j && !j.error) {
      const n = normFromOcrHome(j);
      if (!(n.kind === 'receipt' && n.purchases.length === 0)) return n;
    }
    // 2) legacy
    r = await fetch('/api/ocr', { method: 'POST', body: fd });
    j = await r.json().catch(()=> ({}));
    return normFromLegacyOcr(j);
  }

  /* =================== Pipeline inserimenti =================== */
  async function insertFinanze(payload) {
    return await postJSON('/api/finances/ingest_v2', payload);
  }
  async function insertSpeseCasa(payload) {
    return await postJSON('/api/speseCasa/ingest_v1', payload);
  }
  async function insertCeneAperitivi(payload) {
    return await postJSON('/api/ceneAperitivi/ingest_v1', payload);
  }
  async function insertScorte(payload) {
    return await postJSON('/api/scorte/ingest_v1', payload);
  }

  function computeReceiptDate(n, fallbackTexts=[]) {
    const d = toISODate(n?.meta?.purchaseDate || '');
    if (d) return d;
    const p = pickDateFromTexts(fallbackTexts);
    return p || new Date().toISOString().slice(0,10);
  }

  function filterAndPrepareItems(items=[]) {
    const cleaned = (items || [])
      .filter(p => p && String(p.name||'').trim())
      .filter(p => !shouldDropName(p.name));
    const deduped = dedupeAndFix(cleaned);
    const enforced = deduped.map(enforceHybridUnitPrice);
    const total = enforced.reduce((s, x) => s + (Number(x.priceTotal)||0), 0);
    return { items: enforced, total: Number(total.toFixed(2)) };
  }

  function inferStore(n) {
    const m = n?.meta || {};
    const store = String(m.store || '').trim();
    if (store) return store;
    // prova da testo se esiste
    const t = String(n?.text || '').split('\n')[0] || '';
    return t.slice(0, 64).trim();
  }

  function isBarRistorante(store='') {
    return guessExpenseBucket(store) === 'cene-aperitivi';
  }

  /* =================== OCR Smart handler =================== */
  async function handleSmartOCR(files) {
    const wantSommelier =
      lastUserIntentRef.current.sommelier ||
      /\b(sommelier|carta (dei )?vini)\b/i.test(queryText);

    try {
      setBusy(true);

      // a) downscale tutte le immagini
      const slimmed = await mapWithLimit(Array.from(files||[]), 2, f => downscaleImageFile(f, { maxSide: 1400, quality: .72 }));

      // b) OCR con concorrenza 2
      const results = await mapWithLimit(slimmed, 2, fetchOcrUnified);

      // c) smista
      const texts = [];
      const receipts = [];
      const labels = [];
      const lists = [];
      for (const n of results) {
        if (n?.text) texts.push(n.text);
        const guess = n?.kind || classifyOcrText(n?.text || '');
        if (guess === 'receipt') receipts.push(n);
        else if (guess === 'wine_label') labels.push(n);
        else if (guess === 'wine_list') lists.push(n);
      }

      // === SOMMELIER / CARTA VINI ===
      // Se carico carta vini via OCR (lists) oppure ho intenzione sommelier senza etichette: apri modale e salva memoria
      if (lists.length || (wantSommelier && !labels.length && !receipts.length)) {
        wineListsRef.current = [
          ...wineListsRef.current,
          ...lists.map(l => String(l.text || '')),
        ].slice(-8); // tieni ultime 8 carte
        // Apri modale on-demand per guida sommelier
        openChatWithSystem([
          { role: 'assistant', text: 'Modalità Sommelier attiva. Carica una foto della **carta dei vini** o chiedimi: "Che vino abbino con la tagliata?", "Trova un Nebbiolo tradizionale"…' }
        ]);
        showToast('Sommelier pronto 🍷');
        dispatchEvent(new CustomEvent('jarvis:ocr:done', { detail: { type: 'sommelier', lists: lists.length } }));
        return;
      }

      // Se ho etichette (wine_label), usale come contesto sommelier (senza inserimenti Finanze/Scorte)
      if (labels.length && !receipts.length) {
        wineListsRef.current = [
          ...wineListsRef.current,
          ...labels.map(l => String(l.text || ''))
        ].slice(-12);
        openChatWithSystem([
          { role: 'assistant', text: 'Ho letto alcune **etichette vino**. Chiedimi pure info o abbinamenti nella modale.' }
        ]);
        showToast('Etichette vino acquisite 🍇');
        dispatchEvent(new CustomEvent('jarvis:ocr:done', { detail: { type: 'wine_label', count: labels.length } }));
        return;
      }

      // === RICEVUTE / SCONTRINI ===
      if (receipts.length) {
        // OCR silenzioso: non aprire modale e non scrivere in chat
        // Inserisci nelle pipeline secondo routing
        let insCount = 0;
        for (const n of receipts) {
          const store = inferStore(n);
          const date = computeReceiptDate(n, texts);
          const { items, total } = filterAndPrepareItems(n.purchases || []);
          const isBar = isBarRistorante(store);

          // evito di inserire se non ci sono items significativi
          if (!items.length && total <= 0) continue;

          const basePayload = {
            user_id: uid,
            store,
            date,
            total_paid: (Number(n?.meta?.totalPaid) || total || 0),
            currency: String(n?.meta?.currency || 'EUR'),
            items
          };

          // Finanze (sempre)
          try {
            await insertFinanze({ ...basePayload, bucket: isBar ? 'cene-aperitivi' : 'spese-casa', source: 'receipt' });
          } catch (e) {
            console.warn('Finanze insert error:', e);
          }

          // Spese Casa o Cene & Aperitivi
          try {
            if (isBar) {
              await insertCeneAperitivi({ ...basePayload, note: 'OCR bar/ristorante', source: 'receipt' });
            } else {
              await insertSpeseCasa({ ...basePayload, note: 'OCR supermercato', source: 'receipt' });
            }
          } catch (e) {
            console.warn('Spese/Cene insert error:', e);
          }

          // Scorte solo supermercato
          if (!isBar) {
            try {
              const scorteItems = items.map(p => ({
                name: p.name,
                brand: p.brand || null,
                packs: p.packs,
                units_per_pack: p.unitsPerPack,
                unit_label: p.unitLabel,
                expires_at: p.expiresAt || null,
                price_each: p.priceEach,
                price_total: p.priceTotal,
                currency: p.currency || 'EUR',
              }));
              await insertScorte({ user_id: uid, store, date, items: scorteItems, source: 'receipt' });
            } catch (e) {
              console.warn('Scorte insert error:', e);
            }
          }

          insCount++;
        }

        showToast(insCount ? `Scontrino importato (${insCount}) ✅` : 'Nessun articolo valido trovato');
        // CustomEvent non intrusivi
        dispatchEvent(new CustomEvent('jarvis:ocr:done', { detail: { type: 'receipt', count: receipts.length } }));
        return;
      }

      // Nessun caso gestito esplicito
      showToast('OCR completato. Nessun dato rilevante.');
      dispatchEvent(new CustomEvent('jarvis:ocr:done', { detail: { type: 'none' } }));
    } catch (err) {
      console.error('handleSmartOCR error:', err);
      showToast('Errore OCR');
      dispatchEvent(new CustomEvent('jarvis:ocr:error', { detail: { message: String(err?.message || err) } }));
    } finally {
      setBusy(false);
    }
  }

  /* =================== Modale/Chat on-demand =================== */
  function openChatWithSystem(initial = []) {
    // apre la modale e inserisce messaggi (senza TTS automatico)
    setChatOpen(true);
    if (initial?.length) {
      setChatMsgs(prev => {
        const next = [...prev, ...initial.map(m => ({ role: m.role || 'assistant', text: m.text }))];
        return next;
      });
    }
  }

  async function askInModal(text) {
    const q = String(text || '').trim();
    if (!q) return;
    // Tutte le risposte vanno SOLO nella modale (anche TTS se attivo)
    setChatMsgs(prev => [...prev, { role: 'user', text: q }]);
    try {
      const memory = wineListsRef.current?.join('\n---\n') || '';
      const res = await runBrainQuery(q, {
        mode: 'modal-only',
        wine_memory: memory || undefined
      });
      const msg = { role: 'assistant', text: formatResult(res) };
      setChatMsgs(prev => [...prev, msg]);
      maybeSpeakMessage(msg);
    } catch (e) {
      const msg = { role: 'assistant', text: 'Errore durante la risposta. Riprova.' };
      setChatMsgs(prev => [...prev, msg]);
      maybeSpeakMessage(msg);
    }
  }

  /* =================== Voice intents =================== */
  async function onVoiceText(text) {
    const t = String(text || '').trim();
    if (!t) return;
    lastUserIntentRef.current = {
      text: t,
      sommelier: /\b(sommelier|carta (dei )?vini)\b/i.test(t)
    };

    // Se è domanda → apri modale e rispondi lì (OCR non coinvolto)
    if (/\?$/.test(t) || /\b(cosa ho a casa|quanto ho speso|ho una bottiglia|quali offerte|cosa manca)\b/i.test(t) || lastUserIntentRef.current.sommelier) {
      if (!chatOpen) openChatWithSystem();
      await askInModal(t);
      return;
    }
  }

  /* =================== Deep-link ?img= =================== */
  useEffect(() => {
    const q = router.query;
    if (deepLinkHandledRef.current) return;
    if (q?.img) {
      deepLinkHandledRef.current = true;
      (async () => {
        try {
          const url = Array.isArray(q.img) ? q.img[0] : q.img;
          showToast('Importo immagine…');
          dispatchEvent(new CustomEvent('jarvis:ocr:progress', { detail: { stage: 'download' } }));
          const r = await fetch(url);
          const blob = await r.blob();
          const file = new File([blob], 'deeplink.jpg', { type: blob.type || 'image/jpeg' });
          await handleSmartOCR([file]);
        } catch (e) {
          console.warn('deeplink ?img= error', e);
          showToast('Impossibile importare immagine');
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query?.img]);

  /* =================== UI Handlers =================== */
  function onClickOcr() {
    if (busy) return;
    fileInputRef.current?.click();
  }
  async function onFilesPicked(e) {
    const files = e.target.files || [];
    if (!files.length) return;
    // OCR silenzioso
    await handleSmartOCR(files);
    e.target.value = ''; // reset per ri-selezione
  }

  function onOpenModal() {
    openChatWithSystem();
  }
  function onOpenSommelier() {
    lastUserIntentRef.current = { text: 'sommelier', sommelier: true };
    openChatWithSystem([
      { role: 'assistant', text: 'Sommelier attivo 🍷. Scatta la **carta dei vini** con il pulsante 📷 OCR oppure chiedimi un consiglio.' }
    ]);
  }

  /* =================== Render =================== */
  return (
    <>
      <Head>
        <title>Home – Jarvis</title>
      </Head>

      <div className="min-h-screen bg-[#0b0f14] text-[#e5f2ff]">
        <header className="max-w-5xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-wide">Jarvis • Home</h1>
          <div className="flex items-center gap-3">
            <button
              className={`px-3 py-2 rounded-xl border border-[#1f2a38] ${busy ? 'opacity-60' : 'hover:bg-[#111b24]'}`}
              onClick={onClickOcr}
              disabled={busy}
              title="OCR Scontrino o Carta vini"
            >📷 OCR</button>

            <button
              className="px-3 py-2 rounded-xl border border-[#1f2a38] hover:bg-[#111b24]"
              onClick={onOpenModal}
              title="Apri modale Interroga dati"
            >🔎 Interroga dati</button>

            <button
              className="px-3 py-2 rounded-xl border border-[#1f2a38] hover:bg-[#111b24]"
              onClick={onOpenSommelier}
              title="Sommelier / Carta dei vini"
            >🍷 Sommelier</button>

            <label className="flex items-center gap-2 text-sm px-2 py-1 rounded-lg border border-[#1f2a38]">
              <input type="checkbox" checked={ttsEnabled} onChange={e => setTtsEnabled(e.target.checked)} />
              TTS
            </label>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 pb-24">
          <section className="grid md:grid-cols-2 gap-6">
            <div className="p-4 rounded-2xl border border-[#1f2a38] bg-[#0c1219]">
              <h2 className="text-lg font-medium mb-3">Comandi vocali</h2>
              <p className="text-sm opacity-80 mb-3">Esempi: “cosa ho a casa?”, “quanto ho speso questo mese?”, “sommelier consiglia un Barolo classico”. Le risposte compaiono solo nella modale.</p>
              <VoiceRecorder onFinalText={onVoiceText} />
            </div>

            <div className="p-4 rounded-2xl border border-[#1f2a38] bg-[#0c1219]">
              <h2 className="text-lg font-medium mb-3">Scorciatoie</h2>
              <ul className="text-sm list-disc pl-5 space-y-1 opacity-90">
                <li>📷 OCR: importa scontrini o carta dei vini (silenzioso, nessuna modale).</li>
                <li>🔎 Interroga dati: apri la modale e poni domande su Finanze/Scorte.</li>
                <li>🍷 Sommelier: guida per OCR carta dei vini e Q&A in modale.</li>
              </ul>
              <div className="mt-4">
                <div dangerouslySetInnerHTML={{ __html: svgBars([
                  { label: 'Spese Casa', value: 72 },
                  { label: 'Cene & Aperitivi', value: 25 },
                  { label: 'Scorte aggiornate', value: 88 },
                ], { max: 100, unit: '%', bg: '#0c1219' }) }} />
              </div>
            </div>
          </section>

          <section className="mt-6 p-4 rounded-2xl border border-[#1f2a38] bg-[#0c1219]">
            <h2 className="text-lg font-medium mb-3">Link utili</h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="px-3 py-2 rounded-xl border border-[#1f2a38] hover:bg-[#111b24]" href="/entrate">Entrate &amp; Saldi</Link>
              <Link className="px-3 py-2 rounded-xl border border-[#1f2a38] hover:bg-[#111b24]" href="/spese-casa">Spese Casa</Link>
              <Link className="px-3 py-2 rounded-xl border border-[#1f2a38] hover:bg-[#111b24]" href="/scorte">Scorte</Link>
            </div>
          </section>
        </main>

        {/* Toast leggero */}
        {toast && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl border border-[#1f2a38] bg-[#0c1219] shadow">
            {toast}
          </div>
        )}

        {/* Modale Interroga dati (on-demand) */}
        {chatOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={()=>setChatOpen(false)}>
            <div className="w-full max-w-2xl rounded-2xl border border-[#203040] bg-[#0a121a]" onClick={e=>e.stopPropagation()}>
              <div className="px-4 py-3 flex items-center justify-between border-b border-[#1f2a38]">
                <div className="font-medium">Interroga dati</div>
                <button className="px-2 py-1 rounded-lg border border-[#1f2a38] hover:bg-[#111b24]" onClick={()=>setChatOpen(false)}>Chiudi</button>
              </div>
              <div className="max-h-[60vh] overflow-auto p-4 space-y-3">
                {chatMsgs.length === 0 && (
                  <div className="text-sm opacity-80">
                    Fai una domanda: “cosa ho a casa?”, “quanto ho speso a settembre?”, “mostra spese Deco”, oppure usa la modalità 🍷 Sommelier.
                  </div>
                )}
                {chatMsgs.map((m, i) => (
                  <div key={i} className={`p-3 rounded-xl ${m.role==='user' ? 'bg-[#111b24] text-[#e5f2ff]' : 'bg-[#0f1820] text-[#cfe7ff]'}`}>
                    <div className="text-xs opacity-70 mb-1">{m.role==='user' ? 'Tu' : 'Jarvis'}</div>
                    <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-[#1f2a38]">
                <form onSubmit={async (e)=>{ e.preventDefault(); const form = e.currentTarget; const q = form.q.value; form.q.value=''; await askInModal(q); }}>
                  <div className="flex gap-2">
                    <input name="q" placeholder="Scrivi una domanda…" className="flex-1 px-3 py-2 rounded-xl bg-[#0d1620] border border-[#1f2a38] outline-none" />
                    <button className="px-3 py-2 rounded-xl border border-[#1f2a38] hover:bg-[#111b24]" type="submit">Invia</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFilesPicked} />
      </div>
    </>
  );
};

export default withAuth(Home);
