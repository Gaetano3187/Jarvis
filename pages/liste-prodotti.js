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
 *
 * Nota: se usi path diversi, cambia le costanti API_* qui sotto.
 */

const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };

// === CONFIG ===
const ASSISTANT_ID_VOICE = 'asst_LJmOc3h6JuVYiZXRQdtjnOlkchatgpt';
// Mi hai passato “assistantasst_…”. Se il backend richiede “asst_…”, aggiorna questa costante.
const ASSISTANT_ID_OCR = 'assistantasst_a1d9qqNpXnXU92lPJFV00TjZ';

const API_ASSISTANT_TEXT = '/api/assistant';
const API_ASSISTANT_OCR = '/api/assistant-ocr';
const API_FINANCES_INGEST = '/api/finances/ingest';
const API_OPERATOR_CONNECT = '/api/operator/connect';

/* ---------------- parsers & helpers ---------------- */
function parseLinesToItems(text) {
  const chunks = String(text || '')
    .split(/[\n,]+/g).map(s => s.trim()).filter(Boolean);

  const items = [];
  for (const raw of chunks) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;

    let qty = 1;
    const mQty = s.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
    let rest = s;
    if (mQty) { qty = Number(String(mQty[1]).replace(',', '.')) || 1; rest = mQty[2].trim(); }

    let name = rest, brand = '';
    const marca = rest.match(/\b(?:marca|brand)\s+([^\s].*)$/i);
    if (marca) { brand = marca[1].trim(); name = rest.replace(marca[0], '').trim(); }
    else {
      const parts = rest.split(' ');
      if (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (/^[A-ZÀ-ÖØ-Þ]/.test(last)) { brand = last; name = parts.slice(0, -1).join(' '); }
      }
    }
    name = name.replace(/\s{2,}/g, ' ').trim();
    brand = brand.replace(/\s{2,}/g, ' ').trim();

    if (name) items.push({ id: 'tmp-' + Math.random().toString(36).slice(2), name, brand: brand || '', qty: qty > 0 ? qty : 1 });
  }
  return items;
}

