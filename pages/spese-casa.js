// pages/spese-casa.js
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '@/lib/supabaseClient'

/* ================= Helpers date & money ================= */
function isoLocal(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function smartDate(input) {
  const s = String(input || '').trim().toLowerCase()
  if (/\boggi\b/.test(s)) return isoLocal(new Date())
  if (/\bieri\b/.test(s)) { const d = new Date(); d.setDate(d.getDate() - 1); return isoLocal(d) }
  if (/\bdomani\b/.test(s)) { const d = new Date(); d.setDate(d.getDate() + 1); return isoLocal(d) }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (m) { const dd = String(parseInt(m[1],10)).padStart(2,'0'); const mm = String(parseInt(m[2],10)).padStart(2,'0'); const yyyy = m[3]; return `${yyyy}-${mm}-${dd}` }
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/)
  if (m) { const yyyy = m[1]; const mm = String(parseInt(m[2],10)).padStart(2,'0'); const dd = String(parseInt(m[3],10)).padStart(2,'0'); return `${yyyy}-${mm}-${dd}` }
  const d = new Date(s); return isNaN(d) ? isoLocal(new Date()) : isoLocal(d)
}
function fmtDateIT(v) {
  if (!v) return '-'
  const s = String(v), ymd = s.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (ymd) { const [yy, mm, dd] = ymd.split('-').map(Number); return new Date(yy, mm - 1, dd).toLocaleDateString('it-IT') }
  return new Date(s).toLocaleDateString('it-IT')
}
function toNum(n){ const x = Number(n); return Number.isFinite(x) ? x : 0; }
function eur(n){ return (Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'}) }

/* ========= Totale pagina: usa totali scontrino (doc_total) se presenti =========
   Gruppo = (receipt_id se esiste) altrimenti (store_normalizzato + data).      */
function sumReceipts(rows = []) {
  const groups = new Map()
  for (const r of rows) {
    const k = r.receipt_id
      ? `rid:${r.receipt_id}`
      : `sd:${String(r.store||'').toLowerCase().trim()}|${String(r.purchase_date||r.created_at||'').slice(0,10)}`
    const g = groups.get(k) || { docTotal: 0, sumLines: 0 }
    g.docTotal = Math.max(g.docTotal, Number(r.doc_total || 0) || 0)
    g.sumLines += Number(r.price_total || 0) || 0
    groups.set(k, g)
  }
  let tot = 0
  groups.forEach(g => { tot += g.docTotal > 0 ? g.docTotal : g.sumLines })
  return tot
}

/* ============================ Component ============================ */
function SpeseCasa() {
  const [spese, setSpese] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showManual, setShowManual] = useState(false)

  const [recBusy, setRecBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '', indirizzo:'', luogo:'',
    dettaglio: '', prezzoUnitario:'', prezzoTotale: '', quantita: '1', spentAt: '',
    paymentMethod: 'cash', cardLabel: '',
  })

  const ocrInputRef = useRef(null)
  const mediaRecRef = useRef(null)
  const streamRef = useRef(null)
  const recordedChunks = useRef([])
  const mimeRef = useRef('')
  const stopWaitRef = useRef(null)

  const now = new Date()
  const periodStart = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1))
  const periodEnd   = isoLocal(new Date(now.getFullYear(), now.getMonth()+1, 0))

  const fetchSpese = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data:{ user }, error:userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      if (!user) throw new Error('Sessione scaduta')

      const { data, error } = await supabase
        .from('jarvis_spese_casa')
        .select('id, store, name, brand, price_each, price_total, packs, units_per_pack, unit_label, doc_total, receipt_id, purchase_date, created_at')
        .eq('user_id', user.id)
        .gte('purchase_date', periodStart)
        .lte('purchase_date', periodEnd)
        .order('created_at', { ascending:false })

      if (error) throw error
      setSpese(data || [])
    } catch (e) {
      setError(e?.message || String(e))
    } finally { setLoading(false) }
  }, [periodStart, periodEnd])

  /* =================== Media (voce) =================== */
  const stopTracks = useCallback(() => {
    try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
    streamRef.current = null
  }, [])
  const processVoice = useCallback(async () => {
    try {
      if (!recordedChunks.current.length) { setError('Registrazione vuota, riprova.'); return }
      const mime = mimeRef.current || (recordedChunks.current[0]?.type || 'audio/webm')
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
      const blob = new Blob(recordedChunks.current, { type: mime })
      const fd = new FormData()
      fd.append('audio', blob, `voice.${ext}`)
      const resp = await fetch('/api/stt', { method:'POST', body:fd })
      const json = await resp.json().catch(()=> ({}))
      if (!resp.ok || !json?.text) throw new Error('STT fallito')
      await parseAssistantPrompt(buildSystemPrompt('voice', json.text), json.text)
    } catch (err) { console.error(err); setError('STT fallito') }
    finally { recordedChunks.current = [] }
  }, [])
  const stopRecording = useCallback(async (sync=false) => {
    if (!mediaRecRef.current) { stopTracks(); setRecBusy(false); return }
    if (mediaRecRef.current.state !== 'recording') { stopTracks(); setRecBusy(false); return }
    setStopping(true)
    const p = new Promise(resolve => { stopWaitRef.current = { resolve }; setTimeout(()=>resolve('timeout'), 2000) })
    try { mediaRecRef.current.stop() } catch { stopWaitRef.current?.resolve?.() }
    if (!sync) await p
    mediaRecRef.current = null
    stopTracks()
    setStopping(false)
  }, [stopTracks])

  useEffect(() => {
    fetchSpese()
    const handleVisibility = () => { if (document.hidden) stopRecording() }
    const handleBeforeUnload = () => { stopRecording(true) }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)

    // quando arriva ingest da Home, aggiorno
    const onIngest = () => fetchSpese()
    window.addEventListener('spese:ingest:done', onIngest)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('spese:ingest:done', onIngest)
      stopRecording(true)
    }
  }, [fetchSpese, stopRecording])

  /* =================== Manual Add =================== */
  const handleAdd = async e => {
    e.preventDefault(); setError(null)
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      const spentISO = nuovaSpesa.spentAt ? smartDate(nuovaSpesa.spentAt) : isoLocal(new Date())
      const qty = Math.max(1, parseFloat(nuovaSpesa.quantita) || 1)
      const unit = toNum(nuovaSpesa.prezzoUnitario)
      let priceTotal = toNum(nuovaSpesa.prezzoTotale)
      if (unit > 0) priceTotal = Number((unit * qty).toFixed(2))
      const priceEach = unit > 0 ? unit : (qty ? priceTotal / qty : priceTotal)

      const storeFull = [nuovaSpesa.puntoVendita, nuovaSpesa.indirizzo, nuovaSpesa.luogo]
        .map(s => String(s||'').trim()).filter(Boolean).join(' — ')

      const row = {
        user_id: user.id,
        store: storeFull || null,
        purchase_date: spentISO,
        // doc_total qui è 0: per manuali non abbiamo "totale scontrino" distinto
        doc_total: 0,
        name: (nuovaSpesa.dettaglio || '').trim(),
        brand: null,
        packs: qty,
        units_per_pack: 1,
        unit_label: 'unità',
        price_each: priceEach,
        price_total: priceTotal,
        currency: 'EUR'
      }

      const { error: insertErr } = await supabase.from('jarvis_spese_casa').insert(row)
      if (insertErr) throw insertErr

      setNuovaSpesa({
        puntoVendita:'', indirizzo:'', luogo:'',
        dettaglio:'', prezzoUnitario:'', prezzoTotale:'', quantita:'1', spentAt:'',
        paymentMethod:'cash', cardLabel:''
      })
      setShowManual(false)
      await fetchSpese()
    } catch (e) { setError(e?.message || String(e)) }
  }

  /* =================== Delete row =================== */
  const handleDelete = async (id) => {
    setError(null);
    setDeletingId(id);

    const row = spese.find(r => r.id === id) || null;
    setSpese(prev => prev.filter(r => r.id !== id));

    try {
      const r = await fetch('/api/spese-casa/delete', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ id })
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok || !j?.ok || !(j.deleted > 0)) {
        await fetchSpese();
        throw new Error(j?.message || j?.error || 'Delete failed');
      }
      await fetchSpese();

      if (row) {
        const stillExists = spese.some(s =>
          s.id !== id &&
          String(s.store||'').toLowerCase().trim() === String(row.store||'').toLowerCase().trim() &&
          String(s.purchase_date||s.created_at||'').slice(0,10) === String(row.purchase_date||row.created_at||'').slice(0,10)
        );
        if (!stillExists) {
          try {
            window.dispatchEvent(new CustomEvent('spese:casa:changed', {
              detail: { store: row.store || '', date: String(row.purchase_date || row.created_at || '').slice(0,10) }
            }));
          } catch {}
        }
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setDeletingId(null);
    }
  };

  /* =================== OCR & Voce =================== */
  const handleOCR = async files => {
    setError(null)
    if (!files || !files.length) return
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('images', f))
      const res = await fetch('/api/ocr', { method:'POST', body:fd })
      const { text, error: ocrErr } = await res.json()
      if (!res.ok || ocrErr) throw new Error(ocrErr || 'OCR fallito')
      await parseAssistantPrompt(buildSystemPrompt('ocr', text, files.map(f => f.name).join(', ')), text)
    } catch (err) { console.error(err); setError('OCR fallito') }
  }

  const toggleRec = async () => {
    setError(null)
    if (stopping) return
    if (recBusy) { await stopRecording(); return }
    if (mediaRecRef.current && mediaRecRef.current.state === 'recording') return
    if (typeof window === 'undefined' || !('MediaRecorder' in window)) { setError('Questo browser non supporta la registrazione audio.'); return }

    const candidates = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus','audio/ogg']
    let chosen = ''; for (const c of candidates) { if (window.MediaRecorder.isTypeSupported?.(c)) { chosen = c; break } }
    mimeRef.current = chosen

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordedChunks.current = []
      const mr = new MediaRecorder(streamRef.current, chosen ? { mimeType: chosen } : undefined)
      mediaRecRef.current = mr
      mr.addEventListener('dataavailable', e => { if (e.data && e.data.size) recordedChunks.current.push(e.data) })
      mr.addEventListener('stop', () => { stopWaitRef.current?.resolve?.(); processVoice().finally(()=> setRecBusy(false)) }, { once:true })
      mr.start()
      setRecBusy(true)
    } catch (err) { console.error(err); setError('Microfono non disponibile'); stopTracks(); setRecBusy(false) }
  }

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

  async function parseAssistantPrompt(prompt, rawSourceText = '') {
    const res = await fetch('/api/assistant', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt }) })
    const { answer, error: apiErr } = await res.json()
    if (!res.ok || apiErr) throw new Error(apiErr || res.status)

    const data = JSON.parse(answer)
    if (data.type !== 'expense' || !Array.isArray(data.items) || !data.items.length) throw new Error('Assistant response invalid')

    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const raw = String(rawSourceText || '').toLowerCase()
    const saidOggi   = /\boggi\b/.test(raw)
    const saidIeri   = /\bieri\b/.test(raw)
    const saidDomani = /\bdomani\b/.test(raw)

    const rc = data.receipt || {}
    let spentDate = smartDate(rc.data || '')
    if (saidOggi)   spentDate = isoLocal(new Date())
    if (saidIeri)  { const d = new Date(); d.setDate(d.getDate() - 1); spentDate = isoLocal(d) }
    if (saidDomani){ const d = new Date(); d.setDate(d.getDate() + 1); spentDate = isoLocal(d) }

    const puntoVendita = String(rc.puntoVendita || '').trim()
    const indirizzo    = String(rc.indirizzo || '').trim()
    const luogo        = String(rc.luogo || '').trim()
    const storeFull    = [puntoVendita, indirizzo, luogo].filter(Boolean).join(' — ')
    const totaleScontrino = toNum(rc.totaleScontrino)

    let first = true
    for (const it of data.items) {
      const qty = Math.max(1, parseFloat(it.quantita) || 1)
      const unit = toNum(it.prezzoUnitario)
      let lineTotal = toNum(it.prezzoPagato)
      if (!lineTotal && unit) lineTotal = Number((unit * qty).toFixed(2))
      const priceEach = unit > 0 ? unit : (qty ? lineTotal/qty : lineTotal)

      const row = {
        user_id: user.id,
        store: storeFull || puntoVendita || null,
        purchase_date: spentDate,
        // << Totale scontrino: lo salvo solo sulla prima riga del gruppo >>
        doc_total: first && totaleScontrino > 0 ? totaleScontrino : 0,
        name: String(it.dettaglio || '').trim(),
        brand: null,
        packs: qty,
        units_per_pack: 1,
        unit_label: (it.uom || 'unità'),
        price_each: priceEach,
        price_total: lineTotal,
        currency: 'EUR'
      }

      const { error: dbErr } = await supabase.from('jarvis_spese_casa').insert(row)
      if (dbErr) throw new Error(dbErr.message || 'Insert fallito')
      first = false
    }

    await fetchSpese()

    // Precompila form manuale con ultimo contesto (comodo)
    const last = data.items[0]
    setNuovaSpesa({
      puntoVendita: puntoVendita,
      indirizzo, luogo,
      dettaglio: String(last.dettaglio || ''),
      prezzoUnitario: String(last.prezzoUnitario ?? ''),
      prezzoTotale: String(last.prezzoPagato ?? ''),
      quantita: String(last.quantita ?? '1'),
      spentAt: spentDate,
      paymentMethod: 'cash',
      cardLabel: ''
    })
  }

  /* =================== Totali =================== */
  const totalePagina = sumReceipts(spese) // somma dei doc_total (o righe, se assenti)

  /* =================== UI =================== */
  // calcolo totale live nel form manuale
  const qtyLive  = Math.max(1, parseFloat(nuovaSpesa.quantita || '1') || 1)
  const unitLive = toNum(nuovaSpesa.prezzoUnitario)
  const liveTot  = unitLive > 0 ? (unitLive * qtyLive) : toNum(nuovaSpesa.prezzoTotale)

  return (
    <>
      <Head><title>Spese Casa</title></Head>

      <div className="spese-casa-container1">
        <div className="spese-casa-container2">
          <h2 className="title">🏠 Spese Casa</h2>

          <div className="table-buttons">
            <button className="btn-vocale" onClick={toggleRec} disabled={stopping} title={stopping ? 'Chiusura microfono…' : ''}>
              {recBusy && !stopping ? '⏹ Stop' : (stopping ? '…' : '🎙 Voce')}
            </button>
            <button className="btn-ocr" onClick={() => ocrInputRef.current?.click()}>📷 OCR</button>
            <button className="btn-manuale" onClick={() => setShowManual(v => !v)}>
              {showManual ? '— Nascondi manuale' : '➕ Aggiungi manuale'}
            </button>
            <Link href="/entrate" className="btn-manuale">↩ Entrate & Saldi</Link>
            <input ref={ocrInputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => handleOCR(Array.from(e.target.files || []))} />
          </div>

          {showManual && (
            <form className="input-section" onSubmit={handleAdd}>
              <label>Punto vendita</label>
              <input value={nuovaSpesa.puntoVendita} onChange={e => setNuovaSpesa({ ...nuovaSpesa, puntoVendita: e.target.value })} required />

              <div className="row-2">
                <div>
                  <label>Indirizzo</label>
                  <input value={nuovaSpesa.indirizzo} onChange={e => setNuovaSpesa({ ...nuovaSpesa, indirizzo: e.target.value })} />
                </div>
                <div>
                  <label>Luogo</label>
                  <input value={nuovaSpesa.luogo} onChange={e => setNuovaSpesa({ ...nuovaSpesa, luogo: e.target.value })} />
                </div>
              </div>

              <label>Dettaglio prodotto/servizio</label>
              <textarea value={nuovaSpesa.dettaglio} onChange={e => setNuovaSpesa({ ...nuovaSpesa, dettaglio: e.target.value })} required />

              <div className="row-3">
                <div>
                  <label>Data di acquisto</label>
                  <input type="date" value={nuovaSpesa.spentAt} onChange={e => setNuovaSpesa({ ...nuovaSpesa, spentAt: e.target.value })} required />
                </div>
                <div>
                  <label>Quantità</label>
                  <input type="number" min="1" step="1" value={nuovaSpesa.quantita} onChange={e => setNuovaSpesa({ ...nuovaSpesa, quantita: e.target.value })} required />
                </div>
                <div>
                  <label>Prezzo unitario (€)</label>
                  <input type="number" step="0.01" value={nuovaSpesa.prezzoUnitario} onChange={e => setNuovaSpesa({ ...nuovaSpesa, prezzoUnitario: e.target.value })} />
                </div>
              </div>

              <div className="row-2">
                <div>
                  <label>Prezzo pagato (€)</label>
                  <input type="number" step="0.01" value={nuovaSpesa.prezzoTotale} onChange={e => setNuovaSpesa({ ...nuovaSpesa, prezzoTotale: e.target.value })} />
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
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Punto vendita (indirizzo, luogo)</th>
                    <th>Data</th>
                    <th>Prodotto</th>
                    <th>Qtà</th>
                    <th>Prezzo unit.</th>
                    <th>Pagato</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(spese || []).map(r => {
                    const qty = (r.units_per_pack && r.units_per_pack > 1)
                      ? `${r.packs}×${r.units_per_pack} ${r.unit_label || ''}`.trim()
                      : `${r.packs || 1} ${r.unit_label || ''}`.trim()
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
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(r.id); }}
                          >
                            {deletingId === r.id ? '…' : '🗑'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <div className="total-box">
              Totale scontrini (periodo): <b>{eur(totalePagina)}</b>
            </div>
          </div>

          {error && <p className="error">{error}</p>}
        </div>
      </div>

      <style jsx>{`
        .spese-casa-container1 { width:100%; display:flex; align-items:center; justify-content:center; background:#0f172a; min-height:100vh; padding:2rem; font-family: Inter, sans-serif; }
        .spese-casa-container2 { background:rgba(0, 0, 0, 0.6); padding:2rem; border-radius:1rem; color:#fff; box-shadow:0 6px 16px rgba(0,0,0,0.3); max-width: 1100px; width:100%; }
        .title { margin-bottom:1rem; font-size:1.5rem; }
        .table-buttons { display:flex; flex-wrap:wrap; gap:.6rem; margin-bottom:1rem; align-items:center; }
        .btn-ocr, .btn-manuale, .btn-vocale { display:inline-block; text-align:center; background:#10b981; color:#fff; border:none; padding:.5rem 1rem; border-radius:.5rem; cursor:pointer; text-decoration:none; }
        .btn-ocr { background:#f43f5e; }
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
  )
}


export default withAuth(SpeseCasa)
