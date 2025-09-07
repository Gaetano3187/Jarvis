// pages/prodotti-tipici-vini.js
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

// Endpoint OCR dedicato a questa pagina 
const OCR_API_GENERIC = '/api/ocr-generic';

// Leaflet (no SSR)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr:false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr:false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr:false });
const Tooltip      = dynamic(() => import('react-leaflet').then(m => m.Tooltip),      { ssr:false });
const Popup        = dynamic(() => import('react-leaflet').then(m => m.Popup),        { ssr:false });

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
const TCell = ({children, right, colSpan, onClick})=>(
  <td
    colSpan={colSpan}
    onClick={onClick}
    style={{
      padding:'10px 8px',
      borderBottom:'1px solid #1f2a38',
      textAlign:right?'right':'left',
      cursor: onClick ? 'pointer' : 'default'
    }}
  >{children}</td>
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

/* ---------- NEW: util client per convertire HEIC/immagini grandi in JPEG ---------- */
async function toJpegIfNeeded(file, { maxSide=1800, quality=0.82 } = {}) {
  try {
    const isHeic = /heic|heif/i.test(file.type || file.name || '');
    const tooBig = file.size > 7_000_000; // ~7MB
    if (!isHeic && !tooBig) return file;

    const dataUrl = await new Promise((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = ko;
      r.readAsDataURL(file);
    });

    const img = await new Promise((ok, ko) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = ko;
      im.src = dataUrl;
    });

    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    const name = (file.name || 'upload').replace(/\.\w+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file; // in caso di errore non bloccare
  }
}

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

/* ===== Toolbar sezione (Manuale / OCR) ===== */
function SectionToolbar({ label, onAddManual, onOcr, showAdd }) {
  const fileRef = useRef(null);
  return (
    <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px', flexWrap:'wrap' }}>
      <span style={{ color:'#cdeafe', fontWeight:700 }}>{label}</span>
      <button onClick={onAddManual} style={btn(true)}>{showAdd ? 'Chiudi' : 'Aggiungi manuale'}</button>
      <button onClick={()=>fileRef.current?.click()} style={btn(false)}>OCR (foto)</button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        style={{display:'none'}}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';        // ✅ reset per ri-triggerare onChange con lo stesso file
          if (f) await onOcr?.(f);
        }}
      />
    </div>
  );
}

