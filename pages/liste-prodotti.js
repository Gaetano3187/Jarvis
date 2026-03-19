// pages/liste-prodotti.js
import React,{useEffect,useRef,useState} from 'react'
import Head from 'next/head'
import Link from 'next/link'
import {Pencil,Trash2} from 'lucide-react'

const GROCERY_LEXICON=['latte','latte zymil','yogurt','burro','uova','mozzarella','parmigiano','pane','pasta','riso','farina','zucchero','olio evo','olio di semi','aceto','passata di pomodoro','pelati','tonno in scatola','piselli','fagioli','biscotti','merendine','fette biscottate','marmellata','nutella','caffè','acqua naturale','acqua frizzante','birra','vino','detersivo lavatrice','pods lavatrice','ammorbidente','candeggina','detersivo piatti','pastiglie lavastoviglie','carta igienica','carta casa','sacchi spazzatura','mele','banane','arance','limoni','zucchine','melanzane','pomodori','patate']
const LIST_TYPES={SUPERMARKET:'supermercato',ONLINE:'online'}
const DEBUG=false
let __supabase=null

function normKey(str){return String(str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s{2,}/g,' ').trim()}
function toISODate(any){const s=String(any||'').trim();if(!s)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const n=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);if(n){const d=String(n[1]).padStart(2,'0'),M=String(n[2]).padStart(2,'0');let y=String(n[3]);if(y.length===2)y=(Number(y)>=70?'19':'20')+y;return`${y}-${M}-${d}`}return''}

const LS_KEY='jarvis_liste_prodotti@v2'
function loadCached(){try{const r=typeof window!=='undefined'?localStorage.getItem(LS_KEY):null;if(!r)return null;return JSON.parse(r)}catch{return null}}
function saveCache(lists,cl){try{if(typeof window==='undefined')return;localStorage.setItem(LS_KEY,JSON.stringify({lists,currentList:cl,at:Date.now()}))}catch{}}

