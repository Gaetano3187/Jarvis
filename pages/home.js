// pages/home.js
import React, { useRef, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabaseClient'; // ⬅️ spostato in alto

// Registratore (solo client)
const VoiceRecorder = dynamic(() => import('../components/VoiceRecorder'), { ssr: false });
// Import dinamico del brain (solo quando serve)
const getBrain = () => import('@/lib/brainHub');

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

  // 🔕 Modale/Chat on-demand (non si apre mai per OCR silenzioso)
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);

  const lastUserIntentRef = useRef({ text: '', sommelier: false });
  const wineListsRef = useRef([]);

  const router = useRouter();
  const deepLinkHandledRef = useRef(false);
  const speakModeRef = useRef(false);

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
    // Se ho carte vini acquisite, passale come contesto
    const sommelierMemory = (wineListsRef.current || []).join('\n---\n').slice(0, 200000);
    return await fn(text, { ...opts, sommelierMemory });
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

  /* =================== Toast leggero =================== */
  const [toasts, setToasts] = useState([]);
  function showToast(text, kind='info', ms=2500) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    setToasts(t => [...t, { id, text, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ms);
    try { window.dispatchEvent(new CustomEvent('app:toast', { detail: { text, kind, at: Date.now() } })); } catch {}
  }

  /* =================== OCR Smart handler =================== */
  // options: { silent: true|false } — per OCR scontrini deve essere true; per sommelier carta, false (modale aperta)
  async function handleSmartOCR(files, options = { silent: true }) {
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

      // === SOMMELIER: carta vini (solo memoria; modale aperta) ===
      if (lists.length || (wantSommelier && !labels.length && !receipts.length)) {
        const joined = (lists.length ? lists.map(x => x.text || '').join('\n---\n') : texts.join('\n---\n')).trim();
        if (!joined) {
          if (!options.silent) setChatMsgs(arr => [...arr, { role: 'assistant', text: '❌ OCR: nessun testo riconosciuto dalla carta.' }]);
          showToast('OCR carta vini: nessun testo riconosciuto', 'warn');
          return;
        }
        wineListsRef.current.push(joined);
        window.dispatchEvent(new CustomEvent('sommelier:memory:update', { detail: { size: joined.length, parts: wineListsRef.current.length } }));
        if (!options.silent) {
          setChatMsgs(arr => [...arr, { role: 'assistant', text: '📄 Carta vini acquisita. Chiedimi: “un rosso elegante sotto 30€” o “che Barolo consigli?”' }]);
        }
        showToast('Carta vini acquisita ✓', 'success');
        return;
      }

      // === Etichette vino: registrazione opzionale (non Finanze/Spese/Scorte) ===
      if (labels.length) {
        if (!uid) {
          if (!options.silent) setChatMsgs(arr => [...arr, { role:'assistant', text:'⚠️ Non autenticato: impossibile salvare etichette in Vini.' }]);
          showToast('Login richiesto per salvare etichette', 'warn');
        } else {
          for (const L of labels) {
            try {
              const res = await postJSON('/api/vini/ingest', { user_id: uid, wine: L?.wine || null, text: L?.text || '' });
              if (!(res?.ok || res?.inserted === 1) && !options.silent) setChatMsgs(arr => [...arr, { role:'assistant', text:'ℹ️ Vini: nessuna riga inserita' }]);
            } catch (e) {
              if (!options.silent) setChatMsgs(arr => [...arr, { role:'assistant', text:`⚠️ Vini: ${e.message}` }]);
            }
          }
          if (!options.silent) setChatMsgs(arr => [...arr, { role:'assistant', text:'🍷 Etichetta registrata in "Prodotti tipici & Vini".' }]);
          showToast('Etichetta vino registrata ✓', 'success');
        }
        return;
      }

      // === Scontrino/i (workflow SILENZIOSO: nessuna modale/chat) ===
      if (receipts.length || texts.length) {
        const allPurchases = [];
        const meta = { store: '', address:'', place:'', purchaseDate: '', totalPaid: 0, currency: 'EUR' };

        for (const R of receipts) {
          const items = Array.isArray(R?.purchases) ? R.purchases : [];
          allPurchases.push(...items);

          if (!meta.store)        meta.store        = String(R?.meta?.store || R?.store || '');
          if (!meta.address)      meta.address      = String(R?.meta?.address || R?.address || '');
          if (!meta.place)        meta.place        = String(R?.meta?.place || R?.meta?.city || R?.place || R?.city || '');
          if (!meta.purchaseDate) meta.purchaseDate = String(R?.meta?.purchaseDate || R?.purchaseDate || '');
          if (!meta.totalPaid)    meta.totalPaid    = Number(R?.meta?.totalPaid || R?.totalPaid || 0);
          if (!meta.currency)     meta.currency     = String(R?.meta?.currency || R?.currency || 'EUR');
        }

        const isoFromMeta = toISODate(meta.purchaseDate);
        const isoFromOCR  = pickDateFromTexts(texts);
        const isoToday    = new Date().toISOString().slice(0, 10);
        meta.purchaseDate = isoFromMeta || isoFromOCR || isoToday;

        // Normalizza base + filtra amministrative
        const itemsNorm = (allPurchases || []).map(p => ({
          name: String(p.name || '').trim(),
          brand: String(p.brand || '').trim(),
          packs: Number(p.packs || 0),
          unitsPerPack: Number(p.unitsPerPack || 0),
          unitLabel: String(p.unitLabel || ''),
          priceEach: Number(p.priceEach || 0),
          priceTotal: Number(p.priceTotal || 0),
          currency: String(p.currency || 'EUR'),
          expiresAt: String(p.expiresAt || p.expiry || p.scadenza || '')
        })).filter(p => p.name && !shouldDropName(p.name));

        if (!itemsNorm.length) {
          showToast('OCR: nessuna riga acquisto riconosciuta', 'info');
          return;
        }

        // Normalizzazione + prezzi
        async function normalizeViaWebLocal(items, { receiptText = '', store = '' } = {}) {
          const arr = Array.isArray(items) ? items : [];
          if (!arr.length) return arr;

          // Vision → /api/normalize-vision
          try {
            const r = await fetch('/api/normalize-vision', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ items: arr.map(p => ({ name:p.name, brand:p.brand || '' })), receiptText, store, locale:'it-IT', trace:false })
            });
            const raw = await r.text(); let j=null; try{ j=JSON.parse(raw) }catch{}
            if (r.ok && j?.ok && Array.isArray(j.results)) {
              const pad = [...j.results]; while (pad.length < arr.length) pad.push(undefined);
              const merged = [];
              for (let i=0;i<arr.length;i++){
                const p = arr[i]; const r1 = pad[i];
                if (r1?.drop && shouldDropName(p.name)) continue;
                const out = { ...p };
                const nn = String(r1?.out?.normalizedName||'').trim();
                const cb = String(r1?.out?.canonicalBrand||'').trim();
                const upp = Number(r1?.out?.unitsPerPack||0);
                const ul  = String(r1?.out?.unitLabel||'').trim();
                if (nn) out.name = nn; if (cb) out.brand = cb;
                if (upp>0) out.unitsPerPack = upp; if (ul) out.unitLabel = ul;
                merged.push(out);
              }
              if (merged.length) return merged;
            }
          } catch {}

          // Fallback /api/normalize
          try {
            const resp = await fetch('/api/normalize', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ items: arr.map(p => ({ name:p.name, brand:p.brand||'' })), locale:'it-IT', trace:true })
            });
            const raw = await resp.text(); let j=null; try{ j=JSON.parse(raw) }catch{}
            if (!resp.ok || !j?.ok || !Array.isArray(j.results)) return arr;
            const pad = [...j.results]; while (pad.length < arr.length) pad.push(undefined);
            const merged = [];
            for (let i=0;i<arr.length;i++){
              const p = arr[i]; const r1 = pad[i];
              if (r1?.drop && shouldDropName(p.name)) continue;
              const out = { ...p };
              const nn = String(r1?.out?.normalizedName||'').trim();
              const cb = String(r1?.out?.canonicalBrand||'').trim();
              const upp = Number(r1?.out?.unitsPerPack||0);
              const ul  = String(r1?.out?.unitLabel||'').trim();
              if (nn) out.name = nn; if (cb) out.brand = cb;
              if (upp>0) out.unitsPerPack = upp; if (ul) out.unitLabel = ul;
              merged.push(out);
            }
            return merged;
          } catch { return arr; }
        }

        const itemsReady = (await normalizeViaWebLocal(itemsNorm, {
          receiptText: texts.join('\n'),
          store: meta.store
        }))
          .map(normalizeItemForPipelines)
          .map(p => {
            let upp = Math.max(1, Number(p.unitsPerPack||1));
            let ul  = String(p.unitLabel||'').trim() || 'unità';
            if (SUSPECT_UPP.has(upp) || isWeightOrVolumeLabel(ul) || /\b\d+\s*(g|gr|kg|ml|cl|l|lt)\b/i.test(`${p.name} ${p.brand}`)) {
              upp = 1; ul = 'unità';
            }
            return { ...p, unitsPerPack: upp, unitLabel: ul };
          })
          .map(enforceHybridUnitPrice);

        const itemsReadyDedup = dedupeAndFix(itemsReady);

        const totalFromLines = Number(itemsReadyDedup.reduce((s,p)=> s + (Number(p.priceTotal)||0), 0).toFixed(2));
        const ocrTotal = Number(meta.totalPaid || 0);
        meta.totalPaid = ocrTotal > 0 ? ocrTotal : totalFromLines;

        const bucket = guessExpenseBucket(meta.store);
        const storeIsSuper = (bucket !== 'cene-aperitivi' && /\b(supermercat|iper|market|discount|conad|coop|esselunga|carrefour|pam|despar|lidl|md|eurospin|todis|deco|decò|tigre|famila|dok|cra[iì]|penny)\b/i.test(meta.store||''));

        // 🔒 Data sicura
        const purchaseDateSafe =
          (meta.purchaseDate && /^\d{4}-\d{2}-\d{2}$/.test(meta.purchaseDate))
            ? meta.purchaseDate
            : new Date().toISOString().slice(0, 10);

        // 🔗 ID spesa (link Finanze ↔ pagine)
        const receiptId =
          (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
        const linkLabel = `${bucket==='cene-aperitivi'?'Cena/Aperitivo':'Spesa'} ${meta.store || ''} (${purchaseDateSafe})`.trim();
        const linkPath  = `/${bucket==='cene-aperitivi'?'cene-aperitivi':'spese-casa'}?rid=${encodeURIComponent(receiptId)}`;
        const maybeUid = uid || null;

        /* ---- a) Finanze ---- */
        try {
          const finRes = await postJSON('/api/finances/ingest_v2', {
            ...(uid ? { user_id: uid } : {}),
            store: meta.store,
            purchaseDate: purchaseDateSafe,
            payment_method: 'cash',
            card_label: null,
            receipt_id: receiptId,
            link_label: linkLabel,
            link_path: linkPath,
            totalPaid: meta.totalPaid,
            items: itemsReadyDedup,
            insert_lines: true,
            receiptTotalAuthoritative: true
          });
          if (finRes?.ok && (finRes?.finance_head_id || finRes?.inserted || 0) > 0) {
            const stamp = Date.now();
            try {
              localStorage.setItem('__finanze_last_ingest', String(stamp));
              window.dispatchEvent(new CustomEvent('finanze:ingest:done', {
                detail: { count: itemsReadyDedup.length, store: meta.store, stamp, receipt_id: receiptId }
              }));
            } catch {}
            showToast('Finanze aggiornate ✓', 'success');
          } else {
            showToast('Finanze: nessuna riga inserita', 'warn');
          }
        } catch (e) {
          showToast(`Finanze: ${e.message}`, 'error');
        }

        /* ---- b) Spese Casa / Cene & Aperitivi ---- */
        try {
          const payloadCommon = {
            ...(maybeUid ? { user_id: maybeUid } : {}),
            store: meta.store,
            purchaseDate: purchaseDateSafe,
            totalPaid: meta.totalPaid,
            items: itemsReadyDedup,
            receipt_id: receiptId,
            link_label: linkLabel,
            link_path: linkPath,
            receiptTotalAuthoritative: true
          };
          const endpoint = bucket === 'cene-aperitivi' ? '/api/cene-aperitivi/ingest' : '/api/spese-casa/ingest';
          const res = await postJSON(endpoint, payloadCommon);

          if (res?.ok && (res?.inserted || 0) > 0) {
            const evName = bucket === 'cene-aperitivi' ? 'cene:ingest:done' : 'spese:ingest:done';
            try {
              window.dispatchEvent(new CustomEvent(evName, { detail:{ count: itemsReadyDedup.length, receipt_id: receiptId } }));
            } catch {}
            showToast(`${bucket==='cene-aperitivi' ? 'Cene & Aperitivi' : 'Spese Casa'} aggiornate ✓`, 'success');
          } else {
            showToast(`${bucket==='cene-aperitivi' ? 'Cene & Aperitivi' : 'Spese Casa'}: nessuna riga inserita`, 'warn');
          }
        } catch (e) {
          showToast(`${bucket==='cene-aperitivi' ? 'Cene & Aperitivi' : 'Spese Casa'}: ${e.message}`, 'error');
        }

        /* ---- c) Scorte (solo supermercato) ---- */
        if (storeIsSuper && uid) {
          try {
            await postJSON('/api/stock/apply', { user_id: uid, items: itemsReadyDedup });
            try { window.dispatchEvent(new CustomEvent('scorte:updated', { detail:{ count: itemsReadyDedup.length, at: Date.now() } })); } catch {}
            showToast('Scorte aggiornate ✓', 'success');
          } catch (e) {
            showToast(`Scorte: ${e.message}`, 'error');
          }
        }

        // Nessun messaggio in chat/modale: OCR silenzioso completato
        return;
      }

      // Tipo non riconosciuto
      showToast('OCR eseguito, tipo non riconosciuto', 'info');

    } catch (err) {
      console.error('[OCR flow] error', err);
      showToast(`Errore OCR: ${err?.message || err}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  /* =================== Query testo =================== */
async function submitQuery(textParam) {
  const raw = (textParam != null ? String(textParam) : queryText).trim();
  if (!raw || busy) return;
  if (textParam == null) setQueryText('');

  if (!chatOpen) setChatOpen(true);
  setChatMsgs(prev => [...prev, { role: 'user', text: raw }]);
  lastUserIntentRef.current = { text: raw, sommelier: /\b(sommelier|carta (dei )?vini)\b/i.test(raw) };

  if (lastUserIntentRef.current.sommelier && wineListsRef.current.length === 0) {
    setChatMsgs(prev => [...prev, { role:'assistant', text: 'Per consigli mirati, premi <b>OCR</b> e fotografa la <b>carta dei vini</b>.' }]);
    return;
  }

  try {
    setBusy(true);
    // ⬇️ PASSA userId all’agente
    const out = await runBrainQuery(raw, { first: chatMsgs.length === 0, userId: uid });

    // ⬇️ Se l’agente restituisce {text, mono}, usalo direttamente
    let msg;
    if (out && typeof out === 'object' && 'text' in out) {
      msg = { role: 'assistant', text: String(out.text ?? ''), mono: !!out.mono };
    } else {
      msg = renderBrainResponse(out); // fallback vecchio renderer
    }

    setChatMsgs(prev => [...prev, msg]);
    maybeSpeakMessage(msg);
  } catch (err) {
    setChatMsgs(prev => [...prev, { role:'assistant', text: `❌ Errore interrogazione dati: ${err?.message || err}` }]);
  } finally {
    setBusy(false);
  }
}


  /* =================== UI bits =================== */
  const handleFileChange = (ev) => {
    const files = Array.from(ev.target.files || []);
    if (!files.length || busy) return;
    (async () => {
      try {
        setBusy(true);
        // OCR SILENZIOSO dal pulsante 📷
        await handleSmartOCR(files, { silent: true });
      } finally {
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    })();
  };
  const handleSelectOCR = () => { if (!busy) fileInputRef.current?.click(); };

  const handleVoiceText = async (spoken) => {
    const text = String(spoken||'').trim();
    if (!text || busy) return;
    const isSommelier = /\b(sommelier|carta (dei )?vini)\b/i.test(text);
    lastUserIntentRef.current = { text, sommelier: isSommelier };

    // Voce = domanda → apri modale (on-demand)
    if (!chatOpen) setChatOpen(true);
    setChatMsgs(prev => [...prev, { role:'user', text }]);

    if (isSommelier && wineListsRef.current.length === 0) {
      setChatMsgs(prev => [...prev, { role:'assistant', text: '📷 Premi <b>OCR</b> e fotografa la <b>carta dei vini</b>. Non verrà inserito nulla in Finanze/Spese/Scorte.' }]);
      return;
    }
    await submitQuery(text);
  };

  useEffect(() => {
    if (!router.isReady || deepLinkHandledRef.current) return;
    const sp = new URLSearchParams(window.location.search);
    const src  = sp.get('src')  || '';
    const mode = sp.get('mode') || '';
    const q    = sp.get('q')    || '';
    const tts  = sp.get('tts');
    const voiceParam = sp.get('voice') || '';
    const imgParams = sp.getAll('img');
    if (tts === '1') setTtsEnabled(true);
    if (tts === '0') setTtsEnabled(false);
    if (mode === 'voice') speakModeRef.current = true;
    if (voiceParam) {
      const attempt = () => { const found = voicesRef.current.find(v => v.name === voiceParam); if (found) setVoiceId(found.name); };
      attempt(); setTimeout(attempt, 700);
    }
    deepLinkHandledRef.current = true;
    if (src === 'siri') { /* Niente modale auto: solo piccolo avviso in toast */ showToast('Richiesta ricevuta (Siri)', 'info', 1800); }
    (async () => {
      const files = [];
      for (let i=0; i<imgParams.length; i++) {
        const url = imgParams[i];
        try {
          if (url.startsWith('data:')) {
            const [head, b64] = url.split(',');
            const mime = (head.match(/data:(.*?);base64/i)?.[1]) || 'image/jpeg';
            const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            files.push(new File([buf], `siri_${i+1}.jpg`, { type: mime }));
          } else {
            const resp = await fetch(url, { mode:'cors' }); const blob = await resp.blob();
            files.push(new File([blob], `siri_${i+1}.${(blob.type.includes('png')?'png':'jpg')}`, { type: blob.type }));
          }
        } catch {}
      }
      if (files.length) {
        // OCR silenzioso anche da deep-link ?img=
        await handleSmartOCR(files, { silent: true });
      } else if (q) {
        // Domanda → modale on-demand
        await submitQuery(q);
      }
      try {
        const url = new URL(window.location.href);
        ['q','src','mode','tts','voice','img'].forEach(p => url.searchParams.delete(p));
        window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
      } catch {}
    })();
  }, [router.isReady]);

function renderBrainResponse(res) {
  // ⬇️ Nuovo: supporta direttamente {text, mono}
  if (res && typeof res === 'object' && 'text' in res) {
    return { role: 'assistant', text: String(res.text ?? ''), mono: !!res.mono };
  }

  const payload = (res && typeof res === 'object' && 'result' in res) ? res.result : res;
  const kind = payload?.kind;

  const looksLikeInventory =
    kind === 'inventory.snapshot' ||
    (payload && typeof payload === 'object' && Array.isArray(payload.elenco));
  if (looksLikeInventory) {
    const rendered = renderInventorySnapshot(payload);
    return { role: 'assistant', text: rendered.text, mono: true, blocks: rendered.blocks };
  }

  const topList = payload?.top_negozi || payload?.top_stores;
  const looksLikeMonthFinances =
    kind === 'finances.month_summary' ||
    (payload && typeof payload === 'object' &&
      (payload.totale != null || payload.total != null) &&
      Array.isArray(topList));
  if (looksLikeMonthFinances) {
    const totRaw = payload.total ?? payload.totale ?? 0;
    const txs = payload.transactions ?? payload.transazioni ?? 0;
    const top = Array.isArray(topList) ? topList : [];
    const rows = top.map(r => ({ store: r.store || r.nome || r.name || '—', speso: fmtEuro(r.speso ?? r.amount ?? 0) }));
    const header = rows.slice(0,10).map(r => `${r.store}: ${r.speso}`).join('\n');
    const txt =
`📊 Spese del mese
Intervallo: ${payload.intervallo || 'mese corrente'}
Totale: ${fmtEuro(totRaw)} • Transazioni: ${fmtInt(txs)}

${header}${rows.length>10?`\n…(+${rows.length-10})`:''}`;
    return { role: 'assistant', text: txt, mono: true };
  }

  // fallback: stringify
  const text = formatResult(payload ?? res);
  return { role: 'assistant', text, mono: typeof (payload ?? res) !== 'string' };
}

  function renderInventorySnapshot(payload) {
    const list = Array.isArray(payload?.elenco) ? payload.elenco : [];
    const rows = list.map(it => ({ nome: (it.name ?? '').trim() || '—', qty: (it.qty ?? it.quantity ?? it.qta ?? null), pct: clampPct(it.consumed_pct ?? it.consumo_pct ?? it.fill_pct ?? null) }));
    const table = rows.map(r => `${r.nome} — ${r.qty ?? '—'} — ${r.pct!=null?fmtPct(r.pct):'—'}`).join('\n');
    const barsData = rows.filter(r => r.pct != null).sort((a,b)=> (a.pct - b.pct)).slice(0, 10).map(r => ({ label: r.nome, value: r.pct }));
    const svg = svgBars(barsData, { max: 100, unit: '%', bg: '#0b0f14' });
    const text =
`🏠 Scorte (snapshot)
Totale articoli: ${fmtInt(rows.length)}

${table}`;
    return { text, blocks: barsData.length ? [{ svg, caption: 'Consumo stimato (prime 10 voci)' }] : [] };
  }

  return (
    <>
      <Head>
        <title>Home - Jarvis-Assistant</title>
        <meta property="og:title" content="Home - Jarvis-Assistant" />
      </Head>

      {/* Video bg */}
      <video className="bg-video" src="/composizione%201.mp4" autoPlay loop muted playsInline controls={false} preload="auto" disablePictureInPicture controlsList="nodownload noplaybackrate noremoteplayback" aria-hidden="true" />
      <div className="bg-overlay" aria-hidden="true" />

      <main className="home-shell">
        <section className="primary-grid">
          <Link href="/liste-prodotti" className="card-cta card-prodotti animate-card pulse-prodotti sheen">
            <span className="emoji">🛒</span><span className="title">LISTE PRODOTTI</span><span className="hint">Crea e gestisci le tue liste</span>
          </Link>
          <Link href="/finanze" className="card-cta card-finanze animate-card pulse-finanze sheen" style={{ animationDelay: '0.15s' }}>
            <span className="emoji">📊</span><span className="title">FINANZE</span><span className="hint">Entrate, spese e report</span>
          </Link>
        </section>

        <section className="advanced-box">
          <h2>Funzionalità Avanzate</h2>

          <div className="ask-row">
            <input
              className="query-input"
              type="text"
              placeholder='Chiedi a Jarvis… (es. "Quanto ho speso questo mese?" • "Cosa ho a casa?" • "Mi consigli un vino rosso da questa carta?")'
              value={queryText}
              onChange={(ev)=>setQueryText(ev.target.value)}
              onKeyDown={(ev)=> ev.key==='Enter' && submitQuery()}
              disabled={busy}
            />
            <button className="btn-ask" onClick={() => submitQuery()} disabled={busy}>{busy ? '⏳' : '💬 Chiedi'}</button>
          </div>

          <div className="advanced-actions">
            <button className="btn-ocr" onClick={handleSelectOCR} disabled={busy}>{busy ? '⏳' : '📷 OCR'}</button>

            {/* 🔎 Interroga dati → APRE SOLO LA MODALE (no /dashboard) */}
            <button className="btn-manuale" onClick={() => setChatOpen(true)} disabled={busy} title="Apri la modale dati">🔎 Interroga dati</button>

            <button className="btn-manuale" onClick={() => setTtsEnabled(v => !v)} title="Abilita/Disabilita lettura vocale" aria-pressed={ttsEnabled}>
              {ttsEnabled ? '🔊 Lettura vocale: ON' : '🔇 Lettura vocale: OFF'}
            </button>

            <select value={voiceId || ''} onChange={(e) => setVoiceId(e.target.value || null)} className="btn-manuale" title="Seleziona voce" style={{ minWidth: 220 }} disabled={!voices.length}>
              {voices.length === 0 ? (<option value="">(Caricamento voci…)</option>) : (voices.map(v => (<option key={v.name} value={v.name}>{`${v.name} — ${v.lang}`}</option>)))}
            </select>

            <VoiceRecorder buttonClass="btn-vocale" idleLabel="🎤 Comando vocale" recordingLabel="⏹ Stop" onText={handleVoiceText} disabled={busy} />

            <Link href="/prodotti-tipici-vini" className="btn-manuale">🍷 Prodotti tipici & Vini</Link>
          </div>
        </section>
      </main>

      {/* Input OCR nascosto */}
      <input type="file" accept="image/*" capture="environment" multiple ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />

      {/* Toasts non intrusivi */}
      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>

      {/* Chat Modal (ON-DEMAND soltanto) */}
      {chatOpen && (
        <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Chat dati">
          <div style={S.modal}>
            <div style={S.header}>
              <div style={{ fontWeight: 800 }}>💬 Interroga dati</div>
              <button onClick={() => setChatOpen(false)} aria-label="Chiudi" style={S.btnGhost}>✖</button>
            </div>
            <div style={S.body}>
              {chatMsgs.length === 0 && (
                <div style={{ opacity: .85 }}>
                  Inizia chiedendo: “Quanto ho speso questo mese?” •
                  “Che cosa ho a casa?” • “Mi consigli un rosso da questa carta?” (poi premi <b>OCR</b>).
                </div>
              )}
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ display:'grid', justifyContent: m.role === 'user' ? 'end' : 'start' }}>
                  <div style={S.bubble}>{m.mono ? <pre style={S.pre}>{m.text}</pre> : <span dangerouslySetInnerHTML={{ __html: m.text }} />}</div>
                </div>
              ))}
            </div>
            <div style={S.inputRow}>
              <input
                type="text"
                placeholder="Scrivi la tua domanda e premi Invio…"
                onKeyDown={(ev) => !busy && ev.key === 'Enter' && submitQuery(ev.currentTarget.value)}
                disabled={busy}
                style={S.input}
              />
              <button onClick={() => submitQuery()} disabled={busy} style={S.btnPrimary}>{busy ? '⏳' : 'Invia'}</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; pointer-events: none; background: #000; }
        .bg-overlay { position: fixed; inset: 0; z-index: -1; background: rgba(0, 0, 0, 0.35); pointer-events: none; }
        .home-shell { min-height: 100vh; display: grid; grid-template-rows: auto auto; align-items: start; justify-items: center; gap: 1.25rem; padding: 2rem 1rem 3rem; color: #fff; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
        .primary-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 1rem; width: min(1100px, 96vw); }
        @media (max-width: 760px) { .primary-grid { grid-template-columns: 1fr; } }
        .card-cta { display: grid; align-content: center; justify-items: center; gap: 0.25rem; text-decoration: none; color: #fff; border-radius: 18px; padding: clamp(1.1rem, 3vw, 1.7rem); min-height: clamp(130px, 22vw, 220px); transition: transform 120ms ease, box-shadow 200ms ease, border-color 200ms ease; position: relative; overflow: hidden; isolation: isolate; }
        .card-cta .emoji { font-size: clamp(1.4rem, 4vw, 2rem); line-height: 1; }
        .card-cta .title { font-weight: 800; font-size: clamp(1.1rem, 2.8vw, 1.6rem); }
        .card-cta .hint  { opacity: .85; font-size: clamp(.85rem, 2vw, .95rem); }
        .card-cta:hover { transform: translateY(-2px) scale(1.02); }
        .card-prodotti { background: linear-gradient(145deg, rgba(99,102,241,0.85), rgba(236,72,153,0.85)); border: 1px solid rgba(236,72,153,0.35); }
        .card-finanze  { background: linear-gradient(145deg, rgba(6,182,212,0.85), rgba(59,130,246,0.85)); border: 1px solid rgba(59,130,246,0.35); }
        .animate-card { animation: cardGlow 3.2s ease-in-out infinite; }
        @keyframes cardGlow { 0% { box-shadow: 0 0 15px rgba(99,102,241, 0.4); } 50% { box-shadow: 0 0 35px rgba(6,182,212, 0.85); } 100% { box-shadow: 0 0 15px rgba(99,102,241, 0.4); } }
        .advanced-box { width: min(1100px, 96vw); margin-top: .5rem; background: rgba(0, 0, 0, 0.55); border-radius: 16px; padding: 1rem; }
        .advanced-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
        .ask-row { display: grid; grid-template-columns: 1fr auto; gap: .5rem; margin-bottom: .6rem; }
        .query-input { width: 100%; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: .55rem; padding: .52rem .7rem; color: #fff; outline: none; }
        .query-input::placeholder { color: rgba(255,255,255,0.65); }
        .btn-ask { background: linear-gradient(135deg, #6366f1, #06b6d4); border: 1px solid rgba(255,255,255,0.2); border-radius: .55rem; padding: .45rem .7rem; color: #fff; cursor: pointer; }
        .btn-vocale, .btn-ocr, .btn-manuale { display: inline-flex; align-items: center; justify-content: center; padding: .45rem .7rem; border-radius: .55rem; cursor: pointer; color: #fff; text-decoration: none; }
        .btn-vocale { background: #6366f1; }
        .btn-ocr { background: #06b6d4; }
        .btn-manuale { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); }
        .btn-vocale:hover, .btn-ocr:hover, .btn-manuale:hover { opacity: .9; }

        /* Toast */
        .toasts { position: fixed; top: 14px; right: 14px; display: grid; gap: 8px; z-index: 10000; }
        .toast { padding: .5rem .7rem; border-radius: .55rem; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); color:#fff; backdrop-filter: blur(4px); }
        .toast.success { border-color: rgba(34,197,94,.5); }
        .toast.warn { border-color: rgba(234,179,8,.6); }
        .toast.error { border-color: rgba(239,68,68,.6); }
      `}</style>
    </>
  );
};

