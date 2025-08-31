// pages/prodotti-tipici-vini.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

// Leaflet (no SSR)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr:false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr:false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr:false });
const Tooltip      = dynamic(() => import('react-leaflet').then(m => m.Tooltip),      { ssr:false });

/* ----------------- UI helpers ----------------- */
const inp = { padding:'10px 12px', borderRadius:12, border:'1px solid #243246', background:'#0b0f14', color:'#e5eeff' };
const btn = (active=false)=>({
  padding:'10px 14px', borderRadius:12,
  border:'1px solid ' + (active ? '#60a5fa' : '#2b3645'),
  background: active ? 'linear-gradient(180deg,#0f1e2d,#0b1520)' : 'transparent',
  color: active ? '#e6f0ff' : '#c7d2fe', cursor:'pointer'
});
const Table = ({children})=>(
  <div style={{overflowX:'auto',background:'#0b0f14',borderRadius:16}}>
    <table style={{width:'100%',borderCollapse:'collapse',color:'#e5eeff'}}>{children}</table>
  </div>
);
const TCell = ({children, right, colSpan})=>(
  <td colSpan={colSpan} style={{padding:'10px 8px',borderBottom:'1px solid #1f2a38',textAlign:right?'right':'left'}}>{children}</td>
);
const Stars = ({value=0,onChange})=>(
  <span aria-label="rating" style={{display:'inline-flex',gap:4}}>
    {[1,2,3,4,5].map(n=>(
      <span key={n} role="button" onClick={()=>onChange?.(n)} style={{cursor:'pointer',fontSize:18,userSelect:'none'}}>
        {n <= (value||0) ? '★' : '☆'}
      </span>
    ))}
  </span>
);

