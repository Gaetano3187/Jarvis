// pages/prodotti-tipici-vini.js
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';

// Leaflet (no SSR)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr:false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr:false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr:false });
const Tooltip      = dynamic(() => import('react-leaflet').then(m => m.Tooltip),      { ssr:false });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MEDIA_BUCKET = process.env.NEXT_PUBLIC_MEDIA_BUCKET || 'jarvis-media';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function ProdottiTipiciViniPage() {
  const [tab, setTab] = useState('artisan'); // 'artisan' | 'wines' | 'cellar'
  const [places, setPlaces] = useState([]);
  const [artisan, setArtisan] = useState([]);
  const [wines, setWines] = useState([]);
  const [cellar, setCellar] = useState([]);
  const [loading, setLoading] = useState(true);

  // AUTH: utente e stato auth
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // toggle form manuale + luoghi
  const [showAddArtisan, setShowAddArtisan] = useState(false);
  const [showAddWine, setShowAddWine]       = useState(false);
  const [showAddCellar, setShowAddCellar]   = useState(false);
  const [showPlacesArtisan, setShowPlacesArtisan] = useState(false);
  const [showPlacesWine, setShowPlacesWine]       = useState(false);

  const artisanFormRef = useRef(null);
  const wineFormRef    = useRef(null);
  const cellarFormRef  = useRef(null);

  // MAPPA
  const [mapCenter, setMapCenter] = useState([12.5, 42.5]); // [lng, lat]
  const [mapZoom, setMapZoom] = useState(5);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);

  function openOnMapForItem(itemType, itemId, kind = 'origin') {
    const candidates = places.filter(p => p.item_type === itemType && p.item_id === itemId && p.kind === kind);
    if (!candidates.length) { alert(`Nessun luogo “${kind}” salvato per questo elemento`); return; }
    const target = candidates.find(c => c.is_primary) || candidates[0];
    setMapCenter([target.lng, target.lat]); setMapZoom(6); setSelectedPlaceId(target.id);
    const el = document.getElementById('map-italia'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setSelectedPlaceId(null), 3000);
  }

  // ===== AUTH: rileva utente e ricarica dati quando cambia =====
  useEffect(() => {
    let sub;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUser(u?.user ?? null); setAuthReady(true);
      sub = supabase.auth.onAuthStateChange((_evt, session) => {
        setUser(session?.user ?? null);
      });
    })();
    return () => { sub?.data?.subscription?.unsubscribe?.(); };
  }, []);

  useEffect(() => { if (authReady && user) refreshAll(); }, [authReady, user]);

  async function refreshAll() {
    setLoading(true);
    try {
      const [{ data: p }, { data: a }, { data: w }, { data: c }] = await Promise.all([
        supabase.from('product_places').select('*').order('created_at', { ascending: false }),
        supabase.from('artisan_products').select('*').order('created_at', { ascending: false }),
        supabase.from('wines').select('*').order('created_at', { ascending: false }),
        supabase.from('cellar').select('*').order('created_at', { ascending: false }),
      ]);
      setPlaces(p || []); setArtisan(a || []); setWines(w || []);
      const mapWine = new Map((w || []).map(x => [x.id, x]));
      setCellar((c || []).map(row => ({ ...row, wine: mapWine.get(row.wine_id) })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // ===== Inserimenti auto =====
  async function autoInsertArtisan(norm) {
    const d = norm?.data || {};
    const raw = norm?._raw || '';
    const name = (d.name && String(d.name).trim()) || `Prodotto (da completare) ${new Date().toISOString().slice(0,10)}`;
    const pr = d.pricing || {};
    const noteParts = [];
    if (pr.unit === 'kg' && pr.unit_price_eur != null) noteParts.push(`Prezzo: € ${Number(pr.unit_price_eur).toFixed(2)}/kg`);
    if (pr.quantity_kg != null)                         noteParts.push(`Peso: ${Number(pr.quantity_kg).toFixed(3)} kg`);
    if (pr.total_price_eur != null)                     noteParts.push(`Totale: € ${Number(pr.total_price_eur).toFixed(2)}`);
    if (d.producer)                                     noteParts.push(`Produttore: ${d.producer}`);
    if (!d.name && raw)                                 noteParts.push(`[OCR] ${raw.slice(0,150)}…`);
    const priceForDB = (pr.unit === 'kg' && pr.unit_price_eur != null) ? pr.unit_price_eur
                         : (pr.total_price_eur != null ? pr.total_price_eur : (d.price_eur ?? null));

    const { data: inserted, error } = await supabase.from('artisan_products').insert([{
      name, category: (d.product_type === 'salume' ? 'salume' : 'formaggio'),
      designation: d.designation || null, price_eur: priceForDB,
      notes: noteParts.length ? noteParts.join(' — ') : (d.notes || null)
    }]).select().single();
    if (error) { alert('Errore inserimento prodotto: ' + error.message); return; }

    const rows = [];
    if (d.origin?.lat && d.origin?.lng) rows.push({ item_type:'artisan', item_id:inserted.id, kind:'origin',   place_name:d.origin.name||null,   lat:d.origin.lat, lng:d.origin.lng, is_primary:true });
    if (d.purchase?.lat && d.purchase?.lng) rows.push({ item_type:'artisan', item_id:inserted.id, kind:'purchase', place_name:d.purchase.name||null, lat:d.purchase.lat, lng:d.purchase.lng, is_primary:true });
    if (rows.length) { const { error:e2 } = await supabase.from('product_places').insert(rows); if (e2) alert('Inserito il prodotto, ma errore sui luoghi: ' + e2.message); }
    await refreshAll();
  }

  async function autoInsertWine(norm, alsoCellar = false) {
    const d = norm?.data || {};
    const raw = norm?._raw || '';
    const name = (d.name && String(d.name).trim()) || `Vino (da completare) ${new Date().toISOString().slice(0,10)}`;

    const noteParts = [];
    if (d.bottle_l)             noteParts.push(`Bott: ${Number(d.bottle_l).toFixed(2)} l`);
    if (d.unit_price_l != null) noteParts.push(`~ € ${Number(d.unit_price_l).toFixed(2)}/l`);
    if (!d.name && raw)         noteParts.push(`[OCR] ${raw.slice(0,150)}…`);

    const insertBody = {
      name, winery: d.winery || null, denomination: d.denomination || null, region: d.region || null,
      grapes: Array.isArray(d.grapes) ? d.grapes : null, vintage: d.vintage ?? null, style: d.style || null,
      price_target: d.price_eur ?? null, notes: noteParts.length ? noteParts.join(' — ') : (d.notes || null),
      alcohol: d.alcohol ?? null, grape_blend: Array.isArray(d.grape_blend) ? d.grape_blend : null
    };

    const { data: inserted, error } = await supabase.from('wines').insert([insertBody]).select().single();
    if (error) { alert('Errore inserimento vino: ' + error.message); return; }

    const rows = [];
    if (d.origin?.lat && d.origin?.lng) rows.push({ item_type:'wine', item_id:inserted.id, kind:'origin',   place_name:d.origin.name||null,   lat:d.origin.lat, lng:d.origin.lng, is_primary:true });
    if (d.purchase?.lat && d.purchase?.lng) rows.push({ item_type:'wine', item_id:inserted.id, kind:'purchase', place_name:d.purchase.name||null, lat:d.purchase.lat, lng:d.purchase.lng, is_primary:true });
    if (rows.length) { const { error:e2 } = await supabase.from('product_places').insert(rows); if (e2) alert('Inserito il vino, ma errore sui luoghi: ' + e2.message); }

    if (alsoCellar) {
      const price = d.price_eur ?? null;
      const { error:e3 } = await supabase.from('cellar').insert([{ wine_id: inserted.id, bottles: 1, purchase_price_eur: price }]);
      if (e3) alert('Inserito vino ma errore in Cantina: ' + e3.message);
    }
    await refreshAll();
  }

  // Se non autenticato: mostra invito al login
  if (authReady && !user) {
    async function signInGoogle() {
      try {
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: (typeof window !== 'undefined' ? window.location.href : undefined) }
        });
      } catch (e) { alert('Login error: ' + (e.message || e)); }
    }
    return (
      <>
        <Head><title>Prodotti tipici & Vini • Login richiesto</title></Head>
        <div style={{ maxWidth:680, margin:'40px auto', padding:20, border:'1px solid #1f2a38', borderRadius:16, background:'#0b0f14', color:'#e5eeff' }}>
          <h2 style={{ marginTop:0 }}>Accedi per vedere i tuoi prodotti e vini</h2>
          <p style={{ opacity:.85, marginBottom:16 }}>
            Per proteggere i dati, la visualizzazione richiede un account. Entra con lo stesso account usato sul PC.
          </p>
          <button onClick={signInGoogle} style={btn(true)}>Accedi con Google</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Head><title>Prodotti tipici & Vini • Jarvis</title></Head>

      {/* Banner */}
      <div style={{ width:'100%', height:220, overflow:'hidden', borderRadius:16, marginBottom:16, position:'relative' }}>
        <video src="/intro.mp4" muted loop playsInline autoPlay style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
        <div style={{
          position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.35))', color:'#fff', fontWeight:700, fontSize:28, letterSpacing:1.2, pointerEvents:'none'
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

      {tab === 'artisan' && (
        <>
          <SectionToolbar label="Formaggi & Salumi" target="artisan"
            onAddManual={()=> setShowAddArtisan(v=>!v)}
            onParsed={async (norm)=> { if (norm?.kind !== 'artisan') { alert('Rilevato vino: sposto su Vini.'); setTab('wines'); setShowAddWine(true); await autoInsertWine(norm,false); } else { await autoInsertArtisan(norm); } }}
          />
          {showAddArtisan && <AddArtisanForm ref={artisanFormRef} onInserted={refreshAll} />}
          <ArtisanSection data={artisan} loading={loading} onOpenMap={openOnMapForItem} />
          <div style={{ marginTop:8, display:'flex', gap:8 }}>
            <button style={btn(false)} onClick={()=> setShowPlacesArtisan(v=>!v)}>{showPlacesArtisan ? 'Chiudi luoghi' : 'Aggiungi luogo'}</button>
          </div>
          {showPlacesArtisan && (
            <AddPlaceWidget
              kindOptions={[{label:'Origine',value:'origin'},{label:'Acquisto/Consumo',value:'purchase'}]}
              items={artisan.map(a=>({id:a.id,label:`${a.name} (${a.category})`, type:'artisan'}))}
              onInserted={refreshAll}
            />
          )}
        </>
      )}

      {tab === 'wines' && (
        <>
          <SectionToolbar label="Vini (Wishlist)" target="wine"
            onAddManual={()=> setShowAddWine(v=>!v)}
            onParsed={async (norm)=> { if (norm?.kind !== 'wine') { alert('Rilevato prodotto “artisan”: sposto su Formaggi & Salumi.'); setTab('artisan'); setShowAddArtisan(true); await autoInsertArtisan(norm); } else { await autoInsertWine(norm,false); } }}
          />
          {showAddWine && <AddWineForm ref={wineFormRef} onInserted={refreshAll} />}
          <WinesSection data={wines} loading={loading} onOpenMap={openOnMapForItem} />
          <div style={{ marginTop:8, display:'flex', gap:8 }}>
            <button style={btn(false)} onClick={()=> setShowPlacesWine(v=>!v)}>{showPlacesWine ? 'Chiudi luoghi' : 'Aggiungi luogo'}</button>
          </div>
          {showPlacesWine && (
            <AddPlaceWidget
              kindOptions={[{label:'Origine',value:'origin'},{label:'Acquisto/Consumo',value:'purchase'}]}
              items={wines.map(w=>({id:w.id,label:`${w.name}${w.winery?` - ${w.winery}`:''}`, type:'wine'}))}
              onInserted={refreshAll}
            />
          )}
        </>
      )}

      {tab === 'cellar' && (
        <>
          <SectionToolbar label="Cantina" target="cellar"
            onAddManual={()=> setShowAddCellar(v=>!v)}
            onParsed={async (norm)=> {
              if (norm?.kind === 'wine') { await autoInsertWine(norm, true); setTab('cellar'); }
              else if (norm?.kind === 'artisan') { await autoInsertArtisan(norm); setTab('artisan'); }
              else { alert('Non riconosciuto. Compila manualmente.'); }
            }}
          />
          {showAddCellar && <AddCellarForm ref={cellarFormRef} wines={wines} onInserted={refreshAll} />}
          <CellarSection data={cellar} loading={loading} />
        </>
      )}

      {/* MAPPA */}
      <section id="map-italia" style={{ background:'#0b0f14', border:'1px solid #1f2a38', borderRadius:16, padding:12, marginTop:16, marginBottom:8 }}>
        <h3 style={{ color:'#cdeafe', margin:'8px 8px 12px' }}>Mappa Italia — Origini (rosso) • Acquisto/Consumo (blu)</h3>
        <MapContainer center={[mapCenter[1], mapCenter[0]]} zoom={mapZoom} scrollWheelZoom style={{ width:'100%', height:420, borderRadius:16 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          {places.map(p => {
            const color = p.kind === 'origin' ? '#ef4444' : '#3b82f6';
            const isSel = selectedPlaceId === p.id;
            return (
              <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={isSel ? 7 : 5} pathOptions={{ color, fillColor: color, fillOpacity:1 }}>
                {p.place_name ? <Tooltip direction="top">{p.place_name}</Tooltip> : null}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </section>
    </>
  );
}

/* ========= Toolbar Manuale / OCR / Vocale ========= */
function SectionToolbar({ label, target, onAddManual, onParsed }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function normalizeText(text) {
    const r = await fetch('/api/ingest/normalize', {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text, target })
    });
    return r.json();
  }

  async function handleOcrFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const r1 = await fetch('/api/ocr', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ dataUrl }) });
      const j1 = await r1.json();
      const text = j1?.text || j1?.result || j1?.raw || '';
      if (!text) throw new Error('OCR: nessun testo.');
      const r2 = await fetch('/api/ingest/normalize', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text, target }) });
      const parsed = await r2.json(); parsed._raw = text;
      onParsed && onParsed(parsed, { source:'ocr', raw:text });
    } catch (e) { alert('Errore OCR: ' + (e.message || e)); }
    finally { setBusy(false); }
  }

  async function handleVoice() {
    setBusy(true);
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        await new Promise((resolve,reject)=>{
          const rec = new SR(); rec.lang='it-IT'; rec.interimResults=false; rec.maxAlternatives=1;
          rec.onresult = async (ev)=>{
            const text = ev.results?.[0]?.[0]?.transcript || '';
            if (text) { const norm = await normalizeText(text); norm._raw = text; onParsed && onParsed(norm, { source:'voice', raw:text }); }
            resolve();
          };
          rec.onerror = (e)=> reject(e.error||'Errore riconoscimento vocale');
          rec.onend = resolve; rec.start();
        });
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
        const rec = new MediaRecorder(stream, { mimeType:'audio/webm' });
        const chunks=[]; rec.ondataavailable = e=> chunks.push(e.data);
        const done = new Promise(res => rec.onstop = res);
        rec.start(); setTimeout(()=>rec.stop(), 5000); await done;
        const blob = new Blob(chunks, { type:'audio/webm' });
        const fd = new FormData(); fd.append('file', blob, 'audio.webm');
        const r1 = await fetch('/api/stt', { method:'POST', body: fd });
        const j1 = await r1.json();
        const text = j1?.text || '';
        if (!text) throw new Error('STT: nessun testo.');
        const norm = await normalizeText(text); norm._raw = text;
        onParsed && onParsed(norm, { source:'voice', raw:text });
      }
    } catch(e){ alert('Errore voce: ' + (e.message||e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px' }}>
      <span style={{ color:'#cdeafe', fontWeight:700 }}>{label}</span>
      <button onClick={onAddManual} style={btn(true)}>Aggiungi manuale</button>
      <button onClick={()=> fileRef.current?.click()} style={btn(false)} disabled={busy}>{busy?'OCR…':'OCR (foto)'}</button>
      <button onClick={handleVoice} style={btn(false)} disabled={busy}>{busy?'Ascolto…':'Vocale'}</button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>handleOcrFile(e.target.files?.[0])}/>
    </div>
  );
}

