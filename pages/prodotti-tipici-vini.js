// pages/prodotti-tipici-vini.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

// Leaflet (no SSR)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr:false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr:false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr:false });
const Tooltip      = dynamic(() => import('react-leaflet').then(m => m.Tooltip),      { ssr:false });

/* ===================== Helpers UI ===================== */
const inp = { padding:'10px 12px', borderRadius:12, border:'1px solid #243246', background:'#0b0f14', color:'#e5eeff' };
function btn(active) {
  return {
    padding:'10px 14px', borderRadius:12,
    border:'1px solid ' + (active ? '#60a5fa' : '#2b3645'),
    background: active ? 'linear-gradient(180deg,#0f1e2d,#0b1520)' : 'transparent',
    color: active ? '#e6f0ff' : '#c7d2fe', cursor:'pointer'
  };
}
function TCell({ children, right }) {
  return <td style={{ padding:'10px 8px', borderBottom:'1px solid #1f2a38', textAlign: right ? 'right' : 'left' }}>{children}</td>;
}
function Table({ children }) {
  return (
    <div style={{ overflowX:'auto', background:'#0b0f14', borderRadius:16 }}>
      <table style={{ width:'100%', borderCollapse:'collapse', color:'#e5eeff' }}>
        {children}
      </table>
    </div>
  );
}
function Stars({ value=0, onChange }) {
  return (
    <span aria-label="rating" style={{ display:'inline-flex', gap:4 }}>
      {[1,2,3,4,5].map(n=>(
        <span key={n} role="button" onClick={()=>onChange?.(n)} style={{ cursor:'pointer', fontSize:18, userSelect:'none' }}>
          {n <= (value||0) ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

/* ===================== Form manuali ===================== */
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

/* ===================== Aggiungi Luogo ===================== */
function AddPlaceWidget({ userId, items, kindOptions, onInserted }) {
  const [f, setF] = useState({ item_type:'wine', item_id:'', kind:'origin', place_name:'', lat:'', lng:'', visited_at:'', is_primary:true });
  useEffect(()=>{ if (items.length && !f.item_id) setF(prev=>({ ...prev, item_id: items[0].id, item_type: items[0].type })); }, [items]); // first fill

  async function addPlace(){
    if (!userId) return alert('Sessione assente.');
    if (!f.item_id || !f.lat || !f.lng) return alert('Seleziona item e inserisci lat/lng');
    const { error } = await supabase.from('product_places').insert([{
      user_id: userId,
      item_type:f.item_type, item_id:f.item_id, kind:f.kind, place_name:f.place_name || null,
      lat:Number(f.lat), lng:Number(f.lng), visited_at:f.visited_at || null, is_primary: !!f.is_primary
    }]);
    if (error) return alert('Errore luogo: ' + error.message);
    setF({ item_type:f.item_type, item_id:f.item_id, kind:'origin', place_name:'', lat:'', lng:'', visited_at:'', is_primary:true });
    onInserted && onInserted();
  }
  return (
    <section style={{ margin:'16px 0', padding:12, borderRadius:16, background:'#0b0f14', border:'1px solid #1f2a38' }}>
      <h4 style={{ margin:'0 0 8px' }}>Aggiungi Luogo</h4>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
        <select value={f.item_id} onChange={e=>{
          const sel = items.find(x=>String(x.id)===String(e.target.value));
          setF({...f, item_id:e.target.value, item_type: sel?.type || f.item_type});
        }} style={inp}>
          {items.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select value={f.kind} onChange={e=>setF({...f, kind:e.target.value})} style={inp}>
          {kindOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input placeholder="Luogo (testo opz.)" value={f.place_name} onChange={e=>setF({...f, place_name:e.target.value})} style={inp}/>
        <input placeholder="Lat" value={f.lat} onChange={e=>setF({...f, lat:e.target.value})} style={inp}/>
        <input placeholder="Lng" value={f.lng} onChange={e=>setF({...f, lng:e.target.value})} style={inp}/>
        <input placeholder="Data visita (YYYY-MM-DD)" value={f.visited_at} onChange={e=>setF({...f, visited_at:e.target.value})} style={inp}/>
        <label style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input type="checkbox" checked={f.is_primary} onChange={e=>setF({...f, is_primary:e.target.checked})}/>
          <span>Imposta come primary</span>
        </label>
      </div>
      <div style={{ marginTop:10 }}>
        <button onClick={addPlace} style={btn(true)}>Aggiungi luogo</button>
      </div>
    </section>
  );
}

/* ===================== Sezioni Tabelle ===================== */
function WinesSection({ data, loading, onOpenMap, onVote }) {
  return (
    <section>
      <Table>
        <thead>
          <tr>
            <th style={{ textAlign:'left',  padding:10 }}>Vino</th>
            <th style={{ textAlign:'left',  padding:10 }}>Cantina</th>
            <th style={{ textAlign:'left',  padding:10 }}>Denominazione</th>
            <th style={{ textAlign:'right', padding:10 }}>Grad.</th>
            <th style={{ textAlign:'left',  padding:10 }}>Vitigni / Blend</th>
            <th style={{ textAlign:'left',  padding:10 }}>Regione</th>
            <th style={{ textAlign:'right', padding:10 }}>Annata</th>
            <th style={{ textAlign:'right', padding:10 }}>Budget</th>
            <th style={{ textAlign:'left',  padding:10 }}>Voto</th>
            <th style={{ textAlign:'left',  padding:10 }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><TCell>Caricamento…</TCell></tr>}
          {!loading && data.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
          {data.map(row => {
            const blend = Array.isArray(row.grape_blend) && row.grape_blend.length
              ? row.grape_blend.map(b => (b.pct != null ? `${b.pct}% ${b.name}` : b.name)).join(', ')
              : (Array.isArray(row.grapes) ? row.grapes.join(', ') : '—');
            return (
              <tr key={row.id}>
                <TCell>{row.name}</TCell>
                <TCell>{row.winery || '—'}</TCell>
                <TCell>{row.denomination || '—'}</TCell>
                <TCell right>{row.alcohol != null ? `${Number(row.alcohol).toFixed(1)}%` : '—'}</TCell>
                <TCell>{blend}</TCell>
                <TCell>{row.region || '—'}</TCell>
                <TCell right>{row.vintage || '—'}</TCell>
                <TCell right>{row.price_target != null ? `€ ${Number(row.price_target).toFixed(2)}` : '—'}</TCell>
                <TCell><Stars value={row.rating_5 || 0} onChange={(n)=>onVote(row.id, n)} /></TCell>
                <TCell>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button style={btn(false)} onClick={()=>onOpenMap('wine', row.id, 'origin')}>Apri mappa (Origine)</button>
                    <button style={btn(false)} onClick={()=>onOpenMap('wine', row.id, 'purchase')}>Apri mappa (Acquisto)</button>
                    <button style={btn(false)} onClick={()=>navigator.clipboard.writeText(row.name)}>Copia nome</button>
                  </div>
                </TCell>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </section>
  );
}

function ArtisanSection({ data, loading, onOpenMap }) {
  return (
    <section>
      <Table>
        <thead>
          <tr>
            <th style={{ textAlign:'left', padding:10 }}>Nome</th>
            <th style={{ textAlign:'left', padding:10 }}>Tipologia</th>
            <th style={{ textAlign:'left', padding:10 }}>Designazione</th>
            <th style={{ textAlign:'right', padding:10 }}>Prezzo</th>
            <th style={{ textAlign:'left', padding:10 }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><TCell>Caricamento…</TCell></tr>}
          {!loading && data.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
          {data.map(row => (
            <tr key={row.id}>
              <TCell>{row.name}</TCell>
              <TCell>{row.category}</TCell>
              <TCell>{row.designation || '—'}</TCell>
              <TCell right>{row.price_eur != null ? `€ ${Number(row.price_eur).toFixed(2)}` : '—'}</TCell>
              <TCell>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button style={btn(false)} onClick={()=>onOpenMap('artisan', row.id, 'origin')}>Apri mappa (Origine)</button>
                  <button style={btn(false)} onClick={()=>onOpenMap('artisan', row.id, 'purchase')}>Apri mappa (Acquisto)</button>
                </div>
              </TCell>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

function CellarSection({ data, loading }) {
  return (
    <section>
      <Table>
        <thead>
          <tr>
            <th style={{ textAlign:'left',  padding:10 }}>Vino</th>
            <th style={{ textAlign:'right', padding:10 }}>Bottiglie</th>
            <th style={{ textAlign:'right', padding:10 }}>Prezzo acquisto</th>
            <th style={{ textAlign:'left',  padding:10 }}>Abbinamenti</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><TCell>Caricamento…</TCell></tr>}
          {!loading && data.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
          {data.map(row => (
            <tr key={row.id}>
              <TCell>{row.wine?.name || '—'}</TCell>
              <TCell right>{row.bottles}</TCell>
              <TCell right>{row.purchase_price_eur != null ? `€ ${Number(row.purchase_price_eur).toFixed(2)}` : '—'}</TCell>
              <TCell>{(row.pairings || []).join(', ') || '—'}</TCell>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

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
  const [showPlacesArtisan, setShowPlacesArtisan] = useState(false);
  const [showPlacesWine, setShowPlacesWine]       = useState(false);

  const wineFormRef = useRef(null);
  const artisanFormRef = useRef(null);
  const cellarFormRef = useRef(null);

  // MAP
  const [mapCenter, setMapCenter] = useState([12.5, 42.5]); // [lng, lat]
  const [mapZoom, setMapZoom] = useState(5);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);

  const openOnMapForItem = useCallback((itemType, itemId, kind = 'origin') => {
    const candidates = places.filter(p => p.item_type === itemType && p.item_id === itemId && p.kind === kind);
    if (!candidates.length) { alert(`Nessun luogo “${kind}” salvato per questo elemento`); return; }
    const target = candidates.find(c => c.is_primary) || candidates[0];
    setMapCenter([target.lng, target.lat]);
    setMapZoom(6);
    setSelectedPlaceId(target.id);
    const el = document.getElementById('map-italia');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setSelectedPlaceId(null), 2500);
  }, [places]);

  // userId dalla sessione (stesso pattern di spese-casa.js)
  useEffect(() => {
    let sub = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      sub = supabase.auth.onAuthStateChange((_e, session) => {
        setUserId(session?.user?.id || null);
      });
    })();
    return () => { try { sub?.data?.subscription?.unsubscribe?.() } catch {} };
  }, []);

  const refreshAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [{ data: p, error: eP }, { data: a, error: eA }, { data: w, error: eW }, { data: c, error: eC }] = await Promise.all([
        supabase.from('product_places').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('artisan_products').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('wines').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('cellar').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      ]);
      if (eP) throw eP; if (eA) throw eA; if (eW) throw eW; if (eC) throw eC;
      setPlaces(p || []);
      setArtisan(a || []);
      setWines(w || []);
      const mapWine = new Map((w || []).map(x => [x.id, x]));
      setCellar((c || []).map(row => ({ ...row, wine: mapWine.get(row.wine_id) })));
    } catch (e) {
      console.error(e);
      alert('Errore caricamento dati: ' + (e?.message || e));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // rating
  const setRating = useCallback(async (id, n) => {
    if (!userId) return;
    const { error } = await supabase.from('wines').update({ rating_5: n }).eq('id', id).eq('user_id', userId);
    if (error) { alert('Errore voto: ' + error.message); return; }
    refreshAll();
  }, [userId, refreshAll]);

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

      {/* ===== Formaggi & Salumi ===== */}
      {tab === 'artisan' && (
        <>
          <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px' }}>
            <span style={{ color:'#cdeafe', fontWeight:700 }}>Formaggi & Salumi</span>
            <button onClick={()=> setShowAddArtisan(v=>!v)} style={btn(true)}>{showAddArtisan ? 'Chiudi' : 'Aggiungi manuale'}</button>
          </div>

          {showAddArtisan && <AddArtisanForm userId={userId} ref={artisanFormRef} onInserted={refreshAll} />}

          <ArtisanSection data={artisan} loading={loading} onOpenMap={openOnMapForItem} />

          <div style={{ marginTop:8, display:'flex', gap:8 }}>
            <button style={btn(false)} onClick={()=> setShowPlacesArtisan(v=>!v)}>{showPlacesArtisan ? 'Chiudi luoghi' : 'Aggiungi luogo'}</button>
          </div>
          {showPlacesArtisan && (
            <AddPlaceWidget
              userId={userId}
              kindOptions={[{label:'Origine',value:'origin'},{label:'Acquisto/Consumo',value:'purchase'}]}
              items={artisan.map(a=>({id:a.id,label:`${a.name} (${a.category})`, type:'artisan'}))}
              onInserted={refreshAll}
            />
          )}
        </>
      )}

      {/* ===== Vini (Wishlist) ===== */}
      {tab === 'wines' && (
        <>
          <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px' }}>
            <span style={{ color:'#cdeafe', fontWeight:700 }}>Vini (Wishlist)</span>
            <button onClick={()=> setShowAddWine(v=>!v)} style={btn(true)}>{showAddWine ? 'Chiudi' : 'Aggiungi manuale'}</button>
          </div>

          {showAddWine && <AddWineForm userId={userId} ref={wineFormRef} onInserted={refreshAll} />}

          <WinesSection data={wines} loading={loading} onOpenMap={openOnMapForItem} onVote={setRating} />

          <div style={{ marginTop:8, display:'flex', gap:8 }}>
            <button style={btn(false)} onClick={()=> setShowPlacesWine(v=>!v)}>{showPlacesWine ? 'Chiudi luoghi' : 'Aggiungi luogo'}</button>
          </div>
          {showPlacesWine && (
            <AddPlaceWidget
              userId={userId}
              kindOptions={[{label:'Origine',value:'origin'},{label:'Acquisto/Consumo',value:'purchase'}]}
              items={wines.map(w=>({id:w.id,label:`${w.name}${w.winery?` - ${w.winery}`:''}`, type:'wine'}))}
              onInserted={refreshAll}
            />
          )}
        </>
      )}

      {/* ===== Cantina ===== */}
      {tab === 'cellar' && (
        <>
          <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px' }}>
            <span style={{ color:'#cdeafe', fontWeight:700 }}>Cantina</span>
            <button onClick={()=> setShowAddCellar(v=>!v)} style={btn(true)}>{showAddCellar ? 'Chiudi' : 'Aggiungi manuale'}</button>
          </div>

          {showAddCellar && <AddCellarForm userId={userId} ref={cellarFormRef} wines={wines} onInserted={refreshAll} />}

          <CellarSection data={cellar} loading={loading} />
        </>
      )}

      {/* ===== MAPPA IN FONDO ===== */}
      <section id="map-italia" style={{
        background:'#0b0f14', border:'1px solid #1f2a38', borderRadius:16,
        padding:12, marginTop:16, marginBottom:8, position:'relative', zIndex:1
      }}>
        <h3 style={{ color:'#cdeafe', margin:'8px 8px 12px' }}>
          Mappa Italia — Origini (rosso) • Acquisto/Consumo (blu)
        </h3>
        <MapContainer
          center={[mapCenter[1], mapCenter[0]]}
          zoom={mapZoom}
          scrollWheelZoom
          style={{ width:'100%', height:420, borderRadius:16, overflow:'hidden' }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                     attribution="&copy; OpenStreetMap contributors" />
          {places.map(p => {
            const color = p.kind === 'origin' ? '#ef4444' : '#3b82f6';
            const isSel = selectedPlaceId === p.id;
            return (
              <CircleMarker key={p.id}
                center={[p.lat, p.lng]}
                radius={isSel ? 7 : 5}
                pathOptions={{ color, fillColor: color, fillOpacity:1 }}>
                {p.place_name ? <Tooltip direction="top">{p.place_name}</Tooltip> : null}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </section>
    </>
  );
}

export default withAuth(ProdottiTipiciViniPage);
