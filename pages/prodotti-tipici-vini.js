// pages/prodotti-tipici-vini.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';

// Leaflet (no-SSR)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Tooltip      = dynamic(() => import('react-leaflet').then(m => m.Tooltip),      { ssr: false });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function ProdottiTipiciViniPage() {
  const [tab, setTab] = useState('artisan'); // 'artisan' | 'wines' | 'cellar'
  const [places, setPlaces] = useState([]);
  const [artisan, setArtisan] = useState([]);
  const [wines, setWines] = useState([]);
  const [cellar, setCellar] = useState([]);
  const [loading, setLoading] = useState(true);

  // Toolbar state + refs ai form (per precompilazione OCR/voce)
  const [showAddArtisan, setShowAddArtisan] = useState(false);
  const [showAddWine, setShowAddWine]       = useState(false);
  const [showAddCellar, setShowAddCellar]   = useState(false);
  const artisanFormRef = useRef(null);
  const wineFormRef    = useRef(null);
  const cellarFormRef  = useRef(null);

  // Mappa (in fondo)
  const [mapCenter, setMapCenter] = useState([12.5, 42.5]); // [lng, lat]
  const [mapZoom, setMapZoom] = useState(5);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);

  function openOnMapForItem(itemType, itemId, kind = 'origin') {
    const candidates = places.filter(
      (p) => p.item_type === itemType && p.item_id === itemId && p.kind === kind
    );
    if (!candidates.length) {
      alert(`Nessun luogo “${kind}” salvato per questo elemento`);
      return;
    }
    const target = candidates.find((c) => c.is_primary) || candidates[0];
    setMapCenter([target.lng, target.lat]);
    setMapZoom(6);
    setSelectedPlaceId(target.id);
    const el = document.getElementById('map-italia');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setSelectedPlaceId(null), 3000);
  }

  async function refreshAll() {
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
      const mapWine = new Map((w || []).map((x) => [x.id, x]));
      const cx = (c || []).map((row) => ({ ...row, wine: mapWine.get(row.wine_id) }));
      setCellar(cx);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  useEffect(() => { refreshAll(); }, []);

  return (
    <>
      <Head><title>Prodotti tipici & Vini • Jarvis</title></Head>

      {/* Banner */}
      <div style={{ width: '100%', height: 220, overflow: 'hidden', borderRadius: 16, marginBottom: 16, position: 'relative' }}>
        <video src="/intro.mp4" muted loop playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.35))', color: '#fff',
          fontWeight: 700, fontSize: 28, letterSpacing: 1.2, pointerEvents: 'none' // evita sovrapposizione click
        }}>
          PRODOTTI TIPICI & VINI
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab('artisan')} style={btn(tab === 'artisan')}>Formaggi & Salumi</button>
        <button onClick={() => setTab('wines')}   style={btn(tab === 'wines')}>Vini (Wishlist)</button>
        <button onClick={() => setTab('cellar')}  style={btn(tab === 'cellar')}>Cantina</button>
      </div>

      {/* ====== SEZIONE FORMAGGI & SALUMI ====== */}
      {tab === 'artisan' && (
        <>
          <SectionToolbar
            label="Formaggi & Salumi"
            onAddManual={() => setShowAddArtisan((v) => !v)}
            onParsed={(parsed) => {
              if (parsed?.kind !== 'artisan') {
                alert('L\'OCR/voce ha rilevato un vino; apro il form Vini.');
                setTab('wines');
                setShowAddWine(true);
                wineFormRef.current?.applyParsedData(parsed, { addToCellar: false });
                return;
              }
              setShowAddArtisan(true);
              artisanFormRef.current?.applyParsedData(parsed);
            }}
          />
          {showAddArtisan && <AddArtisanForm ref={artisanFormRef} onInserted={refreshAll} />}

          <ArtisanSection data={artisan} loading={loading} onOpenMap={openOnMapForItem} />

          <AddPlaceWidget
            kindOptions={[{ label: 'Origine', value: 'origin' }, { label: 'Acquisto/Consumo', value: 'purchase' }]}
            items={artisan.map((a) => ({ id: a.id, label: `${a.name} (${a.category})`, type: 'artisan' }))}
            onInserted={refreshAll}
          />
        </>
      )}

      {/* ====== SEZIONE VINI (WISHLIST) ====== */}
      {tab === 'wines' && (
        <>
          <SectionToolbar
            label="Vini (Wishlist)"
            onAddManual={() => setShowAddWine((v) => !v)}
            onParsed={(parsed) => {
              if (parsed?.kind !== 'wine') {
                alert('L\'OCR/voce ha rilevato un prodotto tipico; apro il form Formaggi&Salumi.');
                setTab('artisan');
                setShowAddArtisan(true);
                artisanFormRef.current?.applyParsedData(parsed);
                return;
              }
              setShowAddWine(true);
              wineFormRef.current?.applyParsedData(parsed, { addToCellar: false });
            }}
          />
          {showAddWine && <AddWineForm ref={wineFormRef} onInserted={refreshAll} />}

          <WinesSection data={wines} loading={loading} onOpenMap={openOnMapForItem} />

          <AddPlaceWidget
            kindOptions={[{ label: 'Origine', value: 'origin' }, { label: 'Acquisto/Consumo', value: 'purchase' }]}
            items={wines.map((w) => ({ id: w.id, label: `${w.name}${w.winery ? ` - ${w.winery}` : ''}`, type: 'wine' }))}
            onInserted={refreshAll}
          />
        </>
      )}

      {/* ====== SEZIONE CANTINA ====== */}
      {tab === 'cellar' && (
        <>
          <SectionToolbar
            label="Cantina"
            onAddManual={() => setShowAddCellar((v) => !v)}
            onParsed={(parsed) => {
              if (parsed?.kind === 'wine') {
                setTab('wines');
                setShowAddWine(true);
                wineFormRef.current?.applyParsedData(parsed, { addToCellar: true });
              } else if (parsed?.kind === 'artisan') {
                setTab('artisan');
                setShowAddArtisan(true);
                artisanFormRef.current?.applyParsedData(parsed);
              } else {
                alert('Non riconosciuto. Compila manualmente.');
              }
            }}
          />
          {showAddCellar && <AddCellarForm ref={cellarFormRef} wines={wines} onInserted={refreshAll} />}

          <CellarSection data={cellar} loading={loading} />
        </>
      )}

      {/* ====== MAPPA (IN FONDO, CHIUDE LA PAGINA) ====== */}
      <section id="map-italia" style={{
        background: '#0b0f14', border: '1px solid #1f2a38', borderRadius: 16,
        padding: 12, marginTop: 16, marginBottom: 8, position: 'relative', zIndex: 1
      }}>
        <h3 style={{ color: '#cdeafe', margin: '8px 8px 12px' }}>
          Mappa Italia — Origini (rosso) • Acquisto/Consumo (blu)
        </h3>
        <MapContainer
          center={[mapCenter[1], mapCenter[0]]} // Leaflet usa [lat,lng]
          zoom={mapZoom}
          scrollWheelZoom
          style={{ width: '100%', height: 420, borderRadius: 16, overflow: 'hidden' }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                     attribution="&copy; OpenStreetMap contributors" />
          {places.map((p) => {
            const color = p.kind === 'origin' ? '#ef4444' : '#3b82f6';
            const isSel = selectedPlaceId === p.id;
            return (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lng]}
                radius={isSel ? 7 : 5}
                pathOptions={{ color, fillColor: color, fillOpacity: 1 }}
              >
                {p.place_name ? <Tooltip direction="top">{p.place_name}</Tooltip> : null}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </section>
    </>
  );
}

/* ================= UI Helpers ================ */
function btn(active) {
  return {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid ' + (active ? '#60a5fa' : '#2b3645'),
    background: active ? 'linear-gradient(180deg,#0f1e2d,#0b1520)' : 'transparent',
    color: active ? '#e6f0ff' : '#c7d2fe',
    cursor: 'pointer'
  };
}
function TCell({ children }) {
  return <td style={{ padding: '10px 8px', borderBottom: '1px solid #1f2a38' }}>{children}</td>;
}
function Table({ children }) {
  return (
    <div style={{ overflowX: 'auto', background: '#0b0f14', borderRadius: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e5eeff' }}>
        {children}
      </table>
    </div>
  );
}
const inp = { padding: '10px 12px', borderRadius: 12, border: '1px solid #243246', background: '#0b0f14', color: '#e5eeff' };

/* ============== Toolbar Manuale/OCR/Vocale ============== */
function SectionToolbar({ label, onAddManual, onParsed }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleOcrFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r1 = await fetch('/api/ocr', { method: 'POST', body: fd });
      const j1 = await r1.json();
      const text = j1?.text || j1?.result || j1?.raw || '';
      if (!text) throw new Error('OCR: nessun testo.');
      const r2 = await fetch('/api/ingest/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrText: text })
      });
      const parsed = await r2.json();
      onParsed && onParsed(parsed, { source: 'ocr', raw: text });
    } catch (e) {
      alert('Errore OCR: ' + (e.message || e));
    } finally { setBusy(false); }
  }

  async function handleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setBusy(true);
    try {
      if (SR) {
        await new Promise((resolve, reject) => {
          const rec = new SR();
          rec.lang = 'it-IT';
          rec.interimResults = false;
          rec.maxAlternatives = 1;
          rec.onresult = async (ev) => {
            const text = ev.results?.[0]?.[0]?.transcript || '';
            if (text) {
              const r2 = await fetch('/api/ingest/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ocrText: text })
              });
              const parsed = await r2.json();
              onParsed && onParsed(parsed, { source: 'voice', raw: text });
            }
            resolve();
          };
          rec.onerror = (e) => reject(e.error || 'Errore riconoscimento vocale');
          rec.onend = resolve;
          rec.start();
        });
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        const chunks = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        const done = new Promise((res) => (recorder.onstop = res));
        recorder.start();
        setTimeout(() => recorder.stop(), 5000);
        await done;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('file', blob, 'audio.webm');
        const r1 = await fetch('/api/stt', { method: 'POST', body: fd });
        const j1 = await r1.json();
        const text = j1?.text || '';
        if (!text) throw new Error('STT: nessun testo.');
        const r2 = await fetch('/api/ingest/ocr', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ocrText: text })
        });
        const parsed = await r2.json();
        onParsed && onParsed(parsed, { source: 'voice', raw: text });
      }
    } catch (e) {
      alert('Errore voce: ' + (e.message || e));
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 12px' }}>
      <span style={{ color: '#cdeafe', fontWeight: 700 }}>{label}</span>
      <button onClick={onAddManual} style={btn(true)}>Aggiungi manuale</button>
      <button onClick={() => fileRef.current?.click()} style={btn(false)} disabled={busy}>{busy ? 'OCR…' : 'OCR (foto)'}</button>
      <button onClick={handleVoice} style={btn(false)} disabled={busy}>{busy ? 'Ascolto…' : 'Vocale'}</button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleOcrFile(e.target.files?.[0])} />
    </div>
  );
}

