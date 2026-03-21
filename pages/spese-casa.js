// pages/spese-casa.js — VERSIONE MODIFICATA
// Modifiche:
// 1. Tasto ✎ Modifica manuale per ogni spesa
// 2. Fix pagamento carta: solo se ci sono keyword POS/Visa/Bancomat
// 3. Fix scontrino ristorante: riconosce i piatti

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

// ── FIX: Keyword POS per riconoscere pagamento carta ──────────────────
function fixPaymentMethod(paymentMethod, rawText='') {
  if (!paymentMethod || paymentMethod === 'unknown') return 'unknown'
  const cartaKeywords = /\b(visa|mastercard|maestro|bancomat|contactless|pos|pagamento\s+carta|debit|credit|chip|pin|approved|transazione|carta)\b/i
  if (paymentMethod === 'card' || paymentMethod === 'carta') {
    if (cartaKeywords.test(rawText)) return 'card'
    return 'unknown' // scontrino non ha indicazioni POS → non assegnare carta
  }
  return paymentMethod
}

function SpeseCasa(){
  const mr=useRef(null),cr=useRef([]),sr=useRef(null),isRecRef=useRef(false)
  const[expenses,setExpenses]=useState([])
  const[inventory,setInventory]=useState([])
  const[recMap,setRecMap]=useState({})
  const[expanded,setExpanded]=useState(null)
  const[loading,setLoading]=useState(false)
  const[err,setErr]=useState(null)
  const[userId,setUserId]=useState(null)
  const[isRec,setIsRec]=useState(false)
  const[aibusy,setAiBusy]=useState(false)
  const[showForm,setShowForm]=useState(false)
  const[tab,setTab]=useState('spese')
  const[mk,setMk]=useState(()=>clamp(typeof window!=='undefined'?localStorage.getItem('_jv_casa_mk')||toMK():toMK()))
  const[form,setForm]=useState({store:'',description:'',amount:'',date:''})

  // ── NUOVI STATI per modifica inline ────────────────────────────────────
  const[editId,setEditId]=useState(null)
  const[editForm,setEditForm]=useState({store:'',description:'',amount:'',date:''})

  useEffect(()=>{supabase.auth.getUser().then(({data:{user}})=>{if(user){setUserId(user.id);load(user.id)}})},[])
  useEffect(()=>{try{localStorage.setItem('_jv_casa_mk',mk)}catch{}},[mk])
  const{s:si,e:ei}=useMemo(()=>mbounds(mk),[mk])

  async function load(uid){
    setLoading(true);setErr(null)
    try{
      const[ex,iv]=await Promise.all([
        supabase.from('expenses').select('id,store,store_address,amount,purchase_date,description')
          .eq('user_id',uid).eq('category','casa').gte('purchase_date',si).lte('purchase_date',ei).order('purchase_date',{ascending:false}),
        supabase.from('inventory').select('id,product_name,brand,qty,unit_label,avg_price,expiry_date,consumed_pct,store')
          .eq('user_id',uid).order('created_at',{ascending:false})
      ])
      if(ex.error)throw ex.error
      setExpenses(ex.data||[]);if(!iv.error)setInventory(iv.data||[])
    }catch(e){setErr(e.message)}finally{setLoading(false)}
  }

  async function loadDetail(eid){
    const open=expanded===eid;setExpanded(open?null:eid)
    if(open||recMap[eid])return
    try{
      const{data:rec}=await supabase.from('receipts').select('id').eq('expense_id',eid).maybeSingle()
      if(!rec){setRecMap(m=>({...m,[eid]:{items:[]}}));return}
      const{data:items}=await supabase.from('receipt_items').select('id,name,brand,packs,units_per_pack,unit_per_pack_label,qty,unit,unit_price,price,category_item').eq('receipt_id',rec.id).order('price',{ascending:false})
      setRecMap(m=>({...m,[eid]:{items:items||[]}}))
    }catch(e){setErr(e.message)}
  }

  async function onSubmit(e){
    e.preventDefault();setErr(null)
    try{
      const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error()
      await supabase.from('expenses').insert({user_id:user.id,category:'casa',store:form.store,description:form.description||null,amount:parseFloat(form.amount)||0,purchase_date:form.date||iso(),source:'manual'})
      setForm({store:'',description:'',amount:'',date:''});await load(user.id)
    }catch(e){setErr(e.message)}
  }

  // ── NUOVA: salva modifica spesa ─────────────────────────────────────────
  async function onEditSubmit(e,expId){
    e.preventDefault();setErr(null)
    try{
      const{error}=await supabase.from('expenses').update({
        store:editForm.store,
        description:editForm.description||null,
        amount:parseFloat(editForm.amount)||0,
        purchase_date:editForm.date,
      }).eq('id',expId)
      if(error)throw error
      setEditId(null)
      // Aggiorna localmente
      setExpenses(prev=>prev.map(ex=>ex.id===expId?{...ex,store:editForm.store,description:editForm.description||null,amount:parseFloat(editForm.amount)||0,purchase_date:editForm.date}:ex))
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

      // ── FIX payment_method: carta solo se c'è indicazione POS ──────────
      const rawText=data.raw_text||''
      const fixedPayment=fixPaymentMethod(data.payment_method, rawText)

      const{data:{user}}=await supabase.auth.getUser()
      const{data:exp}=await supabase.from('expenses').insert({
        user_id:user.id,category:'casa',store:data.store||'Supermercato',
        store_address:data.store_address||null,amount:parseFloat(data.price_total||0),
        purchase_date:data.purchase_date||iso(),
        payment_method:fixedPayment,  // ← USA VERSIONE CORRETTA
        source:'ocr'
      }).select('id').single()

      if(exp&&data.items?.length){
        const{data:rec}=await supabase.from('receipts').insert({
          user_id:user.id,expense_id:exp.id,store:data.store||'',
          purchase_date:data.purchase_date||iso(),price_total:parseFloat(data.price_total||0),
          payment_method:fixedPayment,confidence:data.confidence||'medium'
        }).select('id').single()
        if(rec){
          await supabase.from('receipt_items').insert(data.items.map(it=>({
            receipt_id:rec.id,user_id:user.id,name:it.name,brand:it.brand||null,
            qty:it.qty||1,unit:it.unit||'pz',unit_price:it.unit_price||0,
            price:it.price||0,category_item:it.category_item||'alimentari',
            purchase_date:data.purchase_date||iso()
          })))
          for(const it of data.items){
            if(!it.name)continue;const tot=Number(it.qty||1)
            const{data:ex2}=await supabase.from('inventory').select('id,qty,initial_qty').eq('user_id',user.id).ilike('product_name',`%${it.name.split(' ')[0]}%`).maybeSingle()
            if(ex2)await supabase.from('inventory').update({qty:Number(ex2.qty||0)+tot,initial_qty:Number(ex2.initial_qty||0)+tot,consumed_pct:0,avg_price:it.unit_price||0}).eq('id',ex2.id)
            else await supabase.from('inventory').insert({user_id:user.id,product_name:it.name,brand:it.brand||null,category:it.category_item||'alimentari',qty:tot,initial_qty:tot,avg_price:it.unit_price||0,purchase_date:data.purchase_date||iso(),consumed_pct:0})
          }
          try{
            const{data:lista}=await supabase.from('shopping_list').select('id,name').eq('user_id',user.id).eq('purchased',false)
            if(lista?.length){
              const ids=[]
              for(const it of data.items){
                if(!it.name)continue
                const k=it.name.split(' ')[0].toLowerCase()
                const m=lista.find(l=>l.name.toLowerCase().includes(k)||k.includes(l.name.toLowerCase().split(' ')[0]))
                if(m&&!ids.includes(m.id))ids.push(m.id)
              }
              if(ids.length)await supabase.from('shopping_list').update({purchased:true}).in('id',ids)
            }
          }catch{}
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
          const r2=await fetch('/api/assistant-v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:`Registra spesa casa: "${j.text}". Azione add_expense category=casa.`,userId,conversationHistory:[]})})
          const d=await r2.json()
          if(d.action?.type==='add_expense'){
            const{data:{user}}=await supabase.auth.getUser()
            await supabase.from('expenses').insert({user_id:user.id,category:'casa',store:d.action.store||'Casa',amount:Number(d.action.amount||0),purchase_date:d.action.date||iso(),source:'voice'})
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

  return(<>
    <Head><title>Casa – Jarvis</title></Head>
    <div className="pw"><div className="pi">
      <div className="ph"><div className="pl">JARVIS</div><div className="pp">{mLabel}</div></div>
      <div className="ks">
        <div className="kc"><div className="kl">Spese Casa</div><div className="kv" style={{color:'#22d3ee'}}>{eur(totale)}</div></div>
        <div className="kc"><div className="kl">N° acquisti</div><div className="kv" style={{color:'#22c55e'}}>{expenses.length}</div></div>
        <div className="kc"><div className="kl">Prodotti dispensa</div><div className="kv" style={{color:'#fbbf24'}}>{inventory.length}</div></div>
      </div>
      <div className="mc">
        <div className="sh"><span className="st">🏠 Spese Casa</span></div>
        <div className="tr">
          <button className="tb" style={tab==='spese'?{color:'#22d3ee',borderBottom:'2px solid #22d3ee'}:{}} onClick={()=>setTab('spese')}>📋 Spese ({expenses.length})</button>
          <button className="tb" style={tab==='dispensa'?{color:'#22d3ee',borderBottom:'2px solid #22d3ee'}:{}} onClick={()=>setTab('dispensa')}>📦 Dispensa ({inventory.length})</button>
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
          <button className="bn bn-a" onClick={()=>setShowForm(v=>!v)}>{showForm?'— Chiudi':'＋ Manuale'}</button>
        </div>
        {showForm&&<form className="ef" onSubmit={onSubmit}>
          <div className="fr">
            <div className="ff"><label className="fl">Punto vendita</label><input className="fi" value={form.store} onChange={e=>setForm(f=>({...f,store:e.target.value}))} placeholder="Orsini, Esselunga…" required/></div>
            <div className="ff"><label className="fl">Data</label><input type="date" className="fi" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
          </div>
          <div className="fr">
            <div className="ff"><label className="fl">Descrizione</label><input className="fi" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Spesa settimanale…"/></div>
            <div className="ff"><label className="fl">€ Importo</label><input type="number" step="0.01" className="fi" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} required/></div>
          </div>
          <button type="submit" className="bn bn-s">✓ Salva</button>
        </form>}
        {err&&<div className="eb">{err}<button onClick={()=>setErr(null)}>✕</button></div>}
        {aibusy&&<div className="ab"><span className="ad"/>Elaboro…</div>}

        {tab==='spese'&&<div className="lb">
          {loading?<div className="sk"><span/><span/><span/></div>:expenses.length===0?<div className="le">Nessuna spesa</div>:
          expenses.map(exp=><div key={exp.id} className="eb2">
            <div className="er" onClick={()=>{if(editId===exp.id)return;loadDetail(exp.id)}}>
              <div className="el">
                <span className="es" style={{color:'#22d3ee'}}>{exp.store||'—'}</span>
                {exp.store_address&&<span className="ea">{exp.store_address}</span>}
                {exp.description&&<span className="ea">{exp.description}</span>}
                <span className="edate">{exp.purchase_date}</span>
              </div>
              <div className="eg">
                <span className="ev" style={{color:'#22c55e'}}>{eur(exp.amount)}</span>
                <span className="ech">{expanded===exp.id&&editId!==exp.id?'▲':'▼'}</span>
                {/* ── TASTO MODIFICA ── */}
                <button
                  className="dx"
                  style={{borderColor:'rgba(59,130,246,.25)',color:'rgba(96,165,250,.5)',marginRight:2}}
                  onClick={e=>{
                    e.stopPropagation()
                    if(editId===exp.id){setEditId(null);return}
                    setEditId(exp.id)
                    setEditForm({store:exp.store||'',description:exp.description||'',amount:String(exp.amount||''),date:exp.purchase_date||''})
                    setExpanded(null)
                  }}
                  title="Modifica"
                >✎</button>
                {/* ── TASTO ELIMINA ── */}
                <button className="dx" onClick={async e=>{e.stopPropagation();const{error}=await supabase.from('expenses').delete().eq('id',exp.id);if(!error){setExpenses(x=>x.filter(r=>r.id!==exp.id));if(expanded===exp.id)setExpanded(null);if(editId===exp.id)setEditId(null)}}}>✕</button>
              </div>
            </div>

            {/* ── FORM MODIFICA INLINE ── */}
            {editId===exp.id&&<form
              onSubmit={e=>onEditSubmit(e,exp.id)}
              style={{padding:'.55rem 1.25rem',background:'rgba(59,130,246,.05)',borderBottom:'1px solid rgba(255,255,255,.04)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'flex-end'}}
            >
              <input value={editForm.store} onChange={ev=>setEditForm(f=>({...f,store:ev.target.value}))} placeholder="Negozio" className="fi" style={{flex:'1 1 110px'}}/>
              <input value={editForm.description} onChange={ev=>setEditForm(f=>({...f,description:ev.target.value}))} placeholder="Descrizione" className="fi" style={{flex:'1 1 130px'}}/>
              <input type="number" step="0.01" value={editForm.amount} onChange={ev=>setEditForm(f=>({...f,amount:ev.target.value}))} placeholder="€" className="fi" style={{flex:'0 0 80px'}}/>
              <input type="date" value={editForm.date} onChange={ev=>setEditForm(f=>({...f,date:ev.target.value}))} className="fi" style={{flex:'0 0 130px'}}/>
              <button type="submit" className="bn bn-s" style={{padding:'.28rem .65rem'}}>✓</button>
              <button type="button" onClick={()=>setEditId(null)} className="bn" style={{borderColor:'rgba(255,255,255,.15)',color:'#94a3b8',padding:'.28rem .65rem'}}>✕</button>
            </form>}

            {expanded===exp.id&&editId!==exp.id&&<div className="ed2">
              {recMap[exp.id]?.items?.length>0?(<>
                <div className="dl">🛒 {recMap[exp.id].items.length} prodotti · scontrino</div>
                <div className="il">{recMap[exp.id].items.map(it=>{
                  const packs=Number(it.packs||1)
                  const uPack=Number(it.units_per_pack||1)
                  const uLabel=it.unit_per_pack_label||it.unit||'pz'
                  const packDesc=packs>1&&uPack>1?`${packs} conf. × ${uPack} ${uLabel}`:packs>1?`${packs} × ${uLabel}`:uPack>1?`${uPack} ${uLabel}`:`${it.qty} ${it.unit||'pz'}`
                  return<div key={it.id} className="ir">
                    <div className="il-left">
                      <span className="iname">{it.name}{it.brand&&<em className="ibrand"> · {it.brand}</em>}</span>
                      <span className="ipack">{packDesc}</span>
                    </div>
                    <div className="il-right">
                      {it.unit_price>0&&packs>1&&<span className="iupr">{eur(it.unit_price)}/cad</span>}
                      <span className="ipr" style={{color:'#22c55e'}}>{eur(it.price)}</span>
                    </div>
                  </div>
                })}</div>
                <div className="itot">Totale <strong style={{color:'#22c55e'}}>{eur(recMap[exp.id].items.reduce((s,i)=>s+Number(i.price||0),0))}</strong></div>
              </>)
              :recMap[exp.id]?<div className="dem">Nessun dettaglio scontrino</div>:<div className="dem">Caricamento…</div>}
            </div>}
          </div>)}
        </div>}

        {tab==='dispensa'&&<div className="lb">
          {inventory.length===0?<div className="le">Dispensa vuota</div>:inventory.map(p=>{
            const pct=Number(p.consumed_pct||0)
            const al=pct>=80||(p.expiry_date&&new Date(p.expiry_date)<=new Date(Date.now()+10*86400000))
            return<div key={p.id} className={`dr ${al?'dra':''}`}>
              <div className="dinfo">
                <span className="dname">{p.product_name}</span>
                {p.brand&&<span className="dtag">{p.brand}</span>}
                {p.store&&<span className="dtag">@ {p.store}</span>}
              </div>
              <div className="dmeta">
                <span className="dqty">{p.qty} {p.unit_label||'pz'}</span>
                {p.avg_price>0&&<span className="dprice">{eur(p.avg_price)}/u</span>}
                {p.expiry_date&&<span className="dexp">⏰ {p.expiry_date}</span>}
                {pct>0&&<span className="dpct">{Math.round(pct)}%</span>}
              </div>
              <button className="dx" onClick={()=>{(async()=>{const{error}=await supabase.from('inventory').delete().eq('id',p.id);if(!error)setInventory(iv=>iv.filter(r=>r.id!==p.id))})()}}>✕</button>
            </div>
          })}
        </div>}
      </div>
    </div></div>
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
  .eg{display:flex;align-items:center;gap:.4rem;flex-shrink:0}
  .ev{font-size:.88rem;font-weight:700;font-family:'Montserrat',sans-serif}
  .ech{font-size:.55rem;color:rgba(100,116,139,.5)}
  .dx{background:none;border:1px solid rgba(239,68,68,.16);border-radius:6px;color:rgba(239,68,68,.35);cursor:pointer;padding:.15rem .4rem;font-size:.67rem;transition:all .12s}
  .dx:hover{border-color:rgba(239,68,68,.5);color:#f87171;background:rgba(239,68,68,.07)}
  .ed2{background:rgba(0,0,0,.22);border-top:1px solid rgba(255,255,255,.04);padding:.65rem 1.25rem .9rem}
  .dl{font-size:.61rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(100,116,139,.5);margin-bottom:.45rem}
  .dem{font-size:.75rem;color:rgba(100,116,139,.45)}
  .il{display:flex;flex-direction:column;gap:.25rem}
  .ir{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;font-size:.76rem;padding:.32rem 0;border-bottom:1px solid rgba(255,255,255,.03)}
  .il-left{display:flex;flex-direction:column;gap:.1rem;flex:1;min-width:0}
  .il-right{display:flex;flex-direction:column;align-items:flex-end;gap:.08rem;flex-shrink:0}
  .iname{color:#cbd5e1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ibrand{color:rgba(100,116,139,.6);font-style:normal}
  .ipack{font-size:.68rem;color:rgba(100,116,139,.55)}
  .iupr{font-size:.66rem;color:rgba(100,116,139,.45)}
  .ipr{font-size:.8rem;font-weight:700;font-family:'Montserrat',sans-serif}
  .iqty{color:rgba(100,116,139,.55);font-size:.69rem}
  .itot{text-align:right;font-size:.72rem;color:rgba(100,116,139,.5);padding:.4rem 0 .1rem;border-top:1px solid rgba(255,255,255,.06);margin-top:.2rem}
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
`

export default withAuth(SpeseCasa)
export async function getServerSideProps(){return{props:{}}}