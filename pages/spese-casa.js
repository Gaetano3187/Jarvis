// pages/spese-casa.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { getJSON, postJSON } from '@/lib/http';

function isoLocal(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),da=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${da}`;}
function eur(n){ return (Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'}) }
function toNum(n){ const v=Number(n); return Number.isFinite(v)?v:0; }

export default withAuth(function SpeseCasa() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // OCR & VOCE
  const ocrInputRef = useRef(null);
  const mediaRecRef = useRef(null);
  const streamRef = useRef(null);
  const recordedChunks = useRef([]);
  const [recBusy, setRecBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const mimeRef = useRef('');

  // filtri da query (rid prioritario)
  const { rid, qsStore, qsDate } = useMemo(() => {
    if (typeof window === 'undefined') return { rid:'', qsStore:'', qsDate:'' };
    const sp = new URLSearchParams(window.location.search);
    return {
      rid: sp.get('rid') || '',
      qsStore: sp.get('store') || '',
      qsDate: sp.get('date') || '',
    };
  }, []);

  // range mese corrente (se non c'è rid)
  const now = new Date();
  const periodStart = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodEnd   = isoLocal(new Date(now.getFullYear(), now.getMonth()+1, 0));

  const fetchRows = async () => {
    setLoading(true); setErr(null);
    try {
      const q = rid ? { rid } : (qsStore && qsDate ? { store: qsStore, date: qsDate } : {});
      const j = await getJSON('/api/spese-casa/list', { query: q });
      let data = Array.isArray(j?.rows) ? j.rows : [];
      if (!rid && !qsStore) {
        data = data.filter(r => {
          const d = String(r.purchase_date || r.created_at || '').slice(0,10);
          return d >= periodStart && d <= periodEnd;
        });
      }
      setRows(data);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchRows(); }, []); // al mount

  /* =================== Manual Add (via ingest API – 1 riga) =================== */
  const [form, setForm] = useState({
    pv: '', dettaglio:'', quantita:'1',
    prezzoUnitario:'', prezzoTotale:'', data:''
  });

  const qtyLive  = Math.max(1, parseFloat(form.quantita || '1') || 1);
  const unitLive = toNum(form.prezzoUnitario);
  const liveTot  = unitLive > 0 ? (unitLive * qtyLive) : toNum(form.prezzoTotale);

  const onSubmitManual = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      const dateISO = form.data ? form.data : isoLocal(new Date());
      const qty = Math.max(1, parseFloat(form.quantita) || 1);
      const unit = toNum(form.prezzoUnitario);
      let priceTotal = toNum(form.prezzoTotale);
      if (unit > 0) priceTotal = Number((unit * qty).toFixed(2));
      const priceEach = unit > 0 ? unit : (qty ? priceTotal/qty : priceTotal);

      const payload = {
        store: form.pv || '',
        purchaseDate: dateISO,
        totalPaid: priceTotal,
        receiptTotalAuthoritative: false, // una riga → non fissiamo doc_total
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

      setForm({ pv:'', dettaglio:'', quantita:'1', prezzoUnitario:'', prezzoTotale:'', data:'' });
      setShowManual(false);
      await fetchRows();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  /* =================== Delete row =================== */
  const onDelete = async (id) => {
    try {
      setDeletingId(id);
      const j = await postJSON('/api/spese-casa/delete', { id });
      if (!j?.ok || !(j.deleted > 0)) throw new Error(j?.message || j?.error || 'Delete failed');
      await fetchRows();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setDeletingId(null);
    }
  };

  /* =================== OCR =================== */
  const onOCRFiles = async (files) => {
    setErr(null);
    if (!files || !files.length) return;
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('images', f));
      const resp = await fetch('/api/ocr', { method:'POST', body: fd });
      const ocr = await resp.json().catch(()=> ({}));
      if (!resp.ok) throw new Error(ocr?.error || 'OCR fallito');
      const text = String(ocr?.text || ocr?.data?.text || ocr?.data || '').trim();
      if (!text) throw new Error('Nessun testo OCR');
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
      setErr('Microfono non disponibile');
      try { streamRef.current?.getTracks?.().forEach(t=>t.stop()); } catch {}
      streamRef.current = null;
      setRecBusy(false);
      setStopping(false);
    }
  };
  const stopVoice = async () => { if (recBusy && mediaRecRef.current) { setStopping(true); try { mediaRecRef.current.stop(); } catch {} } };

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
      'Se non trovi indirizzo/luogo lasciali vuoti.',
      ''
    ].join('\n');
    if (source === 'ocr') return [header, 'Testo OCR (' + fn + '):', String(userText || '')].join('\n');
    return [header, 'Trascrizione:', String(userText || '')].join('\n');
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

    let spentDate = rc.data || isoLocal(new Date());
    if (saidOggi)   spentDate = isoLocal(new Date());
    if (saidIeri)  { const d = new Date(); d.setDate(d.getDate() - 1); spentDate = isoLocal(d); }
    if (saidDomani){ const d = new Date(); d.setDate(d.getDate() + 1); spentDate = isoLocal(d); }

    const puntoVendita = String(rc.puntoVendita || '').trim();
    const indirizzo    = String(rc.indirizzo || '').trim();
    const luogo        = String(rc.luogo || '').trim();
    const storeFull    = [puntoVendita, indirizzo, luogo].filter(Boolean).join(' — ');
    const totaleScontrino = toNum(rc.totaleScontrino);

    const items = data.items.map(it => {
      const qty = Math.max(1, parseFloat(it.quantita) || 1);
      const unit = toNum(it.prezzoUnitario);
      let lineTotal = toNum(it.prezzoPagato);
      if (!lineTotal && unit) lineTotal = Number((unit * qty).toFixed(2));
      const priceEach = unit > 0 ? unit : (qty ? lineTotal/qty : lineTotal);
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

    const sc = await postJSON('/api/spese-casa/ingest', {
      store: storeFull || puntoVendita,
      purchaseDate: spentDate,
      totalPaid: totaleScontrino,
      receiptTotalAuthoritative: !!totaleScontrino,
      items
    });
    if (!sc?.ok) throw new Error(sc?.error || 'Insert spese fallito');

    // movimento sintetico in Finanze (consigliato) — opzionale
    if (totaleScontrino > 0) {
      try {
        await postJSON('/api/finances/ingest', {
          store: storeFull || puntoVendita,
          purchaseDate: spentDate,
          payment_method: 'cash',
          card_label: null,
          items,
          totalPaid: totaleScontrino,
          receiptTotalAuthoritative: true
        });
      } catch (e) { /* soft-fail */ }
    }

    await fetchRows();
    if (sc?.receipt_id && !rid) {
      const u = new URL(window.location.href);
      u.searchParams.set('rid', sc.receipt_id);
      window.location.replace(u.toString());
    }
  }

  const totale = rows.reduce((s,r)=> s + (Number(r.price_total)||0), 0);
  const docSum = rows.reduce((s,r)=> s + (Number(r.doc_total)||0), 0);
  const docShown = docSum > 0 ? docSum : totale;

  return (
    <>
      <Head><title>Spese Casa</title></Head>
      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
            <h2 className="title">🏠 Spese Casa {rid ? <small style={{opacity:.8}}>(scontrino)</small> : <small style={{opacity:.8}}>(mese corrente)</small>}</h2>
            <Link href="/entrate" className="btn-manuale">↩ Entrate & Saldi</Link>
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

          {showManual && (
            <form className="input-section" onSubmit={onSubmitManual}>
              <label>Punto vendita</label>
              <input value={form.pv} onChange={e=>setForm(f=>({...f, pv:e.target.value}))} required />

              <label>Dettaglio prodotto/servizio</label>
              <input value={form.dettaglio} onChange={e=>setForm(f=>({...f, dettaglio:e.target.value}))} required />

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

          <div className="table-container">
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
                        <td>{new Date(r.purchase_date || r.created_at).toLocaleDateString('it-IT')}</td>
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
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{textAlign:'right', fontWeight:700}}>Totale {rid ? 'scontrino' : 'mese'}:</td>
                    <td style={{fontWeight:800}}>{eur(docShown)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .spese-casa-container1 { width:100%; display:flex; align-items:center; justify-content:center; background:#0f172a; min-height:100vh; padding:2rem; font-family: Inter, sans-serif; }
        .spese-casa-container2 { background:rgba(0, 0, 0, 0.6); padding:2rem; border-radius:1rem; color:#fff; box-shadow:0 6px 16px rgba(0,0,0,0.3); max-width: 1100px; width:100%; }
        .title { margin:0; font-size:1.5rem; }
        .table-buttons { display:flex; flex-wrap:wrap; gap:.6rem; margin:.5rem 0 1rem; align-items:center; }
        .btn-vocale, .btn-ocr, .btn-manuale { background:#10b981; color:#fff; border:0; padding:.5rem 1rem; border-radius:.5rem; cursor:pointer; }
        .btn-ocr { background:#f43f5e; }
        .input-section { display:flex; flex-direction:column; gap:.6rem; margin-bottom:1rem; background:rgba(255,255,255,0.06); padding:1rem; border-radius:.75rem; }
        .row-2 { display:grid; grid-template-columns: 1fr 1fr; gap:.6rem; }
        .row-3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:.6rem; }
        @media (max-width:760px){ .row-2, .row-3 { grid-template-columns: 1fr; } }
        input, textarea { width:100%; padding:.55rem; border-radius:.5rem; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.08); color:#fff; }
        .custom-table { width:100%; border-collapse:collapse; }
        .custom-table th, .custom-table td { padding:.65rem .6rem; border-bottom:1px solid rgba(255,255,255,.12); }
        .icon-trash { background:transparent; border:1px solid rgba(248,113,113,.45); color:#f87171; border-radius:.5rem; padding:.3rem .55rem; cursor:pointer; }
        .icon-trash:hover { background:rgba(248,113,113,.12); }
        .error { color:#f87171; margin-top:.8rem; }
        .btn-manuale { background:#10b981; }
        .btn-vocale { background:#6366f1; }
      `}</style>
    </>
  );
});
