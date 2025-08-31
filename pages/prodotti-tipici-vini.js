import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

// Leaflet (no SSR)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr:false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr:false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr:false });
const Tooltip      = dynamic(() => import('react-leaflet').then(m => m.Tooltip),      { ssr:false });
const Popup        = dynamic(() => import('react-leaflet').then(m => m.Popup),        { ssr:false });

/* ----------------- UI helpers ----------------- */
const inp = { padding:'10px 12px', borderRadius:12, border:'1px solid #243246', background:'#0b0f14', color:'#e5eeff' };
const btn = (active=false)=>({ padding:'10px 14px', borderRadius:12, border:'1px solid ' + (active ? '#60a5fa' : '#2b3645'),
  background: active ? 'linear-gradient(180deg,#0f1e2d,#0b1520)' : 'transparent', color: active ? '#e6f0ff' : '#c7d2fe', cursor:'pointer' });
const Table = ({children}) => (<div style={{overflowX:'auto',background:'#0b0f14',borderRadius:16}}><table style={{width:'100%',borderCollapse:'collapse',color:'#e5eeff'}}>{children}</table></div>);
const TCell = ({children, right, colSpan}) => (<td colSpan={colSpan} style={{padding:'10px 8px',borderBottom:'1px solid #1f2a38',textAlign:right?'right':'left'}}>{children}</td>);
const Stars = ({value=0,onChange}) => (<span aria-label="rating" style={{display:'inline-flex',gap:4}}>
  {[1,2,3,4,5].map(n=>(<span key={n} role="button" onClick={()=>onChange?.(n)} style={{cursor:'pointer',fontSize:18,userSelect:'none'}}>{n <= (value||0) ? '★' : '☆'}</span>))}
</span>);

