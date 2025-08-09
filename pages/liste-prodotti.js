// pages/liste-prodotti.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

/**
 * Colleghi attivi:
 * - 🎙 Vocale -> /api/assistant  (assistantId: VOICE)
 * - 📷 OCR    -> /api/assistant-ocr (assistantId: OCR)
 * - Finanze   -> /api/finances/ingest (JSON purchases)
 * - Operator  -> /api/operator/connect
 */

const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };

// === CONFIG ===
const ASSISTANT_ID_VOICE = 'asst_LJmOc3h6JuVYiZXRQdtjnOlkchatgpt';
const ASSISTANT_ID_OCR = 'assistantasst_a1d9qqNpXnXU92lPJFV00TjZ';

const API_ASSISTANT_TEXT = '/api/assistant';
const API_ASSISTANT_OCR = '/api/assistant-ocr';
const API_FINANCES_INGEST = '/api/finances/ingest';
const API_OPERATOR_CONNECT = '/api/operator/connect';

/* ----------------- Lessico supermercato (aiuta OCR/voce) ----------------- */
const GROCERY_LEXICON = [
  // latticini
  'latte','latte zymil','yogurt','burro','mozzarella','ricotta','parmigiano','grana padano','formaggio spalmabile',
  // dispensa
  'pane','pasta','spaghetti','penne','riso','farina','zucchero','sale','olio evo','olio di semi','aceto','passata di pomodoro','pelati',
  // colazione
  'biscotti','cereali','fette biscottate','marmellata','nutella','caffè','the','tè',
  // carne/pesce
  'pollo','petto di pollo','bistecche','tritato','prosciutto','tonno in scatola','salmone',
  // surgelati
  'piselli surgelati','spinaci surgelati','patatine surgelate','gelato',
  // igiene/casa
  'detersivo','detersivo piatti','detersivo lavatrice','ammorbidente','candeggina','spugne','carta igienica','scottex','sacchetti immondizia',
  // verdura/frutta
  'insalata','pomodori','zucchine','melanzane','patate','cipolle','aglio','mele','banane','arance','limoni',
  // varie
  'uova','acqua','birra','vino','tortillas','piadine','affettati'
];

