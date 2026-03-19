// pages/spese-casa.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'
import PageShell, { PAGE_STYLES } from '../components/_PageShell'

function isoLocal(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function toMK(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function clampMK(s){return /^\d{4}-\d{2}$/.test(String(s||''))?s:toMK()}
function monthBounds(mk){const[y,m]=mk.split('-').map(Number);return{s:isoLocal(new Date(y,m-1,1)),e:isoLocal(new Date(y,m,0))}}
function eur(n){return (Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'})}
function getBM(){if(typeof MediaRecorder==='undefined')return '';for(const t of['audio/webm;codecs=opus','audio/webm','audio/mp4'])try{if(MediaRecorder.isTypeSupported(t))return t}catch{}return ''}
function ext(m=''){return m.includes('mp4')?'voice.mp4':'voice.webm'}

function SpeseCasa(){
  const mr=useRef(null),cr=useRef([]),sr=useRef(null)
  const [expenses,setExpenses]=useState([])
  const [inventory,setInventory]=useState([])
  const [receiptsMap,setReceiptsMap]=useState({})
  const [expanded,setExpanded]=useState(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState(null)
  const [userId,setUserId]=useState(null)
  const [isRec,setIsRec]=useState(false)
  const [aibusy,setAiBusy]=useState(false)
  const [showForm,setShowForm]=useState(false)
  const [form,setForm]=useState({store:'',description:'',amount:'',date:''})
  const [tab,setTab]=useState('spese')
  const [mk,setMk]=useState(()=>clampMK(typeof window!=='undefined'?localStorage.getItem('__sc_month')||toMK():toMK()))

  useEffect(()=>{supabase.auth.getUser().then(({data:{user}})=>{if(user){setUserId(user.id);load(user.id)}})}, [])
  useEffect(()=>{try{localStorage.setItem('__sc_month',mk)}catch{}}, [mk])
  const {s:si,e:ei}=useMemo(()=>monthBounds(mk),[mk])

  async function load(uid){
    setLoading(true);setErr(null)
    try{
      const[ex,iv]=await Promise.all([
        supabase.from('expenses').select('id,store,store_address,amount,purchase_date,payment_method').eq('user_id',uid).eq('category','casa').gte('purchase_date',si).lte('purchase_date',ei).order('purchase_date',{ascending:false}),
        supabase.from('inventory').select('id,product_name,brand,qty,unit_label,avg_price,expiry_date,consumed_pct,store').eq('user_id',uid).order('created_at',{ascending:false})
      ])
      if(ex.error)throw ex.error;if(iv.error)throw iv.error
      setExpenses(ex.data||[]);setInventory(iv.data||[])
    }catch(e){setErr(e.message)}finally{setLoading(false)}
  }

  async function loadReceipt(eid){
    const open=expanded===eid;setExpanded(open?null:eid)
    if(open||receiptsMap[eid])return
    try{
      const{data:rec}=await supabase.from('receipts').select('id').eq('expense_id',eid).maybeSingle()
      if(!rec){setReceiptsMap(m=>({...m,[eid]:{items:[]}}));return}
      const{data:items}=await supabase.from('receipt_items').select('id,name,brand,qty,unit,unit_price,price,expiry_date').eq('receipt_id',rec.id).order('price',{ascending:false})
      setReceiptsMap(m=>({...m,[eid]:{items:items||[]}}))
    }catch(e){setErr(e.message)}
  }

  async function onSubmit(e){
    e.preventDefault();setErr(null)
    try{
      const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error()
      await supabase.from('expenses').insert({user_id:user.id,category:'casa',store:form.store,description:form.description,amount:parseFloat(form.amount)||0,purchase_date:form.date||isoLocal(),source:'manual'})
      setForm({store:'',description:'',amount:'',date:''});await load(user.id)
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
      if(data.categoria!=='casa')throw new Error(`Categoria "${data.categoria}" — usa la pagina corretta`)
      const{data:{user}}=await supabase.auth.getUser()
      const{data:exp}=await supabase.from('expenses').insert({user_id:user.id,category:'casa',store:data.store||'Supermercato',store_address:data.store_address||null,amount:parseFloat(data.price_total||0),purchase_date:data.purchase_date||isoLocal(),payment_method:data.payment_method||'unknown',source:'ocr'}).select('id').single()
      if(exp){
        const{data:rec}=await supabase.from('receipts').insert({user_id:user.id,expense_id:exp.id,store:data.store||'',purchase_date:data.purchase_date||isoLocal(),price_total:parseFloat(data.price_total||0),payment_method:data.payment_method||'unknown',confidence:data.confidence||'medium'}).select('id').single()
        if(rec&&data.items?.length){
          await supabase.from('receipt_items').insert(data.items.map(it=>({receipt_id:rec.id,user_id:user.id,name:it.name,brand:it.brand||null,qty:it.qty||1,unit:it.unit||'pz',unit_price:it.unit_price||0,price:it.price||0,category_item:it.category_item||'alimentari',expiry_date:it.expiry_date||null,purchase_date:data.purchase_date||isoLocal()})))
          for(const it of data.items){
            if(!it.name)continue;const tot=Number(it.qty||1)
            const{data:ex2}=await supabase.from('inventory').select('id,qty,initial_qty').eq('user_id',user.id).ilike('product_name',`%${it.name.split(' ')[0]}%`).maybeSingle()
            if(ex2)await supabase.from('inventory').update({qty:Number(ex2.qty||0)+tot,initial_qty:Number(ex2.initial_qty||0)+tot,consumed_pct:0,avg_price:it.unit_price||0,...(it.expiry_date?{expiry_date:it.expiry_date}:{})}).eq('id',ex2.id)
            else await supabase.from('inventory').insert({user_id:user.id,product_name:it.name,brand:it.brand||null,category:it.category_item||'alimentari',qty:tot,initial_qty:tot,avg_price:it.unit_price||0,purchase_date:data.purchase_date||isoLocal(),expiry_date:it.expiry_date||null,consumed_pct:0})
          }
        }
      }
      await load(user.id)
    }catch(e){setErr('OCR: '+(e.message||e))}finally{setAiBusy(false)}
  }

  const toggleRec=useCallback(async()=>{
    if(isRec){try{if(mr.current?.state==='recording'){mr.current.requestData?.();mr.current.stop()}}catch{}return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});sr.current=stream;cr.current=[]
      const mime=getBM();mr.current=new MediaRecorder(stream,mime?{mimeType:mime}:undefined)
      mr.current.ondataavailable=e=>{if(e.data?.size>0)cr.current.push(e.data)}
      mr.current.onstop=async()=>{
        setIsRec(false);setAiBusy(true)
        try{
          const am=mr.current?.mimeType||mime||'audio/webm';const blob=new Blob(cr.current,{type:am})
          const fd=new FormData();fd.append('audio',blob,ext(am))
          const r=await fetch('/api/stt',{method:'POST',body:fd});const j=await r.json().catch(()=>({}))
          if(!r.ok||!j?.text)throw new Error('STT fallito')
          const r2=await fetch('/api/assistant-v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:`Registra spesa casa: "${j.text}". Azione add_expense category=casa.`,userId,conversationHistory:[]})})
          const d=await r2.json()
          if(d.action?.type==='add_expense'){
            const{data:{user}}=await supabase.auth.getUser()
            await supabase.from('expenses').insert({user_id:user.id,category:'casa',store:d.action.store||'Casa',amount:Number(d.action.amount||0),purchase_date:d.action.date||isoLocal(),source:'voice'})
            await load(user.id)
          }else setErr(d.text||'Non ho capito')
        }catch(e){setErr('Voce: '+(e.message||e))}
        finally{setAiBusy(false);try{sr.current?.getTracks?.().forEach(t=>t.stop())}catch{}}
      }
      mr.current.start(250);setIsRec(true)
    }catch(e){setErr(e?.name==='NotAllowedError'?'Microfono non autorizzato':'Microfono non disponibile')}
  },[isRec,userId])

  const totale=expenses.reduce((s,r)=>s+Number(r.amount||0),0)
  const [y,m2]=mk.split('-')
  const mLabel=new Date(Number(y),Number(m2)-1,1).toLocaleString('it-IT',{month:'long',year:'numeric'})

  return(
    <PageShell title="Casa">
      {/* Header */}
      <div className="page-header">
        <div className="page-logo">JARVIS</div>
        <div className="page-period">{mLabel}</div>
      </div>

      {/* KPI */}
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Spese del mese</div>
          <div className="kpi-value" style={{color:'#22c55e'}}>{eur(totale)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">N° acquisti</div>
          <div className="kpi-value" style={{color:'#22d3ee'}}>{expenses.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Prodotti dispensa</div>
          <div className="kpi-value" style={{color:'#fbbf24'}}>{inventory.length}</div>
        </div>
      </div>

      {/* Main card */}
      <div className="main-card">
        <div className="section-hd">
          <span className="section-title">🏠 Spese Casa</span>
        </div>

        <div className="tab-row">
          <button className="tab-btn" style={tab==='spese'?{color:'#22d3ee',borderBottom:'2px solid #22d3ee'}:{}} onClick={()=>setTab('spese')}>📋 Spese ({expenses.length})</button>
          <button className="tab-btn" style={tab==='dispensa'?{color:'#22d3ee',borderBottom:'2px solid #22d3ee'}:{}} onClick={()=>setTab('dispensa')}>📦 Dispensa ({inventory.length})</button>
        </div>

        {tab==='spese'&&<div className="month-nav">
          <button className="mn-btn" onClick={()=>{const[y,m]=mk.split('-').map(Number);setMk(toMK(new Date(y,m-2,1)))}}>‹</button>
          <input type="month" value={mk} onChange={e=>setMk(clampMK(e.target.value))} className="mn-input"/>
          <button className="mn-btn" onClick={()=>{const[y,m]=mk.split('-').map(Number);setMk(toMK(new Date(y,m,1)))}}>›</button>
        </div>}

        <div className="toolbar">
          <button className={`btn btn-voice ${isRec?'is-rec':''}`} onClick={toggleRec} disabled={aibusy&&!isRec}>{isRec?'⏹ Stop':aibusy?'◌ Elaboro…':'🎙 Voce'}</button>
          <label className={`btn btn-ocr ${aibusy?'':''}`} style={{cursor:'pointer'}}>
            📷 OCR<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)handleOCR(f)}}/>
          </label>
          <button className="btn btn-add" onClick={()=>setShowForm(v=>!v)}>{showForm?'— Chiudi':'＋ Manuale'}</button>
        </div>

        {showForm&&<form className="inline-form" onSubmit={onSubmit}>
          <div className="form-row">
            <div className="form-field"><label className="form-label">Punto vendita</label><input className="form-input" value={form.store} onChange={e=>setForm(f=>({...f,store:e.target.value}))} placeholder="Orsini, Esselunga…" required/></div>
            <div className="form-field"><label className="form-label">Data</label><input type="date" className="form-input" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-field"><label className="form-label">Descrizione</label><input className="form-input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Spesa settimanale…"/></div>
            <div className="form-field"><label className="form-label">Importo €</label><input type="number" step="0.01" className="form-input" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} required/></div>
          </div>
          <button type="submit" className="btn btn-save" style={{alignSelf:'flex-start'}}>✓ Salva</button>
        </form>}

        {err&&<div className="err-box">{err}<button onClick={()=>setErr(null)}>✕</button></div>}
        {aibusy&&<div className="ai-bar"><span className="ai-dot"/>Elaboro…</div>}

        {/* SPESE */}
        {tab==='spese'&&<div className="list-body">
          {loading?<div className="skeleton-rows"><div className="skeleton-row"/><div className="skeleton-row"/><div className="skeleton-row"/></div>:
           expenses.length===0?<div className="list-empty">Nessuna spesa in {mLabel}</div>:
           expenses.map(exp=><div key={exp.id} className="exp-block">
             <div className="exp-row" onClick={()=>loadReceipt(exp.id)}>
               <div className="exp-left">
                 <span className="exp-store">{exp.store||'—'}</span>
                 {exp.store_address&&<span className="exp-addr">{exp.store_address}</span>}
                 <span className="exp-date">{exp.purchase_date}</span>
               </div>
               <div className="exp-right">
                 <span className="exp-amt" style={{color:'#22c55e'}}>{eur(exp.amount)}</span>
                 <span className="exp-chev">{expanded===exp.id?'▲':'▼'}</span>
                 <button className="del-x" onClick={e=>{e.stopPropagation();supabase.from('expenses').delete().eq('id',exp.id);setExpenses(ex=>ex.filter(r=>r.id!==exp.id));if(expanded===exp.id)setExpanded(null)}}>✕</button>
               </div>
             </div>
             {expanded===exp.id&&<div className="exp-detail">
               {receiptsMap[exp.id]?.items?.length>0?(<>
                 <div className="detail-label">🛒 {receiptsMap[exp.id].items.length} prodotti</div>
                 <div className="items-list">
                   {receiptsMap[exp.id].items.map(it=><div key={it.id} className="it-row">
                     <span className="it-name">{it.name}{it.brand&&<em> · {it.brand}</em>}</span>
                     <span className="it-qty">{it.qty} {it.unit}</span>
                     <span className="it-price" style={{color:'#22c55e'}}>{eur(it.price)}</span>
                     {it.expiry_date&&<span className="it-exp">⏰ {it.expiry_date}</span>}
                   </div>)}
                 </div>
               </>):receiptsMap[exp.id]?<div className="detail-empty">Nessun dettaglio prodotti</div>:<div className="detail-empty">Caricamento…</div>}
             </div>}
           </div>)}
        </div>}

        {/* DISPENSA */}
        {tab==='dispensa'&&<div className="list-body">
          {inventory.length===0?<div className="list-empty">Nessun prodotto in dispensa</div>:
           inventory.map(p=>{
             const pct=Number(p.consumed_pct||0)
             const alert=pct>=80||(p.expiry_date&&new Date(p.expiry_date)<=new Date(Date.now()+10*86400000))
             return<div key={p.id} className={`prod-row ${alert?'prod-alert':''}`}>
               <div className="prod-info">
                 <span className="prod-name">{p.product_name}</span>
                 {p.brand&&<span className="prod-tag">{p.brand}</span>}
                 {p.store&&<span className="prod-tag">@ {p.store}</span>}
               </div>
               <div className="prod-meta">
                 <span className="prod-qty">{p.qty} {p.unit_label||'pz'}</span>
                 {p.avg_price>0&&<span className="prod-price">{eur(p.avg_price)}/u</span>}
                 {p.expiry_date&&<span className="prod-exp">⏰ {p.expiry_date}</span>}
                 {pct>0&&<span className="prod-pct">{Math.round(pct)}% usato</span>}
               </div>
               <button className="del-x" onClick={()=>{supabase.from('inventory').delete().eq('id',p.id);setInventory(iv=>iv.filter(r=>r.id!==p.id))}}>✕</button>
             </div>
           })}
        </div>}
      </div>
    </PageShell>
  )
}

export default withAuth(SpeseCasa)
export async function getServerSideProps(){return{props:{}}}