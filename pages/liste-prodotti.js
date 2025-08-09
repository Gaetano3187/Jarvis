// pages/liste-prodotti.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };

// Assistant IDs / API endpoints (se li usi lato server li puoi leggere qui)
const ASSISTANT_ID_VOICE = 'asst_LJmOc3h6JuVYiZXRQdtjnOlkchatgpt';
const ASSISTANT_ID_OCR   = 'assistantasst_a1d9qqNpXnXU92lPJFV00TjZ';

const API_ASSISTANT_TEXT  = '/api/assistant';
const API_ASSISTANT_OCR   = '/api/assistant-ocr';
const API_FINANCES_INGEST = '/api/finances/ingest';

/* ----------------- Lessico esteso ----------------- */
const GROCERY_LEXICON = [
  // Supermercato
  'latte','latte zymil','yogurt','burro','mozzarella','ricotta','parmigiano','grana padano','formaggio spalmabile',
  'pane','pasta','spaghetti','penne','riso','farina','zucchero','sale','olio evo','olio di semi','aceto',
  'passata di pomodoro','pelati','biscotti','cereali','fette biscottate','marmellata','nutella','caffè','the','tè',
  'pollo','petto di pollo','bistecche','tritato','prosciutto','tonno in scatola','salmone',
  'piselli surgelati','spinaci surgelati','patatine surgelate','gelato',
  'detersivo','detersivo piatti','detersivo lavatrice','ammorbidente','candeggina','spugne','carta igienica','scottex','sacchetti immondizia',
  'insalata','pomodori','zucchine','melanzane','patate','cipolle','aglio','mele','banane','arance','limoni',
  'uova','acqua','birra','vino','tortillas','piadine','affettati',

  // Ferramenta / piccoli lavori / elettricista / idraulica
  'chiave inglese','martello','cacciavite','trapano','viti','bulloni','tasselli','silicone','teflon','guarnizione',
  'tubo flessibile','rubinetto','raccordo','pinza','seghetto','nastro isolante','prolunga elettrica','interruttore',
  'presa elettrica','lampadina','led','cavo elettrico','sonda elettrica','quadro elettrico','salvavita','presa schuko',
  'presa bipasso','tubo pvc','sifone','scarico lavandino','raccordo in ottone','raccordo rapido','tubo rame','manicotto',
  'valvola','flessibile doccia','soffione doccia',

  // Prodotti da bar
  'caffè espresso','cappuccino','cornetto','brioche','succhi di frutta','panino','toast','tramezzino',
  'spritz','vino al calice','birra media','birra piccola','amaro','grappa',

  // Cocktails: spirits, liquori, mixer, garnish, sciroppi
  'gin','vodka','rum','rum bianco','rum scuro','tequila','mezcal',
  'whisky','whiskey','bourbon','rye','scotch',
  'vermouth rosso','vermouth bianco','vermouth dry',
  'aperol','campari','cynar','amaro montenegro','amaro lucano',
  'triple sec','cointreau','grand marnier','blue curaçao','curaçao',
  'amaretto','maraschino','sambuca','chartreuse','strega','baileys','kahlua',
  'angostura','angostura bitters','orange bitters','peychaud’s','bitters',
  'prosecco','champagne','spumante',
  'soda','acqua tonica','tonica','cola','ginger beer','ginger ale','seltz',
  'succo d’arancia','succo arancia','succo di limone','succo limone','succo di lime','succo lime',
  'succo di ananas','succo ananas','cranberry','mirtillo','pomodoro',
  'sciroppo di zucchero','sciroppo zucchero','sciroppo semplice','sciroppo granatina','granatina','grenadine',
  'sciroppo agave','sciroppo orzata','orzata','sciroppo menta',
  'zucchero di canna','zucchero bianco',
  'menta','foglie di menta','basilico','lime','limone','arancia','ciliegina','maraschino cherry',
  'sale per cocktail','sale','sale rosa','zucchero per bordo',
  'ghiaccio','ghiaccio tritato'
];

/* ---------------- utils testo ---------------- */
function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s{2,}/g,' ')
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

