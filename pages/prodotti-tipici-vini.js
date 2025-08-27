// pages/prodotti-tipici-vini.js
import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';

const ComposableMap = dynamic(() => import('react-simple-maps').then(m => m.ComposableMap), { ssr: false });
const Geographies   = dynamic(() => import('react-simple-maps').then(m => m.Geographies), { ssr: false });
const Geography     = dynamic(() => import('react-simple-maps').then(m => m.Geography), { ssr: false });
const Marker        = dynamic(() => import('react-simple-maps').then(m => m.Marker), { ssr: false });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const WORLD_GEOURL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export default function ProdottiTipiciViniPage() {
  const [tab, setTab] = useState('artisan'); // 'artisan' | 'wines' | 'cellar'
  const [places, setPlaces] = useState([]);
  const [artisan, setArtisan] = useState([]);
  const [wines, setWines] = useState([]);
  const [cellar, setCellar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const [{ data: p }, { data: a }, { data: w }, { data: c }] = await Promise.all([
        supabase.from('product_places').select('*').order('created_at', { ascending: false }),
        supabase.from('artisan_products').select('*').order('created_at', { ascending: false }),
        supabase.from('wines').select('*').order('created_at', { ascending: false }),
        supabase.from('cellar').select('*').order('created_at', { ascending: false }),
      ]);
      setPlaces(p || []);
      setArtisan(a || []);
      setWines(w || []);
      const mapWine = new Map((w || []).map(x => [x.id, x]));
      const cx = (c || []).map(row => ({ ...row, wine: mapWine.get(row.wine_id) }));
      setCellar(cx);
    } catch (e) { console.error(e); }
    setLoading(false);
  })(); }, []);

  const italyMarkers = useMemo(() =>
    places.map(pl => ({
      id: pl.id,
      kind: pl.kind,
      coords: [pl.lng, pl.lat],
      label: pl.place_name || undefined
    }))
  , [places]);

  return (
    <>
      <Head><title>Prodotti tipici & Vini • Jarvis</title></Head>

      {/* Banner (stesso stile Lista Prodotti) */}
      <div style={{ width:'100%', height:220, overflow:'hidden', borderRadius:16, marginBottom:16, position:'relative' }}>
        <video src="/intro.mp4" muted loop playsInline autoPlay style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
        <div style={{
          position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.35))', color:'#fff', fontWeight:700, fontSize:28, letterSpacing:1.2
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

      {/* Mappa */}
      <section style={{ background:'#0b0f14', borderRadius:16, padding:12, marginBottom:16 }}>
        <h3 style={{ color:'#cdeafe', margin:'8px 8px 12px' }}>Mappa Italia — Origini (rosso) • Acquisto/Consumo (blu)</h3>
        <style jsx>{`
          @keyframes pulse {
            0%   { transform: scale(0.9); opacity: 0.7; }
            50%  { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.7; }
          }
        `}</style>
        <div style={{ width:'100%', height:420 }}>
          <ComposableMap projection="geoMercator" projectionConfig={{ scale:1200, center:[12.5,42.5] }}>
            <Geographies geography={WORLD_GEOURL}>
              {({ geographies }) =>
                geographies
                  .filter(g => g.properties.name === 'Italy')
                  .map(geo => (
                    <Geography key={geo.rsmKey} geography={geo}
                      style={{ default:{ fill:'#1a2331', outline:'none' }, hover:{ fill:'#243246' }, pressed:{ fill:'#243246' }}} />
                  ))
              }
            </Geographies>
            {italyMarkers.map(m => (
              <Marker key={m.id} coordinates={m.coords}>
                <circle r={5}
                  fill={(places.find(p => p.id === m.id)?.kind === 'origin') ? '#ef4444' : '#3b82f6'}
                  style={{ animation:'pulse 1.6s infinite' }}/>
                {m.label && <text textAnchor="start" y={-10} style={{ fill:'#cdeafe', fontSize:'10px' }}>{m.label}</text>}
              </Marker>
            ))}
          </ComposableMap>
        </div>
      </section>

      {tab === 'artisan' && <ArtisanSection data={artisan} loading={loading} />}
      {tab === 'wines'   && <WinesSection   data={wines}   loading={loading} />}
      {tab === 'cellar'  && <CellarSection  data={cellar}  loading={loading} />}
    </>
  );
}

