// pages/spese-casa.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { getJSON, postJSON } from '@/lib/http';

/* ================= Helpers date & money ================= */
function isoLocal(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function smartDate(input) {
  const s = String(input || '').trim().toLowerCase();
  if (/\boggi\b/.test(s)) return isoLocal(new Date());
  if (/\bieri\b/.test(s)) { const d = new Date(); d.setDate(d.getDate() - 1); return isoLocal(d); }
  if (/\bdomani\b/.test(s)) { const d = new Date(); d.setDate(d.getDate() + 1); return isoLocal(d); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) { const dd = String(parseInt(m[1],10)).padStart(2,'0'); const mm = String(parseInt(m[2],10)).padStart(2,'0'); const yyyy = m[3]; return `${yyyy}-${mm}-${dd}`; }
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) { const yyyy = m[1]; const mm = String(parseInt(m[2],10)).padStart(2,'0'); const dd = String(parseInt(m[3],10)).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; }
  const d = new Date(s); return isNaN(d) ? isoLocal(new Date()) : isoLocal(d);
}
function fmtDateIT(v) {
  if (!v) return '-';
  const s = String(v), ymd = s.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (ymd) { const [yy, mm, dd] = ymd.split('-').map(Number); return new Date(yy, mm - 1, dd).toLocaleDateString('it-IT'); }
  return new Date(s).toLocaleDateString('it-IT');
}
function toNum(n){ const x = Number(n); return Number.isFinite(x) ? x : 0; }
function eur(n){ return (Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'}); }

/* =============== Helpers mese =============== */
function toMonthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function monthBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end   = new Date(y, m, 0);
  const toISO = dt => isoLocal(dt);
  return { startISO: toISO(start), endISO: toISO(end) };
}
function clampMonthKey(s) { return /^\d{4}-\d{2}$/.test(String(s||'')) ? s : toMonthKey(new Date()); }

/* ============ Totale pagina: usa doc_total se presente (per gruppo) ============ */
function sumReceipts(rows = []) {
  const groups = new Map();
  for (const r of rows) {
    const k = r.receipt_id
      ? `rid:${r.receipt_id}`
      : `sd:${String(r.store||'').toLowerCase().trim()}|${String(r.purchase_date||r.created_at||'').slice(0,10)}`;
    const g = groups.get(k) || { docTotal: 0, sumLines: 0 };
    g.docTotal = Math.max(g.docTotal, Number(r.doc_total || 0) || 0);
    g.sumLines += Number(r.price_total || 0) || 0;
    groups.set(k, g);
  }
  let tot = 0; groups.forEach(g => { tot += g.docTotal > 0 ? g.docTotal : g.sumLines; });
  return tot;
}

/* ============================ Component ============================ */
function SpeseCasa() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // OCR & VOCE refs
  const ocrInputRef = useRef(null);
  const mediaRecRef = useRef(null);
  const streamRef = useRef(null);
  const recordedChunks = useRef([]);
  const [recBusy, setRecBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const mimeRef = useRef('');

  // querystring
  const { rid, initialMonth } = useMemo(() => {
    if (typeof window === 'undefined') return { rid:'', initialMonth:null };
    const sp = new URLSearchParams(window.location.search);
    return { rid: sp.get('rid') || '', initialMonth: sp.get('month') || null };
  }, []);

  // SELETTORE MESE
  const [monthKey, setMonthKey] = useState(() => {
    if (typeof window === 'undefined') return toMonthKey(new Date());
    const local = window.localStorage.getItem('__sc_month');
    return clampMonthKey(initialMonth || local || toMonthKey(new Date()));
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('__sc_month', monthKey);
      const url = new URL(window.location.href);
      url.searchParams.set('month', monthKey);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  }, [monthKey]);

  const { startISO, endISO } = useMemo(() => monthBounds(monthKey), [monthKey]);

  const fetchRows = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      // lato API: se supporta, passiamo rid; altrimenti filtriamo client-side
      const query = rid ? { rid } : {};
      const j = await getJSON('/api/spese-casa/list', { query });
      let data = Array.isArray(j?.rows) ? j.rows : [];

      // se non sto guardando uno scontrino specifico → filtro per mese selezionato
      if (!rid) {
        data = data.filter(r => {
          const d = String(r.purchase_date || r.created_at || '').slice(0,10);
          return d >= startISO && d <= endISO;
        });
      }

      setRows(data);

      // se arrivo con ?rid=... e non c'è month in URL, aggancio il mese giusto
      if (rid && !initialMonth && data.length) {
        const first = String(data[0].purchase_date || data[0].created_at || '').slice(0,10);
        if (first) {
          const mk = first.slice(0,7);
          if (mk && mk !== monthKey) setMonthKey(mk);
        }
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [rid, startISO, endISO, initialMonth, monthKey]);

  useEffect(() => {
    fetchRows();
    const handler = () => fetchRows();
    window.addEventListener('spese:ingest:done', handler);
    return () => window.removeEventListener('spese:ingest:done', handler);
  }, [fetchRows]);

  /* =================== Inserimento manuale (via ingest API – 1 riga) =================== */
  const [form, setForm] = useState({
    pv: '', indirizzo:'', luogo:'',
    dettaglio:'', quantita:'1',
    prezzoUnitario:'', prezzoTotale:'',
    data:''
  });

  const qtyLive  = Math.max(1, parseFloat(form.quantita || '1') || 1);
  const unitLive = toNum(form.prezzoUnitario);
  const liveTot  = unitLive > 0 ? (unitLive * qtyLive) : toNum(form.prezzoTotale);

  const onSubmitManual = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      const storeFull = [form.pv, form.indirizzo, form.luogo].map(s=>String(s||'').trim()).filter(Boolean).join(' — ');
      const dateISO = form.data ? smartDate(form.data) : isoLocal(new Date());
      const qty = Math.max(1, parseFloat(form.quantita) || 1);
      const unit = toNum(form.prezzoUnitario);
      let priceTotal = toNum(form.prezzoTotale);
      if (unit > 0) priceTotal = Number((unit * qty).toFixed(2));
      const priceEach = unit > 0 ? unit : (qty ? priceTotal/qty : priceTotal);

      const payload = {
        store: storeFull || form.pv || '',
        purchaseDate: dateISO,
        totalPaid: priceTotal,
        receiptTotalAuthoritative: false,
        items: [{
          name: form.dettaglio || '',
          brand: '',
          packs: qty,
          unitsPerPack: 1,
          unitLabel: 'unità',
          priceEach,
          priceTotal,
          currency: 'EUR',
          expiresAt: ''
        }]
      };

      const j = await postJSON('/api/spese-casa/ingest', payload);
      if (!j?.ok) throw new Error(j?.error || 'Insert fallito');

      // refresh + deep link allo scontrino
      setForm({ pv:'', indirizzo:'', luogo:'', dettaglio:'', quantita:'1', prezzoUnitario:'', prezzoTotale:'', data:'' });
      window.dispatchEvent(new CustomEvent('spese:ingest:done', { detail: { at: Date.now() } }));
      await fetchRows();
      if (j?.receipt_id) {
        const u = new URL(window.location.href);
        u.searchParams.set('rid', j.receipt_id);
        u.searchParams.set('month', (dateISO).slice(0,7));
        window.location.replace(u.toString());
      }
    } catch (e) { setErr(e?.message || String(e)); }
  };

  /* =================== Delete row =================== */
  const onDelete = async (id) => {
    try {
      setDeletingId(id);
      const j = await postJSON('/api/spese-casa/delete', { id });
      if (!j?.ok || !(j.deleted > 0)) throw new Error(j?.message || j?.error || 'Delete failed');
      await fetchRows();
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setDeletingId(null); }
  };

  /* =================== OCR =================== */
  const onOCRFiles = async (files) => {
    setErr(null);
    if (!files || !files.length) return;
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('images', f));
      // OCR base
      const resp = await fetch('/api/ocr', { method:'POST', body: fd });
      const ocr = await resp.json().catch(()=> ({}));
      if (!resp.ok) throw new Error(ocr?.error || 'OCR fallito');

      const text = String(ocr?.text || ocr?.data?.text || ocr?.data || '').trim();
      if (!text) throw new Error('Nessun testo OCR');

      // Assistant → JSON spesa
      const prompt = buildSystemPrompt('ocr', text, files.map(f=>f.name).join(', '));
      const r2 = await fetch('/api/assistant', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt })
      });
      const a2 = await r2.json().catch(()=> ({}));
      if (!r2.ok) throw new Error(a2?.error || 'Assistant fallito');

      const data = JSON.parse(a2.answer || '{}');
      await applyExpenseFromAssistant(data, text);
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    }
  };

  /* =================== VOCE (MediaRecorder + STT) =================== */
  const startVoice = async () => {
    setErr(null);
    if (recBusy || stopping) return;
    if (typeof window === 'undefined' || !('MediaRecorder' in window)) { setErr('Browser senza MediaRecorder'); return; }

    const cand = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus','audio/ogg'];
    let chosen = ''; for (const c of cand) { if (window.MediaRecorder.isTypeSupported?.(c)) { chosen = c; break; } }
    mimeRef.current = chosen;

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks.current = [];
      const mr = new MediaRecorder(streamRef.current, chosen ? { mimeType: chosen } : undefined);
      mediaRecRef.current = mr;
      mr.ondataavailable = (e)=> { if (e.data && e.data.size) recordedChunks.current.push(e.data); };
      mr.onstop = async () => {
        try {
          const mime = mimeRef.current || (recordedChunks.current[0]?.type || 'audio/webm');
          const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
          const blob = new Blob(recordedChunks.current, { type: mime });
          recordedChunks.current = [];
          const fd = new FormData(); fd.append('audio', blob, `voice.${ext}`);
          const r = await fetch('/api/stt', { method:'POST', body: fd });
          const j = await r.json().catch(()=> ({}));
          if (!r.ok || !j?.text) throw new Error('STT fallito');

          const prompt = buildSystemPrompt('voice', j.text);
          const r2 = await fetch('/api/assistant', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ prompt })
          });
          const a2 = await r2.json().catch(()=> ({}));
          if (!r2.ok) throw new Error(a2?.error || 'Assistant fallito');

          const data = JSON.parse(a2.answer || '{}');
          await applyExpenseFromAssistant(data, j.text);
        } catch (e) {
          console.error(e);
          setErr(e?.message || String(e));
        } finally {
          try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
          streamRef.current = null;
          setRecBusy(false);
          setStopping(false);
        }
      };
      mr.start();
      setRecBusy(true);
    } catch (e) {
      console.error(e);
      setErr('Microfono non disponibile');
      try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      streamRef.current = null;
      setRecBusy(false);
      setStopping(false);
    }
  };
  const stopVoice = async () => { if (!recBusy || !mediaRecRef.current) return; setStopping(true); try { mediaRecRef.current.stop(); } catch {} };

  /* ====== Prompt + Apply ====== */
  function buildSystemPrompt(source, userText, fileName) {
    const fn = fileName || 'scontrino';
    const header = [
      'Sei Jarvis. Estrai SPESI DETTAGLIATE per "Spese Casa".',
      'Rispondi SOLO JSON nel formato:',
      '{',
      '  "type":"expense",',
      '  "receipt": {',
      '    "puntoVendita":"string",',
      '    "indirizzo":"string opzionale",',
      '    "luogo":"string opzionale",',
      '    "data":"YYYY-MM-DD|oggi|ieri|domani",',
      '    "totaleScontrino": number',
      '  },',
      '  "items":[{',
      '    "dettaglio":"string",',
      '    "quantita": number,',
      '    "uom":"string opzionale",',
      '    "prezzoUnitario": number opzionale,',
      '    "prezzoPagato": number opzionale',
      '  }]',
      '}',
      'Se non trovi indirizzo/luogo lasciali vuoti.'
    ].join('\n');
    if (source === 'ocr') return [header, '', 'Testo OCR (' + fn + '):', String(userText || '')].join('\n');
    return [header, '', 'Trascrizione:', String(userText || '')].join('\n');
  }

  async function applyExpenseFromAssistant(data, rawSourceText = '') {
    if (!data || data.type !== 'expense' || !Array.isArray(data.items) || !data.items.length) {
      throw new Error('Assistant: risposta non valida');
    }
    const rc = data.receipt || {};
    const raw = String(rawSourceText || '').toLowerCase();
    const saidOggi   = /\boggi\b/.test(raw);
    const saidIeri   = /\bieri\b/.test(raw);
    const saidDomani = /\bdomani\b/.test(raw);

    let spentDate = smartDate(rc.data || '');
    if (saidOggi)   spentDate = isoLocal(new Date());
    if (saidIeri)  { const d = new Date(); d.setDate(d.getDate() - 1); spentDate = isoLocal(d); }
    if (saidDomani){ const d = new Date(); d.setDate(d.getDate() + 1); spentDate = isoLocal(d); }

    const puntoVendita = String(rc.puntoVendita || '').trim();
    const indirizzo    = String(rc.indirizzo || '').trim();
    const luogo        = String(rc.luogo || '').trim();
    const storeFull    = [puntoVendita, indirizzo, luogo].filter(Boolean).join(' — ');
    const totaleScontrino = toNum(rc.totaleScontrino);

    // Mappa items → schema ingest
    const items = data.items.map(it => {
      const qty = Math.max(1, parseFloat(it.quantita) || 1);
      const unit = toNum(it.prezzoUnitario);
      let lineTotal = toNum(it.prezzoPagato);
      if (!lineTotal && unit) lineTotal = Number((unit * qty).toFixed(2));
      const priceEach = unit > 0 ? unit : (qty ? (lineTotal/qty) : lineTotal);
      return {
        name: String(it.dettaglio || '').trim(),
        brand: '',
        packs: qty,
        unitsPerPack: 1,
        unitLabel: String(it.uom || 'unità'),
        priceEach,
        priceTotal: lineTotal,
        currency: 'EUR',
        expiresAt: ''
      };
    });

    // HEAD payload per /api/spese-casa/ingest
    const totalPaid = totaleScontrino > 0
      ? Number(totaleScontrino.toFixed(2))
      : Number(items.reduce((s, x) => s + Number(x.priceTotal || 0), 0).toFixed(2));

    const payloadSpese = {
      store: storeFull || puntoVendita,
      purchaseDate: spentDate,
      totalPaid,
      items,
      receiptTotalAuthoritative: totaleScontrino > 0
    };

    const sc = await postJSON('/api/spese-casa/ingest', payloadSpese);
    if (!sc?.ok) throw new Error(sc?.error || 'Insert spese fallito');

    // refresh
    window.dispatchEvent(new CustomEvent('spese:ingest:done', { detail: { at: Date.now() } }));
    await fetchRows();

    // Deep link allo scontrino (e al mese giusto)
    if (sc?.receipt_id && !rid) {
      const u = new URL(window.location.href);
      u.searchParams.set('rid', sc.receipt_id);
      u.searchParams.set('month', spentDate.slice(0,7));
      window.location.replace(u.toString());
    }
  }

  /* =================== Totali =================== */
  const totalePagina = sumReceipts(rows);

  return (
    <>
      <Head><title>Spese Casa</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
            <h2 className="title">🏠 Spese Casa {rid ? <small style={{opacity:.8}}>(scontrino)</small> : <small style={{opacity:.8}}>(mese {monthKey})</small>}</h2>
            <Link href="/finanze" className="btn-manuale">📊 Vai a Finanze</Link>
          </div>

          {/* Toolbar mese (visibile anche con rid; utile per navigare) */}
          <div className="month-toolbar" style={{display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px'}}>
            <button className="btn-manuale" onClick={()=>{
              const [y,m]=monthKey.split('-').map(Number);
              const d=new Date(y, m-2, 1); setMonthKey(toMonthKey(d));
            }}>«</button>

            <input
              type="month"
              value={monthKey}
              onChange={(e)=> setMonthKey(clampMonthKey(e.target.value))}
              className="btn-manuale"
              style={{padding:'6px 10px'}}
            />

            <button className="btn-manuale" onClick={()=>{
              const [y,m]=monthKey.split('-').map(Number);
              const d=new Date(y, m, 1); setMonthKey(toMonthKey(d));
            }}>»</button>
          </div>

          <div className="table-buttons">
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()} title="Scansiona scontrino">📷 OCR</button>
            <button className="btn-vocale" onClick={recBusy ? stopVoice : startVoice} disabled={stopping} title={recBusy ? 'Stop' : 'Detta scontrino'}>
              {recBusy && !stopping ? '⏹ Stop' : (stopping ? '…' : '🎙 Voce')}
            </button>
            <button className="btn-manuale" onClick={() => setShowManual(v => !v)}>
              {showManual ? '— Nascondi manuale' : '➕ Aggiungi manuale'}
            </button>
            <input ref={ocrInputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => onOCRFiles(Array.from(e.target.files || []))} />
          </div>

          <div className="table-container">
            {showManual && (
              <form className="input-section" onSubmit={onSubmitManual}>
                <label>Punto vendita</label>
                <input value={form.pv} onChange={e=>setForm(f=>({...f, pv:e.target.value}))} required />

                <div className="row-2">
                  <div>
                    <label>Indirizzo</label>
                    <input value={form.indirizzo} onChange={e=>setForm(f=>({...f, indirizzo:e.target.value}))} />
                  </div>
                  <div>
                    <label>Luogo</label>
                    <input value={form.luogo} onChange={e=>setForm(f=>({...f, luogo:e.target.value}))} />
                  </div>
                </div>

                <label>Dettaglio prodotto/servizio</label>
                <textarea value={form.dettaglio} onChange={e=>setForm(f=>({...f, dettaglio:e.target.value}))} required />

                <div className="row-3">
                  <div>
                    <label>Data</label>
                    <input type="date" value={form.data} onChange={e=>setForm(f=>({...f, data:e.target.value}))} />
                  </div>
                  <div>
                    <label>Quantità</label>
                    <input type="number" min="1" step="1" value={form.quantita} onChange={e=>setForm(f=>({...f, quantita:e.target.value}))} required />
                  </div>
                  <div>
                    <label>Prezzo unitario (€)</label>
                    <input type="number" step="0.01" value={form.prezzoUnitario} onChange={e=>setForm(f=>({...f, prezzoUnitario:e.target.value}))} />
                  </div>
                </div>

                <div className="row-2">
                  <div>
                    <label>Prezzo pagato (€)</label>
                    <input type="number" step="0.01" value={form.prezzoTotale} onChange={e=>setForm(f=>({...f, prezzoTotale:e.target.value}))} />
                  </div>
                  <div className="live-total">
                    {`Calcolo: ${qtyLive} × ${eur(unitLive)} = ${eur(liveTot)}`}
                  </div>
                </div>

                <button className="btn-manuale">Aggiungi</button>
              </form>
            )}

            {loading ? (
              <p>Caricamento…</p>
            ) : err ? (
              <p className="error">Errore: {err}</p>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Punto vendita</th>
                    <th>Data</th>
                    <th>Prodotto</th>
                    <th>Qtà</th>
                    <th>Prezzo unit.</th>
                    <th>Pagato</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(rows || []).map(r => {
                    const qty = (r.units_per_pack && r.units_per_pack > 1)
                      ? `${r.packs}×${r.units_per_pack} ${r.unit_label || ''}`.trim()
                      : `${r.packs || 1} ${r.unit_label || ''}`.trim();
                    return (
                      <tr key={r.id}>
                        <td>{r.store || '-'}</td>
                        <td>{fmtDateIT(r.purchase_date || r.created_at)}</td>
                        <td>{r.name || '-'}</td>
                        <td>{qty}</td>
                        <td>{eur(r.price_each)}</td>
                        <td>{eur(r.price_total)}</td>
                        <td>
                          <button
                            type="button"
                            className="icon-trash"
                            title="Elimina"
                            disabled={deletingId === r.id || loading}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(r.id); }}
                          >
                            {deletingId === r.id ? '…' : '🗑'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div className="total-box">
              Totale {rid ? 'scontrino' : `mese ${monthKey}`}: <b>{eur(totalePagina)}</b>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .spese-casa-container1 { width:100%; display:flex; align-items:center; justify-content:center; background:#0f172a; min-height:100vh; padding:2rem; font-family: Inter, sans-serif; }
        .spese-casa-container2 { background:rgba(0, 0, 0, 0.6); padding:2rem; border-radius:1rem; color:#fff; box-shadow:0 6px 16px rgba(0,0,0,0.3); max-width: 1100px; width:100%; }
        .title { margin-bottom:.5rem; font-size:1.5rem; }
        .table-buttons { display:flex; flex-wrap:wrap; gap:.6rem; margin-bottom:1rem; align-items:center; }
        .btn-ocr, .btn-manuale, .btn-vocale { display:inline-block; text-align:center; background:#10b981; color:#fff; border:none; padding:.5rem 1rem; border-radius:.5rem; cursor:pointer; text-decoration:none; }
        .btn-ocr { background:#f43f5e; }
        .btn-vocale { background:#6366f1; }
        .input-section { display:flex; flex-direction:column; gap:.75rem; margin-bottom:1.25rem; background:rgba(255,255,255,0.06); padding:1rem; border-radius:.75rem; }
        .row-2 { display:grid; grid-template-columns: 1fr 1fr; gap:.75rem; }
        .row-3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:.75rem; }
        @media (max-width: 760px) { .row-2, .row-3 { grid-template-columns: 1fr; } }
        input, textarea, select { width:100%; padding:.6rem; border:none; border-radius:.5rem; background:rgba(255,255,255,0.1); color:#fff; }
        textarea { resize:vertical; min-height:4.5rem; }
        .custom-table { width:100%; border-collapse:collapse; }
        .custom-table th, .custom-table td { padding:.75rem 1rem; border-bottom:1px solid rgba(255,255,255,0.1); vertical-align:top; }
        .custom-table thead { background:#1f2937; }
        .total-box { margin-top:1rem; background:rgba(34,197,94,0.8); padding:1rem; border-radius:.5rem; text-align:right; font-weight:600; }
        .error { color:#f87171; margin-top:1rem; }
        .icon-trash { background:transparent; border:1px solid rgba(239,68,68,.55); color:#f87171; padding:.35rem .55rem; border-radius:.5rem; cursor:pointer; }
        .icon-trash:hover { background:rgba(239,68,68,.12); }
        .icon-trash:disabled { opacity:.55; cursor:not-allowed; }
        .live-total { display:flex; align-items:flex-end; font-weight:600; color:#c7f9cc; }
      `}</style>
    </>
  );
}

export default withAuth(SpeseCasa);
