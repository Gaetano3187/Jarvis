// pages/cene-aperitivi.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'

function isoLocal(d=new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function toMonthKey(d=new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function clampMK(s) { return /^\d{4}-\d{2}$/.test(String(s||''))?s:toMonthKey() }
function monthBounds(mk) {
  if (mk==='all') return { s:'2000-01-01', e:'2099-12-31' }
  const [y,m]=mk.split('-').map(Number)
  return { s:isoLocal(new Date(y,m-1,1)), e:isoLocal(new Date(y,m,0)) }
}
function eur(n) { return (Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'}) }
function getBestMime() {
  if (typeof MediaRecorder==='undefined') return ''
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'])
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch {}
  return ''
}
function extForMime(m='') { return m.includes('mp4')?'voice.mp4':m.includes('ogg')?'voice.ogg':'voice.webm' }

function CeneAperitivi() {
  const canvasRef = useRef(null)
  const mediaRef  = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [err,      setErr]      = useState(null)
  const [isRec,    setIsRec]    = useState(false)
  const [aibusy,   setAiBusy]   = useState(false)
  const [userId,   setUserId]   = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ store:'', description:'', amount:'', date:'' })
  const [monthKey, setMonthKey] = useState(() => {
    if (typeof window==='undefined') return toMonthKey()
    return clampMK(localStorage.getItem('__cene_month')||toMonthKey())
  })

  useEffect(() => {
    supabase.auth.getUser().then(({data:{user}}) => { if (user) setUserId(user.id) })
  }, [])
  useEffect(() => { try { localStorage.setItem('__cene_month',monthKey) } catch {} }, [monthKey])

  const { s:startISO, e:endISO } = useMemo(() => monthBounds(monthKey), [monthKey])

  const fetchRows = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data:{user} } = await supabase.auth.getUser(); if (!user) throw new Error('Sessione scaduta')
      let q = supabase.from('expenses').select('id,store,description,amount,purchase_date').eq('user_id',user.id).eq('category','cene').order('purchase_date',{ascending:false})
      if (monthKey!=='all') q = q.gte('purchase_date',startISO).lte('purchase_date',endISO)
      const { data, error } = await q; if (error) throw error; setRows(data||[])
    } catch(e) { setErr(e.message) } finally { setLoading(false) }
  }, [startISO, endISO, monthKey])

  useEffect(() => { fetchRows() }, [fetchRows])

  /* Canvas */
  useEffect(() => {
    const canvas=canvasRef.current; if (!canvas) return
    const ctx=canvas.getContext('2d'); let W,H,pts=[],raf
    const resize=()=>{W=canvas.width=canvas.offsetWidth;H=canvas.height=canvas.offsetHeight}
    const mkPt=()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.2,a:Math.random()*.3+.05})
    const init=()=>{resize();pts=Array.from({length:50},mkPt)}
    const draw=()=>{
      ctx.clearRect(0,0,W,H)
      for(const p of pts){ctx.beginPath();ctx.arc(p.x,p.y,.8,0,Math.PI*2);ctx.fillStyle=`rgba(251,191,36,${p.a})`;ctx.fill();p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1}
      raf=requestAnimationFrame(draw)
    }
    init();draw();window.addEventListener('resize',init)
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',init)}
  }, [])

  async function onSubmit(e) {
    e.preventDefault(); setErr(null)
    try {
      const { data:{user} } = await supabase.auth.getUser(); if (!user) throw new Error()
      const { error } = await supabase.from('expenses').insert({
        user_id:user.id, category:'cene', store:form.store||'Cena/Aperitivo',
        description:form.description, amount:parseFloat(form.amount)||0,
        purchase_date:form.date||isoLocal(), source:'manual'
      })
      if (error) throw error; setForm({store:'',description:'',amount:'',date:''}); await fetchRows()
    } catch(e) { setErr(e.message) }
  }

  async function onDelete(id) {
    const { error } = await supabase.from('expenses').delete().eq('id',id)
    if (error) setErr(error.message); else setRows(rows.filter(r=>r.id!==id))
  }

  const toggleRec = useCallback(async () => {
    if (isRec) {
      try { if (mediaRef.current?.state==='recording') { mediaRef.current.requestData?.(); mediaRef.current.stop() } } catch {}
      return
    }
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true})
      streamRef.current=stream; chunksRef.current=[]
      const mime=getBestMime()
      mediaRef.current=new MediaRecorder(stream,mime?{mimeType:mime}:undefined)
      mediaRef.current.ondataavailable=e=>{if(e.data?.size>0)chunksRef.current.push(e.data)}
      mediaRef.current.onstop=async()=>{
        setIsRec(false)
        try {
          const t0=Date.now(); while(!chunksRef.current.length&&Date.now()-t0<1500)await new Promise(r=>setTimeout(r,60))
          if(!chunksRef.current.length)throw new Error('Nessun audio')
          const am=mediaRef.current?.mimeType||mime||'audio/webm'
          const blob=new Blob(chunksRef.current,{type:am}); if(blob.size<500)throw new Error('Troppo corto')
          setAiBusy(true)
          const fd=new FormData(); fd.append('audio',blob,extForMime(am))
          const r=await fetch('/api/stt',{method:'POST',body:fd}); const j=await r.json().catch(()=>({}))
          if(!r.ok||!j?.text)throw new Error('Trascrizione fallita')
          await sendToAssistant(j.text)
        } catch(e){setErr('Voce: '+(e.message||e))}
        finally{setAiBusy(false);try{streamRef.current?.getTracks?.().forEach(t=>t.stop())}catch{}}
      }
      mediaRef.current.start(250); setIsRec(true)
    } catch(e){setErr(e?.name==='NotAllowedError'?'Microfono non autorizzato':'Microfono non disponibile')}
  }, [isRec])

  async function handleOCR(file) {
    if (!file) return; setAiBusy(true); setErr(null)
    try {
      const fd=new FormData(); fd.append('image',file,'foto.jpg')
      const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),60000)
      let r; try{r=await fetch('/api/ocr-universal',{method:'POST',body:fd,signal:ctrl.signal})}finally{clearTimeout(t)}
      const data=await r.json(); if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`)
      if(data.doc_type!=='receipt'&&data.doc_type!=='invoice')throw new Error('Non è uno scontrino')
      if(data.categoria!=='cene')throw new Error(`Scontrino categoria "${data.categoria}", non cene`)
      const { data:{user} }=await supabase.auth.getUser()
      const { error }=await supabase.from('expenses').insert({
        user_id:user.id,category:'cene',store:data.store||'Cena/Aperitivo',
        description:`${data.store||''} — ${data.purchase_date||''}`,
        amount:parseFloat(data.price_total||0),purchase_date:data.purchase_date||isoLocal(),
        payment_method:data.payment_method||'unknown',source:'ocr'
      })
      if(error)throw error; await fetchRows()
    } catch(e){setErr('OCR: '+(e.message||e))} finally{setAiBusy(false)}
  }

  async function sendToAssistant(text) {
    if (!userId) return
    const r=await fetch('/api/assistant-v2',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt:`Registra questa cena/aperitivo: "${text}". Estrai store, amount, date. Azione: add_expense con category=cene.`,userId,conversationHistory:[]})
    })
    const data=await r.json()
    if (data.action?.type==='add_expense') {
      const { data:{user} }=await supabase.auth.getUser()
      const { error }=await supabase.from('expenses').insert({
        user_id:user.id,category:'cene',store:data.action.store||'Cena/Aperitivo',
        description:data.action.description||'Cena vocale',amount:Number(data.action.amount||0),
        purchase_date:data.action.date||isoLocal(),payment_method:data.action.payment_method||'cash',source:'voice'
      })
      if(error)throw error; await fetchRows()
    } else { setErr(data.text||'Non ho capito') }
  }

  const totale=rows.reduce((s,r)=>s+Number(r.amount||0),0)
  const monthLabel = monthKey==='all'?'Tutti i mesi':new Date(Number(monthKey.split('-')[0]),Number(monthKey.split('-')[1])-1,1).toLocaleString('it-IT',{month:'long',year:'numeric'})

  return (
    <>
      <Head><title>Cene – Jarvis</title></Head>
      <canvas ref={canvasRef} className="page-canvas" style={{background:'#0a0800'}}/>
      <div className="page-wrap">
        <div className="page-card" style={{'--accent':'#fbbf24','--accent-dim':'rgba(251,191,36,.25)','--accent-rgb':'251,191,36'}}>

          <div className="card-header">
            <div>
              <div className="card-title" style={{backgroundImage:'linear-gradient(90deg,#fbbf24,#fb923c)'}}>🍽️ Cene & Aperitivi</div>
              <div className="card-sub">{monthLabel}</div>
            </div>
            <div className="kpi-total" style={{color:'#fbbf24'}}>{eur(totale)}</div>
          </div>

          <div className="month-nav">
            <button className="mn-btn" style={{'--c':'rgba(251,191,36,.25)'}} onClick={()=>{const[y,m]=monthKey==='all'?[new Date().getFullYear(),new Date().getMonth()+1]:monthKey.split('-').map(Number);setMonthKey(toMonthKey(new Date(y,m-2,1)))}}>‹</button>
            <input type="month" value={monthKey==='all'?toMonthKey():monthKey} onChange={e=>setMonthKey(clampMK(e.target.value))} className="mn-input"/>
            <button className="mn-btn" onClick={()=>{const[y,m]=monthKey==='all'?[new Date().getFullYear(),new Date().getMonth()+1]:monthKey.split('-').map(Number);setMonthKey(toMonthKey(new Date(y,m,1)))}}>›</button>
            <button className="mn-btn" onClick={()=>setMonthKey('all')} style={{padding:'0 .75rem',width:'auto',fontSize:'.7rem'}}>Tutti</button>
          </div>

          <div className="toolbar">
            <button className={`tbtn ${isRec?'tbtn-rec':''} ${aibusy&&!isRec?'tbtn-busy':''}`} style={{'--c':'rgba(251,191,36,.3)','--ct':'#fbbf24'}} onClick={toggleRec} disabled={aibusy&&!isRec}>
              {isRec?'⏹ Stop':aibusy?'◌ Elaboro…':'🎙 Voce'}
            </button>
            <label className={`tbtn ${aibusy?'tbtn-busy':''}`} style={{'--c':'rgba(251,191,36,.3)','--ct':'#fbbf24'}}>
              📷 OCR
              <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)handleOCR(f)}}/>
            </label>
            <button className="tbtn" style={{'--c':'rgba(251,191,36,.2)','--ct':'#fbbf24'}} onClick={()=>setShowForm(v=>!v)}>
              {showForm?'— Chiudi':'＋ Manuale'}
            </button>
          </div>

          {showForm && (
            <form className="entry-form" onSubmit={onSubmit}>
              <div className="form-row">
                <div className="form-field"><label>Ristorante / Bar</label><input value={form.store} onChange={e=>setForm(f=>({...f,store:e.target.value}))} placeholder="Es. Ristorante Il Cortile…" required/></div>
                <div className="form-field"><label>Data</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
              </div>
              <div className="form-field"><label>Dettaglio</label><input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Pizza + birra, aperitivo…"/></div>
              <div className="form-row">
                <div className="form-field"><label>Importo (€)</label><input type="number" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} required/></div>
                <button type="submit" className="tbtn" style={{'--c':'rgba(34,197,94,.3)','--ct':'#22c55e',alignSelf:'flex-end',padding:'.55rem 1.4rem'}}>✓ Salva</button>
              </div>
            </form>
          )}

          {err && <div className="err-box">{err}<button onClick={()=>setErr(null)}>✕</button></div>}
          {aibusy && <div className="ai-busy-bar"><span style={{background:'#fbbf24'}}/>Jarvis elabora…</div>}

          <div className="table-wrap">
            {loading?<div className="loading-rows"><span/><span/><span/></div>:(
              <table className="data-table">
                <thead><tr><th>Locale</th><th>Data</th><th>Dettaglio</th><th>€</th><th/></tr></thead>
                <tbody>
                  {rows.length===0?<tr><td colSpan={5} className="empty-row">Nessuna cena in {monthLabel}</td></tr>
                    :rows.map(r=>(
                      <tr key={r.id}>
                        <td>{r.store||'—'}</td>
                        <td className="td-date">{r.purchase_date||'—'}</td>
                        <td className="td-desc">{r.description||'—'}</td>
                        <td className="td-amount" style={{color:'#fbbf24'}}>{eur(r.amount)}</td>
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
        .page-canvas{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
        .page-wrap{position:relative;z-index:1;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:5rem 1rem 3rem;font-family:Inter,system-ui,sans-serif}
        .page-card{width:100%;max-width:900px;background:rgba(0,4,12,.88);border:1px solid rgba(251,191,36,.2);border-radius:20px;overflow:hidden}
        .card-header{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.06)}
        .card-title{font-family:'Orbitron',monospace;font-size:1.1rem;font-weight:900;-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:2px}
        .card-sub{font-size:.75rem;color:#475569;margin-top:.2rem;text-transform:capitalize}
        .kpi-total{font-family:'Orbitron',monospace;font-size:1.4rem;font-weight:900}
        .month-nav{display:flex;align-items:center;gap:.5rem;padding:.75rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.05)}
        .mn-btn{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);border-radius:8px;color:#fbbf24;width:32px;height:32px;cursor:pointer;font-size:1rem}
        .mn-input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#e2e8f0;padding:.3rem .6rem;font-size:.82rem;outline:none}
        .toolbar{display:flex;gap:.6rem;padding:.75rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.05);flex-wrap:wrap}
        .tbtn{position:relative;display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1.1rem;border-radius:12px;font-size:.82rem;font-weight:700;cursor:pointer;border:1px solid var(--c,rgba(255,255,255,.15));background:transparent;color:var(--ct,#e2e8f0);transition:all .2s;white-space:nowrap}
        .tbtn:hover{background:var(--c,rgba(255,255,255,.06))}
        .tbtn-rec{animation:pulsBtn 1s ease-in-out infinite}
        .tbtn-busy{opacity:.5;cursor:not-allowed}
        @keyframes pulsBtn{0%,100%{opacity:.6}50%{opacity:1}}
        .entry-form{padding:1rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;gap:.7rem}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:.7rem;align-items:end}
        @media(max-width:600px){.form-row{grid-template-columns:1fr}}
        .form-field{display:flex;flex-direction:column;gap:.3rem}
        .form-field label{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:#475569}
        .form-field input{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#e2e8f0;padding:.45rem .7rem;font-size:.85rem;outline:none}
        .err-box{margin:.5rem 1.5rem;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:.6rem 1rem;font-size:.8rem;color:#f87171;display:flex;justify-content:space-between}
        .err-box button{background:none;border:none;color:#f87171;cursor:pointer}
        .ai-busy-bar{display:flex;align-items:center;gap:.5rem;padding:.6rem 1.5rem;font-size:.78rem;color:#fbbf24;border-bottom:1px solid rgba(255,255,255,.04)}
        .ai-busy-bar span{width:6px;height:6px;border-radius:50%;animation:typing .9s infinite}
        .table-wrap{overflow-x:auto;padding:.5rem 0}
        .data-table{width:100%;border-collapse:collapse;font-size:.82rem}
        .data-table thead tr{background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08)}
        .data-table th{padding:.65rem 1.2rem;text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#475569;font-weight:600}
        .data-table td{padding:.65rem 1.2rem;border-bottom:1px solid rgba(255,255,255,.04);color:#e2e8f0}
        .data-table tbody tr:hover{background:rgba(255,255,255,.03)}
        .td-date{color:#64748b;font-size:.78rem;white-space:nowrap}
        .td-desc{color:#94a3b8;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .td-amount{font-weight:700;white-space:nowrap}
        .del-btn{background:none;border:1px solid rgba(239,68,68,.25);border-radius:6px;color:rgba(239,68,68,.6);cursor:pointer;padding:.2rem .5rem;font-size:.75rem}
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

export default withAuth(CeneAperitivi)
export async function getServerSideProps() { return { props:{} } }