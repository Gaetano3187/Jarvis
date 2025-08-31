// pages/prodotti-tipici-vini.js
// Pagina "Prodotti tipici & Vini" – versione chiara e ordinata
// - Inserimento Vini via OCR/Vocale (diretto in tabella)
// - "Dove l'ho bevuto/comprato" con geolocalizzazione e aggiornamento mappa
// - Geocoding base dell'origine (rosso) quando ricavabile

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

/* ============================== Map (no SSR) ============================== */
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr:false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr:false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr:false });
const Tooltip      = dynamic(() => import('react-leaflet').then(m => m.Tooltip),      { ssr:false });

/* ============================== UI Helpers ================================ */
const inp = { padding:'10px 12px', borderRadius:12, border:'1px solid #243246', background:'#0b0f14', color:'#e5eeff' };
const btn = (active=false)=>({
  padding:'10px 14px',
  borderRadius:12,
  border:'1px solid ' + (active ? '#60a5fa' : '#2b3645'),
  background: active ? 'linear-gradient(180deg,#0f1e2d,#0b1520)' : 'transparent',
  color: active ? '#e6f0ff' : '#c7d2fe',
  cursor:'pointer'
});
const Table = ({children})=>(
  <div style={{overflowX:'auto', background:'#0b0f14', borderRadius:16}}>
    <table style={{width:'100%', borderCollapse:'collapse', color:'#e5eeff'}}>{children}</table>
  </div>
);
const TCell = ({children, right, colSpan})=>(
  <td colSpan={colSpan} style={{ padding:'10px 8px', borderBottom:'1px solid #1f2a38', textAlign:right?'right':'left' }}>
    {children}
  </td>
);
const Stars = ({value=0, onChange})=>(
  <span aria-label="rating" style={{ display:'inline-flex', gap:4 }}>
    {[1,2,3,4,5].map(n=>(
      <span key={n} role="button" onClick={()=>onChange?.(n)} style={{ cursor:'pointer', fontSize:18, userSelect:'none' }}>
        {n <= (value||0) ? '★' : '☆'}
      </span>
    ))}
  </span>
);

/* ------------------------------ Toolbar ---------------------------------- */
function SectionToolbar({ label, onAddManual, onOcr, onVoice, showAdd }) {
  return (
    <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px', flexWrap:'wrap' }}>
      <span style={{ color:'#cdeafe', fontWeight:700 }}>{label}</span>
      <button onClick={onAddManual} style={btn(true)}>{showAdd ? 'Chiudi' : 'Aggiungi manuale'}</button>
      {!!onOcr   && <button onClick={onOcr}   style={btn(false)}>OCR (foto)</button>}
      {!!onVoice && <button onClick={onVoice} style={btn(false)}>Vocale</button>}
    </div>
  );
}

