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

/* ----------------- Lessico supermercato (esteso) ----------------- */
const GROCERY_LEXICON = [
  // Alimentari base
  'latte','latte zymil','yogurt','burro','mozzarella','ricotta','parmigiano','grana padano','formaggio spalmabile',
  'pane','pasta','spaghetti','penne','riso','farina','zucchero','sale','olio evo','olio di semi','aceto','passata di pomodoro','pelati',
  'biscotti','cereali','fette biscottate','marmellata','nutella','caffè','the','tè',
  'pollo','petto di pollo','bistecche','tritato','prosciutto','tonno in scatola','salmone',
  'piselli surgelati','spinaci surgelati','patatine surgelate','gelato',
  'uova','acqua','birra','vino','tortillas','piadine','affettati',
  // Casa & igiene
  'detersivo','detersivo piatti','detersivo lavatrice','ammorbidente','candeggina','spugne','carta igienica','scottex','sacchetti immondizia',
  'shampoo','bagnoschiuma','sapone','spazzolino','dentifricio','rasoi','deodorante','carta casa','asciugatutto',
  // Manutenzioni / fai da te
  'lampadine','pile','batterie','nastro isolante','cacciaviti','viti','chiodi','silicone','vernice',
  // Beverage
  'bibite','succo','tè freddo','energy drink','acqua frizzante','acqua naturale'
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

function unitsFrom(packs, perPack){ 
  const P = Math.max(0, Number(packs||0));
  const U = Math.max(1, Number(perPack||1));
  return P * U;
}
function daysBetween(aISO, bISO){
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  return Math.max(1, Math.round((b - a) / (24*60*60*1000)));
}

/* ---------------- parser liste (vocale / manuale) ---------------- */
function parseLinesToItems(text) {
  const chunks = String(text || '')
    .split(/[\n,;]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  const items = [];
  for (const raw of chunks) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;

    let packs = 1;
    let perPack = 1;

    const mQtyLeading = s.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
    let rest = s;
    if (mQtyLeading) {
      packs = Math.max(1, Math.round(Number(String(mQtyLeading[1]).replace(',', '.')) || 1));
      rest = mQtyLeading[2].trim();
    }

    const perPackHints = [
      /(\d+)\s*(?:pz|pezzi|bottiglie|flaconi|lattine)\b/i,
      /(?:x|×)\s*(\d+)\b/i,
      /\b(\d+)\s*(?:x|×)\b/i,
      /confezione\s*da\s*(\d+)/i,
    ];
    for (const rx of perPackHints) {
      const m = rest.match(rx);
      if (m) { perPack = Math.max(1, parseInt(m[1],10)); break; }
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

    name = name
      .replace(/\b(\d+[gG]|kg|ml|l|cl)\b/g,'')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (name) {
      items.push({
        id: 'tmp-' + Math.random().toString(36).slice(2),
        name,
        brand: brand || '',
        packs,
        perPack,
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

/** Parser scadenze più severo */
function parseExpiryPairs(text, lexicon = [], knownProducts = []) {
  if (DEBUG) console.log('[parseExpiryPairs] input:', text);
  const out = [];
  const norm = (x) => String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const s = norm(text);

  const DATE_RE = /((?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(?:\d{1,2}\s+[a-zà-ú]+\s+\d{2,4}))/i;

  const tokensArr = s.split(/\s+/);
  for (let i = 0; i < tokensArr.length; i++) {
    const win = tokensArr.slice(Math.max(0, i - 6), i + 6).join(' ');
    const dm = win.match(DATE_RE);
    if (!dm) continue;

    const iso = toISODate(dm[1]);
    if (!iso) continue;

    let chosen = '';
    let bestLen = 0;
    for (const p of lexicon) {
      const k = norm(p);
      if (k && win.includes(k) && k.length > bestLen) { chosen = p; bestLen = k.length; }
    }

    if (!chosen && Array.isArray(knownProducts) && knownProducts.length) {
      for (const kp of knownProducts) {
        const k = norm(kp);
        if (k && win.includes(k)) { chosen = kp; break; }
      }
    }

    if (!chosen) continue;
    out.push({ name: chosen, expiresAt: iso });
  }

  if (DEBUG) console.log('[parseExpiryPairs] valid matches:', out);
  return out;
}

/* ---------- fetch helpers ---------- */
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

/* -------- Prompt builder: scontrino -------- */
function buildOcrAssistantPrompt(ocrText, lexicon = []) {
  const LEX = Array.isArray(lexicon) && lexicon.length ? lexicon.join(', ') : 'latte, pane, pasta, uova, ...';
  return [
    'Sei Jarvis, estrattore strutturato di scontrini.',
    'DEVI rispondere SOLO in JSON con questo schema ESATTO:',
    '{ "purchases":[{ "name":"", "brand":"", "qty":1, "perPack":1, "expiresAt":"" }], "expiries":[], "stock":[] }',
    '',
    'REGOLE:',
    '- Estrai SOLO righe che indicano prodotti acquistati.',
    '- IGNORA intestazioni, reparti, subtotali, TOTALE, IVA, sconti globali, contanti/bancomat, resto, numeri ordine, casse.',
    '- Normalizza i nomi usando questo lessico come guida (se simili, scegli la forma del lessico):',
    LEX,
    '- brand: stringa breve se deducibile (es. “Barilla”, “Parmalat”), altrimenti "".',
    '- qty: N. CONFEZIONI acquistate (default 1).',
    '- perPack: N. di pezzi per confezione se presente (es. “10 pz”, “4x125” => 10 o 4). Se non indicato, 1.',
    '- expiresAt: YYYY-MM-DD se presente in chiaro; altrimenti "".',
    '- Niente commenti, niente testo fuori dal JSON.',
    '',
    'ESEMPI:',
    'Input OCR:',
    '----------------------------------------',
    'YOGURT FRAGOLA MULLER 4X125 1,99',
    'LATTE PS 6 BOTTIGLIE X 1L 7,20',
    '----------------------------------------',
    'Output JSON:',
    '{ "purchases":[',
    '  { "name":"yogurt", "brand":"Muller", "qty":1, "perPack":4, "expiresAt":"" },',
    '  { "name":"latte", "brand":"", "qty":1, "perPack":6, "expiresAt":"" }',
    '], "expiries":[], "stock":[] }',
    '',
    'ADESSO ESTRARRE DAL TESTO OCR QUI SOTTO. RISPONDI SOLO CON IL JSON FINALE.',
    '--- TESTO OCR INIZIO ---',
    ocrText,
    '--- TESTO OCR FINE ---'
  ].join('\n');
}

/* -------- Prompt builder: scadenza singola -------- */
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

/* ------------- Fallback parser locale (ricevute) ------------- */
function parseReceiptPurchases(ocrText) {
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const ignore = /(totale|iva|bancomat|contanti|resto|scontrino|cassa|cliente|sconto|subtotale)/i;

  const out = [];
  for (let raw of lines) {
    if (ignore.test(raw)) continue;
    let packs = 1, perPack = 1, brand = '', name = raw;

    const perPackHints = [
      /(\d+)\s*(?:pz|pezzi|bottiglie|flaconi|lattine)\b/i,
      /(?:x|×)\s*(\d+)\b/i,
      /\b(\d+)\s*(?:x|×)\b/i,
      /confezione\s*da\s*(\d+)/i,
    ];
    for (const rx of perPackHints) {
      const m = raw.match(rx);
      if (m) { perPack = Math.max(1, parseInt(m[1],10)); break; }
    }

    const mQtyLeading = raw.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(.*)$/i);
    if (mQtyLeading) {
      const maybePacks = Math.round(Number(String(mQtyLeading[1]).replace(',','.'))||1);
      if (!/(\d+)\s*(pz|pezzi|bottiglie|flaconi|lattine)\b/i.test(raw)) {
        packs = Math.max(1, maybePacks);
      }
      name = mQtyLeading[2].trim();
    }

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

    name = name
      .replace(/spaghetti|penne|fusilli|rigatoni/, 'pasta')
      .replace(/passata\b.*pomodoro|passata\b/, 'passata di pomodoro')
      .replace(/latte\b.*/, 'latte')
      .replace(/yogurt\b.*/, 'yogurt');

    if (!name || name.length<2) continue;
    out.push({ name, brand: brand || '', qty: packs, perPack, expiresAt: '' });
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

  const [form, setForm] = useState({ name: '', brand: '', packs: '1', perPack: '1' });

  // Scorte
  // item: {name,brand,packs,perPack,units,expiresAt,lastRestockAt,lastRestockUnits,avgDailyUse,consumptionHistory:[{at,rate}]}
  const [stock, setStock] = useState([]);
  const [critical, setCritical] = useState([]);

  // Catalogo perPack appreso
  const [perPackCatalog, setPerPackCatalog] = useState({}); // key -> perPack

  // Stato UI
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // Vocale: LISTA
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  theStreamFix();
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // Vocale: SCADENZE
  const expMediaRef = useRef(null);
  const expChunksRef = useRef([]);
  const expStreamRef = useRef(null);
  const [expRecBusy, setExpRecBusy] = useState(false);

  // OCR input (scontrini)
  const ocrInputRef = useRef(null);

  // OCR scadenza per riga
  const rowOcrInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);

  // Modifica riga scorte
  const [editIdx, setEditIdx] = useState(null);
  const [editDraft, setEditDraft] = useState({ name:'', brand:'', packs:'', perPack:'', expiresAt:'' });

  // Import/Export refs
  const importInputRef = useRef(null);

  const curItems = lists[currentList] || [];

  /* ----- perPackCatalog: load/save ----- */
  function ppKey(name, brand){ return `${normKey(name)}|${normKey(brand||'')}`; }
  useEffect(() => {
    try {
      const raw = localStorage.getItem('perPackCatalogV1');
      if (raw) setPerPackCatalog(JSON.parse(raw) || {});
      const stockRaw = localStorage.getItem('stockDataV1');
      if (stockRaw) setStock(JSON.parse(stockRaw) || []);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('perPackCatalogV1', JSON.stringify(perPackCatalog || {})); } catch {}
  }, [perPackCatalog]);
  useEffect(() => {
    try { localStorage.setItem('stockDataV1', JSON.stringify(stock || [])); } catch {}
  }, [stock]);

  function learnPerPack(name, brand, perPack){
    const p = Math.max(1, Number(perPack||1));
    const key = ppKey(name,brand);
    setPerPackCatalog(prev => {
      const cur = prev?.[key];
      if (!cur || p !== cur) return { ...(prev||{}), [key]: p };
      return prev;
    });
  }
  function fillPerPackFromCatalog(name, brand, fallback=1){
    const v = perPackCatalog[ppKey(name,brand)];
    return Math.max(1, Number(v || fallback || 1));
  }

  /* --------------- derivati: prodotti critici --------------- */
  useEffect(() => {
    const now = Date.now();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    const tenDays = 10 * 24 * 60 * 60 * 1000;

    const crit = stock.filter((p) => {
      const units = Number(p.units || unitsFrom(p.packs, p.perPack));
      const lastAt = p.lastRestockAt ? new Date(p.lastRestockAt).getTime() : 0;
      const oldEnough = lastAt && (now - lastAt) > twoDays;

      const lowUnits = oldEnough && units <= 2;
      const consumed80 = oldEnough && p.lastRestockUnits ? (units <= 0.2 * p.lastRestockUnits) : false;

      let nearExp = false;
      if (p.expiresAt) {
        const expMs = new Date(p.expiresAt).getTime();
        nearExp = (expMs - now) <= tenDays;
      }

      return nearExp || lowUnits || consumed80;
    });
    setCritical(crit);
  }, [stock]);

  function showToast(msg, type='info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  /* ---------------- sparkline helpers ---------------- */
  function renderSparkline(history) {
    const w = 120, h = 28, pad = 2;
    const rates = Array.isArray(history) ? history.map(p => Number(p?.rate||0)).filter(v => Number.isFinite(v)) : [];
    if (rates.length < 2) return <span style={{opacity:.6}}>—</span>;

    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const range = max - min || 1;

    const stepX = (w - pad*2) / (rates.length - 1);
    const pts = rates.map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad*2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const lastX = pad + (rates.length - 1) * stepX;
    const lastY = pad + (h - pad*2) * (1 - (rates[rates.length-1] - min) / range);

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={styles.sparkline}>
        <polyline points={pts} fill="none" stroke="#06b6d4" strokeWidth="2"/>
        <circle cx={lastX} cy={lastY} r="2.5" fill="#06b6d4"/>
      </svg>
    );
  }

  /* -------- consumo stimato: aggiorna a ogni riacquisto -------- */
  function applyRestock(arr, idx, addPacks, perPackLearn, nowISO){
    const row = arr[idx];
    const perPack = row.perPack || perPackLearn || 1;

    // prima del riacquisto: units correnti
    const prevUnits = Number(row.units || unitsFrom(row.packs, perPack));
    const prevLastUnits = Number(row.lastRestockUnits || 0);
    const prevLastAt = row.lastRestockAt;

    // consumo misurato solo se abbiamo uno storico coerente
    if (prevLastAt && prevLastUnits > 0) {
      const days = daysBetween(prevLastAt, nowISO);
      const consumed = Math.max(0, prevLastUnits - prevUnits);
      const lastRate = consumed / days; // unità/giorno
      const oldAvg = Number(row.avgDailyUse || 0);
      const newAvg = oldAvg ? (0.7 * oldAvg + 0.3 * lastRate) : lastRate;
      row.avgDailyUse = Number.isFinite(newAvg) ? Number(newAvg.toFixed(3)) : oldAvg || 0;

      // storico sparkline (ultimi 12 punti)
      const hist = Array.isArray(row.consumptionHistory) ? row.consumptionHistory.slice() : [];
      hist.push({ at: nowISO, rate: Number(lastRate.toFixed(4)) });
      row.consumptionHistory = hist.slice(-12);
    }

    // ora aggiungo le nuove confezioni
    const addUnits = Math.max(1, Math.round(addPacks)) * Math.max(1, Math.round(perPack));
    row.packs = Math.max(0, Math.round(Number(row.packs || 0) + addPacks));
    row.perPack = perPack;
    row.units = Math.max(0, Number(prevUnits + addUnits));

    // aggiorno baseline per prossimo ciclo consumo
    row.lastRestockAt = nowISO;
    row.lastRestockUnits = row.units;

    // apprendimento perPack
    learnPerPack(row.name, row.brand, perPack);

    arr[idx] = { ...row };
  }

  /* ---------------- LISTE: add/remove/inc/Comprato ---------------- */
  function addManualItem(e) {
    e.preventDefault();
    const packs = Math.max(1, Math.round(Number(String(form.packs).replace(',', '.')) || 1));
    // se l'utente non sa perPack, prova dal catalogo
    const perPack = Math.max(1, Math.round(Number(String(form.perPack).replace(',', '.')) || 0))) || fillPerPackFromCatalog(form.name, form.brand, 1);
    const name = form.name.trim();
    const brand = form.brand.trim();
    if (!name) return;

    // impara perPack da input manuale
    learnPerPack(name, brand, perPack);

    setLists(prev => {
      const next = { ...prev };
      const items = [...(prev[currentList] || [])];
      const idx = items.findIndex(i => i.name.toLowerCase() === name.toLowerCase() && (i.brand||'').toLowerCase() === brand.toLowerCase());
      if (idx >= 0) {
        items[idx] = { ...items[idx], packs: Number(items[idx].packs || 0) + packs, perPack: items[idx].perPack || perPack || 1 };
      } else {
        items.push({ id: 'tmp-' + Math.random().toString(36).slice(2), name, brand, packs, perPack, purchased: false });
      }
      next[currentList] = items;
      return next;
    });

    setForm({ name: '', brand: '', packs: '1', perPack: '1' });
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
        i.id === id ? { ...i, packs: Math.max(0, Math.round(Number(i.packs || 0) + delta)) } : i
      )).filter(i => i.packs > 0);
      return next;
    });
  }

  function markBought(id) {
    const item = (lists[currentList] || []).find(i => i.id === id);
    setLists(prev => {
      const next = { ...prev };
      next[currentList] = (prev[currentList] || []).map(i => {
        if (i.id !== id) return i;
        const newPacks = Math.max(0, Math.round(Number(i.packs || 0) - 1));
        return { ...i, packs: newPacks, purchased: true };
      }).filter(i => i.packs > 0);
      return next;
    });
    if (item) {
      const addPacks = 1;
      const perPack = item.perPack || fillPerPackFromCatalog(item.name, item.brand, 1);
      learnPerPack(item.name, item.brand, perPack);
      setStock(prev => {
        const arr = [...prev];
        const idx = arr.findIndex(s => isSimilar(s.name, item.name) && (!item.brand || isSimilar(s.brand||'', item.brand)));
        const now = new Date().toISOString();
        if (idx >= 0) {
          applyRestock(arr, idx, addPacks, perPack, now);
        } else {
          const units = addPacks * Math.max(1, perPack);
          arr.unshift({
            name: item.name, brand: item.brand || '',
            packs: addPacks, perPack: Math.max(1, perPack), units,
            expiresAt: '',
            lastRestockAt: now, lastRestockUnits: units,
            avgDailyUse: 0,
            consumptionHistory: []
          });
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

      let appended = false;
      try {
        const payload = {
          prompt: [
            'Sei Jarvis. Capisci una LISTA SPESA. Rispondi SOLO JSON:',
            '{ "items":[{ "name":"latte","brand":"","qty":2,"perPack":6 }, ...] }',
            'qty = N. confezioni, perPack = pezzi per confezione (default 1).',
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
                packs: Math.max(1, Math.round(Number(raw.qty||1))),
                perPack: Math.max(1, Math.round(Number(raw.perPack||0))) || fillPerPackFromCatalog(String(raw.name||''), String(raw.brand||''), 1),
                purchased: false,
              };
              if (!it.name) continue;
              learnPerPack(it.name, it.brand, it.perPack);
              const idx = existing.findIndex(i => i.name.toLowerCase() === it.name.toLowerCase() && (i.brand||'').toLowerCase() === it.brand.toLowerCase());
              if (idx >= 0) {
                const keepPerPack = existing[idx].perPack || it.perPack || 1;
                existing[idx] = { ...existing[idx], packs: Number(existing[idx].packs || 0) + it.packs, perPack: keepPerPack };
              } else {
                existing.push(it);
              }
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
            for (const it0 of local) {
              const it = { ...it0 };
              if (!it.perPack || it.perPack === 1) it.perPack = fillPerPackFromCatalog(it.name, it.brand, it.perPack||1);
              learnPerPack(it.name, it.brand, it.perPack);
              const idx = existing.findIndex(i => i.name.toLowerCase() === it.name.toLowerCase() && (i.brand||'').toLowerCase() === (it.brand||'').toLowerCase());
              if (idx >= 0) {
                const keepPerPack = existing[idx].perPack || it.perPack || 1;
                existing[idx] = { ...existing[idx], packs: Number(existing[idx].packs || 0) + Number(it.packs || 1), perPack: keepPerPack };
              } else {
                existing.push(it);
              }
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

  /* ----- OCR: decremento su entrambe le liste ----- */
  function decrementAcrossBothLists(prevLists, purchases) {
    const next = { ...prevLists };
    const decList = (listKey) => {
      const arr = [...(next[listKey] || [])];
      for (const p of purchases) {
        const decPacks = Math.max(1, Math.round(Number(p.qty || 1)));
        const idx = arr.findIndex(i => isSimilar(i.name, p.name) && (!p.brand || isSimilar(i.brand || '', p.brand || '')));
        if (idx >= 0) {
          const newPacks = Math.max(0, Math.round(Number(arr[idx].packs || 0) - decPacks));
          arr[idx] = { ...arr[idx], packs: newPacks, purchased: true };
        }
      }
      next[listKey] = arr.filter(i => Number(i.packs || 0) > 0 || !i.purchased);
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
        // normalizza perPack con catalogo + apprendimento
        purchases = purchases.map(p => {
          const pp = Math.max(1, Number(p.perPack || 0)) || fillPerPackFromCatalog(p.name, p.brand, 1);
          learnPerPack(p.name, p.brand, pp);
          return { ...p, perPack: pp };
        });

        setLists(prev => decrementAcrossBothLists(prev, purchases));

        setStock(prev => {
          const arr = [...prev];
          const now = new Date().toISOString();
          for (const p of purchases) {
            const addPacks = Math.max(1, Math.round(Number(p.qty || 1)));
            const perPack = Math.max(1, Math.round(Number(p.perPack || 1)));
            const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
            if (idx >= 0) {
              applyRestock(arr, idx, addPacks, perPack, now);
            } else {
              const units = addPacks * perPack;
              arr.unshift({
                name: p.name, brand: p.brand || '',
                packs: addPacks, perPack, units,
                expiresAt: '',
                lastRestockAt: now, lastRestockUnits: units,
                avgDailyUse: 0,
                consumptionHistory: []
              });
              learnPerPack(p.name, p.brand, perPack);
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

  /* --------- Modifica / Elimina riga scorte --------- */
  function startEditRow(i) {
    const r = stock[i];
    if (!r) return;
    setEditIdx(i);
    setEditDraft({
      name: r.name || '',
      brand: r.brand || '',
      packs: String(r.packs || 0),
      perPack: String(r.perPack || 1),
      expiresAt: r.expiresAt || ''
    });
  }
  function saveEditRow() {
    const i = editIdx;
    if (i == null) return;
    const packs = Math.max(0, Math.round(Number(editDraft.packs||0)));
    let perPack = Math.max(1, Math.round(Number(editDraft.perPack||1)));
    // apprendi anche da edit
    learnPerPack(editDraft.name, editDraft.brand, perPack);
    const units = unitsFrom(packs, perPack);
    setStock(prev => {
      const arr = [...prev];
      if (arr[i]) {
        arr[i] = {
          ...arr[i],
          name: editDraft.name.trim(),
          brand: editDraft.brand.trim(),
          packs, perPack, units,
          expiresAt: editDraft.expiresAt ? toISODate(editDraft.expiresAt) : arr[i].expiresAt
        };
      }
      return arr;
    });
    setEditIdx(null);
  }
  function cancelEditRow(){ setEditIdx(null); }
  function deleteRow(i) {
    setStock(prev => prev.filter((_,idx)=>idx!==i));
  }

  /* --------- Export / Import JSON --------- */
  function exportData() {
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        perPackCatalog,
        stock
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jarvis-scorte-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Esportazione completata ✓', 'ok');
    } catch (e) {
      showToast('Errore esportazione', 'err');
    }
  }
  function openImport() { importInputRef.current?.click(); }
  async function handleImportChange(files) {
    const file = files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const impPP = json?.perPackCatalog && typeof json.perPackCatalog === 'object' ? json.perPackCatalog : {};
      const impStock = Array.isArray(json?.stock) ? json.stock : [];

      // merge perPackCatalog (preferisci quello importato dove diverso)
      setPerPackCatalog(prev => ({ ...(prev||{}), ...(impPP||{}) }));

      // merge stock: se esiste voce simile, tieni la più recente (lastRestockAt)
      setStock(prev => {
        const arr = [...prev];
        for (const r of impStock) {
          const idx = arr.findIndex(s => isSimilar(s.name, r.name) && isSimilar(s.brand||'', r.brand||''));
          if (idx < 0) {
            arr.push(r);
          } else {
            const a = arr[idx];
            const aAt = a.lastRestockAt ? new Date(a.lastRestockAt).getTime() : 0;
            const bAt = r.lastRestockAt ? new Date(r.lastRestockAt).getTime() : 0;
            arr[idx] = bAt > aAt ? r : a;
          }
        }
        return arr;
      });

      showToast('Import completato ✓', 'ok');
    } catch (e) {
      showToast('File non valido', 'err');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  /* --------- Badge helper --------- */
  function daysBadge(days) {
    if (days == null || days === '—') return <span style={styles.badgeGray}>—</span>;
    const d = Number(days);
    if (!Number.isFinite(d)) return <span style={styles.badgeGray}>—</span>;
    if (d > 14) return <span style={styles.badgeGreen}>{d}</span>;
    if (d >= 7) return <span style={styles.badgeAmber}>{d}</span>;
    return <span style={styles.badgeRed}>{d}</span>;
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

          {/* Comandi Lista (solo voce) */}
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
                      <div style={styles.qtyBadge}>{it.packs}</div>
                      <div>
                        <div style={styles.itemName}>{it.name}</div>
                        <div style={styles.itemBrand}>{(it.brand || '—') + ` • ${it.perPack||1}/conf.`}</div>
                      </div>
                    </div>
                    <div style={styles.itemActions}>
                      <button
                        title="Segna comprato (1 conf.)"
                        onClick={() => markBought(it.id)}
                        style={it.purchased ? styles.actionSuccess : styles.actionDanger}
                      >
                        {it.purchased ? '✔ Comprato' : 'Comprato'}
                      </button>
                      <div style={{display:'flex', gap:6}}>
                        <button title="−1 conf." onClick={() => incQty(it.id, -1)} style={styles.actionGhost}>−</button>
                        <button title="+1 conf." onClick={() => incQty(it.id, +1)} style={styles.actionGhost}>＋</button>
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
              <input placeholder="N. confezioni" inputMode="numeric" value={form.packs}
                     onChange={e => setForm(f => ({...f, packs: e.target.value}))} style={{...styles.input, width: 140}} required />
              <input placeholder="Per conf. (pezzi)" inputMode="numeric" value={form.perPack}
                     onChange={e => setForm(f => ({...f, perPack: e.target.value}))} style={{...styles.input, width: 160}} required />
              <button style={styles.primaryBtn} disabled={busy}>Aggiungi alla lista</button>
            </form>
            <p style={{opacity:.8, marginTop: 6}}>
              Esempi: “2 latte parmalat conf. da 6”, “3 yogurt muller 4x125”, “10 uova (per conf. 10)”.
            </p>
          </div>

          {/* Prodotti in esaurimento / scadenza */}
          <div style={styles.sectionXL}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.h3}>📦 Prodotti in esaurimento / scadenza</h3>
              <div style={{display:'flex', gap:8}}>
                <button onClick={exportData} style={styles.secondaryBtn}>⬇️ Esporta</button>
                <button onClick={openImport} style={styles.secondaryBtn}>⬆️ Importa</button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={(e)=>handleImportChange(Array.from(e.target.files||[]))}
                />
              </div>
            </div>

            {critical.length === 0 ? (
              <p style={{opacity:.8}}>Nessun prodotto critico</p>
            ) : (
              <ul style={{margin:'6px 0 0', paddingLeft: '18px'}}>
                {critical.map((p, i) => {
                  const units = p.units || unitsFrom(p.packs, p.perPack);
                  const rate = p.avgDailyUse || 0;
                  const daysLeft = rate > 0 ? Math.max(0, Math.floor(units / rate)) : null;
                  return (
                    <li key={i}>
                      {p.name} {p.brand ? `(${p.brand})` : ''} — Conf.: {p.packs} × {p.perPack||1} = {units} pezzi
                      {p.expiresAt ? ` — Scadenza: ${new Date(p.expiresAt).toLocaleDateString('it-IT')}` : ''}
                      {' '}• Giorni rimasti: {daysBadge(daysLeft)}
                      {' '}• Consumo: {rate>0 ? `${rate.toFixed(2)}/g` : '—'}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Stato scorte */}
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
                    <th style={styles.th}>Q.tà (conf.)</th>
                    <th style={styles.th}>Per conf.</th>
                    <th style={styles.th}>Tot. pezzi</th>
                    <th style={styles.th}>Consumo stimato</th>
                    <th style={styles.th}>Trend consumo</th>
                    <th style={styles.th}>Giorni rimasti</th>
                    <th style={styles.th}>Scadenza</th>
                    <th style={styles.th}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s, i) => {
                    const units = s.units || unitsFrom(s.packs, s.perPack);
                    const rate = s.avgDailyUse || 0;
                    const daysLeft = rate > 0 ? Math.max(0, Math.floor(units / rate)) : null;
                    return (
                      <tr key={i}>
                        <td style={styles.td}>{s.name}</td>
                        <td style={styles.td}>{s.brand || '-'}</td>
                        <td style={styles.td}>{s.packs || 0}</td>
                        <td style={styles.td}>{s.perPack || 1}</td>
                        <td style={styles.td}>{units}</td>
                        <td style={styles.td}>{rate>0 ? `${rate.toFixed(2)}/g` : '—'}</td>
                        <td style={styles.td}>
                          {renderSparkline(s.consumptionHistory)}
                        </td>
                        <td style={styles.td}>{daysBadge(daysLeft)}</td>
                        <td style={styles.td}>{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('it-IT') : '-'}</td>
                        <td style={styles.td}>
                          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                            <button onClick={()=>openRowOcr(i)} style={styles.ocrInlineBtn} disabled={busy}>📷 OCR</button>
                            <button onClick={()=>startEditRow(i)} style={styles.actionGhost}>✏️ Modifica</button>
                            <button onClick={()=>deleteRow(i)} style={styles.actionGhostDanger}>🗑 Elimina</button>
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
              Dillo così: “il latte scade il 15/07/2025 il burro il 12/08/2026 la passata di pomodoro scade il 10 giugno 2025”.
            </p>
          </div>

          {/* Modal modifica riga scorte */}
          {editIdx!=null && (
            <div style={styles.modalBackdrop}>
              <div style={styles.modal}>
                <h3 style={{marginTop:0}}>Modifica prodotto</h3>
                <div style={{display:'grid', gap:10}}>
                  <input style={styles.input} placeholder="Nome" value={editDraft.name}
                         onChange={e=>setEditDraft(d=>({...d,name:e.target.value}))} />
                  <input style={styles.input} placeholder="Marca" value={editDraft.brand}
                         onChange={e=>setEditDraft(d=>({...d,brand:e.target.value}))} />
                  <div style={{display:'flex', gap:10}}>
                    <input style={{...styles.input, width:140}} inputMode="numeric" placeholder="Conf."
                           value={editDraft.packs} onChange={e=>setEditDraft(d=>({...d,packs:e.target.value}))} />
                    <input style={{...styles.input, width:160}} inputMode="numeric" placeholder="Per conf."
                           value={editDraft.perPack} onChange={e=>setEditDraft(d=>({...d,perPack:e.target.value}))} />
                  </div>
                  <input style={styles.input} placeholder="Scadenza (YYYY-MM-DD)" value={editDraft.expiresAt}
                         onChange={e=>setEditDraft(d=>({...d,expiresAt:e.target.value}))} />
                </div>
                <div style={{display:'flex', gap:8, marginTop:14, justifyContent:'flex-end'}}>
                  <button onClick={cancelEditRow} style={styles.actionGhost}>Annulla</button>
                  <button onClick={saveEditRow} style={styles.primaryBtn}>Salva</button>
                </div>
              </div>
            </div>
          )}

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

/* ---------------- styles ---------------- */
const styles = {
  page: {
    width: '100%', minHeight: '100vh', background: '#0f172a',
    padding: 34, display: 'flex', alignItems: 'center', justifyContent:'center', color:'#fff',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
  },
  card: { width:'100%', maxWidth: 1100, background:'rgba(0,0,0,.6)', borderRadius: 16, padding: 26, boxShadow: '0 6px 16px rgba(0,0,0,.3)' },
  headerRow: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 },
  homeBtn: { background:'#6366f1', color:'#fff', padding:'8px 12px', borderRadius:10, textDecoration:'none' },

  switchRow: { display:'flex', gap:12, margin: '18px 0 12px' },
  switchBtn: { background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer' },
  switchBtnActive: { background:'#06b6d4', border:'0', color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },

  toolsRow: { display:'flex', flexWrap:'wrap', gap:12, margin:'14px 0 6px' },

  voiceBtn: { background:'#6366f1', border:0, color:'#fff', padding:'10px 14px', borderRadius:12, cursor:'pointer', fontWeight:800 },

  sectionHeaderRow: { display:'flex', alignItems:'center', justifyContent:'space-between' },

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
  secondaryBtn: { background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.25)', color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },

  table: { width:'100%', borderCollapse:'collapse', background:'rgba(255,255,255,.04)', borderRadius:12, overflow:'hidden' },
  th: { textAlign:'left', padding:'10px', borderBottom:'1px solid rgba(255,255,255,.12)' },
  td: { padding:'10px', borderBottom:'1px solid rgba(255,255,255,.08)', verticalAlign:'middle' },

  scorteHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  voiceBtnSmall: { background:'#6366f1', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },
  voiceBtnSmallStop: { background:'#ef4444', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  ocrBtnSmall: { background:'#06b6d4', border:0, color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  ocrInlineBtn: { background:'rgba(6,182,212,.15)', border:'1px solid rgba(6,182,212,.6)', color:'#e0fbff', padding:'6px 10px', borderRadius:10, cursor:'pointer', fontWeight:700 },

  // Badges giorni rimasti
  badgeBase: { display:'inline-block', minWidth:28, textAlign:'center', padding:'2px 8px', borderRadius:999, fontWeight:800, fontSize:12 },
  badgeGreen: { display:'inline-block', padding:'2px 8px', borderRadius:999, fontWeight:800, background:'#16a34a', color:'#052e12' },
  badgeAmber: { display:'inline-block', padding:'2px 8px', borderRadius:999, fontWeight:800, background:'#f59e0b', color:'#3a2500' },
  badgeRed:   { display:'inline-block', padding:'2px 8px', borderRadius:999, fontWeight:800, background:'#ef4444', color:'#3a0b0b' },
  badgeGray:  { display:'inline-block', padding:'2px 8px', borderRadius:999, fontWeight:800, background:'rgba(255,255,255,.2)', color:'#0b1220' },

  // sparkline
  sparkline: { display:'block', width:120, height:28, opacity:0.95 },

  modalBackdrop: {
    position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000
  },
  modal: {
    width:'100%', maxWidth:480, background:'#0b1220', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:16, boxShadow:'0 8px 24px rgba(0,0,0,.5)'
  },
};

// piccola no-op per evitare tree-shake di alcuni riferimenti in alcuni bundler
function theStreamFix(){ return null; }
