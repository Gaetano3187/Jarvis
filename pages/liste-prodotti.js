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
  'uova','acqua','birra','vino','tortillas','piadine','affettati'
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

/* ---------------- parser liste ---------------- */
function parseLinesToItems(text) {
  const chunks = String(text || '')
    .split(/[\n,;]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  const items = [];
  for (const raw of chunks) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;

    let qty = 1;
    const mQty = s.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
    let rest = s;
    if (mQty) {
      qty = Number(String(mQty[1]).replace(',', '.')) || 1;
      rest = mQty[2].trim();
    }

    let name = rest, brand = '';
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

    if (name) {
      items.push({
        id: 'tmp-' + Math.random().toString(36).slice(2),
        name,
        brand: brand || '',
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
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

  // parole chiave intorno alla data
  const KW = ['scad','scadenza','scade','entro','consumare','preferibilmente','da consumarsi','da consumare'];
  const DATE_RE = /((?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(?:\d{1,2}\s+[a-zà-ú]+\s+\d{2,4}))/i;

  const tokensArr = s.split(/\s+/);
  for (let i = 0; i < tokensArr.length; i++) {
    const win = tokensArr.slice(Math.max(0, i - 10), i + 10).join(' ');
    const dm = win.match(DATE_RE);
    if (!dm) continue;

    const hasKW = KW.some(k => win.includes(k));
    // non obbligatoria ma aiuta a filtrare falsi positivi; se non ci sono parole chiave, proviamo comunque grazie al match del prodotto
    const iso = toISODate(dm[1]);
    if (!iso) continue;

    // 1) lessico (con sinonimi basilari)
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

    // 2) prodotti noti
    if (!chosen && Array.isArray(knownProducts) && knownProducts.length) {
      for (const kp of knownProducts) {
        const k = norm(kp);
        if (k && win.includes(k)) { chosen = kp; break; }
      }
    }

    // 3) parole chiave obbligatorie se non abbiamo match prodotto
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

/* ------------- Prompt builder: scontrino ------------- */
function buildOcrAssistantPrompt(ocrText, lexicon = []) {
  const LEX = Array.isArray(lexicon) && lexicon.length ? lexicon.join(', ') : 'latte, pane, pasta, uova, ...';
  return [
    'Sei Jarvis, estrattore strutturato di scontrini.',
    'DEVI rispondere SOLO in JSON con questo schema ESATTO:',
    '{ "purchases":[{ "name":"", "brand":"", "qty":1, "expiresAt":"" }], "expiries":[], "stock":[] }',
    '',
    'REGOLE:',
    '- Estrai SOLO righe che indicano prodotti acquistati.',
    '- IGNORA intestazioni, reparti, subtotali, TOTALE, IVA, sconti globali, contanti/bancomat, resto, numeri ordine, casse.',
    '- Normalizza i nomi usando questo lessico come guida (se simili, scegli la forma del lessico):',
    LEX,
    '- brand: stringa breve se deducibile (es. “Barilla”, “Parmalat”), altrimenti "".',
    '- qty: quantità acquistata. Se non specificata, 1. Per pesi (es. 1,20 kg) usa qty numerica (es. 1.2).',
    '- expiresAt: YYYY-MM-DD se presente in chiaro; altrimenti "".',
    '- Niente commenti, niente testo fuori dal JSON.',
    '',
    'ESEMPI:',
    'Input OCR:',
    '----------------------------------------',
    'ESSELUNGA - SCONTRINO FISCALE',
    'PARMALAT LATTE P.S. 2 x 1,29',
    'BARILLA SPAGHETTI 500G 1,09',
    'UOVA FRESCHE 10PZ 2,49',
    'TOTALE EURO 6,16',
    'PAGATO BANCOMAT',
    '----------------------------------------',
    'Output JSON:',
    '{ "purchases":[',
    '  { "name":"latte", "brand":"Parmalat", "qty":2, "expiresAt":"" },',
    '  { "name":"spaghetti", "brand":"Barilla", "qty":1, "expiresAt":"" },',
    '  { "name":"uova", "brand":"", "qty":10, "expiresAt":"" }',
    '], "expiries":[], "stock":[] }',
    '',
    'Input OCR:',
    '----------------------------------------',
    'COOP',
    'PASSATA POMODORO MUTTI 0,99',
    'RISO CARNAROLI 1KG 2,49',
    'MELE GOLDEN 1,20 KG x 1,69',
    'SCONTO -0,30',
    'TOTALE 4,87',
    'CONTANTI 5,00 RESTO 0,13',
    '----------------------------------------',
    'Output JSON:',
    '{ "purchases":[',
    '  { "name":"passata di pomodoro", "brand":"Mutti", "qty":1, "expiresAt":"" },',
    '  { "name":"riso", "brand":"", "qty":1, "expiresAt":"" },',
    '  { "name":"mele", "brand":"", "qty":1.2, "expiresAt":"" }',
    '], "expiries":[], "stock":[] }',
    '',
    'Input OCR:',
    '----------------------------------------',
    'IPER',
    'YOGURT FRAGOLA MULLER 4X125 1,99',
    'BURRO LURPAK 250G 2,39',
    'LATTE PS 1L SCAD 15/07/2025 1,29',
    'TOTALE 5,67',
    '----------------------------------------',
    'Output JSON:',
    '{ "purchases":['
    ,'  { "name":"yogurt", "brand":"Muller", "qty":4, "expiresAt":"" },'
    ,'  { "name":"burro", "brand":"Lurpak", "qty":1, "expiresAt":"" },'
    ,'  { "name":"latte", "brand":"", "qty":1, "expiresAt":"2025-07-15" }'
    ,'], "expiries":[{"name":"latte", "expiresAt":"2025-07-15"}], "stock":[] }',
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
    'Input:',
    '  Prodotto: "burro"',
    '  Testo OCR: "BURRO 250g LURPAK da consumarsi preferibilmente entro 12/08/26"',
    'Output:',
    '{ "expiries":[{ "name":"burro", "expiresAt":"2026-08-12" }] }',
    '',
    'ADESSO ESTRARRE DAL TESTO OCR QUI SOTTO.',
    '--- TESTO OCR INIZIO ---',
    ocrText,
    '--- TESTO OCR FINE ---'
  ].join('\n');
}

/* ------------- Fallback parser locale (potenziato) ------------- */
function parseReceiptPurchases(ocrText) {
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const ignore = /(totale|iva|bancomat|contanti|resto|scontrino|cassa|cliente|sconto|subtotale)/i;

  const out = [];
  for (let raw of lines) {
    if (ignore.test(raw)) continue;
    let qty = 1, brand = '', name = raw;

    // pack espressi come "4x", "x4", "4 x 125", "4X125"
    const mX = raw.match(/(\d+)\s*[xX]\s*(\d+)?/);
    if (mX) qty = Math.max(qty, Number(mX[1]||1));

    // 10 pz / 10 pezzi / 10 bott / 10 buste / 10 conf / 10 uova
    const mPz = raw.match(/(\d+)\s*(?:pz|pezzi|bott|buste|conf(?:e(?:zioni)?)?|uova|latte|yogurt|vasetti|barrette)\b/i);
    if (mPz) qty = Math.max(qty, Number(mPz[1]||1));

    // leading qty "2 latte" o "1,20 kg mele"
    const mQty = raw.match(/^(\d+(?:[.,]\d+)?)\s*[xX]?\s+(.*)$/);
    if (mQty) { qty = Number(String(mQty[1]).replace(',','.')) || qty; name = mQty[2]; }

    // pesi/volumi convertiti a qty float
    const mWeight = raw.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|cl)\b/i);
    if (mWeight) qty = Number(String(mWeight[1]).replace(',','.')) || qty;

    // brand: ultima parola capitalizzata
    const parts = name.split(' ');
    if (parts.length>1 && /^[A-ZÀ-ÖØ-Þ]/.test(parts[parts.length-1])) {
      brand = parts.pop();
      name = parts.join(' ');
    }

    name = name
      .replace(/\b(\d+[gG]|kg|ml|l|cl)\b/g,'')
      .replace(/\s{2,}/g,' ')
      .trim()
      .toLowerCase();

    // normalizzazioni basilari
    name = name
      .replace(/\buht\b/g,'') // rimane "latte"
      .replace(/spaghetti|penne|fusilli|rigatoni/, 'pasta')
      .replace(/passata\b.*pomodoro|passata\b/, 'passata di pomodoro')
      .replace(/latte\b.*/, 'latte')
      .replace(/yogurt\b.*/, 'yogurt')
      .replace(/\bcaffe\b/g,'caffè');

    if (!name || name.length<2) continue;
    out.push({ name, brand: brand || '', qty: Math.max(1, qty), expiresAt: '' });
  }
  return out;
}

/* ---------------- component ---------------- */
export default function ListeProdotti() {
  const [currentList, setCurrentList] = useState(LIST_TYPES.SUPERMARKET);

  // Liste
  const [lists, setLists] = useState({
    [LIST_TYPES.SUPERMARKET]: [],
    [LIST_TYPES.ONLINE]: [],
  });

  const [form, setForm] = useState({ name: '', brand: '', qty: '1' });

  // Scorte & critici
  // Estendo il record scorta: {name, brand, qty, expiresAt?, baselineQty?, lastRestockAt?}
  const [stock, setStock] = useState([]);
  const [critical, setCritical] = useState([]);

  // Stato UI
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // Vocale: LISTA
  theMediaWorkaround();
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // Vocale: SCADENZE (session dedicata)
  const expMediaRef = useRef(null);
  const expChunksRef = useRef([]);
  const expStreamRef = useRef(null);
  const [expRecBusy, setExpRecBusy] = useState(false);

  // OCR input (scontrini)
  const ocrInputRef = useRef(null);

  // OCR scadenza per riga
  const rowOcrInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);

  const curItems = lists[currentList] || [];

  /* --------------- derivati --------------- */
  useEffect(() => {
    const today = new Date();
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    const twoDays = 2 * 24 * 60 * 60 * 1000;

    const crit = stock.filter((p) => {
      const qty = Number(p.qty || 0);
      const baseline = Number(p.baselineQty || 0);
      const last = p.lastRestockAt ? new Date(p.lastRestockAt) : null;

      const nearExp = p.expiresAt ? ((new Date(p.expiresAt)) - today) <= tenDays : false;

      // Solo per la parte "consumo/quantità" richiediamo che siano passati >2 giorni dall'ultimo carico
      const oldEnough = last ? (today - last) > twoDays : false;

      const lowAbsolute = qty < 2; // confezioni sotto 2
      const lowPercent = baseline > 0 ? (qty <= baseline * 0.2) : false; // <=20% della baseline

      return nearExp || (oldEnough && (lowAbsolute || lowPercent));
    });

    setCritical(crit);
  }, [stock]);

  function showToast(msg, type='info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  /* ---------------- LISTE: add/remove/inc/Comprato ---------------- */
  function addManualItem(e) {
    e.preventDefault();
    const qty = Math.max(1, Number(String(form.qty).replace(',', '.')) || 1);
    const name = form.name.trim();
    const brand = form.brand.trim();
    if (!name) return;

    setLists(prev => {
      const next = { ...prev };
      const items = [...(prev[currentList] || [])];
      const idx = items.findIndex(i => i.name.toLowerCase() === name.toLowerCase() && (i.brand||'').toLowerCase() === brand.toLowerCase());
      if (idx >= 0) items[idx] = { ...items[idx], qty: Number(items[idx].qty || 0) + qty };
      else items.push({ id: 'tmp-' + Math.random().toString(36).slice(2), name, brand, qty, purchased: false });
      next[currentList] = items;
      return next;
    });

    setForm({ name: '', brand: '', qty: '1' });
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

  function markBought(id) {
    const item = (lists[currentList] || []).find(i => i.id === id);
    setLists(prev => {
      const next = { ...prev };
      next[currentList] = (prev[currentList] || []).map(i => {
        if (i.id !== id) return i;
        const newQty = Math.max(0, Number(i.qty || 0) - 1);
        return { ...i, qty: newQty, purchased: true };
      }).filter(i => i.qty > 0);
      return next;
    });
    if (item) {
      setStock(prev => {
        const arr = [...prev];
        const todayISO = new Date().toISOString().slice(0,10);
        const idx = arr.findIndex(s => isSimilar(s.name, item.name) && (!item.brand || isSimilar(s.brand||'', item.brand)));
        if (idx >= 0) {
          const newQty = Number(arr[idx].qty || 0) + 1;
          arr[idx] = {
            ...arr[idx],
            qty: newQty,
            baselineQty: newQty,            // baseline aggiornata al nuovo carico
            lastRestockAt: todayISO
          };
        } else {
          arr.unshift({ name: item.name, brand: item.brand, qty: 1, expiresAt: '', baselineQty: 1, lastRestockAt: todayISO });
        }
        return arr;
      });
    }
  }

  /* ---------------- Vocale: LISTA ---------------- */
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

      // assistant (estrazione strutturata) + fallback locale
      let appended = false;
      try {
        const payload = {
          prompt: [
            'Sei Jarvis. Capisci una LISTA SPESA. Rispondi SOLO JSON:',
            '{ "items":[{ "name":"latte","brand":"Parmalat","qty":2 }, ...] }',
            'Se manca brand metti stringa vuota, qty default 1.',
            'Voci comuni: ' + GROCERY_LEXICON.join(', '),
            'Testo:', text
          ].join('\n'),
        };
        const r = await timeoutFetch(API_ASSISTANT_TEXT, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
        }, 25000);
        const safe = await readJsonSafe(r);
        const answer = safe?.answer || safe?.data || safe;
        if (DEBUG) console.log('[Assistant list] raw answer:', typeof answer==='string'?answer:JSON.stringify(answer,null,2));
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
                qty: Math.max(1, Number(raw.qty||1)),
                purchased: false,
              };
              if (!it.name) continue;
              const idx = existing.findIndex(i => i.name.toLowerCase() === it.name.toLowerCase() && (i.brand||'').toLowerCase() === it.brand.toLowerCase());
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
              const idx = existing.findIndex(i => i.name.toLowerCase() === it.name.toLowerCase() && (i.brand||'').toLowerCase() === (it.brand||'').toLowerCase());
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

  /* ---------------- Vocale: SCADENZE ---------------- */
  async function startVoiceExpiry() {
    if (expRecBusy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      expStreamRef.current = stream;
      expMediaRef.current = new MediaRecorder(stream);
      expChunksRef.current = [];
      expMediaRef.current.ondataavailable = (e) => { if (e.data?.size) expChunksRef.current.push(e.data); };
      expMediaRef.current.onstop = processVoiceExpiry;
      expMediaRef.current.start();
      setExpRecBusy(true);
      setTimeout(() => { try { if (expMediaRef.current && expMediaRef.current.state === 'recording') expMediaRef.current.stop(); } catch {} }, 12000);
    } catch {
      alert('Microfono non disponibile');
    }
  }
  function stopVoiceExpiry() { try { expMediaRef.current?.stop(); } catch {} }

  async function processVoiceExpiry() {
    const blob = new Blob(expChunksRef.current, { type: 'audio/webm' });
    const fd = new FormData(); fd.append('audio', blob, 'expiry.webm');
    try {
      setBusy(true);
      const res = await timeoutFetch('/api/stt', { method:'POST', body: fd }, 25000);
      const { text } = await res.json();
      if (DEBUG) console.log('[STT expiry] text:', text);

      const pairs = parseExpiryPairs(
        text || '',
        GROCERY_LEXICON,
        stock.map(s => s.name)
      );
      if (DEBUG) console.log('[STT expiry] pairs:', pairs);

      if (!pairs.length) { showToast('Nessuna scadenza trovata', 'err'); return; }
      let hit = 0;
      setStock(prev => {
        const arr = [...prev];
        for (const p of pairs) {
          const idx = arr.findIndex(s => isSimilar(s.name, p.name));
          if (idx >= 0) { arr[idx] = { ...arr[idx], expiresAt: p.expiresAt || arr[idx].expiresAt }; hit++; }
        }
        return arr;
      });
      showToast(hit ? `Aggiornate ${hit} scadenze ✓` : 'Nessun prodotto corrispondente', hit ? 'ok' : 'err');
    } finally {
      setBusy(false);
      setExpRecBusy(false);
      try { expStreamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      expMediaRef.current = null;
      expStreamRef.current = null;
      expChunksRef.current = [];
    }
  }

  /* ----- OCR: funzioni supporto decremento su entrambe le liste ----- */
  function decrementAcrossBothLists(prevLists, purchases) {
    const next = { ...prevLists };
    const decList = (listKey) => {
      const arr = [...(next[listKey] || [])];
      for (const p of purchases) {
        const dec = Math.max(1, Number(p.qty || 1));
        const idx = arr.findIndex(i => isSimilar(i.name, p.name) && (!p.brand || isSimilar(i.brand || '', p.brand || '')));
        if (idx >= 0) {
          const newQty = Math.max(0, Number(arr[idx].qty || 0) - dec);
          arr[idx] = { ...arr[idx], qty: newQty, purchased: true };
        }
      }
      next[listKey] = arr.filter(i => Number(i.qty || 0) > 0 || !i.purchased);
    };
    decList(LIST_TYPES.SUPERMARKET);
    decList(LIST_TYPES.ONLINE);
    return next;
  }

  /* ---------------- OCR: scontrini (usa /api/ocr + /api/assistant) ---------------- */
  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      setBusy(true);

      // 1) OCR testo dallo scontrino (usa il tuo endpoint esistente /api/ocr con campo "images")
      const fdOcr = new FormData();
      files.forEach((f) => fdOcr.append('images', f));
      const ocrRes = await timeoutFetch(API_OCR, { method: 'POST', body: fdOcr }, 40000);
      const ocrJson = await readJsonSafe(ocrRes);
      if (!ocrJson.ok) throw new Error(ocrJson.error || `HTTP ${ocrRes.status}`);
      const ocrText = String(ocrJson?.text || '').trim();
      if (!ocrText) throw new Error('Risposta vuota dal servizio OCR');

      // 2) Chiedi all’assistente l’estrazione strutturata
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

      // fallback locale se vuoto
      if (!purchases.length) purchases = parseReceiptPurchases(ocrText);

      // 3) Aggiorna liste (decremento degli acquistati su ENTRAMBE le liste)
      if (purchases.length) {
        setLists(prev => decrementAcrossBothLists(prev, purchases));
        // aggiorna scorte (no scadenze qui) + baseline & lastRestockAt
        setStock(prev => {
          const arr = [...prev];
          const todayISO = new Date().toISOString().slice(0,10);
          for (const p of purchases) {
            const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
            const incQty = Math.max(1, Number(p.qty||1));
            if (idx >= 0) {
              const newQty = Number(arr[idx].qty || 0) + incQty;
              arr[idx] = {
                ...arr[idx],
                qty: newQty,
                baselineQty: newQty,     // baseline aggiornata al nuovo carico
                lastRestockAt: todayISO  // data carico
              };
            } else {
              arr.unshift({
                name: p.name, brand: p.brand || '',
                qty: incQty,
                expiresAt: '',
                baselineQty: incQty,
                lastRestockAt: todayISO
              });
            }
          }
          return arr;
        });
        // best-effort finanze
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

  /* ---------------- Modifica / Elimina scorte ---------------- */
  function editStockRow(i) {
    const it = stock[i];
    if (!it) return;
    const name = prompt('Nome prodotto:', it.name);
    if (name == null || !name.trim()) return;
    const brand = prompt('Marca (opzionale):', it.brand || '');
    if (brand == null) return;
    const qtyStr = prompt('Quantità:', String(it.qty ?? 0));
    if (qtyStr == null) return;
    const qty = Math.max(0, Number(String(qtyStr).replace(',','.')) || 0);
    const expStr = prompt('Scadenza (YYYY-MM-DD) opzionale:', it.expiresAt || '');
    const ex = expStr ? toISODate(expStr) : '';

    setStock(prev => {
      const arr = [...prev];
      arr[i] = {
        ...arr[i],
        name: name.trim(),
        brand: (brand||'').trim(),
        qty,
        expiresAt: ex || ''
      };
      // se l’utente modifica la quantità manualmente potremmo voler aggiornare baseline?
      // Non lo faccio automaticamente per non falsare il consumo. Se vuoi: arr[i].baselineQty = Math.max(arr[i].baselineQty||0, qty);
      return arr;
    });
  }

  function deleteStockRow(i) {
    const it = stock[i];
    if (!it) return;
    if (!confirm(`Eliminare "${it.name}${it.brand?` (${it.brand})`:''}" dalle scorte?`)) return;
    setStock(prev => prev.filter((_, idx) => idx !== i));
  }

  /* ---------------- OCR scadenza per riga (usa /api/ocr + /api/assistant) ---------------- */
  function openRowOcr(idx) {
    setTargetRowIdx(idx);
    rowOcrInputRef.current?.click();
  }
  async function handleRowOcrChange(files) {
    if (targetRowIdx == null || !files?.length) return;
    const row = stock[targetRowIdx];
    try {
      setBusy(true);

      // 1) OCR immagine etichetta
      const fd = new FormData();
      files.forEach((f)=>fd.append('images', f));
      const ocrRes = await timeoutFetch(API_OCR, { method:'POST', body: fd }, 30000);
      const ocrJson = await readJsonSafe(ocrRes);
      if (!ocrJson.ok) throw new Error(ocrJson.error || `HTTP ${ocrRes.status}`);
      const ocrText = String(ocrJson?.text || '').trim();
      if (!ocrText) throw new Error('Risposta vuota dal servizio OCR');

      // 2) Assistant per scadenza singola
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

          {/* Comandi Lista (solo voce per aggiungere alla lista) */}
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
                        <div style={styles.itemBrand}>{it.brand || '—'}</div>
                      </div>
                    </div>
                    <div style={styles.itemActions}>
                      <button
                        title="Segna comprato"
                        onClick={() => markBought(it.id)}
                        style={it.purchased ? styles.actionSuccess : styles.actionDanger}
                      >
                        {it.purchased ? '✔ Comprato' : 'Comprato'}
                      </button>
                      <div style={{display:'flex', gap:6}}>
                        <button title="Diminuisci quantità" onClick={() => incQty(it.id, -1)} style={styles.actionGhost}>−</button>
                        <button title="Aumenta quantità" onClick={() => incQty(it.id, +1)} style={styles.actionGhost}>＋</button>
                      </div>
                      <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.actionGhostDanger}>🗑 Elimina</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form aggiunta manuale */}
          <div style={styles.sectionLarge}>
            <h3 style={styles.h3}>Aggiungi prodotto</h3>
            <form onSubmit={addManualItem} style={styles.formRow}>
              <input placeholder="Prodotto (es. latte)" value={form.name}
                     onChange={e => setForm(f => ({...f, name: e.target.value}))} style={styles.input} required />
              <input placeholder="Marca (es. Parmalat)" value={form.brand}
                     onChange={e => setForm(f => ({...f, brand: e.target.value}))} style={styles.input} />
              <input placeholder="Q.tà" inputMode="decimal" value={form.qty}
                     onChange={e => setForm(f => ({...f, qty: e.target.value}))} style={{...styles.input, width: 100}} required />
              <button style={styles.primaryBtn} disabled={busy}>Aggiungi alla lista</button>
            </form>
            <p style={{opacity:.8, marginTop: 6}}>
              Suggerimenti voce: “2 latte parmalat; 3 pasta barilla; uova”.
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
                    {p.name} {p.brand ? `(${p.brand})` : ''} — Q.tà: {p.qty}
                    {p.expiresAt ? ` — Scadenza: ${new Date(p.expiresAt).toLocaleDateString('it-IT')}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Stato scorte + (tasti OCR/Vocale scadenze affianco) */}
          <div style={styles.sectionXL}>
            <div style={styles.scorteHeader}>
              <h3 style={{...styles.h3, marginBottom:0}}>📊 Stato Scorte</h3>
              <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                {!expRecBusy ? (
                  <button onClick={startVoiceExpiry} style={styles.voiceBtnSmall} disabled={busy}>🎙 Vocale Scadenze</button>
                ) : (
                  <button onClick={stopVoiceExpiry} style={styles.voiceBtnSmallStop}>⏹️ Stop Vocale</button>
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
                    <th style={styles.th}>Q.tà</th>
                    <th style={styles.th}>Scadenza</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{s.name}</td>
                      <td style={styles.td}>{s.brand || '-'}</td>
                      <td style={styles.td}>{s.qty}</td>
                      <td style={styles.td}>{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('it-IT') : '-'}</td>
                      <td style={styles.td}>
                        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                          <button onClick={()=>openRowOcr(i)} style={styles.ocrInlineBtn} disabled={busy}>📷 OCR</button>
                          <button onClick={()=>editStockRow(i)} style={styles.actionGhost}>✎ Modifica</button>
                          <button onClick={()=>deleteStockRow(i)} style={styles.actionGhostDanger}>🗑 Elimina</button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
              Dillo così: “il latte scade il 15/07/2025 il burro il 12/08/2026 la passata di pomodoro scade il 10 giugno 2025”.
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
        </div>
      </div>
    </>
  );
}

/** Piccolo workaround per evitare warning su più MediaRecorder in certi browser */
function theMediaWorkaround(){}

/* ---------------- styles ---------------- */
const styles = {
  page: {
    width: '100%', minHeight: '100vh', background: '#0f172a',
    padding: 34, display: 'flex', alignItems: 'center', justifyContent:'center', color:'#fff',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
  },
  card: { width:'100%', maxWidth: 1000, background:'rgba(0,0,0,.6)', borderRadius: 16, padding: 26, boxShadow: '0 6px 16px rgba(0,0,0,.3)' },
  headerRow: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 },
  homeBtn: { background:'#6366f1', color:'#fff', padding:'8px 12px', borderRadius:10, textDecoration:'none' },

  switchRow: { display:'flex', gap:12, margin: '18px 0 12px' },
  switchBtn: { background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer' },
  switchBtnActive: { background:'#06b6d4', border:'0', color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },

  toolsRow: { display:'flex', flexWrap:'wrap', gap:12, margin:'14px 0 6px' },

  voiceBtn: { background:'#6366f1', border:0, color:'#fff', padding:'10px 14px', borderRadius:12, cursor:'pointer', fontWeight:800 },

  sectionLarge: { marginTop: 36, marginBottom: 10 },
  sectionXL: { marginTop: 46, marginBottom: 12 },
  h3: { margin:'6px 0 14px' },

  listGrid: { display:'flex', flexDirection:'column', gap:14 },
  itemRow: {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.12)',
    borderRadius:12, padding:'10px 12px'
  },
  itemMain: { display:'flex', alignItems:'center', gap:12 },
  qtyBadge: { minWidth:36, height:36, borderRadius:12, background:'rgba(99,102,241,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800 },
  itemName: { fontSize:16, fontWeight:700 },
  itemBrand: { fontSize:12, opacity:.8 },

  itemActions: { display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'flex-end' },
  actionSuccess: { background:'#16a34a', border:0, color:'#fff', padding:'8px 10px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  actionDanger: { background:'#ef4444', border:0, color:'#fff', padding:'8px 10px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  actionGhost: { background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)', color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },
  actionGhostDanger: { background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.6)', color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },

  formRow: { display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' },
  input: {
    padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)',
    background: 'rgba(255,255,255,.06)', color: '#fff', minWidth: 200
  },
  primaryBtn: { background:'#16a34a', border:0, color:'#fff', padding:'10px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },

  table: { width:'100%', borderCollapse:'collapse', background:'rgba(255,255,255,.04)', borderRadius:12, overflow:'hidden' },
  th: { textAlign:'left', padding:'10px', borderBottom:'1px solid rgba(255,255,255,.12)' },
  td: { padding:'10px', borderBottom:'1px solid rgba(255,255,255,.08)' },

  scorteHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  voiceBtnSmall: { background:'#6366f1', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },
  voiceBtnSmallStop: { background:'#ef4444', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  ocrBtnSmall: { background:'#06b6d4', border:0, color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  ocrInlineBtn: { background:'rgba(6,182,212,.15)', border:'1px solid rgba(6,182,212,.6)', color:'#e0fbff', padding:'6px 10px', borderRadius:10, cursor:'pointer', fontWeight:700 }
};
