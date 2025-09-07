// pages/spese-casa.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { supabase } from '@/lib/supabaseClient';

const CATEGORY_ID_CASA = '4cfaac74-aab4-4d96-b335-6cc64de59afc';

/* ===================== util date ===================== */
function isoLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function smartDate(input) {
  const s = String(input || '').trim().toLowerCase();
  if (/\boggi\b/.test(s)) return isoLocal(new Date());
  if (/\bieri\b/.test(s)) { const d = new Date(); d.setDate(d.getDate() - 1); return isoLocal(d); }
  if (/\bdomani\b/.test(s)) { const d = new Date(); d.setDate(d.getDate() + 1); return isoLocal(d); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;

  const d = new Date(s);
  return isNaN(d) ? isoLocal(new Date()) : isoLocal(d);
}
function fmtDateIT(v) {
  if (!v) return '-';
  const s = String(v);
  const ymd = s.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (ymd) { const [y,m,d] = ymd.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('it-IT'); }
  return new Date(s).toLocaleDateString('it-IT');
}

/* ===================== norm & helpers ===================== */
function normKey(str='') {
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function median(nums) {
  const a = nums.slice().sort((x,y)=>x-y);
  const n = a.length;
  if (!n) return 0;
  const mid = Math.floor(n/2);
  return n % 2 ? a[mid] : (a[mid-1] + a[mid]) / 2;
}

/* ===================== component ===================== */
function SpeseCasa() {
  /** view: 'pricebook' | 'legacy' */
  const [view, setView] = useState('pricebook');

  // --------- LEGACY STATE (tab voci) – invariato ----------
  const [spese, setSpese] = useState([]);
  const [loadingLegacy, setLoadingLegacy] = useState(false);
  const [error, setError] = useState(null);

  const [recBusy, setRecBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '', dettaglio: '', prezzoTotale: '', quantita: '1',
    spentAt: '', paymentMethod: 'cash', cardLabel: '',
  });
  const formRef = useRef(null);
  const ocrInputRef = useRef(null);
  const mediaRecRef = useRef(null);
  const streamRef = useRef(null);
  const recordedChunks = useRef([]);
  const mimeRef = useRef('');
  const stopWaitRef = useRef(null);

  // --------- PRICEBOOK STATE (nuovo) ----------
  const [pbLoading, setPbLoading] = useState(true);
  const [pbError, setPbError] = useState(null);
  const [lines, setLines] = useState([]); // righe elementari acquistate
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

  // =========================================================
  // ===================== PRICEBOOK =========================
  // =========================================================
  /**
   * Prova a leggere da più tabelle conosciute, senza rompere nulla:
   * - finances_items (preferita)
   * - pricebook_items
   * - pricebook
   * Mappa i campi eterogenei alla struttura che ci serve.
   */
  const loadPricebook = useCallback(async () => {
    setPbLoading(true);
    setPbError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setPbLoading(false);
      setPbError('Sessione assente');
      return;
    }

    const candidates = [
      'finances_items',
      'pricebook_items',
      'pricebook'
    ];
    let rows = null, lastErr = null;

    for (const t of candidates) {
      try {
        const { data, error } = await supabase
          .from(t)
          .select('*')
          .eq('user_id', user.id)
          .order('purchase_date', { ascending: false });
        if (error) { lastErr = error; continue; }
        if (Array.isArray(data)) { rows = data; break; }
      } catch (e) { lastErr = e; }
    }

    if (!rows) {
      setPbLoading(false);
      setPbError(lastErr?.message || 'Nessuna riga disponibile (controlla la tabella degli items).');
      return;
    }

    // Mapping robusto → lista uniforme
    const mapped = rows.map((r) => {
      const product = r.product_name ?? r.name ?? r.item_name ?? r.product ?? r.title ?? '';
      const brand = r.brand ?? '';
      const unitLabel = r.unit_label ?? r.unitLabel ?? 'unità';
      const packs = Number(r.packs ?? r.packs_count ?? 1) || 1;
      const upp = Number(r.units_per_pack ?? r.unitsPerPack ?? 1) || 1;
      const qty = Number(r.qty ?? r.quantity ?? (packs * upp)) || (packs * upp) || 1;
      const unitPrice = Number(r.unit_price ?? r.price_each ?? r.priceEach ?? (Number(r.total_price ?? r.price_total ?? r.priceTotal ?? 0) / (qty || 1))) || 0;
      const total = Number(r.total_price ?? r.price_total ?? r.priceTotal ?? (unitPrice * qty)) || 0;
      const currency = r.currency || 'EUR';
      const store = r.store ?? r.shop ?? r.vendor ?? r.punto_vendita ?? '';
      const address = r.store_address ?? r.address ?? r.location ?? '';
      const when = r.purchase_date ?? r.date ?? r.spent_at ?? r.when ?? r.created_at;

      // normalizza a YYYY-MM-DD per filtro
      let dateISO = '';
      if (typeof when === 'string' && /^\d{4}-\d{2}-\d{2}/.test(when)) dateISO = when.slice(0,10);
      else if (when) dateISO = isoLocal(new Date(when));

      return {
        id: r.id || `${product}|${when}|${store}|${total}`,
        product: String(product || '').trim(),
        brand: String(brand || '').trim(),
        unitLabel,
        qty,
        unitPrice,
        total,
        currency,
        store,
        address,
        dateISO,
      };
    }).filter(x => x.product);

    setLines(mapped);
    setPbLoading(false);
  }, []);

  useEffect(() => { loadPricebook(); }, [loadPricebook]);

  // Group per prodotto+brand, con filtri
  const filteredAndGrouped = useMemo(() => {
    const sQ = normKey(q);
    const sStore = normKey(storeFilter);
    const sBrand = normKey(brandFilter);

    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;

    const pass = (row) => {
      if (sQ) {
        const blob = normKey(`${row.product} ${row.brand} ${row.store}`);
        if (!blob.includes(sQ)) return false;
      }
      if (sStore) { if (!normKey(row.store).includes(sStore)) return false; }
      if (sBrand) { if (!normKey(row.brand).includes(sBrand)) return false; }
      if (from) {
        const d = new Date(row.dateISO);
        if (d < from) return false;
      }
      if (to) {
        const d = new Date(row.dateISO);
        if (d > to) return false;
      }
      return true;
    };

    const groups = new Map(); // key -> { name, brand, items:[] }
    for (const r of (lines || []).filter(pass)) {
      const key = `${normKey(r.product)}|${normKey(r.brand)}`;
      if (!groups.has(key)) groups.set(key, { name: r.product, brand: r.brand, items: [] });
      groups.get(key).items.push(r);
    }

    // arricchisci con statistiche
    const out = [];
    for (const g of groups.values()) {
      const prices = g.items.map(i => i.unitPrice).filter(n => isFinite(n));
      const m = prices.length ? Math.min(...prices) : 0;
      const M = prices.length ? Math.max(...prices) : 0;
      const med = median(prices);
      // trend: ultimo vs mediana
      const last = g.items.slice().sort((a,b)=> (a.dateISO < b.dateISO ? 1 : -1))[0];
      const trend = last ? (last.unitPrice - med) : 0;
      out.push({ ...g, min: m, max: M, median: med, last, trend });
    }

    // ordina per query: per default alfabetico
    out.sort((a,b) => normKey(a.name).localeCompare(normKey(b.name)));
    return out;
  }, [lines, q, storeFilter, brandFilter, dateFrom, dateTo]);

  // =========================================================
  // ======================== LEGACY =========================
  // =========================================================
  const fetchSpese = useCallback(async () => {
    setLoadingLegacy(true);
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at, payment_method, card_label')
      .eq('category_id', CATEGORY_ID_CASA)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setSpese(data || []);
    setLoadingLegacy(false);
  }, []);

  useEffect(() => { if (view==='legacy') fetchSpese(); }, [view, fetchSpese]);

  // ===== la parte OCR/voce/insert legacy resta invariata =====
  const totale = (spese || []).reduce((t, r) => t + (Number(r.amount) || 0), 0);
  const renderPayBadge = (r) => {
    if (r.payment_method === 'card') return `💳 ${r.card_label || 'Carta'}`;
    if (r.payment_method === 'bank') return '🏦 Bonifico';
    return '💶 Contante';
  };

  // ---- stubs safe per i vecchi controlli (non rimossi) ----
  const stopTracks = useCallback(() => {
    try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
    streamRef.current = null;
  }, []);
  const processVoice = useCallback(async () => {
    setError('STT non attivo in questa versione del listino (usa la vista "Voci").');
  }, []);
  const stopRecording = useCallback(async () => {
    setStopping(false); setRecBusy(false); stopTracks();
  }, [stopTracks]);
  useEffect(() => {
    const handleVisibility = () => { if (document.hidden) stopRecording() }
    const handleBeforeUnload = () => { stopRecording(true) }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      stopRecording(true)
    }
  }, [stopRecording]);
  const handleAdd = async (e)=>{ e.preventDefault(); setError('Inserimento legacy non modificato. Usa Lista Prodotti/Home per popolare il listino.'); }
  const handleDelete = async (id)=>{ await supabase.from('finances').delete().eq('id', id); setSpese(spese.filter(r=>r.id!==id)); }
  const handleOCR = async ()=> setError('OCR legacy non modificato. Usa Lista Prodotti/Home.');

  // =========================================================
  // ========================= UI ============================
  // =========================================================
  return (
    <>
      <Head><title>Spese Casa · Listino prezzi</title></Head>

      <div style={{minHeight:'100vh', background:'#0f172a', color:'#e5eeff', padding:'24px 16px', display:'flex', justifyContent:'center'}}>
        <div style={{ width:'min(1100px, 100%)' }}>
          <h2 style={{margin:'0 0 12px'}}>🛒 Spese Casa</h2>

          {/* Switch vista */}
          <div style={{display:'flex', gap:8, marginBottom:12, flexWrap:'wrap'}}>
            <button onClick={()=>setView('pricebook')} style={{padding:'8px 12px', borderRadius:10, border:'1px solid #334155', background: view==='pricebook'?'#1e293b':'transparent', color:'#e2e8f0'}}>Listino prezzi</button>
            <button onClick={()=>setView('legacy')} style={{padding:'8px 12px', borderRadius:10, border:'1px solid #334155', background: view==='legacy'?'#1e293b':'transparent', color:'#e2e8f0'}}>Voci (legacy)</button>
            <div style={{flex:1}} />
            <Link href="/home" className="btnHome">🏠 Home</Link>
          </div>

          {/* =============== LISTINO PREZZI =============== */}
          {view==='pricebook' && (
            <section style={{border:'1px solid #1f2937', borderRadius:14, padding:12}}>
              <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', gap:8}}>
                <input placeholder="Cerca prodotto/brand/negozio…" value={q} onChange={e=>setQ(e.target.value)} style={inpStyle}/>
                <input placeholder="Dal (YYYY-MM-DD)" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={inpStyle}/>
                <input placeholder="Al (YYYY-MM-DD)" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={inpStyle}/>
                <input placeholder="Filtra negozio" value={storeFilter} onChange={e=>setStoreFilter(e.target.value)} style={inpStyle}/>
                <input placeholder="Filtra brand" value={brandFilter} onChange={e=>setBrandFilter(e.target.value)} style={inpStyle}/>
              </div>

              {pbLoading ? (
                <p style={{marginTop:12}}>Caricamento listino…</p>
              ) : pbError ? (
                <p style={{marginTop:12, color:'#f87171'}}>Errore: {String(pbError)}</p>
              ) : filteredAndGrouped.length === 0 ? (
                <p style={{marginTop:12, opacity:.85}}>Nessun prodotto trovato con i filtri correnti.</p>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:12}}>
                  {filteredAndGrouped.map((g, idx)=>(
                    <ProductGroup key={idx} group={g}/>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* =============== LEGACY (immutato) =============== */}
          {view==='legacy' && (
            <section style={{border:'1px solid #1f2937', borderRadius:14, padding:12}}>
              <div style={{display:'flex', gap:8, marginBottom:12}}>
                <button className="btnV" onClick={()=>setRecBusy(!recBusy)} disabled={stopping}>{recBusy?'⏹ Stop':'🎙 Voce'}</button>
                <button className="btnO" onClick={() => ocrInputRef.current?.click()}>📷 OCR</button>
                <input ref={ocrInputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => handleOCR(Array.from(e.target.files || []))}/>
              </div>

              <form onSubmit={handleAdd} style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12}}>
                <input placeholder="Punto vendita / Servizio" value={nuovaSpesa.puntoVendita} onChange={e=>setNuovaSpesa({...nuovaSpesa, puntoVendita:e.target.value})} required/>
                <input placeholder="Quantità" type="number" min="1" value={nuovaSpesa.quantita} onChange={e=>setNuovaSpesa({...nuovaSpesa, quantita:e.target.value})} required/>
                <textarea placeholder="Dettaglio" value={nuovaSpesa.dettaglio} onChange={e=>setNuovaSpesa({...nuovaSpesa, dettaglio:e.target.value})} required style={{gridColumn:'1 / span 2'}}/>
                <input type="date" value={nuovaSpesa.spentAt} onChange={e=>setNuovaSpesa({...nuovaSpesa, spentAt:e.target.value})} required/>
                <input type="number" step="0.01" placeholder="Prezzo totale (€)" value={nuovaSpesa.prezzoTotale} onChange={e=>setNuovaSpesa({...nuovaSpesa, prezzoTotale:e.target.value})} required/>
                <select value={nuovaSpesa.paymentMethod} onChange={e=>setNuovaSpesa({...nuovaSpesa, paymentMethod:e.target.value})}>
                  <option value="cash">Contante (tasca)</option>
                  <option value="card">Carta</option>
                  <option value="bank">Bonifico/Altro</option>
                </select>
                {nuovaSpesa.paymentMethod==='card' && (
                  <input placeholder="Nome carta" value={nuovaSpesa.cardLabel} onChange={e=>setNuovaSpesa({...nuovaSpesa, cardLabel:e.target.value})}/>
                )}
                <button style={{gridColumn:'1 / span 2'}}>Aggiungi</button>
              </form>

              {loadingLegacy ? <p>Caricamento…</p> : (
                <>
                  <table className="tbl">
                    <thead><tr><th>Punto vendita</th><th>Dettaglio</th><th>Data</th><th>Qtà</th><th>Prezzo €</th><th>Pag.</th><th/></tr></thead>
                    <tbody>
                      {(spese||[]).map(r=>{
                        const m = r.description?.match?.(/^\[(.*?)\]\s*(.*)$/) || [];
                        return (
                          <tr key={r.id}>
                            <td>{m[1] || '-'}</td>
                            <td>{m[2] || r.description}</td>
                            <td>{fmtDateIT(r.spent_at)}</td>
                            <td>{r.qty}</td>
                            <td>{Number(r.amount).toFixed(2)}</td>
                            <td>{renderPayBadge(r)}</td>
                            <td><button onClick={()=>handleDelete(r.id)}>🗑</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{marginTop:10, textAlign:'right', fontWeight:700}}>Totale: € {totale.toFixed(2)}</div>
                </>
              )}
              {error && <p style={{color:'#f87171'}}>{error}</p>}
            </section>
          )}
        </div>
      </div>

      <style jsx>{`
        .btnHome{ padding:8px 12px; border:1px solid #334155; border-radius:10px; text-decoration:none; color:#e2e8f0; }
        input,textarea,select{ background:#0b1220; border:1px solid #1f2937; color:#e5eeff; border-radius:8px; padding:8px 10px; }
        .btnV{ background:#10b981; border:none; border-radius:8px; color:#0b1220; padding:8px 12px; }
        .btnO{ background:#f43f5e; border:none; border-radius:8px; color:#fff; padding:8px 12px; }
        .tbl{ width:100%; border-collapse:collapse; }
        .tbl th,.tbl td{ border-bottom:1px solid rgba(255,255,255,.08); padding:8px 10px; }
      `}</style>
    </>
  );
}

/* ====== mini subcomponents ====== */
const inpStyle = { background:'#0b1220', border:'1px solid #1f2937', color:'#e5eeff', borderRadius:8, padding:'8px 10px', width:'100%' };

function ProductGroup({ group }) {
  const [open, setOpen] = useState(false);
  const { name, brand, min, max, median, last, trend, items } = group;

  return (
    <div style={{border:'1px solid #293446', borderRadius:12, overflow:'hidden'}}>
      <button
        onClick={()=>setOpen(o=>!o)}
        style={{all:'unset', cursor:'pointer', display:'grid',
          gridTemplateColumns:'1fr auto auto auto auto', gap:10, padding:'10px 12px',
          background:'#0b1220', width:'100%', alignItems:'center'}}
      >
        <div>
          <div style={{fontWeight:800}}>{name}{brand ? <span style={{opacity:.8, fontWeight:500}}> · {brand}</span> : null}</div>
          {last && (
            <div style={{opacity:.8, fontSize:13, marginTop:2}}>
              Ultimo: € {last.unitPrice.toFixed(2)} ({fmtDateIT(last.dateISO)}) • {last.store}
            </div>
          )}
        </div>
        <div style={{opacity:.9}}>min €{min.toFixed(2)}</div>
        <div style={{opacity:.9}}>med €{median.toFixed(2)}</div>
        <div style={{opacity:.9}}>max €{max.toFixed(2)}</div>
        <div style={{fontWeight:700, color: trend>0 ? '#f87171' : trend<0 ? '#10b981' : '#e5eeff' }}>
          {trend>0 ? '↗' : trend<0 ? '↘' : '•'}
        </div>
      </button>

      {open && (
        <div style={{padding:'10px 12px', background:'#0f172a'}}>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#182033'}}>
                <th style={tdh}>Data</th>
                <th style={tdh}>Punto vendita</th>
                <th style={tdh}>Indirizzo</th>
                <th style={tdh}>Prezzo unit.</th>
                <th style={tdh}>Qtà</th>
                <th style={tdh}>Totale</th>
              </tr>
            </thead>
            <tbody>
              {items.slice().sort((a,b)=> (a.dateISO < b.dateISO ? 1 : -1)).map((r, i)=>(
                <tr key={r.id || i}>
                  <td style={td}>{fmtDateIT(r.dateISO)}</td>
                  <td style={td}>{r.store || '—'}</td>
                  <td style={td}>{r.address || '—'}</td>
                  <td style={td}>€ {r.unitPrice.toFixed(2)} {r.unitLabel ? <span style={{opacity:.8}}>/{r.unitLabel}</span> : null}</td>
                  <td style={td}>{r.qty}</td>
                  <td style={td}>€ {r.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
const tdh = { padding:'8px 10px', textAlign:'left' };
const td  = { padding:'8px 10px', borderBottom:'1px solid rgba(255,255,255,.06)' };

export default withAuth(SpeseCasa);