/* ------------- MOBILE actions (select) ------------- */
function ActionsMobile({ options, onAction }) {
  return (
    <select aria-label="Azioni" onChange={e => { const v=e.target.value; if(v){ onAction(v); e.target.value=''; } }}
            style={{...inp, padding:'8px 10px', width:'100%'}}>
      <option value="">Azioni…</option>
      {options.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ===== Toolbar sezione (Manuale / OCR) ===== */
function SectionToolbar({ label, onAddManual, onOcr, showAdd }) {
  const fileRef = useRef(null);
  return (
    <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px', flexWrap:'wrap' }}>
      <span style={{ color:'#cdeafe', fontWeight:700 }}>{label}</span>
      <button onClick={onAddManual} style={btn(true)}>{showAdd ? 'Chiudi' : 'Aggiungi manuale'}</button>
      <button onClick={()=>fileRef.current?.click()} style={btn(false)}>OCR (foto)</button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden
             onChange={e => onOcr?.(Array.from(e.target.files || []))}/>
    </div>
  );
}

/* ===== Drawer Sommelier ===== */
function SommelierDrawer({ data, onClose, onAdd }) {
  const recs = data?.recommendations || [];
  const src = data?.source || '';
  const bf = data?.budget_filter || {};
  const hasBudget = bf && (bf.min != null || bf.max != null);
  const Band = ({band}) => { const map={low:'#10b981',med:'#f59e0b',high:'#ef4444'}; const lab={low:'Low',med:'Med',high:'High'}[band]||band; return band ? <span style={{background:map[band],color:'#0b0f14',padding:'2px 8px',borderRadius:999,fontSize:12,fontWeight:700}}>{lab}</span> : null; };
  const OutOf = ({flag}) => flag ? (<span style={{ border:'1px solid #ef4444', color:'#ef4444', padding:'2px 8px', borderRadius:999, fontSize:12, fontWeight:700 }}>Fuori budget</span>) : null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'flex-end', zIndex:50 }}>
      <div style={{ width:'min(520px,96vw)', height:'100%', background:'#0b0f14', borderLeft:'1px solid #1f2a38', padding:16, overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <h3 style={{ margin:0 }}>Sommelier – risultati</h3>
          <button onClick={onClose} style={btn(false)}>Chiudi</button>
        </div>
        <div style={{ fontSize:13, opacity:.85, marginBottom:10 }}>
          Fonte: <strong>{src === 'list' ? 'Carta del locale' : src === 'web' ? 'Ricerca web' : 'Suggerimenti offline'}</strong>
          {hasBudget && <> • Filtro prezzo:{bf.min!=null && <> ≥ € {Number(bf.min).toFixed(0)}</>}{bf.max!=null && <> ≤ € {Number(bf.max).toFixed(0)}</>}</>}
        </div>
        {recs.length === 0 && <p style={{ opacity:0.8 }}>{data?.notes || 'Nessun risultato.'}</p>}
        {recs.map((r,i)=>(
          <div key={i} style={{ border:'1px solid #1f2a38', borderRadius:12, padding:12, marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
              <div style={{ fontWeight:700, lineHeight:1.2 }}>{r.name}</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <Band band={r.price_band} /><OutOf flag={r.out_of_budget} />
              </div>
            </div>
            <div style={{ opacity:0.85, marginTop:4 }}>{(r.winery || '—')} • {(r.denomination || '—')} {r.region ? `• ${r.region}` : ''}</div>
            <div style={{ marginTop:6 }}>{r.why}</div>
            <div style={{ marginTop:8, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              {r.typical_price_eur != null && <span style={{ opacity:0.9 }}>~ € {Number(r.typical_price_eur).toFixed(2)}</span>}
              {(r.links || []).map((l,idx)=>(<a key={idx} href={l.url} target="_blank" rel="noreferrer" style={btn(false)}>{l.title || 'Link'}</a>))}
              <button style={btn(true)} onClick={()=> onAdd?.(r)} title="Salva tra i vini bevuti con localizzazione">Aggiungi tra i bevuti</button>
            </div>
          </div>
        ))}
        <div style={{ position:'sticky', bottom:0, background:'#0b0f14', paddingTop:8 }}>
          <div style={{ borderTop:'1px solid #1f2a38', paddingTop:8, display:'flex', justifyContent:'flex-end' }}>
            <button onClick={onClose} style={btn(false)}>Chiudi suggerimenti</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Live QR Scanner ===== */
function LiveQrScanner({ onClose, onResult }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  useEffect(() => {
    let stream;
    let loop = null;
    (async () => {
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        stream = localStream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play(); loop=setInterval(scan, 350); }
      } catch { alert('Fotocamera non disponibile'); onClose?.(); }
    })();
    return () => {
      if (loop) clearInterval(loop);
      const v = videoRef.current;
      try { v?.pause(); stream?.getTracks?.().forEach(t=>t.stop()); } catch {}
    };
  }, [onClose]);

  async function scan(){
    const jsQR = (await import('jsqr')).default;
    const v = videoRef.current, c = canvasRef.current; if(!v||!c||v.readyState<2) return;
    const w=v.videoWidth,h=v.videoHeight; c.width=w; c.height=h;
    const ctx=c.getContext('2d'); ctx.drawImage(v,0,0,w,h);
    const img=ctx.getImageData(0,0,w,h); const code=jsQR(img.data,img.width,img.height);
    if(code&&code.data){
      const url = code.data.trim();
      onResult?.([url]); // invia subito il risultato singolo
      onClose?.();
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div style={{ width:'min(520px,96vw)', background:'#0b0f14', border:'1px solid #1f2a38', borderRadius:16, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <h3 style={{ margin:0 }}>Scanner QR</h3>
          <button onClick={onClose} style={btn(false)}>Chiudi</button>
        </div>
        <video ref={videoRef} muted playsInline style={{ width:'100%', borderRadius:12, background:'#000' }} />
        <canvas ref={canvasRef} style={{ display:'none' }} />
      </div>
    </div>
  );
}

/* ===== Denom → Regione/Provincia (mini dizionario) ===== */
const DENOM_REGION_MAP = [
  { test:/valpolicella|amarone/i, region:'Veneto (VR)' },
  { test:/barolo|langhe|alba|nebbiolo d\'alba/i, region:'Piemonte (CN)' },
  { test:/chianti|brunello|montalcino/i, region:'Toscana' },
  { test:/montepulciano d\'abruzzo/i, region:'Abruzzo' },
  { test:/etna|nerello|carricante|catania/i, region:'Sicilia (CT)' },
  { test:/soave|gambellara/i, region:'Veneto (VR)' },
  { test:/taurasi|greco di tufo|fiano di avellino/i, region:'Campania (AV)' },
];

function inferRegion(name='', denom='') {
  const S = `${name} ${denom}`.toLowerCase();
  for (const r of DENOM_REGION_MAP) { if (r.test.test(S)) return r.region; }
  if (/veneto/i.test(S)) return 'Veneto';
  if (/piemonte/i.test(S)) return 'Piemonte';
  if (/toscana/i.test(S)) return 'Toscana';
  if (/sicilia/i.test(S)) return 'Sicilia';
  if (/lombardia/i.test(S)) return 'Lombardia';
  if (/abruzzo/i.test(S)) return 'Abruzzo';
  return null;
}

/* ===================== FORM: VINO ===================== */
const AddWineForm = React.forwardRef(function AddWineForm({ userId, onInserted }, ref) {
  const [form, setForm] = useState({
    name:'', winery:'', denomination:'', region:'', grapes:'', vintage:'', style:'rosso', price_target:'',
    origin_place_name:'', origin_lat:'', origin_lng:'', purchase_place_name:'', purchase_lat:'', purchase_lng:'',
    addToCellar:false, bottles:'', purchase_price_eur:''
  });

  React.useImperativeHandle(ref, () => ({
    reset(){ setForm({
      name:'', winery:'', denomination:'', region:'', grapes:'', vintage:'', style:'rosso', price_target:'',
      origin_place_name:'', origin_lat:'', origin_lng:'', purchase_place_name:'', purchase_lat:'', purchase_lng:'',
      addToCellar:false, bottles:'', purchase_price_eur:''
    }); }
  }), []);

  const handleInsert = useCallback(async () => {
    if (!userId) return alert('Sessione assente.');
    const grapesArr = form.grapes ? form.grapes.split(',').map(s=>s.trim()).filter(Boolean) : null;

    const { data: newWine, error } = await supabase.from('wines').insert([{
      user_id: userId,
      name: form.name.trim(), winery: form.winery || null, denomination: form.denomination || null,
      region: form.region || null, grapes: grapesArr, vintage: form.vintage ? Number(form.vintage) : null,
      style: form.style || null, price_target: form.price_target ? Number(form.price_target) : null
    }]).select().single();
    if (error) return alert('Errore vino: ' + error.message);

    const places = [];
    if (form.origin_lat && form.origin_lng) places.push({
      user_id: userId, item_type:'wine', item_id:newWine.id, kind:'origin',
      place_name: form.origin_place_name || null, lat:Number(form.origin_lat), lng:Number(form.origin_lng), is_primary:true
    });
    if (form.purchase_lat && form.purchase_lng) places.push({
      user_id: userId, item_type:'wine', item_id:newWine.id, kind:'purchase',
      place_name: form.purchase_place_name || null, lat:Number(form.purchase_lat), lng:Number(form.purchase_lng), is_primary:true
    });
    if (places.length) {
      const { error:e2 } = await supabase.from('product_places').insert(places);
      if (e2) alert('Errore luogo: ' + e2.message);
    }

    if (form.addToCellar) {
      const bottles = form.bottles ? Number(form.bottles) : 1;
      const price   = form.purchase_price_eur ? Number(form.purchase_price_eur) : null;
      const { error:e3 } = await supabase.from('cellar').insert([{ user_id: userId, wine_id: newWine.id, bottles, purchase_price_eur: price }]);
      if (e3) alert('Errore cantina: ' + e3.message);
    }

    onInserted?.();
    ref?.current?.reset?.();
  }, [form, userId, onInserted, ref]);

  return (
    <section style={{ marginBottom:16, padding:12, borderRadius:16, background:'#0b0f14', border:'1px solid #1f2a38' }}>
      <h3 style={{ margin:'0 0 8px' }}>Aggiungi Vino (Wishlist)</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
        <input placeholder="Nome" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} style={inp}/>
        <input placeholder="Cantina" value={form.winery} onChange={e=>setForm({...form, winery:e.target.value})} style={inp}/>
        <input placeholder="Denominazione (DOCG/DOC/IGT)" value={form.denomination} onChange={e=>setForm({...form, denomination:e.target.value})} style={inp}/>
        <input placeholder="Regione" value={form.region} onChange={e=>setForm({...form, region:e.target.value})} style={inp}/>
        <input placeholder="Vitigni (comma)" value={form.grapes} onChange={e=>setForm({...form, grapes:e.target.value})} style={inp}/>
        <input placeholder="Annata" value={form.vintage} onChange={e=>setForm({...form, vintage:e.target.value})} style={inp}/>
        <select value={form.style} onChange={e=>setForm({...form, style:e.target.value})} style={inp}>
          <option value="rosso">Rosso</option><option value="bianco">Bianco</option><option value="rosé">Rosé</option><option value="frizzante">Frizzante</option><option value="fortificato">Fortificato</option>
        </select>
        <input placeholder="Budget (€)" value={form.price_target} onChange={e=>setForm({...form, price_target:e.target.value})} style={inp}/>
        <input placeholder="Origine - luogo (opz.)" value={form.origin_place_name} onChange={e=>setForm({...form, origin_place_name:e.target.value})} style={inp}/>
        <input placeholder="Origine - lat (opz.)" value={form.origin_lat} onChange={e=>setForm({...form, origin_lat:e.target.value})} style={inp}/>
        <input placeholder="Origine - lng (opz.)" value={form.origin_lng} onChange={e=>setForm({...form, origin_lng:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - luogo (opz.)" value={form.purchase_place_name} onChange={e=>setForm({...form, purchase_place_name:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - lat (opz.)" value={form.purchase_lat} onChange={e=>setForm({...form, purchase_lat:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - lng (opz.)" value={form.purchase_lng} onChange={e=>setForm({...form, purchase_lng:e.target.value})} style={inp}/>
      </div>
      <div style={{ marginTop:10, display:'flex', gap:12, alignItems:'center' }}>
        <label style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input type="checkbox" checked={form.addToCellar} onChange={e=>setForm({...form, addToCellar:e.target.checked})}/>
          <span>Aggiungi anche in Cantina</span>
        </label>
        {form.addToCellar && (
          <>
            <input placeholder="Bottiglie" value={form.bottles} onChange={e=>setForm({...form, bottles:e.target.value})} style={inp}/>
            <input placeholder="Prezzo acquisto (€)" value={form.purchase_price_eur} onChange={e=>setForm({...form, purchase_price_eur:e.target.value})} style={inp}/>
          </>
        )}
      </div>
      <div style={{ marginTop:10, display:'flex', gap:8 }}>
        <button onClick={handleInsert} style={btn(true)}>Salva</button>
      </div>
    </section>
  );
});

/* ===================== FORM: ARTISAN ===================== */
const AddArtisanForm = React.forwardRef(function AddArtisanForm({ userId, onInserted }, ref) {
  const [form, setForm] = useState({
    name:'', category:'formaggio', designation:'', price_eur:'', notes:'',
    origin_place_name:'', origin_lat:'', origin_lng:'', purchase_place_name:'', purchase_lat:'', purchase_lng:''
  });

  React.useImperativeHandle(ref, () => ({
    reset(){ setForm({
      name:'', category:'formaggio', designation:'', price_eur:'', notes:'',
      origin_place_name:'', origin_lat:'', origin_lng:'', purchase_place_name:'', purchase_lat:'', purchase_lng:''
    }); }
  }), []);

  const handleInsert = useCallback( async () => {
    if (!userId) return alert('Sessione assente.');
    const { data, error } = await supabase.from('artisan_products').insert([{
      user_id: userId, name: form.name.trim(), category: form.category,
      designation: form.designation || null, price_eur: form.price_eur ? Number(form.price_eur) : null, notes: form.notes || null
    }]).select().single();
    if (error) return alert('Errore prodotto: ' + error.message);

    const rows = [];
    if (form.origin_lat && form.origin_lng) rows.push({ user_id:userId, item_type:'artisan', item_id:data.id, kind:'origin',   place_name:form.origin_place_name||null,   lat:Number(form.origin_lat),   lng:Number(form.origin_lng),   is_primary:true });
    if (form.purchase_lat && form.purchase_lng) rows.push({ user_id:userId, item_type:'artisan', item_id:data.id, kind:'purchase', place_name:form.purchase_place_name||null, lat:Number(form.purchase_lat), lng:Number(form.purchase_lng), is_primary:true });
    if (rows.length) { const { error:e2 } = await supabase.from('product_places').insert(rows); if (e2) alert('Errore luogo: '+e2.message); }
    onInserted?.();
    ref?.current?.reset?.();
  }, [form, onInserted, ref, userId]);

  return (
    <section style={{ marginBottom:16, padding:12, borderRadius:16, background:'#0b0f14', border:'1px solid #1f2a38' }}>
      <h3 style={{ margin:'0 0 8px' }}>Aggiungi Formaggio/Salume</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
        <input placeholder="Nome" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} style={inp}/>
        <select value={form.category} onChange={e=>setForm({...form, category:e.target.value})} style={inp}>
          <option value="formaggio">Formaggio</option><option value="salume">Salume</option>
        </select>
        <input placeholder="Designazione (DOP/IGP…)" value={form.designation} onChange={e=>setForm({...form, designation:e.target.value})} style={inp}/>
        <input placeholder="Prezzo (€ o €/kg)" value={form.price_eur} onChange={e=>setForm({...form, price_eur:e.target.value})} style={inp}/>
        <input placeholder="Note" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} style={inp}/>
        <input placeholder="Origine - luogo (opz.)" value={form.origin_place_name} onChange={e=>setForm({...form, origin_place_name:e.target.value})} style={inp}/>
        <input placeholder="Origine - lat (opz.)" value={form.origin_lat} onChange={e=>setForm({...form, origin_lat:e.target.value})} style={inp}/>
        <input placeholder="Origine - lng (opz.)" value={form.origin_lng} onChange={e=>setForm({...form, origin_lng:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - luogo (opz.)" value={form.purchase_place_name} onChange={e=>setForm({...form, purchase_place_name:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - lat (opz.)" value={form.purchase_lat} onChange={e=>setForm({...form, purchase_lat:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - lng (opz.)" value={form.purchase_lng} onChange={e=>setForm({...form, purchase_lng:e.target.value})} style={inp}/>
      </div>
      <div style={{ marginTop:10, display:'flex', gap:8 }}>
        <button onClick={handleInsert} style={btn(true)}>Salva</button>
      </div>
    </section>
  );
});

/* ===================== Add Cantina ===================== */
const AddCellarForm = React.forwardRef(function AddCellarForm({ userId, wines = [], onInserted }, ref) {
  const [form, setForm] = useState({ wine_id:'', bottles:'1', purchase_price_eur:'', pairings:'' });

  React.useImperativeHandle(ref, () => ({
    reset(){ setForm({ wine_id:'', bottles:'1', purchase_price_eur:'', pairings:'' }); }
  }), []);

  const handleInsert = useCallback(async ()=>{
    try {
      if (!userId) return alert('Sessione assente.');
      if (!form.wine_id) return alert('Seleziona un vino');

      const bottles = form.bottles ? Number(form.bottles) : 1;
      const price   = form.purchase_price_eur ? Number(form.purchase_price_eur) : null;
      const pair    = form.pairings ? form.pairings.split(',').map(s => s.trim()).filter(Boolean) : null;

      const { error } = await supabase.from('cellar').insert([{
        user_id: userId, wine_id: form.wine_id, bottles, purchase_price_eur: price, pairings: pair
      }]);
      if (error) throw error;

      ref?.current?.reset?.();
      onInserted?.();
    } catch (e) {
      alert('Errore: ' + (e?.message || e));
    }
  }, [form, userId, onInserted, ref]);

  return (
    <section style={{ marginBottom:16, padding:12, borderRadius:16, background:'#0b0f14', border:'1px solid #1f2a38' }}>
      <h3 style={{ margin:'0 0 8px' }}>Aggiungi in Cantina</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
        <select value={form.wine_id} onChange={e=>setForm({...form, wine_id:e.target.value})} style={inp}>
          <option value="">Seleziona vino…</option>
          {wines.map(w => (<option key={w.id} value={w.id}>{w.name}{w.winery?` - ${w.winery}`:''}</option>))}
        </select>
        <input placeholder="Bottiglie" value={form.bottles} onChange={e=>setForm({...form, bottles:e.target.value})} style={inp}/>
        <input placeholder="Prezzo acquisto (€)" value={form.purchase_price_eur} onChange={e=>setForm({...form, purchase_price_eur:e.target.value})} style={inp}/>
        <input placeholder="Abbinamenti (comma)" value={form.pairings} onChange={e=>setForm({...form, pairings:e.target.value})} style={inp}/>
      </div>
      <div style={{ marginTop:10 }}>
        <button onClick={handleInsert} style={btn(true)}>Salva</button>
      </div>
    </section>
  );
});

/* ===================== Pagina ===================== */
function ProdottiTipiciViniPage() {
  const [tab, setTab] = useState('wines'); // 'artisan' | 'wines' | 'cellar'
  const [userId, setUserId] = useState(null);

  const [places, setPlaces] = useState([]);
  const [artisan, setArtisan] = useState([]);
  const [wines, setWines]     = useState([]);
  const [cellar, setCellar]   = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddArtisan, setShowAddArtisan] = useState(false);
  const [showAddWine, setShowAddWine]       = useState(false);
  const [showAddCellar, setShowAddCellar]   = useState(false);

  // allegati Sommelier
  const [sommelierLists, setSommelierLists] = useState([]); // testi OCR (multi-foto)
  const [sommelierQr, setSommelierQr]       = useState([]); // URL QR (multi)
  const [sommelierBusy, setSommelierBusy]   = useState(false);

  // Drawer Sommelier
  const [sommelierOpen, setSommelierOpen] = useState(false);
  const [sommelierData, setSommelierData] = useState(null);

  // prompt Sommelier
  const [q, setQ] = useState('');
  const [showQr, setShowQr] = useState(false);

  // pulses & popup info
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [mapCenter, setMapCenter] = useState([12.5, 42.5]); // [lng, lat]
  const [mapZoom, setMapZoom] = useState(5);
  const [popupInfo, setPopupInfo] = useState({}); // placeId -> { bestVintages, pairing, ... }

  // toasts
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2500);
  }, []);

  // sessione
  useEffect(() => {
    let sub = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      sub = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user?.id || null));
    })();
    return () => { try { sub?.data?.subscription?.unsubscribe?.() } catch {} };
  }, []);

  const refreshAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [{ data: p }, { data: a }, { data: w }, { data: c }] = await Promise.all([
        supabase.from('product_places').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('artisan_products').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('wines').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('cellar').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      ]);
      setPlaces(p || []); setArtisan(a || []); setWines(w || []);
      const mapWine = new Map((w || []).map(x => [x.id, x]));
      setCellar((c || []).map(row => ({ ...row, wine: mapWine.get(row.wine_id) })));
    } catch (e) { console.error(e); alert('Errore caricamento: ' + (e?.message || e)); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  /* ---------- map helpers ---------- */
  const wineById = useMemo(()=> Object.fromEntries((wines||[]).map(w=>[w.id,w])), [wines]);
  const placesByWine = useMemo(()=> {
    const m = new Map();
    for (const p of places) if (p.item_type==='wine') {
      const arr = m.get(p.item_id) || []; arr.push(p); m.set(p.item_id, arr);
    }
    return m;
  }, [places]);

  const focusWineOnMap = useCallback((wineId) => {
    const candidates = (placesByWine.get(wineId) || []);
    const target = candidates.find(c=>c.kind==='purchase') || candidates.find(c=>c.kind==='origin');
    if (!target) { showToast('Nessun luogo salvato per questo vino'); return; }
    setMapCenter([target.lng, target.lat]); setMapZoom(7); setSelectedPlaceId(target.id);
    document.getElementById('map-italia')?.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=> setSelectedPlaceId(null), 3000);
  }, [placesByWine, showToast]);

  async function loadPopupInfo(place) {
    try {
      const wine = wineById[place.item_id];
      if (!wine) return;
      const denom = wine.denomination || '';
      const name  = wine.name || '';
      const r = await fetch('/api/sommelier', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ query: `migliori annate ${denom || name}`, wineLists: [], qrLinks: [], userId })
      });
      const j = await r.json();
      const top = (j?.recommendations || [])[0];
      const vintages = (top?.vintage_suggestion || []).slice(0,6);
      setPopupInfo(prev => ({ ...prev, [place.id]: {
        vintages, pairing: (top?.why || '').replace(/.*Abbinamento:\s*/i,'').trim()
      }}));
    } catch {}
  }

  /* ---------- geocoding & geolocation ---------- */
  async function reverseGeocode(lat, lng) {
    try { const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=0`);
      const j=await r.json(); return j?.display_name || null; } catch { return null; }
  }
  async function searchGeocode(query) {
    try { const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=0`);
      const j=await r.json(); if (Array.isArray(j)&&j.length) return { name:j[0].display_name||query, lat:Number(j[0].lat), lng:Number(j[0].lon) }; } catch {}
    return null;
  }
  async function getCurrentPositionStrict() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocalizzazione non supportata'));
      navigator.geolocation.getCurrentPosition(resolve, (err) => reject(err), {
        enableHighAccuracy: true, timeout: 20000, maximumAge: 0
      });
    });
  }
  async function ensureOriginForWine(wine) {
    const hasOrigin = (placesByWine.get(wine.id) || []).some(p => p.kind==='origin');
    if (hasOrigin) return;
    const regionGuess = inferRegion(wine.name, wine.denomination) || wine.region || wine.denomination || '';
    if (!regionGuess) return;
    const hit = await searchGeocode(regionGuess);
    if (!hit) return;
    await supabase.from('product_places').insert([{
      user_id: userId, item_type:'wine', item_id: wine.id, kind:'origin',
      place_name: hit.name, lat: hit.lat, lng: hit.lng, is_primary: true
    }]);
  }
  async function addPlaceFor(itemType, itemId, kind) {
    if (!userId) return alert('Sessione assente');
    try {
      if (itemType === 'wine' && kind === 'purchase') {
        const wine = wineById[itemId];
        if (wine) await ensureOriginForWine(wine);
      }
      showToast('Richiesta posizione in corso…');
      const pos = await getCurrentPositionStrict();
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const name = await reverseGeocode(lat, lng);
      const { error } = await supabase.from('product_places').insert([{
        user_id:userId, item_type:itemType, item_id:itemId, kind,
        place_name: name || `(${lat.toFixed(5)}, ${lng.toFixed(5)})`, lat, lng, is_primary: true
      }]);
      if (error) throw error;
      showToast(kind==='purchase' ? 'Luogo di consumo/acquisto aggiunto!' : 'Origine aggiunta!');
      await refreshAll();
      if (itemType==='wine') focusWineOnMap(itemId);
    } catch {
      const manual = prompt('Localizzazione non disponibile. Inserisci il luogo (es. "Enoteca X, Alba")');
      if (!manual) return;
      const hit = await searchGeocode(manual);
      if (!hit) { alert('Impossibile geocodificare il luogo'); return; }
      const { error:e2 } = await supabase.from('product_places').insert([{
        user_id:userId, item_type:itemType, item_id:itemId, kind,
        place_name: hit.name, lat: hit.lat, lng: hit.lng, is_primary: true
      }]);
      if (e2) return alert('Errore salvataggio: ' + e2.message);
      showToast('Luogo aggiunto!');
      await refreshAll();
      if (itemType==='wine') focusWineOnMap(itemId);
    }
  }

  /* ---------- OCR → inserimento diretto (VINI) ---------- */
  async function handleOcrInsertWine(files) {
    try {
      if (!files || !files.length) return;
      const fd = new FormData(); files.forEach(f => fd.append('images', f, f.name));
      const ocr = await fetch('/api/ocr', { method:'POST', body: fd }).then(r=>r.json());
      const rawText = (ocr?.text || '').trim();
      if (!rawText) return alert('OCR: nessun testo letto');

      const norm = await fetch('/api/ingest/normalize', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text: rawText, target: 'wine' })
      }).then(r=>r.json());

      if (norm?.kind !== 'wine') return alert('Non sembra un’etichetta vino');
      const d = norm.data || {};
      const name  = (d.name && String(d.name).trim()) || `Vino (${new Date().toISOString().slice(0,10)})`;
      let region = d.region || inferRegion(name, d.denomination) || null;

      const { data: newWine, error } = await supabase.from('wines').insert([{
        user_id: userId,
        name, winery: d.winery || null, denomination: d.denomination || null,
        region, grapes: Array.isArray(d.grapes) ? d.grapes : null,
        vintage: d.vintage ?? null, style: d.style || null, alcohol: d.alcohol ?? null,
        price_target: d.price_eur ?? null
      }]).select().single();
      if (error) throw error;

      const rows = [];
      if (d.origin?.lat && d.origin?.lng) rows.push({ user_id:userId, item_type:'wine', item_id:newWine.id, kind:'origin',
        place_name:d.origin.name||null, lat:d.origin.lat, lng:d.origin.lng, is_primary:true });
      if (!rows.length && region) {
        const hit = await searchGeocode(region); if (hit) rows.push({ user_id:userId, item_type:'wine', item_id:newWine.id, kind:'origin',
          place_name:hit.name, lat:hit.lat, lng:hit.lng, is_primary:true });
      }
      if (rows.length) {
        const { error:e2 } = await supabase.from('product_places').insert(rows);
        if (e2) showToast('Inserito il vino, ma origine non salvata');
      }

      showToast('Vino aggiunto dalla foto');
      await refreshAll();
    } catch (e) {
      console.error(e);
      alert('Errore OCR: ' + (e?.message || e));
    }
  }

  /* ---------- Sommelier ---------- */
  const fileRefSommelier = useRef(null);
  async function handleSommelierOcrFiles(files) {
    try {
      if (!files || !files.length) { alert('Nessun file selezionato'); return; }
      const fd = new FormData(); files.forEach((f, i) => fd.append('images', f, f.name || `foto_${i+1}.jpg`));
      const j = await fetch('/api/ocr', { method:'POST', body: fd }).then(r=>r.json());
      const text = (j?.text || '').trim(); if (!text) return alert('OCR: nessun testo letto');
      setSommelierLists(prev => [...prev, text]); showToast(`${files.length} foto aggiunte alla carta`);
    } catch (e) { alert('Errore Sommelier OCR: ' + (e?.message || e)); }
  }
  async function runSommelier() {
    try {
      setSommelierBusy(true);
      const payload = { query: q || '', wineLists: sommelierLists, qrLinks: sommelierQr, userId };
      const j = await fetch('/api/sommelier', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(r=>r.json());
      setSommelierData(j); setSommelierOpen(true);
    } catch (e) { alert('Sommelier error: ' + (e?.message || e)); }
    finally { setSommelierBusy(false); }
  }
  async function addRecommendationToBevuti(rec) {
    try {
      if (!userId) return alert('Sessione assente');
      const { data: newWine, error } = await supabase.from('wines').insert([{
        user_id: userId, name: rec.name?.trim() || 'Vino', winery: rec.winery || null, denomination: rec.denomination || null,
        region: rec.region || null, style: rec.style || null, price_target: rec.typical_price_eur ?? null
      }]).select().single();
      if (error) throw error;
      const pos = await getCurrentPositionStrict();
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const name = await reverseGeocode(lat, lng);
      await supabase.from('product_places').insert([{
        user_id:userId, item_type:'wine', item_id:newWine.id, kind:'purchase',
        place_name: name || `(${lat.toFixed(5)}, ${lng.toFixed(5)})`, lat, lng, is_primary: true
      }]);
      showToast('Aggiunto ai bevuti'); await refreshAll(); focusWineOnMap(newWine.id);
    } catch (e) { alert('Errore salvataggio: ' + (e?.message || e)); }
  }

  /* ---------- Elimina righe ---------- */
  async function deleteWineRow(id) {
    if (!confirm('Eliminare questo vino?')) return;
    try {
      await supabase.from('product_places').delete().eq('user_id',userId).eq('item_type','wine').eq('item_id',id);
      await supabase.from('cellar').delete().eq('user_id',userId).eq('wine_id',id);
      const { error } = await supabase.from('wines').delete().eq('user_id',userId).eq('id',id);
      if (error) throw error; showToast('Eliminato'); refreshAll();
    } catch (e) { alert('Errore: ' + (e?.message || e)); }
  }
  async function deleteArtisanRow(id) {
    if (!confirm('Eliminare questo prodotto?')) return;
    try {
      await supabase.from('product_places').delete().eq('user_id',userId).eq('item_type','artisan').eq('item_id',id);
      const { error } = await supabase.from('artisan_products').delete().eq('user_id',userId).eq('id',id);
      if (error) throw error; showToast('Eliminato'); refreshAll();
    } catch (e) { alert('Errore: ' + (e?.message || e)); }
  }

  /* ------------------- Render ------------------- */
  return (
    <>
      <Head><title>Prodotti tipici & Vini</title></Head>

      {/* Banner */}
      <div style={{ width:'100%', height:220, overflow:'hidden', borderRadius:16, marginBottom:16, position:'relative' }}>
        <video src="/intro.mp4" muted loop playsInline autoPlay style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.35))', color:'#fff', fontWeight:700, fontSize:28 }}>
          PRODOTTI TIPICI & VINI
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button onClick={()=>setTab('artisan')} style={btn(tab==='artisan')}>Formaggi & Salumi</button>
        <button onClick={()=>setTab('wines')}   style={btn(tab==='wines')}>Vini (Wishlist)</button>
        <button onClick={()=>setTab('cellar')}  style={btn(tab==='cellar')}>Cantina</button>
      </div>

      {/* SOMMELIER (globale) */}
      <div style={{ display:'flex', gap:8, alignItems:'center', margin:'0 0 14px', flexWrap:'wrap' }}>
        <input value={q} onChange={e=>setQ(e.target.value)}
               placeholder='Es: "rosso corposo non troppo tannico", "rosé fruttato minerale < 25€"'
               style={{ flex:1, minWidth:240, ...inp }}/>
        <button onClick={runSommelier} style={btn(true)} disabled={sommelierBusy}>{sommelierBusy ? '…' : 'Sommelier'}</button>
        <button onClick={()=>fileRefSommelier.current?.click()} style={btn(false)}>Sommelier (OCR)</button>
        <input ref={fileRefSommelier} type="file" accept="image/*" multiple capture="environment" hidden
               onChange={e=> e.target.files?.length && handleSommelierOcrFiles(Array.from(e.target.files))}/>
        <button onClick={()=>setShowQr(true)} style={btn(false)}>Scanner QR</button>
      </div>
      {(sommelierLists.length || sommelierQr.length) ? (
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:-6, marginBottom:10}}>
          <span style={{opacity:.85}}>Allegati: {sommelierLists.length} foto OCR • {sommelierQr.length} QR</span>
          <button onClick={()=>{ setSommelierLists([]); setSommelierQr([]); showToast('Allegati azzerati'); }} style={btn(false)}>Pulisci allegati</button>
        </div>
      ) : null}
      {showQr && <LiveQrScanner onClose={()=>setShowQr(false)} onResult={codes => { setShowQr(false); setSommelierQr(prev => [...prev, ...codes]); showToast(`${codes.length} link QR aggiunti`); }}/>}
      {sommelierOpen && <SommelierDrawer data={sommelierData} onClose={()=>setSommelierOpen(false)} onAdd={addRecommendationToBevuti}/>}

      {/* ===== ARTISAN ===== */}
      {tab === 'artisan' && (
        <>
          <SectionToolbar label="Formaggi & Salumi" onAddManual={()=> setShowAddArtisan(v=>!v)} onOcr={()=>alert('OCR diretto per i prodotti può essere aggiunto allo stesso modo dei vini.')} showAdd={showAddArtisan}/>
          {showAddArtisan && <AddArtisanForm userId={userId} onInserted={refreshAll} />}

          <Table>
            <thead>
              <tr>
                <th style={{textAlign:'left',padding:10}}>Nome</th>
                <th style={{textAlign:'left',padding:10}}>Tipologia</th>
                <th style={{textAlign:'left',padding:10}}>Designazione</th>
                <th style={{textAlign:'right',padding:10}}>Prezzo</th>
                <th style={{textAlign:'left',padding:10,minWidth:220}}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><TCell>Caricamento…</TCell></tr>}
              {!loading && artisan.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
              {artisan.map(row=>(
                <tr key={row.id}>
                  <TCell>{row.name}</TCell>
                  <TCell>{row.category}</TCell>
                  <TCell>{row.designation || '—'}</TCell>
                  <TCell right>{row.price_eur!=null ? `€ ${Number(row.price_eur).toFixed(2)}` : '—'}</TCell>
                  <TCell>
                    <div className="actions-desktop" style={{display:'none',gap:6,flexWrap:'wrap'}}>
                      <button style={btn(false)} onClick={()=>addPlaceFor('artisan',row.id,'purchase')}>Dove l’ho mangiato</button>
                      <button style={btn(false)} onClick={()=>deleteArtisanRow(row.id)}>Elimina</button>
                    </div>
                    <div className="actions-mobile">
                      <ActionsMobile options={[
                        {value:'ate',label:'Dove l’ho mangiato'},
                        {value:'del',label:'Elimina'}
                      ]} onAction={(v)=>{
                        if (v==='ate') addPlaceFor('artisan',row.id,'purchase');
                        if (v==='del') deleteArtisanRow(row.id);
                      }}/>
                    </div>
                  </TCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {/* ===== WINES ===== */}
      {tab === 'wines' && (
        <>
          <SectionToolbar label="Vini (Wishlist)" onAddManual={()=> setShowAddWine(v=>!v)} onOcr={handleOcrInsertWine} showAdd={showAddWine}/>
          {showAddWine && <AddWineForm userId={userId} onInserted={refreshAll} />}

          <Table>
            <thead>
              <tr>
                <th style={{textAlign:'left',padding:10}}>Vino</th>
                <th style={{textAlign:'left',padding:10}}>Cantina</th>
                <th style={{textAlign:'left',padding:10}}>Denominazione</th>
                <th style={{textAlign:'left',padding:10}}>Regione</th>
                <th style={{textAlign:'right',padding:10}}>Annata</th>
                <th style={{textAlign:'right',padding:10}}>Grad.</th>
                <th style={{textAlign:'right',padding:10}}>Budget</th>
                <th style={{textAlign:'left',padding:10}}>Voto</th>
                <th style={{textAlign:'left',padding:10,minWidth:220}}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><TCell>Caricamento…</TCell></tr>}
              {!loading && wines.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
              {wines.map(row=>{
                const blend = Array.isArray(row.grape_blend)&&row.grape_blend.length ? row.grape_blend.map(b=> (b.pct!=null?`${b.pct}% `:'') + b.name).join(', ')
                           : (Array.isArray(row.grapes)? row.grapes.join(', ') : '');
                return (
                  <tr key={row.id}>
                    <TCell>
                      <span role="button" onClick={()=>focusWineOnMap(row.id)} title="Mostra sulla mappa"
                            style={{cursor:'pointer',textDecoration:'underline dotted'}}>{row.name}</span>
                      {blend ? <div style={{opacity:.75,fontSize:12}}>{blend}</div> : null}
                    </TCell>
                    <TCell>{row.winery || '—'}</TCell>
                    <TCell>{row.denomination || '—'}</TCell>
                    <TCell>{row.region || inferRegion(row.name,row.denomination) || '—'}</TCell>
                    <TCell right>{row.vintage || '—'}</TCell>
                    <TCell right>{row.alcohol!=null ? `${Number(row.alcohol).toFixed(1)}%` : '—'}</TCell>
                    <TCell right>{row.price_target!=null ? `€ ${Number(row.price_target).toFixed(2)}` : '—'}</TCell>
                    <TCell><Stars value={row.rating_5 || 0} onChange={(n)=>setRating(row.id,n)} /></TCell>
                    <TCell>
                      <div className="actions-desktop" style={{display:'none',gap:6,flexWrap:'wrap'}}>
                        <button style={btn(false)} onClick={()=>addPlaceFor('wine',row.id,'purchase')}>Dove l’ho bevuto</button>
                        <button style={btn(false)} onClick={()=>deleteWineRow(row.id)}>Elimina</button>
                      </div>
                      <div className="actions-mobile">
                        <ActionsMobile options={[
                          {value:'drank',label:'Dove l’ho bevuto'},
                          {value:'del',label:'Elimina'}
                        ]} onAction={(v)=>{
                          if (v==='drank') addPlaceFor('wine',row.id,'purchase');
                          if (v==='del') deleteWineRow(row.id);
                        }}/>
                      </div>
                    </TCell>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </>
      )}

      {/* ===== CELLAR ===== */}
      {tab === 'cellar' && (
        <>
          <SectionToolbar label="Cantina" onAddManual={()=> setShowAddCellar(v=>!v)} onOcr={()=>alert('Per OCR carta usa i pulsanti Sommelier in alto 😉')} showAdd={showAddCellar}/>
          {showAddCellar && <AddCellarForm userId={userId} onInserted={refreshAll} wines={wines} />}

          <Table>
            <thead>
              <tr>
                <th style={{textAlign:'left',padding:10}}>Vino</th>
                <th style={{textAlign:'right',padding:10}}>Bottiglie</th>
                <th style={{textAlign:'right',padding:10}}>Prezzo acquisto</th>
                <th style={{textAlign:'left',padding:10}}>Abbinamenti</th>
                <th style={{textAlign:'left',padding:10,minWidth:220}}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><TCell>Caricamento…</TCell></tr>}
              {!loading && cellar.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
              {cellar.map(row=>(
                <tr key={row.id}>
                  <TCell>
                    <span role="button" onClick={()=> row.wine?.id && focusWineOnMap(row.wine.id)}
                          style={{cursor:'pointer',textDecoration:'underline dotted'}}>{row.wine?.name || '—'}</span>
                  </TCell>
                  <TCell right>{row.bottles}</TCell>
                  <TCell right>{row.purchase_price_eur!=null ? `€ ${Number(row.purchase_price_eur).toFixed(2)}` : '—'}</TCell>
                  <TCell>{(row.pairings || []).join(', ') || '—'}</TCell>
                  <TCell>
                    <div className="actions-desktop" style={{display:'none',gap:6,flexWrap:'wrap'}}>
                      <button style={btn(false)} onClick={()=>addPlaceFor('wine',row.wine?.id || row.wine_id,'purchase')}>Dove l’ho comprato</button>
                    </div>
                    <div className="actions-mobile">
                      <ActionsMobile options={[{value:'bought',label:'Dove l’ho comprato'}]}
                        onAction={(v)=> v==='bought' && addPlaceFor('wine',row.wine?.id || row.wine_id,'purchase')}/>
                    </div>
                  </TCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {/* MAPPA */}
      <section id="map-italia" style={{ background:'#0b0f14', border:'1px solid #1f2a38', borderRadius:16, padding:12, marginTop:16, marginBottom:8 }}>
        <h3 style={{ color:'#cdeafe', margin:'8px 8px 12px' }}>Mappa Italia — Origine (rosso) • Consumo/Acquisto (blu)</h3>
        <MapContainer center={[mapCenter[1], mapCenter[0]]} zoom={mapZoom} scrollWheelZoom style={{ width:'100%', height:420, borderRadius:16 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          {places.map(p=>{
            const color = p.kind==='origin' ? '#ef4444' : '#3b82f6';
            const isSel = selectedPlaceId===p.id;
            const wine = (p.item_type==='wine') ? wineById[p.item_id] : null;
            const blend = wine?.grapes?.join(', ') || (Array.isArray(wine?.grape_blend) ? wine.grape_blend.map(b=> (b.pct?`${b.pct}% `:'')+b.name).join(', ') : '');
            const info = popupInfo[p.id] || {};
            return (
              <CircleMarker key={p.id} center={[p.lat,p.lng]} radius={isSel ? 7 : 5} pathOptions={{color,fillColor:color,fillOpacity:1}}
                            eventHandlers={{ click: ()=> loadPopupInfo(p) }}>
                {isSel ? <CircleMarker center={[p.lat,p.lng]} radius={12} pathOptions={{color,fillColor:color,fillOpacity:0.12}}/> : null}
                <Tooltip direction="top">{p.place_name || (wine?.name || '')}</Tooltip>
                {p.item_type==='wine' && (
                  <Popup>
                    <div style={{minWidth:220}}>
                      <div style={{fontWeight:700, marginBottom:4}}>{wine?.name || 'Vino'}</div>
                      <div style={{opacity:.9}}>
                        {wine?.denomination || '—'}{wine?.region ? ` • ${wine.region}` : ''}{wine?.vintage ? ` • ${wine.vintage}` : ''}
                      </div>
                      {blend ? <div style={{opacity:.85, marginTop:4}}>Vitigni: {blend}</div> : null}
                      {info?.vintages?.length ? <div style={{marginTop:6}}>Annate migliori: <strong>{info.vintages.join(', ')}</strong></div> : null}
                      {info?.pairing ? <div style={{marginTop:6}}>Abbinamento: {info.pairing}</div> : null}
                    </div>
                  </Popup>
                )}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </section>

      {/* Toasts */}
      <div className="toast-wrap">{toasts.map(t => (<div key={t.id} className="toast">{t.msg}</div>))}</div>

      {/* CSS extra */}
      <style jsx>{`
        @media (min-width: 768px){
          .actions-desktop{ display:flex !important; }
          .actions-mobile { display:none; }
        }
        .toast-wrap{ position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; z-index: 9999; pointer-events: none; }
        .toast{ background: rgba(15,23,42,0.95); border: 1px solid #1f2a38; color: #e5eeff; padding: 10px 12px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.35); font-weight: 600; pointer-events: auto; }
      `}</style>
    </>
  );
}

export default withAuth(ProdottiTipiciViniPage);
