// pages/liste-prodotti.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

/**
 * NOTE:
 * - Implementazione 100% client-side (nessun Supabase) per sbloccare la build.
 * - Parser naturale per vocale/OCR:
 *    "2 latte parmalat, 3 pasta barilla, uova" → qty, name, brand opzionale.
 * - Si opera SOLO sulla lista corrente (Supermercato | Online).
 */

const LIST_TYPES = {
  SUPERMARKET: 'supermercato',
  ONLINE: 'online',
};

function parseLinesToItems(text) {
  // Spezza per virgole o nuove linee
  const chunks = String(text || '')
    .split(/[\n,]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  // Regole semplici: "[qty] nome [brand...]"
  // qty opzionale, brand preso come ultima parola capitalizzata oppure dopo "marca|brand"
  const items = [];
  for (const raw of chunks) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;

    // qty
    let qty = 1;
    const mQty = s.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
    let rest = s;
    if (mQty) {
      qty = Number(String(mQty[1]).replace(',', '.')) || 1;
      rest = mQty[2].trim();
    }

    // brand euristico: parola finale con lettera maiuscola iniziale o dopo "marca|brand"
    let name = rest;
    let brand = '';
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
      });
    }
  }
  return items;
}

export default function ListeProdotti() {
  // Lista corrente
  const [currentList, setCurrentList] = useState(LIST_TYPES.ONLINE);

  // Stato liste (client-side)
  const [lists, setLists] = useState({
    [LIST_TYPES.SUPERMARKET]: [],
    [LIST_TYPES.ONLINE]: [],
  });

  // Form manuale
  const [form, setForm] = useState({ name: '', brand: '', qty: '1' });

  // Vocale / OCR
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);
  const ocrInputRef = useRef(null);

  // Criticità (esaurimento/scadenza) & scorte (mock client-side)
  const [stock, setStock] = useState([]);       // {name, brand, qty, expiresAt?}
  const [critical, setCritical] = useState([]); // derivato da stock

  useEffect(() => {
    // Ricalcola prodotti critici quando cambiano gli stock
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

  const curItems = lists[currentList] || [];

  /* ----------------- azioni ----------------- */
  function addManualItem(e) {
    e.preventDefault();
    const qty = Math.max(1, Number(String(form.qty).replace(',', '.')) || 1);
    const name = form.name.trim();
    const brand = form.brand.trim();

    if (!name) return;

    setLists(prev => {
      const next = { ...prev };
      const items = [...(prev[currentList] || [])];

      // se esiste stesso (name+brand), somma quantità
      const idx = items.findIndex(
        i => i.name.toLowerCase() === name.toLowerCase() && i.brand.toLowerCase() === brand.toLowerCase()
      );
      if (idx >= 0) {
        items[idx] = { ...items[idx], qty: Number(items[idx].qty || 0) + qty };
      } else {
        items.push({ id: 'tmp-' + Math.random().toString(36).slice(2), name, brand, qty });
      }
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

  function parseAndAppend(text) {
    const items = parseLinesToItems(text);
    if (!items.length) return;

    setLists(prev => {
      const next = { ...prev };
      const existing = [...(prev[currentList] || [])];

      for (const it of items) {
        const idx = existing.findIndex(
          i => i.name.toLowerCase() === it.name.toLowerCase() && i.brand.toLowerCase() === (it.brand || '').toLowerCase()
        );
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], qty: Number(existing[idx].qty || 0) + Number(it.qty || 1) };
        } else {
          existing.push(it);
        }
      }
      next[currentList] = existing;
      return next;
    });
  }

  /* ----------------- VOCALE ----------------- */
  async function toggleRec() {
    if (recBusy) {
      try { mediaRecRef.current?.stop(); } catch {}
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = (e) => {
        if (e.data?.size) recordedChunks.current.push(e.data);
      };
      mediaRecRef.current.onstop = processVoice;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch {
      alert('Microfono non disponibile');
    }
  }

  async function processVoice() {
    const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
    const fd = new FormData();
    fd.append('audio', blob, 'voice.webm');

    try {
      const res = await fetch('/api/stt', { method: 'POST', body: fd });
      const { text } = await res.json();
      // Parser naturale stile lista
      parseAndAppend(text);
    } catch (err) {
      console.error('[VOICE] error', err);
      alert('Errore nel riconoscimento vocale');
    } finally {
      setRecBusy(false);
      try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
    }
  }

  /* ----------------- OCR ----------------- */
  async function handleOCR(files) {
    if (!files?.length) return;
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const { text } = await res.json();

      // Parser naturale stile lista
      parseAndAppend(text);
    } catch (err) {
      console.error('[OCR] error', err);
      alert('Errore OCR');
    }
  }

  /* ----------------- RENDER ----------------- */
  return (
    <>
      <Head><title>🛍 Lista Prodotti</title></Head>

      <div style={styles.page}>
        <div style={styles.card}>

          <div style={styles.headerRow}>
            <h2 style={{margin:0}}>🛍 Lista Prodotti</h2>
            <Link href="/home" legacyBehavior><a style={styles.homeBtn}>Home</a></Link>
          </div>

          {/* switch lista corrente */}
          <div style={styles.switchRow}>
            <button
              onClick={() => setCurrentList(LIST_TYPES.SUPERMARKET)}
              style={currentList === LIST_TYPES.SUPERMARKET ? styles.switchBtnActive : styles.switchBtn}
            >
              Lista Supermercato
            </button>
            <button
              onClick={() => setCurrentList(LIST_TYPES.ONLINE)}
              style={currentList === LIST_TYPES.ONLINE ? styles.switchBtnActive : styles.switchBtn}
            >
              Lista Spesa Online
            </button>
          </div>

          {/* comandi */}
          <div style={styles.toolsRow}>
            <button onClick={() => document.getElementById('add-form')?.scrollIntoView()} style={styles.primaryBtn}>➕ Aggiungi</button>
            <button onClick={toggleRec} style={styles.voiceBtn}>{recBusy ? '⏹️ Stop' : '🎙 Vocale'}</button>
            <button onClick={() => ocrInputRef.current?.click()} style={styles.ocrBtn}>📷 OCR</button>
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={(e) => handleOCR(Array.from(e.target.files || []))}
            />
            <button disabled style={styles.grayBtn}>🌐 Collega a Operator (coming soon)</button>
          </div>

          {/* lista corrente */}
          <div style={styles.section}>
            <h3 style={styles.h3}>Lista corrente: <span style={{opacity:.85}}>{currentList === LIST_TYPES.ONLINE ? 'Spesa Online' : 'Supermercato'}</span></h3>

            {curItems.length === 0 ? (
              <p style={{opacity:.8}}>Nessun prodotto ancora</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Q.tà</th>
                    <th style={styles.th}>Prodotto</th>
                    <th style={styles.th}>Marca</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {curItems.map((it) => (
                    <tr key={it.id}>
                      <td style={styles.td}>{it.qty}</td>
                      <td style={styles.td}>{it.name}</td>
                      <td style={styles.td}>{it.brand || '-'}</td>
                      <td style={styles.tdRight}>
                        <button onClick={() => removeItem(it.id)} style={styles.deleteBtn}>✖</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* form aggiunta */}
          <div id="add-form" style={styles.section}>
            <h3 style={styles.h3}>Aggiungi prodotto</h3>
            <form onSubmit={addManualItem} style={styles.formRow}>
              <input
                placeholder="Prodotto (es. latte)"
                value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))}
                style={styles.input}
                required
              />
              <input
                placeholder="Marca (es. Parmalat)"
                value={form.brand}
                onChange={e => setForm(f => ({...f, brand: e.target.value}))}
                style={styles.input}
              />
              <input
                placeholder="Q.tà"
                inputMode="decimal"
                value={form.qty}
                onChange={e => setForm(f => ({...f, qty: e.target.value}))}
                style={{...styles.input, width: 90}}
                required
              />
              <button style={styles.primaryBtn}>Aggiungi alla lista</button>
            </form>
            <p style={{opacity:.8, marginTop: 6}}>
              Suggerimenti voce/OCR: “2 latte parmalat, 3 pasta barilla, uova”.
            </p>
          </div>

          {/* prodotti in esaurimento / scadenza */}
          <div style={styles.section}>
            <h3 style={styles.h3}>📦 Prodotti in esaurimento / scadenza</h3>
            {critical.length === 0 ? (
              <p style={{opacity:.8}}>Nessun prodotto critico</p>
            ) : (
              <ul>
                {critical.map((p, i) => (
                  <li key={i}>
                    {p.name} {p.brand ? `(${p.brand})` : ''} — Q.tà: {p.qty}
                    {p.expiresAt ? ` — Scadenza: ${new Date(p.expiresAt).toLocaleDateString('it-IT')}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* stato scorte (mock) */}
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

          {/* report offerte (placeholder) */}
          <div style={styles.section}>
            <h3 style={styles.h3}>📈 Report Offerte settimanali</h3>
            <p style={{opacity:.8}}>Questa sezione si popolerà con le offerte trovate online per i prodotti nella lista.</p>
          </div>

        </div>
      </div>
    </>
  );
}

const styles = {
  page: {
    width: '100%', minHeight: '100vh', background: '#0f172a',
    padding: '24px', display: 'flex', alignItems: 'center', justifyContent:'center', color:'#fff',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
  },
  card: { width:'100%', maxWidth: 1000, background:'rgba(0,0,0,.6)', borderRadius: 16, padding: 20, boxShadow: '0 6px 16px rgba(0,0,0,.3)' },
  headerRow: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 },
  homeBtn: { background:'#6366f1', color:'#fff', padding:'6px 10px', borderRadius:8, textDecoration:'none' },
  switchRow: { display:'flex', gap:8, margin: '10px 0 6px' },
  switchBtn: { background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', color:'#fff', padding:'6px 10px', borderRadius:8, cursor:'pointer' },
  switchBtnActive: { background:'#06b6d4', border:'0', color:'#fff', padding:'6px 10px', borderRadius:8, cursor:'pointer' },
  toolsRow: { display:'flex', flexWrap:'wrap', gap:8, margin:'10px 0 14px' },
  primaryBtn: { background:'#22c55e', border:0, color:'#0f172a', padding:'6px 10px', borderRadius:8, cursor:'pointer', fontWeight:700 },
  voiceBtn: { background:'#6366f1', border:0, color:'#fff', padding:'6px 10px', borderRadius:8, cursor:'pointer' },
  ocrBtn: { background:'#06b6d4', border:0, color:'#0b1220', padding:'6px 10px', borderRadius:8, cursor:'pointer', fontWeight:700 },
  grayBtn: { background:'rgba(255,255,255,.15)', border:0, color:'#ddd', padding:'6px 10px', borderRadius:8, cursor:'not-allowed' },
  section: { marginTop: 16 },
  h3: { margin:'4px 0 10px' },
  table: { width:'100%', borderCollapse:'collapse', background:'rgba(255,255,255,.04)', borderRadius:12, overflow:'hidden' },
  th: { textAlign:'left', padding:'8px', borderBottom:'1px solid rgba(255,255,255,.12)' },
  td: { padding:'8px', borderBottom:'1px solid rgba(255,255,255,.08)' },
  tdRight: { padding:'8px', borderBottom:'1px solid rgba(255,255,255,.08)', textAlign:'right' },
  deleteBtn: { background:'#ef4444', border:0, color:'#fff', borderRadius:6, padding:'4px 8px', cursor:'pointer' },
  formRow: { display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' },
  input: {
    padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)',
    background: 'rgba(255,255,255,.06)', color: '#fff', minWidth: 160
  },
};