/* ---------------- helpers: parsing liste ---------------- */
function parseLinesToItems(text) {
  const chunks = String(text || '')
    .split(/[\n,]+/g)
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

// elenco "libero" -> cerca frasi del lessico dentro il testo
function extractItemsWithLexicon(text) {
  const s = ' ' + String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + ' ';
  const found = [];
  // ordina per lunghezza desc per catturare frasi multi-parola prima (es. “detersivo piatti”)
  const phrases = [...GROCERY_LEXICON].sort((a,b)=>b.length-a.length);
  for (const p of phrases) {
    const pat = ' ' + p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + ' ';
    if (s.includes(pat)) {
      found.push({ id:'tmp-'+Math.random().toString(36).slice(2), name:p, brand:'', qty:1, purchased:false });
    }
  }
  // de-dup by name
  const seen = new Set();
  return found.filter(it => {
    const k = it.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// parser “loose” su spazi/e
function parseLooseList(text) {
  const base = extractItemsWithLexicon(text);
  if (base.length) return base;
  const s = String(text || '').toLowerCase().trim();
  if (!s || /[\n,]/.test(s)) return [];
  const parts = s.split(/\s+e\s+|[\s]+/gi).map(t => t.trim()).filter(Boolean);
  const stop = new Set(['il','lo','la','i','gli','le','uno','una','un','dei','degli','delle','di','del','della','dello','dell','dal','dallo','dalla','dall','alle','allo','alla','all','al','ai','agli','a','e','ed','oppure','o']);
  const tokens = parts.filter(t => !stop.has(t) && t.length >= 2);
  if (tokens.length < 2) return [];
  return tokens.map(name => ({ id:'tmp-'+Math.random().toString(36).slice(2), name, brand:'', qty:1, purchased:false }));
}

/* ---------------- helpers scadenze ---------------- */
function toISODate(any) {
  const s = String(any || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // 15/10/2025, 3-7-26, 3 luglio 2026
  const num = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (num) {
    const d = String(num[1]).padStart(2, '0');
    const M = String(num[2]).padStart(2, '0');
    let y = String(num[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  // "3 luglio 2026"
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

// estrae coppie "prodotto -> data" da voce
function parseExpiryPairs(text) {
  const out = [];
  const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const s = norm(text);
  // prova match su lessico: cerca “<item> ... <data>”
  for (const p of GROCERY_LEXICON) {
    const k = norm(p);
    const idx = s.indexOf(k);
    if (idx >= 0) {
      // cattura fino a 40 caratteri dopo e cerca data
      const tail = s.slice(idx, idx+80);
      const maybeDate = tail.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(\d{1,2}\s+[a-zà-ú]+\s+\d{2,4})/i);
      if (maybeDate) {
        const iso = toISODate(maybeDate[0]);
        if (iso) out.push({ name:p, expiresAt: iso });
      }
    }
  }
  // fallback: “latte scade il 15/10/2025”
  const re = /([a-zà-ú\s]{2,}?)\s+scade(?:\s+il)?\s+([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}|[0-9]{1,2}\s+[a-zà-ú]+\s+[0-9]{2,4})/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = String(m[1]).trim();
    const iso = toISODate(m[2]);
    if (name && iso) out.push({ name, expiresAt: iso });
  }
  return out;
}

/* ---------------- similarity + utils ---------------- */
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

/* ---------------- component ---------------- */
export default function ListeProdotti() {
  const [currentList, setCurrentList] = useState(LIST_TYPES.ONLINE);

  // Liste
  const [lists, setLists] = useState({
    [LIST_TYPES.SUPERMARKET]: [],
    [LIST_TYPES.ONLINE]: [],
  });

  const [form, setForm] = useState({ name: '', brand: '', qty: '1' });

  // Scorte & critici
  const [stock, setStock] = useState([]);       // [{name,brand,qty,expiresAt?}]
  const [critical, setCritical] = useState([]); // subset di stock

  // Report offerte
  const [offers, setOffers] = useState([]);

  // Stato UI
  const [busy, setBusy] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // refs voce/OCR
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const ocrInputRef = useRef(null);

  // OCR scadenza per riga
  const rowOcrInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);

  // Scadenza manuale
  const [expiryForm, setExpiryForm] = useState({ name: '', brand: '', qty: '1', expiresAt: '' });

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

  /* --------------- helpers UI --------------- */
  function showToast(msg, type='info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  /* ----------------- LISTE: add/remove/inc/Comprato ----------------- */
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
    // click manuale: segna comprato + scala 1 + aggiorna scorte sulla riga esistente (se presente)
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
      // aggiorna scorte: se prodotto già presente per similarity, aumenta qty; altrimenti crea (qui sì: deriva da acquisto reale)
      setStock(prev => {
        const arr = [...prev];
        const idx = arr.findIndex(s => isSimilar(s.name, item.name) && (!item.brand || isSimilar(s.brand||'', item.brand)));
        if (idx >= 0) arr[idx] = { ...arr[idx], qty: Number(arr[idx].qty || 0) + 1 };
        else arr.unshift({ name: item.name, brand: item.brand, qty: 1, expiresAt: '' });
        return arr;
      });
    }
  }

  function parseAndAppend(text) {
    // 1) assistant (fatto altrove) -> qui fallback locali
    let items = parseLinesToItems(text);
    if (items.length <= 1) {
      const loose = parseLooseList(text);
      if (loose.length >= 2) items = loose;
    }
    // 2) merge in lista corrente
    if (items.length) {
      setLists(prev => {
        const next = { ...prev };
        const existing = [...(prev[currentList] || [])];
        for (const it of items) {
          const idx = existing.findIndex(i => i.name.toLowerCase() === it.name.toLowerCase() && (i.brand||'').toLowerCase() === (it.brand||'').toLowerCase());
          if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + Number(it.qty || 1) };
          else existing.push(it);
        }
        next[currentList] = existing;
        return next;
      });
    }
    // 3) eventuali link offerte
    const urls = (String(text||'').match(/\bhttps?:\/\/[^\s)]+/gi) || []).slice(0, 50);
    if (urls.length) setOffers(prev => [...urls.map(u => ({ url: u, addedAt: new Date().toISOString() })), ...prev]);
  }

  /* ----------------- Assistant: VOCE per lista ----------------- */
  async function sendToAssistantVoice(text) {
    const payload = {
      assistantId: ASSISTANT_ID_VOICE,
      prompt: [
        'Sei Jarvis. Capisci una LISTA SPESA.',
        'Restituisci SOLO JSON come { "items":[{ "name":"latte","brand":"Parmalat","qty":2 }, ...] }.',
        'Considera anche queste voci comuni:',
        GROCERY_LEXICON.join(', '),
        '',
        'Testo:',
        text
      ].join('\n'),
    };
    const res = await fetch(API_ASSISTANT_TEXT, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const { answer, error } = await res.json();
    if (!res.ok || error) throw new Error(error || String(res.status));
    const data = typeof answer === 'string' ? JSON.parse(answer) : answer;
    const arr = Array.isArray(data?.items) ? data.items : [];
    if (!arr.length) throw new Error('Nessun item dal modello');

    // merge
    setLists(prev => {
      const next = { ...prev };
      const existing = [...(prev[currentList] || [])];
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
      next[currentList] = existing;
      return next;
    });
  }

  /* ----------------- Assistant: OCR generico (scontrini) ----------------- */
  function decrementListsByPurchases(prevLists, purchases) {
    const next = { ...prevLists };
    for (const lt of Object.values(LIST_TYPES)) {
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
    }
    return next;
  }

  async function sendToAssistantOCR(files) {
    const fd = new FormData();
    fd.append('assistantId', ASSISTANT_ID_OCR);
    files.forEach((f) => fd.append('files', f));
    fd.append('hints', JSON.stringify({ lexicon: GROCERY_LEXICON }));

    const res = await fetch(API_ASSISTANT_OCR, { method: 'POST', body: fd });
    const { data, text, error } = await res.json();
    if (!res.ok || error) throw new Error(error || String(res.status));

    if (text) parseAndAppend(text);

    const purchases = Array.isArray(data?.purchases) ? data.purchases : [];
    const expiries  = Array.isArray(data?.expiries)  ? data.expiries  : [];
    const stockArr  = Array.isArray(data?.stock)     ? data.stock     : [];

    if (purchases.length) {
      setLists(prev => decrementListsByPurchases(prev, purchases));
      // aggiorna scorte
      setStock(prev => {
        const arr = [...prev];
        for (const p of purchases) {
          const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
          if (idx >= 0) {
            arr[idx] = {
              ...arr[idx],
              qty: Number(arr[idx].qty || 0) + Math.max(1, Number(p.qty||1)),
              expiresAt: p.expiresAt ? toISODate(p.expiresAt) || arr[idx].expiresAt : arr[idx].expiresAt
            };
          } else {
            arr.unshift({
              name: p.name, brand: p.brand || '', qty: Math.max(1, Number(p.qty||1)), expiresAt: toISODate(p.expiresAt) || ''
            });
          }
        }
        return arr;
      });
      // invia alle finanze (best-effort)
      try {
        await fetch(API_FINANCES_INGEST, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ purchases }) });
      } catch {}
    }

    // scadenze standalone o stato scorte da OCR
    setStock(prev => {
      let arr = [...prev];
      const apply = (rec) => {
        const idx = arr.findIndex(s => isSimilar(s.name, rec.name) && (!rec.brand || isSimilar(s.brand||'', rec.brand)));
        const ex = toISODate(rec.expiresAt);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], expiresAt: ex || arr[idx].expiresAt, qty: Number(arr[idx].qty || 0) + Math.max(0, Number(rec.qty||0)) };
        } // se non esiste NON creiamo nuove righe per scadenze singole
      };
      (expiries||[]).forEach(apply);
      (stockArr||[]).forEach(apply);
      return arr;
    });
  }

  /* ----------------- Vocale LISTA: mic ----------------- */
  async function toggleRec() {
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

      try {
        await sendToAssistantVoice(text);
        showToast('Lista aggiornata da Vocale ✓', 'ok');
      } catch {
        parseAndAppend(text);
        showToast('Aggiornato (parser locale) ✓', 'ok');
      }
    } catch (err) {
      alert('Errore nel riconoscimento vocale');
    } finally {
      setRecBusy(false);
      setBusy(false);
      try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
    }
  }

  /* ----------------- Scadenze: manuale / vocale / OCR per riga ----------------- */
  // 1) manuale -> deve aggiornare SOLO righe esistenti
  function onExpiryManualSubmit(e) {
    e.preventDefault();
    const qtyDelta = Math.max(0, Number(String(expiryForm.qty).replace(',', '.')) || 0);
    const exISO = toISODate(expiryForm.expiresAt);
    let updated = false;
    setStock(prev => {
      const arr = [...prev];
      const idx = arr.findIndex(s => isSimilar(s.name, expiryForm.name) && (!expiryForm.brand || isSimilar(s.brand||'', expiryForm.brand)));
      if (idx >= 0) {
        arr[idx] = {
          ...arr[idx],
          qty: Number(arr[idx].qty || 0) + qtyDelta,
          expiresAt: exISO || arr[idx].expiresAt
        };
        updated = true;
      }
      return arr;
    });
    if (updated) {
      setExpiryForm({ name: '', brand: '', qty: '1', expiresAt: '' });
      showToast('Scadenza aggiornata ✓', 'ok');
    } else {
      showToast('Prodotto non presente in Stato Scorte', 'err');
    }
  }

  // 2) vocale scadenza (usa STT, PARSER -> aggiorna righe esistenti)
  async function voiceExpiry() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e)=>{ if(e.data?.size) chunks.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type:'audio/webm' });
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
              if (idx >= 0) {
                arr[idx] = { ...arr[idx], expiresAt: p.expiresAt || arr[idx].expiresAt };
                hit++;
              }
            }
            return arr;
          });
          showToast(hit ? `Aggiornate ${hit} scadenze ✓` : 'Nessun prodotto corrispondente', hit ? 'ok' : 'err');
        } finally {
          setBusy(false);
          try { stream.getTracks().forEach(t=>t.stop()); } catch {}
        }
      };
      rec.start(); setTimeout(()=>rec.stop(), 3000); // 3s “nota rapida”
    } catch {
      alert('Microfono non disponibile');
    }
  }

  // 3) OCR scadenza per riga (foto confezione) -> aggiorna SOLO quella riga
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
    } catch (e) {
      showToast('Errore OCR scadenza', 'err');
    } finally {
      setBusy(false);
      setTargetRowIdx(null);
      // reset input
      if (rowOcrInputRef.current) rowOcrInputRef.current.value = '';
    }
  }

  /* ----------------- OCR generico: handler ----------------- */
  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      setBusy(true);
      await sendToAssistantOCR(files);
      showToast('OCR elaborato ✓', 'ok');
    } catch (err) {
      alert('Errore OCR/Assistant');
    } finally {
      setBusy(false);
    }
  }

  /* ----------------- Vocale lista: hook microfono ----------------- */
  // (già implementato sopra con toggleRec/processVoiceList)

  /* ----------------- Operator AI ----------------- */
  async function connectOperator() {
    try {
      setBusy(true);
      const res = await fetch(API_OPERATOR_CONNECT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listType: currentList }) });
      if (!res.ok) throw new Error(res.status);
      showToast('Operator AI collegato ✓', 'ok');
    } catch {
      showToast('Errore collegamento Operator', 'err');
    } finally {
      setBusy(false);
    }
  }

  /* ----------------- render ----------------- */
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

          {/* Comandi principali */}
          <div style={styles.toolsRow}>
            <button onClick={toggleRec} style={styles.voiceBtn} disabled={busy}>
              {recBusy ? '⏹️ Stop' : '🎙 Vocale'}
            </button>
          </div>

          {/* Seconda riga: OCR + Operator AI */}
          <div style={styles.toolsRowSecondary}>
            <button onClick={() => ocrInputRef.current?.click()} style={styles.ocrBtn} disabled={busy}>📷 OCR</button>
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              multiple
              hidden
              onChange={(e) => handleOCR(Array.from(e.target.files || []))}
            />
            <button onClick={connectOperator} style={styles.operatorBtn} disabled={busy}>🌐 Collega a Operator AI</button>
          </div>

          {/* Lista corrente */}
          <div style={styles.section}>
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
              Suggerimenti voce/OCR: “2 latte parmalat, 3 pasta barilla, uova” oppure “pane pasta latte detersivo”.
            </p>
          </div>

          {/* Prodotti in esaurimento / scadenza */}
          <div style={styles.sectionXL}>
            <h3 style={styles.h3}>📦 Prodotti in esaurimento / scadenza</h3>

            {/* Mini form scadenza manuale (aggiorna esistenti) */}
            <form onSubmit={onExpiryManualSubmit} style={{...styles.formRow, marginBottom: 12}}>
              <input placeholder="Prodotto già presente (es. latte)" value={expiryForm.name}
                     onChange={e=>setExpiryForm(f=>({...f, name:e.target.value}))} style={styles.input} required />
              <input placeholder="Marca (se serve)" value={expiryForm.brand}
                     onChange={e=>setExpiryForm(f=>({...f, brand:e.target.value}))} style={styles.input} />
              <input placeholder="Q.tà (facolt.)" inputMode="decimal" value={expiryForm.qty}
                     onChange={e=>setExpiryForm(f=>({...f, qty:e.target.value}))} style={{...styles.input, width: 120}} />
              <input placeholder="Scadenza (dd/mm/yyyy o yyyy-mm-dd)" value={expiryForm.expiresAt}
                     onChange={e=>setExpiryForm(f=>({...f, expiresAt:e.target.value}))} style={{...styles.input, minWidth:260}} />
              <button style={styles.primaryBtn} disabled={busy}>Aggiorna scadenza</button>
            </form>
            <div style={{display:'flex', gap:8, marginBottom:14}}>
              <button onClick={voiceExpiry} style={styles.voiceBtnSmall} disabled={busy}>🎙 Vocale scadenza</button>
              <button onClick={() => ocrInputRef.current?.click()} style={styles.ocrBtnSmall} disabled={busy}>📷 OCR scontrino</button>
            </div>

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

          {/* Stato scorte (con OCR per riga) */}
          <div style={styles.sectionXL}>
            <h3 style={styles.h3}>📊 Stato Scorte</h3>
            {stock.length === 0 ? (
              <p style={{opacity:.8}}>Nessun dato scorte</p>
            ) : (
              <table style={styles.table}>
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
          </div>

          {/* Report offerte settimanali */}
          <div style={styles.sectionXL}>
            <h3 style={styles.h3}>📈 Report Offerte settimanali</h3>
            {offers.length === 0 ? (
              <p style={{opacity:.8}}>Qui appariranno i link delle offerte trovate (anche da OCR/scontrini).</p>
            ) : (
              <ul style={{margin:'6px 0 0', paddingLeft:'18px'}}>
                {offers.map((o, idx) => (
                  <li key={idx}>
                    <a href={o.url} target="_blank" rel="noreferrer" style={{color:'#93c5fd', textDecoration:'underline'}}>
                      {o.url}
                    </a>
                    <span style={{opacity:.7}}> — aggiunto {new Date(o.addedAt).toLocaleDateString('it-IT')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Toast */}
          {toast && (
            <div style={{
              position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
              background: toast.type==='ok' ? '#16a34a' : (toast.type==='err' ? '#ef4444' : '#334155'),
              color:'#fff', padding:'10px 14px', borderRadius:10, boxShadow:'0 6px 16px rgba(0,0,0,.35)'
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
    padding: 30, display: 'flex', alignItems: 'center', justifyContent:'center', color:'#fff',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
  },
  card: { width:'100%', maxWidth: 1000, background:'rgba(0,0,0,.6)', borderRadius: 16, padding: 24, boxShadow: '0 6px 16px rgba(0,0,0,.3)' },
  headerRow: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 },
  homeBtn: { background:'#6366f1', color:'#fff', padding:'8px 12px', borderRadius:10, textDecoration:'none' },

  switchRow: { display:'flex', gap:12, margin: '18px 0 12px' },
  switchBtn: { background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer' },
  switchBtnActive: { background:'#06b6d4', border:'0', color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },

  toolsRow: { display:'flex', flexWrap:'wrap', gap:12, margin:'12px 0 10px' },
  toolsRowSecondary: { display:'flex', flexWrap:'wrap', gap:12, margin:'4px 0 26px' },

  voiceBtn: { background:'#6366f1', border:0, color:'#fff', padding:'10px 14px', borderRadius:12, cursor:'pointer', fontWeight:800 },
  ocrBtn: { background:'#06b6d4', border:0, color:'#0b1220', padding:'10px 14px', borderRadius:12, cursor:'pointer', fontWeight:900 },
  operatorBtn: { background:'#22c55e', border:0, color:'#0f172a', padding:'10px 14px', borderRadius:12, cursor:'pointer', fontWeight:900 },

  section: { marginTop: 26, marginBottom: 12 },
  sectionLarge: { marginTop: 34, marginBottom: 16 },
  sectionXL: { marginTop: 42, marginBottom: 18 },
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

  voiceBtnSmall: { background:'#6366f1', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },
  ocrBtnSmall: { background:'#06b6d4', border:0, color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },

  ocrInlineBtn: { background:'rgba(6,182,212,.15)', border:'1px solid rgba(6,182,212,.6)', color:'#e0fbff', padding:'6px 10px', borderRadius:10, cursor:'pointer', fontWeight:700 }
};