export default function ListeProdotti(){
  const[currentList,setCurrentList]=useState(LIST_TYPES.SUPERMARKET)
  const[lists,setLists]=useState({[LIST_TYPES.SUPERMARKET]:[],[LIST_TYPES.ONLINE]:[]})
  const[stock,setStock]=useState([])
  const[critical,setCritical]=useState([])
  const[busy,setBusy]=useState(false)
  const[toast,setToast]=useState(null)
  const[form,setForm]=useState({name:'',brand:'',packs:'1',unitsPerPack:'1',unitLabel:'pz'})
  const[showListForm,setShowListForm]=useState(false)
  const[editingRow,setEditingRow]=useState(null)
  const[editDraft,setEditDraft]=useState({name:'',brand:'',packs:'1',unitsPerPack:'1',unitLabel:'pz',expiresAt:''})
  const userIdRef=useRef(null)
  const ocrInputRef=useRef(null)
  const rowImageInputRef=useRef(null)
  const[targetImageIdx,setTargetImageIdx]=useState(null)
  const mediaRecRef=useRef(null),recordedChunks=useRef([]),streamRef=useRef(null)
  const[recBusy,setRecBusy]=useState(false)

  function showToast(msg,type='ok'){setToast({msg,type});setTimeout(()=>setToast(null),2500)}

  /* ── INIT ── */
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const cached=loadCached()
      if(cached?.lists){setLists({[LIST_TYPES.SUPERMARKET]:Array.isArray(cached.lists[LIST_TYPES.SUPERMARKET])?cached.lists[LIST_TYPES.SUPERMARKET]:[],[LIST_TYPES.ONLINE]:Array.isArray(cached.lists[LIST_TYPES.ONLINE])?cached.lists[LIST_TYPES.ONLINE]:[]})}
      if(cached?.currentList)setCurrentList(cached.currentList)
      try{
        const mod=await import('../lib/supabaseClient').catch(()=>null)
        if(!mod?.supabase)return
        __supabase=mod.supabase
        const{data:{user}}=await __supabase.auth.getUser()
        const uid=user?.id||null
        if(!mounted||!uid)return
        userIdRef.current=uid
        // Liste
        const{data:cl,error:le}=await __supabase.from('shopping_list').select('id,name,brand,qty,units_per_pack,unit_label,list_type,purchased').eq('user_id',uid).eq('purchased',false).order('added_at',{ascending:true})
        if(!le&&Array.isArray(cl)&&mounted){
          const nl={[LIST_TYPES.SUPERMARKET]:cl.filter(r=>r.list_type===LIST_TYPES.SUPERMARKET),[LIST_TYPES.ONLINE]:cl.filter(r=>r.list_type===LIST_TYPES.ONLINE)}
          setLists(nl);saveCache(nl,currentList)
        }
        // Scorte
        const{data:iv,error:ie}=await __supabase.from('inventory').select('id,product_name,brand,category,qty,initial_qty,packs,unit,units_per_pack,unit_label,expiry_date,avg_price,consumed_pct,image_url').eq('user_id',uid).order('product_name',{ascending:true})
        if(!ie&&Array.isArray(iv)&&mounted){
          setStock(iv.map(r=>({id:r.id,name:r.product_name,brand:r.brand||'',category:r.category||'alimentari',qty:Number(r.qty||1),packs:Number(r.packs||r.qty||1),initialPacks:Number(r.initial_qty||1),unitsPerPack:Number(r.units_per_pack||1),unitLabel:r.unit_label||r.unit||'pz',expiresAt:r.expiry_date||'',priceEach:Number(r.avg_price||0),consumedPct:Number(r.consumed_pct||0),imageUrl:r.image_url||null,image_search_query:`${r.brand||''} ${r.product_name}`.trim()})))
        }
      }catch(e){if(DEBUG)console.warn('[init]',e)}
    })()
    return()=>{mounted=false}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  const cacheTimer=useRef(null)
  useEffect(()=>{if(cacheTimer.current)clearTimeout(cacheTimer.current);cacheTimer.current=setTimeout(()=>saveCache(lists,currentList),500);return()=>clearTimeout(cacheTimer.current)},[lists,currentList])

  /* ── CRITICI ── */
  useEffect(()=>{
    const today=new Date()
    const crit=stock.filter(p=>{
      const tot=Number(p.qty||p.packs||0),ini=Number(p.initialPacks||tot||1)
      const pct=ini>0?tot/ini:1
      const expSoon=p.expiresAt&&!isNaN(new Date(p.expiresAt).getTime())&&Math.floor((new Date(p.expiresAt)-today)/86400000)<=10
      return pct<0.20||expSoon
    }).map(p=>{
      const tot=Number(p.qty||p.packs||0),ini=Number(p.initialPacks||tot||1)
      return{...p,_pct:ini>0?Math.round((tot/ini)*100):0,_giorni:p.expiresAt?Math.floor((new Date(p.expiresAt)-today)/86400000):null}
    })
    setCritical(crit)
  },[stock])

  /* ── LISTE ── */
  async function addManualItem(e){
    e.preventDefault()
    const name=form.name.trim();if(!name)return
    const brand=form.brand.trim(),qty=Math.max(1,Number(form.packs)||1),upp=Math.max(1,Number(form.unitsPerPack)||1),ul=form.unitLabel.trim()||'pz'
    let newId='tmp-'+Math.random().toString(36).slice(2)
    if(__supabase&&userIdRef.current){
      try{const{data,error}=await __supabase.from('shopping_list').insert([{user_id:userIdRef.current,name,brand:brand||null,qty,units_per_pack:upp,unit_label:ul,list_type:currentList,purchased:false,added_at:new Date().toISOString()}]).select('id').single()
      if(!error&&data?.id)newId=data.id}catch(err){if(DEBUG)console.warn('[add]',err)}
    }
    setLists(prev=>{const items=[...(prev[currentList]||[])];const idx=items.findIndex(i=>normKey(i.name)===normKey(name)&&normKey(i.brand||'')===normKey(brand));if(idx>=0)items[idx]={...items[idx],qty:Number(items[idx].qty||0)+qty};else items.push({id:newId,name,brand,qty,unitsPerPack:upp,unitLabel:ul,purchased:false});return{...prev,[currentList]:items}})
    setForm({name:'',brand:'',packs:'1',unitsPerPack:'1',unitLabel:'pz'});setShowListForm(false)
  }

  async function removeItem(id){
    if(__supabase&&userIdRef.current&&!String(id).startsWith('tmp-')){
      try{const{error}=await __supabase.from('shopping_list').delete().eq('id',id).eq('user_id',userIdRef.current);if(error){showToast('Errore: '+error.message,'err');return}}catch(err){showToast('Errore di rete','err');return}
    }
    setLists(prev=>({...prev,[currentList]:(prev[currentList]||[]).filter(i=>i.id!==id)}))
  }

  async function incQty(id,delta){
    setLists(prev=>{const items=(prev[currentList]||[]).map(i=>i.id!==id?i:{...i,qty:Math.max(0,Number(i.qty||0)+delta)}).filter(i=>i.qty>0);return{...prev,[currentList]:items}})
    if(__supabase&&userIdRef.current&&!String(id).startsWith('tmp-')){
      const item=lists[currentList]?.find(i=>i.id===id)
      if(item){const nq=Math.max(0,Number(item.qty||0)+delta);if(nq<=0)await __supabase.from('shopping_list').delete().eq('id',id).eq('user_id',userIdRef.current);else await __supabase.from('shopping_list').update({qty:nq}).eq('id',id).eq('user_id',userIdRef.current)}
    }
  }

  /* ── EDIT SCORTE ── */
  function startRowEdit(idx,row){setEditingRow(idx);setEditDraft({name:row.name||'',brand:row.brand||'',packs:String(row.packs??1),unitsPerPack:String(row.unitsPerPack??1),unitLabel:row.unitLabel||'pz',expiresAt:row.expiresAt||''})}
  function cancelRowEdit(){setEditingRow(null)}

  async function saveRowEdit(idx){
    const row=stock[idx],name=editDraft.name.trim()
    const newPacks=Math.max(0,Number(editDraft.packs)||0),newUpp=Math.max(1,Number(editDraft.unitsPerPack)||1)
    const expiry=toISODate(editDraft.expiresAt||'')
    setStock(prev=>{const arr=[...prev];arr[idx]={...arr[idx],name,brand:editDraft.brand.trim(),packs:newPacks,unitsPerPack:newUpp,unitLabel:editDraft.unitLabel,expiresAt:expiry};return arr})
    if(__supabase&&userIdRef.current&&row?.id){
      try{await __supabase.from('inventory').update({product_name:name,qty:newPacks,units_per_pack:newUpp,unit_label:editDraft.unitLabel,expiry_date:expiry||null}).eq('id',row.id).eq('user_id',userIdRef.current)}catch(err){if(DEBUG)console.warn('[saveEdit]',err)}
    }
    setEditingRow(null)
  }

  async function deleteStockRow(idx){
    const row=stock[idx]
    if(__supabase&&userIdRef.current&&row?.id)try{await __supabase.from('inventory').delete().eq('id',row.id).eq('user_id',userIdRef.current)}catch{}
    setStock(prev=>prev.filter((_,i)=>i!==idx))
  }

  /* ── OCR ── */
  async function handleOCR(files){
    if(!files?.length||busy)return;setBusy(true)
    try{
      const fd=new FormData();fd.append('image',files[0],files[0].name||'receipt.jpg')
      const r=await fetch('/api/ocr-universal',{method:'POST',body:fd})
      if(!r.ok)throw new Error(`HTTP ${r.status}`)
      const data=await r.json()
      if(!data.ok&&data.doc_type==='unknown')throw new Error('Documento non riconoscibile')
      const items=Array.isArray(data.items)?data.items:[]
      if(!items.length){showToast('Nessun prodotto riconosciuto','err');return}
      if(__supabase&&userIdRef.current){
        const uid=userIdRef.current,today=new Date().toISOString().slice(0,10)
        for(const item of items){
          if(!item.name)continue
          const{data:ex}=await __supabase.from('inventory').select('id,qty').eq('user_id',uid).ilike('product_name',`%${item.name.split(' ')[0]}%`).maybeSingle()
          if(ex)await __supabase.from('inventory').update({qty:Number(ex.qty||0)+Number(item.qty||1),initial_qty:Number(ex.qty||0)+Number(item.qty||1),consumed_pct:0,avg_price:item.unit_price||0,last_updated:new Date().toISOString(),...(item.expiry_date?{expiry_date:item.expiry_date}:{})}).eq('id',ex.id)
          else await __supabase.from('inventory').insert({user_id:uid,product_name:item.name,brand:item.brand||null,category:item.category_item||'alimentari',qty:Number(item.qty||1),initial_qty:Number(item.qty||1),packs:item.packs||1,units_per_pack:item.units_per_pack||1,unit_label:item.unit_per_pack_label||item.unit||'pz',unit:item.unit||'pz',avg_price:item.unit_price||0,purchase_date:today,expiry_date:item.expiry_date||null,consumed_pct:0})
        }
        const{data:iv}=await __supabase.from('inventory').select('id,product_name,brand,category,qty,initial_qty,packs,unit,units_per_pack,unit_label,expiry_date,avg_price,consumed_pct,image_url').eq('user_id',uid).order('product_name',{ascending:true})
        if(Array.isArray(iv))setStock(iv.map(r=>({id:r.id,name:r.product_name,brand:r.brand||'',category:r.category||'alimentari',qty:Number(r.qty||1),packs:Number(r.packs||r.qty||1),initialPacks:Number(r.initial_qty||1),unitsPerPack:Number(r.units_per_pack||1),unitLabel:r.unit_label||r.unit||'pz',expiresAt:r.expiry_date||'',priceEach:Number(r.avg_price||0),consumedPct:Number(r.consumed_pct||0),imageUrl:r.image_url||null,image_search_query:`${r.brand||''} ${r.product_name}`.trim()})))
      }
      showToast(`✓ ${items.length} prodotti aggiornati`,'ok')
    }catch(e){showToast('OCR: '+e.message,'err')}
    finally{setBusy(false);if(ocrInputRef.current)ocrInputRef.current.value=''}
  }

  /* ── VOCALE ── */
  function pickMime(){if(typeof window==='undefined'||!window.MediaRecorder)return'audio/webm';for(const t of['audio/webm;codecs=opus','audio/webm','audio/mp4'])try{if(MediaRecorder.isTypeSupported(t))return t}catch{}return''}
  async function toggleRec(){
    if(recBusy){try{mediaRecRef.current?.requestData?.();mediaRecRef.current?.stop()}catch{}return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true})
      streamRef.current=stream;recordedChunks.current=[]
      const mime=pickMime();mediaRecRef.current=new MediaRecorder(stream,mime?{mimeType:mime}:undefined)
      mediaRecRef.current.ondataavailable=e=>{if(e.data?.size>0)recordedChunks.current.push(e.data)}
      mediaRecRef.current.onstop=async()=>{
        try{
          streamRef.current?.getTracks?.().forEach(t=>t.stop());setRecBusy(false)
          const blob=new Blob(recordedChunks.current,{type:'audio/webm'});recordedChunks.current=[]
          const fd=new FormData();fd.append('audio',blob,'list.webm');setBusy(true)
          const r=await fetch('/api/stt',{method:'POST',body:fd})
          const js=await r.json().catch(()=>({}));const text=String(js?.text||'').trim()
          if(!text)throw new Error('Testo non riconosciuto')
          const resp=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:`Sei Jarvis. Capisci una LISTA DI SPESA dal parlato. RISPONDI SOLO JSON:\n{"items":[{"name":"","brand":"","qty":1,"unitsPerPack":1,"unitLabel":"pz"}]}\nLessico: ${GROCERY_LEXICON.join(', ')}\nTesto: ${text}`})})
          const safe=await resp.json().catch(()=>({}));const answer=safe?.answer||'{}'
          const parsed=typeof answer==='string'?JSON.parse(answer):answer;const items=Array.isArray(parsed?.items)?parsed.items:[]
          if(!items.length){showToast('Nessuna voce riconosciuta','err');return}
          for(const raw of items){
            const name=String(raw.name||'').trim();if(!name)continue
            const brand=String(raw.brand||'').trim(),qty=Math.max(1,Number(raw.qty||1))
            let newId='tmp-'+Math.random().toString(36).slice(2)
            if(__supabase&&userIdRef.current){const{data,error}=await __supabase.from('shopping_list').insert([{user_id:userIdRef.current,name,brand:brand||null,qty,units_per_pack:Number(raw.unitsPerPack||1),unit_label:raw.unitLabel||'pz',list_type:currentList,purchased:false,added_at:new Date().toISOString()}]).select('id').single();if(!error&&data?.id)newId=data.id}
            setLists(prev=>{const arr=[...(prev[currentList]||[])];const idx=arr.findIndex(i=>normKey(i.name)===normKey(name));if(idx>=0)arr[idx]={...arr[idx],qty:Number(arr[idx].qty||0)+qty};else arr.push({id:newId,name,brand,qty,unitsPerPack:Number(raw.unitsPerPack||1),unitLabel:raw.unitLabel||'pz',purchased:false});return{...prev,[currentList]:arr}})
          }
          showToast('Lista aggiornata da voce ✓','ok')
        }catch(e){showToast('Errore vocale: '+e.message,'err')}
        finally{setBusy(false);mediaRecRef.current=null;streamRef.current=null}
      }
      mediaRecRef.current.start(250);setRecBusy(true)
    }catch{showToast('Microfono non disponibile','err')}
  }

  function handleRowImage(files,idx){
    const file=files?.[0];if(!file)return
    const reader=new FileReader()
    reader.onload=()=>{const dataUrl=String(reader.result||'');setStock(prev=>{const arr=[...prev];if(!arr[idx])return prev;arr[idx]={...arr[idx],image:dataUrl};return arr});showToast('Immagine aggiornata ✓','ok')}
    reader.readAsDataURL(file)
  }

  /* ── RENDER ── */
  return(<>
    <Head><title>Lista Prodotti – Jarvis</title></Head>
    <div className="pw"><div className="pi">

      <div className="ph"><div className="pl">JARVIS</div><div className="pp">Liste & Scorte</div></div>

      {/* KPI */}
      <div className="ks">
        <div className="kc"><div className="kl">Lista Supermercato</div><div className="kv" style={{color:'#22d3ee'}}>{lists[LIST_TYPES.SUPERMARKET]?.length||0}</div></div>
        <div className="kc"><div className="kl">Lista Online</div><div className="kv" style={{color:'#818cf8'}}>{lists[LIST_TYPES.ONLINE]?.length||0}</div></div>
        <div className="kc"><div className="kl">Scorte</div><div className="kv" style={{color:'#22c55e'}}>{stock.length}</div></div>
        {critical.length>0&&<div className="kc" style={{borderColor:'rgba(239,68,68,.3)'}}><div className="kl">Alert scorte</div><div className="kv" style={{color:'#f87171'}}>{critical.length}</div></div>}
      </div>

      {/* ═══ SEZ LISTA ═══ */}
      <div className="mc">
        <div className="sh">
          <span className="st">🛒 Lista della spesa</span>
        </div>

        {/* Switch tipo lista */}
        <div className="list-switch">
          {[LIST_TYPES.SUPERMARKET,LIST_TYPES.ONLINE].map(lt=>(
            <button key={lt} className={`ls-btn ${currentList===lt?'ls-active':''}`} onClick={()=>setCurrentList(lt)}>
              {lt===LIST_TYPES.SUPERMARKET?'🛒 Supermercato':'🌐 Online'}
            </button>
          ))}
        </div>

        {/* Toolbar lista */}
        <div className="tl">
          <button className={`bn bn-v ${recBusy?'bn-rec':''} ${busy&&!recBusy?'bn-off':''}`} onClick={toggleRec} disabled={busy&&!recBusy}>
            {recBusy?<svg width="14" height="14" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="#f87171"/></svg>:<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="2"/><path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
            {recBusy?'Stop':'Voce'}
          </button>
          <button className="bn bn-a" onClick={()=>setShowListForm(v=>!v)}>{showListForm?'— Chiudi':'＋ Aggiungi'}</button>
        </div>

        {showListForm&&<form className="ef" onSubmit={addManualItem}>
          <div className="fr">
            <div className="ff"><label className="fl">Prodotto</label><input className="fi" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Es: Latte Zymil" required/></div>
            <div className="ff"><label className="fl">Marca</label><input className="fi" value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} placeholder="Opzionale"/></div>
          </div>
          <div className="fr">
            <div className="ff"><label className="fl">Qtà</label><input type="number" className="fi" value={form.packs} onChange={e=>setForm(f=>({...f,packs:e.target.value}))} min="1" required/></div>
            <div className="ff"><label className="fl">Unità</label><input className="fi" value={form.unitLabel} onChange={e=>setForm(f=>({...f,unitLabel:e.target.value}))} placeholder="pz / kg / l"/></div>
          </div>
          <button type="submit" className="bn bn-s" disabled={busy}>✓ Aggiungi</button>
        </form>}

        {/* Lista items */}
        <div className="lb">
          {(lists[currentList]||[]).length===0
            ?<div className="le">Lista vuota — aggiungi prodotti con voce o manualmente</div>
            :(lists[currentList]||[]).map(it=>(
              <div key={it.id} className="list-row">
                <div className="list-info">
                  <span className="list-name">{it.name}{it.brand&&<em className="list-brand"> · {it.brand}</em>}</span>
                  <span className="list-qty">
                    {Number(it.units_per_pack||it.unitsPerPack||1)>1
                      ?`${it.qty} conf. × ${it.units_per_pack||it.unitsPerPack} ${it.unit_label||it.unitLabel||'pz'}`
                      :`${it.qty} ${it.unit_label||it.unitLabel||'pz'}`
                    }
                  </span>
                </div>
                <div className="list-actions">
                  <button className="qty-btn" onClick={()=>incQty(it.id,-1)}>−</button>
                  <button className="qty-btn" onClick={()=>incQty(it.id,+1)}>+</button>
                  <button className="del-btn" onClick={()=>removeItem(it.id)}>✕</button>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* ═══ SEZ SCORTE CRITICHE ═══ */}
      {critical.length>0&&<div className="mc" style={{borderColor:'rgba(239,68,68,.25)'}}>
        <div className="sh"><span className="st">⚠️ Scorte critiche</span><span className="ss">{critical.length} prodotti</span></div>
        <div className="lb">
          {critical.map((s,i)=>{
            const isLow=s._pct<20,isExp=s._giorni!==null&&s._giorni<=10
            return<div key={i} className="crit-row">
              <div className="crit-info">
                <span className="crit-name">{s.name}{s.brand&&<em className="list-brand"> · {s.brand}</em>}</span>
                <div className="crit-chips">
                  {isLow&&<span className="chip chip-red">📉 {s._pct}% rimasto</span>}
                  {isExp&&s._giorni<=0&&<span className="chip chip-red">❌ Scaduto</span>}
                  {isExp&&s._giorni>0&&<span className="chip chip-yellow">⏰ Scade in {s._giorni} {s._giorni===1?'giorno':'giorni'}</span>}
                </div>
              </div>
              <div className="crit-bar">
                <div className="crit-fill" style={{width:`${Math.min(100,s._pct)}%`,background:s._pct<10?'#ef4444':'#f59e0b'}}/>
              </div>
              <button className="del-btn" style={{color:'#f87171'}} onClick={()=>{const idx=stock.findIndex(ss=>ss.id===s.id);if(idx>=0)deleteStockRow(idx)}}>✕</button>
            </div>
          })}
        </div>
      </div>}

      {/* ═══ SEZ TUTTE LE SCORTE ═══ */}
      <div className="mc">
        <div className="sh">
          <span className="st">📦 Tutte le scorte ({stock.length})</span>
          <label className="bn bn-o" style={{cursor:'pointer'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2"/></svg>
            OCR
            <input ref={ocrInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=Array.from(e.target.files||[]);e.target.value='';if(f.length)handleOCR(f)}}/>
          </label>
        </div>
        <div className="lb">
          {stock.length===0
            ?<div className="le">Nessuna scorta — scansiona uno scontrino per popolare la dispensa</div>
            :stock.map((s,idx)=>{
              const upp=Number(s.unitsPerPack||1),tot=Number(s.qty||s.packs||1),packs=Number(s.packs||1)
              const pct=s.initialPacks>0?Math.round((tot/s.initialPacks)*100):100
              const showBrk=upp>1&&packs>0&&tot!==packs
              return<div key={s.id||idx} className={`stock-row ${idx%2===0?'stock-even':'stock-odd'}`}>
                {editingRow===idx?(
                  <div>
                    <div className="fr">
                      <div className="ff"><label className="fl">Nome</label><input className="fi" value={editDraft.name} onChange={e=>setEditDraft(d=>({...d,name:e.target.value}))} placeholder="Nome prodotto"/></div>
                      <div className="ff"><label className="fl">Marca</label><input className="fi" value={editDraft.brand} onChange={e=>setEditDraft(d=>({...d,brand:e.target.value}))} placeholder="Marca"/></div>
                    </div>
                    <div className="fr">
                      <div className="ff"><label className="fl">N. confezioni</label><input type="number" className="fi" value={editDraft.packs} onChange={e=>setEditDraft(d=>({...d,packs:e.target.value}))}/></div>
                      <div className="ff"><label className="fl">Unità/conf.</label><input type="number" className="fi" value={editDraft.unitsPerPack} onChange={e=>setEditDraft(d=>({...d,unitsPerPack:e.target.value}))}/></div>
                      <div className="ff"><label className="fl">Unità</label><input className="fi" value={editDraft.unitLabel} onChange={e=>setEditDraft(d=>({...d,unitLabel:e.target.value}))} placeholder="pz/kg/l"/></div>
                      <div className="ff"><label className="fl">Scadenza</label><input type="date" className="fi" value={editDraft.expiresAt} onChange={e=>setEditDraft(d=>({...d,expiresAt:e.target.value}))}/></div>
                    </div>
                    <div style={{display:'flex',gap:8,marginTop:8}}>
                      <button className="bn bn-s" onClick={()=>saveRowEdit(idx)}>✓ Salva</button>
                      <button className="bn" style={{borderColor:'rgba(255,255,255,.15)',color:'#94a3b8'}} onClick={cancelRowEdit}>Annulla</button>
                    </div>
                  </div>
                ):(
                  <div className="stock-inner">
                    <div className="stock-img" onClick={()=>{setTargetImageIdx(idx);rowImageInputRef.current?.click()}} title="Cambia immagine">
                      {s.imageUrl||s.image?<img src={s.imageUrl||s.image} alt={s.name} className="stock-thumb" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='grid'}}/>:null}
                      <div className="stock-placeholder" style={{display:(s.imageUrl||s.image)?'none':'grid'}}>📦</div>
                    </div>
                    <div className="stock-data">
                      <div className="stock-title">{s.name}{s.brand&&<em className="list-brand"> · {s.brand}</em>}</div>
                      <div className="stock-bar-wrap"><div className="stock-bar" style={{width:`${pct}%`,background:pct>60?'#22c55e':pct>30?'#f59e0b':'#ef4444'}}/></div>
                      <div className="stock-meta">
                        {showBrk
                          ?<span className="stock-qty">{packs} conf. × {upp} {s.unitLabel} = <strong>{tot} {s.unitLabel}</strong></span>
                          :<span className="stock-qty"><strong>{tot} {s.unitLabel}</strong></span>
                        }
                        {s.expiresAt&&<span className="stock-exp">⏰ {new Date(s.expiresAt).toLocaleDateString('it-IT')}</span>}
                        {s.priceEach>0&&<span className="stock-price">€{s.priceEach.toFixed(2)}/cad</span>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      <button className="bn" style={{padding:'.3rem .55rem',borderColor:'rgba(255,255,255,.15)',color:'#94a3b8'}} onClick={()=>startRowEdit(idx,s)} title="Modifica"><Pencil size={14}/></button>
                      <button className="bn" style={{padding:'.3rem .55rem',borderColor:'rgba(239,68,68,.2)',color:'#f87171'}} onClick={()=>deleteStockRow(idx)} title="Elimina"><Trash2 size={14}/></button>
                    </div>
                  </div>
                )}
              </div>
            })
          }
        </div>
      </div>

      <div style={{textAlign:'center',paddingTop:'.5rem'}}>
        <Link href="/home" style={{color:'rgba(100,116,139,.5)',fontSize:'.75rem'}}>← Home</Link>
      </div>

    </div></div>

    {/* Toast */}
    {toast&&<div className={`toast ${toast.type==='ok'?'toast-ok':'toast-err'}`}>{toast.msg}</div>}

    <input ref={rowImageInputRef} type="file" accept="image/*" style={{display:'none'}}
      onChange={e=>{const f=Array.from(e.target.files||[]);e.target.value='';if(f.length&&typeof targetImageIdx==='number'){handleRowImage(f,targetImageIdx);setTargetImageIdx(null)}}}/>

    <style jsx global>{CSS}</style>
  </>)
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
  .ir{display:flex;align-items:center;gap:.5rem;font-size:.76rem;padding:.24rem 0;border-bottom:1px solid rgba(255,255,255,.03);flex-wrap:wrap}
  .iname{flex:1;color:#cbd5e1;min-width:100px}
  .iname em{color:rgba(100,116,139,.6);font-style:normal}
  .iqty{color:rgba(100,116,139,.55);font-size:.69rem;white-space:nowrap}
  .ipr{font-weight:600;white-space:nowrap;margin-left:auto}
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
  .dr{display:flex;align-items:center;gap:.65rem;padding:.62rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.04);transition:background .12s}
  .dr:hover{background:rgba(255,255,255,.02)}
  .dra{border-left:2px solid rgba(239,68,68,.3)}
  .dinfo{flex:1;display:flex;flex-direction:column;gap:.08rem;min-width:0}
  .dname{font-size:.84rem;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dtag{font-size:.68rem;color:rgba(100,116,139,.55)}
  .dmeta{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;flex-shrink:0}
  .dqty{font-size:.77rem;color:#22d3ee;font-weight:600}
  .dprice{font-size:.69rem;color:rgba(100,116,139,.55)}
  .dexp{font-size:.66rem;color:#fbbf24}
  .dpct{font-size:.66rem;color:#f87171}

  /* ── Liste Prodotti extra ── */
  .list-switch{display:flex;border-bottom:1px solid rgba(255,255,255,.05)}
  .ls-btn{flex:1;padding:.65rem;background:none;border:none;color:rgba(100,116,139,.6);font-size:.78rem;font-family:Inter,sans-serif;font-weight:600;cursor:pointer;transition:color .14s,background .14s}
  .ls-btn:hover{color:#e2e8f0;background:rgba(255,255,255,.03)}
  .ls-active{color:#22d3ee!important;border-bottom:2px solid #22d3ee;background:rgba(34,211,238,.04)!important}

  /* Lista items */
  .list-row{display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.65rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.04);transition:background .12s}
  .list-row:hover{background:rgba(255,255,255,.025)}
  .list-info{display:flex;flex-direction:column;gap:.1rem;flex:1;min-width:0}
  .list-name{font-size:.88rem;font-weight:600;color:#e2e8f0}
  .list-brand{color:rgba(100,116,139,.6);font-style:normal;font-weight:400}
  .list-qty{font-size:.7rem;color:rgba(100,116,139,.55)}
  .list-actions{display:flex;gap:.35rem;align-items:center;flex-shrink:0}
  .qty-btn{width:28px;height:28px;display:grid;place-items:center;border-radius:7px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#e2e8f0;font-size:.95rem;font-weight:700;cursor:pointer;transition:background .12s}
  .qty-btn:hover{background:rgba(255,255,255,.1)}
  .del-btn{background:none;border:1px solid rgba(239,68,68,.18);border-radius:6px;color:rgba(239,68,68,.4);cursor:pointer;padding:.18rem .4rem;font-size:.68rem;transition:all .12s}
  .del-btn:hover{border-color:rgba(239,68,68,.5);color:#f87171;background:rgba(239,68,68,.07)}

  /* Critici */
  .crit-row{display:flex;align-items:center;gap:.75rem;padding:.6rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.04)}
  .crit-info{flex:1;display:flex;flex-direction:column;gap:.25rem;min-width:0}
  .crit-name{font-size:.86rem;font-weight:600;color:#e2e8f0}
  .crit-chips{display:flex;gap:.35rem;flex-wrap:wrap}
  .chip{font-size:.65rem;font-weight:600;padding:.15rem .5rem;border-radius:5px}
  .chip-red{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#fca5a5}
  .chip-yellow{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);color:#fcd34d}
  .crit-bar{width:70px;height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;flex-shrink:0}
  .crit-fill{height:100%;border-radius:3px;transition:width .3s}

  /* Scorte */
  .stock-row{border-bottom:1px solid rgba(255,255,255,.04)}
  .stock-even{background:rgba(255,255,255,.015)}
  .stock-odd{background:transparent}
  .stock-inner{display:grid;grid-template-columns:52px 1fr auto;gap:1rem;align-items:center;padding:.7rem 1.25rem}
  .stock-img{width:52px;height:52px;border-radius:10px;border:1px dashed rgba(255,255,255,.15);overflow:hidden;cursor:pointer;background:rgba(255,255,255,.03);position:relative;flex-shrink:0}
  .stock-thumb{width:100%;height:100%;object-fit:cover;display:block}
  .stock-placeholder{width:100%;height:100%;place-items:center;font-size:1.3rem;color:rgba(255,255,255,.25);display:grid}
  .stock-data{display:flex;flex-direction:column;gap:.25rem;min-width:0}
  .stock-title{font-size:.86rem;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .stock-bar-wrap{height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}
  .stock-bar{height:100%;border-radius:3px;transition:width .3s}
  .stock-meta{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
  .stock-qty{font-size:.72rem;color:rgba(148,163,184,.7)}
  .stock-exp{font-size:.68rem;color:#fbbf24}
  .stock-price{font-size:.68rem;color:rgba(100,116,139,.5)}

  /* Toast */
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:.55rem 1.2rem;border-radius:10px;font-size:.78rem;font-weight:700;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.4);white-space:nowrap}
  .toast-ok{background:#16a34a;color:#fff}
  .toast-err{background:#ef4444;color:#fff}
`

export async function getServerSideProps(){return{props:{}}}