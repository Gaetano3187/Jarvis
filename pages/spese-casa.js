// pages/spese-casa.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '../lib/supabaseClient';

/* ================= Helpers date ================= */
function isoLocal(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function smartDate(input) {
  const s = String(input || '').trim().toLowerCase();
  if (/\boggi\b/.test(s)) return isoLocal(new Date());
  if (/\bieri\b/.test(s)) { const d = new Date(); d.setDate(d.getDate() - 1); return isoLocal(d); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s); return isNaN(d) ? isoLocal(new Date()) : isoLocal(d);
}
function fmtDateIT(v) {
  if (!v) return '-';
  const s = String(v), ymd = s.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (ymd) { const [yy, mm, dd] = ymd.split('-').map(Number); return new Date(yy, mm - 1, dd).toLocaleDateString('it-IT'); }
  return new Date(s).toLocaleDateString('it-IT');
}
function eur(n){ return (Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'}); }

function toMonthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function monthBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end   = new Date(y, m, 0);
  return { startISO: isoLocal(start), endISO: isoLocal(end) };
}
function clampMonthKey(s) { return /^\d{4}-\d{2}$/.test(String(s||'')) ? s : toMonthKey(new Date()); }

/* ============================ Component ============================ */
function SpeseCasa() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const ocrInputRef = useRef(null);
  const mediaRecRef = useRef(null);
  const streamRef = useRef(null);
  const recordedChunks = useRef([]);
  const [recBusy, setRecBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const mimeRef = useRef('');

  const initialMonth = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('month') || null;
  }, []);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');
      const { data, error } = await supabase
        .from('expenses')
        .select('id, store, description, amount, purchase_date, created_at')
        .eq('user_id', user.id)
        .eq('category', 'casa')
        .gte('purchase_date', startISO)
        .lte('purchase_date', endISO)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [startISO, endISO]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  /* =================== Form manuale =================== */
  const [form, setForm] = useState({ store: '', description: '', amount: '', date: '' });

  const onSubmitManual = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessione scaduta');
      const { error } = await supabase.from('expenses').insert({
        user_id:      user.id,
        category:     'casa',
        store:        form.store,
        description:  form.description,
        amount:       parseFloat(form.amount) || 0,
        purchase_date: form.date || isoLocal(new Date()),
        payment_method: 'cash',
        source:       'manual',
      });
      if (error) throw error;
      setForm({ store: '', description: '', amount: '', date: '' });
      await fetchRows();
    } catch (e) { setErr(e?.message || String(e)); }
  };

  /* =================== Delete row =================== */
  const onDelete = async (id) => {
    try {
      setDeletingId(id);
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
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
      const resp = await fetch('/api/ocr', { method:'POST', body: fd });
      const ocr = await resp.json().catch(()=> ({}));
      if (!resp.ok) throw new Error(ocr?.error || 'OCR fallito');
      const text = String(ocr?.text || '').trim();
      if (!text) throw new Error('Nessun testo OCR');
      const prompt = buildSystemPrompt('ocr', text);
      const r2 = await fetch('/api/assistant', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt })
      });
      const a2 = await r2.json().catch(()=> ({}));
      if (!r2.ok) throw new Error(a2?.error || 'Assistant fallito');
      const data = JSON.parse(a2.answer || '{}');
      await applyExpenseFromAssistant(data);
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    }
  };

  /* =================== VOCE =================== */
  const startVoice = async () => {
    setErr(null);
    if (recBusy || stopping) return;
    const cand = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
    let chosen = ''; for (const c of cand) { if (window.MediaRecorder?.isTypeSupported?.(c)) { chosen = c; break; } }
    mimeRef.current = chosen;
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks.current = [];
      const mr = new MediaRecorder(streamRef.current, chosen ? { mimeType: chosen } : undefined);
      mediaRecRef.current = mr;
      mr.ondataavailable = (e)=> { if (e.data && e.data.size) recordedChunks.current.push(e.data); };
      mr.onstop = async () => {
        try {
          const mime = mimeRef.current || 'audio/webm';
          const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
          const blob = new Blob(recordedChunks.current, { type: mime });
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
          await applyExpenseFromAssistant(data);
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
  function buildSystemPrompt(source, userText) {
    const header = [
      'Sei Jarvis. Estrai SPESE CASA.',
      'Rispondi SOLO JSON nel formato:',
      '{',
      '  "type":"expense",',
      '  "store":"string",',
      '  "description":"string",',
      '  "date":"YYYY-MM-DD|oggi|ieri",',
      '  "total": number',
      '}',
    ].join('\n');
    if (source === 'ocr') return [header, '', 'Testo OCR:', String(userText || '')].join('\n');
    return [header, '', 'Trascrizione:', String(userText || '')].join('\n');
  }

  async function applyExpenseFromAssistant(data) {
    if (!data || data.type !== 'expense') throw new Error('Assistant: risposta non valida');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');
    const { error } = await supabase.from('expenses').insert({
      user_id:      user.id,
      category:     'casa',
      store:        data.store || 'Punto vendita',
      description:  data.description || '',
      amount:       Number(data.total || 0),
      purchase_date: smartDate(data.date || ''),
      source:       'ocr',
    });
    if (error) throw error;
    await fetchRows();
  }

  /* =================== Totali =================== */
  const totalePagina = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <>
      <Head><title>Spese Casa</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
            <h2 className="title">🏠 Spese Casa <small style={{opacity:.8}}>(mese {monthKey})</small></h2>
            <Link href="/finanze" className="btn-manuale">📊 Vai a Finanze</Link>
          </div>

          {/* Toolbar mese */}
          <div style={{display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px'}}>
            <button className="btn-manuale" onClick={()=>{
              const [y,m]=monthKey.split('-').map(Number);
              setMonthKey(toMonthKey(new Date(y, m-2, 1)));
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
              setMonthKey(toMonthKey(new Date(y, m, 1)));
            }}>»</button>
          </div>

          <div className="table-buttons">
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>📷 OCR</button>
            <button className="btn-vocale" onClick={recBusy ? stopVoice : startVoice} disabled={stopping}>
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
                <input value={form.store} onChange={e=>setForm(f=>({...f, store:e.target.value}))} required />

                <label>Dettaglio prodotto/servizio</label>
                <textarea value={form.description} onChange={e=>setForm(f=>({...f, description:e.target.value}))} required />

                <div className="row-2">
                  <div>
                    <label>Data</label>
                    <input type="date" value={form.date} onChange={e=>setForm(f=>({...f, date:e.target.value}))} />
                  </div>
                  <div>
                    <label>Importo (€)</label>
                    <input type="number" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f, amount:e.target.value}))} required />
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
                    <th>Descrizione</th>
                    <th>Importo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td>{r.store || '-'}</td>
                      <td>{fmtDateIT(r.purchase_date || r.created_at)}</td>
                      <td>{r.description || '-'}</td>
                      <td>{eur(r.amount)}</td>
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
                  ))}
                </tbody>
              </table>
            )}
            <div className="total-box">
              Totale mese {monthKey}: <b>{eur(totalePagina)}</b>
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
        @media (max-width: 760px) { .row-2 { grid-template-columns: 1fr; } }
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
      `}</style>
    </>
  );
}

export default withAuth(SpeseCasa);

export async function getServerSideProps() {
  return { props: {} }
}