/* ------------- MOBILE actions (select) ------------- */
function ActionsMobile({ options, onAction }) {
  return (
    <select
      aria-label="Azioni"
      onChange={e => { const v=e.target.value; if(v){ onAction(v); e.target.value=''; } }}
      style={{...inp, padding:'8px 10px', width:'100%'}}
    >
      <option value="">Azioni…</option>
      {options.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ===== Toolbar sezione (Manuale / OCR / Vocale) ===== */
function SectionToolbar({ label, onAddManual, onOcr, onVoice, showAdd }) {
  return (
    <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px', flexWrap:'wrap' }}>
      <span style={{ color:'#cdeafe', fontWeight:700 }}>{label}</span>
      <button onClick={onAddManual} style={btn(true)}>{showAdd ? 'Chiudi' : 'Aggiungi manuale'}</button>
      <button onClick={onOcr} style={btn(false)}>OCR (foto)</button>
      <button onClick={onVoice} style={btn(false)}>Vocale</button>
    </div>
  );
}

/* ===== Drawer Sommelier ===== */
function SommelierDrawer({ data, onClose }) {
  const recs = data?.recommendations || [];
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'flex-end', zIndex:50 }}>
      <div style={{ width:'min(520px,96vw)', height:'100%', background:'#0b0f14', borderLeft:'1px solid #1f2a38', padding:16, overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h3 style={{ margin:0 }}>Sommelier – risultati</h3>
          <button onClick={onClose} style={btn(false)}>Chiudi</button>
        </div>
        {recs.length === 0 && <p style={{ opacity:0.8 }}>{data?.notes || 'Nessun risultato.'}</p>}
        {recs.map((r,i)=>(
          <div key={i} style={{ border:'1px solid #1f2a38', borderRadius:12, padding:12, marginBottom:10 }}>
            <div style={{ fontWeight:700 }}>{r.name} {r.vintage_suggestion?.length ? `(${r.vintage_suggestion.join(', ')})` : ''}</div>
            <div style={{ opacity:0.85 }}>{r.winery || '—'} • {r.denomination || '—'} • {r.region || '—'}</div>
            <div style={{ marginTop:6 }}>{r.why}</div>
            <div style={{ marginTop:6, display:'flex', gap:8, flexWrap:'wrap' }}>
              {(r.links || []).map((l,idx)=>(<a key={idx} href={l.url} target="_blank" rel="noreferrer" style={btn(false)}>{l.title || 'Link'}</a>))}
              {r.typical_price_eur != null && <span style={{ alignSelf:'center', opacity:0.9 }}>~ € {Number(r.typical_price_eur).toFixed(2)}</span>}
            </div>
          </div>
        ))}
        {data?.notes && recs.length>0 && <p style={{ opacity:0.8, marginTop:12 }}>{data.notes}</p>}
      </div>
    </div>
  );
}

/* ===== Live QR Scanner (best-effort) ===== */
function LiveQrScanner({ onClose, onResult }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const loopRef = useRef(null);

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); startLoop(); }
      } catch (e) { alert('Fotocamera non disponibile'); onClose?.(); }
    })();
    return () => { stopLoop(); try { stream?.getTracks?.().forEach(t=>t.stop()); } catch {} };
  }, [onClose]);

  function startLoop(){ loopRef.current=setInterval(scan, 350); }
  function stopLoop(){ if(loopRef.current) clearInterval(loopRef.current); loopRef.current=null; }

  async function scan(){
    const jsQR = (await import('jsqr')).default;
    const v=videoRef.current, c=canvasRef.current; if(!v||!c||v.readyState<2) return;
    const w=v.videoWidth,h=v.videoHeight; c.width=w; c.height=h;
    const ctx=c.getContext('2d'); ctx.drawImage(v,0,0,w,h);
    const img=ctx.getImageData(0,0,w,h); const code=jsQR(img.data,img.width,img.height);
    if(code&&code.data){ stopLoop(); onResult?.(code.data); }
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
        <p style={{ opacity:.8, marginTop:8 }}>Inquadra il QR del menù. Se leggibile, apro il Sommelier sulla pagina collegata.</p>
      </div>
    </div>
  );
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
      name: form.name.trim(),
      winery: form.winery || null,
      denomination: form.denomination || null,
      region: form.region || null,
      grapes: grapesArr,
      vintage: form.vintage ? Number(form.vintage) : null,
      style: form.style || null,
      price_target: form.price_target ? Number(form.price_target) : null
    }]).select().single();
    if (error) return alert('Errore vino: ' + error.message);

    const places = [];
    if (form.origin_lat && form.origin_lng) places.push({
      user_id: userId, item_type:'wine', item_id:newWine.id, kind:'origin',
      place_name: form.origin_place_name || null,
      lat: Number(form.origin_lat), lng: Number(form.origin_lng), is_primary:true
    });
    if (form.purchase_lat && form.purchase_lng) places.push({
      user_id: userId, item_type:'wine', item_id:newWine.id, kind:'purchase',
      place_name: form.purchase_place_name || null,
      lat: Number(form.purchase_lat), lng: Number(form.purchase_lng), is_primary:true
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
      user_id: userId,
      name: form.name.trim(),
      category: form.category,
      designation: form.designation || null,
      price_eur: form.price_eur ? Number(form.price_eur) : null,
      notes: form.notes || null
    }]).select().single();
    if (error) return alert('Errore prodotto: ' + error.message);

    const rows = [];
    if (form.origin_lat && form.origin_lng) rows.push({ user_id:userId, item_type:'artisan', item_id:data.id, kind:'origin',   place_name:form.origin_place_name||null,   lat:Number(form.origin_lat),   lng:Number(form.origin_lng),   is_primary:true });
    if (form.purchase_lat && form.purchase_lng) rows.push({ user_id:userId, item_type:'artisan', item_id:data.id, kind:'purchase', place_name:form.purchase_place_name||null, lat:Number(form.purchase_lat), lng:Number(form.purchase_lng), is_primary:true });
    if (rows.length) {
      const { error:e2 } = await supabase.from('product_places').insert(rows);
      if (e2) alert('Errore luogo: '+e2.message);
    }
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

