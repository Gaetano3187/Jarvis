// pages/liste-prodotti.js
// FIX REVERBERO DATI:
//   1. removeItem ora cancella su Supabase (DELETE per id) prima di aggiornare lo state
//   2. Cloud sync non fa più DELETE+INSERT a tappeto — usa upsert per id
//   3. Hydration: Supabase è la sorgente di verità, localStorage è solo cache offline
//   4. Nessun conflitto: se Supabase ha dati, quelli vincono sempre sul localStorage

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Camera, Calendar } from 'lucide-react';

/* =========================================================================================
   LESSICO BASE
========================================================================================= */
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

const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;

/* =========================================================================================
   UTILITY
========================================================================================= */
function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
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
  const num = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (num) {
    const d = String(num[1]).padStart(2,'0'), M = String(num[2]).padStart(2,'0');
    let y = String(num[3]); if (y.length===2) y=(Number(y)>=70?'19':'20')+y;
    return `${y}-${M}-${d}`;
  }
  return '';
}

const CLOUD_TABLE = 'shopping_list';
let __supabase = null;

/* =========================================================================================
   PERSISTENZA LOCALE (cache offline — non è la sorgente di verità)
========================================================================================= */
const LS_KEY = 'jarvis_liste_prodotti@v2'; // v2: formato nuovo, incompatibile col vecchio
function loadCached() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveCache(lists, currentList) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LS_KEY, JSON.stringify({ lists, currentList, at: Date.now() }));
  } catch {}
}