/* ---------------- parser liste (migliorato per vocale) ---------------- */
function parseLinesToItems(text) {
  const cleaned = String(text || '')
    .replace(/\s+(e|ed|and|\+|piu|più)\s+/gi, ',')
    .replace(/[•\-–—]/g, ','); // puntini elenco / trattini

  const chunks = cleaned
    .split(/[\n,;]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  const items = [];

  // helper merge
  const pushMerge = (name, brand = '', qty = 1) => {
    name = (name || '').trim();
    brand = (brand || '').trim();
    const q = Math.max(1, Number(String(qty).replace(',', '.')) || 1);
    if (!name) return;
    // se il pezzo contiene più brand, teniamo brand se riconosciuto altrimenti vuoto
    const idx = items.findIndex(i =>
      i.name.toLowerCase() === name.toLowerCase() &&
      (i.brand || '').toLowerCase() === brand.toLowerCase()
    );
    if (idx >= 0) items[idx].qty = Number(items[idx].qty || 0) + q;
    else items.push({ id: 'tmp-' + Math.random().toString(36).slice(2), name, brand, qty: q, purchased:false });
  };

  // 1) parsing semplice "2 latte parmalat"
  for (const raw of chunks) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;

    // quantità davanti
    let qty = 1;
    let rest = s;
    const mQty = s.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
    if (mQty) {
      qty = Number(String(mQty[1]).replace(',', '.')) || 1;
      rest = mQty[2].trim();
    }

    // brand (euristico)
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

    // se è una frase lunga senza virgole: prova a estrarre più voci dal lessico
    const nrest = normKey(rest);
    const likelySentence = nrest.split(' ').length >= 3 && !mQty && !/,|;/.test(raw);
    if (likelySentence) {
      const matches = [];
      for (const p of GROCERY_LEXICON) {
        const k = normKey(p);
        if (k && nrest.includes(k)) matches.push(p);
      }
      // se trovo 2+ match, estraggo come prodotti separati
      if (matches.length >= 2) {
        matches.forEach(p => pushMerge(p, '', 1));
        continue;
      }
    }

    // altrimenti singolo item
    name = name.replace(/\s{2,}/g, ' ').trim();
    brand = brand.replace(/\s{2,}/g, ' ').trim();
    if (name) pushMerge(name, brand, qty);
  }

  // 2) fallback extra: se testo unico e nessun item estratto, usa completamente il lessico
  if (!items.length) {
    const ntext = normKey(text);
    const seen = new Set();
    for (const p of GROCERY_LEXICON) {
      const k = normKey(p);
      if (k && ntext.includes(k) && !seen.has(k)) {
        seen.add(k);
        pushMerge(p, '', 1);
      }
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

/** "il latte scade il 15/07/2025 il burro il 12/08/2026 la passata di pomodoro scade il 10 giugno 2025" */
function parseExpiryPairs(text) {
  const out = [];
  const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const s = norm(text);

  const re = /([a-zà-ú\s]{2,}?)(?:\s+scade(?:\s+il)?)?\s+((?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(?:\d{1,2}\s+[a-zà-ú]+\s+\d{2,4}))/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const nameRaw = String(m[1] || '').trim().replace(/^(il|lo|la|i|gli|le)\s+/i,'').trim();
    const dateRaw = String(m[2] || '').trim();
    const iso = toISODate(dateRaw);
    if (!nameRaw || !iso) continue;

    let chosen = nameRaw;
    let bestLen = 0;
    for (const p of GROCERY_LEXICON) {
      const k = norm(p);
      if (k && nameRaw.includes(k) && k.length > bestLen) { chosen = p; bestLen = k.length; }
    }
    out.push({ name: chosen, expiresAt: iso });
  }

  if (!out.length) {
    for (const p of GROCERY_LEXICON) {
      const k = norm(p);
      const idx = s.indexOf(k);
      if (idx >= 0) {
        const tail = s.slice(idx, idx+120);
        const maybe = tail.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(\d{1,2}\s+[a-zà-ú]+\s+\d{2,4})/i);
        if (maybe) {
          const iso = toISODate(maybe[0]);
          if (iso) out.push({ name: p, expiresAt: iso });
        }
      }
    }
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
  const [stock, setStock] = useState([]);       // [{name,brand,qty,expiresAt?}]
  const [critical, setCritical] = useState([]); // subset di stock

  // Stato UI
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // Vocale LISTA
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);

  // OCR LISTA
  const ocrListRef = useRef(null);

  // Vocale SCADENZE (più lungo)
  const expMediaRef = useRef(null);
  const expChunksRef = useRef([]);
  const expStreamRef = useRef(null);
  const [expRecBusy, setExpRecBusy] = useState(false);
  const MAX_VOICE_EXPIRY_MS = 20000; // 20s

  // OCR scontrini accanto a scorte
  const ocrReceiptRef = useRef(null);

  // OCR scadenza per riga
  const rowOcrInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);

  const curItems = lists[currentList] || [];

  /* --------------- derivati --------------- */
  useEffect(() => {
    const today = new Date();
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    const crit = stock.filter((p) => {
      const lowQty = Number(p.qty || 0) <= 1;
      let nearExp = false;
      if (p.expiresAt) {
        const exp = new Date(p.expiresAt);
        nearExp = (exp - today) <= tenDays;
      }
      return lowQty || nearExp;
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
      else items.push({ id: 'tmp-' + Math.random().toString(36).slice(2), name, brand, qty, purchased:false });
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
        const idx = arr.findIndex(s => isSimilar(s.name, item.name) && (!item.brand || isSimilar(s.brand||'', item.brand)));
        if (idx >= 0) arr[idx] = { ...arr[idx], qty: Number(arr[idx].qty || 0) + 1 };
        else arr.unshift({ name: item.name, brand: item.brand, qty: 1, expiresAt: '' });
        return arr;
      });
    }
  }

  /* ---------------- Vocale: LISTA ---------------- */
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
      const res = await fetch('/api/stt', { method: 'POST', body: fd });
      const { text } = await res.json();
      if (!text) throw new Error('Testo non riconosciuto');

      // 1) parser locale robusto (sempre)
      const local = parseLinesToItems(text);
      if (local.length) {
        setLists(prev => {
          const next = { ...prev };
          const existing = [...(prev[currentList] || [])];
          for (const it of local) {
            const idx = existing.findIndex(i =>
              i.name.toLowerCase() === it.name.toLowerCase() &&
              (i.brand||'').toLowerCase() === (it.brand||'').toLowerCase()
            );
            if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + Number(it.qty || 1) };
            else existing.push(it);
          }
          next[currentList] = existing;
          return next;
        });
      }

      // 2) opzionale: assistant per arricchire (best effort, non blocca)
      try {
        const payload = {
          assistantId: ASSISTANT_ID_VOICE,
          prompt: [
            'Sei Jarvis. Capisci una LISTA SPESA. JSON { "items":[{ "name":"latte","brand":"Parmalat","qty":2 }, ...] }.',
            'Voci comuni: ' + GROCERY_LEXICON.join(', '),
            'Testo:', text
          ].join('\n'),
        };
        const r = await fetch(API_ASSISTANT_TEXT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const { answer } = await r.json();
        const data = typeof answer === 'string' ? JSON.parse(answer) : answer;
        const arr = Array.isArray(data?.items) ? data.items : [];
        if (arr.length) {
          setLists(prev => {
            const next = { ...prev };
            const existing = [...(prev[currentList] || [])];
            for (const raw of arr) {
              const it = {
                id: 'tmp-' + Math.random().toString(36).slice(2),
                name: String(raw.name||'').trim(),
                brand: String(raw.brand||'').trim(),
                qty: Math.max(1, Number(raw.qty||1)),
                purchased:false,
              };
              if (!it.name) continue;
              const idx = existing.findIndex(i =>
                i.name.toLowerCase() === it.name.toLowerCase() &&
                (i.brand||'').toLowerCase() === it.brand.toLowerCase()
              );
              if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + it.qty };
              else existing.push(it);
            }
            next[currentList] = existing;
            return next;
          });
        }
      } catch {}

      showToast('Lista aggiornata da Vocale ✓', 'ok');
    } catch {
      alert('Errore nel riconoscimento vocale');
    } finally {
      setRecBusy(false);
      setBusy(false);
      try { streamRef.current?.getTracks?.forEach(t=>t.stop()); } catch {}
    }
  }

  /* ---------------- OCR: LISTA (scannerizza promemoria/nota e aggiunge voci) ---------------- */
  async function handleOCRList(files) {
    if (!files?.length) return;
    try {
      setBusy(true);
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const { text } = await res.json();
      if (!text) throw new Error('Nessun testo OCR');

      const items = parseLinesToItems(text);
      if (items.length) {
        setLists(prev => {
          const next = { ...prev };
          const existing = [...(prev[currentList] || [])];
          for (const it of items) {
            const idx = existing.findIndex(i =>
              i.name.toLowerCase() === it.name.toLowerCase() &&
              (i.brand||'').toLowerCase() === (it.brand||'').toLowerCase()
            );
            if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + Number(it.qty || 1) };
            else existing.push(it);
          }
          next[currentList] = existing;
          return next;
        });
        showToast('Lista aggiornata da OCR ✓', 'ok');
      } else {
        showToast('Nessun prodotto riconosciuto dalla lista', 'err');
      }
    } catch {
      showToast('Errore OCR Lista', 'err');
    } finally {
      setBusy(false);
      if (ocrListRef.current) ocrListRef.current.value = '';
    }
  }

  /* ---------------- Vocale: SCADENZE (timeout più lungo) ---------------- */
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
      setTimeout(() => { try { if (expMediaRef.current && expMediaRef.current.state === 'recording') expMediaRef.current.stop(); } catch {} }, MAX_VOICE_EXPIRY_MS);
    } catch {
      alert('Microfono non disponibile');
    }
  }
  function stopVoiceExpiry() {
    try { expMediaRef.current?.stop(); } catch {}
  }
  async function processVoiceExpiry() {
    const blob = new Blob(expChunksRef.current, { type: 'audio/webm' });
    const fd = new FormData(); fd.append('audio', blob, 'expiry.webm');
    try {
      setBusy(true);
      const res = await fetch('/api/stt', { method:'POST', body: fd });
      const { text } = await res.json();
      const pairs = parseExpiryPairs(text || '');
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
      try { expStreamRef.current?.getTracks?.forEach(t=>t.stop()); } catch {}
    }
  }

  /* ---------------- OCR: SCONTRINI (aggiorna liste e scorte; non popola altre sezioni) ---------------- */
  function decrementListsByPurchases(prevLists, purchases) {
    const next = { ...prevLists };
    const lt = LIST_TYPES.SUPERMARKET;
    const arr = [...(prevLists[lt] || [])];
    for (const p of purchases) {
      const dec = Math.max(1, Number(p.qty || 1));
      const idx = arr.findIndex(i => isSimilar(i.name, p.name) && (!p.brand || isSimilar(i.brand || '', p.brand || '')));
      if (idx >= 0) {
        const newQty = Math.max(0, Number(arr[idx].qty || 0) - dec);
        arr[idx] = { ...arr[idx], qty: newQty, purchased: true };
      }
    }
    next[lt] = arr.filter(i => Number(i.qty || 0) > 0 || !i.purchased);
    return next;
  }

  async function handleOCRReceipts(files) {
    if (!files?.length) return;
    try {
      setBusy(true);
      const fd = new FormData();
      fd.append('assistantId', ASSISTANT_ID_OCR);
      files.forEach((f) => fd.append('files', f));
      fd.append('hints', JSON.stringify({ lexicon: GROCERY_LEXICON }));

      const res = await fetch(API_ASSISTANT_OCR, { method: 'POST', body: fd });
      const { data, error } = await res.json();
      if (!res.ok || error) throw new Error(error || String(res.status));

      const purchases = Array.isArray(data?.purchases) ? data.purchases : [];
      const expiries  = Array.isArray(data?.expiries)  ? data.expiries  : [];
      const stockArr  = Array.isArray(data?.stock)     ? data.stock     : [];

      if (purchases.length) {
        setLists(prev => decrementListsByPurchases(prev, purchases));
        setStock(prev => {
          const arr = [...prev];
          for (const p of purchases) {
            const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
            const incQty = Math.max(1, Number(p.qty||1));
            const ex = p.expiresAt ? toISODate(p.expiresAt) : '';
            if (idx >= 0) {
              arr[idx] = { ...arr[idx], qty: Number(arr[idx].qty || 0) + incQty, expiresAt: ex || arr[idx].expiresAt };
            } else {
              arr.unshift({ name: p.name, brand: p.brand || '', qty: incQty, expiresAt: ex || '' });
            }
          }
          return arr;
        });
        try { await fetch(API_FINANCES_INGEST, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ purchases }) }); } catch {}
      }

      if ((expiries && expiries.length) || (stockArr && stockArr.length)) {
        setStock(prev => {
          let arr = [...prev];
          const apply = (rec) => {
            const idx = arr.findIndex(s => isSimilar(s.name, rec.name) && (!rec.brand || isSimilar(s.brand||'', rec.brand)));
            const ex = toISODate(rec.expiresAt);
            if (idx >= 0) {
              arr[idx] = { ...arr[idx], expiresAt: ex || arr[idx].expiresAt, qty: Number(arr[idx].qty || 0) + Math.max(0, Number(rec.qty||0)) };
            }
          };
          (expiries||[]).forEach(apply);
          (stockArr||[]).forEach(apply);
          return arr;
        });
      }

      showToast('OCR scontrino elaborato ✓', 'ok');
    } catch {
      showToast('Errore OCR/Assistant', 'err');
    } finally {
      setBusy(false);
      if (ocrReceiptRef.current) ocrReceiptRef.current.value = '';
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
      fd.append('assistantId', ASSISTANT_ID_OCR);
      files.forEach((f)=>fd.append('files', f));
      fd.append('intent', 'expiry_for_item');
      fd.append('item', JSON.stringify({ name: row.name, brand: row.brand || '' }));
      const res = await fetch(API_ASSISTANT_OCR, { method:'POST', body: fd });
      const { data, error } = await res.json();
      if (!res.ok || error) throw new Error(error || String(res.status));
      const ex = Array.isArray(data?.expiries) ? data.expiries[0] : null;
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
    } catch {
      showToast('Errore OCR scadenza', 'err');
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

          {/* Comandi Lista: Vocale + OCR Lista */}
          <div style={styles.toolsRow}>
            <button onClick={toggleRecList} style={styles.voiceBtn} disabled={busy}>
              {recBusy ? '⏹️ Stop' : '🎙 Vocale Lista'}
            </button>
            <button onClick={() => ocrListRef.current?.click()} style={styles.ocrBtn} disabled={busy}>
              📷 OCR Lista
            </button>
            <input
              ref={ocrListRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              multiple
              hidden
              onChange={(e) => handleOCRList(Array.from(e.target.files || []))}
            />
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
              Suggerimenti voce: “2 latte parmalat, 3 pasta barilla, uova” oppure “pane e pasta e latte detersivo”.
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

          {/* Stato scorte + tasti scadenze/ocr scontrini accanto */}
          <div style={styles.sectionXL}>
            <div style={styles.scorteHeader}>
              <h3 style={{...styles.h3, marginBottom:0}}>📊 Stato Scorte</h3>
              <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                {!expRecBusy ? (
                  <button onClick={startVoiceExpiry} style={styles.voiceBtnSmall} disabled={busy}>🎙 Vocale Scadenze</button>
                ) : (
                  <button onClick={stopVoiceExpiry} style={styles.voiceBtnSmallStop}>⏹️ Stop Vocale</button>
                )}
                <button onClick={() => ocrReceiptRef.current?.click()} style={styles.ocrBtnSmall} disabled={busy}>📷 OCR Scontrini</button>
                <input
                  ref={ocrReceiptRef}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  multiple
                  hidden
                  onChange={(e) => handleOCRReceipts(Array.from(e.target.files || []))}
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
                        <button onClick={()=>openRowOcr(i)} style={styles.ocrInlineBtn} disabled={busy}>📷 OCR</button>
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
  ocrBtn: { background:'#06b6d4', border:0, color:'#0b1220', padding:'10px 14px', borderRadius:12, cursor:'pointer', fontWeight:800 },

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

  table: { width:'100%', borderCollapse:'collapse', background:'rgba(255,255,255,.04)', borderRadius:12, overflow:'hidden' },
  th: { textAlign:'left', padding:'10px', borderBottom:'1px solid rgba(255,255,255,.12)' },
  td: { padding:'10px', borderBottom:'1px solid rgba(255,255,255,.08)' },

  scorteHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  voiceBtnSmall: { background:'#6366f1', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },
  voiceBtnSmallStop: { background:'#ef4444', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  ocrBtnSmall: { background:'#06b6d4', border:0, color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  ocrInlineBtn: { background:'rgba(6,182,212,.15)', border:'1px solid rgba(6,182,212,.6)', color:'#e0fbff', padding:'6px 10px', borderRadius:10, cursor:'pointer', fontWeight:700 }
};