/* ===================== Liste/Sezioni ===================== */
function ArtisanSection({ data, loading, onOpenMap }) {
  return (
    <section>
      <h3 style={{ margin: '8px 0 8px' }}>Formaggi & Salumi</h3>
      <Table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 10 }}>Nome</th>
            <th style={{ textAlign: 'left', padding: 10 }}>Tipologia</th>
            <th style={{ textAlign: 'left', padding: 10 }}>Designazione</th>
            <th style={{ textAlign: 'right', padding: 10 }}>Prezzo</th>
            <th style={{ textAlign: 'left', padding: 10 }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><TCell>Caricamento…</TCell></tr>}
          {!loading && data.length === 0 && <tr><TCell>Nessun elemento</TCell></tr>}
          {data.map((row) => (
            <tr key={row.id}>
              <TCell>{row.name}</TCell>
              <TCell>{row.category}</TCell>
              <TCell>{row.designation || '—'}</TCell>
              <TCell style={{ textAlign: 'right' }}>{row.price_eur != null ? `€ ${Number(row.price_eur).toFixed(2)}` : '—'}</TCell>
              <TCell>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={btn(false)} onClick={() => onOpenMap('artisan', row.id, 'origin')}>Apri mappa (Origine)</button>
                  <button style={btn(false)} onClick={() => onOpenMap('artisan', row.id, 'purchase')}>Apri mappa (Acquisto)</button>
                </div>
              </TCell>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

function WinesSection({ data, loading, onOpenMap }) {
  const [q, setQ] = useState('');
  const [sommelierOpen, setSommelierOpen] = useState(false);
  const [sommelierData, setSommelierData] = useState(null);

  async function askSommelier() {
    const r = await fetch('/api/sommelier', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q })
    });
    const j = await r.json();
    setSommelierData(j);
    setSommelierOpen(true);
  }
  async function findRetailers(name, region, budget) {
    const r = await fetch('/api/retailers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName: name, region, budget })
    });
    const j = await r.json();
    alert(JSON.stringify(j, null, 2));
  }

  return (
    <section>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 12px' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Es: “Alternative a Barolo 2020 sotto 40€” o “Rosé Sicilia fresco”'
          style={{ flex: 1, padding: '10px 12px', borderRadius: 12, border: '1px solid #243246', background: '#0b0f14', color: '#e5eeff' }}
        />
        <button onClick={askSommelier} style={btn(true)}>Sommelier</button>
      </div>

      <Table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 10 }}>Vino</th>
            <th style={{ textAlign: 'left', padding: 10 }}>Cantina</th>
            <th style={{ textAlign: 'left', padding: 10 }}>Denominazione</th>
            <th style={{ textAlign: 'left', padding: 10 }}>Regione</th>
            <th style={{ textAlign: 'right', padding: 10 }}>Annata</th>
            <th style={{ textAlign: 'right', padding: 10 }}>Budget</th>
            <th style={{ textAlign: 'left', padding: 10 }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><TCell>Caricamento…</TCell></tr>}
          {!loading && data.length === 0 && <tr><TCell>Nessun elemento</TCell></tr>}
          {data.map((row) => (
            <tr key={row.id}>
              <TCell>{row.name}</TCell>
              <TCell>{row.winery || '—'}</TCell>
              <TCell>{row.denomination || '—'}</TCell>
              <TCell>{row.region || '—'}</TCell>
              <TCell style={{ textAlign: 'right' }}>{row.vintage || '—'}</TCell>
              <TCell style={{ textAlign: 'right' }}>{row.price_target != null ? `€ ${Number(row.price_target).toFixed(2)}` : '—'}</TCell>
              <TCell>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={btn(false)} onClick={() => onOpenMap('wine', row.id, 'origin')}>Apri mappa (Origine)</button>
                  <button style={btn(false)} onClick={() => onOpenMap('wine', row.id, 'purchase')}>Apri mappa (Acquisto)</button>
                  <button style={btn(false)} onClick={() => findRetailers(row.name, row.region || undefined, row.price_target || undefined)}>Trova rivenditori</button>
                  <button style={btn(false)} onClick={() => navigator.clipboard.writeText(row.name)}>Copia nome</button>
                </div>
              </TCell>
            </tr>
          ))}
        </tbody>
      </Table>

      {sommelierOpen && <SommelierDrawer data={sommelierData} onClose={() => setSommelierOpen(false)} />}
    </section>
  );
}

