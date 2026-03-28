// pages/prodotti-tipici-vini.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';
import { supabase } from '../lib/supabaseClient';

/* ─── Leaflet (no SSR) ──────────────────────────────────────────── */
const MapContainer  = dynamic(() => import('react-leaflet').then(m => m.MapContainer),  { ssr: false });
const TileLayer     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const Marker        = dynamic(() => import('react-leaflet').then(m => m.Marker),        { ssr: false });
const Tooltip       = dynamic(() => import('react-leaflet').then(m => m.Tooltip),       { ssr: false });
const Popup         = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });
const useMap        = dynamic(() => import('react-leaflet').then(m => m.useMap),        { ssr: false });

/* ─── Icone SVG custom per Leaflet ──────────────────────────────── */
function makeLeafletIcon(svgContent, color) {
  if (typeof window === 'undefined') return null;
  try {
    const L = require('leaflet');
    return L.divIcon({
      html: `<div style="
        width:36px;height:36px;
        background:${color};
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        border:2px solid rgba(255,255,255,0.8);
        box-shadow:0 2px 8px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
      "><div style="transform:rotate(45deg);display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
        ${svgContent}
      </div></div>`,
      className: '',
      iconSize:   [36, 36],
      iconAnchor: [18, 36],
      popupAnchor:[0, -40],
    });
  } catch { return null; }
}

// SVG grappolo d'uva (origine)
const GRAPE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
  <circle cx="9"  cy="8"  r="2.5"/>
  <circle cx="15" cy="8"  r="2.5"/>
  <circle cx="6"  cy="13" r="2.5"/>
  <circle cx="12" cy="13" r="2.5"/>
  <circle cx="18" cy="13" r="2.5"/>
  <circle cx="9"  cy="18" r="2.5"/>
  <circle cx="15" cy="18" r="2.5"/>
  <line x1="12" y1="5" x2="12" y2="2" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="12" y1="2" x2="15" y2="1" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

// SVG calice di vino (dove bevuto)
const GLASS_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 2h8l-2 7a4 4 0 01-4 0L8 2z" fill="rgba(255,255,255,0.3)"/>
  <line x1="12" y1="9" x2="12" y2="18"/>
  <line x1="8"  y1="18" x2="16" y2="18"/>