/* ========== Helpers UI ========== */
function TCell({ children, colSpan }) {
  return <td colSpan={colSpan} style={{ padding:'10px 8px', borderBottom:'1px solid #1f2a38' }}>{children}</td>;
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
function btn(active) {
  return {
    padding:'10px 14px', borderRadius:12,
    border:'1px solid ' + (active ? '#60a5fa' : '#2b3645'),
    background: active ? 'linear-gradient(180deg,#0f1e2d,#0b1520)' : 'transparent',
    color: active ? '#e6f0ff' : '#c7d2fe', cursor:'pointer'
  };
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

/* ========== Aggiungi Luogo (nascosto) ========== */
function AddPlaceWidget({ items, kindOptions, onInserted }) {
  const [f, setF] = useState({ item_type:'wine', item_id:'', kind:'origin', place_name:'', lat:'', lng:'', visited_at:'', is_primary:true });
  useEffect(()=>{ if (items.length && !f.item_id) setF(prev=>({ ...prev, item_id: items[0].id, item_type: items[0].type })); }, [items]);
  async function addPlace(){
    if (!f.item_id || !f.lat || !f.lng) return alert('Seleziona item e inserisci lat/lng');
    const { error } = await supabase.from('product_places').insert([{
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
          const sel = items.find(x=>x.id===e.target.value);
          setF({...f, item_id:e.target.value, item_type: sel?.type || f.item_type});
        }} style={inp}>
          {items.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select value={f.kind} onChange={e=>setF({...f, kind:e.target.value})} style={inp}>
          {kindOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input placeholder="Luogo (testo)" value={f.place_name} onChange={e=>setF({...f, place_name:e.target.value})} style={inp}/>
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

/* ========== Live QR Scanner (camera) ========== */
function LiveQrScanner({ onClose, onResult }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const loopRef = useRef(null);

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          startScanLoop();
        }
      } catch (e) {
        alert('Impossibile avviare la fotocamera.');
        onClose?.();
      }
    })();
    return () => {
      stopScanLoop();
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  function startScanLoop() { loopRef.current = setInterval(scanFrame, 350); }
  function stopScanLoop()  { if (loopRef.current) clearInterval(loopRef.current); loopRef.current = null; }

  async function scanFrame() {
    const jsQR = (await import('jsqr')).default;
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    const w = video.videoWidth, h = video.videoHeight;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, img.width, img.height);
    if (code && code.data) { stopScanLoop(); onResult?.(code.data); }
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:60
    }}>
      <div style={{ width:'min(520px, 96vw)', background:'#0b0f14', border:'1px solid #1f2a38', borderRadius:16, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <h3 style={{ margin:0 }}>Scanner QR</h3>
          <button onClick={onClose} style={btn(false)}>Chiudi</button>
        </div>
        <video ref={videoRef} muted playsInline style={{ width:'100%', borderRadius:12, background:'#000' }} />
        <canvas ref={canvasRef} style={{ display:'none' }} />
        <p style={{ opacity:.8, marginTop:8 }}>Inquadra il QR del menù / lista vini. Appena letto, userò la pagina collegata per i suggerimenti.</p>
      </div>
    </div>
  );
}
