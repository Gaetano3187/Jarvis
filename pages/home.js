// pages/home.js
import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'

/* ─── Audio helpers ─────────────────────────────────────────────── */
function getBestMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'])
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch {}
  return ''
}
function extForMime(m='') {
  if (m.includes('mp4')) return 'voice.mp4'
  if (m.includes('ogg')) return 'voice.ogg'
  return 'voice.webm'
}

/* ─── Esegui azione agente ──────────────────────────────────────── */
async function executeAction(action, userId, router) {
  if (!action || !userId) return null
  try {
    const today = new Date().toISOString().slice(0,10)
    switch (action.type) {
      case 'add_expense': {
        const { error } = await supabase.from('expenses').insert({
          user_id: userId, category: action.category||'varie',
          store: action.store||null,
          description: action.description||action.store||'Spesa vocale',
          amount: Number(action.amount||0), purchase_date: action.date||today,
          payment_method: action.payment_method||'cash', source: 'voice',
        })
        if (error) throw error
        if ((action.payment_method||'cash')==='cash' && action.amount>0)
          await supabase.from('pocket_cash').insert({ user_id:userId,
            note:action.description||'Spesa vocale', delta:-Number(action.amount),
            moved_at:new Date().toISOString() })
        return `✓ Spesa €${Number(action.amount).toFixed(2)} salvata`
      }
      case 'add_income': {
        const { error } = await supabase.from('incomes').insert({
          user_id:userId, source:action.source||'Entrata',
          description:action.description||'Entrata vocale',
          amount:Number(action.amount||0),
          received_at:`${action.date||today}T12:00:00Z` })
        if (error) throw error
        return `✓ Entrata €${Number(action.amount).toFixed(2)} salvata`
      }
      case 'add_to_list': {
        const { error } = await supabase.from('shopping_list').insert({
          user_id:userId, name:action.name, qty:Number(action.qty||1),
          unit_label:action.unit||'pz', list_type:action.list_type||'supermercato',
          category:action.category||'alimentari' })
        if (error) throw error
        return `✓ "${action.name}" aggiunto alla lista`
      }
      case 'add_wine': {
        const { error } = await supabase.from('wines').insert({
          user_id:userId, name:action.name, winery:action.winery||null,
          region:action.region||null, vintage:action.vintage||null,
          style:action.style||'rosso', source:'voice' })
        if (error) throw error
        return `✓ Vino "${action.name}" aggiunto`
      }
      case 'navigate':
        if (action.path) router.push(action.path)
        return null
      default: return null
    }
  } catch(e) { return '⚠️ ' + (e.message||e) }
}

/* ─── Assistente Jarvis ─────────────────────────────────────────── */
function JarvisAssistant({ userId, onStateChange }) {
  const router = useRouter()
  const mediaRef   = useRef(null)
  const chunksRef  = useRef([])
  const streamRef  = useRef(null)

  const [isRec,    setIsRec]    = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [messages, setMessages] = useState([
    { role:'assistant', text:'Ciao! Sono Jarvis. Chiedimi delle scorte, saldi, lista spesa — o di registrare una spesa.' }
  ])
  const [textInput, setTextInput] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])
  useEffect(() => { onStateChange?.({ isRec, busy }) }, [isRec, busy, onStateChange])
  useEffect(() => () => {
    try { if (mediaRef.current?.state==='recording') mediaRef.current.stop() } catch {}
    try { streamRef.current?.getTracks?.().forEach(t=>t.stop()) } catch {}
  }, [])

  const history = messages.slice(-6).map(m=>({ role:m.role==='assistant'?'assistant':'user', content:m.text }))

  const send = useCallback(async (text) => {
    if (!text.trim()||!userId) return
    setBusy(true)
    setMessages(p=>[...p,{ role:'user', text }])
    try {
      const r = await fetch('/api/assistant-v2',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ prompt:text, userId, conversationHistory:history })
      })
      const data = await r.json()
      let reply = data.text||'Non ho capito, puoi ripetere?'
      if (data.action) {
        const res = await executeAction(data.action, userId, router)
        if (res) reply += '\n' + res
      }
      if (data.navigate) { setTimeout(()=>router.push(data.navigate),800); reply+=' \n→ Navigo…' }
      setMessages(p=>[...p,{ role:'assistant', text:reply }])
    } catch { setMessages(p=>[...p,{ role:'assistant', text:'⚠️ Errore di connessione.' }]) }
    finally { setBusy(false) }
  }, [userId, history, router])

  const toggleRec = useCallback(async () => {
    if (isRec) {
      try { if (mediaRef.current?.state==='recording') { mediaRef.current.requestData?.(); mediaRef.current.stop() } } catch {}
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      streamRef.current = stream; chunksRef.current = []
      const mime = getBestMimeType()
      mediaRef.current = new MediaRecorder(stream, mime?{mimeType:mime}:undefined)
      mediaRef.current.ondataavailable = e => { if (e.data?.size>0) chunksRef.current.push(e.data) }
      mediaRef.current.onstop = async () => {
        try {
          const t0=Date.now()
          while (!chunksRef.current.length && Date.now()-t0<1500) await new Promise(r=>setTimeout(r,60))
          if (!chunksRef.current.length) throw new Error('Nessun audio')
          const am = mediaRef.current?.mimeType||mime||'audio/webm'
          const blob = new Blob(chunksRef.current,{type:am})
          if (blob.size<500) throw new Error('Audio troppo corto')
          setBusy(true)
          const fd = new FormData(); fd.append('audio',blob,extForMime(am))
          const r = await fetch('/api/stt',{method:'POST',body:fd})
          const j = await r.json().catch(()=>({}))
          if (!r.ok||!j?.text) throw new Error('Trascrizione fallita')
          await send(String(j.text||'').trim())
        } catch(e) { setMessages(p=>[...p,{ role:'assistant', text:'⚠️ '+(e.message||'Errore') }]) }
        finally {
          setBusy(false)
          try { streamRef.current?.getTracks?.().forEach(t=>t.stop()) } catch {}
          streamRef.current=null
        }
      }
      mediaRef.current.start(250); setIsRec(true)
    } catch(err) {
      setMessages(p=>[...p,{ role:'assistant', text:'⚠️ '+(err?.name==='NotAllowedError'?'Microfono non autorizzato':'Microfono non disponibile') }])
    }
  }, [isRec, send])

  const onSubmit = e => { e.preventDefault(); if (!textInput.trim()||busy) return; const t=textInput.trim(); setTextInput(''); send(t) }

  return { isRec, busy, toggleRec, messages, textInput, setTextInput, onSubmit, messagesEndRef }
}

