// pages/cene-aperitivi.js — VERSIONE CORRETTA
// Fix 1: tab "Piatti & Ordini" mostra anche i piatti da receipt_items (OCR)
// Fix 2: loadDetail carica correttamente nome/prezzo per scontrini ristorante

import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react'
import Head from 'next/head'
import withAuth from '../hoc/withAuth'
import {supabase} from '../lib/supabaseClient'

function iso(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function toMK(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function clamp(s){return /^\d{4}-\d{2}$/.test(String(s||''))?s:toMK()}
function mbounds(mk){if(mk==='all')return{s:'2000-01-01',e:'2099-12-31'};const[y,m]=mk.split('-').map(Number);return{s:iso(new Date(y,m-1,1)),e:iso(new Date(y,m,0))}}
function eur(n){return(Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'})}
function getBM(){if(typeof MediaRecorder==='undefined')return'';for(const t of['audio/webm;codecs=opus','audio/webm','audio/mp4'])try{if(MediaRecorder.isTypeSupported(t))return t}catch{}return''}
function extM(m=''){return m.includes('mp4')?'voice.mp4':'voice.webm'}

function CeneAperitivi(){
  const mr=useRef(null),cr=useRef([]),sr=useRef(null),isRecRef=useRef(false)
  const[expenses,setExpenses]=useState([])
  const[purchases,setPurchases]=useState([])   // purchase_items manuali
  const[recMap,setRecMap]=useState({})          // receipt_items per spesa espansa
  const[expanded,setExpanded]=useState(null)
  const[loading,setLoading]=useState(false)
  const[err,setErr]=useState(null)
  const[userId,setUserId]=useState(null)
  const[isRec,setIsRec]=useState(false)
  const[aibusy,setAiBusy]=useState(false)
  const[showForm,setShowForm]=useState(false)
  const[showItem,setShowItem]=useState(false)
  const[tab,setTab]=useState('spese')
  const[mk,setMk]=useState(()=>clamp(typeof window!=='undefined'?localStorage.getItem('_jv_cene_mk')||toMK():toMK()))
  const[form,setForm]=useState({store:'',description:'',amount:'',date:''})
  const[iForm,setIForm]=useState({name:'',price:'',store:'',date:''})

  // ── contatore piatti totali (purchase_items manuali + receipt_items OCR) ──
  const[ocrPiattiCount,setOcrPiattiCount]=useState(0)

  useEffect(()=>{supabase.auth.getUser().then(({data:{user}})=>{if(user){setUserId(user.id);load(user.id)}})},[])
  useEffect(()=>{try{localStorage.setItem('_jv_cene_mk',mk)}catch{}},[mk])
  const{s:si,e:ei}=useMemo(()=>mbounds(mk),[mk])

  async function load(uid){
    setLoading(true);setErr(null)
    try{
      const[ex,pu]=await Promise.all([
        supabase.from('expenses').select('id,store,store_address,amount,purchase_date,description')
          .eq('user_id',uid).eq('category','cene').gte('purchase_date',si).lte('purchase_date',ei).order('purchase_date',{ascending:false}),
        supabase.from('purchase_items').select('id,name,brand,description,price,store,purchase_date')
          .eq('user_id',uid).eq('category','cene').order('purchase_date',{ascending:false})
      ])
      if(ex.error)throw ex.error
      setExpenses(ex.data||[])
      if(!pu.error)setPurchases(pu.data||[])

      // Carica anche il conteggio piatti OCR (receipt_items categoria ristorante)
      if(ex.data?.length){
        const expIds=ex.data.map(e=>e.id)
        // Prendi i receipt delle spese cene
        const{data:recs}=await supabase.from('receipts').select('id').in('expense_id',expIds)
        if(recs?.length){
          const recIds=recs.map(r=>r.id)
          const{count}=await supabase.from('receipt_items').select('id',{count:'exact',head:true}).in('receipt_id',recIds)
          setOcrPiattiCount(count||0)
        }
      }
    }catch(e){setErr(e.message)}finally{setLoading(false)}
  }

  async function loadDetail(eid){
    const open=expanded===eid;setExpanded(open?null:eid)
    if(open||recMap[eid])return
    try{
      const{data:rec}=await supabase.from('receipts').select('id').eq('expense_id',eid).maybeSingle()
      if(!rec){setRecMap(m=>({...m,[eid]:{items:[]}}));return}
      // Carica receipt_items (piatti OCR)
      const{data:items}=await supabase.from('receipt_items')
        .select('id,name,brand,qty,unit,unit_price,price,category_item')
        .eq('receipt_id',rec.id)
        .order('price',{ascending:false})
      setRecMap(m=>({...m,[eid]:{items:items||[]}}))
    }catch(e){setErr(e.message)}
  }

  async function onSubmit(e){
    e.preventDefault();setErr(null)
    try{
      const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error()
      await supabase.from('expenses').insert({user_id:user.id,category:'cene',store:form.store,description:form.description||null,amount:parseFloat(form.amount)||0,purchase_date:form.date||iso(),source:'manual'})
      setForm({store:'',description:'',amount:'',date:''});await load(user.id)
    }catch(e){setErr(e.message)}
  }

  async function onAddItem(e){
    e.preventDefault();setErr(null)
    try{
      const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error()
      await supabase.from('purchase_items').insert({user_id:user.id,category:'cene',name:iForm.name,price:parseFloat(iForm.price)||0,store:iForm.store||null,purchase_date:iForm.date||iso()})
      setIForm({name:'',price:'',store:'',date:''});await load(user.id)
    }catch(e){setErr(e.message)}
  }

  async function handleOCR(file){
    if(!file)return;setAiBusy(true);setErr(null)
    try{
      const fd=new FormData();fd.append('image',file,'foto.jpg')
      const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),65000)
      let r;try{r=await fetch('/api/ocr-universal',{method:'POST',body:fd,signal:ctrl.signal})}finally{clearTimeout(t)}
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Errore OCR')
      if(data.doc_type!=='receipt'&&data.doc_type!=='invoice')throw new Error('Non è uno scontrino')
      const{data:{user}}=await supabase.auth.getUser()

      // Indirizzo + città nella description
      const locationParts=[data.store_address,data.store_city||null].filter(Boolean)
      const locationStr=locationParts.length?` — ${locationParts.join(', ')}`:''

      const{data:exp}=await supabase.from('expenses').insert({
        user_id:user.id,category:'cene',
        store:data.store||'Cena',
        store_address:data.store_address||null,
        description:(data.store||'Cena')+locationStr,
        amount:parseFloat(data.price_total||0),
        purchase_date:data.purchase_date||iso(),
        payment_method:data.payment_method||'unknown',
        source:'ocr'
      }).select('id').single()

      if(exp){
        const{data:rec}=await supabase.from('receipts').insert({
          user_id:user.id,expense_id:exp.id,store:data.store||'',
          purchase_date:data.purchase_date||iso(),
          price_total:parseFloat(data.price_total||0),
          payment_method:data.payment_method||'unknown',
          confidence:data.confidence||'medium'
        }).select('id').single()

        // Salva receipt_items (piatti) per tutti i locali cene
        if(rec&&data.items?.length){
          await supabase.from('receipt_items').insert(data.items.map(it=>({
            receipt_id:rec.id,user_id:user.id,
            name:it.name,brand:it.brand||null,
            qty:it.qty||1,unit:it.unit||'pz',
            unit_price:it.unit_price||it.price||0,
            price:it.price||0,
            category_item:it.category_item||'ristorante',
            purchase_date:data.purchase_date||iso()
          })))
        }
      }
      await load(user.id)
    }catch(e){setErr('OCR: '+(e.message||e))}finally{setAiBusy(false)}
  }

  const toggleRec=useCallback(async()=>{
    if(isRecRef.current){
      isRecRef.current=false;setIsRec(false)
      try{if(mr.current?.state==='recording'){mr.current.requestData?.();mr.current.stop()}}catch{}
      try{sr.current?.getTracks?.().forEach(t=>t.stop())}catch{}
      return
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true})
      sr.current=stream;cr.current=[]
      const mime=getBM();mr.current=new MediaRecorder(stream,mime?{mimeType:mime}:undefined)
      mr.current.ondataavailable=e=>{if(e.data?.size>0)cr.current.push(e.data)}
      mr.current.onstop=async()=>{
        try{
          const am=mr.current?.mimeType||mime||'audio/webm'
          const blob=new Blob(cr.current,{type:am})
          const fd=new FormData();fd.append('audio',blob,extM(am))
          const r=await fetch('/api/stt',{method:'POST',body:fd})
          const j=await r.json().catch(()=>({}))
          if(!r.ok||!j?.text)throw new Error('STT fallito')
          setAiBusy(true)
          const r2=await fetch('/api/assistant-v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:`Registra cena/aperitivo: "${j.text}". Azione add_expense category=cene.`,userId,conversationHistory:[]})})
          const d=await r2.json()
          if(d.action?.type==='add_expense'){
            const{data:{user}}=await supabase.auth.getUser()
            await supabase.from('expenses').insert({user_id:user.id,category:'cene',store:d.action.store||'Cena',amount:Number(d.action.amount||0),purchase_date:d.action.date||iso(),source:'voice'})
            await load(user.id)
          }else setErr(d.text||'Non ho capito')
        }catch(e){setErr('Voce: '+(e.message||e))}
        finally{setAiBusy(false);try{sr.current?.getTracks?.().forEach(t=>t.stop())}catch{}}
      }
      isRecRef.current=true;mr.current.start(250);setIsRec(true)
    }catch(e){isRecRef.current=false;setIsRec(false);setErr(e?.name==='NotAllowedError'?'Microfono non autorizzato':'Mic non disponibile')}
  },[userId])

  const totale=expenses.reduce((s,r)=>s+Number(r.amount||0),0)
  const mLabel=mk==='all'?'Tutti i mesi':new Date(Number(mk.split('-')[0]),Number(mk.split('-')[1])-1,1).toLocaleString('it-IT',{month:'long',year:'numeric'})
  // Totale piatti: manuali + OCR
  const totalePiatti=purchases.length+ocrPiattiCount

  return(<>
    <Head><title>Cene – Jarvis</title></Head>
    <div className="pw"><div className="pi">
      <div className="ph"><div className="pl">JARVIS</div><div className="pp">{mLabel}</div></div>
      <div className="ks">
        <div className="kc"><div className="kl">Spese Cene</div><div className="kv" style={{color:'#fbbf24'}}>{eur(totale)}</div></div>
        <div className="kc"><div className="kl">N° uscite</div><div className="kv" style={{color:'#22d3ee'}}>{expenses.length}</div></div>
        <div className="kc"><div className="kl">Piatti registrati</div><div className="kv" style={{color:'#fb923c'}}>{totalePiatti}</div></div>
      </div>
      <div className="mc">
        <div className="sh">
          <span className="st">🍽️ Cene & Aperitivi</span>
          <span className="ss">Ristoranti · Bar · Aperitivi</span>
        </div>
        <div className="tr">
          <button className="tb" style={tab==='spese'?{color:'#fbbf24',borderBottom:'2px solid #fbbf24'}:{}} onClick={()=>setTab('spese')}>📋 Spese ({expenses.length})</button>
          <button className="tb" style={tab==='listino'?{color:'#fbbf24',borderBottom:'2px solid #fbbf24'}:{}} onClick={()=>setTab('listino')}>🥘 Piatti & Ordini ({totalePiatti})</button>
        </div>
        {tab==='spese'&&<div className="mn">
          <button className="mb" onClick={()=>{const[y,m]=mk.split('-').map(Number);setMk(toMK(new Date(y,m-2,1)))}}>‹</button>
          <input type="month" value={mk==='all'?toMK():mk} onChange={e=>setMk(clamp(e.target.value))} className="mi"/>
          <button className="mb" onClick={()=>{const[y,m]=mk.split('-').map(Number);setMk(toMK(new Date(y,m,1)))}}>›</button>
          <button className="ma" onClick={()=>setMk('all')}>Tutti</button>
        </div>}
        <div className="tl">
          <button className={`bn bn-v ${isRec?'bn-rec':''} ${aibusy&&!isRec?'bn-off':''}`} onClick={toggleRec} disabled={aibusy&&!isRec}>
            {isRec?<svg width="14" height="14" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="#f87171"/></svg>:<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="2"/><path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
            {isRec?'Stop':aibusy?'…':'Voce'}
          </button>
          <label className={`bn bn-o ${aibusy?'bn-off':''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2"/></svg>
            OCR<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)handleOCR(f)}}/>
          </label>
          <button className="bn bn-a" onClick={()=>{setShowForm(v=>!v);setShowItem(false)}}>{showForm?'— Chiudi':'＋ Spesa'}</button>
          <button className="bn bn-i" onClick={()=>{setShowItem(v=>!v);setShowForm(false)}}>{showItem?'— Chiudi':'🍕 Aggiungi piatto'}</button>
        </div>
        {showForm&&<form className="ef" onSubmit={onSubmit}>
          <div className="fr">
            <div className="ff"><label className="fl">Locale</label><input className="fi" value={form.store} onChange={e=>setForm(f=>({...f,store:e.target.value}))} placeholder="Ristorante, Bar…" required/></div>
            <div className="ff"><label className="fl">Data</label><input type="date" className="fi" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
          </div>
          <div className="fr">
            <div className="ff"><label className="fl">Dettaglio</label><input className="fi" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Pizza + birra…"/></div>
            <div className="ff"><label className="fl">€ Totale</label><input type="number" step="0.01" className="fi" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} required/></div>
          </div>
          <button type="submit" className="bn bn-s">✓ Salva</button>
        </form>}
        {showItem&&<form className="ef" onSubmit={onAddItem}>
          <div className="fr">
            <div className="ff"><label className="fl">Piatto / Bevanda</label><input className="fi" value={iForm.name} onChange={e=>setIForm(f=>({...f,name:e.target.value}))} placeholder="Pizza margherita, Spritz…" required/></div>
            <div className="ff"><label className="fl">€ Prezzo</label><input type="number" step="0.01" className="fi" value={iForm.price} onChange={e=>setIForm(f=>({...f,price:e.target.value}))} required/></div>
          </div>
          <div className="fr">
            <div className="ff"><label className="fl">Locale</label><input className="fi" value={iForm.store} onChange={e=>setIForm(f=>({...f,store:e.target.value}))} placeholder="Nome ristorante…"/></div>
            <div className="ff"><label className="fl">Data</label><input type="date" className="fi" value={iForm.date} onChange={e=>setIForm(f=>({...f,date:e.target.value}))}/></div>
          </div>
          <button type="submit" className="bn bn-s" style={{borderColor:'rgba(251,191,36,.35)',color:'#fbbf24'}}>✓ Aggiungi</button>
        </form>}
        {err&&<div className="eb">{err}<button onClick={()=>setErr(null)}>✕</button></div>}
        {aibusy&&<div className="ab"><span className="ad"/>Elaboro…</div>}

        {/* ── TAB SPESE ── */}
        {tab==='spese'&&<div className="lb">
          {loading?<div className="sk"><span/><span/><span/></div>:expenses.length===0?<div className="le">Nessuna spesa</div>:
          expenses.map(exp=><div key={exp.id} className="eb2">
            <div className="er" onClick={()=>loadDetail(exp.id)}>
              <div className="el">
                <span className="es" style={{color:'#fbbf24'}}>{exp.store||'—'}</span>
                {/* Mostra indirizzo/città se disponibile */}
                {exp.store_address&&<span className="ea">📍 {exp.store_address}</span>}
                {exp.description&&exp.description!==(exp.store||'')&&<span className="ea">{exp.description}</span>}
                <span className="edate">{exp.purchase_date}</span>
              </div>
              <div className="eg">
                <span className="ev" style={{color:'#fbbf24'}}>{eur(exp.amount)}</span>
                <span className="ech">{expanded===exp.id?'▲':'▼'}</span>
                <button className="dx" onClick={e=>{e.stopPropagation();(async()=>{const{error}=await supabase.from('expenses').delete().eq('id',exp.id);if(!error){setExpenses(x=>x.filter(r=>r.id!==exp.id));if(expanded===exp.id)setExpanded(null)}})()}}>✕</button>
              </div>
            </div>
            {expanded===exp.id&&<div className="ed2">
              {recMap[exp.id]?.items?.length>0?(<>
                <div className="dl">🍽️ {recMap[exp.id].items.length} voci — scontrino</div>
                <div className="il">{recMap[exp.id].items.map(it=><div key={it.id} className="ir">
                  <div className="il-left">
                    <span className="iname">
                      {it.name}
                      {it.brand&&<em className="ibrand"> · {it.brand}</em>}
                    </span>
                    {it.qty>1&&<span className="ipack">{it.qty} × {eur(it.unit_price)}</span>}
                  </div>
                  <span className="ipr" style={{color:'#fbbf24'}}>{eur(it.price)}</span>
                </div>)}</div>
                <div className="itot">Totale <strong style={{color:'#fbbf24'}}>{eur(recMap[exp.id].items.reduce((s,i)=>s+Number(i.price||0),0))}</strong></div>
              </>)
              :recMap[exp.id]?<div className="dem">Nessun dettaglio scontrino</div>:<div className="dem">Caricamento…</div>}
            </div>}
          </div>)}
        </div>}

        {/* ── TAB PIATTI & ORDINI ── */}
        {/* Mostra sia purchase_items manuali che i receipt_items OCR di tutte le spese */}
        {tab==='listino'&&<ListinoPiatti uid={userId} expenses={expenses} purchases={purchases}/>}
      </div>
    </div></div>
    <style jsx global>{CSS}</style>
  </>)
}

// ── Componente separato per la lista piatti che carica anche receipt_items ──
function ListinoPiatti({uid, expenses, purchases}){
  const[ocrPiatti,setOcrPiatti]=useState([])
  const[loading,setLoading]=useState(false)

  useEffect(()=>{
    if(!uid||!expenses.length)return
    ;(async()=>{
      setLoading(true)
      try{
        const expIds=expenses.map(e=>e.id)
        const{data:recs}=await supabase.from('receipts').select('id,expense_id,store,purchase_date').in('expense_id',expIds)
        if(!recs?.length){setOcrPiatti([]);return}

        // Mappa expense_id → store/data per ciascun receipt
        const recMap=Object.fromEntries(recs.map(r=>[r.id,{store:r.store,date:r.purchase_date}]))
        const recIds=recs.map(r=>r.id)

        const{data:items}=await supabase.from('receipt_items')
          .select('id,receipt_id,name,brand,qty,unit_price,price,category_item,purchase_date')
          .in('receipt_id',recIds)
          .order('purchase_date',{ascending:false})

        setOcrPiatti((items||[]).map(it=>({
          ...it,
          store: recMap[it.receipt_id]?.store||'',
          purchase_date: it.purchase_date||recMap[it.receipt_id]?.date||'',
        })))
      }catch(e){console.error('[listino piatti]',e)}
      finally{setLoading(false)}
    })()
  },[uid, expenses])

  const eur2=(n)=>(Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'})

  if(loading)return<div style={{padding:'1.5rem',textAlign:'center',color:'rgba(100,116,139,.5)',fontSize:'.8rem'}}>Caricamento piatti…</div>

  const all=[
    ...purchases.map(p=>({id:'m-'+p.id,name:p.name,brand:p.brand||null,price:p.price,store:p.store,purchase_date:p.purchase_date,source:'manual'})),
    ...ocrPiatti.map(p=>({id:'o-'+p.id,name:p.name,brand:p.brand||null,price:p.price,store:p.store,purchase_date:p.purchase_date,qty:p.qty,unit_price:p.unit_price,source:'ocr'}))
  ].sort((a,b)=>(b.purchase_date||'').localeCompare(a.purchase_date||''))

  if(!all.length)return<div className="le">Nessun piatto registrato — scannerizza uno scontrino di ristorante</div>

  return<div className="lb">
    {all.map(p=><div key={p.id} className="pr">
      <div className="pico">🍽️</div>
      <div className="pn">
        <span className="pname">{p.name}</span>
        {p.brand&&<span className="pbrand">{p.brand}</span>}
        {p.qty>1&&<span className="pbrand">{p.qty} × {eur2(p.unit_price)}</span>}
      </div>
      <div className="pm2">
        <span className="pprice" style={{color:'#fbbf24'}}>{eur2(p.price)}</span>
        {p.store&&<span className="pstore">@ {p.store}</span>}
        <span className="pdate">{p.purchase_date}</span>
        {p.source==='ocr'&&<span style={{fontSize:'.58rem',color:'rgba(251,191,36,.4)',letterSpacing:'.06em'}}>OCR</span>}
      </div>
    </div>)}
  </div>
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Inter:wght@400;500;600&family=Orbitron:wght@700;900&display=swap');
  html,body{margin:0;padding:0;min-height:100%}
  body{background:linear-gradient(180deg,#2aa9a9 0%,#114a52 38%,#0b2b31 100%) fixed!important;overflow-x:hidden}
  *{box-sizing:border-box}
  .pw{position:relative;z-index:1;min-height:100vh;font-family:Inter,system-ui,sans-serif;color:#e2e8f0;padding:5rem 1rem 3rem}
  .pi{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:1.1rem}
  .ph{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem}
  .pl{font-family:'Orbitron',monospace;font-size:1.1rem;font-weight:700;background:linear-gradient(90deg,#5eead4,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:3px}
  .pp{font-size:.74rem;color:rgba(100,116,139,.7);background:rgba(7,20,26,.6);border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:.28rem .85rem;backdrop-filter:blur(10px);text-transform:capitalize}
  .ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem}
  .kc{background:rgba(7,20,26,.7);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:1rem 1.15rem;backdrop-filter:blur(14px);transition:border-color .2s}
  .kc:hover{border-color:rgba(255,255,255,.14)}
  .kl{font-size:.6rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(100,116,139,.65);margin-bottom:.45rem}
  .kv{font-family:'Montserrat',sans-serif;font-size:1.55rem;font-weight:700;line-height:1}
  .mc{background:rgba(7,20,26,.72);border:1px solid rgba(255,255,255,.08);border-radius:18px;backdrop-filter:blur(16px);overflow:hidden}
  .sh{display:flex;align-items:center;justify-content:space-between;padding:.8rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.05)}
  .st{font-size:.63rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(100,116,139,.65)}
  .ss{font-size:.6rem;color:rgba(100,116,139,.4)}
  .tr{display:flex;border-bottom:1px solid rgba(255,255,255,.05)}
  .tb{flex:1;padding:.68rem;background:none;border:none;color:rgba(100,116,139,.6);font-size:.77rem;font-family:Inter,sans-serif;font-weight:600;cursor:pointer;transition:color .14s,background .14s}
  .tb:hover{color:#e2e8f0;background:rgba(255,255,255,.03)}
  .mn{display:flex;align-items:center;gap:.45rem;padding:.55rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.04)}
  .mb{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#94a3b8;width:27px;height:27px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.85rem}
  .mb:hover{background:rgba(255,255,255,.1)}
  .mi{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#e2e8f0;padding:.22rem .5rem;font-size:.75rem;font-family:Inter,sans-serif;outline:none}
  .ma{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:rgba(148,163,184,.6);padding:0 .6rem;height:27px;cursor:pointer;font-size:.66rem;font-family:Inter,sans-serif;white-space:nowrap}
  .tl{display:flex;gap:.45rem;padding:.65rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.04);flex-wrap:wrap}
  .bn{display:inline-flex;align-items:center;gap:.3rem;padding:.42rem .85rem;border-radius:9px;font-size:.75rem;font-family:Inter,sans-serif;font-weight:600;cursor:pointer;border:1px solid;white-space:nowrap;transition:all .14s;background:transparent}
  .bn-v{border-color:rgba(34,211,238,.3);color:#22d3ee}
  .bn-v:hover{background:rgba(34,211,238,.08)}
  .bn-rec{border-color:rgba(239,68,68,.5)!important;color:#f87171!important;background:rgba(239,68,68,.08)!important;animation:recP .9s ease-in-out infinite}
  @keyframes recP{0%,100%{box-shadow:0 0 0 rgba(239,68,68,0)}50%{box-shadow:0 0 12px rgba(239,68,68,.5)}}
  .bn-o{border-color:rgba(245,158,11,.3);color:#fbbf24;cursor:pointer}
  .bn-o:hover{background:rgba(245,158,11,.08)}
  .bn-a{border-color:rgba(99,102,241,.3);color:#818cf8}
  .bn-a:hover{background:rgba(99,102,241,.08)}
  .bn-i{border-color:rgba(255,255,255,.14);color:rgba(148,163,184,.7)}
  .bn-i:hover{background:rgba(255,255,255,.05)}
  .bn-s{border-color:rgba(34,197,94,.3);color:#22c55e;align-self:flex-start}
  .bn-s:hover{background:rgba(34,197,94,.08)}
  .bn-off{opacity:.38;pointer-events:none}
  .ef{padding:.85rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.04);display:flex;flex-direction:column;gap:.55rem}
  .fr{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;align-items:end}
  @media(max-width:540px){.fr{grid-template-columns:1fr}}
  .ff{display:flex;flex-direction:column;gap:.2rem}
  .fl{font-size:.61rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(100,116,139,.6)}
  .fi{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-radius:8px;color:#e2e8f0;padding:.4rem .65rem;font-size:.8rem;font-family:Inter,sans-serif;outline:none;width:100%}
  .fi:focus{border-color:rgba(42,169,169,.5)}
  .eb{margin:.45rem 1.25rem;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.18);border-radius:8px;padding:.45rem .85rem;font-size:.76rem;color:#f87171;display:flex;justify-content:space-between;align-items:center}
  .eb button{background:none;border:none;color:#f87171;cursor:pointer}
  .ab{display:flex;align-items:center;gap:.42rem;padding:.45rem 1.25rem;font-size:.73rem;color:#22d3ee;border-bottom:1px solid rgba(255,255,255,.03)}
  .ad{display:inline-block;width:5px;height:5px;border-radius:50%;background:#22d3ee;animation:dot .9s infinite}
  @keyframes dot{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
  .lb{padding:.2rem 0 .4rem}
  .le{text-align:center;color:rgba(100,116,139,.5);padding:2.5rem;font-size:.81rem}
  .sk{display:flex;flex-direction:column;gap:.35rem;padding:.9rem 1.25rem}
  .sk span{height:42px;background:rgba(255,255,255,.04);border-radius:8px;animation:sh 1.5s ease-in-out infinite}
  @keyframes sh{0%,100%{opacity:.4}50%{opacity:.8}}
  .eb2{border-bottom:1px solid rgba(255,255,255,.04)}
  .er{display:flex;align-items:center;justify-content:space-between;padding:.7rem 1.25rem;cursor:pointer;gap:.6rem;transition:background .12s}
  .er:hover{background:rgba(255,255,255,.025)}
  .el{display:flex;flex-direction:column;gap:.1rem;flex:1;min-width:0}
  .es{font-size:.87rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:underline;text-decoration-color:rgba(255,255,255,.15);text-underline-offset:2px}
  .ea{font-size:.7rem;color:rgba(100,116,139,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .edate{font-size:.65rem;color:rgba(100,116,139,.4)}
  .eg{display:flex;align-items:center;gap:.55rem;flex-shrink:0}
  .ev{font-size:.88rem;font-weight:700;font-family:'Montserrat',sans-serif}
  .ech{font-size:.55rem;color:rgba(100,116,139,.5)}
  .dx{background:none;border:1px solid rgba(239,68,68,.16);border-radius:6px;color:rgba(239,68,68,.35);cursor:pointer;padding:.15rem .4rem;font-size:.67rem;transition:all .12s}
  .dx:hover{border-color:rgba(239,68,68,.5);color:#f87171;background:rgba(239,68,68,.07)}
  .ed2{background:rgba(0,0,0,.22);border-top:1px solid rgba(255,255,255,.04);padding:.65rem 1.25rem .9rem}
  .dl{font-size:.61rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(100,116,139,.5);margin-bottom:.45rem}
  .dem{font-size:.75rem;color:rgba(100,116,139,.45)}
  .il{display:flex;flex-direction:column;gap:.25rem}
  .ir{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;font-size:.76rem;padding:.28rem 0;border-bottom:1px solid rgba(255,255,255,.03)}
  .il-left{display:flex;flex-direction:column;gap:.06rem;flex:1;min-width:0}
  .iname{color:#cbd5e1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ibrand{color:rgba(100,116,139,.6);font-style:normal}
  .ipack{font-size:.67rem;color:rgba(100,116,139,.5)}
  .ipr{font-size:.8rem;font-weight:700;font-family:'Montserrat',sans-serif;flex-shrink:0}
  .itot{text-align:right;font-size:.72rem;color:rgba(100,116,139,.5);padding:.4rem 0 .1rem;border-top:1px solid rgba(255,255,255,.06);margin-top:.2rem}
  .pr{display:flex;align-items:flex-start;gap:.65rem;padding:.65rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.04);transition:background .12s}
  .pr:hover{background:rgba(255,255,255,.02)}
  .pico{font-size:1.05rem;flex-shrink:0;margin-top:.1rem}
  .pn{flex:1;display:flex;flex-direction:column;gap:.08rem;min-width:0}
  .pname{font-size:.85rem;font-weight:600;color:#e2e8f0}
  .pbrand{font-size:.7rem;color:rgba(100,116,139,.6)}
  .pdesc{font-size:.71rem;color:rgba(100,116,139,.5);line-height:1.35}
  .pm2{display:flex;flex-direction:column;align-items:flex-end;gap:.12rem;flex-shrink:0}
  .pprice{font-size:.88rem;font-weight:700;font-family:'Montserrat',sans-serif}
  .pstore{font-size:.67rem;color:rgba(100,116,139,.5)}
  .pdate{font-size:.64rem;color:rgba(100,116,139,.35)}
`

export default withAuth(CeneAperitivi)
export async function getServerSideProps(){return{props:{}}}