/* ===================== FORM: CANTINA ===================== */
const AddCellarForm = React.forwardRef(function AddCellarForm({ userId, wines, onInserted }, ref) {
  const [form, setForm] = useState({ wine_id:'', bottles:'1', purchase_price_eur:'', pairings:'' });
  React.useImperativeHandle(ref, () => ({ reset(){ setForm({ wine_id:'', bottles:'1', purchase_price_eur:'', pairings:'' }); } }), []);
  const handleInsert = useCallback(async ()=>{
    if (!userId) return alert('Sessione assente.');
    if (!form.wine_id) return alert('Seleziona un vino');
    const bottles = form.bottles ? Number(form.bottles) : 1;
    const price   = form.purchase_price_eur ? Number(form.purchase_price_eur) : null;
    const pair    = form.pairings ? form.pairings.split(',').map(s=>s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('cellar').insert([{ user_id: userId, wine_id: form.wine_id, bottles, purchase_price_eur: price, pairings: pair }]);
    if (error) return alert('Errore: '+error.message);
    onInserted?.();
    ref?.current?.reset?.();
  }, [form, onInserted, ref, userId]);

  return (
    <section style={{ marginBottom:16, padding:12, borderRadius:16, background:'#0b0f14', border:'1px solid #1f2a38' }}>
      <h3 style={{ margin:'0 0 8px' }}>Aggiungi in Cantina</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
        <select value={form.wine_id} onChange={e=>setForm({...form, wine_id:e.target.value})} style={inp}>
          <option value="">Seleziona vino…</option>
          {wines.map(w => <option key={w.id} value={w.id}>{w.name}{w.winery?` - ${w.winery}`:''}</option>)}
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
  const [wines, setWines] = useState([]);
  const [cellar, setCellar] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddArtisan, setShowAddArtisan] = useState(false);
  const [showAddWine, setShowAddWine]       = useState(false);
  const [showAddCellar, setShowAddCellar]   = useState(false);

  // MAP
  const [mapCenter, setMapCenter] = useState([12.5, 42.5]); // [lng, lat]
  const [mapZoom, setMapZoom] = useState(5);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);

  // sessione come spese-casa.js
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
    } catch (e) {
      console.error(e); alert('Errore caricamento: ' + (e?.message || e));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const openOnMapForItem = useCallback((itemType, itemId, kind='origin')=>{
    const candidates = places.filter(p => p.item_type === itemType && p.item_id === itemId && p.kind === kind);
    if (!candidates.length) { alert(`Nessun luogo “${kind}” per questo elemento`); return; }
    const target = candidates.find(c => c.is_primary) || candidates[0];
    setMapCenter([target.lng, target.lat]); setMapZoom(6); setSelectedPlaceId(target.id);
    document.getElementById('map-italia')?.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>setSelectedPlaceId(null), 2500);
  }, [places]);

  /* ---------- Geocoding & geolocation (senza chiavi) ---------- */
  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=0`);
      const j = await r.json(); return j?.display_name || null;
    } catch { return null; }
  }
  async function searchGeocode(query) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=0`);
      const j = await r.json(); if (Array.isArray(j) && j.length) return { name:j[0].display_name||query, lat:Number(j[0].lat), lng:Number(j[0].lon) };
    } catch {}
    return null;
  }
  async function getCurrentPlaceOrAsk(kindLabel) {
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy:true, timeout:10000 }));
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      return { lat, lng, name: await reverseGeocode(lat,lng) };
    } catch {
      const manual = prompt(`Inserisci il luogo (${kindLabel}) es. "Enoteca X, Alba"`);
      if (!manual) return null;
      const hit = await searchGeocode(manual);
      if (!hit) { alert('Impossibile geocodificare.'); return null; }
      return hit;
    }
  }
  async function addPlaceFor(itemType, itemId, kind) {
    if (!userId) return alert('Sessione assente');
    const p = await getCurrentPlaceOrAsk(kind==='purchase'?'dove l’hai acquistato/consumato':'origine');
    if (!p) return;
    const { error } = await supabase.from('product_places').insert([{
      user_id:userId, item_type:itemType, item_id:itemId, kind,
      place_name: p.name || `(${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`,
      lat:p.lat, lng:p.lng, is_primary:true
    }]);
    if (error) return alert('Errore salvataggio luogo: ' + error.message);
    alert('Luogo aggiunto!'); refreshAll();
  }

  /* ---------------- Sommelier + OCR/QR ---------------- */
  const [q, setQ] = useState('');
  const [sommelierOpen, setSommelierOpen] = useState(false);
  const [sommelierData, setSommelierData] = useState(null);
  const fileRef = useRef(null);
  const [showQr, setShowQr] = useState(false);

  async function askSommelier(payload={}) {
    const r = await fetch('/api/sommelier', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ query:q || 'Consigliami il migliore in base al mio gusto', ...payload })
    });
    const j = await r.json();
    setSommelierData(j); setSommelierOpen(true);
  }
  async function dataUrlFromFile(file) {
    return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });
  }
  function extractTasteHints(text) {
    const t = (q+' '+(text||'')).toLowerCase(), h={tags:[]};
    if (/\b(non troppo aspro|poco aspro|morbido|rotondo)\b/.test(t)) h.acidity='low';
    else if (/\bmolto fresco|tagliente|acido\b/.test(t)) h.acidity='high';
    if (/\bmorbido|setoso|poco tannico\b/.test(t)) h.tannin='low';
    else if (/\btannico|ruvido|astringente\b/.test(t)) h.tannin='high';
    if (/\bleggero|fresco beverino|snello\b/.test(t)) h.body='light';
    else if (/\bstrutturato|corposo|pieno\b/.test(t)) h.body='full';
    if (/\bsecco\b/.test(t)) h.sweetness='dry';
    else if (/\bdolce|abboccato|amabile\b/.test(t)) h.sweetness='sweet';
    ['fruttato','speziato','minerale','aromatico'].forEach(tg=>{ if (new RegExp(`\\b${tg}\\b`).test(t)) h.tags.push(tg); });
    return h;
  }
  async function handleSommelierOcrFile(file) {
    try {
      const dataUrl = await dataUrlFromFile(file);
      const r1 = await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})});
      const j1 = await r1.json();
      const listText = (j1?.text || '').trim();
      if (!listText) { alert('OCR: nessun testo letto dalla foto.'); return; }
      await askSommelier({ wineList:listText, tasteHints: extractTasteHints(listText), qrLinks:[] });
    } catch(e){ alert('Errore Sommelier OCR: '+(e?.message||e)); }
  }

  /* ---------- Normalizer (OCR/Vocale per inserimenti) ---------- */
  async function normalizeText(text,target) {
    const r = await fetch('/api/ingest/normalize', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text, target }) });
    return r.json();
  }
  async function ocrToData(target) {
    const input = document.createElement('input');
    input.type='file'; input.accept='image/*'; input.capture='environment';
    input.onchange = async e => {
      const f = e.target.files?.[0]; if (!f) return;
      const dataUrl = await dataUrlFromFile(f);
      const r1 = await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})});
      const j1 = await r1.json();
      const text = j1?.text || '';
      if (!text) { alert('OCR: nessun testo.'); return; }
      const norm = await normalizeText(text,target); norm._raw = text;
      await autoInsertFromNorm(norm);
    };
    input.click();
  }
  async function voiceToData(target) {
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        await new Promise((resolve,reject)=>{
          const rec=new SR(); rec.lang='it-IT'; rec.interimResults=false; rec.maxAlternatives=1;
          rec.onresult= async (ev)=>{ const text=ev.results?.[0]?.[0]?.transcript || ''; if (!text) return resolve();
            const norm=await normalizeText(text,target); norm._raw=text; await autoInsertFromNorm(norm); resolve(); };
          rec.onerror=(e)=>reject(e?.error||'STT errore'); rec.onend=resolve; rec.start();
        });
        return;
      }
      // fallback 5s recorder → /api/stt
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const rec = new MediaRecorder(stream, { mimeType:'audio/webm' }); const chunks=[]; rec.ondataavailable=e=>chunks.push(e.data);
      const done=new Promise(res=>rec.onstop=res); rec.start(); setTimeout(()=>rec.stop(),5000); await done;
      const blob = new Blob(chunks,{type:'audio/webm'}); const fd=new FormData(); fd.append('file',blob,'audio.webm');
      const r = await fetch('/api/stt',{method:'POST',body:fd}); const j=await r.json(); const text=j?.text||'';
      if (!text) return;
      const norm=await normalizeText(text,target); norm._raw=text; await autoInsertFromNorm(norm);
    } catch(e){ alert('Errore voce: '+(e?.message||e)); }
  }

  async function autoInsertFromNorm(norm) {
    if (!userId) return alert('Sessione assente');
    const d = norm?.data || {};
    const raw = norm?._raw || '';
    if (norm?.kind === 'artisan') {
      const pr = d.pricing || {};
      const name = (d.name?.trim()) || `Prodotto (da completare) ${new Date().toISOString().slice(0,10)}`;
      const note = [
        d.producer ? `Produttore: ${d.producer}` : null,
        pr.unit==='kg' && pr.unit_price_eur!=null ? `€ ${Number(pr.unit_price_eur).toFixed(2)}/kg` : null,
        pr.quantity_kg!=null ? `Peso ${Number(pr.quantity_kg).toFixed(3)}kg` : null,
        pr.total_price_eur!=null ? `Totale € ${Number(pr.total_price_eur).toFixed(2)}` : null,
        !d.name && raw ? `[OCR] ${raw.slice(0,100)}…` : null
      ].filter(Boolean).join(' — ');
      const price = (pr.unit==='kg' && pr.unit_price_eur!=null) ? pr.unit_price_eur : (pr.total_price_eur ?? d.price_eur ?? null);
      const { data: inserted, error } = await supabase.from('artisan_products').insert([{
        user_id:userId, name, category:(d.product_type==='salume'?'salume':'formaggio'),
        designation:d.designation || null, price_eur:price, notes:note || null
      }]).select().single();
      if (error) return alert('Errore inserimento prodotto: '+error.message);
      const rows=[];
      if (d.origin?.lat && d.origin?.lng) rows.push({ user_id:userId,item_type:'artisan',item_id:inserted.id,kind:'origin',place_name:d.origin.name||null,lat:d.origin.lat,lng:d.origin.lng,is_primary:true });
      if (d.purchase?.lat && d.purchase?.lng) rows.push({ user_id:userId,item_type:'artisan',item_id:inserted.id,kind:'purchase',place_name:d.purchase.name||null,lat:d.purchase.lat,lng:d.purchase.lng,is_primary:true });
      if (rows.length) await supabase.from('product_places').insert(rows);
      return refreshAll();
    }
    if (norm?.kind === 'wine') {
      const name = (d.name?.trim()) || `Vino (da completare) ${new Date().toISOString().slice(0,10)}`;
      const note = [
        d.bottle_l ? `Bott ${Number(d.bottle_l).toFixed(2)}L` : null,
        d.unit_price_l!=null ? `~€ ${Number(d.unit_price_l).toFixed(2)}/L` : null,
        !d.name && raw ? `[OCR] ${raw.slice(0,100)}…` : null
      ].filter(Boolean).join(' — ');
      const { data: inserted, error } = await supabase.from('wines').insert([{
        user_id:userId, name, winery:d.winery||null, denomination:d.denomination||null, region:d.region||null,
        grapes:Array.isArray(d.grapes)?d.grapes:null, vintage:d.vintage??null, style:d.style||null,
        price_target:d.price_eur??null, notes:note || null, alcohol:d.alcohol??null, grape_blend:Array.isArray(d.grape_blend)?d.grape_blend:null
      }]).select().single();
      if (error) return alert('Errore inserimento vino: '+error.message);
      const rows=[];
      if (d.origin?.lat && d.origin?.lng) rows.push({ user_id:userId,item_type:'wine',item_id:inserted.id,kind:'origin',place_name:d.origin.name||null,lat:d.origin.lat,lng:d.origin.lng,is_primary:true });
      if (d.purchase?.lat && d.purchase?.lng) rows.push({ user_id:userId,item_type:'wine',item_id:inserted.id,kind:'purchase',place_name:d.purchase.name||null,lat:d.purchase.lat,lng:d.purchase.lng,is_primary:true });
      if (rows.length) await supabase.from('product_places').insert(rows);
      return refreshAll();
    }
    alert('Non riconosciuto. Compila manualmente.');
  }

  /* ------------------- Rating ------------------- */
  const setRating = useCallback(async (id,n)=>{
    if (!userId) return;
    const { error } = await supabase.from('wines').update({ rating_5:n }).eq('id',id).eq('user_id',userId);
    if (error) return alert('Errore voto: '+error.message);
    refreshAll();
  },[userId,refreshAll]);

  /* ------------------- Render ------------------- */
  return (
    <>
      <Head><title>Prodotti tipici & Vini</title></Head>

      {/* Banner */}
      <div style={{ width:'100%', height:220, overflow:'hidden', borderRadius:16, marginBottom:16, position:'relative' }}>
        <video src="/intro.mp4" muted loop playsInline autoPlay style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
        <div style={{
          position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.35))', color:'#fff', fontWeight:700, fontSize:28, letterSpacing:1.2,
          pointerEvents:'none'
        }}>
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
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder='Es: "Barolo non troppo aspro", "bianco fresco <€20"'
          style={{ flex:1, minWidth:240, ...inp }}
        />
        <button onClick={()=>askSommelier()} style={btn(true)}>Sommelier</button>
        <button onClick={()=>fileRef.current?.click()} style={btn(false)}>Sommelier (OCR)</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
               onChange={e=> e.target.files?.[0] && handleSommelierOcrFile(e.target.files[0])}/>
        <button onClick={()=>setShowQr(true)} style={btn(false)}>Scanner QR</button>
      </div>

      {showQr && <LiveQrScanner onClose={()=>setShowQr(false)} onResult={async (url)=>{ setShowQr(false); await askSommelier({ wineList:'', qrLinks:[url], tasteHints:{} }); }}/>}
      {sommelierOpen && <SommelierDrawer data={sommelierData} onClose={()=>setSommelierOpen(false)} />}

      {/* ===== ARTISAN ===== */}
      {tab === 'artisan' && (
        <>
          <SectionToolbar
            label="Formaggi & Salumi"
            onAddManual={()=> setShowAddArtisan(v=>!v)}
            onOcr={()=> ocrToData('artisan')}
            onVoice={()=> voiceToData('artisan')}
            showAdd={showAddArtisan}
          />
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
                      <button style={btn(false)} onClick={()=>openOnMapForItem('artisan',row.id,'origin')}>Mappa Origine</button>
                      <button style={btn(false)} onClick={()=>openOnMapForItem('artisan',row.id,'purchase')}>Mappa Acquisto</button>
                    </div>
                    <div className="actions-mobile">
                      <ActionsMobile
                        options={[
                          {value:'ate',label:'Dove l’ho mangiato'},
                          {value:'mo',label:'Mappa Origine'},
                          {value:'mp',label:'Mappa Acquisto'},
                        ]}
                        onAction={(v)=>{
                          if (v==='ate') addPlaceFor('artisan',row.id,'purchase');
                          if (v==='mo')  openOnMapForItem('artisan',row.id,'origin');
                          if (v==='mp')  openOnMapForItem('artisan',row.id,'purchase');
                        }}
                      />
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
          <SectionToolbar
            label="Vini (Wishlist)"
            onAddManual={()=> setShowAddWine(v=>!v)}
            onOcr={()=> ocrToData('wine')}
            onVoice={()=> voiceToData('wine')}
            showAdd={showAddWine}
          />
          {showAddWine && <AddWineForm userId={userId} onInserted={refreshAll} />}

          <Table>
            <thead>
              <tr>
                <th style={{textAlign:'left',padding:10}}>Vino</th>
                <th style={{textAlign:'left',padding:10}}>Cantina</th>
                <th style={{textAlign:'left',padding:10}}>Denominazione</th>
                <th style={{textAlign:'right',padding:10}}>Grad.</th>
                <th style={{textAlign:'left',padding:10}}>Vitigni / Blend</th>
                <th style={{textAlign:'left',padding:10}}>Regione</th>
                <th style={{textAlign:'right',padding:10}}>Annata</th>
                <th style={{textAlign:'right',padding:10}}>Budget</th>
                <th style={{textAlign:'left',padding:10}}>Voto</th>
                <th style={{textAlign:'left',padding:10,minWidth:260}}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><TCell>Caricamento…</TCell></tr>}
              {!loading && wines.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
              {wines.map(row=>{
                const blend = Array.isArray(row.grape_blend)&&row.grape_blend.length
                  ? row.grape_blend.map(b=> (b.pct!=null?`${b.pct}% `:'') + b.name).join(', ')
                  : (Array.isArray(row.grapes)? row.grapes.join(', ') : '—');
                return (
                  <tr key={row.id}>
                    <TCell>{row.name}</TCell>
                    <TCell>{row.winery || '—'}</TCell>
                    <TCell>{row.denomination || '—'}</TCell>
                    <TCell right>{row.alcohol!=null ? `${Number(row.alcohol).toFixed(1)}%` : '—'}</TCell>
                    <TCell>{blend}</TCell>
                    <TCell>{row.region || '—'}</TCell>
                    <TCell right>{row.vintage || '—'}</TCell>
                    <TCell right>{row.price_target!=null ? `€ ${Number(row.price_target).toFixed(2)}` : '—'}</TCell>
                    <TCell><Stars value={row.rating_5 || 0} onChange={(n)=>setRating(row.id,n)} /></TCell>
                    <TCell>
                      <div className="actions-desktop" style={{display:'none',gap:6,flexWrap:'wrap'}}>
                        <button style={btn(false)} onClick={()=>addPlaceFor('wine',row.id,'purchase')}>Dove l’ho bevuto</button>
                        <button style={btn(false)} onClick={()=>openOnMapForItem('wine',row.id,'origin')}>Mappa Origine</button>
                        <button style={btn(false)} onClick={()=>openOnMapForItem('wine',row.id,'purchase')}>Mappa Acquisto</button>
                        <button style={btn(false)} onClick={()=>navigator.clipboard.writeText(row.name)}>Copia nome</button>
                      </div>
                      <div className="actions-mobile">
                        <ActionsMobile
                          options={[
                            {value:'drank',label:'Dove l’ho bevuto'},
                            {value:'mo',label:'Mappa Origine'},
                            {value:'mp',label:'Mappa Acquisto'},
                            {value:'copy',label:'Copia nome'},
                          ]}
                          onAction={(v)=>{
                            if (v==='drank') addPlaceFor('wine',row.id,'purchase');
                            if (v==='mo') openOnMapForItem('wine',row.id,'origin');
                            if (v==='mp') openOnMapForItem('wine',row.id,'purchase');
                            if (v==='copy') navigator.clipboard.writeText(row.name);
                          }}
                        />
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
          <SectionToolbar
            label="Cantina"
            onAddManual={()=> setShowAddCellar(v=>!v)}
            onOcr={()=> ocrToData('wine')}
            onVoice={()=> voiceToData('wine')}
            showAdd={showAddCellar}
          />
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
                  <TCell>{row.wine?.name || '—'}</TCell>
                  <TCell right>{row.bottles}</TCell>
                  <TCell right>{row.purchase_price_eur!=null ? `€ ${Number(row.purchase_price_eur).toFixed(2)}` : '—'}</TCell>
                  <TCell>{(row.pairings || []).join(', ') || '—'}</TCell>
                  <TCell>
                    <div className="actions-desktop" style={{display:'none',gap:6,flexWrap:'wrap'}}>
                      <button style={btn(false)} onClick={()=>addPlaceFor('wine',row.wine?.id || row.wine_id,'purchase')}>Dove l’ho comprato</button>
                    </div>
                    <div className="actions-mobile">
                      <ActionsMobile
                        options={[{value:'bought',label:'Dove l’ho comprato'}]}
                        onAction={(v)=> v==='bought' && addPlaceFor('wine',row.wine?.id || row.wine_id,'purchase')}
                      />
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
        <h3 style={{ color:'#cdeafe', margin:'8px 8px 12px' }}>Mappa Italia — Origini (rosso) • Acquisto/Consumo (blu)</h3>
        <MapContainer center={[mapCenter[1], mapCenter[0]]} zoom={mapZoom} scrollWheelZoom style={{ width:'100%', height:420, borderRadius:16 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          {places.map(p=>{
            const color = p.kind==='origin' ? '#ef4444' : '#3b82f6';
            const sel = selectedPlaceId===p.id;
            return (
              <CircleMarker key={p.id} center={[p.lat,p.lng]} radius={sel?7:5} pathOptions={{color,fillColor:color,fillOpacity:1}}>
                {p.place_name ? <Tooltip direction="top">{p.place_name}</Tooltip> : null}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </section>

      {/* responsive CSS (azioni su desktop) */}
      <style jsx>{`
        @media (min-width: 768px){
          .actions-desktop{ display:flex !important; }
          .actions-mobile { display:none; }
        }
      `}</style>
    </>
  );
}

export default withAuth(ProdottiTipiciViniPage);
