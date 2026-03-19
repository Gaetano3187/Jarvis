// pages/spese-casa.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'

/* ─── Helpers ───────────────────────────────────────────────────── */
function isoLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function smartDate(s) {
  const v = String(s||'').trim().toLowerCase()
  if (/\boggi\b/.test(v)) return isoLocal()
  if (/\bieri\b/.test(v)) { const d=new Date(); d.setDate(d.getDate()-1); return isoLocal(d) }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v); return isNaN(d) ? isoLocal() : isoLocal(d)
}
function toMonthKey(d=new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function clampMK(s) { return /^\d{4}-\d{2}$/.test(String(s||'')) ? s : toMonthKey() }
function monthBounds(mk) {
  const [y,m] = mk.split('-').map(Number)
  return { s: isoLocal(new Date(y,m-1,1)), e: isoLocal(new Date(y,m,0)) }
}
function eur(n) { return (Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'}) }
function getBestMime() {
  if (typeof MediaRecorder==='undefined') return ''
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'])
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch {}
  return ''
}
function extForMime(m='') { return m.includes('mp4')?'voice.mp4':m.includes('ogg')?'voice.ogg':'voice.webm' }

/* ═══════════════════════════════════════════════════════════════ */
function SpeseCasa() {
  const canvasRef   = useRef(null)
  const mediaRef    = useRef(null)
  const chunksRef   = useRef([])
  const streamRef   = useRef(null)
  const ocrRef      = useRef(null)

  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [err,       setErr]       = useState(null)
  const [isRec,     setIsRec]     = useState(false)
  const [aibusy,    setAiBusy]    = useState(false)
  const [userId,    setUserId]    = useState(null)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState({ store:'', description:'', amount:'', date:'' })
  const [monthKey,  setMonthKey]  = useState(() => {
    if (typeof window==='undefined') return toMonthKey()
    return clampMK(localStorage.getItem('__sc_month') || toMonthKey())
  })

  useEffect(() => {
    supabase.auth.getUser().then(({data:{user}}) => { if (user) setUserId(user.id) })
  }, [])

  useEffect(() => {
    try { localStorage.setItem('__sc_month', monthKey) } catch {}
  }, [monthKey])

  const { s: startISO, e: endISO } = useMemo(() => monthBounds(monthKey), [monthKey])

  const fetchRows = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data:{user} } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')
      const { data, error } = await supabase.from('expenses')
        .select('id,store,description,amount,purchase_date,payment_method')
        .eq('user_id', user.id).eq('category','casa')
        .gte('purchase_date', startISO).lte('purchase_date', endISO)
        .order('purchase_date',{ascending:false})
      if (error) throw error
      setRows(data||[])
    } catch(e) { setErr(e.message) } finally { setLoading(false) }
  }, [startISO, endISO])

  useEffect(() => { fetchRows() }, [fetchRows])

  /* ── Canvas particelle ── */
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); let W,H,pts=[],raf
    const resize = () => { W=canvas.width=canvas.offsetWidth; H=canvas.height=canvas.offsetHeight }
    const mkPt = () => ({ x:Math.random()*W, y:Math.random()*H, vx:(Math.random()-.5)*.2, vy:(Math.random()-.5)*.2, a:Math.random()*.3+.05 })
    const init = () => { resize(); pts=Array.from({length:50},mkPt) }
    const draw = () => {
      ctx.clearRect(0,0,W,H)
      for (const p of pts) {
        ctx.beginPath(); ctx.arc(p.x,p.y,.8,0,Math.PI*2)
        ctx.fillStyle=`rgba(34,211,238,${p.a})`; ctx.fill()
        p.x+=p.vx; p.y+=p.vy
        if(p.x<0||p.x>W)p.vx*=-1; if(p.y<0||p.y>H)p.vy*=-1
      }
      raf=requestAnimationFrame(draw)
    }
    init(); draw(); window.addEventListener('resize',init)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize',init) }
  }, [])

  /* ── Aggiungi manuale ── */
  async function onSubmit(e) {
    e.preventDefault(); setErr(null)
    try {
      const { data:{user} } = await supabase.auth.getUser(); if (!user) throw new Error('Sessione scaduta')
      const { error } = await supabase.from('expenses').insert({
        user_id:user.id, category:'casa', store:form.store, description:form.description,
        amount:parseFloat(form.amount)||0, purchase_date:form.date||isoLocal(), source:'manual'
      })
      if (error) throw error
      setForm({store:'',description:'',amount:'',date:''}); await fetchRows()
    } catch(e) { setErr(e.message) }
  }

  async function onDelete(id) {
    const { error } = await supabase.from('expenses').delete().eq('id',id)
    if (error) setErr(error.message); else setRows(rows.filter(r=>r.id!==id))
  }

  /* ── Voce → assistant-v2 ── */
  const toggleRec = useCallback(async () => {
    if (isRec) {
      try { if (mediaRef.current?.state==='recording') { mediaRef.current.requestData?.(); mediaRef.current.stop() } } catch {}
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true})
      streamRef.current = stream; chunksRef.current = []
      const mime = getBestMime()
      mediaRef.current = new MediaRecorder(stream, mime?{mimeType:mime}:undefined)
      mediaRef.current.ondataavailable = e => { if(e.data?.size>0) chunksRef.current.push(e.data) }
      mediaRef.current.onstop = async () => {
        setIsRec(false)
        try {
          const t0=Date.now()
          while(!chunksRef.current.length && Date.now()-t0<1500) await new Promise(r=>setTimeout(r,60))
          if(!chunksRef.current.length) throw new Error('Nessun audio')
          const am = mediaRef.current?.mimeType||mime||'audio/webm'
          const blob = new Blob(chunksRef.current,{type:am})
          if(blob.size<500) throw new Error('Audio troppo corto')
          setAiBusy(true)
          const fd = new FormData(); fd.append('audio',blob,extForMime(am))
          const r = await fetch('/api/stt',{method:'POST',body:fd})
          const j = await r.json().catch(()=>({}))
          if(!r.ok||!j?.text) throw new Error('Trascrizione fallita')
          await sendToAssistant(j.text)
        } catch(e) { setErr('Voce: '+(e.message||e)) }
        finally { setAiBusy(false); try{streamRef.current?.getTracks?.().forEach(t=>t.stop())}catch{} }
      }
      mediaRef.current.start(250); setIsRec(true)
    } catch(e) { setErr(e?.name==='NotAllowedError'?'Microfono non autorizzato':'Microfono non disponibile') }
  }, [isRec])

  /* ── OCR universale ── */
  async function handleOCR(file) {
    if (!file) return
    setAiBusy(true); setErr(null)
    try {
      const fd = new FormData(); fd.append('image',file,'foto.jpg')
      const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(),60000)
      let r; try { r=await fetch('/api/ocr-universal',{method:'POST',body:fd,signal:ctrl.signal}) } finally { clearTimeout(t) }
      const data = await r.json()
      if (!r.ok) throw new Error(data.error||`HTTP ${r.status}`)
      if (data.doc_type!=='receipt'&&data.doc_type!=='invoice') throw new Error('Documento non è uno scontrino — usa la home per altri tipi')
      if (data.categoria!=='casa') throw new Error(`Questo scontrino sembra "${data.categoria}", non casa`)
      // Salva direttamente
      const { data:{user} } = await supabase.auth.getUser()
      const { error } = await supabase.from('expenses').insert({
        user_id:user.id, category:'casa', store:data.store||'Generico',
        store_address:data.store_address||null,
        description:`Spesa ${data.store||''}`,
        amount:parseFloat(data.price_total||0),
        purchase_date:data.purchase_date||isoLocal(),
        payment_method:data.payment_method||'unknown', source:'ocr'
      })
      if (error) throw error
      await fetchRows()
    } catch(e) { setErr('OCR: '+(e.message||e)) }
    finally { setAiBusy(false) }
  }

  async function sendToAssistant(text) {
    if (!userId) return
    const r = await fetch('/api/assistant-v2',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        prompt:`Registra questa spesa casa: "${text}". Estrai store, amount, date (YYYY-MM-DD). Azione: add_expense con category=casa.`,
        userId, conversationHistory:[]
      })
    })
    const data = await r.json()
    if (data.action?.type==='add_expense') {
      const { data:{user} } = await supabase.auth.getUser()
      const { error } = await supabase.from('expenses').insert({
        user_id:user.id, category:'casa',
        store:data.action.store||'Generico',
        description:data.action.description||'Spesa vocale',
        amount:Number(data.action.amount||0),
        purchase_date:data.action.date||isoLocal(),
        payment_method:data.action.payment_method||'cash', source:'voice'
      })
      if (error) throw error
      await fetchRows()
    } else {
      setErr(data.text||'Non ho capito — riprova')
    }
  }

  const totale = rows.reduce((s,r)=>s+Number(r.amount||0),0)
  const [y,m] = monthKey.split('-')
  const monthLabel = new Date(Number(y),Number(m)-1,1).toLocaleString('it-IT',{month:'long',year:'numeric'})

  return (
    <>
      <Head><title>Casa – Jarvis</title></Head>
      <canvas ref={canvasRef} className="page-canvas"/>

      <div className="page-wrap">
        <div className="page-card">

          {/* Header */}
          <div className="card-header">
            <div>
              <div className="card-title">🏠 Spese Casa</div>
              <div className="card-sub">{monthLabel}</div>
            </div>
            <div className="kpi-total">{eur(totale)}</div>
          </div>

          {/* Mese nav */}
          <div className="month-nav">
            <button className="mn-btn" onClick={()=>{const[y,m]=monthKey.split('-').map(Number);setMonthKey(toMonthKey(new Date(y,m-2,1)))}}>‹</button>
            <input type="month" value={monthKey} onChange={e=>setMonthKey(clampMK(e.target.value))} className="mn-input"/>
            <button className="mn-btn" onClick={()=>{const[y,m]=monthKey.split('-').map(Number);setMonthKey(toMonthKey(new Date(y,m,1)))}}>›</button>
          </div>

          {/* Toolbar */}
          <div className="toolbar">
            <button className={`tbtn tbtn-ai ${isRec?'tbtn-rec':''} ${aibusy&&!isRec?'tbtn-busy':''}`} onClick={toggleRec} disabled={aibusy&&!isRec}>
              <span className="tbtn-orb"/>
              {isRec ? '⏹ Stop' : aibusy ? '◌ Elaboro…' : '🎙 Voce'}
            </button>
            <label className={`tbtn tbtn-ocr ${aibusy?'tbtn-busy':''}`}>
              <span className="tbtn-scan"/>
              📷 OCR
              <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)handleOCR(f)}}/>
            </label>
            <button className="tbtn tbtn-add" onClick={()=>setShowForm(v=>!v)}>
              {showForm?'— Chiudi':'＋ Manuale'}
            </button>
          </div>

          {/* Form manuale */}
          {showForm && (
            <form className="entry-form" onSubmit={onSubmit}>
              <div className="form-row">
                <div className="form-field">
                  <label>Punto vendita</label>
                  <input value={form.store} onChange={e=>setForm(f=>({...f,store:e.target.value}))} placeholder="Es. Esselunga, Ikea…" required/>
                </div>
                <div className="form-field">
                  <label>Data</label>
                  <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
                </div>
              </div>
              <div className="form-field">
                <label>Dettaglio</label>
                <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Spesa settimanale, bolletta…"/>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Importo (€)</label>
                  <input type="number" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" required/>
                </div>
                <button type="submit" className="tbtn tbtn-save">✓ Salva</button>
              </div>
            </form>
          )}

          {err && <div className="err-box">{err} <button onClick={()=>setErr(null)}>✕</button></div>}
          {aibusy && <div className="ai-busy-bar"><span/>Jarvis sta elaborando…</div>}

          {/* Tabella */}
          <div className="table-wrap">
            {loading ? <div className="loading-rows"><span/><span/><span/></div> : (
              <table className="data-table">
                <thead>
                  <tr><th>Negozio</th><th>Data</th><th>Dettaglio</th><th>€</th><th/></tr>
                </thead>
                <tbody>
                  {rows.length === 0
                    ? <tr><td colSpan={5} className="empty-row">Nessuna spesa in {monthLabel}</td></tr>
                    : rows.map(r => (
                      <tr key={r.id}>
                        <td>{r.store||'—'}</td>
                        <td className="td-date">{r.purchase_date||'—'}</td>
                        <td className="td-desc">{r.description||'—'}</td>
                        <td className="td-amount">{eur(r.amount)}</td>
                        <td><button className="del-btn" onClick={()=>onDelete(r.id)}>✕</button></td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
        .page-canvas{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;background:#060d18}
        .page-wrap{position:relative;z-index:1;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:5rem 1rem 3rem;font-family:Inter,system-ui,sans-serif}
        .page-card{width:100%;max-width:900px;background:rgba(0,4,12,.85);border:1px solid rgba(34,211,238,.2);border-radius:20px;overflow:hidden}

        .card-header{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.06)}
        .card-title{font-family:'Orbitron',monospace;font-size:1.1rem;font-weight:900;background:linear-gradient(90deg,#5eead4,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:2px}
        .card-sub{font-size:.75rem;color:#475569;margin-top:.2rem;text-transform:capitalize}
        .kpi-total{font-family:'Orbitron',monospace;font-size:1.4rem;font-weight:900;color:#22c55e}

        .month-nav{display:flex;align-items:center;gap:.5rem;padding:.75rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.05)}
        .mn-btn{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.25);border-radius:8px;color:#22d3ee;width:32px;height:32px;cursor:pointer;font-size:1rem}
        .mn-input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#e2e8f0;padding:.3rem .6rem;font-size:.82rem;outline:none}
        .mn-input:focus{border-color:rgba(34,211,238,.4)}

        .toolbar{display:flex;gap:.6rem;padding:.75rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.05);flex-wrap:wrap}
        .tbtn{position:relative;display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1.1rem;border-radius:12px;font-size:.82rem;font-weight:700;cursor:pointer;border:1px solid;overflow:hidden;transition:all .2s;white-space:nowrap}
        .tbtn-ai{background:rgba(34,211,238,.08);border-color:rgba(34,211,238,.3);color:#22d3ee}
        .tbtn-ai:hover{background:rgba(34,211,238,.15);border-color:rgba(34,211,238,.6)}
        .tbtn-rec{background:rgba(239,68,68,.12)!important;border-color:rgba(239,68,68,.5)!important;color:#f87171!important;animation:pulsBtn 1s ease-in-out infinite}
        .tbtn-busy{opacity:.5;cursor:not-allowed}
        .tbtn-ocr{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.3);color:#fbbf24}
        .tbtn-ocr:hover{background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.6)}
        .tbtn-add{background:rgba(99,102,241,.08);border-color:rgba(99,102,241,.3);color:#818cf8}
        .tbtn-add:hover{background:rgba(99,102,241,.15)}
        .tbtn-save{background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.4);color:#22c55e;align-self:flex-end;padding:.55rem 1.4rem}
        .tbtn-orb,.tbtn-scan{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .2s}
        .tbtn-rec .tbtn-orb{background:rgba(239,68,68,.15);opacity:1;animation:pulsBtn 1s ease-in-out infinite}
        @keyframes pulsBtn{0%,100%{opacity:.3}50%{opacity:1}}

        .entry-form{padding:1rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;gap:.7rem}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:.7rem;align-items:end}
        @media(max-width:600px){.form-row{grid-template-columns:1fr}}
        .form-field{display:flex;flex-direction:column;gap:.3rem}
        .form-field label{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:#475569}
        .form-field input{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#e2e8f0;padding:.45rem .7rem;font-size:.85rem;outline:none}
        .form-field input:focus{border-color:rgba(34,211,238,.4)}

        .err-box{margin:.5rem 1.5rem;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:.6rem 1rem;font-size:.8rem;color:#f87171;display:flex;justify-content:space-between;align-items:center}
        .err-box button{background:none;border:none;color:#f87171;cursor:pointer;font-size:.9rem}
        .ai-busy-bar{display:flex;align-items:center;gap:.5rem;padding:.6rem 1.5rem;font-size:.78rem;color:#22d3ee;border-bottom:1px solid rgba(255,255,255,.04)}
        .ai-busy-bar span{width:6px;height:6px;border-radius:50%;background:#22d3ee;animation:typing .9s infinite}

        .table-wrap{overflow-x:auto;padding:.5rem 0}
        .data-table{width:100%;border-collapse:collapse;font-size:.82rem}
        .data-table thead tr{background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08)}
        .data-table th{padding:.65rem 1.2rem;text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#475569;font-weight:600}
        .data-table td{padding:.65rem 1.2rem;border-bottom:1px solid rgba(255,255,255,.04);color:#e2e8f0;vertical-align:middle}
        .data-table tbody tr:hover{background:rgba(255,255,255,.03)}
        .td-date{color:#64748b;font-size:.78rem;white-space:nowrap}
        .td-desc{color:#94a3b8;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .td-amount{font-weight:700;color:#22c55e;white-space:nowrap}
        .del-btn{background:none;border:1px solid rgba(239,68,68,.25);border-radius:6px;color:rgba(239,68,68,.6);cursor:pointer;padding:.2rem .5rem;font-size:.75rem;transition:all .15s}
        .del-btn:hover{border-color:rgba(239,68,68,.6);color:#f87171;background:rgba(239,68,68,.08)}
        .empty-row{text-align:center;color:#334155;padding:2rem!important}
        .loading-rows{display:flex;flex-direction:column;gap:.5rem;padding:1.5rem}
        .loading-rows span{height:36px;background:rgba(255,255,255,.04);border-radius:8px;animation:shimLoad 1.5s ease-in-out infinite}
        @keyframes shimLoad{0%,100%{opacity:.4}50%{opacity:.8}}
        @keyframes typing{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
      `}</style>
    </>
  )
}

export default withAuth(SpeseCasa)
export async function getServerSideProps() { return { props:{} } }