/* ============================== Form – ARTISAN ============================ */
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

  const handleInsert = useCallback(async ()=>{
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
    if (form.origin_lat && form.origin_lng) rows.push({
      user_id:userId, item_type:'artisan', item_id:data.id, kind:'origin',
      place_name:form.origin_place_name||null, lat:Number(form.origin_lat), lng:Number(form.origin_lng), is_primary:true
    });
    if (form.purchase_lat && form.purchase_lng) rows.push({
      user_id:userId, item_type:'artisan', item_id:data.id, kind:'purchase',
      place_name:form.purchase_place_name||null, lat:Number(form.purchase_lat), lng:Number(form.purchase_lng), is_primary:true
    });
    if (rows.length) await supabase.from('product_places').insert(rows);

    ref?.current?.reset?.();
    onInserted?.();
  }, [form, userId, onInserted, ref]);

  return (
    <section style={{ marginBottom:16, padding:12, borderRadius:16, background:'#0b0f14', border:'1px solid #1f2a38' }}>
      <h3 style={{ margin:'0 0 8px' }}>Aggiungi Formaggio/Salume</h3>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
        <input placeholder="Nome" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} style={inp}/>
        <select value={form.category} onChange={e=>setForm({...form, category:e.target.value})} style={inp}>
          <option value="formaggio">Formaggio</option>
          <option value="salume">Salume</option>
        </select>
        <input placeholder="Designazione (DOP/IGP…)" value={form.designation} onChange={e=>setForm({...form, designation:e.target.value})} style={inp}/>
        <input placeholder="Prezzo (€ o €/kg)" value={form.price_eur} onChange={e=>setForm({...form, price_eur:e.target.value})} style={inp}/>
        <input placeholder="Note" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} style={inp}/>

        <input placeholder="Origine - luogo (opz.)" value={form.origin_place_name} onChange={e=>setForm({...form, origin_place_name:e.target.value})} style={inp}/>
        <input placeholder="Origine - lat (opz.)"   value={form.origin_lat}        onChange={e=>setForm({...form, origin_lat:e.target.value})} style={inp}/>
        <input placeholder="Origine - lng (opz.)"   value={form.origin_lng}        onChange={e=>setForm({...form, origin_lng:e.target.value})} style={inp}/>

        <input placeholder="Acquisto/Consumo - luogo (opz.)" value={form.purchase_place_name} onChange={e=>setForm({...form, purchase_place_name:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - lat (opz.)"   value={form.purchase_lat}        onChange={e=>setForm({...form, purchase_lat:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - lng (opz.)"   value={form.purchase_lng}        onChange={e=>setForm({...form, purchase_lng:e.target.value})} style={inp}/>
      </div>

      <div style={{ marginTop:10, display:'flex', gap:8 }}>
        <button onClick={handleInsert} style={btn(true)}>Salva</button>
      </div>
    </section>
  );
});

/* ============================== Form – WINE (manuale) ===================== */
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

  const handleInsert = useCallback(async ()=>{
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
      user_id:userId, item_type:'wine', item_id:newWine.id, kind:'origin',
      place_name:form.origin_place_name||null, lat:Number(form.origin_lat), lng:Number(form.origin_lng), is_primary:true
    });
    if (form.purchase_lat && form.purchase_lng) places.push({
      user_id:userId, item_type:'wine', item_id:newWine.id, kind:'purchase',
      place_name:form.purchase_place_name||null, lat:Number(form.purchase_lat), lng:Number(form.purchase_lng), is_primary:true
    });
    if (places.length) await supabase.from('product_places').insert(places);

    if (form.addToCellar) {
      const bottles = form.bottles ? Number(form.bottles) : 1;
      const price   = form.purchase_price_eur ? Number(form.purchase_price_eur) : null;
      const { error:e3 } = await supabase.from('cellar').insert([{ user_id: userId, wine_id: newWine.id, bottles, purchase_price_eur: price }]);
      if (e3) alert('Errore cantina: '+e3.message);
    }

    ref?.current?.reset?.();
    onInserted?.();
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
        <input placeholder="Origine - lat (opz.)"   value={form.origin_lat}        onChange={e=>setForm({...form, origin_lat:e.target.value})} style={inp}/>
        <input placeholder="Origine - lng (opz.)"   value={form.origin_lng}        onChange={e=>setForm({...form, origin_lng:e.target.value})} style={inp}/>

        <input placeholder="Acquisto/Consumo - luogo (opz.)" value={form.purchase_place_name} onChange={e=>setForm({...form, purchase_place_name:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - lat (opz.)"   value={form.purchase_lat}        onChange={e=>setForm({...form, purchase_lat:e.target.value})} style={inp}/>
        <input placeholder="Acquisto/Consumo - lng (opz.)"   value={form.purchase_lng}        onChange={e=>setForm({...form, purchase_lng:e.target.value})} style={inp}/>
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

/* ============================== Form – CELLAR ============================= */
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
      const pair    = form.pairings
        ? form.pairings.split(',').map(s=>s.trim()).filter(Boolean)
        : null;

      const { error } = await supabase.from('cellar').insert([{
        user_id: userId,
        wine_id: form.wine_id,
        bottles,
        purchase_price_eur: price,
        pairings: pair
      }]);
      if (error) throw error;

      ref?.current?.reset?.();
      onInserted?.();
    } catch (e) {
      alert('Errore: ' + (e.message || e));
    }
  }, [form, userId, onInserted, ref]);

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