function btn(active) {
  return {
    padding:'10px 14px',
    borderRadius:12,
    border:'1px solid ' + (active ? '#60a5fa' : '#2b3645'),
    background: active ? 'linear-gradient(180deg,#0f1e2d,#0b1520)' : 'transparent',
    color: active ? '#e6f0ff' : '#c7d2fe',
    cursor:'pointer'
  };
}
function TCell({ children }) {
  return <td style={{ padding:'10px 8px', borderBottom:'1px solid #1f2a38' }}>{children}</td>;
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

function ArtisanSection({ data, loading }) {
  return (
    <section>
      <h3 style={{ margin:'8px 0 8px' }}>Formaggi & Salumi</h3>
      <Table>
        <thead>
          <tr>
            <th style={{ textAlign:'left', padding:10 }}>Nome</th>
            <th style={{ textAlign:'left', padding:10 }}>Tipologia</th>
            <th style={{ textAlign:'left', padding:10 }}>Designazione</th>
            <th style={{ textAlign:'right', padding:10 }}>Prezzo</th>
            <th style={{ textAlign:'left', padding:10 }}>Note</th>
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
              <TCell style={{ textAlign:'right' }}>{row.price_eur != null ? `€ ${Number(row.price_eur).toFixed(2)}` : '—'}</TCell>
              <TCell>{row.notes || '—'}</TCell>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

function WinesSection({ data, loading }) {
  const [q, setQ] = useState('');
  async function askSommelier() {
    const r = await fetch('/api/sommelier', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ query: q })
    });
    const j = await r.json();
    alert(JSON.stringify(j, null, 2)); // TODO: sostituisci con drawer/pannello
  }
  async function findRetailers(name, region, budget) {
    const r = await fetch('/api/retailers', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ productName: name, region, budget })
    });
    const j = await r.json();
    alert(JSON.stringify(j, null, 2));
  }
  return (
    <section>
      <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px' }}>
        <input value={q} onChange={e=>setQ(e.target.value)}
          placeholder='Es: “Alternative a Barolo 2020 sotto 40€” o “Rosé Sicilia fresco”'
          style={{ flex:1, padding:'10px 12px', borderRadius:12, border:'1px solid #243246', background:'#0b0f14', color:'#e5eeff' }} />
        <button onClick={askSommelier} style={btn(true)}>Sommelier</button>
      </div>

      <Table>
        <thead>
          <tr>
            <th style={{ textAlign:'left',  padding:10 }}>Vino</th>
            <th style={{ textAlign:'left',  padding:10 }}>Cantina</th>
            <th style={{ textAlign:'left',  padding:10 }}>Denominazione</th>
            <th style={{ textAlign:'left',  padding:10 }}>Regione</th>
            <th style={{ textAlign:'right', padding:10 }}>Annata</th>
            <th style={{ textAlign:'right', padding:10 }}>Budget</th>
            <th style={{ textAlign:'left',  padding:10 }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><TCell>Caricamento…</TCell></tr>}
          {!loading && data.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
          {data.map(row => (
            <tr key={row.id}>
              <TCell>{row.name}</TCell>
              <TCell>{row.winery || '—'}</TCell>
              <TCell>{row.denomination || '—'}</TCell>
              <TCell>{row.region || '—'}</TCell>
              <TCell style={{ textAlign:'right' }}>{row.vintage || '—'}</TCell>
              <TCell style={{ textAlign:'right' }}>{row.price_target != null ? `€ ${Number(row.price_target).toFixed(2)}` : '—'}</TCell>
              <TCell>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button style={btn(false)} onClick={()=>findRetailers(row.name, row.region || undefined, row.price_target || undefined)}>Trova rivenditori</button>
                  <button style={btn(false)} onClick={()=>navigator.clipboard.writeText(row.name)}>Copia nome</button>
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
      <h3 style={{ margin:'8px 0 8px' }}>Cantina</h3>
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
              <TCell style={{ textAlign:'right' }}>{row.bottles}</TCell>
              <TCell style={{ textAlign:'right' }}>{row.purchase_price_eur != null ? `€ ${Number(row.purchase_price_eur).toFixed(2)}` : '—'}</TCell>
              <TCell>{(row.pairings || []).join(', ') || '—'}</TCell>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}