function toISODate(any) {
  const s = String(any);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const d = String(m[1]).padStart(2, '0');
    const M = String(m[2]).padStart(2, '0');
    let y = String(m[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  return null;
}

function extractUrls(text) {
  const re = /\bhttps?:\/\/[^\s)]+/gi;
  return (String(text || '').match(re) || []).slice(0, 50);
}

/** Scala quantità in TUTTE le liste in base agli acquisti OCR */
function decrementListsByPurchases(prevLists, purchases) {
  const next = { ...prevLists };
  const listTypes = Object.values(LIST_TYPES);

  for (const lt of listTypes) {
    const arr = [...(prevLists[lt] || [])];
    for (const p of purchases) {
      const name = String(p.name || '').toLowerCase();
      const brand = String(p.brand || '').toLowerCase();
      const dec = Math.max(1, Number(p.qty || 1));

      const idx = arr.findIndex(i =>
        i.name.toLowerCase() === name &&
        (i.brand || '').toLowerCase() === brand
      );
      if (idx >= 0) {
        const newQty = Math.max(0, Number(arr[idx].qty || 0) - dec);
        arr[idx] = { ...arr[idx], qty: newQty };
      }
    }
    next[lt] = arr.filter(i => Number(i.qty || 0) > 0);
  }
  return next;
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

  // Report offerte (da OCR/voce)
  const [offers, setOffers] = useState([]);     // [{url, addedAt}]

  // Vocale / OCR
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);
  const ocrInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

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

  /* --------------- azioni lista --------------- */
  function addManualItem(e) {
    e.preventDefault();
    const qty = Math.max(1, Number(String(form.qty).replace(',', '.')) || 1);
    const name = form.name.trim();
    const brand = form.brand.trim();
    if (!name) return;

    setLists(prev => {
      const next = { ...prev };
      const items = [...(prev[currentList] || [])];
      const idx = items.findIndex(i => i.name.toLowerCase() === name.toLowerCase() && i.brand.toLowerCase() === brand.toLowerCase());
      if (idx >= 0) items[idx] = { ...items[idx], qty: Number(items[idx].qty || 0) + qty };
      else items.push({ id: 'tmp-' + Math.random().toString(36).slice(2), name, brand, qty });
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
    if (!item) return;
    incQty(id, -1);
    addToStock({ name: item.name, brand: item.brand, qty: 1 });
  }

  function parseAndAppend(text) {
    const items = parseLinesToItems(text);
    if (items.length) {
      setLists(prev => {
        const next = { ...prev };
        const existing = [...(prev[currentList] || [])];
        for (const it of items) {
          const idx = existing.findIndex(i => i.name.toLowerCase() === it.name.toLowerCase() && i.brand.toLowerCase() === (it.brand || '').toLowerCase());
          if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + Number(it.qty || 1) };
          else existing.push(it);
        }
        next[currentList] = existing;
        return next;
      });
    }
    const urls = extractUrls(text);
    if (urls.length) setOffers(prev => [...urls.map(u => ({ url: u, addedAt: new Date().toISOString() })), ...prev]);
  }

  /* --------------- integrazione Assistant: VOCE --------------- */
  async function sendToAssistantVoice(text) {
    const payload = {
      assistantId: ASSISTANT_ID_VOICE,
      prompt: [
        'Sei Jarvis. Estrai voci per una lista della spesa.',
        'Rispondi SOLO con JSON:',
        JSON.stringify({ items: [{ name: 'latte', brand: 'Parmalat', qty: 2 }] }),
        '',
        'Testo:',
        text
      ].join('\n'),
    };
    const res = await fetch(API_ASSISTANT_TEXT, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const { answer, error } = await res.json();
    if (!res.ok || error) throw new Error(error || String(res.status));
    const data = typeof answer === 'string' ? JSON.parse(answer) : answer;
    if (!data?.items || !Array.isArray(data.items)) throw new Error('Formato assistant non valido');

    setLists(prev => {
      const next = { ...prev };
      const existing = [...(prev[currentList] || [])];
      for (const raw of data.items) {
        const it = {
          id: 'tmp-' + Math.random().toString(36).slice(2),
          name: String(raw.name || '').trim(),
          brand: String(raw.brand || '').trim(),
          qty: Math.max(1, Number(raw.qty || 1)),
        };
        if (!it.name) continue;
        const idx = existing.findIndex(i => i.name.toLowerCase() === it.name.toLowerCase() && i.brand.toLowerCase() === it.brand.toLowerCase());
        if (idx >= 0) existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + it.qty };
        else existing.push(it);
      }
      next[currentList] = existing;
      return next;
    });
  }

  /* --------------- integrazione Assistant: OCR --------------- */
  async function sendToAssistantOCR(files) {
    const fd = new FormData();
    fd.append('assistantId', ASSISTANT_ID_OCR);
    files.forEach((f) => fd.append('files', f));

    const res = await fetch(API_ASSISTANT_OCR, { method: 'POST', body: fd });
    const { data, text, error } = await res.json();
    if (!res.ok || error) throw new Error(error || String(res.status));

    if (text) parseAndAppend(text);

    // Atteso: { purchases:[{name,brand?,qty?,price?,store?,boughtAt?,expiresAt?,category?}] }
    const purchases = data?.purchases || [];
    if (Array.isArray(purchases) && purchases.length) {
      // a) scala da TUTTE le liste
      setLists(prev => decrementListsByPurchases(prev, purchases));

      // b) aggiorna scorte
      for (const p of purchases) {
        addToStock({
          name: p.name,
          brand: p.brand || '',
          qty: Math.max(1, Number(p.qty || 1)),
          expiresAt: p.expiresAt ? toISODate(p.expiresAt) : '',
        });
      }

      // c) manda alle Finanze per registrazione (store, date, price, category)
      try {
        await fetch(API_FINANCES_INGEST, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchases }),
        });
      } catch (e) {
        console.warn('[FINANCES] ingest fallita:', e?.message || e);
      }
    }
  }

  /* --------------- voce (microfono) --------------- */
  async function toggleRec() {
    if (recBusy) { try { mediaRecRef.current?.stop(); } catch {} return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => { if (e.data?.size) recordedChunks.current.push(e.data); };
      mediaRecRef.current.onstop = processVoice;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch {
      alert('Microfono non disponibile');
    }
  }

  async function processVoice() {
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
      } catch (e) {
        console.warn('[ASSISTANT VOICE] fallback parser locale:', e?.message);
        parseAndAppend(text);
        showToast('Aggiornato (parser locale)', 'ok');
      }
    } catch (err) {
      console.error('[VOICE] error', err);
      alert('Errore nel riconoscimento vocale');
    } finally {
      setRecBusy(false);
      setBusy(false);
      try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
    }
  }

  /* --------------- OCR (assistant) --------------- */
  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      setBusy(true);
      await sendToAssistantOCR(files);
      showToast('OCR elaborato ✓', 'ok');
    } catch (err) {
      console.error('[OCR] error', err);
      alert('Errore OCR/Assistant');
    } finally {
      setBusy(false);
    }
  }

  /* --------------- Operator AI --------------- */
  async function connectOperator() {
    try {
      setBusy(true);
      const res = await fetch(API_OPERATOR_CONNECT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listType: currentList }) });
      if (!res.ok) throw new Error(res.status);
      showToast('Operator AI collegato ✓', 'ok');
    } catch (e) {
      showToast('Errore collegamento Operator', 'err');
    } finally {
      setBusy(false);
    }
  }

  /* --------------- scorte & scadenze --------------- */
  function addToStock({ name, brand = '', qty = 1, expiresAt = '' }) {
    const nm = String(name || '').trim();
    if (!nm) return;
    setStock(prev => {
      const arr = [...prev];
      const idx = arr.findIndex(p =>
        p.name.toLowerCase() === nm.toLowerCase() &&
        (p.brand || '').toLowerCase() === brand.toLowerCase() &&
        (p.expiresAt || '') === (expiresAt || '')
      );
      if (idx >= 0) arr[idx] = { ...arr[idx], qty: Number(arr[idx].qty || 0) + Number(qty || 1) };
      else arr.unshift({ name: nm, brand: brand.trim(), qty: Number(qty || 1), expiresAt: expiresAt || '' });
      return arr;
    });
  }

  function onExpiryManualSubmit(e) {
    e.preventDefault();
    const qty = Math.max(1, Number(String(expiryForm.qty).replace(',', '.')) || 1);
    const exISO = expiryForm.expiresAt ? toISODate(expiryForm.expiresAt) : '';
    addToStock({ name: expiryForm.name, brand: expiryForm.brand, qty, expiresAt: exISO });
    setExpiryForm({ name: '', brand: '', qty: '1', expiresAt: '' });
    showToast('Scorte aggiornate ✓', 'ok');
  }

  /* --------------- render --------------- */
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
                      <button title="Segna comprato" onClick={() => markBought(it.id)} style={styles.actionSuccess}>✔ Comprato</button>
                      <div style={{display:'flex', gap:6}}>
                        <button title="Diminuisci quantità" onClick={() => incQty(it.id, -1)} style={styles.actionGhost}>−</button>
                        <button title="Aumenta quantità" onClick={() => incQty(it.id, +1)} style={styles.actionGhost}>＋</button>
                      </div>
                      <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.actionDanger}>🗑 Elimina</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form aggiunta manuale */}
          <div style={styles.section}>
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
              Suggerimenti voce/OCR: “2 latte parmalat, 3 pasta barilla, uova”.
            </p>
          </div>

          {/* Prodotti in esaurimento / scadenza */}
          <div style={styles.section}>
            <h3 style={styles.h3}>📦 Prodotti in esaurimento / scadenza</h3>

            {/* Mini form scadenza manuale / voce / OCR */}
            <form onSubmit={onExpiryManualSubmit} style={{...styles.formRow, marginBottom: 10}}>
              <input placeholder="Prodotto (es. latte)" value={expiryForm.name}
                     onChange={e=>setExpiryForm(f=>({...f, name:e.target.value}))} style={styles.input} required />
              <input placeholder="Marca" value={expiryForm.brand}
                     onChange={e=>setExpiryForm(f=>({...f, brand:e.target.value}))} style={styles.input} />
              <input placeholder="Q.tà" inputMode="decimal" value={expiryForm.qty}
                     onChange={e=>setExpiryForm(f=>({...f, qty:e.target.value}))} style={{...styles.input, width: 100}} required />
              <input placeholder="Scadenza (dd/mm/yyyy o yyyy-mm-dd)" value={expiryForm.expiresAt}
                     onChange={e=>setExpiryForm(f=>({...f, expiresAt:e.target.value}))} style={{...styles.input, minWidth:240}} />
              <button style={styles.primaryBtn} disabled={busy}>Registra</button>
            </form>
            <div style={{display:'flex', gap:8, marginBottom:10}}>
              <button onClick={toggleRec} style={styles.voiceBtnSmall} disabled={busy}>{recBusy ? '⏹️ Stop' : '🎙 Vocale scadenza'}</button>
              <button onClick={() => ocrInputRef.current?.click()} style={styles.ocrBtnSmall} disabled={busy}>📷 OCR scadenza</button>
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

          {/* Stato scorte */}
          <div style={styles.section}>
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
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{s.name}</td>
                      <td style={styles.td}>{s.brand || '-'}</td>
                      <td style={styles.td}>{s.qty}</td>
                      <td style={styles.td}>{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('it-IT') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Report offerte settimanali */}
          <div style={styles.section}>
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
    padding: 24, display: 'flex', alignItems: 'center', justifyContent:'center', color:'#fff',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
  },
  card: { width:'100%', maxWidth: 1000, background:'rgba(0,0,0,.6)', borderRadius: 16, padding: 20, boxShadow: '0 6px 16px rgba(0,0,0,.3)' },
  headerRow: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 },
  homeBtn: { background:'#6366f1', color:'#fff', padding:'6px 10px', borderRadius:8, textDecoration:'none' },

  switchRow: { display:'flex', gap:8, margin: '10px 0 6px' },
  switchBtn: { background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', color:'#fff', padding:'6px 10px', borderRadius:8, cursor:'pointer' },
  switchBtnActive: { background:'#06b6d4', border:'0', color:'#0b1220', padding:'6px 10px', borderRadius:8, cursor:'pointer', fontWeight:700 },

  toolsRow: { display:'flex', flexWrap:'wrap', gap:8, margin:'10px 0 6px' },
  toolsRowSecondary: { display:'flex', flexWrap:'wrap', gap:8, margin:'4px 0 14px' },

  voiceBtn: { background:'#6366f1', border:0, color:'#fff', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:700 },
  ocrBtn: { background:'#06b6d4', border:0, color:'#0b1220', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },
  operatorBtn: { background:'#22c55e', border:0, color:'#0f172a', padding:'8px 12px', borderRadius:10, cursor:'pointer', fontWeight:800 },

  section: { marginTop: 16 },
  h3: { margin:'4px 0 10px' },

  listGrid: { display:'flex', flexDirection:'column', gap:10 },
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

  formRow: { display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' },
  input: {
    padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)',
    background: 'rgba(255,255,255,.06)', color: '#fff', minWidth: 180
  },

  table: { width:'100%', borderCollapse:'collapse', background:'rgba(255,255,255,.04)', borderRadius:12, overflow:'hidden' },
  th: { textAlign:'left', padding:'8px', borderBottom:'1px solid rgba(255,255,255,.12)' },
  td: { padding:'8px', borderBottom:'1px solid rgba(255,255,255,.08)' },

  voiceBtnSmall: { background:'#6366f1', border:0, color:'#fff', padding:'6px 10px', borderRadius:10, cursor:'pointer', fontWeight:700 },
  ocrBtnSmall: { background:'#06b6d4', border:0, color:'#0b1220', padding:'6px 10px', borderRadius:10, cursor:'pointer', fontWeight:800 },
};