</svg>`;

/* ─── MapFlyTo ───────────────────────────────────────────────────── */
function MapFlyTo({ center, zoom }) {
  const map = typeof useMap === 'function' ? useMap() : null;
  useEffect(() => {
    if (!map || !center) return;
    map.flyTo(center, zoom || 7, { animate: true, duration: 1 });
  }, [map, center, zoom]);
  return null;
}

/* ─── Helpers ───────────────────────────────────────────────────── */
function isoLocal(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

async function toJpegIfNeeded(file, { maxSide = 1800, quality = 0.82 } = {}) {
  try {
    const isHeic = /heic|heif/i.test(file.type || file.name || '');
    const tooBig = file.size > 7_000_000;
    if (!isHeic && !tooBig) return file;
    const dataUrl = await new Promise((ok, ko) => {
      const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file);
    });
    const img = await new Promise((ok, ko) => {
      const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = dataUrl;
    });
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], (file.name || 'upload').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'it' } }
    );
    const j = await r.json();
    if (!j) return null;
    const addr = j.address || {};
    const localName = j.name || addr.amenity || addr.shop || addr.tourism || addr.leisure || '';
    const road   = addr.road || addr.pedestrian || '';
    const city   = addr.city || addr.town || addr.village || addr.municipality || '';
    const parts  = [localName, road, city].filter(Boolean);
    return parts.length ? parts.join(', ') : (j.display_name || null);
  } catch { return null; }
}

async function searchGeocode(query) {
  if (!query?.trim()) return null;
  try {
    // countrycodes=it limita i risultati all'Italia
    // viewbox = bounding box Italia per prioritizzare risultati italiani
    const params = new URLSearchParams({
      format: 'json',
      q: query,
      limit: '3',
      countrycodes: 'it',
      addressdetails: '1',
    });
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) return null;
    // Preferisci risultati con classe 'place', 'boundary', 'landuse' o 'amenity'
    // rispetto a 'highway' o 'building' (troppo specifici)
    const best = j.find(x => ['place','boundary','landuse','amenity','natural'].includes(x.class))
      || j[0];
    return { name: best.display_name || query, lat: Number(best.lat), lng: Number(best.lon) };
  } catch {}
  return null;
}

async function getCurrentPlaceOrAsk(kindLabel) {
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }));
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    return { lat, lng, name: await reverseGeocode(lat, lng) };
  } catch {
    const manual = prompt(`Inserisci il luogo (${kindLabel}) es. "Enoteca X, Alba"`);
    if (!manual) return null;
    const hit = await searchGeocode(manual);
    if (!hit) { alert('Impossibile geocodificare.'); return null; }
    return hit;
  }
}

function guessRegionFromText(text = '') {
  const s = text.toLowerCase();
  if (/\b(valpolicella|amarone|soave|lugana|bardolino)\b/.test(s)) return 'Veneto';
  if (/\b(barolo|barbaresco|nebbiolo|roero|gattinara|barbera d['']?asti)\b/.test(s)) return 'Piemonte';
  if (/\b(chianti|brunello|montalcino|bolgheri|morellino|vernaccia)\b/.test(s)) return 'Toscana';
  if (/\b(etna|carricante|frappato|nero d.?avola)\b/.test(s)) return 'Sicilia';
  if (/\b(montepulciano d.?abruzzo|trebbiano d.?abruzzo)\b/.test(s)) return 'Abruzzo';
  if (/\b(verdicchio|castelli di jesi|matelica)\b/.test(s)) return 'Marche';
  if (/\b(franciacorta|valtellina|sassella|sforzato)\b/.test(s)) return 'Lombardia';
  if (/\b(trento doc|teroldego|lagrein|alto adige)\b/.test(s)) return 'Trentino-Alto Adige';
  if (/\b(primitivo di manduria|negroamaro|salice salentino)\b/.test(s)) return 'Puglia';
  if (/\b(taurasi|aglianico|greco di tufo|fiano di avellino)\b/.test(s)) return 'Campania';
  return null;
}

function simplePairing(wine) {
  const name = ((wine?.name || '') + ' ' + (wine?.denomination || '')).toLowerCase();
  if (/barolo|barbaresco|taurasi|brunello|sforzato|amarone/.test(name)) return 'Carni rosse brasate, cacciagione, formaggi stagionati.';
  if (/chianti|montepulciano|nero d.?avola|primitivo|aglianico/.test(name)) return 'Arrosti, grigliate, primi al ragù.';
  if (/franciacorta|trento doc|prosecco|spumante/.test(name)) return 'Aperitivo, fritture di mare, crudi.';
  const style = (wine?.style || '').toLowerCase();
  if (style.includes('bianco') || /vernaccia|soave|verdicchio|greco|fiano/.test(name)) return 'Pesce, crostacei, carni bianche.';
  if (/ros[ée]/.test(style) || /rosato/.test(name)) return 'Salumi, pizza, cucina mediterranea.';
  return 'Carni alla griglia, formaggi, cucina di terra.';
}

const STYLE_COLORS = {
  rosso:      { bg: 'rgba(239,68,68,.13)',   border: 'rgba(239,68,68,.3)',   text: '#f87171' },
  bianco:     { bg: 'rgba(251,191,36,.1)',   border: 'rgba(251,191,36,.25)', text: '#fbbf24' },
  rosé:       { bg: 'rgba(244,114,182,.1)',  border: 'rgba(244,114,182,.25)',text: '#f472b6' },
  frizzante:  { bg: 'rgba(6,182,212,.1)',    border: 'rgba(6,182,212,.25)',  text: '#22d3ee' },
  fortificato:{ bg: 'rgba(167,139,250,.1)',  border: 'rgba(167,139,250,.25)',text: '#a78bfa' },
};
function styleColor(s) { return STYLE_COLORS[(s||'').toLowerCase()] || STYLE_COLORS.rosso; }

/* ─── Stars ─────────────────────────────────────────────────────── */
function Stars({ value = 0, onChange }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} onClick={() => onChange?.(n)}
          style={{ cursor: onChange ? 'pointer' : 'default', fontSize: 14, color: n <= (value||0) ? '#fbbf24' : '#1e293b' }}>
          {n <= (value||0) ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

/* ─── Toast ─────────────────────────────────────────────────────── */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);
  return { toasts, show };
}

/* ─── OCR Preview Modal ──────────────────────────────────────────── */
function OcrPreviewModal({ data, onConfirm, onClose }) {
  const [form, setForm] = useState(data);
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <span>Conferma dati OCR etichetta</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="modal-hint">Verifica e correggi i dati estratti prima di salvare.</p>
        {[
          ['Nome', 'name'], ['Cantina', 'winery'], ['Denominazione', 'denomination'],
          ['Regione', 'region'], ['Annata', 'vintage'],
        ].map(([label, key]) => (
          <div key={key} className="modal-field">
            <label className="field-label">{label}</label>
            <input className="fi" value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} />
          </div>
        ))}
        <div className="modal-field">
          <label className="field-label">Stile</label>
          <select className="fi" value={form.style || 'rosso'} onChange={e => setForm({ ...form, style: e.target.value })}>
            <option value="rosso">Rosso</option><option value="bianco">Bianco</option>
            <option value="rosé">Rosé</option><option value="frizzante">Frizzante</option>
            <option value="fortificato">Fortificato</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annulla</button>
          <button className="btn-save" onClick={() => onConfirm(form)}>Salva vino</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Sommelier Drawer ───────────────────────────────────────────── */
function SommelierDrawer({ data, onClose, onAdd }) {
  const recs    = data?.recommendations || [];
  const src     = data?.source || '';
  const note    = data?.sommelier_note || '';
  const hasCard = data?.has_card;
  const hasProf = data?.has_profile;

  return (
    <div className="drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-header">
          <span>🍷 Il tuo Sommelier</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {note && (
          <div className="drawer-note">
            <span className="drawer-note-icon">💬</span>
            <span>{note}</span>
          </div>
        )}
        <div className="drawer-badges">
          <span className={`dbadge ${hasCard ? 'dbadge-green' : 'dbadge-gray'}`}>
            {hasCard ? '✓ Dalla carta del locale' : '◈ Consigli generali'}
          </span>
          <span className={`dbadge ${hasProf ? 'dbadge-purple' : 'dbadge-gray'}`}>
            {hasProf ? '★ Personalizzato per te' : '○ Senza profilo gusti'}
          </span>
        </div>
        <div className="drawer-body">
          {recs.length === 0 && (
            <p style={{ color: '#475569', fontSize: '.85rem', padding: '1rem 0' }}>
              Nessun risultato — prova ad aggiungere i piatti o la carta del ristorante.
            </p>
          )}
          {recs.map((r, i) => {
            const band = { low: '#22c55e', med: '#fbbf24', high: '#f87171' }[r.price_band] || '#64748b';
            const score = r.pairing_score || 0;
            const scoreColor = score >= 90 ? '#22c55e' : score >= 75 ? '#fbbf24' : '#94a3b8';
            return (
              <div className={`rec-card ${r.personal_match ? 'rec-card-match' : ''}`} key={i}>
                <div className="rec-header">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rec-name">
                      {r.personal_match && <span className="rec-match-star" title="Vicino ai tuoi gusti">★ </span>}
                      {r.name}
                      {r.vintage ? <span style={{ color: '#64748b', fontWeight: 400, fontSize: '.8rem' }}> {r.vintage}</span> : null}
                    </div>
                    {r.winery && <div style={{ fontSize: '.7rem', color: '#475569', marginTop: 1 }}>{r.winery}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <span className="rec-band" style={{ color: band, borderColor: band + '44', background: band + '11' }}>
                      {r.price_band === 'low' ? '< 20€' : r.price_band === 'med' ? '20-50€' : '> 50€'}
                    </span>
                    {score > 0 && (
                      <span style={{ fontSize: '.65rem', color: scoreColor, fontWeight: 700 }}>{score}% match</span>
                    )}
                  </div>
                </div>
                <div className="rec-sub">{[r.denomination, r.region].filter(Boolean).join(' · ')}</div>
                <div className="rec-why">
                  <span style={{ fontSize: '.68rem', color: '#475569', marginRight: 4 }}>🍽</span>
                  {r.why}
                </div>
                <div className="rec-footer">
                  {r.typical_price_eur != null && (
                    <span className="rec-price">~ € {Number(r.typical_price_eur).toFixed(0)}</span>
                  )}
                  {(r.links || []).map((l, idx) => (
                    <a key={idx} href={l.url} target="_blank" rel="noreferrer" className="rec-link">{l.title || 'Link'}</a>
                  ))}
                  <button className="btn-save" style={{ padding: '.3rem .8rem', fontSize: '.75rem', marginLeft: 'auto' }}
                    onClick={() => onAdd?.(r)}>
                    + Ho bevuto questo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {!hasProf && recs.length > 0 && (
          <div className="drawer-tip">
            💡 Più vini salvi e voti, più i consigli saranno precisi per te
          </div>
        )}
      </div>
    </div>
  );
}


/* ─── QR Scanner ─────────────────────────────────────────────────── */
function LiveQrScanner({ onClose, onResult }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const loopRef   = useRef(null);
  const streamRef = useRef(null);
  const [codes, setCodes] = useState([]);

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        loopRef.current = setInterval(async () => {
          const jsQR = (await import('jsqr')).default;
          const v = videoRef.current, c = canvasRef.current;
          if (!v || !c || v.readyState < 2) return;
          c.width = v.videoWidth; c.height = v.videoHeight;
          const ctx = c.getContext('2d'); ctx.drawImage(v, 0, 0);
          const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
          if (code?.data) setCodes(prev => prev.includes(code.data) ? prev : [...prev, code.data]);
        }, 350);
      } catch { alert('Fotocamera non disponibile'); onClose?.(); }
    })();
    return () => {
      clearInterval(loopRef.current);
      try { streamRef.current?.getTracks?.().forEach(t => t.stop()); } catch {}
    };
  }, []); // eslint-disable-line

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <span>Scanner QR</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <video ref={videoRef} muted playsInline style={{ width: '100%', borderRadius: 10, background: '#000', marginBottom: 10 }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#64748b', fontSize: '.82rem' }}>Link letti: <strong style={{ color: '#e2e8f0' }}>{codes.length}</strong></span>
          <button className="btn-save" disabled={!codes.length} onClick={() => onResult?.(codes)}>
            Usa {codes.length} link
          </button>
          <button className="btn-secondary" onClick={() => setCodes([])}>Azzera</button>
        </div>
      </div>
    </div>
  );
}

/* ─── TastingNoteModal ───────────────────────────────────────────── */
// Aromi raggruppati per famiglia — ogni gruppo è separato visivamente nel modale
const AROMA_GROUPS = [
  {
    label: '🍒 Fruttato',
    aromas: ['frutta rossa','frutta nera','frutta secca','agrumi','frutta tropicale','melograno','mora','ciliegia','prugna','albicocca'],
  },
  {
    label: '🌸 Floreale',
    aromas: ['rosa','violetta','gelsomino','fiori bianchi','iris','lavanda'],
  },
  {
    label: '🌿 Erbaceo / Vegetale',
    aromas: ['erbaceo','erba tagliata','peperone verde','foglia di pomodoro','menta','eucalipto','anice'],
  },
  {
    label: '🪨 Minerale',
    aromas: ['minerale','pietra focaia','gesso','grafite','salino','iodio','vulcanico'],
  },
  {
    label: '🌍 Terroso',
    aromas: ['terra umida','humus','fungo','tartufo','cantina','muschio','sottobosco'],
  },
  {
    label: '🪵 Tostato / Legno',
    aromas: ['tostato','vaniglia','burro','caramello','cocco','cedro','resina'],
  },
  {
    label: '☕ Ossidativo / Evoluto',
    aromas: ['caffè','cioccolato fondente','moka','nocciola','mandorla','tabacco','cuoio','fumoso'],
  },
  {
    label: '🌶 Speziato',
    aromas: ['pepe nero','cannella','chiodi di garofano','liquirizia','cardamomo','noce moscata','incenso'],
  },
  {
    label: '🍯 Dolce / Mielato',
    aromas: ['miele','cera d'api','frutta candita','dattero','fico secco'],
  },
  {
    label: '🐄 Animale / Balsamico',
    aromas: ['balsamico','selvaggina','muschio','cuoio','sudore','carne'],
  },
];
// Lista piatta per compatibilità
const AROMA_OPTIONS = AROMA_GROUPS.flatMap(g => g.aromas);

function SliderField({ label, value, onChange, min=1, max=5, leftLabel, rightLabel }) {
  return (
    <div className="tn-slider-wrap">
      <div className="tn-slider-header">
        <span className="tn-slider-label">{label}</span>
        <span className="tn-slider-val">{value || '—'}/5</span>
      </div>
      <input type="range" min={min} max={max} value={value || 0}
        onChange={e => onChange(Number(e.target.value))}
        className="tn-slider" />
      <div className="tn-slider-ends">
        <span>{leftLabel}</span><span>{rightLabel}</span>
      </div>
    </div>
  );
}

function TastingNoteModal({ wine, existing, onSave, onClose }) {
  const [form, setForm] = useState({
    tannins:    existing?.tannins    || 0,
    acidity:    existing?.acidity    || 0,
    body:       existing?.body       || 0,
    sweetness:  existing?.sweetness  || 0,
    finish:     existing?.finish     || 0,
    aromas:     existing?.aromas     || [],
    note:       existing?.note       || '',
    occasion:   existing?.occasion   || '',
    served_temp:existing?.served_temp|| '',
  });

  const toggleAroma = (a) => setForm(f => ({
    ...f,
    aromas: f.aromas.includes(a) ? f.aromas.filter(x => x !== a) : [...f.aromas, a]
  }));

  const upd = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span>📝 Note — {wine?.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="modal-hint">
          Le note affinano i consigli del Sommelier: con abbinamenti simili,
          verrà preferito il vino più vicino al tuo profilo sensoriale.
        </p>

        {/* Sliders struttura */}
        <div className="tn-section-title">Struttura</div>
        <SliderField label="Corpo" value={form.body} onChange={v=>upd('body',v)}
          leftLabel="Leggero" rightLabel="Corposo" />
        <SliderField label="Tannini" value={form.tannins} onChange={v=>upd('tannins',v)}
          leftLabel="Morbido" rightLabel="Astringente" />
        <SliderField label="Acidità" value={form.acidity} onChange={v=>upd('acidity',v)}
          leftLabel="Piatto" rightLabel="Vivace" />
        <SliderField label="Dolcezza" value={form.sweetness} onChange={v=>upd('sweetness',v)}
          leftLabel="Secco" rightLabel="Dolce" />
        <SliderField label="Finale" value={form.finish} onChange={v=>upd('finish',v)}
          leftLabel="Corto" rightLabel="Lunghissimo" />

        {/* Aromi — per famiglia */}
        <div className="tn-section-title" style={{ marginTop: '.75rem' }}>Aromi percepiti</div>
        {AROMA_GROUPS.map(group => (
          <div key={group.label} className="tn-aroma-group">
            <div className="tn-aroma-group-label">{group.label}</div>
            <div className="tn-aromas">
              {group.aromas.map(a => (
                <button key={a}
                  className={`tn-aroma ${form.aromas.includes(a) ? 'tn-aroma-on' : ''}`}
                  onClick={() => toggleAroma(a)}>
                  {a}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Temperatura servizio */}
        <div className="tn-section-title" style={{ marginTop: '.75rem' }}>Temperatura di servizio</div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {['freddo','fresco','leggermente fresco','ambiente'].map(t => (
            <button key={t}
              className={`tn-aroma ${form.served_temp === t ? 'tn-aroma-on' : ''}`}
              onClick={() => upd('served_temp', form.served_temp === t ? '' : t)}>
              {t}
            </button>
          ))}
        </div>

        {/* Occasione */}
        <div className="tn-section-title" style={{ marginTop: '.75rem' }}>Abbinato a</div>
        <input className="fi" value={form.occasion}
          onChange={e => upd('occasion', e.target.value)}
          placeholder="es. bistecca, pesce, aperitivo, compleanno…" />

        {/* Nota libera */}
        <div className="tn-section-title" style={{ marginTop: '.75rem' }}>Nota libera</div>
        <textarea className="som-textarea" rows={2}
          value={form.note} onChange={e => upd('note', e.target.value)}
          placeholder="Impressioni, contesto, abbinamento riuscito/fallito…" />

        <div className="modal-actions" style={{ marginTop: '.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Annulla</button>
          <button className="btn-save" onClick={() => onSave(form)}>
            💾 Salva nota
          </button>
        </div>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════
   PAGINA PRINCIPALE
══════════════════════════════════════════════════════════════════ */
function ProdottiTipiciViniPage() {
  const [tab, setTab]   = useState('wines');
  const [userId, setUserId] = useState(null);
  const { toasts, show: showToast } = useToasts();

  const [places,  setPlaces]  = useState([]);
  const [artisan, setArtisan] = useState([]);
  const [wines,   setWines]   = useState([]);
  const [cellar,  setCellar]  = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddWine,    setShowAddWine]    = useState(false);
  const [showAddArtisan, setShowAddArtisan] = useState(false);
  const [showAddCellar,  setShowAddCellar]  = useState(false);

  const [ocrBusy, setOcrBusy] = useState(false);
  const [tastingModal, setTastingModal] = useState(null); // { wine } oppure null
  const [tastingNotes, setTastingNotes] = useState({});   // { wine_id: note }

  const [sommelierQuery,  setSommelierQuery]  = useState('');
  const [sommelierLists,  setSommelierLists]  = useState([]);
  const [sommelierQr,     setSommelierQr]     = useState([]);
  const [sommelierBusy,   setSommelierBusy]   = useState(false);
  const [sommelierOpen,   setSommelierOpen]   = useState(false);
  const [sommelierData,   setSommelierData]   = useState(null);
  const [sommelierBudget, setSommelierBudget] = useState('');
  const [sommelierPref,   setSommelierPref]   = useState('');
  const [showQr,          setShowQr]          = useState(false);

  const [mapFly,    setMapFly]    = useState(null);
  const [popupInfo, setPopupInfo] = useState({});
  const [selIds,    setSelIds]    = useState(new Set());

  // Icone Leaflet (create solo client-side)
  const [grapeIcon, setGrapeIcon] = useState(null);
  const [glassIcon, setGlassIcon] = useState(null);

  useEffect(() => {
    // Init icone solo lato client
    setGrapeIcon(makeLeafletIcon(GRAPE_SVG, '#8B5CF6')); // viola per origine
    setGlassIcon(makeLeafletIcon(GLASS_SVG, '#3B82F6')); // blu per dove bevuto
  }, []);

  const emptyWine = { name:'', winery:'', denomination:'', region:'', grapes:'', vintage:'', style:'rosso', price_target:'', origin_place_name:'', origin_lat:'', origin_lng:'', purchase_place_name:'', purchase_lat:'', purchase_lng:'', addToCellar:false, bottles:'', purchase_price_eur:'' };
  const emptyArtisan = { name:'', category:'formaggio', designation:'', price_eur:'', notes:'', origin_place_name:'', origin_lat:'', origin_lng:'' };
  const emptyCellar = { wine_id:'', bottles:'1', purchase_price_eur:'', pairings:'' };
  const [wineForm,    setWineForm]    = useState(emptyWine);
  const [artisanForm, setArtisanForm] = useState(emptyArtisan);
  const [cellarForm,  setCellarForm]  = useState(emptyCellar);

  useEffect(() => {
    let sub = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      const { data } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user?.id || null));
      sub = data;
    })();
    return () => { try { sub?.subscription?.unsubscribe(); } catch {} };
  }, []);

  const wineById = useMemo(() => {
    const m = {}; for (const w of wines) m[w.id] = w; return m;
  }, [wines]);

  const placesByWine = useMemo(() => {
    const mp = new Map();
    for (const p of places) {
      if (p.item_type !== 'wine') continue;
      if (!mp.has(p.item_id)) mp.set(p.item_id, []);
      mp.get(p.item_id).push(p);
    }
    return mp;
  }, [places]);

  const refreshAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [{ data: p }, { data: a }, { data: w }, { data: c }, { data: tn }] = await Promise.all([
        supabase.from('product_places').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('artisan_products').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('wines').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('cellar').select('*, wine:wines(id,name,winery,style,region)').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('wine_tasting_notes').select('*').eq('user_id', userId),
      ]);
      setPlaces(p || []);
      setArtisan(a || []);
      // Merge note di degustazione nei vini per passarle al sommelier
      const notesMap = {};
      for (const n of (tn || [])) notesMap[n.wine_id] = n;
      setTastingNotes(notesMap);
      setWines((w || []).map(wine => ({ ...wine, tasting_note: notesMap[wine.id] || null })));
      setCellar(c || []);
    } catch (e) { showToast('Errore caricamento: ' + (e?.message || e), 'err'); }
    setLoading(false);
  }, [userId, showToast]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const addPlaceFor = useCallback(async (itemType, itemId, kind) => {
    if (!userId) return showToast('Sessione assente', 'err');
    const p = await getCurrentPlaceOrAsk(kind === 'purchase' ? 'dove acquistato/consumato' : 'origine');
    if (!p) return;
    const { error } = await supabase.from('product_places').insert([{
      user_id: userId, item_type: itemType, item_id: itemId, kind,
      place_name: p.name || `(${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`,
      lat: p.lat, lng: p.lng, is_primary: true,
    }]);
    if (error) { showToast('Errore salvataggio luogo', 'err'); return; }
    if (itemType === 'wine' && kind === 'purchase') {
      const alreadyOrigin = (placesByWine.get(itemId) || []).some(pp => pp.kind === 'origin');
      if (!alreadyOrigin) await ensureOriginForWine(itemId);
    }
    showToast('Luogo aggiunto!');
    refreshAll();
    focusWineOnMap(itemId);
  }, [userId, placesByWine, refreshAll, showToast]); // eslint-disable-line

  async function ensureOriginForWine(wineId) {
    const w = wineById[wineId]; if (!w) return;
    const guess = [w.region, w.denomination, w.winery, w.name].filter(Boolean).join(' ').trim();
    if (!guess) return;
    const hit = await searchGeocode(guess);
    if (!hit) return;
    await supabase.from('product_places').insert([{
      user_id: userId, item_type: 'wine', item_id: wineId, kind: 'origin',
      place_name: hit.name, lat: hit.lat, lng: hit.lng, is_primary: true,
    }]);
  }

  const focusWineOnMap = useCallback((wineId) => {
    const candidates = placesByWine.get(wineId) || [];
    if (!candidates.length) { showToast('Nessun luogo per questo vino'); return; }
    const target = candidates.find(c => c.kind === 'purchase') || candidates[0];
    setMapFly({ center: [target.lat, target.lng], zoom: 7 });
    setSelIds(new Set(candidates.map(p => p.id)));
    document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setSelIds(new Set()), 3000);
  }, [placesByWine, showToast]);

  async function loadPopupInfo(place) {
    if (!place?.id) return;
    const w = wineById[place.item_id]; if (!w) return;
    let info = { vintages: [], pairing: simplePairing(w) };
    try {
      const q = [w.name, w.denomination, w.region, w.winery].filter(Boolean).join(' ');
      const r = await fetch(`/api/wine-brief?q=${encodeURIComponent(q)}`);
      if (r.ok) {
        const j = await r.json();
        info.vintages = Array.isArray(j?.best_vintages) ? j.best_vintages.slice(0, 6) : [];
        info.pairing  = j?.pairing || simplePairing(w);
      }
    } catch {}
    setPopupInfo(prev => ({ ...prev, [place.id]: info }));
  }

  /* ── CRUD Vini ── */
  async function handleSaveWine(e) {
    e.preventDefault();
    if (!userId) return showToast('Sessione assente', 'err');
    const f = wineForm;
    const regionGuess = f.region?.trim() || guessRegionFromText([f.name, f.denomination, f.winery].join(' ')) || null;
    const { data: newWine, error } = await supabase.from('wines').insert([{
      user_id: userId, name: f.name.trim(), winery: f.winery || null,
      denomination: f.denomination || null, region: regionGuess,
      grapes: f.grapes ? f.grapes.split(',').map(s => s.trim()).filter(Boolean) : null,
      vintage: f.vintage ? Number(f.vintage) : null, style: f.style || null,
      price_target: f.price_target ? Number(f.price_target) : null,
    }]).select().single();
    if (error) return showToast('Errore salvataggio', 'err');
    const placesToInsert = [];
    if (f.origin_lat && f.origin_lng) placesToInsert.push({ user_id: userId, item_type: 'wine', item_id: newWine.id, kind: 'origin', place_name: f.origin_place_name || null, lat: Number(f.origin_lat), lng: Number(f.origin_lng), is_primary: true });
    if (f.purchase_lat && f.purchase_lng) placesToInsert.push({ user_id: userId, item_type: 'wine', item_id: newWine.id, kind: 'purchase', place_name: f.purchase_place_name || null, lat: Number(f.purchase_lat), lng: Number(f.purchase_lng), is_primary: true });
    if (placesToInsert.length) await supabase.from('product_places').insert(placesToInsert);
    if (f.addToCellar) {
      const { error: ce } = await supabase.from('cellar').insert([{ user_id: userId, wine_id: newWine.id, bottles: f.bottles ? Number(f.bottles) : 1, purchase_price_eur: f.purchase_price_eur ? Number(f.purchase_price_eur) : null }]);
      if (ce) showToast('Vino salvato ma errore cantina: ' + ce.message, 'warn');
    }
    setWineForm(emptyWine); setShowAddWine(false);
    showToast('Vino aggiunto!'); refreshAll();
  }

  const deleteWine = useCallback(async (id) => {
    if (!userId || !confirm('Eliminare questo vino?')) return;
    await supabase.from('product_places').delete().eq('item_type', 'wine').eq('item_id', id).eq('user_id', userId);
    const { error } = await supabase.from('wines').delete().eq('id', id).eq('user_id', userId);
    if (error) return showToast('Errore eliminazione', 'err');
    showToast('Vino eliminato'); refreshAll();
  }, [userId, refreshAll, showToast]);

  const setRating = useCallback(async (id, n) => {
    if (!userId) return;
    await supabase.from('wines').update({ rating_5: n }).eq('id', id).eq('user_id', userId);
    refreshAll();
  }, [userId, refreshAll]);

  /* ── CRUD Artisan ── */
  async function handleSaveArtisan(e) {
    e.preventDefault();
    if (!userId) return showToast('Sessione assente', 'err');
    const f = artisanForm;
    const { data, error } = await supabase.from('artisan_products').insert([{
      user_id: userId, name: f.name.trim(), category: f.category,
      designation: f.designation || null, price_eur: f.price_eur ? Number(f.price_eur) : null, notes: f.notes || null,
    }]).select().single();
    if (error) return showToast('Errore salvataggio', 'err');
    if (f.origin_lat && f.origin_lng) await supabase.from('product_places').insert([{ user_id: userId, item_type: 'artisan', item_id: data.id, kind: 'origin', place_name: f.origin_place_name || null, lat: Number(f.origin_lat), lng: Number(f.origin_lng), is_primary: true }]);
    setArtisanForm(emptyArtisan); setShowAddArtisan(false);
    showToast('Prodotto aggiunto!'); refreshAll();
  }

  async function handleSaveCellar(e) {
    e.preventDefault();
    if (!userId) return showToast('Sessione assente', 'err');
    const f = cellarForm;
    if (!f.wine_id) return showToast('Seleziona un vino', 'warn');
    const { error } = await supabase.from('cellar').insert([{
      user_id: userId, wine_id: f.wine_id, bottles: f.bottles ? Number(f.bottles) : 1,
      purchase_price_eur: f.purchase_price_eur ? Number(f.purchase_price_eur) : null,
      pairings: f.pairings ? f.pairings.split(',').map(s => s.trim()).filter(Boolean) : null,
    }]);
    if (error) return showToast('Errore salvataggio', 'err');
    setCellarForm(emptyCellar); setShowAddCellar(false);
    showToast('Bottiglia aggiunta!'); refreshAll();
  }

  /* ── OCR Etichetta con geocodifica robusta ── */
  const ocrFileRef = useRef(null);
  async function handleOcrEtichetta(file) {
    if (!userId || !file) return;
    setOcrBusy(true);
    try {
      const safeFile = await toJpegIfNeeded(file);
      const fd = new FormData();
      fd.append('images', safeFile, safeFile.name || 'label.jpg');
      fd.append('mode', 'wine_label');

      const r1 = await fetch('/api/ocr-generic', { method: 'POST', body: fd });
      if (!r1.ok) throw new Error('OCR fallito: ' + r1.status);
      const ocrResult = await r1.json();

      const w = ocrResult.wine || {};
      const wineName    = w.name    || ocrResult.text?.split('\n')[0] || 'Vino (da etichetta)';
      const wineryName  = w.winery  || '';
      const localityStr = w.locality || '';
      const regionGuess = w.region  || guessRegionFromText(ocrResult.text || wineName);
      const denomStr    = w.denomination || '';

      const { data: newWine, error } = await supabase.from('wines').insert([{
        user_id:      userId,
        name:         wineName,
        winery:       wineryName  || null,
        region:       regionGuess || null,
        vintage:      w.vintage   || null,
        alcohol:      w.alcohol   || null,
        style:        w.style     || 'rosso',
        denomination: denomStr    || null,
        grapes:       w.grapes?.length ? w.grapes : null,
        source:       'ocr',
      }]).select().single();
      if (error) throw error;

      // ── Origine: query multiple in ordine di precisione ──
      // Costruisce query con suffisso Italia per evitare geocodifiche errate fuori Italia
      const _withItaly = (s) => s ? (s.includes('Abruzzo') || s.includes('Veneto') || s.includes('Toscana') || s.includes('Piemonte') || s.includes('Sicilia') || s.includes('Campania') || s.includes('Puglia') || s.includes('Lombardia') || s.includes('Marche') || s.includes('Italia') ? s : s + ', Italia') : s;
      const _originQueries = [
        // Cantina + città + regione (più preciso)
        [wineryName, localityStr, regionGuess].filter(Boolean).join(', '),
        // Cantina + regione
        _withItaly([wineryName, regionGuess].filter(Boolean).join(', ')),
        // Denominazione + regione
        _withItaly([denomStr, regionGuess].filter(Boolean).join(', ')),
        // Solo denominazione + Italia
        _withItaly(denomStr),
        // Regione italiana
        regionGuess ? regionGuess.replace(/\s*\(\w+\)$/, '').trim() + ', Italia' : '',
        // Solo città + Italia
        localityStr ? localityStr + ', Italia' : '',
        // Solo cantina + Italia
        _withItaly(wineryName),
        // Nome vino come ultimo fallback
        wineName,
      ].map(s => s?.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

      let origInserted = false;
      for (const q of _originQueries) {
        if (!q || q.length < 3) continue;
        const orig = await searchGeocode(q);
        if (orig) {
          const label = [wineryName || wineName, localityStr || regionGuess].filter(Boolean).join(', ') || orig.name;
          await supabase.from('product_places').insert([{
            user_id: userId, item_type: 'wine', item_id: newWine.id, kind: 'origin',
            place_name: label, lat: orig.lat, lng: orig.lng, is_primary: true,
          }]);
          origInserted = true;
          break;
        }
      }

      // ── Dove l'ho bevuto: GPS automatico ──
      try {
        showToast('Rilevo posizione…');
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 })
        );
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        const placeName = await reverseGeocode(lat, lng);
        await supabase.from('product_places').insert([{
          user_id: userId, item_type: 'wine', item_id: newWine.id, kind: 'purchase',
          place_name: placeName || `(${lat.toFixed(5)}, ${lng.toFixed(5)})`,
          lat, lng, is_primary: true,
        }]);
        const localLabel = placeName?.split(',')[0] || 'posizione acquisita';
        showToast(`✓ ${wineName} — ${localLabel}`);
      } catch {
        showToast(`✓ ${wineName} inserito da OCR`);
      }

      refreshAll(); focusWineOnMap(newWine.id);
    } catch (e) {
      showToast('Errore OCR: ' + (e?.message || e), 'err');
    } finally { setOcrBusy(false); }
  }

  /* ── Sommelier ── */
  const sommelierFileRef = useRef(null);
  async function handleSommelierOcr(files) {
    try {
      const fd = new FormData();
      for (const f of files) {
        const jf = await toJpegIfNeeded(f); fd.append('images', jf, jf.name || 'carta.jpg');
      }
      const r = await fetch('/api/ocr-generic', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('OCR fallito');
      const { text } = await r.json();
      if (!text?.trim()) throw new Error('Nessun testo');
      setSommelierLists(prev => [...prev, text]);
      showToast(`${files.length} ${files.length === 1 ? 'pagina aggiunta' : 'pagine aggiunte'} alla carta`);
    } catch (e) { showToast('Errore OCR carta: ' + (e?.message || e), 'err'); }
  }

  async function runSommelier() {
    if (!sommelierQuery.trim() && !sommelierLists.length && !sommelierQr.length) {
      showToast('Scrivi i piatti che mangerai!', 'warn'); return;
    }
    setSommelierBusy(true);
    try {
      const r = await fetch('/api/sommelier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishes:      sommelierQuery,
          wineLists:   sommelierLists,
          qrLinks:     sommelierQr,
          userWines:   wines,          // passa tutti i vini salvati con rating
          userId,
          budget:      sommelierBudget || null,
          preferences: sommelierPref   || null,
        }),
      });
      const data = await r.json();
      setSommelierData(data);
      setSommelierOpen(true);
    } catch (e) { showToast('Errore Sommelier: ' + (e?.message || e), 'err'); }
    finally { setSommelierBusy(false); }
  }

  async function addRecommendationToBevuti(rec) {
    if (!userId) return showToast('Sessione assente', 'err');
    const regionGuess = rec.region || guessRegionFromText([rec.name, rec.denomination].join(' ')) || null;
    const { data: newWine, error } = await supabase.from('wines').insert([{
      user_id: userId, name: rec.name?.trim() || 'Vino', winery: rec.winery || null,
      denomination: rec.denomination || null, region: regionGuess, style: rec.style || null,
      price_target: rec.typical_price_eur ?? null,
    }]).select().single();
    if (error) { showToast('Errore salvataggio', 'err'); return; }
    const p = await getCurrentPlaceOrAsk('dove l\'hai bevuto');
    if (p) {
      await supabase.from('product_places').insert([{
        user_id: userId, item_type: 'wine', item_id: newWine.id, kind: 'purchase',
        place_name: p.name || `(${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`, lat: p.lat, lng: p.lng, is_primary: true,
      }]);
    }
    showToast('Aggiunto ai bevuti!'); refreshAll(); focusWineOnMap(newWine.id);
  }

  /* ── Salva nota di degustazione ── */
  async function saveTastingNote(wineId, form) {
    if (!userId) return;
    const { error } = await supabase.from('wine_tasting_notes').upsert([{
      user_id:    userId,
      wine_id:    wineId,
      tannins:    form.tannins   || null,
      acidity:    form.acidity   || null,
      body:       form.body      || null,
      sweetness:  form.sweetness || null,
      finish:     form.finish    || null,
      aromas:     form.aromas?.length ? form.aromas : null,
      note:       form.note      || null,
      occasion:   form.occasion  || null,
      served_temp:form.served_temp || null,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'user_id,wine_id' });
    if (error) { showToast('Errore salvataggio nota: ' + error.message, 'err'); return; }
    showToast('📝 Nota di degustazione salvata!');
    setTastingModal(null);
    refreshAll();
  }

  const cellarBottles    = cellar.reduce((t, r) => t + (Number(r.bottles) || 0), 0);
  const cellarLabels     = new Set(cellar.map(r => r.wine_id)).size;
  const cellarInvestment = cellar.reduce((t, r) => t + (Number(r.purchase_price_eur) || 0) * (Number(r.bottles) || 1), 0);

  /* ════════════════ UI ════════════════ */
  return (
    <>
      <Head><title>Prodotti & Vini · Jarvis</title></Head>

      {sommelierOpen && <SommelierDrawer data={sommelierData} onClose={() => setSommelierOpen(false)} onAdd={addRecommendationToBevuti} />}
      {showQr && (
        <LiveQrScanner
          onClose={() => setShowQr(false)}
          onResult={codes => { setShowQr(false); setSommelierQr(prev => [...prev, ...codes]); showToast(`${codes.length} link QR aggiunti`); }}
        />
      )}

      {/* ── Modale Note di Degustazione ── */}
      {tastingModal && (
        <TastingNoteModal
          wine={tastingModal.wine}
          existing={tastingNotes[tastingModal.wine?.id] || null}
          onSave={form => saveTastingNote(tastingModal.wine.id, form)}
          onClose={() => setTastingModal(null)}
        />
      )}

      <div className="pg">

        {/* ── Sommelier Personale ── */}
        <div className="som-panel">
          <div className="som-panel-header">
            <span className="som-panel-title">🍷 Sommelier Personale</span>
            <span className="som-panel-sub">Consigli basati sui tuoi gusti e sui piatti che mangi</span>
          </div>

          {/* Piatti */}
          <div className="som-field">
            <label className="som-label">🍽 Cosa mangi stasera?</label>
            <textarea
              className="som-textarea"
              value={sommelierQuery}
              onChange={e => setSommelierQuery(e.target.value)}
              placeholder={'Es: bistecca alla brace con patate\noppure: spaghetti alle vongole e polipetti alla luciana\noppure: agnello scottadito, rosbif, cacciagione'}
              rows={3}
            />
            {/* Suggerimenti rapidi */}
            <div className="som-quick">
              {['Bistecca alla brace','Pesce alla griglia','Spaghetti alle vongole','Cacciagione','Agnello','Pizza','Sushi'].map(p => (
                <button key={p} className="som-quick-btn"
                  onClick={() => setSommelierQuery(q => q ? q + ', ' + p.toLowerCase() : p.toLowerCase())}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Budget + preferenze */}
          <div className="som-row">
            <div className="som-field som-field-sm">
              <label className="som-label">💶 Budget (opzionale)</label>
              <input className="fi" value={sommelierBudget} onChange={e => setSommelierBudget(e.target.value)}
                placeholder="es. sotto 30€" />
            </div>
            <div className="som-field som-field-sm">
              <label className="som-label">✨ Preferenze extra</label>
              <input className="fi" value={sommelierPref} onChange={e => setSommelierPref(e.target.value)}
                placeholder="es. vino locale, biologico" />
            </div>
          </div>

          {/* Carta vini */}
          <div className="som-field">
            <label className="som-label">📋 Carta del ristorante (opzionale)</label>
            <div className="som-card-row">
              <button className="som-btn-sec" onClick={() => sommelierFileRef.current?.click()}>
                📷 OCR foto carta
              </button>
              <input ref={sommelierFileRef} type="file" accept="image/*,application/pdf" multiple capture="environment" hidden
                onChange={async e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) await handleSommelierOcr(f); }} />
              <button className="som-btn-sec" onClick={() => setShowQr(true)}>
                📲 Scansiona QR
              </button>
              {(sommelierLists.length > 0 || sommelierQr.length > 0) && (
                <div className="som-attachments">
                  <span>✓ {sommelierLists.length > 0 ? `${sommelierLists.length} pag.` : ''}{sommelierQr.length > 0 ? ` ${sommelierQr.length} QR` : ''} caricati</span>
                  <button className="som-clear" onClick={() => { setSommelierLists([]); setSommelierQr([]); showToast('Carta rimossa'); }}>✕</button>
                </div>
              )}
            </div>
            {(sommelierLists.length === 0 && sommelierQr.length === 0) && (
              <p className="som-hint-text">Senza carta: consigli generali basati sui tuoi gusti personali</p>
            )}
          </div>

          <button className="som-cta" onClick={runSommelier} disabled={sommelierBusy || !sommelierQuery.trim()}>
            {sommelierBusy
              ? <><span className="spinner" /> Consulto il sommelier…</>
              : <><span style={{fontSize:'1.1rem'}}>🍷</span> Chiedi al Sommelier</>
            }
          </button>
        </div>

        {/* ── Tab ── */}
        <div className="tabs">
          {[['artisan','🧀 Formaggi & Salumi'],['wines','🍷 Vini'],['cellar','🏚 Cantina']].map(([k, label]) => (
            <button key={k} className={`tab ${tab === k ? 'tab-active' : 'tab-inactive'}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {/* ══ TAB: FORMAGGI & SALUMI ══ */}
        {tab === 'artisan' && (
          <>
            <div className="toolbar">
              <span className="section-title">Formaggi & Salumi</span>
              <button className="btn-add" onClick={() => setShowAddArtisan(v => !v)}>
                {showAddArtisan ? '✕ Chiudi' : '+ Aggiungi'}
              </button>
            </div>
            {showAddArtisan && (
              <form className="add-form-grid" onSubmit={handleSaveArtisan}>
                <input className="fi" value={artisanForm.name} placeholder="Nome *" required onChange={e => setArtisanForm({ ...artisanForm, name: e.target.value })} />
                <select className="fi" value={artisanForm.category} onChange={e => setArtisanForm({ ...artisanForm, category: e.target.value })}>
                  <option value="formaggio">Formaggio</option><option value="salume">Salume</option>
                </select>
                <input className="fi" value={artisanForm.designation} placeholder="Designazione (DOP/IGP)" onChange={e => setArtisanForm({ ...artisanForm, designation: e.target.value })} />
                <input className="fi" value={artisanForm.price_eur} placeholder="Prezzo €" onChange={e => setArtisanForm({ ...artisanForm, price_eur: e.target.value })} />
                <input className="fi" value={artisanForm.notes} placeholder="Note" onChange={e => setArtisanForm({ ...artisanForm, notes: e.target.value })} />
                <input className="fi" value={artisanForm.origin_place_name} placeholder="Origine (luogo)" onChange={e => setArtisanForm({ ...artisanForm, origin_place_name: e.target.value })} />
                <input className="fi" value={artisanForm.origin_lat} placeholder="Lat" onChange={e => setArtisanForm({ ...artisanForm, origin_lat: e.target.value })} />
                <input className="fi" value={artisanForm.origin_lng} placeholder="Lng" onChange={e => setArtisanForm({ ...artisanForm, origin_lng: e.target.value })} />
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                  <button className="btn-save" type="submit">Salva</button>
                  <button className="btn-secondary" type="button" onClick={() => { setArtisanForm(emptyArtisan); setShowAddArtisan(false); }}>Annulla</button>
                </div>
              </form>
            )}
            <div className="card-list">
              {loading && <div className="empty">Caricamento…</div>}
              {!loading && artisan.length === 0 && <div className="empty">Nessun prodotto</div>}
              {artisan.map(row => (
                <div className="item-card" key={row.id}>
                  <div className="item-badge" style={{ background: 'rgba(99,102,241,.12)', color: '#818cf8', borderColor: 'rgba(99,102,241,.25)' }}>
                    {row.category === 'formaggio' ? '🧀' : '🥩'}
                  </div>
                  <div className="item-body">
                    <div className="item-name">{row.name}</div>
                    <div className="item-meta">{[row.designation, row.notes].filter(Boolean).join(' · ')}</div>
                  </div>
                  {row.price_eur != null && <div className="item-price">€ {Number(row.price_eur).toFixed(2)}</div>}
                  <button className="wa" onClick={() => addPlaceFor('artisan', row.id, 'purchase')}>Dove mangiato</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ TAB: VINI ══ */}
        {tab === 'wines' && (
          <>
            <div className="toolbar">
              <span className="section-title">Vini — wishlist & bevuti</span>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button className="btn-add" onClick={() => setShowAddWine(v => !v)}>
                  {showAddWine ? '✕ Chiudi' : '+ Aggiungi'}
                </button>
                <button className={`btn-add ${ocrBusy ? 'btn-busy' : ''}`}
                  style={{ background: 'rgba(6,182,212,.12)', borderColor: 'rgba(6,182,212,.3)', color: '#22d3ee' }}
                  onClick={() => ocrFileRef.current?.click()} disabled={ocrBusy}>
                  {ocrBusy ? <span className="spinner" /> : 'OCR etichetta'}
                </button>
                <input ref={ocrFileRef} type="file" accept="image/*" capture="environment" hidden
                  onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await handleOcrEtichetta(f); }} />
              </div>
            </div>
            {showAddWine && (
              <form className="add-form-grid" onSubmit={handleSaveWine}>
                <input className="fi" value={wineForm.name} placeholder="Nome vino *" required onChange={e => setWineForm({ ...wineForm, name: e.target.value })} />
                <input className="fi" value={wineForm.winery} placeholder="Cantina" onChange={e => setWineForm({ ...wineForm, winery: e.target.value })} />
                <input className="fi" value={wineForm.denomination} placeholder="Denominazione (DOCG/DOC)" onChange={e => setWineForm({ ...wineForm, denomination: e.target.value })} />
                <input className="fi" value={wineForm.region} placeholder="Regione" onChange={e => setWineForm({ ...wineForm, region: e.target.value })} />
                <input className="fi" value={wineForm.grapes} placeholder="Vitigni (virgola)" onChange={e => setWineForm({ ...wineForm, grapes: e.target.value })} />
                <input className="fi" value={wineForm.vintage} placeholder="Annata" onChange={e => setWineForm({ ...wineForm, vintage: e.target.value })} />
                <select className="fi" value={wineForm.style} onChange={e => setWineForm({ ...wineForm, style: e.target.value })}>
                  <option value="rosso">Rosso</option><option value="bianco">Bianco</option>
                  <option value="rosé">Rosé</option><option value="frizzante">Frizzante</option>
                  <option value="fortificato">Fortificato</option>
                </select>
                <input className="fi" value={wineForm.price_target} placeholder="Budget €" onChange={e => setWineForm({ ...wineForm, price_target: e.target.value })} />
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#94a3b8' }}>
                    <input type="checkbox" checked={wineForm.addToCellar} onChange={e => setWineForm({ ...wineForm, addToCellar: e.target.checked })} />
                    Aggiungi anche in cantina
                  </label>
                  {wineForm.addToCellar && <>
                    <input className="fi" style={{ flex: '0 0 100px' }} value={wineForm.bottles} placeholder="Bottiglie" onChange={e => setWineForm({ ...wineForm, bottles: e.target.value })} />
                    <input className="fi" style={{ flex: '0 0 140px' }} value={wineForm.purchase_price_eur} placeholder="Prezzo acquisto €" onChange={e => setWineForm({ ...wineForm, purchase_price_eur: e.target.value })} />
                  </>}
                </div>
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                  <button className="btn-save" type="submit">Salva</button>
                  <button className="btn-secondary" type="button" onClick={() => { setWineForm(emptyWine); setShowAddWine(false); }}>Annulla</button>
                </div>
              </form>
            )}
            <div className="card-list">
              {loading && <div className="empty">Caricamento…</div>}
              {!loading && wines.length === 0 && <div className="empty">Nessun vino — aggiungi manualmente o scansiona un'etichetta</div>}
              {wines.map(row => {
                const sc = styleColor(row.style);
                const grapeStr = Array.isArray(row.grapes) ? row.grapes.join(', ') : '';
                return (
                  <div className="item-card wine-card" key={row.id} onClick={() => focusWineOnMap(row.id)}>
                    <div className="item-badge" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                      {(row.style || 'rosso').charAt(0).toUpperCase() + (row.style || 'rosso').slice(1)}
                    </div>
                    <div className="item-body">
                      <div className="item-name">{row.name}{row.vintage ? ` — ${row.vintage}` : ''}</div>
                      <div className="item-meta">
                        {[row.winery, row.denomination, row.region].filter(Boolean).join(' · ')}
                        {grapeStr && <span className="grape-tag">{grapeStr}</span>}
                      </div>
                    </div>
                    <div className="wine-right">
                      <Stars value={row.rating_5 || 0} onChange={n => { setRating(row.id, n); }} />
                      {row.price_target != null && <span className="item-price">€ {Number(row.price_target).toFixed(0)}</span>}
                      <div className="wine-actions" onClick={e => e.stopPropagation()}>
                        <button className="wa wa-note" onClick={() => setTastingModal({ wine: row })}
                          title="Note di degustazione">
                          {row.has_tasting_note ? '📝' : '+'} Note
                        </button>
                        <button className="wa" onClick={() => addPlaceFor('wine', row.id, 'purchase')}>Dove bevuto</button>
                        <button className="wa wa-del" onClick={() => deleteWine(row.id)}>Elimina</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ══ TAB: CANTINA ══ */}
        {tab === 'cellar' && (
          <>
            <div className="kpi-grid">
              <div className="kpi"><div className="kpi-label">Bottiglie</div><div className="kpi-value kpi-purple">{cellarBottles}</div></div>
              <div className="kpi"><div className="kpi-label">Etichette</div><div className="kpi-value kpi-cyan">{cellarLabels}</div></div>
              <div className="kpi"><div className="kpi-label">Investimento</div><div className="kpi-value kpi-green">€ {cellarInvestment.toFixed(0)}</div></div>
            </div>
            <div className="toolbar">
              <span className="section-title">Cantina</span>
              <button className="btn-add" onClick={() => setShowAddCellar(v => !v)}>
                {showAddCellar ? '✕ Chiudi' : '+ Aggiungi bottiglia'}
              </button>
            </div>
            {showAddCellar && (
              <form className="add-form-grid" onSubmit={handleSaveCellar}>
                <select className="fi" value={cellarForm.wine_id} onChange={e => setCellarForm({ ...cellarForm, wine_id: e.target.value })} required>
                  <option value="">Seleziona vino…</option>
                  {wines.map(w => <option key={w.id} value={w.id}>{w.name}{w.winery ? ` — ${w.winery}` : ''}</option>)}
                </select>
                <input className="fi" value={cellarForm.bottles} placeholder="Bottiglie" onChange={e => setCellarForm({ ...cellarForm, bottles: e.target.value })} />
                <input className="fi" value={cellarForm.purchase_price_eur} placeholder="Prezzo acquisto €" onChange={e => setCellarForm({ ...cellarForm, purchase_price_eur: e.target.value })} />
                <input className="fi" value={cellarForm.pairings} placeholder="Abbinamenti (virgola)" onChange={e => setCellarForm({ ...cellarForm, pairings: e.target.value })} />
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                  <button className="btn-save" type="submit">Salva</button>
                  <button className="btn-secondary" type="button" onClick={() => { setCellarForm(emptyCellar); setShowAddCellar(false); }}>Annulla</button>
                </div>
              </form>
            )}
            <div className="card-list">
              {loading && <div className="empty">Caricamento…</div>}
              {!loading && cellar.length === 0 && <div className="empty">Cantina vuota</div>}
              {cellar.map(row => {
                const w = row.wine;
                const sc = styleColor(w?.style);
                return (
                  <div className="item-card" key={row.id}>
                    <div className="item-badge" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                      {row.bottles} bot.
                    </div>
                    <div className="item-body">
                      <div className="item-name">{w?.name || '—'}</div>
                      <div className="item-meta">{[w?.winery, w?.region].filter(Boolean).join(' · ')}</div>
                      {(row.pairings || []).length > 0 && <div className="item-meta" style={{ color: '#334155' }}>Abbinamento: {row.pairings.join(', ')}</div>}
                    </div>
                    {row.purchase_price_eur != null && <div className="item-price">€ {Number(row.purchase_price_eur).toFixed(2)}</div>}
                    <button className="wa" onClick={() => addPlaceFor('wine', w?.id || row.wine_id, 'purchase')}>Dove comprato</button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ══ MAPPA ══ */}
        <div id="map-section" className="map-section">
          <div className="map-header">
            <span className="section-title">Mappa</span>
            <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
              <span className="map-legend">
                <span className="map-icon-grape">🍇</span>
                Origine
              </span>
              <span className="map-legend">
                <span className="map-icon-glass">🍷</span>
                Dove bevuto
              </span>
            </div>
          </div>

          <MapContainer center={[42.5, 12.5]} zoom={5} scrollWheelZoom style={{ width: '100%', height: 380, borderRadius: '0 0 14px 14px' }}>
            {mapFly && <MapFlyTo center={mapFly.center} zoom={mapFly.zoom} />}
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            {places.map(p => {
              const isOrigin = p.kind === 'origin';
              const icon = isOrigin ? grapeIcon : glassIcon;
              const isSel = selIds.has(p.id);
              const wine  = p.item_type === 'wine' ? wineById[p.item_id] : null;
              const info  = popupInfo[p.id] || {};

              // Fallback a CircleMarker se icona non ancora inizializzata (SSR)
              if (!icon) return null;

              return (
                <Marker
                  key={p.id}
                  position={[p.lat, p.lng]}
                  icon={icon}
                  eventHandlers={{ click: () => p.item_type === 'wine' && loadPopupInfo(p) }}
                  opacity={isSel ? 1 : 0.85}
                >
                  {p.place_name && (
                    <Tooltip direction="top" permanent={false}>
                      <span style={{ fontWeight: 600 }}>
                        {isOrigin ? '🍇 ' : '🍷 '}
                        {p.place_name}
                      </span>
                    </Tooltip>
                  )}
                  {wine && (
                    <Popup>
                      <div style={{ minWidth: 200, fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#e2e8f0', background: '#0f172a', padding: 4 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                          {isOrigin ? '🍇 Origine · ' : '🍷 Bevuto · '}
                          {wine.name}
                        </div>
                        <div style={{ opacity: .8 }}>{[wine.denomination, wine.region, wine.vintage].filter(Boolean).join(' · ')}</div>
                        {p.place_name && <div style={{ marginTop: 4, color: '#60a5fa', fontSize: 12 }}>{p.place_name}</div>}
                        {info?.vintages?.length > 0 && <div style={{ marginTop: 6 }}>Annate migliori: <strong>{info.vintages.join(', ')}</strong></div>}
                        {info?.pairing && <div style={{ marginTop: 4, opacity: .75 }}>{info.pairing}</div>}
                      </div>
                    </Popup>
                  )}
                </Marker>
              );
            })}
          </MapContainer>
        </div>

      </div>

      {/* Toast */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type || 'ok'}`}>{t.msg}</div>
        ))}
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .pg { background: #0f172a; min-height: 100vh; padding: 1.25rem; font-family: Inter, system-ui, -apple-system, sans-serif; color: #e2e8f0; max-width: 1000px; margin: 0 auto; }

        .som-bar { display: flex; gap: .5rem; align-items: center; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 14px; padding: .7rem 1rem; margin-bottom: 1.1rem; flex-wrap: wrap; }
        .som-input { flex: 1; min-width: 200px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 9px; color: #e2e8f0; padding: .45rem .75rem; font-size: .83rem; outline: none; }
        .som-input:focus { border-color: rgba(99,102,241,.5); }
        .som-btn { display: flex; align-items: center; gap: .4rem; background: rgba(99,102,241,.15); border: 1px solid rgba(99,102,241,.35); border-radius: 9px; color: #818cf8; font-size: .8rem; font-weight: 600; padding: .45rem .9rem; cursor: pointer; white-space: nowrap; }
        .som-btn:disabled { opacity: .5; cursor: not-allowed; }
        .som-btn-sec { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 9px; color: #475569; font-size: .8rem; font-weight: 600; padding: .45rem .75rem; cursor: pointer; white-space: nowrap; }
        .som-attachments { display: flex; align-items: center; gap: .5rem; font-size: .75rem; color: #64748b; background: rgba(99,102,241,.08); border: 1px solid rgba(99,102,241,.2); border-radius: 8px; padding: .25rem .6rem; }
        .som-clear { background: none; border: none; color: #475569; cursor: pointer; font-size: .75rem; }

        .tabs { display: flex; gap: .5rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .tab { padding: .5rem 1rem; border-radius: 10px; font-size: .8rem; font-weight: 600; cursor: pointer; border: 1px solid transparent; letter-spacing: .02em; }
        .tab-active { background: rgba(99,102,241,.15); border-color: rgba(99,102,241,.3); color: #818cf8; }
        .tab-inactive { background: rgba(255,255,255,.03); border-color: rgba(255,255,255,.07); color: #475569; }

        .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: .65rem; flex-wrap: wrap; gap: .4rem; }
        .section-title { font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; color: #475569; font-weight: 600; }

        .kpi-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: .6rem; margin-bottom: 1rem; }
        .kpi { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); border-radius: 12px; padding: .8rem 1rem; }
        .kpi-label { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-bottom: .3rem; }
        .kpi-value { font-size: 1.1rem; font-weight: 700; }
        .kpi-purple { color: #a78bfa; } .kpi-cyan { color: #06b6d4; } .kpi-green { color: #22c55e; }

        .card-list { display: flex; flex-direction: column; gap: .45rem; }
        .item-card { display: flex; align-items: center; gap: .65rem; padding: .7rem .9rem; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 12px; cursor: default; transition: border-color .15s; }
        .wine-card { cursor: pointer; }
        .wine-card:hover { border-color: rgba(255,255,255,.14); }
        .item-badge { font-size: .72rem; font-weight: 700; padding: .22rem .55rem; border-radius: 6px; border: 1px solid; white-space: nowrap; flex-shrink: 0; }
        .item-body { flex: 1; min-width: 0; }
        .item-name { font-size: .86rem; color: #e2e8f0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .item-meta { font-size: .7rem; color: #475569; margin-top: .1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .item-price { font-size: .82rem; font-weight: 700; color: #fbbf24; white-space: nowrap; flex-shrink: 0; }
        .grape-tag { display: inline-block; margin-left: .4rem; font-size: .65rem; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 4px; padding: .1rem .35rem; color: #334155; }
        .wine-right { display: flex; flex-direction: column; align-items: flex-end; gap: .25rem; flex-shrink: 0; }
        .wine-actions { display: flex; gap: .3rem; }
        .wa { background: none; border: 1px solid rgba(255,255,255,.08); border-radius: 6px; color: #475569; font-size: .68rem; padding: .18rem .45rem; cursor: pointer; white-space: nowrap; transition: color .15s, border-color .15s; }
        .wa:hover { color: #94a3b8; border-color: rgba(255,255,255,.15); }
        .wa-del:hover { color: #f87171; border-color: rgba(239,68,68,.3); }

        .add-form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: .5rem; margin-bottom: .75rem; background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.07); border-radius: 12px; padding: .85rem; }
        .fi { padding: .45rem .7rem; border-radius: 9px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: #e2e8f0; font-size: .82rem; outline: none; width: 100%; }
        .fi:focus { border-color: rgba(99,102,241,.5); }

        .btn-add { font-size: .74rem; background: rgba(99,102,241,.12); border: 1px solid rgba(99,102,241,.25); color: #818cf8; border-radius: 8px; padding: .3rem .65rem; cursor: pointer; display: flex; align-items: center; gap: .3rem; }
        .btn-save { background: #6366f1; border: none; border-radius: 9px; color: #fff; font-size: .82rem; font-weight: 600; padding: .45rem 1rem; cursor: pointer; display: flex; align-items: center; gap: .3rem; }
        .btn-save:disabled { opacity: .5; cursor: not-allowed; }
        .btn-secondary { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 9px; color: #64748b; font-size: .82rem; font-weight: 600; padding: .45rem .85rem; cursor: pointer; }

        .spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,.2); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .empty { font-size: .8rem; color: #334155; padding: 1.5rem; text-align: center; background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.05); border-radius: 12px; }

        /* Mappa */
        .map-section { background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.07); border-radius: 14px; overflow: hidden; margin-top: 1.25rem; }
        .map-header { display: flex; align-items: center; justify-content: space-between; padding: .6rem 1rem; border-bottom: 1px solid rgba(255,255,255,.06); flex-wrap: wrap; gap: .5rem; }
        .map-legend { display: flex; align-items: center; gap: .35rem; font-size: .72rem; color: #64748b; }
        .map-icon-grape { font-size: 16px; }
        .map-icon-glass  { font-size: 16px; }

        /* Leaflet pin personalizzato */
        .leaflet-div-icon { background: transparent !important; border: none !important; }

        /* Modal */
        .modal-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.65); backdrop-filter: blur(4px); padding: 1rem; }
        .modal-box { background: #0f172a; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; width: 100%; max-width: 420px; padding: 1.25rem; display: flex; flex-direction: column; gap: .75rem; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; font-size: .9rem; font-weight: 600; color: #e2e8f0; }
        .modal-hint { font-size: .75rem; color: #475569; }
        .modal-close { background: none; border: none; color: #475569; cursor: pointer; font-size: .9rem; }
        .modal-field { display: flex; flex-direction: column; gap: .25rem; }
        .field-label { font-size: .68rem; text-transform: uppercase; letter-spacing: .07em; color: #475569; }
        .modal-actions { display: flex; gap: .5rem; margin-top: .25rem; }

        /* Sommelier Drawer */
        .drawer-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.5); backdrop-filter: blur(4px); display: flex; justify-content: flex-end; }
        .drawer { background: #0c0c16; border-left: 1px solid rgba(255,255,255,.08); width: min(560px,100vw); height: 100%; display: flex; flex-direction: column; animation: slideIn .2s ease; }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .drawer-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,.08); font-size: .9rem; font-weight: 600; flex-shrink: 0; }
        .drawer-meta { padding: .5rem 1.25rem; font-size: .75rem; color: #475569; border-bottom: 1px solid rgba(255,255,255,.05); flex-shrink: 0; }
        .drawer-body { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: .75rem; }
        .rec-card { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 12px; padding: .85rem; }
        .rec-header { display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; margin-bottom: .3rem; }
        .rec-name { font-size: .88rem; font-weight: 600; color: #e2e8f0; }
        .rec-band { font-size: .65rem; font-weight: 700; padding: .2rem .5rem; border-radius: 5px; border: 1px solid; white-space: nowrap; flex-shrink: 0; }
        .rec-sub { font-size: .72rem; color: #475569; margin-bottom: .4rem; }
        .rec-why { font-size: .78rem; color: #94a3b8; line-height: 1.5; }
        .rec-footer { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin-top: .6rem; }
        .rec-price { font-size: .8rem; font-weight: 700; color: #fbbf24; }
        .rec-link { font-size: .72rem; color: #818cf8; text-decoration: underline; }

        /* Toast */
        .toast-wrap { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: .4rem; z-index: 9999; pointer-events: none; }
        .toast { background: rgba(15,23,42,.96); border: 1px solid rgba(255,255,255,.1); color: #e2e8f0; padding: .55rem 1rem; border-radius: 10px; font-size: .8rem; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,.4); }
        .toast-ok   { border-color: rgba(34,197,94,.3); }
        .toast-warn { border-color: rgba(251,191,36,.3); }
        .toast-err  { border-color: rgba(239,68,68,.3); }

        .leaflet-container .leaflet-popup-content-wrapper { background: #0f172a; color: #e2e8f0; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; }
        .leaflet-container .leaflet-popup-tip { background: #0f172a; }

        /* Sommelier Panel */
        .som-panel { background: rgba(255,255,255,.02); border: 1px solid rgba(99,102,241,.2); border-radius: 16px; padding: 1.1rem; margin-bottom: 1.25rem; }
        .som-panel-header { margin-bottom: .9rem; }
        .som-panel-title { font-size: .9rem; font-weight: 700; color: #e2e8f0; display: block; margin-bottom: .2rem; }
        .som-panel-sub { font-size: .72rem; color: #475569; }
        .som-field { display: flex; flex-direction: column; gap: .35rem; margin-bottom: .75rem; }
        .som-field-sm { flex: 1; min-width: 140px; }
        .som-row { display: flex; gap: .6rem; flex-wrap: wrap; margin-bottom: .75rem; }
        .som-label { font-size: .7rem; text-transform: uppercase; letter-spacing: .07em; color: #64748b; font-weight: 600; }
        .som-textarea { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; color: #e2e8f0; padding: .55rem .75rem; font-size: .83rem; outline: none; resize: vertical; font-family: inherit; line-height: 1.5; }
        .som-textarea:focus { border-color: rgba(99,102,241,.5); }
        .som-quick { display: flex; gap: .35rem; flex-wrap: wrap; margin-top: .25rem; }
        .som-quick-btn { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 20px; color: #64748b; font-size: .7rem; padding: .2rem .55rem; cursor: pointer; transition: all .15s; }
        .som-quick-btn:hover { background: rgba(99,102,241,.1); border-color: rgba(99,102,241,.3); color: #818cf8; }
        .som-card-row { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
        .som-hint-text { font-size: .7rem; color: #334155; margin-top: .25rem; font-style: italic; }
        .som-cta { width: 100%; background: linear-gradient(135deg, rgba(99,102,241,.25), rgba(139,92,246,.2)); border: 1px solid rgba(99,102,241,.4); border-radius: 11px; color: #a5b4fc; font-size: .87rem; font-weight: 700; padding: .65rem 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: .5rem; margin-top: .25rem; transition: all .15s; letter-spacing: .02em; }
        .som-cta:hover:not(:disabled) { background: linear-gradient(135deg, rgba(99,102,241,.35), rgba(139,92,246,.3)); color: #c4b5fd; }
        .som-cta:disabled { opacity: .5; cursor: not-allowed; }

        /* Drawer aggiornato */
        .drawer-note { display: flex; align-items: flex-start; gap: .5rem; padding: .6rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,.05); font-size: .8rem; color: #94a3b8; font-style: italic; }
        .drawer-note-icon { flex-shrink: 0; }
        .drawer-badges { display: flex; gap: .5rem; padding: .5rem 1.25rem; flex-wrap: wrap; border-bottom: 1px solid rgba(255,255,255,.05); }
        .dbadge { font-size: .68rem; font-weight: 600; padding: .2rem .6rem; border-radius: 20px; border: 1px solid; }
        .dbadge-green { color: #22c55e; border-color: rgba(34,197,94,.3); background: rgba(34,197,94,.08); }
        .dbadge-purple { color: #a78bfa; border-color: rgba(167,139,250,.3); background: rgba(167,139,250,.08); }
        .dbadge-gray { color: #475569; border-color: rgba(255,255,255,.08); background: rgba(255,255,255,.03); }
        .rec-card-match { border-color: rgba(167,139,250,.25) !important; background: rgba(167,139,250,.04) !important; }
        .rec-match-star { color: #a78bfa; }
        .drawer-tip { padding: .6rem 1.25rem; font-size: .72rem; color: #475569; border-top: 1px solid rgba(255,255,255,.05); font-style: italic; }

        @media (max-width: 600px) {
          .kpi-grid { grid-template-columns: repeat(3,1fr); }
          .pg { padding: .9rem; }
          .wine-right { display: none; }
          .wine-card::after { content: '→'; color: #334155; font-size: .8rem; }
        }

        /* TastingNoteModal */
        .tn-section-title { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: #475569; font-weight: 700; margin-bottom: .4rem; margin-top: .1rem; }
        .tn-slider-wrap { margin-bottom: .5rem; }
        .tn-slider-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .2rem; }
        .tn-slider-label { font-size: .78rem; color: #94a3b8; }
        .tn-slider-val { font-size: .75rem; font-weight: 700; color: #6366f1; min-width: 24px; text-align: right; }
        .tn-slider { width: 100%; accent-color: #6366f1; cursor: pointer; }
        .tn-slider-ends { display: flex; justify-content: space-between; font-size: .63rem; color: #334155; margin-top: .1rem; }
        .tn-aromas { display: flex; flex-wrap: wrap; gap: .3rem; }
        .tn-aroma { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 20px; color: #475569; font-size: .7rem; padding: .2rem .55rem; cursor: pointer; transition: all .15s; }
        .tn-aroma:hover { border-color: rgba(99,102,241,.3); color: #818cf8; }
        .tn-aroma-on { background: rgba(99,102,241,.15); border-color: rgba(99,102,241,.4); color: #a5b4fc; }
        .tn-aroma-group { margin-bottom: .6rem; }
        .tn-aroma-group-label { font-size: .65rem; text-transform: uppercase; letter-spacing: .06em; color: #334155; font-weight: 600; margin-bottom: .3rem; }
        .wa-note { color: #818cf8 !important; border-color: rgba(99,102,241,.2) !important; }
        .wa-note:hover { background: rgba(99,102,241,.08) !important; border-color: rgba(99,102,241,.35) !important; }
      `}</style>
    </>
  );
}

export default withAuth(ProdottiTipiciViniPage);

export async function getServerSideProps() {
  return { props: {} };
}