/* ===== Drawer Sommelier ===== */
function SommelierDrawer({ data, onClose, onAdd }) {
  const recs = data?.recommendations || [];
  const src = data?.source || '';
  const bf = data?.budget_filter || {};
  const hasBudget = bf && (bf.min != null || bf.max != null);

  const Band = ({band}) => {
    if (!band) return null;
    const map = { low:'#10b981', med:'#f59e0b', high:'#ef4444' };
    const label = { low:'Low', med:'Med', high:'High' }[band] || band;
    return <span style={{ background:map[band], color:'#0b0f14', padding:'2px 8px', borderRadius:999, fontSize:12, fontWeight:700 }}>{label}</span>;
  };
  const OutOf = ({flag}) => flag ? (
    <span style={{ border:'1px solid #ef4444', color:'#ef4444', padding:'2px 8px', borderRadius:999, fontSize:12, fontWeight:700 }}>Fuori budget</span>
  ) : null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'flex-end', zIndex:50 }}>
      <div style={{ width:'min(520px,96vw)', height:'100%', background:'#0b0f14', borderLeft:'1px solid #1f2a38', padding:16, overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <h3 style={{ margin:0 }}>Sommelier – risultati</h3>
          <button onClick={onClose} style={btn(false)}>Chiudi</button>
        </div>

        <div style={{ fontSize:13, opacity:.85, marginBottom:10 }}>
          Fonte: <strong>{src === 'list' ? 'Carta del locale' : src === 'web' ? 'Ricerca web' : 'Suggerimenti offline'}</strong>
          {hasBudget && <> • Filtro prezzo:
            {bf.min != null && <> ≥ € {Number(bf.min).toFixed(0)}</>}
            {bf.max != null && <> ≤ € {Number(bf.max).toFixed(0)}</>}
          </>}
        </div>

        {recs.length === 0 && <p style={{ opacity:0.8 }}>{data?.notes || 'Nessun risultato.'}</p>}

        {recs.map((r,i)=>(
          <div key={i} style={{ border:'1px solid #1f2a38', borderRadius:12, padding:12, marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
              <div style={{ fontWeight:700, lineHeight:1.2 }}>{r.name}</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <Band band={r.price_band} />
                <OutOf flag={r.out_of_budget} />
              </div>
            </div>
            <div style={{ opacity:0.85, marginTop:4 }}>{(r.winery || '—')} • {(r.denomination || '—')} {r.region ? `• ${r.region}` : ''}</div>
            <div style={{ marginTop:6 }}>{r.why}</div>
            <div style={{ marginTop:8, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              {r.typical_price_eur != null && <span style={{ opacity:0.9 }}>~ € {Number(r.typical_price_eur).toFixed(2)}</span>}
              {(r.links || []).map((l,idx)=>(<a key={idx} href={l.url} target="_blank" rel="noreferrer" style={btn(false)}>{l.title || 'Link'}</a>))}
              <button
                style={btn(true)}
                onClick={()=> onAdd?.(r)}
                title="Salva tra i vini bevuti con localizzazione"
              >
                Aggiungi tra i bevuti
              </button>
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

/* ===== Live QR Scanner (multi-QR) ===== */
function LiveQrScanner({ onClose, onResult }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const loopRef = useRef(null);
  const [codes, setCodes] = useState([]);

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
    if(code&&code.data){
      const url = code.data.trim();
      setCodes(prev => prev.includes(url) ? prev : [...prev, url]);
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
        <div style={{ marginTop:8, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ opacity:.85 }}>Link letti: <strong>{codes.length}</strong></span>
          <button disabled={!codes.length} onClick={()=> onResult?.(codes)} style={btn(true)}>Usa {codes.length} link</button>
          <button onClick={()=> setCodes([])} style={btn(false)}>Azzera</button>
        </div>
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

    const preRegion = form.region?.trim() || guessRegionFromText([form.name, form.denomination, form.winery].join(' ')).region || null;

    const { data: newWine, error } = await supabase.from('wines').insert([{
      user_id: userId,
      name: form.name.trim(),
      winery: form.winery || null,
      denomination: form.denomination || null,
      region: preRegion,
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
      const pair    = form.pairings
        ? form.pairings.split(',').map(s => s.trim()).filter(Boolean)
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
          {wines.map(w => (
            <option key={w.id} value={w.id}>
              {w.name}{w.winery?` - ${w.winery}`:''}
            </option>
          ))}
        </select>
        <input placeholder="Bottiglie" value={form.bottles}
               onChange={e=>setForm({...form, bottles:e.target.value})} style={inp}/>
        <input placeholder="Prezzo acquisto (€)" value={form.purchase_price_eur}
               onChange={e=>setForm({...form, purchase_price_eur:e.target.value})} style={inp}/>
        <input placeholder="Abbinamenti (comma)" value={form.pairings}
               onChange={e=>setForm({...form, pairings:e.target.value})} style={inp}/>
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

  // Sommelier attachments
  const [sommelierLists, setSommelierLists] = useState([]); // texts OCR (multi)
  const [sommelierQr, setSommelierQr] = useState([]);       // urls (multi)
  const [sommelierBusy, setSommelierBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [sommelierOpen, setSommelierOpen] = useState(false);
  const [sommelierData, setSommelierData] = useState(null);

  // toasts
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  // Map + popup info
  const [mapCenter, setMapCenter] = useState([12.5, 42.5]); // [lng, lat]
  const [mapZoom, setMapZoom] = useState(5);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState(new Set());
  const [popupInfo, setPopupInfo] = useState({}); // { place_id: { vintages:[], pairing:'' } }

  // memo maps
  const wineById = useMemo(()=> {
    const m = {};
    for (const w of wines) m[w.id] = w;
    return m;
  }, [wines]);

  const placesByWine = useMemo(()=>{
    const mp = new Map();
    for (const p of places) {
      if (p.item_type !== 'wine') continue;
      if (!mp.has(p.item_id)) mp.set(p.item_id, []);
      mp.get(p.item_id).push(p);
    }
    return mp;
  }, [places]);

  // sessione
  useEffect(() => {
    let sub = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      sub = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user?.id || null));
    })();
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

  /* ---------- Geocoding & geolocation ---------- */
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
    if (error) { alert('Errore salvataggio luogo: ' + error.message); return; }

    if (itemType==='wine' && kind==='purchase') {
      const alreadyOrigin = (placesByWine.get(itemId)||[]).some(pp=>pp.kind==='origin');
      if (!alreadyOrigin) await ensureOriginForWine(itemId);
      focusWineOnMap(itemId);
    }

    showToast('Luogo aggiunto!');
    refreshAll();
  }

  async function ensureOriginForWine(wineId) {
    try {
      const w = wineById[wineId]; if (!w) return;
      const guess = (w.region || w.denomination || w.winery || w.name);
      if (!guess) return;
      const hit = await searchGeocode(guess);
      if (!hit) return;
      await supabase.from('product_places').insert([{
        user_id: userId, item_type: 'wine', item_id: wineId, kind:'origin',
        place_name: hit.name, lat: hit.lat, lng: hit.lng, is_primary: true
      }]);
    } catch {}
  }

  const focusWineOnMap = useCallback((wineId) => {
    const candidates = (placesByWine.get(wineId) || []);
    if (!candidates.length) { showToast('Nessun luogo salvato per questo vino'); return; }

    const target = candidates.find(c=>c.kind==='purchase') || candidates.find(c=>c.kind==='origin') || candidates[0];

    setMapCenter([target.lng, target.lat]);
    setMapZoom(7);

    setSelectedPlaceIds(new Set(candidates.map(p=>p.id)));
    document.getElementById('map-italia')?.scrollIntoView({ behavior:'smooth', block:'start' });
    setTimeout(() => setSelectedPlaceIds(new Set()), 3000);
  }, [placesByWine, showToast]);

  /* ---------------- Sommelier ---------------- */
  const [q, setQ] = useState('');
  const fileSommelierRef = useRef(null);

  async function handleSommelierOcrFiles(files) {
    try {
      if (!files || !files.length) { alert('Nessun file selezionato'); return; }

      const fd = new FormData();
      for (let i=0; i<files.length; i++) {
        const jf = await toJpegIfNeeded(files[i]);
        fd.append('images', jf, jf.name || `foto_${i+1}.jpg`);
      }

     const r = await fetch(OCR_API_GENERIC, { method:'POST', body: fd });
      if (!r.ok) {
        const txt = await r.text().catch(()=> '');
        throw new Error(`HTTP ${r.status} ${r.statusText}${txt ? ` - ${txt.slice(0,120)}` : ''}`);
      }
      const j = await r.json();
      const text = String(j?.text || j?.data?.text || j?.data || '').trim();
      if (!text) { alert('OCR: nessun testo letto.'); return; }
      setSommelierLists(prev => [...prev, text]);
      showToast(`${files.length} ${files.length === 1 ? 'pagina' : 'pagine'} aggiunte alla carta`);
    } catch (e) {
      console.error('OCR upload error', e);
      alert('Errore Sommelier OCR: ' + (e?.message || e));
    }
  }

  async function runSommelier() {
    try {
      setSommelierBusy(true);

      const aggregatedList = (sommelierLists || []).filter(Boolean).join('\n').trim();

      const payload = {
        query: q || '',
        wineLists: sommelierLists,
        wineList: aggregatedList || null,
        qrLinks: sommelierQr
      };

      const r = await fetch('/api/sommelier', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      setSommelierData(j);
      setSommelierOpen(true);
    } catch (e) {
      alert('Sommelier error: ' + (e?.message || e));
    } finally {
      setSommelierBusy(false);
    }
  }

  async function addRecommendationToBevuti(rec) {
    try {
      if (!userId) { alert('Sessione assente'); return; }

      const preRegion = rec.region || guessRegionFromText([rec.name, rec.denomination, rec.winery].join(' ')).region || null;

      const { data: newWine, error } = await supabase
        .from('wines')
        .insert([{
          user_id: userId,
          name: rec.name?.trim() || 'Vino senza nome',
          winery: rec.winery || null,
          denomination: rec.denomination || null,
          region: preRegion,
          style: rec.style || null,
          price_target: rec.typical_price_eur ?? null
        }])
        .select()
        .single();

      if (error) throw error;

      const p = await getCurrentPlaceOrAsk('dove l’hai bevuto');
      if (p) {
        const { error: e2 } = await supabase.from('product_places').insert([{
          user_id: userId,
          item_type: 'wine',
          item_id: newWine.id,
          kind: 'purchase',
          place_name: p.name || `(${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`,
          lat: p.lat, lng: p.lng, is_primary: true
        }]);
        if (e2) throw e2;
      }

      showToast('Aggiunto ai “vini bevuti”');
      await refreshAll();
      focusWineOnMap(newWine.id);
    } catch (e) {
      console.error(e);
      alert('Errore salvataggio: ' + (e.message || e));
    }
  }

  /* -------- OCR ETICHETTA: INSERISCI DIRETTAMENTE IN VINI -------- */
  async function addWineByOcr(file) {
    try {
      if (!userId) return alert('Sessione assente');

      const safeFile = await toJpegIfNeeded(file);
      const fd = new FormData();
      fd.append('images', safeFile, safeFile.name || 'label.jpg');
     const r1 = await fetch(OCR_API_GENERIC, { method:'POST', body: fd })
      const j1 = await r1.json();

      const text = String(j1?.text || j1?.data?.text || j1?.data || '').trim();
      if (!text) { alert('OCR: nessun testo letto.'); return; }

      const r2 = await fetch('/api/normalize', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text, target:'wine' })
      });
      const norm = await r2.json();
      const d = norm?.data || {};

      const regionGuess = d.region || guessRegionFromText(
        [d.name, d.denomination, d.winery].filter(Boolean).join(' ')
      ).region || null;

      const { data: newWine, error } = await supabase.from('wines').insert([{
        user_id: userId,
        name: (d.name || '').trim() || 'Vino (da etichetta)',
        winery: d.winery || null,
        denomination: d.denomination || null,
        region: regionGuess,
        grapes: Array.isArray(d.grapes) ? d.grapes : null,
        vintage: d.vintage ?? null,
        style: d.style || null,
        price_target: d.price_eur ?? null,
        alcohol: d.alcohol ?? null,
        grape_blend: Array.isArray(d.grape_blend) ? d.grape_blend : null
      }]).select().single();
      if (error) throw error;

      const orig = d.origin?.lat && d.origin?.lng
        ? d.origin
        : (await searchGeocode(regionGuess || d.denomination || d.winery || d.name));

      if (orig && orig.lat && orig.lng) {
        await supabase.from('product_places').insert([{
          user_id:userId, item_type:'wine', item_id:newWine.id, kind:'origin',
          place_name: orig.name || null, lat: Number(orig.lat), lng:Number(orig.lng), is_primary:true
        }]);
      }

      showToast('Vino inserito da OCR');
      await refreshAll();
    } catch (e) {
      alert('Errore OCR etichetta: ' + (e?.message || e));
    }
  }

  /* -------- Popup info (annate migliori + pairing) -------- */
  async function loadPopupInfo(place) {
    try {
      if (!place?.id) return;
      const w = wineById[place.item_id];
      if (!w) return;
      let info = { vintages: [], pairing: '' };
      try {
        const q = [w.name, w.denomination, w.region, w.winery].filter(Boolean).join(' ');
        const r = await fetch(`/api/wine-brief?q=${encodeURIComponent(q)}`);
        if (r.ok) {
          const j = await r.json();
          info.vintages = Array.isArray(j?.best_vintages) ? j.best_vintages.slice(0,6) : [];
          info.pairing  = j?.pairing || '';
        }
      } catch {}
      if (!info.pairing) info.pairing = simplePairing(w);
      setPopupInfo(prev => ({ ...prev, [place.id]: info }));
    } catch {}
  }

  /* ------------------- Rating & Delete ------------------- */
  const setRating = useCallback(async (id,n)=>{
    if (!userId) return;
    const { error } = await supabase.from('wines').update({ rating_5:n }).eq('id',id).eq('user_id',userId);
    if (error) return alert('Errore voto: '+error.message);
    refreshAll();
  },[userId,refreshAll]);

  const deleteWine = useCallback(async (id)=>{
    if (!userId) return;
    if (!confirm('Eliminare questo vino?')) return;
    await supabase.from('product_places').delete().eq('item_type','wine').eq('item_id',id).eq('user_id',userId);
    const { error } = await supabase.from('wines').delete().eq('id',id).eq('user_id',userId);
    if (error) return alert('Errore eliminazione: '+error.message);
    showToast('Vino eliminato');
    refreshAll();
  },[userId,refreshAll,showToast]);

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
          placeholder='Es: "rosso non troppo corposo", "rosé fruttato minerale sotto 25€"'
          style={{ flex:1, minWidth:240, ...inp }}
        />
        <button onClick={runSommelier} style={btn(true)} disabled={sommelierBusy}>{sommelierBusy ? '…' : 'Sommelier'}</button>
        <button onClick={()=>fileSommelierRef.current?.click()} style={btn(false)}>Sommelier (OCR)</button>
        <input
          ref={fileSommelierRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          capture="environment"
          style={{ display:'none' }}
          onChange={async (e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';                                // ✅ reset per ri-trigger
            if (files.length) await handleSommelierOcrFiles(files);
          }}
        />
        <button onClick={()=>setShowQr(true)} style={btn(false)}>Scanner QR</button>
      </div>

      {(sommelierLists.length || sommelierQr.length) ? (
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:-6, marginBottom:10}}>
          <span style={{opacity:.85}}>
            Allegati: {sommelierLists.length} foto OCR • {sommelierQr.length} QR
          </span>
          <button
            onClick={() => { setSommelierLists([]); setSommelierQr([]); showToast('Allegati azzerati'); }}
            style={btn(false)}
          >
            Pulisci allegati
          </button>
        </div>
      ) : null}

      {showQr && (
        <LiveQrScanner
          onClose={()=>setShowQr(false)}
          onResult={(codes) => {
            setShowQr(false);
            setSommelierQr(prev => [...prev, ...codes]);
            showToast(`${codes.length} link QR aggiunti`);
          }}
        />
      )}
      {sommelierOpen && (
        <SommelierDrawer
          data={sommelierData}
          onClose={()=>setSommelierOpen(false)}
          onAdd={addRecommendationToBevuti}
        />
      )}

      {/* ===== ARTISAN ===== */}
      {tab === 'artisan' && (
        <>
          <SectionToolbar
            label="Formaggi & Salumi"
            onAddManual={()=> setShowAddArtisan(v=>!v)}
            onOcr={()=> alert('Per ora aggiungi i Formaggi/Salumi manualmente (posso attivare OCR anche qui se vuoi).')}
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
                    </div>
                    <div className="actions-mobile">
                      <ActionsMobile
                        options={[
                          {value:'ate',label:'Dove l’ho mangiato'},
                        ]}
                        onAction={(v)=>{
                          if (v==='ate') addPlaceFor('artisan',row.id,'purchase');
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
            onOcr={(file)=> addWineByOcr(file)}
            showAdd={showAddWine}
          />
          {showAddWine && <AddWineForm userId={userId} onInserted={refreshAll} />}

          <Table>
            <thead>
              <tr>
                <th style={{textAlign:'left',padding:10}}>Vino</th>
                <th style={{textAlign:'left',padding:10}}>Cantina</th>
                <th style={{textAlign:'left',padding:10}}>Denominazione</th>
                <th style={{textAlign:'left',padding:10}}>Regione</th>
                <th style={{textAlign:'right',padding:10}}>Grad.</th>
                <th style={{textAlign:'left',padding:10}}>Vitigni / Blend</th>
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
                    <TCell onClick={()=>focusWineOnMap(row.id)}>{row.name}</TCell>
                    <TCell onClick={()=>focusWineOnMap(row.id)}>{row.winery || '—'}</TCell>
                    <TCell onClick={()=>focusWineOnMap(row.id)}>{row.denomination || '—'}</TCell>
                    <TCell onClick={()=>focusWineOnMap(row.id)}>{row.region || '—'}</TCell>
                    <TCell right onClick={()=>focusWineOnMap(row.id)}>{row.alcohol!=null ? `${Number(row.alcohol).toFixed(1)}%` : '—'}</TCell>
                    <TCell onClick={()=>focusWineOnMap(row.id)}>{blend}</TCell>
                    <TCell right onClick={()=>focusWineOnMap(row.id)}>{row.vintage || '—'}</TCell>
                    <TCell right onClick={()=>focusWineOnMap(row.id)}>{row.price_target!=null ? `€ ${Number(row.price_target).toFixed(2)}` : '—'}</TCell>
                    <TCell><Stars value={row.rating_5 || 0} onChange={(n)=>setRating(row.id,n)} /></TCell>
                    <TCell>
                      <div className="actions-desktop" style={{display:'none',gap:6,flexWrap:'wrap'}}>
                        <button style={btn(false)} onClick={()=>addPlaceFor('wine',row.id,'purchase')}>Dove l’ho bevuto</button>
                        <button style={btn(false)} onClick={()=>deleteWine(row.id)}>Elimina</button>
                        <button style={btn(false)} onClick={()=>navigator.clipboard.writeText(row.name)}>Copia nome</button>
                      </div>
                      <div className="actions-mobile">
                        <ActionsMobile
                          options={[
                            {value:'drank',label:'Dove l’ho bevuto'},
                            {value:'del', label:'Elimina'},
                            {value:'copy',label:'Copia nome'},
                          ]}
                          onAction={(v)=>{
                            if (v==='drank') addPlaceFor('wine',row.id,'purchase');
                            if (v==='del') deleteWine(row.id);
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
            onOcr={()=> alert('Per OCR carta usa i pulsanti Sommelier in alto 😉')}
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
                  <TCell onClick={()=>focusWineOnMap(row.wine?.id || row.wine_id)}>{row.wine?.name || '—'}</TCell>
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
            const isSel = selectedPlaceIds.has(p.id);
            const wine  = (p.item_type==='wine') ? wineById[p.item_id] : null;
            const blend = wine?.grapes?.join(', ')
              || (Array.isArray(wine?.grape_blend) ? wine.grape_blend.map(b=> (b.pct?`${b.pct}% `:'')+b.name).join(', ') : '');
            const info  = popupInfo[p.id] || {};

            return (
              <CircleMarker
                key={p.id}
                center={[p.lat,p.lng]}
                radius={isSel ? 7 : 5}
                className={isSel ? 'pulse' : undefined}
                pathOptions={{color,fillColor:color,fillOpacity:1}}
                eventHandlers={{ click: ()=> (p.item_type==='wine' ? loadPopupInfo(p) : undefined) }}
              >
                {p.place_name ? <Tooltip direction="top">{p.place_name}</Tooltip> : null}
                {p.item_type==='wine' && (
                  <Popup className="dark-popup">
                    <div style={{minWidth:240}}>
                      <div style={{fontWeight:700, marginBottom:4}}>{wine?.name || 'Vino'}</div>
                      <div style={{opacity:.9}}>
                        {wine?.denomination || '—'}
                        {wine?.region ? ` • ${wine.region}` : ''}
                        {wine?.vintage ? ` • ${wine.vintage}` : ''}
                      </div>
                      {blend ? <div style={{opacity:.85, marginTop:6}}>Vitigni: {blend}</div> : null}
                      {(info?.vintages?.length || wine?.vintage) ? (
                        <div style={{marginTop:8}}>
                          {info?.vintages?.length ? <>Annate migliori: <strong>{info.vintages.join(', ')}</strong><br/></> : null}
                          Annata bevuta: <strong>{wine?.vintage ?? '—'}</strong>
                        </div>
                      ) : null}
                      {info?.pairing ? <div style={{marginTop:8}}>Abbinamento: {info.pairing}</div> : null}
                    </div>
                  </Popup>
                )}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </section>

      {/* Toasts */}
      <div className="toast-wrap">
        {toasts.map(t => (<div key={t.id} className="toast">{t.msg}</div>))}
      </div>

      {/* CSS extra */}
      <style jsx>{`
        @media (min-width: 768px){
          .actions-desktop{ display:flex !important; }
          .actions-mobile { display:none; }
        }
        .toast-wrap{
          position: fixed;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 9999;
          pointer-events: none;
        }
        .toast{
          background: rgba(15,23,42,0.95);
          border: 1px solid #1f2a38;
          color: #e5eeff;
          padding: 10px 12px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,.35);
          font-weight: 600;
          pointer-events: auto;
        }
      `}</style>

      {/* Global styles for popup & pulse */}
      <style jsx global>{`
        .leaflet-container .dark-popup .leaflet-popup-content-wrapper {
          background: #0b0f14;
          color: #e5eeff;
          border: 1px solid #1f2a38;
        }
        .leaflet-container .dark-popup .leaflet-popup-tip {
          background: #0b0f14;
          border: 1px solid #1f2a38;
        }
        @keyframes ping {
          0%   { transform: scale(1);    opacity: .95; }
          50%  { transform: scale(1.35); opacity: .45; }
          100% { transform: scale(1);    opacity: .95; }
        }
        .leaflet-container .pulse {
          transform-origin: center;
          animation: ping 1.6s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}

/* ===== Inferenzioni Regione/Provincia da denominazioni note ===== */
function guessRegionFromText(text='') {
  const s = text.toLowerCase();

  // Veneto (VR)
  if (/\b(valpolicella|amarone|soave|lugana|bardolino|custoza|valpantena)\b/.test(s)) return { region:'Veneto (VR)' };
  // Piemonte
  if (/\b(barolo|barbaresco|nebbiolo|roero|gattinara|ghemme|barbera d[’']?asti|barbera d[’']?alba)\b/.test(s)) return { region:'Piemonte (CN)' };
  // Toscana
  if (/\b(chianti|brunello|montalcino|bolgheri|morellino|montepulciano toscana|vernaccia san\s*gimignano)\b/.test(s)) return { region:'Toscana (SI)' };
  // Sicilia
  if (/\b(etna|carricante|frappato|nero d.?avola)\b/.test(s)) return { region:'Sicilia (CT)' };
  // Abruzzo
  if (/\b(montepulciano d.?abruzzo|trebbiano d.?abruzzo)\b/.test(s)) return { region:'Abruzzo (PE)' };
  // Marche
  if (/\b(verdicchio|castelli di jesi|matelica)\b/.test(s)) return { region:'Marche (AN)' };
  // Lombardia
  if (/\b(franciacorta|valtellina|sassella|sforzato|inferno)\b/.test(s)) return { region:'Lombardia (BS)' };
  // Trentino-Alto Adige
  if (/\b(trento doc|teroldego|lagrein|alto adige|sudtirol)\b/.test(s)) return { region:'Trentino-Alto Adige' };
  // Puglia
  if (/\b(primitivo di manduria|negroamaro|salice salentino)\b/.test(s)) return { region:'Puglia (TA)' };
  // Campania
  if (/\b(taurasi|aglianico|greco di tufo|fiano di avellino)\b/.test(s)) return { region:'Campania (AV)' };

  return { region:null };
}

/* ===== Pairing semplice di fallback ===== */
function simplePairing(wine) {
  const mood = (wine?.style || '').toLowerCase();
  const name = (wine?.name || '').toLowerCase() + ' ' + (wine?.denomination || '').toLowerCase();

  if (/barolo|barbaresco|taurasi|brunello|sforzato|amarone/.test(name)) return 'Ideale con carni rosse brasate, cacciagione e formaggi stagionati.';
  if (/chianti|montepulciano|nero d.?avola|primitivo|aglianico|valpolicella ripasso/.test(name)) return 'Perfetto con arrosti, grigliate e primi al ragù.';
  if (/franciacorta|trento doc|prosecco|metodo classico|spumante/.test(name)) return 'Ottimo come aperitivo, con fritture di mare e crudi.';
  if (mood.includes('bianco') || /vernaccia|soave|verdicchio|gavi|lugana|greco|fiano/.test(name)) return 'Ideale con piatti di pesce, crostacei e carni bianche.';
  if (/ros[ée]/.test(mood) || /cerasuolo|rosato|rosé/.test(name)) return 'Perfetto con salumi, pizze gourmet e cucina mediterranea.';
  return 'Versatile: ottimo con cucina di terra, carni alla griglia o formaggi mediamente stagionati.';
}

export default withAuth(ProdottiTipiciViniPage);