/* =========================================================================================
   COMPONENTE
========================================================================================= */
export default function ListeProdotti() {
  const [currentList, setCurrentList] = useState(LIST_TYPES.SUPERMARKET);
  const [lists, setLists]             = useState({ [LIST_TYPES.SUPERMARKET]: [], [LIST_TYPES.ONLINE]: [] });
  const [stock, setStock]             = useState([]);
  const [critical, setCritical]       = useState([]);
  const [busy, setBusy]               = useState(false);
  const [toast, setToast]             = useState(null);

  const [form, setForm]               = useState({ name:'', brand:'', packs:'1', unitsPerPack:'1', unitLabel:'unità' });
  const [showListForm, setShowListForm] = useState(false);
  const [editingRow, setEditingRow]   = useState(null);
  const [editDraft, setEditDraft]     = useState({ name:'', brand:'', packs:'0', unitsPerPack:'1', unitLabel:'unità', expiresAt:'', residueUnits:'0', _ruTouched:false });

  const [imagesIndex, setImagesIndex] = useState({});
  const userIdRef     = useRef(null);
  const cloudSyncing  = useRef(false); // mutex per evitare sync paralleli

  const ocrInputRef       = useRef(null);
  const rowOcrInputRef    = useRef(null);
  const rowImageInputRef  = useRef(null);
  const [targetRowIdx, setTargetRowIdx]     = useState(null);
  const [targetImageIdx, setTargetImageIdx] = useState(null);

  // Vocale
  const mediaRecRef     = useRef(null);
  const recordedChunks  = useRef([]);
  const streamRef       = useRef(null);
  const [recBusy, setRecBusy] = useState(false);
  const invMediaRef     = useRef(null);
  const invChunksRef    = useRef([]);
  const invStreamRef    = useRef(null);
  const [invRecBusy, setInvRecBusy] = useState(false);

  function showToast(msg, type='ok') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  /* =====================================================================
     INIT: carica da Supabase (sorgente di verità) — localStorage è backup
  ===================================================================== */
  useEffect(() => {
    let mounted = true;
    (async () => {
      // Prima mostra i dati cached così la UI non è vuota
      const cached = loadCached();
      if (cached?.lists) {
        setLists({
          [LIST_TYPES.SUPERMARKET]: Array.isArray(cached.lists[LIST_TYPES.SUPERMARKET]) ? cached.lists[LIST_TYPES.SUPERMARKET] : [],
          [LIST_TYPES.ONLINE]:      Array.isArray(cached.lists[LIST_TYPES.ONLINE])      ? cached.lists[LIST_TYPES.ONLINE]      : [],
        });
      }
      if (cached?.currentList) setCurrentList(cached.currentList);

      // Poi carica da Supabase — sovrascrive la cache
      try {
        const mod = await import('../lib/supabaseClient').catch(() => null);
        if (!mod?.supabase) return;
        __supabase = mod.supabase;

        const { data: userData } = await __supabase.auth.getUser();
        const uid = userData?.user?.id || null;
        if (!mounted) return;
        userIdRef.current = uid;
        if (!uid) return;

        // Liste della spesa
        const { data: cloudRows, error: listErr } = await __supabase
          .from(CLOUD_TABLE)
          .select('id, name, brand, qty, units_per_pack, unit_label, list_type, purchased')
          .eq('user_id', uid)
          .eq('purchased', false)
          .order('added_at', { ascending: true });

        if (!listErr && Array.isArray(cloudRows) && mounted) {
          const superItems  = cloudRows.filter(r => r.list_type === LIST_TYPES.SUPERMARKET);
          const onlineItems = cloudRows.filter(r => r.list_type === LIST_TYPES.ONLINE);
          const newLists = {
            [LIST_TYPES.SUPERMARKET]: superItems,
            [LIST_TYPES.ONLINE]:      onlineItems,
          };
          setLists(newLists);
          saveCache(newLists, currentList);
        }

        // Inventory / scorte
        const { data: invRows, error: invErr } = await __supabase
          .from('inventory')
          .select('id, product_name, brand, category, qty, initial_qty, packs, unit, units_per_pack, unit_label, expiry_date, avg_price, consumed_pct, image_url')
          .eq('user_id', uid)
          .order('product_name', { ascending: true });

        if (!invErr && Array.isArray(invRows) && mounted) {
          setStock(invRows.map(r => ({
            id:           r.id,
            name:         r.product_name,
            brand:        r.brand || '',
            category:     r.category || 'alimentari',
            // qty = unità totali, packs = confezioni fisiche
            qty:          Number(r.qty || 1),
            packs:        Number(r.packs || r.qty || 1),
            initialPacks: Number(r.initial_qty || 1),
            unitsPerPack: Number(r.units_per_pack || 1),
            unitLabel:    r.unit_label || r.unit || 'pz',
            expiresAt:    r.expiry_date || '',
            priceEach:    Number(r.avg_price || 0),
            consumedPct:  Number(r.consumed_pct || 0),
            imageUrl:     r.image_url || null,
          })));
        }
      } catch (e) { if (DEBUG) console.warn('[init] fail', e); }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =====================================================================
     AGGIORNA CACHE LOCALE quando cambiano le liste
  ===================================================================== */
  const cacheTimer = useRef(null);
  useEffect(() => {
    if (cacheTimer.current) clearTimeout(cacheTimer.current);
    cacheTimer.current = setTimeout(() => saveCache(lists, currentList), 500);
    return () => clearTimeout(cacheTimer.current);
  }, [lists, currentList]);

  /* =====================================================================
     CRITICI
  ===================================================================== */
  useEffect(() => {
    const crit = stock.filter(p => {
      const pct = p.initialPacks > 0 ? p.packs / p.initialPacks : 1;
      const lowResidue = pct < 0.20;
      const expSoon = (() => {
        if (!p?.expiresAt) return false;
        const d = new Date(p.expiresAt); if (isNaN(d)) return false;
        return Math.floor((d - new Date()) / 86400000) <= 10;
      })();
      return lowResidue || expSoon;
    });
    setCritical(crit);
  }, [stock]);

  /* =====================================================================
     LISTE: azioni — ogni modifica va anche su Supabase
  ===================================================================== */

  // Aggiunge un prodotto alla lista
  async function addManualItem(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const brand        = form.brand.trim();
    const qty          = Math.max(1, Number(form.packs) || 1);
    const unitsPerPack = Math.max(1, Number(form.unitsPerPack) || 1);
    const unitLabel    = form.unitLabel.trim() || 'unità';

    // Salva su Supabase
    let newId = 'tmp-' + Math.random().toString(36).slice(2);
    if (__supabase && userIdRef.current) {
      try {
        const { data, error } = await __supabase
          .from(CLOUD_TABLE)
          .insert([{
            user_id:        userIdRef.current,
            name,
            brand:          brand || null,
            qty,
            units_per_pack: unitsPerPack,
            unit_label:     unitLabel,
            list_type:      currentList,
            purchased:      false,
            added_at:       new Date().toISOString(),
          }])
          .select('id')
          .single();
        if (!error && data?.id) newId = data.id;
      } catch (err) { if (DEBUG) console.warn('[addItem]', err); }
    }

    setLists(prev => {
      const items = [...(prev[currentList] || [])];
      const idx = items.findIndex(i =>
        normKey(i.name) === normKey(name) && normKey(i.brand||'') === normKey(brand)
      );
      if (idx >= 0) {
        items[idx] = { ...items[idx], qty: Number(items[idx].qty || 0) + qty };
      } else {
        items.push({ id: newId, name, brand, qty, unitsPerPack, unitLabel, purchased: false });
      }
      return { ...prev, [currentList]: items };
    });

    setForm({ name:'', brand:'', packs:'1', unitsPerPack:'1', unitLabel:'unità' });
    setShowListForm(false);
  }

  // RIMOZIONE: cancella da Supabase, poi aggiorna state
  async function removeItem(id) {
    // Prima cancella dal DB
    if (__supabase && userIdRef.current && !String(id).startsWith('tmp-')) {
      try {
        const { error } = await __supabase
          .from(CLOUD_TABLE)
          .delete()
          .eq('id', id)
          .eq('user_id', userIdRef.current);
        if (error) {
          console.error('[removeItem] delete error:', error);
          showToast('Errore cancellazione: ' + error.message, 'err');
          return; // non aggiornare lo state se il DB ha fallito
        }
      } catch (err) {
        console.error('[removeItem] exception:', err);
        showToast('Errore di rete', 'err');
        return;
      }
    }
    // Solo dopo aggiorna lo state locale
    setLists(prev => ({
      ...prev,
      [currentList]: (prev[currentList] || []).filter(i => i.id !== id)
    }));
  }

  // Incremento/decremento qty
  async function incQty(id, delta) {
    setLists(prev => {
      const items = (prev[currentList] || []).map(i => {
        if (i.id !== id) return i;
        return { ...i, qty: Math.max(0, Number(i.qty || 0) + delta) };
      }).filter(i => i.qty > 0);
      return { ...prev, [currentList]: items };
    });

    // Aggiorna qty su Supabase
    if (__supabase && userIdRef.current && !String(id).startsWith('tmp-')) {
      const item = lists[currentList]?.find(i => i.id === id);
      if (item) {
        const newQty = Math.max(0, Number(item.qty || 0) + delta);
        if (newQty <= 0) {
          await __supabase.from(CLOUD_TABLE).delete().eq('id', id).eq('user_id', userIdRef.current);
        } else {
          await __supabase.from(CLOUD_TABLE).update({ qty: newQty }).eq('id', id).eq('user_id', userIdRef.current);
        }
      }
    }
  }

  /* =====================================================================
     EDIT SCORTE
  ===================================================================== */
  function startRowEdit(index, row) {
    setEditingRow(index);
    setEditDraft({
      name:         row.name || '',
      brand:        row.brand || '',
      packs:        String(row.packs ?? 1),
      unitsPerPack: String(row.unitsPerPack ?? 1),
      unitLabel:    row.unitLabel || 'pz',
      expiresAt:    row.expiresAt || '',
      residueUnits: String(row.packs ?? 0),
      _ruTouched:   false,
    });
  }
  function handleEditDraftChange(field, value) {
    setEditDraft(prev => ({ ...prev, [field]: value, ...(field==='residueUnits'?{_ruTouched:true}:{}) }));
  }
  function cancelRowEdit() { setEditingRow(null); }

  async function saveRowEdit(index) {
    const row        = stock[index];
    const name       = editDraft.name.trim();
    const newPacks   = Math.max(0, Number(editDraft.packs) || 0);
    const newUpp     = Math.max(1, Number(editDraft.unitsPerPack) || 1);
    const expiry     = toISODate(editDraft.expiresAt || '');

    setStock(prev => {
      const arr = [...prev];
      arr[index] = { ...arr[index], name, brand: editDraft.brand.trim(),
        packs: newPacks, unitsPerPack: newUpp, unitLabel: editDraft.unitLabel, expiresAt: expiry };
      return arr;
    });

    if (__supabase && userIdRef.current && row?.id) {
      try {
        await __supabase.from('inventory').update({
          product_name:   name,
          qty:            newPacks,
          units_per_pack: newUpp,
          unit:           editDraft.unitLabel,
          expiry_date:    expiry || null,
        }).eq('id', row.id).eq('user_id', userIdRef.current);
      } catch (err) { if (DEBUG) console.warn('[saveRowEdit]', err); }
    }
    setEditingRow(null);
  }

  async function deleteStockRow(index) {
    const row = stock[index];
    // Cancella da Supabase
    if (__supabase && userIdRef.current && row?.id) {
      try {
        await __supabase.from('inventory').delete().eq('id', row.id).eq('user_id', userIdRef.current);
      } catch (err) { if (DEBUG) console.warn('[deleteStockRow]', err); }
    }
    setStock(prev => prev.filter((_, i) => i !== index));
  }

  /* =====================================================================
     OCR scontrino
  ===================================================================== */
  async function handleOCR(files) {
    if (!files?.length || busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', files[0], files[0].name || 'receipt.jpg');

      const r = await fetch('/api/ocr-smart', { method:'POST', body: fd });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'OCR fallito');

      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) { showToast('Nessun prodotto riconosciuto', 'err'); return; }

      // Aggiorna inventory su Supabase
      if (__supabase && userIdRef.current) {
        const uid = userIdRef.current;
        const today = new Date().toISOString().slice(0,10);
        for (const item of items) {
          if (!item.name) continue;
          const { data: existing } = await __supabase
            .from('inventory').select('id, qty').eq('user_id', uid)
            .ilike('product_name', `%${item.name.split(' ')[0]}%`).maybeSingle();

          if (existing) {
            await __supabase.from('inventory').update({
              qty:          Number(existing.qty || 0) + Number(item.qty || 1),
              initial_qty:  Number(existing.qty || 0) + Number(item.qty || 1),
              consumed_pct: 0,
              avg_price:    item.unit_price || item.price || 0,
              last_updated: new Date().toISOString(),
              ...(item.expiry_date ? { expiry_date: item.expiry_date } : {}),
            }).eq('id', existing.id);
          } else {
            await __supabase.from('inventory').insert({
              user_id:      uid,
              product_name: item.name,
              category:     item.category_item || 'alimentari',
              qty:          Number(item.qty || 1),
              initial_qty:  Number(item.qty || 1),
              unit:         item.unit || 'pz',
              avg_price:    item.unit_price || item.price || 0,
              purchase_date:today,
              expiry_date:  item.expiry_date || null,
              consumed_pct: 0,
            });
          }
        }
        // Ricarica stock da Supabase
        const { data: invRows } = await __supabase.from('inventory')
          .select('id, product_name, category, qty, initial_qty, unit, expiry_date, avg_price, consumed_pct')
          .eq('user_id', uid).order('product_name', { ascending: true });
        if (Array.isArray(invRows)) {
          setStock(invRows.map(r => ({
            id: r.id, name: r.product_name, category: r.category || 'alimentari',
            packs: Number(r.qty || 1), initialPacks: Number(r.initial_qty || 1),
            unitLabel: r.unit || 'pz', expiresAt: r.expiry_date || '',
            priceEach: Number(r.avg_price || 0), consumedPct: Number(r.consumed_pct || 0),
          })));
        }
      }

      showToast(`OCR: ${items.length} prodotti aggiornati ✓`, 'ok');
    } catch (e) {
      showToast('Errore OCR: ' + e.message, 'err');
    } finally {
      setBusy(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  }

  /* =====================================================================
     VOCALE LISTE
  ===================================================================== */
  function pickAudioMime() {
    if (typeof window === 'undefined' || !window.MediaRecorder) return { mime:'audio/webm', ext:'webm' };
    const cand = [
      { mime:'audio/webm;codecs=opus', ext:'webm' },
      { mime:'audio/ogg;codecs=opus',  ext:'ogg'  },
      { mime:'audio/mp4',              ext:'m4a'  },
      { mime:'audio/webm',             ext:'webm' },
    ];
    for (const c of cand) { try { if (MediaRecorder.isTypeSupported?.(c.mime)) return c; } catch {} }
    return { mime:'', ext:'webm' };
  }

  async function toggleRecList() {
    if (recBusy) { try { mediaRecRef.current?.stop(); } catch {} return; }
    try {
      const { mime } = pickAudioMime();
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      streamRef.current = stream;
      mediaRecRef.current = new MediaRecorder(stream, mime ? { mimeType:mime } : undefined);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = e => { if (e.data?.size) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop = processVoiceList;
      mediaRecRef.current.start(250);
      setRecBusy(true);
    } catch { showToast('Microfono non disponibile', 'err'); }
  }

  async function processVoiceList() {
    try {
      try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      setRecBusy(false);
      const blob = new Blob(recordedChunks.current, { type:'audio/webm' });
      recordedChunks.current = [];
      const fd = new FormData(); fd.append('audio', blob, 'list.webm');
      setBusy(true);
      const r = await fetch('/api/stt', { method:'POST', body:fd });
      const js = await r.json().catch(()=>({}));
      const text = String(js?.text||'').trim();
      if (!text) throw new Error('Testo non riconosciuto');

      const resp = await fetch('/api/assistant', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt: `Sei Jarvis. Capisci una LISTA DI SPESA dal parlato. RISPONDI SOLO JSON:
{"items":[{"name":"","brand":"","qty":1,"unitsPerPack":1,"unitLabel":"unità"}]}
Lessico: ${GROCERY_LEXICON.join(', ')}
Testo: ${text}` })
      });
      const safe = await resp.json().catch(()=>({}));
      const answer = safe?.answer || '{}';
      const parsed = typeof answer==='string' ? JSON.parse(answer) : answer;
      const items  = Array.isArray(parsed?.items) ? parsed.items : [];
      if (!items.length) { showToast('Nessuna voce riconosciuta', 'err'); return; }

      // Aggiunge su Supabase e stato
      for (const raw of items) {
        const name = String(raw.name||'').trim();
        if (!name) continue;
        const brand = String(raw.brand||'').trim();
        const qty   = Math.max(1, Number(raw.qty||1));
        let newId = 'tmp-' + Math.random().toString(36).slice(2);

        if (__supabase && userIdRef.current) {
          const { data, error } = await __supabase.from(CLOUD_TABLE).insert([{
            user_id: userIdRef.current, name, brand: brand||null, qty,
            units_per_pack: Number(raw.unitsPerPack||1),
            unit_label: raw.unitLabel||'unità',
            list_type: currentList, purchased: false, added_at: new Date().toISOString(),
          }]).select('id').single();
          if (!error && data?.id) newId = data.id;
        }

        setLists(prev => {
          const arr = [...(prev[currentList]||[])];
          const idx = arr.findIndex(i => normKey(i.name)===normKey(name));
          if (idx>=0) arr[idx] = { ...arr[idx], qty: Number(arr[idx].qty||0)+qty };
          else arr.push({ id:newId, name, brand, qty, unitsPerPack:Number(raw.unitsPerPack||1), unitLabel:raw.unitLabel||'unità', purchased:false });
          return { ...prev, [currentList]: arr };
        });
      }
      showToast('Lista aggiornata da voce ✓', 'ok');
    } catch (e) {
      showToast('Errore vocale: ' + e.message, 'err');
    } finally {
      setBusy(false);
      mediaRecRef.current = null; streamRef.current = null;
    }
  }

  /* =====================================================================
     IMMAGINE RIGA SCORTA
  ===================================================================== */
  function handleRowImage(files, idx) {
    const file = files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setStock(prev => {
        const arr = [...prev];
        if (!arr[idx]) return prev;
        arr[idx] = { ...arr[idx], image: dataUrl };
        return arr;
      });
      showToast('Immagine aggiornata ✓', 'ok');
    };
    reader.readAsDataURL(file);
  }

  /* =====================================================================
     RENDER
  ===================================================================== */
  return (
    <>
      <Head><title>🛍 Lista Prodotti</title></Head>

      <div style={S.page}>
        <div style={S.card}>

          {/* ── SEZ 1: LISTA ── */}
          <section style={S.sectionBox}>
            <p style={S.kicker}>scegli la lista che vuoi</p>

            <div style={S.switchRow}>
              {[LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].map(lt => (
                <button key={lt} type="button" onClick={() => setCurrentList(lt)}
                  style={{ ...S.switchBtn, ...(currentList===lt ? S.switchBtnActive : {}) }}>
                  {lt === LIST_TYPES.SUPERMARKET ? '🛒 Supermercato' : '🌐 Online'}
                </button>
              ))}
            </div>

            <div style={S.toolsRow}>
              <button type="button" onClick={toggleRecList} disabled={busy} style={S.iconCircle}
                title={recBusy ? 'Stop registrazione' : 'Aggiungi con voce'}>
                🎤
              </button>
              <button onClick={() => setShowListForm(v=>!v)} style={S.iconCircle}
                title={showListForm ? 'Chiudi' : 'Aggiungi manualmente'}>
                ＋
              </button>
            </div>

            {showListForm && (
              <form onSubmit={addManualItem} style={S.formRow}>
                <input placeholder="Prodotto *" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={S.input} required />
                <input placeholder="Marca" value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} style={S.input} />
                <input placeholder="Qtà" inputMode="decimal" value={form.packs} onChange={e=>setForm(f=>({...f,packs:e.target.value}))} style={{...S.input,width:90}} required />
                <button style={S.primaryBtn} disabled={busy}>Aggiungi</button>
              </form>
            )}

            <div style={{ marginTop:10 }}>
              <h3 style={S.h3}>Lista: {currentList === LIST_TYPES.ONLINE ? 'Online' : 'Supermercato'}</h3>
              {(lists[currentList]||[]).length === 0
                ? <p style={{opacity:.7}}>Nessun prodotto.</p>
                : (lists[currentList]||[]).map(it => (
                  <div key={it.id} style={S.listCard}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={S.rowName}>
                        {it.name}
                        {it.brand ? <span style={S.rowBrand}> · {it.brand}</span> : null}
                      </div>
                      <div style={S.rowMeta}>
                        {Number(it.units_per_pack||it.unitsPerPack||1) > 1
                          ? `${it.qty} conf. × ${it.units_per_pack||it.unitsPerPack} ${it.unit_label||it.unitLabel||'pz'} = ${Number(it.qty) * Number(it.units_per_pack||it.unitsPerPack)} totali`
                          : `${it.qty} ${it.unit_label||it.unitLabel||'pz'}`
                        }
                      </div>
                    </div>
                    <div style={S.rowActions}>
                      <button onClick={() => incQty(it.id,-1)} style={S.iconBtnSm}>−</button>
                      <button onClick={() => incQty(it.id,+1)} style={S.iconBtnSm}>+</button>
                      <button onClick={() => removeItem(it.id)} style={S.trashBtn}>🗑</button>
                    </div>
                  </div>
                ))
              }
            </div>
          </section>

          {/* ── SEZ 2: CRITICI ── */}
          {critical.length > 0 && (
            <section style={S.sectionBox}>
              <h3 style={S.h3}>⚠️ Scorte critiche ({critical.length})</h3>
              {critical.map((s,i) => {
                const pct = s.initialPacks > 0 ? Math.round((s.packs/s.initialPacks)*100) : 0;
                return (
                  <div key={i} style={S.critRow}>
                    <div style={{flex:1}}>{s.name}{s.brand ? <span style={S.rowBrand}> · {s.brand}</span> : null}</div>
                    <div style={{...S.progressOuter,flex:1}}>
                      <div style={{...S.progressInner,width:`${pct}%`,background:pct>30?'#f59e0b':'#ef4444'}}/>
                    </div>
                    <span style={{fontSize:'.8rem',opacity:.8,marginLeft:6}}>{pct}%</span>
                    {s.expiresAt && <span style={S.expiryChip}>scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}</span>}
                    <button onClick={() => { const idx=stock.findIndex(ss=>ss.id===s.id); if(idx>=0) deleteStockRow(idx); }}
                      style={{...S.iconCircle,color:'#f87171',marginLeft:6}}>
                      <Trash2 size={16}/>
                    </button>
                  </div>
                );
              })}
            </section>
          )}

          {/* ── SEZ 3: SCORTE ── */}
          <section style={S.sectionBox}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <button type="button" onClick={() => ocrInputRef.current?.click()} style={S.iconCircle} title="OCR Scontrino">
                📷
              </button>
              <h4 style={S.h3}>Tutte le scorte ({stock.length})</h4>
            </div>

            {stock.length === 0
              ? <p style={{opacity:.7}}>Nessuna scorta registrata.</p>
              : stock.map((s,idx) => {
                const pct = s.initialPacks > 0 ? Math.round((s.packs/s.initialPacks)*100) : 100;
                const upp          = Number(s.unitsPerPack || 1);
                const totalUnits   = Number(s.qty || s.packs || 1);
                const packsCount   = Number(s.packs || 1);
                const pct          = s.initialPacks > 0 ? Math.round((totalUnits / s.initialPacks) * 100) : 100;
                const showBreakdown = upp > 1 && packsCount > 0 && totalUnits !== packsCount;
                return (
                  <div key={s.id || idx} style={{...(idx%2===0 ? S.stockZ1 : S.stockZ2)}}>
                    {editingRow === idx ? (
                      <div>
                        <div style={S.formRow}>
                          <input style={S.input} value={editDraft.name} onChange={e=>handleEditDraftChange('name',e.target.value)} placeholder="Nome" />
                          <input style={S.input} value={editDraft.brand} onChange={e=>handleEditDraftChange('brand',e.target.value)} placeholder="Marca" />
                          <input style={{...S.input,width:100}} inputMode="decimal" value={editDraft.packs} onChange={e=>handleEditDraftChange('packs',e.target.value)} placeholder="N. confezioni" />
                          <input style={{...S.input,width:130}} inputMode="decimal" value={editDraft.unitsPerPack} onChange={e=>handleEditDraftChange('unitsPerPack',e.target.value)} placeholder="Unità/conf." />
                          <input style={{...S.input,width:160}} value={editDraft.expiresAt} onChange={e=>handleEditDraftChange('expiresAt',e.target.value)} placeholder="YYYY-MM-DD" />
                        </div>
                        <div style={{display:'flex',gap:8,marginTop:6}}>
                          <button onClick={() => saveRowEdit(idx)} style={S.smallOkBtn}>Salva</button>
                          <button onClick={cancelRowEdit} style={S.smallGhostBtn}>Annulla</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{display:'grid', gridTemplateColumns:'56px 1fr auto', gap:12, alignItems:'center'}}>

                        {/* Immagine prodotto */}
                        <div style={S.imgBox} onClick={() => { setTargetImageIdx(idx); rowImageInputRef.current?.click(); }} title="Cambia immagine">
                          {s.imageUrl || s.image
                            ? <img src={s.imageUrl || s.image} alt={s.name} style={S.imgThumb}
                                onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='grid'; }}
                              />
                            : null
                          }
                          <div style={{...S.imgPlaceholder, display: (s.imageUrl||s.image) ? 'none' : 'grid'}}>📦</div>
                        </div>

                        {/* Info prodotto */}
                        <div>
                          <div style={S.stockTitle}>
                            {s.name}
                            {s.brand ? <span style={S.rowBrand}> · {s.brand}</span> : null}
                          </div>
                          <div style={S.progressOuter}>
                            <div style={{...S.progressInner, width:`${pct}%`, background:pct>60?'#16a34a':pct>30?'#f59e0b':'#ef4444'}}/>
                          </div>
                          <div style={S.stockMeta}>
                            {showBreakdown
                              ? <span style={S.qtyBadge}>{packsCount} conf. × {upp} {s.unitLabel} = <strong>{totalUnits} {s.unitLabel}</strong></span>
                              : <span style={S.qtyBadge}><strong>{totalUnits} {s.unitLabel}</strong></span>
                            }
                            {s.expiresAt && (
                              <span style={S.expiryChip}>
                                ⏰ scade {new Date(s.expiresAt).toLocaleDateString('it-IT')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Azioni */}
                        <div style={S.rowActions}>
                          <button onClick={() => startRowEdit(idx,s)} style={S.iconCircle} title="Modifica"><Pencil size={16}/></button>
                          <button onClick={() => deleteStockRow(idx)} style={{...S.iconCircle,color:'#f87171'}} title="Elimina"><Trash2 size={16}/></button>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })
            }
          </section>

        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',
          background: toast.type==='ok'?'#16a34a':'#ef4444',
          color:'#fff',padding:'10px 18px',borderRadius:10,
          fontWeight:600,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,.4)'
        }}>
          {toast.msg}
        </div>
      )}

      {/* Back home */}
      <div style={{textAlign:'center',marginTop:16,paddingBottom:24}}>
        <Link href="/home" style={{color:'#94a3b8',fontSize:'.9rem'}}>← Home</Link>
      </div>

      {/* INPUT NASCOSTI */}
      <input ref={ocrInputRef} type="file" hidden
        onChange={e => { const f=Array.from(e.target.files||[]); e.target.value=''; if(f.length) handleOCR(f); }} />
      <input ref={rowImageInputRef} type="file" accept="image/*" hidden
        onChange={e => { const f=Array.from(e.target.files||[]); e.target.value='';
          if(f.length && typeof targetImageIdx==='number') { handleRowImage(f,targetImageIdx); setTargetImageIdx(null); }
        }} />
    </>
  );
}