/* ---------- Stili inline per il modale ---------- */
const S = {
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'grid', placeItems:'center', zIndex:9999, backdropFilter:'blur(2px)' },
  modal:{ width:'min(920px, 92vw)', maxHeight:'82vh', background:'rgba(0,0,0,.85)', border:'1px solid rgba(255,255,255,.18)', borderRadius:12, display:'grid', gridTemplateRows:'auto 1fr auto', overflow:'hidden', boxShadow:'0 12px 30px rgba(0,0,0,.45)' },
  header:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'linear-gradient(145deg, rgba(99,102,241,.28), rgba(6,182,212,.22))', borderBottom:'1px solid rgba(255,255,255,.16)' },
  btnGhost:{ background:'transparent', color:'#fff', border:'1px solid rgba(255,255,255,.25)', borderRadius:10, padding:'4px 8px', cursor:'pointer' },
  body:{ padding:'10px 12px', overflow:'auto', display:'grid', gap:8, background:'radial-gradient(1200px 500px at 10% 0%, rgba(236,72,153,.05), transparent 60%), radial-gradient(800px 400px at 100% 100%, rgba(59,130,246,.06), transparent 60%), rgba(0,0,0,.15)' },
  bubble:{ maxWidth:'78ch', whiteSpace:'pre-wrap', wordBreak:'break-word', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.18)', padding:'8px 10px', borderRadius:12, color:'#fff' },
  pre:{ margin:0, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
  inputRow:{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,.16)', background:'rgba(0,0,0,.35)' },
  input:{ width:'100%', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'10px 12px', color:'#fff', outline:'none' },
  btnPrimary:{ background:'#6366f1', border:0, borderRadius:10, padding:'10px 12px', color:'#fff', cursor:'pointer' },
};

export default withAuth(Home);
