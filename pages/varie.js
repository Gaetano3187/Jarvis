// pages/varie.js
import React, { useCallback, useEffect, useRef, useState } from 'react'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'
import PageShell from '../components/_PageShell'

function isoLocal(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function eur(n){return (Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'})}
function getBM(){if(typeof MediaRecorder==='undefined')return '';for(const t of['audio/webm;codecs=opus','audio/webm','audio/mp4'])try{if(MediaRecorder.isTypeSupported(t))return t}catch{}return ''}
function ext(m=''){return m.includes('mp4')?'voice.mp4':'voice.webm'}
function icon(s=''){
  const v=s.toLowerCase()
  if(/farmac|medic|pillol/.test(v))return '💊'
  if(/parruch|barb|capell/.test(v))return '✂️'
  if(/tabac|sigarett/.test(v))return '🚬'
  if(/benzin|carburant|eni|ip|totalerg|autostrad/.test(v))return '⛽'
  if(/regalo|regali/.test(v))return '🎁'
  if(/elettron|computer|telefon|apple|samsung|mediaworld/.test(v))return '💻'
  if(/sport|palett|gym|piscin/.test(v))return '🏃'
  if(/cinem|teatro|concert|event/.test(v))return '🎬'
  if(/taxi|uber|parcheg|autobus|treno/.test(v))return '🚕'
  if(/banc|assicur|post/.test(v))return '🏦'
  if(/veterin|animali|cane|gatto/.test(v))return '🐾'
  return '🧾'
}

function Varie(){
  const mr=useRef(null),cr=useRef([]),sr=useRef(null)
  const [expenses,setExpenses]=useState([])
  const [purchases,setPurchases]=useState([])
  const [receiptsMap,setReceiptsMap]=useState({})
  const [expanded,setExpanded]=useState(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState(null)
  const [userId,setUserId]=useState(null)
  const [isRec,setIsRec]=useState(false)
  const [aibusy,setAiBusy]=useState(false)
  const [showForm,setShowForm]=useState(false)
  const [showItemForm,setShowItemForm]=useState(false)
  const [tab,setTab]=useState('spese')
  const [form,setForm]=useState({store:'',description:'',amount:'',date:''})
  const [itemForm,setItemForm]=useState({name:'',brand:'',description:'',price:'',store:'',date:''})

  useEffect(()=>{supabase.auth.getUser().then(({data:{user}})=>{if(user){setUserId(user.id);load(user.id)}})}, [])

  async function load(uid){
    setLoading(true);setErr(null)
    try{
      const[ex,pur]=await Promise.all([
        supabase.from('expenses').select('id,store,store_address,amount,purchase_date,description').eq('user_id',uid).eq('category','varie').order('purchase_date',{ascending:false}),
        supabase.from('purchase_items').select('id,name,brand,description,price,store,purchase_date').eq('user_id',uid).eq('category','varie').order('purchase_date',{ascending:false})
      ])
      if(ex.error)throw ex.error;setExpenses(ex.data||[])
      if(!pur.error)setPurchases(pur.data||[])
    }catch(e){setErr(e.message)}finally{setLoading(false)}
  }

  async function loadDetail(eid){
    const open=expanded===eid;setExpanded(open?null:eid)
    if(open||receiptsMap[eid])return
    try{
      const{data:rec}=await supabase.from('receipts').select('id').eq('expense_id',eid).maybeSingle()
      if(!rec){setReceiptsMap(m=>({...m,[eid]:{items:[]}}));return}
      const{data:items}=await supabase.from('receipt_items').select('id,name,brand,qty,unit,price').eq('receipt_id',rec.id)
      setReceiptsMap(m=>({...m,[eid]:{items:items||[]}}))
    }catch(e){setErr(e.message)}
  }

  async function onSubmit(e){
    e.preventDefault();setErr(null)
    try{
      const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error()
      await supabase.from('expenses').insert({user_id:user.id,category:'varie',store:form.store,description:form.description||null,amount:parseFloat(form.amount)||0,purchase_date:form.date||isoLocal(),source:'manual'})
      setForm({store:'',description:'',amount:'',date:''});await load(user.id)
    }catch(e){setErr(e.message)}
  }

  async function onAddItem(e){
    e.preventDefault();setErr(null)
    try{
      const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error()
      await supabase.from('purchase_items').insert({user_id:user.id,category:'varie',name:itemForm.name,brand:itemForm.brand||null,description:itemForm.description||null,price:parseFloat(itemForm.price)||0,store:itemForm.store||null,purchase_date:itemForm.date||isoLocal()})
      setItemForm({name:'',brand:'',description:'',price:'',store:'',date:''});await load(user.id)
    }catch(e){setErr(e.message)}
  }

  async function handleOCR(file){
    if(!file)return;setAiBusy(true);setErr(null)
    try{
      const fd=new FormData();fd.append('image',file,'foto.jpg')
      const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),65000)
      let r;try{r=await fetch('/api/ocr-universal',{method:'POST',body:fd,signal:ctrl.signal})}finally{clearTimeout(t)}
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Errore')
      if(data.doc_type!=='receipt'&&data.doc_type!=='invoice')throw new Error('Non è uno scontrino')
      const{data:{user}}=await supabase.auth.getUser()
      const{data:exp}=await supabase.from('expenses').insert({user_id:user.id,category:'varie',store:data.store||'Varie',store_address:data.store_address||null,description:data.store||null,amount:parseFloat(data.price_total||0),purchase_date:data.purchase_date||isoLocal(),payment_method:data.payment_method||'unknown',source:'ocr'}).select('id').single()
      if(exp&&data.items?.length)
        await supabase.from('purchase_items').insert(data.items.map(it=>({user_id:user.id,category:'varie',expense_id:exp.id,name:it.name,brand:it.brand||null,price:it.price||0,store:data.store||null,purchase_date:data.purchase_date||isoLocal()})))
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
          const r2=await fetch('/api/assistant-v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:`Registra spesa varia (farmacia, parrucchiere, benzina, regalo…): "${j.text}". Azione add_expense category=varie.`,userId,conversationHistory:[]})})
          const d=await r2.json()
          if(d.action?.type==='add_expense'){
            const{data:{user}}=await supabase.auth.getUser()
            await supabase.from('expenses').insert({user_id:user.id,category:'varie',store:d.action.store||'Varie',description:d.action.description||null,amount:Number(d.action.amount||0),purchase_date:d.action.date||isoLocal(),source:'voice'})
            await load(user.id)
          }else setErr(d.text||'Non ho capito')
        }catch(e){setErr('Voce: '+(e.message||e))}
        finally{setAiBusy(false);try{sr.current?.getTracks?.().forEach(t=>t.stop())}catch{}}
      }
      mr.current.start(250);setIsRec(true)
    }catch(e){setErr(e?.name==='NotAllowedError'?'Microfono non autorizzato':'Microfono non disponibile')}
  },[isRec,userId])

  const totale=expenses.reduce((s,r)=>s+Number(r.amount||0),0)

  return(
    <PageShell title="Varie">
      <div className="page-header">
        <div className="page-logo">JARVIS</div>
        <div className="page-period">Spese Varie</div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Totale spese varie</div>
          <div className="kpi-value" style={{color:'#94a3b8'}}>{eur(totale)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">N° spese</div>
          <div className="kpi-value" style={{color:'#22d3ee'}}>{expenses.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Acquisti registrati</div>
          <div className="kpi-value" style={{color:'#d4d4d8'}}>{purchases.length}</div>
        </div>
      </div>

      <div className="main-card">
        <div className="section-hd">
          <span className="section-title">🧰 Spese Varie · Farmacia · Benzina · Regali · altro</span>
        </div>

        <div className="tab-row">
          <button className="tab-btn" style={tab==='spese'?{color:'#94a3b8',borderBottom:'2px solid #94a3b8'}:{}} onClick={()=>setTab('spese')}>📋 Spese ({expenses.length})</button>
          <button className="tab-btn" style={tab==='acquisti'?{color:'#94a3b8',borderBottom:'2px solid #94a3b8'}:{}} onClick={()=>setTab('acquisti')}>🧾 Acquisti ({purchases.length})</button>
        </div>

        <div className="toolbar">
          <button className={`btn btn-voice ${isRec?'is-rec':''}`} onClick={toggleRec} disabled={aibusy&&!isRec}>{isRec?'⏹ Stop':aibusy?'◌…':'🎙 Voce'}</button>
          <label className="btn btn-ocr" style={{cursor:'pointer'}}>📷 OCR<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)handleOCR(f)}}/></label>
          <button className="btn btn-add" onClick={()=>{setShowForm(v=>!v);setShowItemForm(false)}}>{showForm?'— Chiudi':'＋ Spesa'}</button>
          <button className="btn btn-item" onClick={()=>{setShowItemForm(v=>!v);setShowForm(false)}}>{showItemForm?'— Chiudi':'🧾 Aggiungi acquisto'}</button>
        </div>

        {showForm&&<form className="inline-form" onSubmit={onSubmit}>
          <div className="form-row">
            <div className="form-field"><label className="form-label">Punto vendita</label><input className="form-input" value={form.store} onChange={e=>setForm(f=>({...f,store:e.target.value}))} placeholder="Farmacia, ENI, Parrucchiere…" required/></div>
            <div className="form-field"><label className="form-label">Data</label><input type="date" className="form-input" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-field"><label className="form-label">Descrizione</label><input className="form-input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Medicinali, taglio capelli…"/></div>
            <div className="form-field"><label className="form-label">€ Importo</label><input type="number" step="0.01" className="form-input" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} required/></div>
          </div>
          <button type="submit" className="btn btn-save" style={{alignSelf:'flex-start'}}>✓ Salva</button>
        </form>}

        {showItemForm&&<form className="inline-form" onSubmit={onAddItem}>
          <div className="form-row">
            <div className="form-field"><label className="form-label">Articolo / Servizio</label><input className="form-input" value={itemForm.name} onChange={e=>setItemForm(f=>({...f,name:e.target.value}))} placeholder="Tachipirina, Taglio capelli, Carburante…" required/></div>
            <div className="form-field"><label className="form-label">€ Prezzo</label><input type="number" step="0.01" className="form-input" value={itemForm.price} onChange={e=>setItemForm(f=>({...f,price:e.target.value}))} required/></div>
          </div>
          <div className="form-row">
            <div className="form-field"><label className="form-label">Negozio</label><input className="form-input" value={itemForm.store} onChange={e=>setItemForm(f=>({...f,store:e.target.value}))} placeholder="Farmacia Rossi, ENI…"/></div>
            <div className="form-field"><label className="form-label">Data</label><input type="date" className="form-input" value={itemForm.date} onChange={e=>setItemForm(f=>({...f,date:e.target.value}))}/></div>
          </div>
          <button type="submit" className="btn btn-save" style={{alignSelf:'flex-start',borderColor:'rgba(148,163,184,.4)',color:'#94a3b8'}}>✓ Aggiungi</button>
        </form>}

        {err&&<div className="err-box">{err}<button onClick={()=>setErr(null)}>✕</button></div>}
        {aibusy&&<div className="ai-bar"><span className="ai-dot"/>Elaboro…</div>}

        {tab==='spese'&&<div className="list-body">
          {loading?<div className="skeleton-rows"><div className="skeleton-row"/><div className="skeleton-row"/></div>:
           expenses.length===0?<div className="list-empty">Nessuna spesa varia registrata</div>:
           expenses.map(exp=><div key={exp.id} className="exp-block">
             <div className="exp-row" onClick={()=>loadDetail(exp.id)}>
               <div className="exp-left">
                 <div style={{display:'flex',alignItems:'center',gap:'.4rem'}}>
                   <span style={{fontSize:'1rem'}}>{icon(exp.store||exp.description||'')}</span>
                   <span className="exp-store" style={{color:'#94a3b8'}}>{exp.store||'—'}</span>
                 </div>
                 {exp.description&&<span className="exp-addr">{exp.description}</span>}
                 <span className="exp-date">{exp.purchase_date}</span>
               </div>
               <div className="exp-right">
                 <span className="exp-amt" style={{color:'#94a3b8'}}>{eur(exp.amount)}</span>
                 <span className="exp-chev">{expanded===exp.id?'▲':'▼'}</span>
                 <button className="del-x" onClick={e=>{e.stopPropagation();supabase.from('expenses').delete().eq('id',exp.id);setExpenses(ex=>ex.filter(r=>r.id!==exp.id))}}>✕</button>
               </div>
             </div>
             {expanded===exp.id&&<div className="exp-detail">
               {receiptsMap[exp.id]?.items?.length>0?(<>
                 <div className="detail-label">🧾 Articoli</div>
                 <div className="items-list">
                   {receiptsMap[exp.id].items.map(it=><div key={it.id} className="it-row">
                     <span className="it-name">{it.name}{it.brand&&<em> · {it.brand}</em>}</span>
                     <span className="it-price" style={{color:'#94a3b8'}}>{eur(it.price)}</span>
                   </div>)}
                 </div>
               </>):receiptsMap[exp.id]?<div className="detail-empty">Nessun dettaglio</div>:<div className="detail-empty">Caricamento…</div>}
             </div>}
           </div>)}
        </div>}

        {tab==='acquisti'&&<div className="list-body">
          {purchases.length===0?<div className="list-empty">Nessun acquisto registrato</div>:
           purchases.map(p=><div key={p.id} className="purchase-row">
             <div className="pur-icon">{icon(p.name||p.store||'')}</div>
             <div className="pur-info">
               <span className="pur-name">{p.name}</span>
               {p.brand&&<span className="pur-brand">{p.brand}</span>}
               {p.description&&<span className="pur-desc">{p.description}</span>}
             </div>
             <div className="pur-meta">
               <span className="pur-price" style={{color:'#94a3b8'}}>{eur(p.price)}</span>
               {p.store&&<span className="pur-store">@ {p.store}</span>}
               <span className="pur-date">{p.purchase_date}</span>
             </div>
             <button className="del-x" onClick={()=>{supabase.from('purchase_items').delete().eq('id',p.id);setPurchases(px=>px.filter(r=>r.id!==p.id))}}>✕</button>
           </div>)}
        </div>}
      </div>
    </PageShell>
  )
}

export default withAuth(Varie)
export async function getServerSideProps(){return{props:{}}}