/* ============================== Pagina =================================== */
function ProdottiTipiciViniPage() {
  /* --------- Stato base & auth --------- */
  const [tab, setTab] = useState('wines'); // 'artisan' | 'wines' | 'cellar'
  const [userId, setUserId] = useState(null);

  const [places, setPlaces]   = useState([]);
  const [artisan, setArtisan] = useState([]);
  const [wines, setWines]     = useState([]);
  const [cellar, setCellar]   = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddArtisan, setShowAddArtisan] = useState(false);
  const [showAddWine, setShowAddWine]       = useState(false);
  const [showAddCellar, setShowAddCellar]   = useState(false);

  /* --------- Map state --------- */
  const [mapCenter, setMapCenter] = useState([12.5, 42.5]); // [lng, lat]
  const [mapZoom, setMapZoom]     = useState(5);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);

  /* --------- Toast --------- */
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((msg)=>{
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(()=> setToasts(t => t.filter(x=>x.id!==id)), 3000);
  },[]);

  /* --------- OCR input (Vini) --------- */
  const wineOcrRef = useRef(null);

  /* --------- Auth session --------- */
  useEffect(() => {
    let unsub = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      unsub = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user?.id || null));
    })();
    return () => { try { unsub?.data?.subscription?.unsubscribe?.(); } catch {} };
  }, []);

  /* --------- Fetch all (per user) --------- */
  const refreshAll = useCallback(async ()=>{
    if (!userId) return;
    setLoading(true);
    try {
      const [{ data: p }, { data: a }, { data: w }, { data: c }] = await Promise.all([
        supabase.from('product_places').select('*').eq('user_id', userId).order('created_at', { ascending:false }),
        supabase.from('artisan_products').select('*').eq('user_id', userId).order('created_at', { ascending:false }),
        supabase.from('wines').select('*').eq('user_id', userId).order('created_at', { ascending:false }),
        supabase.from('cellar').select('*').eq('user_id', userId).order('created_at', { ascending:false }),
      ]);
      setPlaces(p||[]); setArtisan(a||[]); setWines(w||[]);
      const mapWine = new Map((w||[]).map(x=>[x.id, x]));
      setCellar((c||[]).map(row=>({ ...row, wine: mapWine.get(row.wine_id) })));
    } catch (e) {
      alert('Errore caricamento: ' + (e.message || e));
    }
    setLoading(false);
  }, [userId]);
  useEffect(()=>{ refreshAll(); }, [refreshAll]);

  /* --------- Geocoding helpers --------- */
  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=0`);
      const j = await r.json(); return j?.display_name || null;
    } catch { return null; }
  }
  async function searchGeocode(query) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=0`);
      const j = await r.json(); if (Array.isArray(j) && j.length) {
        return { name:j[0].display_name||query, lat:Number(j[0].lat), lng:Number(j[0].lon) };
      }
    } catch {}
    return null;
  }
  async function geocodeLoose(placeText) { // per origine da testo
    if (!placeText) return null;
    return searchGeocode(placeText);
  }

  /* --------- Salva Luogo (bevuto/origine) --------- */
  async function getCurrentPlaceOrAsk(kindLabel) {
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy:true, timeout:10000 }));
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      return { lat, lng, name: await reverseGeocode(lat,lng) };
    } catch {
      const manual = prompt(`Inserisci il luogo (${kindLabel}) es. "Enoteca X, Alba"`);
      if (!manual) return null;
      return await searchGeocode(manual);
    }
  }
  async function addPlaceFor(itemType, itemId, kind) {
    try {
      if (!userId) return alert('Sessione assente.');
      const p = await getCurrentPlaceOrAsk(kind==='purchase'?'dove l’hai bevuto/acquistato':'origine');
      if (!p) return;

      const { error } = await supabase.from('product_places').insert([{
        user_id: userId,
        item_type: itemType,
        item_id: itemId,
        kind,
        place_name: p.name || `(${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`,
        lat: p.lat,
        lng: p.lng,
        is_primary: true
      }]);
      if (error) throw error;

      showToast(kind==='purchase' ? 'Luogo “bevuto/acquistato” salvato' : 'Origine salvata');
      await refreshAll();
    } catch (e) {
      alert('Errore salvataggio luogo: ' + (e.message || e));
    }
  }

  /* --------- Normalizzazione & insert Wine (da OCR/Vocale) --------- */
  async function normalizeWineText(text) {
    const r = await fetch('/api/ingest/normalize', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ text, target:'wine' })
    });
    return r.json();
  }

  async function insertWineFromNormalized(norm, { alsoGuessOrigin = true } = {}) {
    const d = norm?.data || {};
    const name = (d.name && String(d.name).trim()) || `Vino (da completare) ${new Date().toISOString().slice(0,10)}`;

    const { data: newWine, error } = await supabase.from('wines').insert([{
      user_id: userId,
      name,
      winery: d.winery || null,
      denomination: d.denomination || null,
      region: d.region || null,
      grapes: Array.isArray(d.grapes) ? d.grapes : null,
      vintage: d.vintage ?? null,
      style: d.style || null,
      price_target: d.price_eur ?? null,
      notes: d.notes || null,
      alcohol: d.alcohol ?? null,
      grape_blend: Array.isArray(d.grape_blend) ? d.grape_blend : null
    }]).select().single();
    if (error) throw error;

    const places = [];
    if (d.origin?.lat && d.origin?.lng) {
      places.push({
        user_id: userId, item_type:'wine', item_id:newWine.id,
        kind:'origin', place_name: d.origin.name || null, lat: d.origin.lat, lng: d.origin.lng, is_primary:true
      });
    } else if (alsoGuessOrigin) {
      const guess = await geocodeLoose(d.region || d.denomination || d.winery);
      if (guess) places.push({
        user_id: userId, item_type:'wine', item_id:newWine.id,
        kind:'origin', place_name: guess.name, lat: guess.lat, lng: guess.lng, is_primary:true
      });
    }
    if (places.length) await supabase.from('product_places').insert(places);

    showToast('Vino aggiunto alla lista');
    await refreshAll();
    return newWine;
  }

  /* --------- OCR (foto) – Vini diretti ---------- */
  async function handleWineOcrFiles(files) {
    try {
      if (!userId) return alert('Sessione assente.');
      if (!files?.length) return;

      for (const file of files) {
        const dataUrl = await new Promise((res, rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });
        const r1 = await fetch('/api/ocr', {
          method:'POST', headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ dataUrl })
        });
        const j1 = await r1.json();
        const text = j1?.text || j1?.result || j1?.raw || '';
        if (!text) continue;

        const norm = await normalizeWineText(text);
        if (norm?.kind === 'wine') {
          await insertWineFromNormalized(norm, { alsoGuessOrigin:true });
        } else {
          const first = text.trim().split('\n').map(s=>s.trim()).filter(Boolean)[0] || 'Vino da etichetta';
          await supabase.from('wines').insert([{ user_id:userId, name:first }]);
          showToast('Vino aggiunto (solo nome — etichetta poco leggibile)');
          await refreshAll();
        }
      }
    } catch (e) { alert('Errore OCR: ' + (e.message || e)); }
  }

  /* --------- Vocale – Vini diretti --------- */
  async function handleWineVoice() {
    try {
      if (!userId) return alert('Sessione assente.');
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      let text = '';

      if (SR) {
        text = await new Promise((resolve, reject) => {
          const rec = new SR(); rec.lang='it-IT'; rec.interimResults=false; rec.maxAlternatives=1;
          rec.onresult = ev => resolve(ev.results?.[0]?.[0]?.transcript || '');
          rec.onerror   = e  => reject(new Error(e.error||'Errore riconoscimento vocale'));
          rec.onend     = () => resolve(text);
          rec.start();
        });
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
        const rec    = new MediaRecorder(stream, { mimeType:'audio/webm' });
        const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
        const done   = new Promise(res => rec.onstop = res);
        rec.start(); setTimeout(()=>rec.stop(), 5000); await done;
        const blob   = new Blob(chunks, { type:'audio/webm' });
        const fd     = new FormData(); fd.append('file', blob, 'audio.webm');
        const r      = await fetch('/api/stt', { method:'POST', body: fd });
        const j      = await r.json(); text = j?.text || '';
      }

      if (!text) { alert('Nessun testo rilevato'); return; }
      const norm = await normalizeWineText(text);
      if (norm?.kind === 'wine') {
        await insertWineFromNormalized(norm, { alsoGuessOrigin: true });
      } else {
        await supabase.from('wines').insert([{ user_id:userId, name: text.slice(0,80) }]);
        showToast('Vino aggiunto (solo nome — comando poco chiaro)');
        await refreshAll();
      }
    } catch (e) { alert('Errore voce: ' + (e.message || e)); }
  }

  /* --------- Map helper (scroll & highlight) --------- */
  const openOnMapForItem = useCallback((itemType, itemId, kind='origin')=>{
    const candidates = places.filter(p => p.item_type===itemType && p.item_id===itemId && p.kind===kind);
    if (!candidates.length) { alert(`Nessun luogo “${kind}” per questo elemento`); return; }
    const target = candidates.find(c=>c.is_primary) || candidates[0];
    setMapCenter([target.lng, target.lat]); setMapZoom(6); setSelectedPlaceId(target.id);
    document.getElementById('map-italia')?.scrollIntoView({ behavior:'smooth', block:'start' });
    setTimeout(()=>setSelectedPlaceId(null), 2500);
  }, [places]);

  /* ======================== Render ======================== */
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

      {/* ======== ARTISAN ======== */}
      {tab === 'artisan' && (
        <>
          <SectionToolbar
            label="Formaggi & Salumi"
            onAddManual={()=> setShowAddArtisan(v=>!v)}
            showAdd={showAddArtisan}
          />
          {showAddArtisan && <AddArtisanForm userId={userId} onInserted={refreshAll} />}

          <Table>
            <thead>
              <tr>
                <th style={{ textAlign:'left',  padding:10 }}>Nome</th>
                <th style={{ textAlign:'left',  padding:10 }}>Tipologia</th>
                <th style={{ textAlign:'left',  padding:10 }}>Designazione</th>
                <th style={{ textAlign:'right', padding:10 }}>Prezzo</th>
                <th style={{ textAlign:'left',  padding:10, minWidth:220 }}>Azioni</th>
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
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <button style={btn(false)} onClick={()=>addPlaceFor('artisan', row.id, 'purchase')}>Dove l’ho mangiato</button>
                      <button style={btn(false)} onClick={()=>openOnMapForItem('artisan', row.id, 'origin')}>Mappa Origine</button>
                      <button style={btn(false)} onClick={()=>openOnMapForItem('artisan', row.id, 'purchase')}>Mappa Acquisto</button>
                    </div>
                  </TCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {/* ======== WINES ======== */}
      {tab === 'wines' && (
        <>
          <SectionToolbar
            label="Vini (Wishlist)"
            onAddManual={()=> setShowAddWine(v=>!v)}
            onOcr={()=> wineOcrRef.current?.click()}
            onVoice={handleWineVoice}
            showAdd={showAddWine}
          />
          {/* input nascosto per OCR diretto */}
          <input
            ref={wineOcrRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            style={{ display:'none' }}
            onChange={e=> handleWineOcrFiles(Array.from(e.target.files||[]))}
          />

          {showAddWine && <AddWineForm userId={userId} onInserted={refreshAll} />}

          <Table>
            <thead>
              <tr>
                <th style={{ textAlign:'left',  padding:10 }}>Vino</th>
                <th style={{ textAlign:'left',  padding:10 }}>Cantina</th>
                <th style={{ textAlign:'left',  padding:10 }}>Denominazione</th>
                <th style={{ textAlign:'left',  padding:10 }}>Regione</th>
                <th style={{ textAlign:'right', padding:10 }}>Grad.</th>
                <th style={{ textAlign:'right', padding:10 }}>Annata</th>
                <th style={{ textAlign:'right', padding:10 }}>Budget</th>
                <th style={{ textAlign:'left',  padding:10 }}>Voto</th>
                <th style={{ textAlign:'left',  padding:10, minWidth:260 }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><TCell>Caricamento…</TCell></tr>}
              {!loading && wines.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
              {wines.map(row=>(
                <tr key={row.id}>
                  <TCell>{row.name}</TCell>
                  <TCell>{row.winery || '—'}</TCell>
                  <TCell>{row.denomination || '—'}</TCell>
                  <TCell>{row.region || '—'}</TCell>
                  <TCell right>{row.alcohol!=null ? `${Number(row.alcohol).toFixed(1)}%` : '—'}</TCell>
                  <TCell right>{row.vintage || '—'}</TCell>
                  <TCell right>{row.price_target!=null ? `€ ${Number(row.price_target).toFixed(2)}` : '—'}</TCell>
                  <TCell><Stars value={row.rating_5 || 0} onChange={async n=>{
                    await supabase.from('wines').update({ rating_5:n }).eq('id', row.id).eq('user_id', userId);
                    refreshAll();
                  }}/></TCell>
                  <TCell>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <button style={btn(false)} onClick={()=>addPlaceFor('wine', row.id, 'purchase')}>Dove l’ho bevuto</button>
                      <button style={btn(false)} onClick={()=>openOnMapForItem('wine', row.id, 'origin')}>Mappa Origine</button>
                      <button style={btn(false)} onClick={()=>openOnMapForItem('wine', row.id, 'purchase')}>Mappa Acquisto</button>
                      <button style={btn(false)} onClick={()=>navigator.clipboard.writeText(row.name)}>Copia nome</button>
                    </div>
                  </TCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {/* ======== CELLAR ======== */}
      {tab === 'cellar' && (
        <>
          <SectionToolbar
            label="Cantina"
            onAddManual={()=> setShowAddCellar(v=>!v)}
            showAdd={showAddCellar}
          />
          {showAddCellar && <AddCellarForm userId={userId} wines={wines} onInserted={refreshAll} />}

          <Table>
            <thead>
              <tr>
                <th style={{ textAlign:'left',  padding:10 }}>Vino</th>
                <th style={{ textAlign:'right', padding:10 }}>Bottiglie</th>
                <th style={{ textAlign:'right', padding:10 }}>Prezzo acquisto</th>
                <th style={{ textAlign:'left',  padding:10 }}>Abbinamenti</th>
                <th style={{ textAlign:'left',  padding:10, minWidth:220 }}>Azioni</th>
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
                    <button style={btn(false)} onClick={()=>addPlaceFor('wine', row.wine?.id || row.wine_id, 'purchase')}>Dove l’ho comprato</button>
                  </TCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {/* ======== MAPPA ======== */}
      <section id="map-italia" style={{ background:'#0b0f14', border:'1px solid #1f2a38', borderRadius:16, padding:12, marginTop:16, marginBottom:8 }}>
        <h3 style={{ color:'#cdeafe', margin:'8px 8px 12px' }}>Mappa Italia — Origini (rosso) • Acquisto/Consumo (blu)</h3>
        <MapContainer center={[mapCenter[1], mapCenter[0]]} zoom={mapZoom} scrollWheelZoom style={{ width:'100%', height:420, borderRadius:16 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          {places.map(p=>{
            const color = p.kind==='origin' ? '#ef4444' : '#3b82f6';
            const sel = selectedPlaceId===p.id;
            return (
              <CircleMarker key={p.id} center={[p.lat,p.lng]} radius={sel?7:5} pathOptions={{ color, fillColor:color, fillOpacity:1 }}>
                {p.place_name ? <Tooltip direction="top">{p.place_name}</Tooltip> : null}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </section>

      {/* ======== TOASTS ======== */}
      <div className="toast-wrap">
        {toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}
      </div>
      <style jsx>{`
        .toast-wrap{
          position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
          display: flex; flex-direction: column; gap: 8px; z-index: 9999; pointer-events: none;
        }
        .toast{
          background: rgba(15,23,42,0.95); border: 1px solid #1f2a38; color: #e5eeff;
          padding: 10px 12px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
          font-weight: 600; pointer-events: auto;
        }
      `}</style>
    </>
  );
}

export default withAuth(ProdottiTipiciViniPage);