/* ═══════════════════════════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════════════════════════ */
const Home = () => {
  const router = useRouter()
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  const [userId,       setUserId]       = useState(null)
  const [pocketBal,    setPocketBal]    = useState(null)
  const [alertItems,   setAlertItems]   = useState([])   // scorte in esaurimento + da comprare
  const [listaSpesa,   setListaSpesa]   = useState([])
  const [showLista,    setShowLista]    = useState(false)
  const [loadingOCR,   setLoadOCR]      = useState(false)
  const [ocrResult,    setOcrResult]    = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [err,          setErr]          = useState(null)
  const [jarvisOpen,   setJarvisOpen]   = useState(false)
  const [jarvisState,  setJarvisState]  = useState({ isRec:false, busy:false })

  const jarvis = JarvisAssistant({ userId, onStateChange: setJarvisState })

  /* ── Auth + dati ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data:{ user } }) => {
      if (!user) return
      setUserId(user.id)
      loadData(user.id)
    })
  }, [])

  async function loadData(uid) {
    const today = new Date(); const in10 = new Date(); in10.setDate(today.getDate()+10)

    const [{ data:inv }, { data:lista }, { data:pocket }] = await Promise.all([
      supabase.from('inventory').select('id,product_name,qty,initial_qty,consumed_pct,expiry_date').eq('user_id',uid),
      supabase.from('shopping_list').select('id,name,qty,unit_label,list_type,store,price').eq('user_id',uid).eq('purchased',false).order('added_at',{ascending:true}),
      supabase.from('pocket_cash').select('delta').eq('user_id',uid),
    ])

    // Saldo tasca
    const bal = (pocket||[]).reduce((t,r)=>t+Number(r.delta||0),0)
    setPocketBal(bal)

    // Alert: scorte in esaurimento/scadenza + prodotti da comprare (lista spesa)
    const scorteAlert = (inv||[]).filter(item => {
      const pct = item.consumed_pct ?? (item.initial_qty>0 ? ((item.initial_qty-item.qty)/item.initial_qty)*100 : 0)
      const exp = item.expiry_date ? new Date(item.expiry_date) : null
      return pct>=80 || (exp && exp<=in10)
    }).map(item => {
      const pct = item.consumed_pct ?? 0
      const exp = item.expiry_date ? new Date(item.expiry_date) : null
      const gg  = exp ? Math.ceil((exp-new Date())/(1000*60*60*24)) : null
      return {
        id:'inv-'+item.id, name:item.product_name??'Prodotto',
        tag: gg!==null&&gg<=10 ? `scade in ${gg}g` : `consumato ${Math.round(pct)}%`,
        type:'scorta'
      }
    })
    const daComprare = (lista||[]).map(p=>({ id:'shop-'+p.id, name:p.name, tag:'da comprare', type:'lista' }))
    setAlertItems([...scorteAlert, ...daComprare])
    setListaSpesa(lista||[])
  }

  /* ── Canvas particelle ── */
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W, H, pts = [], raf

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
    }
    const mkPt = () => ({ x:Math.random()*W, y:Math.random()*H, vx:(Math.random()-.5)*.25, vy:(Math.random()-.5)*.25, a:Math.random()*.4+.05 })
    const init = () => { resize(); pts = Array.from({length:70}, mkPt) }

    const draw = () => {
      ctx.clearRect(0,0,W,H)
      for (const p of pts) {
        ctx.beginPath(); ctx.arc(p.x,p.y,.8+p.a,0,Math.PI*2)
        ctx.fillStyle=`rgba(34,211,238,${p.a})`; ctx.fill()
        p.x+=p.vx; p.y+=p.vy
        if (p.x<0||p.x>W) p.vx*=-1
        if (p.y<0||p.y>H) p.vy*=-1
      }
      for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy)
        if (d<90) { ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y)
          ctx.strokeStyle=`rgba(34,211,238,${(1-d/90)*.07})`; ctx.lineWidth=.5; ctx.stroke() }
      }
      raf = requestAnimationFrame(draw)
    }

    init(); draw()
    window.addEventListener('resize', init)
    animRef.current = raf
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize',init) }
  }, [])

  /* ── OCR ── */
  function resizeImage(file, maxPx=1500, q=.88) {
    return new Promise((res,rej) => {
      const img=new Image(), url=URL.createObjectURL(file)
      img.onload=()=>{
        URL.revokeObjectURL(url)
        const s=Math.min(1,maxPx/Math.max(img.width,img.height))
        const c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s)
        c.getContext('2d').drawImage(img,0,0,c.width,c.height)
        c.toBlob(b=>b?res(b):rej(new Error('toBlob')), 'image/jpeg', q)
      }
      img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('img'))}
      img.src=url
    })
  }

  async function handleOCR(file) {
    if (!file) return
    setLoadOCR(true); setErr(null); setOcrResult(null)
    try {
      const pl = (file.type==='application/pdf'||file.name?.endsWith('.pdf')) ? file : await resizeImage(file)
      const fd = new FormData(); fd.append('image',pl,file.name||'scontrino.jpg')
      const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),55000)
      let r; try { r=await fetch('/api/ocr-smart',{method:'POST',body:fd,signal:ctrl.signal}) } finally { clearTimeout(t) }
      if (!r.ok) { const e=await r.json().catch(()=>({})); throw new Error(e.error||`HTTP ${r.status}`) }
      const data=await r.json(); if (!data.ok) throw new Error(data.error||'OCR fallito')
      if (data.confidence==='low') setErr('⚠️ Immagine poco nitida — controlla i dati')
      setOcrResult(data)
    } catch(e) { setErr(e.name==='AbortError'?'⏱ Timeout':'OCR: '+e.message) }
    finally { setLoadOCR(false) }
  }

  async function salvaRisultato() {
    if (!ocrResult||saving) return; setSaving(true); setErr(null)
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')
      const pd=ocrResult.purchase_date??new Date().toISOString().slice(0,10)
      const st=ocrResult.store??'Generico', im=parseFloat(ocrResult.price_total??0)
      const cat=ocrResult.categoria??'varie', pm=ocrResult.payment_method??'unknown'
      const items=Array.isArray(ocrResult.items)?ocrResult.items:[]
      const { data:expRow,error:expErr } = await supabase.from('expenses').insert([{
        user_id:user.id,category:cat,store:st,store_address:ocrResult.store_address??null,
        description:`Spesa ${st} — ${pd}`,purchase_date:pd,amount:im,payment_method:pm,source:'ocr'
      }]).select('id').single()
      if (expErr) throw new Error(expErr.message)
      let recId=null
      try {
        const { data:rr } = await supabase.from('receipts').insert([{
          user_id:user.id,expense_id:expRow?.id,store:st,store_address:ocrResult.store_address??null,
          purchase_date:pd,price_total:im,payment_method:pm,raw_text:ocrResult.raw_text??null,
          confidence:ocrResult.confidence??'medium'
        }]).select('id').single(); recId=rr?.id??null
      } catch {}
      if (recId&&items.length) try { await supabase.from('receipt_items').insert(items.map(it=>({
        receipt_id:recId,user_id:user.id,name:it.name,brand:it.brand??null,qty:it.qty??1,
        unit:it.unit??'pz',unit_price:it.unit_price??it.price??0,price:it.price??0,
        category_item:it.category_item??'alimentari',expiry_date:it.expiry_date??null,purchase_date:pd
      }))) } catch {}
      if (cat==='casa'&&items.length) for (const item of items) {
        if (!item.name) continue
        try {
          const tot=Number(item.qty||1)
          const { data:ex } = await supabase.from('inventory').select('id,qty,initial_qty').eq('user_id',user.id).ilike('product_name',`%${item.name.split(' ')[0]}%`).maybeSingle()
          if (ex) await supabase.from('inventory').update({ qty:Number(ex.qty||0)+tot, initial_qty:Number(ex.initial_qty||0)+tot, consumed_pct:0, avg_price:item.unit_price||item.price||0, last_updated:new Date().toISOString(), ...(item.expiry_date?{expiry_date:item.expiry_date}:{}) }).eq('id',ex.id)
          else await supabase.from('inventory').insert({ user_id:user.id,product_name:item.name,brand:item.brand??null,category:item.category_item??'alimentari',qty:tot,initial_qty:tot,avg_price:item.unit_price||item.price||0,purchase_date:pd,expiry_date:item.expiry_date??null,consumed_pct:0 })
        } catch {}
      }
      if (pm==='cash'&&im>0) try { await supabase.from('pocket_cash').insert({ user_id:user.id,note:`Spesa ${st} (${pd})`,delta:-im,moved_at:new Date().toISOString() }) } catch {}
      setOcrResult(null); if (userId) loadData(userId)
      alert(`✅ Salvato!\n🏪 ${st} — ${pd}\n💶 €${im.toFixed(2)}${items.length?`\n🛒 ${items.length} prodotti`:''}`)
    } catch(e) { setErr('❌ '+(e.message||'Errore')) } finally { setSaving(false) }
  }

  const nAlert  = alertItems.length
  const nLista  = listaSpesa.filter(p=>p.list_type==='supermercato').length
  const nOnline = listaSpesa.filter(p=>p.list_type==='online').length

  const tiles = [
    { href:'/finanze',          label:'Finanze',     icon:'💶', color:'#22c55e', glow:'rgba(34,197,94,.25)' },
    { href:'/liste-prodotti',   label:'Liste',       icon:'🛒', color:'#22d3ee', glow:'rgba(34,211,238,.25)', badge: nLista+nOnline||null },
    { href:'/prodotti-tipici-vini', label:'Vini',    icon:'🍷', color:'#a78bfa', glow:'rgba(167,139,250,.25)' },
    { href:'/dashboard',        label:'Dashboard',   icon:'📊', color:'#6366f1', glow:'rgba(99,102,241,.25)' },
  ]

  return (
    <>
      <Head><title>Home – Jarvis</title></Head>

      {/* Video sfondo */}
      <video className="home-video" src="/composizione%201.mp4" autoPlay muted loop preload="auto"
        poster="https://play.teleporthq.io/static/svg/videoposter.svg"/>

      {/* Canvas particelle */}
      <canvas ref={canvasRef} className="home-canvas"/>

      {/* Loading OCR overlay */}
      {loadingOCR && (
        <div className="ocr-overlay">
          <div className="ocr-overlay-icon">📷</div>
          <div className="ocr-overlay-title">Analisi scontrino…</div>
          <div className="ocr-overlay-sub">GPT-4o sta leggendo i prodotti</div>
          <div className="ocr-progress-track"><div className="ocr-progress-fill"/></div>
        </div>
      )}

      <div className="home-wrap">

        {/* ══ HERO LOGO ══ */}
        <div className="hero-section">
          <div className="logo-wrap">
            {/* Anelli pulsanti attorno al logo */}
            <div className="logo-ring ring-a"/>
            <div className="logo-ring ring-b"/>
            <div className="logo-text">
              <span className="logo-j">J</span><span className="logo-arvis">ARVIS</span>
            </div>
            <div className="logo-tagline">Smart Home Assistant</div>
          </div>

          {/* KPI strip — solo tasca + alert */}
          <div className="kpi-row">
            <div className="kpi-pill kpi-cyan">
              <span className="kpi-icon">💰</span>
              <div>
                <div className="kpi-label">In tasca</div>
                <div className="kpi-val">{pocketBal !== null ? `€ ${pocketBal.toFixed(2)}` : '—'}</div>
              </div>
            </div>
            <button className="kpi-pill kpi-alert" onClick={() => setShowLista(v=>!v)}>
              <span className="kpi-icon">{nAlert > 0 ? '🔴' : '✅'}</span>
              <div>
                <div className="kpi-label">Scorte & Acquisti</div>
                <div className="kpi-val">{nAlert > 0 ? `${nAlert} in alert` : 'Tutto ok'}</div>
              </div>
              <span className="kpi-chevron">{showLista ? '▲' : '▼'}</span>
            </button>
          </div>

          {/* Lista spesa + scorte inline */}
          {showLista && (
            <div className="lista-dropdown">
              {alertItems.length === 0
                ? <div className="lista-empty">Nessun alert — ottimo!</div>
                : alertItems.map(item => (
                  <div key={item.id} className={`lista-row ${item.type==='lista'?'lista-row--buy':'lista-row--alert'}`}>
                    <span className="lista-name">{item.name}</span>
                    <span className="lista-tag">{item.tag}</span>
                  </div>
                ))
              }
              <Link href="/liste-prodotti" className="lista-cta">Vai alla lista completa →</Link>
            </div>
          )}
        </div>

        {/* ══ ZONA COMANDO ══ */}
        <div className="command-zone">

          {/* Pulsante AI — apre/chiude la chat */}
          <button
            className={`cmd-btn cmd-ai ${jarvisState.isRec?'cmd-rec':''} ${jarvisState.busy?'cmd-busy':''}`}
            onClick={() => setJarvisOpen(v=>!v)}
          >
            <div className="cmd-orb">
              <div className="cmd-ring cmd-ring-1"/>
              <div className="cmd-ring cmd-ring-2"/>
              <span className="cmd-ai-core">AI</span>
            </div>
            <div className="cmd-label-wrap">
              <span className="cmd-label">Jarvis</span>
              <span className="cmd-sublabel">
                {jarvisState.isRec ? '● In ascolto' : jarvisState.busy ? '◌ Elaboro…' : 'Assistente vocale'}
              </span>
            </div>
          </button>

          {/* Pulsante OCR */}
          <label className={`cmd-btn cmd-ocr ${loadingOCR?'cmd-loading':''}`}>
            <div className="cmd-ocr-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="#f59e0b" strokeWidth="1.8"/>
                <rect x="15" y="2" width="7" height="7" rx="1.5" stroke="#f59e0b" strokeWidth="1.8"/>
                <rect x="2" y="15" width="7" height="7" rx="1.5" stroke="#f59e0b" strokeWidth="1.8"/>
                <path d="M15 15.5h2M17 15.5v2M19 15.5h2M17 19.5v2M19 17.5h2v4h-4v-2" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M12 6v3M12 9h3M6 12h3M12 12v3M12 15h3" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="cmd-label-wrap">
              <span className="cmd-label" style={{color:'#fbbf24'}}>Scontrino</span>
              <span className="cmd-sublabel">{loadingOCR?'Analisi…':'Scansiona OCR'}</span>
            </div>
            {!loadingOCR && (
              <input type="file" style={{display:'none'}}
                onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)handleOCR(f)}}/>
            )}
          </label>
        </div>

        {/* ══ CHAT JARVIS (espandibile) ══ */}
        {jarvisOpen && (
          <div className="jarvis-chat-panel">
            <div className="jarvis-chat-messages">
              {jarvis.messages.map((m,i) => (
                <div key={i} className={`chat-msg ${m.role==='user'?'chat-msg--user':'chat-msg--ai'}`}>
                  {m.role==='assistant' && <span className="chat-avatar">J</span>}
                  <div className="chat-bubble">
                    {m.text.split('\n').map((l,li) => <p key={li} style={{margin:li>0?'3px 0 0':0}}>{l}</p>)}
                  </div>
                </div>
              ))}
              {jarvis.busy && (
                <div className="chat-msg chat-msg--ai">
                  <span className="chat-avatar">J</span>
                  <div className="chat-bubble chat-typing"><span/><span/><span/></div>
                </div>
              )}
              <div ref={jarvis.messagesEndRef}/>
            </div>

            {/* Suggerimenti */}
            <div className="chat-suggestions">
              {['Quante scorte ho?','Qual è il mio saldo?','Cosa devo comprare?','Dove conviene il latte?','Ho speso 30€ al supermercato','Ho incassato 100€'].map(s=>(
                <button key={s} className="sug-pill" onClick={()=>!jarvis.busy&&jarvis.send(s)} disabled={jarvis.busy}>{s}</button>
              ))}
            </div>

            {/* Input testo + mic */}
            <form className="chat-input-row" onSubmit={jarvis.onSubmit}>
              <button type="button"
                className={`chat-mic ${jarvis.isRec?'chat-mic--rec':''}`}
                onClick={jarvis.toggleRec}
                disabled={jarvis.busy&&!jarvis.isRec}>
                {jarvis.isRec ? '⏹' : '🎙'}
              </button>
              <input className="chat-input" value={jarvis.textInput}
                onChange={e=>jarvis.setTextInput(e.target.value)}
                placeholder="Scrivi o usa il microfono…"
                disabled={jarvis.busy||jarvis.isRec}/>
              <button type="submit" className="chat-send"
                disabled={!jarvis.textInput.trim()||jarvis.busy||jarvis.isRec}>↑</button>
            </form>
          </div>
        )}

        {/* ══ TILE NAVIGAZIONE ══ */}
        <div className="tiles-grid">
          {tiles.map(t => (
            <Link key={t.href} href={t.href} className="tile" style={{'--tc':t.color,'--tg':t.glow}}>
              <span className="tile-icon">{t.icon}</span>
              <span className="tile-label">{t.label}</span>
              {t.badge > 0 && <span className="tile-badge">{t.badge}</span>}
            </Link>
          ))}
        </div>

        {/* OCR preview */}
        {ocrResult && (
          <div className="ocr-preview">
            <div className="ocr-preview-header">
              <span>📋 Spesa rilevata</span>
              <span className={`conf-badge ${ocrResult.confidence==='high'?'conf-high':ocrResult.confidence==='medium'?'conf-med':'conf-low'}`}>
                {ocrResult.confidence==='high'?'✓ Alta':ocrResult.confidence==='medium'?'~ Media':'⚠ Bassa'}
              </span>
            </div>
            <div className="ocr-rows">
              <div className="ocr-row"><span>Negozio</span><strong>{ocrResult.store??'—'}</strong></div>
              <div className="ocr-row"><span>Data</span><strong>{ocrResult.purchase_date??'—'}</strong></div>
              <div className="ocr-row"><span>Totale</span><strong style={{color:'#22c55e'}}>€ {parseFloat(ocrResult.price_total??0).toFixed(2)}</strong></div>
              {Array.isArray(ocrResult.items)&&ocrResult.items.length>0&&(
                <div className="ocr-row"><span>Prodotti</span><strong>{ocrResult.items.length} articoli</strong></div>
              )}
            </div>
            <div className="ocr-actions">
              <button className="ocr-save" onClick={salvaRisultato} disabled={saving}>
                {saving?'⏳ Salvataggio…':'✅ Conferma e salva'}
              </button>
              <button className="ocr-cancel" onClick={()=>!saving&&setOcrResult(null)} disabled={saving}>✕</button>
            </div>
          </div>
        )}

        {err && <div className="err-box">{err}</div>}

      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}

        .home-video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
        .home-canvas{position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none}

        .home-wrap{position:relative;z-index:2;min-height:100vh;padding:2rem 1rem 3rem;
          display:flex;flex-direction:column;align-items:center;gap:1.25rem;
          font-family:Inter,system-ui,sans-serif;max-width:700px;margin:0 auto}

        /* ── HERO ── */
        .hero-section{width:100%;display:flex;flex-direction:column;align-items:center;gap:1rem}
        .logo-wrap{position:relative;display:flex;flex-direction:column;align-items:center;padding:1.5rem 0 .5rem}
        .logo-ring{position:absolute;border-radius:50%;pointer-events:none}
        .ring-a{width:220px;height:55px;border:1px solid rgba(34,211,238,.18);top:50%;left:50%;transform:translate(-50%,-50%);animation:ringA 4s ease-in-out infinite}
        .ring-b{width:280px;height:40px;border:1px solid rgba(34,211,238,.1);top:50%;left:50%;transform:translate(-50%,-50%);animation:ringB 6s ease-in-out infinite}
        @keyframes ringA{0%,100%{opacity:.4;transform:translate(-50%,-50%) scaleX(1)}50%{opacity:1;transform:translate(-50%,-50%) scaleX(1.04)}}
        @keyframes ringB{0%,100%{opacity:.2;transform:translate(-50%,-50%) scaleX(1)}50%{opacity:.6;transform:translate(-50%,-50%) scaleX(1.06)}}

        .logo-text{position:relative;display:flex;align-items:baseline;gap:0;line-height:1}
        .logo-j{font-family:'Orbitron',monospace;font-size:4.5rem;font-weight:900;
          color:#fff;text-shadow:0 0 30px rgba(34,211,238,.9),0 0 60px rgba(34,211,238,.5),0 0 100px rgba(34,211,238,.3);
          animation:glowJ 2.5s ease-in-out infinite;letter-spacing:0}
        .logo-arvis{font-family:'Orbitron',monospace;font-size:4.5rem;font-weight:900;
          background:linear-gradient(90deg,#5eead4,#22d3ee,#38bdf8,#22d3ee,#5eead4);
          background-size:200% auto;
          -webkit-background-clip:text;background-clip:text;color:transparent;
          animation:shimmerLogo 3s linear infinite;letter-spacing:2px}
        @keyframes glowJ{0%,100%{text-shadow:0 0 20px rgba(34,211,238,.7),0 0 40px rgba(34,211,238,.4)}50%{text-shadow:0 0 40px rgba(34,211,238,1),0 0 80px rgba(34,211,238,.7),0 0 120px rgba(56,189,248,.4)}}
        @keyframes shimmerLogo{0%{background-position:0% center}100%{background-position:200% center}}

        .logo-tagline{font-size:.65rem;letter-spacing:.45em;color:rgba(34,211,238,.5);text-transform:uppercase;margin-top:.2rem}

        /* ── KPI ── */
        .kpi-row{display:flex;gap:.75rem;width:100%;flex-wrap:wrap}
        .kpi-pill{flex:1 1 180px;display:flex;align-items:center;gap:.65rem;
          background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.08);
          border-radius:14px;padding:.75rem 1rem;cursor:default;text-align:left}
        button.kpi-pill{cursor:pointer;transition:border-color .15s}
        button.kpi-pill:hover{border-color:rgba(255,255,255,.16)}
        .kpi-cyan{border-color:rgba(34,211,238,.2)!important}
        .kpi-alert{border-color:rgba(239,68,68,.2)!important}
        .kpi-icon{font-size:1.3rem;flex-shrink:0}
        .kpi-label{font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin-bottom:.15rem}
        .kpi-val{font-size:1rem;font-weight:700;color:#e2e8f0}
        .kpi-chevron{margin-left:auto;font-size:.7rem;color:#475569}

        /* ── Lista dropdown ── */
        .lista-dropdown{width:100%;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.08);
          border-radius:14px;overflow:hidden;animation:slideDown .2s ease}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .lista-row{display:flex;align-items:center;justify-content:space-between;
          padding:.55rem 1rem;border-bottom:1px solid rgba(255,255,255,.05);font-size:.82rem}
        .lista-row:last-of-type{border-bottom:none}
        .lista-row--buy{border-left:2px solid rgba(6,182,212,.4)}
        .lista-row--alert{border-left:2px solid rgba(239,68,68,.4)}
        .lista-name{color:#e2e8f0}
        .lista-tag{font-size:.7rem;color:#475569;background:rgba(255,255,255,.05);
          border-radius:5px;padding:.1rem .45rem}
        .lista-empty{padding:1rem;text-align:center;font-size:.82rem;color:#334155}
        .lista-cta{display:block;padding:.6rem 1rem;text-align:center;font-size:.78rem;
          color:#22d3ee;border-top:1px solid rgba(255,255,255,.06);text-decoration:none}
        .lista-cta:hover{background:rgba(34,211,238,.05)}

        /* ══ ZONA COMANDO ══ */
        .command-zone{display:flex;gap:.75rem;width:100%}

        .cmd-btn{flex:1;display:flex;align-items:center;gap:.85rem;
          background:rgba(0,0,0,.6);border-radius:18px;padding:1rem 1.25rem;
          cursor:pointer;border:1px solid rgba(255,255,255,.08);
          transition:border-color .2s,background .2s;text-align:left}
        .cmd-btn:hover{background:rgba(255,255,255,.05)}

        /* AI button */
        .cmd-ai{border-color:rgba(34,211,238,.25)}
        .cmd-ai:hover{border-color:rgba(34,211,238,.5);background:rgba(34,211,238,.05)}
        .cmd-rec{border-color:rgba(239,68,68,.5)!important;background:rgba(239,68,68,.08)!important}
        .cmd-busy{border-color:rgba(251,191,36,.4)!important}

        .cmd-orb{position:relative;width:44px;height:44px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
        .cmd-ring{position:absolute;border-radius:50%;border:1px solid rgba(34,211,238,.3)}
        .cmd-ring-1{width:44px;height:44px;animation:ringCmd 2.5s ease-in-out infinite}
        .cmd-ring-2{width:32px;height:32px;animation:ringCmd 2.5s ease-in-out infinite .4s;border-color:rgba(34,211,238,.5)}
        @keyframes ringCmd{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}
        .cmd-ai-core{position:relative;font-family:'Orbitron',monospace;font-size:.55rem;font-weight:900;
          color:#22d3ee;background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.4);
          border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center}

        /* OCR button */
        .cmd-ocr{border-color:rgba(251,191,36,.25)}
        .cmd-ocr:hover{border-color:rgba(251,191,36,.5);background:rgba(251,191,36,.05)}
        .cmd-loading{opacity:.6;pointer-events:none}
        .cmd-ocr-icon{width:44px;height:44px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
          background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);border-radius:50%}

        .cmd-label-wrap{display:flex;flex-direction:column;gap:.1rem}
        .cmd-label{font-size:.88rem;font-weight:700;color:#e2e8f0}
        .cmd-sublabel{font-size:.7rem;color:#475569}

        /* ══ CHAT PANEL ══ */
        .jarvis-chat-panel{width:100%;background:rgba(0,0,0,.72);border:1px solid rgba(34,211,238,.2);
          border-radius:18px;overflow:hidden;animation:slideDown .2s ease}
        .jarvis-chat-messages{max-height:280px;overflow-y:auto;padding:.75rem;display:flex;flex-direction:column;gap:.5rem}
        .chat-msg{display:flex;align-items:flex-start;gap:.4rem}
        .chat-msg--ai{flex-direction:row}
        .chat-msg--user{flex-direction:row-reverse}
        .chat-avatar{width:20px;height:20px;border-radius:50%;background:rgba(34,211,238,.15);
          border:1px solid rgba(34,211,238,.3);display:flex;align-items:center;justify-content:center;
          font-size:.55rem;font-weight:900;color:#22d3ee;flex-shrink:0;margin-top:2px}
        .chat-bubble{max-width:88%;padding:.45rem .7rem;border-radius:10px;font-size:.82rem;line-height:1.5;color:#e2e8f0}
        .chat-msg--ai .chat-bubble{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.07)}
        .chat-msg--user .chat-bubble{background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.3);color:#c7d2fe}
        .chat-typing{display:flex;gap:4px;align-items:center}
        .chat-typing span{width:5px;height:5px;border-radius:50%;background:#22d3ee;animation:typing .9s infinite}
        .chat-typing span:nth-child(2){animation-delay:.2s}
        .chat-typing span:nth-child(3){animation-delay:.4s}
        @keyframes typing{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
        .chat-suggestions{display:flex;flex-wrap:wrap;gap:.3rem;padding:.4rem .75rem;border-top:1px solid rgba(255,255,255,.05)}
        .sug-pill{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
          border-radius:20px;color:#475569;font-size:.68rem;padding:.2rem .55rem;cursor:pointer;white-space:nowrap}
        .sug-pill:hover:not(:disabled){color:#22d3ee;border-color:rgba(34,211,238,.3)}
        .sug-pill:disabled{opacity:.4;cursor:not-allowed}
        .chat-input-row{display:flex;gap:.4rem;padding:.5rem .75rem;border-top:1px solid rgba(255,255,255,.05)}
        .chat-mic{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);border-radius:8px;
          color:#22d3ee;width:34px;height:34px;cursor:pointer;font-size:.95rem;flex-shrink:0}
        .chat-mic--rec{background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.4);color:#f87171;animation:pulsRec 1s ease-in-out infinite}
        @keyframes pulsRec{0%,100%{opacity:1}50%{opacity:.5}}
        .chat-input{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
          border-radius:8px;color:#e2e8f0;padding:.4rem .65rem;font-size:.82rem;outline:none}
        .chat-input:focus{border-color:rgba(34,211,238,.4)}
        .chat-send{background:rgba(34,211,238,.15);border:1px solid rgba(34,211,238,.3);
          border-radius:8px;color:#22d3ee;width:32px;cursor:pointer;font-size:.95rem}
        .chat-send:disabled{opacity:.3;cursor:not-allowed}

        /* ══ TILES ══ */
        .tiles-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.65rem;width:100%}
        .tile{display:flex;flex-direction:column;align-items:center;gap:.4rem;
          background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.07);
          border-radius:16px;padding:1rem .75rem;text-decoration:none;position:relative;
          transition:transform .2s,border-color .2s,box-shadow .2s}
        .tile:hover{transform:translateY(-3px);border-color:var(--tc,#fff);
          box-shadow:0 0 20px var(--tg,rgba(255,255,255,.1))}
        .tile-icon{font-size:1.5rem;line-height:1}
        .tile-label{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:600}
        .tile-badge{position:absolute;top:.4rem;right:.4rem;background:#ef4444;color:#fff;
          font-size:.6rem;font-weight:700;min-width:16px;height:16px;border-radius:8px;
          display:flex;align-items:center;justify-content:center;padding:0 3px}

        /* ══ OCR PREVIEW ══ */
        .ocr-preview{width:100%;background:rgba(0,0,0,.7);border:1px solid rgba(34,197,94,.3);
          border-radius:16px;padding:1rem 1.1rem}
        .ocr-preview-header{display:flex;justify-content:space-between;align-items:center;
          margin-bottom:.75rem;font-size:.88rem;font-weight:600;color:#e2e8f0}
        .conf-badge{font-size:.7rem;padding:.18rem .55rem;border-radius:20px;font-weight:700}
        .conf-high{background:rgba(34,197,94,.15);color:#22c55e}
        .conf-med{background:rgba(251,191,36,.15);color:#fbbf24}
        .conf-low{background:rgba(239,68,68,.15);color:#f87171}
        .ocr-rows{display:flex;flex-direction:column;gap:.35rem;margin-bottom:.75rem}
        .ocr-row{display:flex;justify-content:space-between;font-size:.82rem}
        .ocr-row span{color:#475569}.ocr-row strong{color:#e2e8f0}
        .ocr-actions{display:flex;gap:.65rem}
        .ocr-save{flex:1;background:#22c55e;border:none;border-radius:10px;color:#fff;
          font-size:.82rem;font-weight:700;padding:.55rem;cursor:pointer}
        .ocr-save:disabled{opacity:.5;cursor:not-allowed}
        .ocr-cancel{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);
          border-radius:10px;color:#64748b;font-size:.82rem;padding:.55rem .85rem;cursor:pointer}

        /* ── OCR overlay ── */
        .ocr-overlay{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.8);
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.85rem;color:#fff}
        .ocr-overlay-icon{font-size:3rem}
        .ocr-overlay-title{font-size:1.1rem;font-weight:700}
        .ocr-overlay-sub{font-size:.85rem;opacity:.6}
        .ocr-progress-track{width:180px;height:3px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden}
        .ocr-progress-fill{height:100%;background:#f59e0b;border-radius:2px;animation:ocrProg 35s linear forwards}
        @keyframes ocrProg{from{width:0}to{width:100%}}

        .err-box{width:100%;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);
          border-radius:12px;padding:.75rem 1rem;color:#f87171;font-size:.82rem}

        /* ── Responsive ── */
        @media(max-width:520px){
          .tiles-grid{grid-template-columns:repeat(2,1fr)}
          .logo-j,.logo-arvis{font-size:3.2rem}
          .command-zone{flex-direction:column}
          .kpi-row{flex-direction:column}
        }
      `}</style>
    </>
  )
}

export default withAuth(Home)

export async function getServerSideProps() { return { props:{} } }