function CellarSection({ data, loading }) {
  return (
    <section>
      <h3 style={{ margin: '8px 0 8px' }}>Cantina</h3>
      <Table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 10 }}>Vino</th>
            <th style={{ textAlign: 'right', padding: 10 }}>Bottiglie</th>
            <th style={{ textAlign: 'right', padding: 10 }}>Prezzo acquisto</th>
            <th style={{ textAlign: 'left', padding: 10 }}>Abbinamenti</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><TCell>Caricamento…</TCell></tr>}
          {!loading && data.length === 0 && <tr><TCell>Nessun elemento</TCell></tr>}
          {data.map((row) => (
            <tr key={row.id}>
              <TCell>{row.wine?.name || '—'}</TCell>
              <TCell style={{ textAlign: 'right' }}>{row.bottles}</TCell>
              <TCell style={{ textAlign: 'right' }}>{row.purchase_price_eur != null ? `€ ${Number(row.purchase_price_eur).toFixed(2)}` : '—'}</TCell>
              <TCell>{(row.pairings || []).join(', ') || '—'}</TCell>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

/* ============== Sommelier Drawer ============== */
function SommelierDrawer({ data, onClose }) {
  const recs = data?.recommendations || [];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
      <div style={{ width: 'min(520px, 96vw)', height: '100%', background: '#0b0f14', borderLeft: '1px solid #1f2a38', padding: 16, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Sommelier – risultati</h3>
          <button onClick={onClose} style={btn(false)}>Chiudi</button>
        </div>
        {recs.length === 0 && <p style={{ opacity: 0.8 }}>{data?.notes || 'Nessun risultato.'}</p>}
        {recs.map((r, i) => (
          <div key={i} style={{ border: '1px solid #1f2a38', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>{r.name} {r.vintage_suggestion?.length ? `(${r.vintage_suggestion.join(', ')})` : ''}</div>
            <div style={{ opacity: 0.85 }}>{r.winery || '—'} • {r.denomination || '—'} • {r.region || '—'}</div>
            <div style={{ marginTop: 6 }}>{r.why}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(r.links || []).map((l, idx) => (
                <a key={idx} href={l.url} target="_blank" rel="noreferrer" style={btn(false)}>{l.title || 'Link'}</a>
              ))}
              {r.typical_price_eur != null && <span style={{ alignSelf: 'center', opacity: 0.9 }}>~ € {Number(r.typical_price_eur).toFixed(2)}</span>}
            </div>
          </div>
        ))}
        {data?.notes && recs.length > 0 && <p style={{ opacity: 0.8, marginTop: 12 }}>{data.notes}</p>}
      </div>
    </div>
  );
}

/* ============== Form: Add Artisan (forwardRef) ============== */
const AddArtisanForm = React.forwardRef(function AddArtisanForm({ onInserted }, ref) {
  const [form, setForm] = useState({
    name: '', category: 'formaggio', designation: '', price_eur: '', notes: '',
    origin_place_name: '', origin_lat: '', origin_lng: '', purchase_place_name: '', purchase_lat: '', purchase_lng: ''
  });
  const [ocrText, setOcrText] = useState('');
  const valid = form.name && form.category && form.origin_lat && form.origin_lng;

  React.useImperativeHandle(ref, () => ({
    applyParsedData(parsed) {
      if (parsed?.kind !== 'artisan' || !parsed?.data) return;
      const d = parsed.data;
      setForm((prev) => ({
        ...prev,
        name: d.name || prev.name,
        category: d.category || prev.category || 'formaggio',
        price_eur: (d.price_eur != null ? String(d.price_eur) : prev.price_eur),
        purchase_place_name: d.bought_place_name || prev.purchase_place_name
      }));
    },
    applyText(text) {
      setOcrText(text || '');
      setTimeout(() => ingestFromText(), 0);
    }
  }), []);

  async function handleInsert() {
    const { data, error } = await supabase.from('artisan_products').insert([{
      name: form.name.trim(),
      category: form.category,
      designation: form.designation || null,
      price_eur: form.price_eur ? Number(form.price_eur) : null,
      notes: form.notes || null
    }]).select().single();
    if (error) { alert('Errore prodotto: ' + error.message); return; }

    const rows = [];
    if (form.origin_lat && form.origin_lng) {
      rows.push({ item_type: 'artisan', item_id: data.id, kind: 'origin', place_name: form.origin_place_name || null, lat: Number(form.origin_lat), lng: Number(form.origin_lng), is_primary: true });
    }
    if (form.purchase_lat && form.purchase_lng) {
      rows.push({ item_type: 'artisan', item_id: data.id, kind: 'purchase', place_name: form.purchase_place_name || null, lat: Number(form.purchase_lat), lng: Number(form.purchase_lng), is_primary: true });
    }
    if (rows.length) {
      const { error: e2 } = await supabase.from('product_places').insert(rows);
      if (e2) { alert('Errore luogo: ' + e2.message); }
    }
    setForm({ name: '', category: 'formaggio', designation: '', price_eur: '', notes: '', origin_place_name: '', origin_lat: '', origin_lng: '', purchase_place_name: '', purchase_lat: '', purchase_lng: '' });
    onInserted && onInserted();
  }

  async function ingestFromText() {
    if (!ocrText) return;
    const r = await fetch('/api/ingest/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ocrText }) });
    const j = await r.json();
    if (j.kind === 'artisan' && j.data) {
      const d = j.data;
      setForm((prev) => ({
        ...prev,
        name: d.name || prev.name,
        category: d.category || prev.category || 'formaggio',
        price_eur: (d.price_eur != null ? String(d.price_eur) : prev.price_eur),
        purchase_place_name: d.bought_place_name || prev.purchase_place_name
      }));
    } else {
      alert('Non sembra un prodotto “artisan”.');
    }
  }

  return (
    <section style={{ marginBottom: 16, padding: 12, borderRadius: 16, background: '#0b0f14', border: '1px solid #1f2a38' }}>
      <h3 style={{ margin: '0 0 8px' }}>Aggiungi Formaggio/Salume</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inp}>
          <option value="formaggio">Formaggio</option>
          <option value="salume">Salume</option>
        </select>
        <input placeholder="Designazione (DOP/IGP…)" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} style={inp} />
        <input placeholder="Prezzo (€)" value={form.price_eur} onChange={(e) => setForm({ ...form, price_eur: e.target.value })} style={inp} />
        <input placeholder="Note" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inp} />

        <input placeholder="Origine - luogo" value={form.origin_place_name} onChange={(e) => setForm({ ...form, origin_place_name: e.target.value })} style={inp} />
        <input placeholder="Origine - lat" value={form.origin_lat} onChange={(e) => setForm({ ...form, origin_lat: e.target.value })} style={inp} />
        <input placeholder="Origine - lng" value={form.origin_lng} onChange={(e) => setForm({ ...form, origin_lng: e.target.value })} style={inp} />

        <input placeholder="Acquisto/Consumo - luogo" value={form.purchase_place_name} onChange={(e) => setForm({ ...form, purchase_place_name: e.target.value })} style={inp} />
        <input placeholder="Acquisto/Consumo - lat" value={form.purchase_lat} onChange={(e) => setForm({ ...form, purchase_lat: e.target.value })} style={inp} />
        <input placeholder="Acquisto/Consumo - lng" value={form.purchase_lng} onChange={(e) => setForm({ ...form, purchase_lng: e.target.value })} style={inp} />
      </div>

      {/* Ingest manuale testo */}
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <textarea placeholder="Incolla qui trascrizione voce/OCR…" value={ocrText} onChange={(e) => setOcrText(e.target.value)} style={{ ...inp, minHeight: 64 }} />
        <button onClick={ingestFromText} style={btn(true)}>Compila dal testo</button>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button onClick={handleInsert} disabled={!valid} style={btn(true)}>Salva</button>
        {!valid && <span style={{ alignSelf: 'center', opacity: 0.8, color: '#cdeafe' }}>Compila almeno Nome + Origine (lat/lng)</span>}
      </div>
    </section>
  );
});

/* ============== Form: Add Wine (forwardRef) ============== */
const AddWineForm = React.forwardRef(function AddWineForm({ onInserted }, ref) {
  const [form, setForm] = useState({
    name: '', winery: '', denomination: '', region: '', grapes: '', vintage: '', style: 'rosso', price_target: '',
    origin_place_name: '', origin_lat: '', origin_lng: '', purchase_place_name: '', purchase_lat: '', purchase_lng: '',
    addToCellar: false, bottles: '', purchase_price_eur: ''
  });
  const [ocrText, setOcrText] = useState('');

  React.useImperativeHandle(ref, () => ({
    applyParsedData(parsed, opts = {}) {
      if (parsed?.kind !== 'wine' || !parsed?.data) return;
      const d = parsed.data;
      setForm((prev) => ({
        ...prev,
        name: d.name || prev.name,
        vintage: (d.vintage != null ? String(d.vintage) : prev.vintage),
        price_target: (d.price_eur != null ? String(d.price_eur) : prev.price_target),
        purchase_place_name: d.bought_place_name || prev.purchase_place_name,
        addToCellar: !!opts.addToCellar
      }));
      if (opts.addToCellar && d.price_eur != null) {
        setForm((prev) => ({ ...prev, purchase_price_eur: String(d.price_eur) }));
      }
    },
    applyText(text) {
      setOcrText(text || '');
      setTimeout(() => ingestFromText(), 0);
    }
  }), []);

  const baseValid = form.name && form.origin_lat && form.origin_lng;

  async function handleInsert() {
    const grapesArr = form.grapes ? form.grapes.split(',').map((s) => s.trim()).filter(Boolean) : null;
    const { data, error } = await supabase.from('wines').insert([{
      name: form.name.trim(),
      winery: form.winery || null,
      denomination: form.denomination || null,
      region: form.region || null,
      grapes: grapesArr,
      vintage: form.vintage ? Number(form.vintage) : null,
      style: form.style || null,
      price_target: form.price_target ? Number(form.price_target) : null
    }]).select().single();
    if (error) { alert('Errore vino: ' + error.message); return; }

    const places = [];
    if (form.origin_lat && form.origin_lng) {
      places.push({ item_type: 'wine', item_id: data.id, kind: 'origin', place_name: form.origin_place_name || null, lat: Number(form.origin_lat), lng: Number(form.origin_lng), is_primary: true });
    }
    if (form.purchase_lat && form.purchase_lng) {
      places.push({ item_type: 'wine', item_id: data.id, kind: 'purchase', place_name: form.purchase_place_name || null, lat: Number(form.purchase_lat), lng: Number(form.purchase_lng), is_primary: true });
    }
    if (places.length) {
      const { error: e2 } = await supabase.from('product_places').insert(places);
      if (e2) alert('Errore luogo: ' + e2.message);
    }

    if (form.addToCellar) {
      const bottles = form.bottles ? Number(form.bottles) : 1;
      const price = form.purchase_price_eur ? Number(form.purchase_price_eur) : null;
      const { error: e3 } = await supabase.from('cellar').insert([{ wine_id: data.id, bottles, purchase_price_eur: price }]);
      if (e3) alert('Errore cantina: ' + e3.message);
    }

    setForm({
      name: '', winery: '', denomination: '', region: '', grapes: '', vintage: '', style: 'rosso', price_target: '',
      origin_place_name: '', origin_lat: '', origin_lng: '', purchase_place_name: '', purchase_lat: '', purchase_lng: '',
      addToCellar: false, bottles: '', purchase_price_eur: ''
    });
    onInserted && onInserted();
  }

  async function ingestFromText() {
    if (!ocrText) return;
    const r = await fetch('/api/ingest/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ocrText }) });
    const j = await r.json();
    if (j.kind === 'wine' && j.data) {
      const d = j.data;
      setForm((prev) => ({
        ...prev,
        name: d.name || prev.name,
        vintage: (d.vintage != null ? String(d.vintage) : prev.vintage),
        price_target: (d.price_eur != null ? String(d.price_eur) : prev.price_target),
        purchase_place_name: d.bought_place_name || prev.purchase_place_name
      }));
    } else {
      alert('Non sembra un vino.');
    }
  }

  return (
    <section style={{ marginBottom: 16, padding: 12, borderRadius: 16, background: '#0b0f14', border: '1px solid #1f2a38' }}>
      <h3 style={{ margin: '0 0 8px' }}>Aggiungi Vino (Wishlist)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
        <input placeholder="Cantina" value={form.winery} onChange={(e) => setForm({ ...form, winery: e.target.value })} style={inp} />
        <input placeholder="Denominazione (DOCG/DOC/IGT)" value={form.denomination} onChange={(e) => setForm({ ...form, denomination: e.target.value })} style={inp} />
        <input placeholder="Regione" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={inp} />
        <input placeholder="Vitigni (comma)" value={form.grapes} onChange={(e) => setForm({ ...form, grapes: e.target.value })} style={inp} />
        <input placeholder="Annata" value={form.vintage} onChange={(e) => setForm({ ...form, vintage: e.target.value })} style={inp} />
        <select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} style={inp}>
          <option value="rosso">Rosso</option><option value="bianco">Bianco</option><option value="rosé">Rosé</option><option value="frizzante">Frizzante</option><option value="fortificato">Fortificato</option>
        </select>
        <input placeholder="Budget (€)" value={form.price_target} onChange={(e) => setForm({ ...form, price_target: e.target.value })} style={inp} />

        <input placeholder="Origine - luogo" value={form.origin_place_name} onChange={(e) => setForm({ ...form, origin_place_name: e.target.value })} style={inp} />
        <input placeholder="Origine - lat" value={form.origin_lat} onChange={(e) => setForm({ ...form, origin_lat: e.target.value })} style={inp} />
        <input placeholder="Origine - lng" value={form.origin_lng} onChange={(e) => setForm({ ...form, origin_lng: e.target.value })} style={inp} />

        <input placeholder="Acquisto/Consumo - luogo" value={form.purchase_place_name} onChange={(e) => setForm({ ...form, purchase_place_name: e.target.value })} style={inp} />
        <input placeholder="Acquisto/Consumo - lat" value={form.purchase_lat} onChange={(e) => setForm({ ...form, purchase_lat: e.target.value })} style={inp} />
        <input placeholder="Acquisto/Consumo - lng" value={form.purchase_lng} onChange={(e) => setForm({ ...form, purchase_lng: e.target.value })} style={inp} />
      </div>

      {/* Ingest manuale testo */}
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <textarea placeholder="Incolla qui trascrizione voce/OCR…" value={ocrText} onChange={(e) => setOcrText(e.target.value)} style={{ ...inp, minHeight: 64 }} />
        <button onClick={ingestFromText} style={btn(true)}>Compila dal testo</button>
      </div>

      {/* Opzionale: aggiungi subito in Cantina */}
      <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={form.addToCellar} onChange={(e) => setForm({ ...form, addToCellar: e.target.checked })} />
          <span>Aggiungi anche in Cantina</span>
        </label>
        {form.addToCellar && (
          <>
            <input placeholder="Bottiglie" value={form.bottles} onChange={(e) => setForm({ ...form, bottles: e.target.value })} style={inp} />
            <input placeholder="Prezzo acquisto (€)" value={form.purchase_price_eur} onChange={(e) => setForm({ ...form, purchase_price_eur: e.target.value })} style={inp} />
          </>
        )}
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button onClick={handleInsert} disabled={!baseValid} style={btn(true)}>Salva</button>
        {!baseValid && <span style={{ alignSelf: 'center', opacity: 0.8, color: '#cdeafe' }}>Compila almeno Nome + Origine (lat/lng)</span>}
      </div>
    </section>
  );
});

/* ============== Form: Add Cellar ============== */
const AddCellarForm = React.forwardRef(function AddCellarForm({ wines, onInserted }, ref) {
  const [form, setForm] = useState({ wine_id: '', bottles: '1', purchase_price_eur: '', pairings: '' });

  React.useImperativeHandle(ref, () => ({
    reset() { setForm({ wine_id: '', bottles: '1', purchase_price_eur: '', pairings: '' }); }
  }), []);

  async function handleInsert() {
    if (!form.wine_id) { alert('Seleziona un vino'); return; }
    const bottles = form.bottles ? Number(form.bottles) : 1;
    const price   = form.purchase_price_eur ? Number(form.purchase_price_eur) : null;
    const pair    = form.pairings ? form.pairings.split(',').map((s) => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('cellar').insert([{ wine_id: form.wine_id, bottles, purchase_price_eur: price, pairings: pair }]);
    if (error) { alert('Errore: ' + error.message); return; }
    setForm({ wine_id: '', bottles: '1', purchase_price_eur: '', pairings: '' });
    onInserted && onInserted();
  }

  return (
    <section style={{ marginBottom: 16, padding: 12, borderRadius: 16, background: '#0b0f14', border: '1px solid #1f2a38' }}>
      <h3 style={{ margin: '0 0 8px' }}>Aggiungi in Cantina</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        <select value={form.wine_id} onChange={(e) => setForm({ ...form, wine_id: e.target.value })} style={inp}>
          <option value="">Seleziona vino…</option>
          {wines.map((w) => <option key={w.id} value={w.id}>{w.name}{w.winery ? ` - ${w.winery}` : ''}</option>)}
        </select>
        <input placeholder="Bottiglie" value={form.bottles} onChange={(e) => setForm({ ...form, bottles: e.target.value })} style={inp} />
        <input placeholder="Prezzo acquisto (€)" value={form.purchase_price_eur} onChange={(e) => setForm({ ...form, purchase_price_eur: e.target.value })} style={inp} />
        <input placeholder="Abbinamenti (comma)" value={form.pairings} onChange={(e) => setForm({ ...form, pairings: e.target.value })} style={inp} />
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={handleInsert} style={btn(true)}>Salva</button>
      </div>
    </section>
  );
});

/* ============== Widget: Aggiungi Luogo (multi-luoghi) ============== */
function AddPlaceWidget({ items, kindOptions, onInserted }) {
  const [f, setF] = useState({ item_type: 'wine', item_id: '', kind: 'origin', place_name: '', lat: '', lng: '', visited_at: '', is_primary: true });

  useEffect(() => {
    if (items.length && !f.item_id) setF((prev) => ({ ...prev, item_id: items[0].id, item_type: items[0].type }));
  }, [items]);

  async function addPlace() {
    if (!f.item_id || !f.lat || !f.lng) { alert('Seleziona item e inserisci lat/lng'); return; }
    const { error } = await supabase.from('product_places').insert([{
      item_type: f.item_type,
      item_id: f.item_id,
      kind: f.kind,
      place_name: f.place_name || null,
      lat: Number(f.lat),
      lng: Number(f.lng),
      visited_at: f.visited_at || null,
      is_primary: !!f.is_primary
    }]);
    if (error) { alert('Errore luogo: ' + error.message); return; }
    setF({ item_type: f.item_type, item_id: f.item_id, kind: 'origin', place_name: '', lat: '', lng: '', visited_at: '', is_primary: true });
    onInserted && onInserted();
  }

  return (
    <section style={{ margin: '16px 0', padding: 12, borderRadius: 16, background: '#0b0f14', border: '1px solid #1f2a38' }}>
      <h4 style={{ margin: '0 0 8px' }}>Aggiungi Luogo (multi-luoghi per item)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        <select value={f.item_id} onChange={(e) => {
          const sel = items.find((x) => x.id === e.target.value);
          setF({ ...f, item_id: e.target.value, item_type: sel?.type || f.item_type });
        }} style={inp}>
          {items.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} style={inp}>
          {kindOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input placeholder="Luogo (testo)" value={f.place_name} onChange={(e) => setF({ ...f, place_name: e.target.value })} style={inp} />
        <input placeholder="Lat" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} style={inp} />
        <input placeholder="Lng" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} style={inp} />
        <input placeholder="Data visita (YYYY-MM-DD)" value={f.visited_at} onChange={(e) => setF({ ...f, visited_at: e.target.value })} style={inp} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={f.is_primary} onChange={(e) => setF({ ...f, is_primary: e.target.checked })} />
          <span>Imposta come primary</span>
        </label>
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={addPlace} style={btn(true)}>Aggiungi luogo</button>
      </div>
    </section>
  );
}