/* =========================================================================================
   STILI
========================================================================================= */
const S = {
  page:  { minHeight:'100vh', padding:'20px 16px', color:'#f8f1dc', fontFamily:'Inter,sans-serif' },
  card:  { maxWidth:960, margin:'0 auto', border:'1px solid rgba(255,255,255,.06)', borderRadius:18, padding:16 },
  sectionBox: { marginTop:16, padding:14, borderRadius:14, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)' },
  kicker: { margin:'0 0 8px', fontSize:'.9rem', fontWeight:700, color:'#eaf7ff', borderLeft:'3px solid rgba(148,233,255,.6)', paddingLeft:10 },
  h3:    { margin:'4px 0 8px', fontSize:'1.1rem', fontWeight:700, color:'#f9fafb' },
  switchRow: { display:'flex', gap:10, marginBottom:10 },
  switchBtn: { padding:'8px 16px', borderRadius:10, border:'1px solid rgba(255,255,255,.15)', background:'rgba(255,255,255,.06)', color:'#cbd5e1', fontWeight:600, cursor:'pointer' },
  switchBtnActive: { background:'#1d4ed8', border:'1px solid #3b82f6', color:'#fff' },
  toolsRow: { display:'flex', gap:8, marginBottom:8 },
  iconCircle: { width:38, height:38, display:'grid', placeItems:'center', borderRadius:10, border:'1px solid rgba(255,255,255,.15)', background:'rgba(15,23,42,.4)', color:'#e5e7eb', cursor:'pointer', fontSize:'1rem' },
  formRow: { display:'flex', flexWrap:'wrap', gap:8, marginTop:8 },
  input: { flex:1, minWidth:120, padding:'8px 10px', borderRadius:8, border:'1px solid #475569', background:'rgba(15,23,42,.65)', color:'#f1f5f9' },
  primaryBtn: { padding:'9px 14px', borderRadius:8, background:'#16a34a', color:'#fff', fontWeight:700, border:'none', cursor:'pointer' },
  listCard: { display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:12, marginBottom:6, background:'linear-gradient(180deg,#7f1d1d,#991b1b)', border:'1px solid #450a0a' },
  rowName: { fontSize:'1rem', fontWeight:600, color:'#fff' },
  rowBrand: { opacity:.75, fontWeight:400, marginLeft:4 },
  rowMeta: { fontSize:'.82rem', opacity:.8, marginTop:2 },
  rowActions: { display:'flex', gap:6, alignItems:'center' },
  iconBtnSm: { width:32, height:32, display:'grid', placeItems:'center', borderRadius:8, border:'1px solid #334155', background:'rgba(15,23,42,.55)', color:'#f8fafc', fontWeight:800, cursor:'pointer' },
  trashBtn: { padding:'6px 10px', borderRadius:8, border:'1px solid #4b5563', background:'rgba(15,23,42,.6)', color:'#f87171', fontWeight:700, cursor:'pointer' },
  critRow: { display:'flex', alignItems:'center', gap:8, padding:'6px 4px', borderRadius:8, marginBottom:4 },
  progressOuter: { height:8, background:'rgba(255,255,255,.1)', borderRadius:4, overflow:'hidden', marginTop:4 },
  progressInner: { height:'100%', borderRadius:4, transition:'width .3s' },
  expiryChip: { marginLeft:6, padding:'1px 6px', borderRadius:6, background:'#7f1d1d', color:'#fee2e2', fontSize:'.72rem' },
  stockZ1: { padding:10, borderRadius:10, marginBottom:4, background:'rgba(255,255,255,.02)' },
  stockZ2: { padding:10, borderRadius:10, marginBottom:4, background:'rgba(0,0,0,.15)' },
  stockTitle: { fontSize:'1rem', fontWeight:600, marginBottom:4 },
  stockMeta: { fontSize:'.82rem', opacity:.85, marginTop:4 },
  smallOkBtn: { padding:'6px 12px', borderRadius:8, background:'#16a34a', color:'#fff', fontWeight:700, border:'none', cursor:'pointer' },
  smallGhostBtn: { padding:'6px 12px', borderRadius:8, background:'transparent', border:'1px solid #475569', color:'#e2e8f0', cursor:'pointer' },
  imgBox: { width:56, height:56, borderRadius:10, border:'1px dashed rgba(255,255,255,.25)', overflow:'hidden', cursor:'pointer', background:'rgba(255,255,255,.04)', position:'relative', flexShrink:0 },
  imgThumb: { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  imgPlaceholder: { width:'100%', height:'100%', placeItems:'center', fontSize:'1.4rem', color:'rgba(255,255,255,.3)' },
  qtyBadge: { fontSize:'.82rem', color:'rgba(255,255,255,.75)', marginRight:6 },
};

export async function getServerSideProps() { return { props:{} }; }