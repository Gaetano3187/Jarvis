// pages/finanze.js
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import VoiceRecorder from '../components/VoiceRecorder';
import { supabase } from '../lib/supabaseClient';
import {
  FaMoneyBillWave, FaHome, FaTshirt, FaUtensils,
  FaFolderOpen, FaChartPie, FaPlus, FaCamera, FaMicrophone,
  FaChartBar, FaTimes, FaTrash,
} from 'react-icons/fa';

// ─── costanti (invariate) ────────────────────────────────────────────────────
const categories = [
  { href: '/entrate',          base: '#22c55e', hover: '#16a34a', icon: <FaMoneyBillWave/>, title: 'Entrate & Saldi',  subtitle: 'Stipendi, carryover, tasca' },
  { href: '/spese-casa',       base: '#3b82f6', hover: '#2563eb', icon: <FaHome/>,          title: 'Spese Casa',       subtitle: 'Bollette, manutenzioni ecc.' },
  { href: '/vestiti-ed-altro', base: '#a855f7', hover: '#9333ea', icon: <FaTshirt/>,        title: 'Vestiti ed Altro', subtitle: 'Vestiti e accessori' },
  { href: '/cene-aperitivi',   base: '#f59e0b', hover: '#f97316', icon: <FaUtensils/>,      title: 'Cene / Aperitivi', subtitle: 'Serate, pranzi, regali' },
  { href: '/varie',            base: '#64748b', hover: '#475569', icon: <FaFolderOpen/>,    title: 'Varie',            subtitle: 'Spese non catalogate' },
  { href: '/spese',            base: '#06b6d4', hover: '#0ea5e9', icon: <FaChartPie/>,      title: 'Report Spese',     subtitle: 'Tutte le spese per categoria' },
];
const CAT_KEYS  = { casa: '/spese-casa', vestiti: '/vestiti-ed-altro', cene: '/cene-aperitivi', varie: '/varie' };
const CAT_COLORS = { casa: '#3b82f6', vestiti: '#a855f7', cene: '#f59e0b', varie: '#64748b' };
const CAT_LABELS = { casa: '🏠 Casa', vestiti: '👔 Vestiti', cene: '🍽️ Cene', varie: '📦 Varie' };
const fmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n ?? 0);
const monthLabel = (key) => { const [y,m]=key.split('-'); return new Date(+y,+m-1).toLocaleDateString('it-IT',{month:'short',year:'2-digit'}); };

// ─── Modal aggiunta manuale spesa ────────────────────────────────────────────
function AddExpenseModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ category: 'varie', store: '', description: '', amount: '', date: new Date().toISOString().split('T')[0], payment_method: 'card' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const save = async () => {
    if (!form.amount || isNaN(+form.amount)) { setError('Inserisci un importo valido'); return; }
    setLoading(true); setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Non autenticato'); setLoading(false); return; }
    const { error: err } = await supabase.from('expenses').insert({
      user_id: user.id,
      category: form.category,
      store: form.store || null,
      description: form.description || null,
      amount: parseFloat(form.amount),
      purchase_date: form.date,
      payment_method: form.payment_method,
      source: 'manual',
    });
    if (err) { setError(err.message); setLoading(false); return; }
    onSaved(); onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <span>➕ Nuova spesa</span>
          <button className="modal-close" onClick={onClose}><FaTimes/></button>
        </div>

        {error && <p className="modal-error">{error}</p>}

        {/* Categoria */}
        <label className="field-label">Categoria</label>
        <div className="cat-picker">
          {['casa','vestiti','cene','varie'].map(c => (
            <button
              key={c}
              className={`cat-pill ${form.category === c ? 'active' : ''}`}
              style={form.category === c ? { background: CAT_COLORS[c] } : {}}
              onClick={() => setForm(f => ({ ...f, category: c }))}
            >
              {CAT_LABELS[c]}
            </button>
          ))}
        </div>

        {/* Importo */}
        <label className="field-label">Importo (€)</label>
        <input className="field-input" type="number" step="0.01" placeholder="0.00"
          value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))} />

        {/* Data + Metodo */}
        <div className="field-row">
          <div style={{flex:1}}>
            <label className="field-label">Data</label>
            <input className="field-input" type="date"
              value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))} />
          </div>
          <div style={{flex:1}}>
            <label className="field-label">Pagamento</label>
            <select className="field-input"
              value={form.payment_method} onChange={e => setForm(f=>({...f,payment_method:e.target.value}))}>
              <option value="card">💳 Carta</option>
              <option value="cash">💵 Contanti</option>
              <option value="transfer">🏦 Bonifico</option>
            </select>
          </div>
        </div>

        {/* Negozio / descrizione */}
        <label className="field-label">Negozio / Descrizione</label>
        <input className="field-input" placeholder="Es. Esselunga, Amazon..."
          value={form.store} onChange={e => setForm(f=>({...f,store:e.target.value}))} />

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annulla</button>
          <button className="btn-primary" onClick={save} disabled={loading} style={{background: CAT_COLORS[form.category]}}>
            {loading ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal OCR scontrino ─────────────────────────────────────────────────────
function OcrModal({ file, onClose, onSaved }) {
  const [lines, setLines]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!file) return;
    (async () => {
      try {
        // Tesseract.js — caricato solo se necessario
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('ita');
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();

        // Parsing rozzo: cerca righe con "12,34" o "12.34"
        const raw = text.split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = raw.map(l => {
          const m = l.match(/(\d{1,4}[.,]\d{2})\s*€?$/);
          return m ? { text: l.replace(m[0],'').trim(), amount: parseFloat(m[1].replace(',','.')), selected: true } : null;
        }).filter(Boolean);

        if (parsed.length === 0) {
          // nessun prezzo trovato: mostra righe raw per selezione manuale
          setLines(raw.map(l => ({ text: l, amount: null, selected: false })));
        } else {
          setLines(parsed);
          setSelected(parsed.map((_,i) => i));
        }
      } catch (e) {
        setError('Errore OCR: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [file]);

  const toggleLine = (i) => {
    setSelected(prev => prev.includes(i) ? prev.filter(x=>x!==i) : [...prev, i]);
  };

  const saveAll = async () => {
    const toSave = lines.filter((_,i) => selected.includes(i) && lines[i].amount);
    if (toSave.length === 0) { setError('Seleziona almeno una voce con importo'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const today = new Date().toISOString().split('T')[0];
    const rows = toSave.map(l => ({
      user_id: user.id, category: 'varie',
      description: l.text, amount: l.amount,
      purchase_date: today, payment_method: 'card', source: 'ocr',
    }));
    const { error: err } = await supabase.from('expenses').insert(rows);
    if (err) { setError(err.message); setSaving(false); return; }
    onSaved(); onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-box--wide">
        <div className="modal-header">
          <span>📷 OCR Scontrino</span>
          <button className="modal-close" onClick={onClose}><FaTimes/></button>
        </div>

        {loading && <p className="modal-info">⏳ Analisi in corso...</p>}
        {error   && <p className="modal-error">{error}</p>}

        {!loading && lines.length === 0 && !error && (
          <p className="modal-info">Nessuna voce rilevata. Prova con un&apos;immagine più nitida.</p>
        )}

        {!loading && lines.length > 0 && (
          <>
            <p className="modal-info">Seleziona le voci da salvare:</p>
            <div className="ocr-list">
              {lines.map((l,i) => (
                <label key={i} className={`ocr-row ${selected.includes(i) ? 'ocr-row--on' : ''}`}>
                  <input type="checkbox" checked={selected.includes(i)} onChange={() => toggleLine(i)} />
                  <span className="ocr-text">{l.text}</span>
                  {l.amount != null && <span className="ocr-amount">{fmt(l.amount)}</span>}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Annulla</button>
              <button className="btn-primary" onClick={saveAll} disabled={saving}>
                {saving ? 'Salvataggio...' : `Salva ${selected.filter(i=>lines[i]?.amount).length} voci`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal dashboard / grafici ───────────────────────────────────────────────
function DashboardModal({ onClose }) {
  const [summary, setSummary]     = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [expenses, setExpenses]   = useState([]);
  const [selMonth, setSelMonth]   = useState('');
  const [loading, setLoading]     = useState(true);
  const [deleting, setDeleting]   = useState(null);
  const [Charts, setCharts]       = useState(null);

  // Carica Chart.js dinamicamente
  useEffect(() => {
    (async () => {
      const [
        { Chart: ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
          PointElement, ArcElement, Title, Tooltip, Legend, Filler },
        { Bar, Doughnut, Line },
      ] = await Promise.all([
        import('chart.js'),
        import('react-chartjs-2'),
      ]);
      ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement,
        PointElement, ArcElement, Title, Tooltip, Legend, Filler);
      setCharts({ Bar, Doughnut, Line });
    })();
  }, []);

  const load = useCallback(async (month) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // riepilogo mensile via view
    const { data: riepilogo } = await supabase
      .from('v_riepilogo_mensile')
      .select('*')
      .eq('user_id', user.id)
      .order('month_key', { ascending: false })
      .limit(12);

    const { data: byCat } = await supabase
      .from('v_finanze_mensili')
      .select('*')
      .eq('user_id', user.id)
      .order('month_key', { ascending: false })
      .limit(48);

    const currentMonth = month || riepilogo?.[0]?.month_key;
    if (currentMonth && !month) setSelMonth(currentMonth);

    // spese del mese selezionato
    let expQ = supabase.from('expenses').select('*').eq('user_id', user.id);
    if (currentMonth) {
      expQ = expQ
        .gte('purchase_date', `${currentMonth}-01`)
        .lte('purchase_date', `${currentMonth}-31`);
    }
    const { data: exps } = await expQ.order('purchase_date', { ascending: false }).limit(100);

    setSummary(riepilogo ?? []);
    setByCategory(byCat ?? []);
    setExpenses(exps ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selMonth) load(selMonth); }, [selMonth, load]);

  const deleteExpense = async (id) => {
    setDeleting(id);
    await supabase.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    load(selMonth);
    setDeleting(null);
  };

  const current = summary.find(s => s.month_key === selMonth);
  const last6   = [...summary].reverse().slice(-6);
  const monthCats = byCategory.filter(c => c.month_key === selMonth);
  const last4months = [...summary].reverse().slice(-4).map(s => s.month_key);

  const chartOptBase = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } } } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)' } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)', callback: v => `€${v}` } },
    },
  };

  const lineData = Charts ? {
    labels: last6.map(s => monthLabel(s.month_key)),
    datasets: [
      { label: 'Spese',   data: last6.map(s=>s.total_spese),   borderColor:'#f43f5e', backgroundColor:'rgba(244,63,94,0.07)',  fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'#f43f5e' },
      { label: 'Entrate', data: last6.map(s=>s.total_entrate), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,0.07)',   fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'#22c55e' },
    ],
  } : null;

  const doughnutData = Charts && monthCats.length ? {
    labels: monthCats.map(c => CAT_LABELS[c.category] ?? c.category),
    datasets: [{ data: monthCats.map(c=>c.total_spent), backgroundColor: monthCats.map(c=>CAT_COLORS[c.category]??'#888'), borderWidth:0, hoverOffset:8 }],
  } : null;

  const barData = Charts ? {
    labels: last4months.map(monthLabel),
    datasets: ['casa','vestiti','cene','varie'].map(cat=>({
      label: CAT_LABELS[cat],
      data: last4months.map(m => byCategory.find(b=>b.month_key===m&&b.category===cat)?.total_spent ?? 0),
      backgroundColor: CAT_COLORS[cat]+'bb',
      borderRadius: 5,
      borderSkipped: false,
    })),
  } : null;

  return (
    <div className="drawer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-header">
          <span>📊 Dashboard Finanze</span>
          <button className="modal-close" onClick={onClose}><FaTimes/></button>
        </div>

        {loading && <p className="modal-info" style={{padding:'2rem',textAlign:'center'}}>⏳ Caricamento...</p>}

        {!loading && (
          <div className="drawer-body">
            {/* Selettore mese */}
            <div className="month-tabs">
              {summary.map(s => (
                <button key={s.month_key}
                  className={`month-tab ${s.month_key === selMonth ? 'active' : ''}`}
                  onClick={() => setSelMonth(s.month_key)}>
                  {monthLabel(s.month_key)}
                </button>
              ))}
            </div>

            {/* KPI */}
            {current && (
              <div className="kpi-grid">
                {[
                  { label:'Entrate', v:current.total_entrate, color:'#22c55e' },
                  { label:'Spese',   v:current.total_spese,   color:'#f43f5e' },
                  { label:'Saldo',   v:current.saldo, color: current.saldo>=0?'#22c55e':'#f43f5e' },
                  { label:'Carryover', v:current.carryover, color:'#a855f7' },
                ].map(k=>(
                  <div key={k.label} className="kpi-card">
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-value" style={{color:k.color}}>{fmt(k.v)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Grafico andamento */}
            {Charts && lineData && (
              <div className="chart-box">
                <div className="chart-title">Andamento ultimi 6 mesi</div>
                <div style={{height:180}}>
                  <Charts.Line data={lineData} options={chartOptBase} />
                </div>
              </div>
            )}

            {/* Doughnut + Bar affiancati */}
            <div className="charts-row">
              {Charts && doughnutData && (
                <div className="chart-box" style={{flex:1}}>
                  <div className="chart-title">Categorie — {monthLabel(selMonth)}</div>
                  <div style={{height:160,display:'flex',alignItems:'center',gap:12}}>
                    <div style={{width:140,flexShrink:0}}>
                      <Charts.Doughnut data={doughnutData} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'68%'}} />
                    </div>
                    <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
                      {monthCats.map(c=>(
                        <div key={c.category} style={{display:'flex',justifyContent:'space-between',fontSize:12}}>
                          <span style={{display:'flex',alignItems:'center',gap:6,color:'rgba(255,255,255,0.6)'}}>
                            <span style={{width:8,height:8,borderRadius:'50%',background:CAT_COLORS[c.category],display:'inline-block'}}/>
                            {CAT_LABELS[c.category]}
                          </span>
                          <span style={{color:'#fff',fontWeight:600}}>{fmt(c.total_spent)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {Charts && barData && (
                <div className="chart-box" style={{flex:1}}>
                  <div className="chart-title">Per categoria (4 mesi)</div>
                  <div style={{height:160}}>
                    <Charts.Bar data={barData} options={{...chartOptBase, plugins:{legend:{labels:{color:'rgba(255,255,255,0.4)',font:{size:10}}}}}} />
                  </div>
                </div>
              )}
            </div>

            {/* Lista spese mese selezionato */}
            <div className="chart-box">
              <div className="chart-title">Spese — {monthLabel(selMonth)}</div>
              {expenses.length === 0
                ? <p style={{color:'rgba(255,255,255,0.25)',fontSize:13,textAlign:'center',padding:'1rem'}}>Nessuna spesa questo mese</p>
                : (
                  <div className="exp-list">
                    {expenses.map(e=>(
                      <div key={e.id} className="exp-row">
                        <div className="exp-icon" style={{background:CAT_COLORS[e.category]+'22'}}>
                          {e.category==='casa'?'🏠':e.category==='vestiti'?'👔':e.category==='cene'?'🍽️':'📦'}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div className="exp-desc">{e.description||e.store||CAT_LABELS[e.category]}</div>
                          <div className="exp-meta">{new Date(e.purchase_date).toLocaleDateString('it-IT')} · {e.payment_method==='card'?'💳':e.payment_method==='cash'?'💵':'🏦'}{e.store?` · ${e.store}`:''}</div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <span className="exp-cat-badge" style={{background:CAT_COLORS[e.category]+'25',color:CAT_COLORS[e.category]}}>{CAT_LABELS[e.category]}</span>
                          <span className="exp-amount">−{fmt(e.amount)}</span>
                          <button className="exp-del" onClick={()=>deleteExpense(e.id)} disabled={deleting===e.id}>
                            {deleting===e.id?'…':<FaTrash/>}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pagina principale ───────────────────────────────────────────────────────
const Finanze = () => {
  const fileInputRef = useRef(null);
  const videoRef     = useRef(null);

  const [totals, setTotals]         = useState({});
  const [modal, setModal]           = useState(null); // 'add' | 'ocr' | 'dashboard'
  const [ocrFile, setOcrFile]       = useState(null);
  const [toast, setToast]           = useState('');
  const [voiceLoading, setVoiceLoading] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const reloadTotals = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const now = new Date();
      const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
      const { data } = await supabase
        .from('expenses')
        .select('category, amount')
        .eq('user_id', user.id)
        .gte('purchase_date', `${y}-${m}-01`)
        .lte('purchase_date', `${y}-${m}-${new Date(y,now.getMonth()+1,0).getDate()}`);
      const map = {};
      (data||[]).forEach(r => { map[r.category] = (map[r.category]||0) + Number(r.amount||0); });
      setTotals(map);
    } catch {}
  }, []);

  useEffect(() => { reloadTotals(); }, [reloadTotals]);

  // Fix video mobile
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.setAttribute('playsinline','');
    v.setAttribute('webkit-playsinline','');
    v.controls = false;
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddManual = useCallback(() => setModal('add'), []);
  const handleOCR       = useCallback(() => fileInputRef.current?.click(), []);

  const handleVoice = useCallback(async (text) => {
    if (!text) return;
    setVoiceLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Chiama l'edge function finanze con GPT parsing
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/finanze?action=parse_voice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ text }),
        }
      );
      if (res.ok) {
        const { parsed } = await res.json();
        if (parsed?.amount) {
          // Salva direttamente
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from('expenses').insert({
            user_id: user.id,
            category: parsed.category ?? 'varie',
            description: parsed.description ?? text,
            store: parsed.store ?? null,
            amount: parsed.amount,
            purchase_date: new Date().toISOString().split('T')[0],
            payment_method: 'card',
            source: 'voice',
          });
          showToast(`✅ Salvato: ${parsed.description ?? text} — ${fmt(parsed.amount)}`);
          reloadTotals();
        } else {
          // Fallback: apri modal con testo pre-compilato
          setModal('add');
        }
      }
    } catch (e) {
      console.error('[VOICE]', e);
      showToast('❌ Errore nel riconoscimento vocale');
    } finally {
      setVoiceLoading(false);
    }
  }, [reloadTotals]);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) { setOcrFile(f); setModal('ocr'); }
    e.target.value = '';
  };

  return (
    <>
      <Head>
        <title>Finanze • Jarvis-Assistant</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Modali */}
      {modal === 'add' && (
        <AddExpenseModal
          onClose={() => setModal(null)}
          onSaved={() => { showToast('✅ Spesa salvata!'); reloadTotals(); }}
        />
      )}
      {modal === 'ocr' && ocrFile && (
        <OcrModal
          file={ocrFile}
          onClose={() => { setModal(null); setOcrFile(null); }}
          onSaved={() => { showToast('✅ Spese OCR salvate!'); reloadTotals(); }}
        />
      )}
      {modal === 'dashboard' && (
        <DashboardModal onClose={() => setModal(null)} />
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      {/* Loader vocale */}
      {voiceLoading && (
        <div className="voice-loader">
          <div className="voice-loader-inner">🎙️ Analisi in corso...</div>
        </div>
      )}

      {/* Video di sfondo (invariato) */}
      <video
        ref={videoRef}
        className="bg-video"
        src="/pagina%20finanze.mp4"
        autoPlay muted loop playsInline
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture preload="auto"
        poster="https://play.teleporthq.io/static/svg/videoposter.svg"
      />

      <main className="wrap">
        <section className="grid">
          {/* Cards (invariate) */}
          <div className="cards">
            {categories.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="cat-card glow-strong"
                style={{ '--base': c.base, '--hover': c.hover }}
              >
                <div className="cat-bottom">
                  <h3 className="title">
                    <span className="chip">
                      <span className="chip-icon">{c.icon}</span>
                      <span className="chip-label">{c.title}</span>
                    </span>
                  </h3>
                  <p className="sub">{c.subtitle}</p>
                  {Object.entries(CAT_KEYS).map(([cat, route]) =>
                    route === c.href && totals[cat] != null ? (
                      <p key={cat} className="cat-total">€ {Number(totals[cat]).toFixed(2)} questo mese</p>
                    ) : null
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Barra strumenti — aggiunto pulsante Dashboard */}
          <div className="tools-sticky">
            <div className="tools-card">
              <div className="icon-bar">
                <button className="icon-btn glow-strong" onClick={handleAddManual} aria-label="Aggiungi operazione">
                  <FaPlus />
                </button>
                <button className="icon-btn glow-strong" onClick={handleOCR} aria-label="OCR scontrino">
                  <FaCamera />
                </button>
                <VoiceRecorder
                  buttonClass="icon-btn glow-strong"
                  idleLabel={<FaMicrophone aria-hidden="true" />}
                  recordingLabel={<FaMicrophone aria-hidden="true" />}
                  ariaLabelIdle="Comando vocale"
                  ariaLabelRecording="Stop registrazione"
                  onText={handleVoice}
                />
                {/* NUOVO: pulsante dashboard */}
                <button className="icon-btn glow-strong icon-btn--highlight" onClick={() => setModal('dashboard')} aria-label="Dashboard e grafici">
                  <FaChartBar />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Input OCR nascosto */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />

      <style jsx>{`
        /* ── CSS ORIGINALE INVARIATO ─────────────────────────────────── */
        :root{
          --glass-bg: rgba(0,0,0,0.26);
          --glass-brd: rgba(255,255,255,0.14);
          --text: #fff;
        }
        .bg-video{
          position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;
          z-index:-1;pointer-events:none;filter:saturate(1.05) contrast(1.05);
        }
        .wrap{ min-height:100vh;display:grid;grid-template-rows:1fr auto;padding:28px;color:var(--text); }
        .grid{ width:100%;max-width:1240px;margin:0 auto;display:grid;grid-template-rows:auto 1fr;gap:20px; }
        .cards{ display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px; }
        .cat-card{
          position:relative;display:grid;grid-template-rows:1fr;
          min-height:clamp(240px,36vw,400px);border-radius:26px;
          color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,0.14);
          background:var(--base);
          box-shadow:0 12px 28px rgba(0,0,0,0.18),0 0 36px color-mix(in srgb,var(--base),#fff 26%);
          overflow:hidden;isolation:isolate;
          transition:transform .25s ease,box-shadow .25s ease,filter .25s ease,background .25s ease;
          animation:shimmer 6s linear infinite;touch-action:manipulation;
        }
        .cat-card:hover{
          transform:translateY(-4px) scale(1.02);background:var(--hover);
          box-shadow:0 18px 50px rgba(0,0,0,0.24),0 0 46px color-mix(in srgb,var(--hover),#fff 30%);
        }
        .cat-bottom{ display:flex;flex-direction:column;justify-content:flex-end;padding:28px;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.14) 100%); }
        .title{ margin:0 0 12px; }
        .chip{
          --soft:color-mix(in oklab,var(--base),#ffffff 22%);
          --deep:color-mix(in oklab,var(--base),#000000 10%);
          display:inline-flex;align-items:center;gap:12px;padding:14px 18px;border-radius:18px;
          font-size:clamp(1.35rem,3.6vw,2rem);font-weight:900;letter-spacing:.2px;color:#0b1020;
          background:linear-gradient(90deg,var(--soft),var(--deep));
          box-shadow:0 0 0 1px rgba(255,255,255,0.16) inset,0 10px 24px color-mix(in srgb,var(--base),#000 22%),0 0 32px color-mix(in srgb,var(--base),#fff 18%);
          position:relative;overflow:hidden;text-shadow:0 1px 0 rgba(255,255,255,0.35);
        }
        .chip-icon :global(svg){ font-size:clamp(26px,4vw,32px);filter:drop-shadow(0 4px 12px rgba(0,0,0,.28)); }
        .chip-label{ line-height:1; }
        .chip::before{
          content:"";position:absolute;top:0;left:-35%;width:30%;height:100%;
          background:linear-gradient(120deg,rgba(255,255,255,0.6),rgba(255,255,255,0.14));
          transform:skewX(-20deg);filter:blur(0.5px);animation:sweep 3s linear infinite;mix-blend-mode:screen;
        }
        .chip::after{
          content:"";position:absolute;inset:-25%;
          background:radial-gradient(60% 40% at 50% 50%,rgba(255,255,255,0.18),transparent 70%);
          filter:blur(18px);animation:pulseBloom 2.1s ease-in-out infinite;pointer-events:none;
        }
        .sub{ margin:0;opacity:.95;font-size:clamp(1rem,2.4vw,1.2rem); }
        .cat-total{ margin:.5rem 0 0;font-size:clamp(.85rem,2vw,1rem);font-weight:700;opacity:.9;background:rgba(0,0,0,.25);border-radius:.4rem;padding:.2rem .5rem;display:inline-block; }
        .tools-sticky{ margin-top:12px;align-self:end;position:sticky;bottom:12px; }
        .tools-card{
          background:var(--glass-bg);border:1px solid var(--glass-brd);border-radius:14px;
          padding:10px 12px;backdrop-filter:blur(10px);box-shadow:0 8px 22px rgba(0,0,0,0.30);
        }
        .icon-bar{ display:flex;gap:10px;align-items:center; }
        .icon-btn{
          --btn-size:56px;width:var(--btn-size);height:var(--btn-size);display:grid;place-items:center;
          border-radius:12px;border:1px solid rgba(255,255,255,0.16);
          background:linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02));
          color:#fff;cursor:pointer;
          box-shadow:0 6px 18px rgba(0,0,0,0.28),inset 0 1px 0 rgba(255,255,255,0.06);
          transition:transform .15s ease,box-shadow .2s ease,filter .2s ease;
          font-size:1.25rem;position:relative;overflow:hidden;isolation:isolate;
        }
        .icon-btn:hover{ transform:translateY(-2px); }
        .icon-btn--highlight{ background:linear-gradient(180deg,rgba(6,182,212,0.25),rgba(6,182,212,0.08));border-color:rgba(6,182,212,0.4);color:#06b6d4; }
        .glow-strong::before{
          content:"";position:absolute;inset:-20%;
          background:conic-gradient(from 0deg,rgba(255,255,255,0.08),rgba(255,255,255,0.28),rgba(255,255,255,0.08));
          filter:blur(18px);opacity:.6;z-index:1;animation:spinGlow 8s linear infinite;pointer-events:none;
        }
        .glow-strong::after{
          content:"";position:absolute;inset:0;
          background:radial-gradient(120% 80% at -10% 0%,rgba(255,255,255,0.16),transparent 40%),radial-gradient(120% 80% at 120% 100%,rgba(255,255,255,0.14),transparent 40%);
          z-index:1;mix-blend-mode:screen;animation:pulseBloom 2.2s ease-in-out infinite;pointer-events:none;
        }
        @keyframes spinGlow{ to{ transform:rotate(360deg); } }
        @keyframes pulseBloom{ 0%,100%{ opacity:.32;filter:brightness(1);} 50%{ opacity:.75;filter:brightness(1.35);} }
        @keyframes shimmer{ 0%{ filter:brightness(1);} 50%{ filter:brightness(1.08);} 100%{ filter:brightness(1);} }
        @keyframes sweep{ 0%{ left:-35%; } 100%{ left:135%; } }
        @media (max-width:900px){ .wrap{padding:20px;} .grid{max-width:100%;} .cards{grid-template-columns:1fr;gap:20px;} .icon-btn{--btn-size:54px;font-size:1.2rem;} .tools-sticky{bottom:10px;} }
        @media (max-width:480px){ .icon-btn{--btn-size:52px;font-size:1.15rem;} }

        /* ── NUOVI STILI: modali, drawer, toast ──────────────────────── */

        /* Overlay generico */
        .modal-overlay{
          position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;
          background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:16px;
        }
        .modal-box{
          background:#0f0f18;border:1px solid rgba(255,255,255,0.10);border-radius:20px;
          width:100%;max-width:420px;padding:24px;display:flex;flex-direction:column;gap:14px;
          max-height:90vh;overflow-y:auto;
        }
        .modal-box--wide{ max-width:560px; }
        .modal-header{ display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:700;color:#fff; }
        .modal-close{ background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:16px;padding:4px;transition:color .2s; }
        .modal-close:hover{ color:#fff; }
        .modal-error{ background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.3);color:#f87171;border-radius:10px;padding:10px 14px;font-size:13px; }
        .modal-info{ color:rgba(255,255,255,0.45);font-size:13px;text-align:center;padding:8px 0; }
        .modal-actions{ display:flex;gap:10px;margin-top:4px; }
        .btn-primary{ flex:1;padding:11px;border-radius:12px;border:none;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:filter .2s; }
        .btn-primary:hover{ filter:brightness(1.1); }
        .btn-primary:disabled{ opacity:.5;cursor:not-allowed; }
        .btn-secondary{ flex:1;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);font-size:14px;font-weight:600;cursor:pointer;transition:background .2s; }
        .btn-secondary:hover{ background:rgba(255,255,255,0.10); }

        /* Form fields */
        .field-label{ font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.4);margin-bottom:4px;display:block; }
        .field-input{
          width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);
          border-radius:10px;padding:10px 12px;color:#fff;font-size:14px;outline:none;
          transition:border-color .2s;box-sizing:border-box;
        }
        .field-input:focus{ border-color:rgba(99,102,241,0.6); }
        .field-row{ display:flex;gap:10px; }

        /* Categoria picker */
        .cat-picker{ display:grid;grid-template-columns:repeat(4,1fr);gap:6px; }
        .cat-pill{ padding:8px 4px;border-radius:10px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;cursor:pointer;transition:all .2s;text-align:center; }
        .cat-pill.active{ color:#fff;border-color:transparent; }

        /* OCR list */
        .ocr-list{ display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto; }
        .ocr-row{ display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);cursor:pointer;transition:background .2s; }
        .ocr-row:hover{ background:rgba(255,255,255,0.05); }
        .ocr-row--on{ background:rgba(99,102,241,0.12);border-color:rgba(99,102,241,0.3); }
        .ocr-row input{ flex-shrink:0; }
        .ocr-text{ flex:1;font-size:13px;color:rgba(255,255,255,0.75); }
        .ocr-amount{ font-size:13px;font-weight:700;color:#22c55e;white-space:nowrap; }

        /* Drawer dashboard (slide da destra) */
        .drawer-overlay{
          position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);
          display:flex;justify-content:flex-end;
        }
        .drawer{
          background:#0c0c16;border-left:1px solid rgba(255,255,255,0.08);
          width:min(620px,100vw);height:100%;display:flex;flex-direction:column;
          animation:slideIn .25s ease;
        }
        @keyframes slideIn{ from{transform:translateX(100%);opacity:0;} to{transform:translateX(0);opacity:1;} }
        .drawer-header{
          display:flex;justify-content:space-between;align-items:center;
          padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.08);
          font-size:16px;font-weight:700;color:#fff;flex-shrink:0;
        }
        .drawer-body{ flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:16px; }

        /* Month tabs */
        .month-tabs{ display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none; }
        .month-tab{ flex-shrink:0;padding:7px 14px;border-radius:10px;border:none;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.45);font-size:12px;font-weight:600;cursor:pointer;transition:all .2s; }
        .month-tab.active{ background:#6366f1;color:#fff; }

        /* KPI */
        .kpi-grid{ display:grid;grid-template-columns:repeat(4,1fr);gap:10px; }
        .kpi-card{ background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px; }
        .kpi-label{ font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.35);margin-bottom:6px; }
        .kpi-value{ font-size:15px;font-weight:700; }

        /* Charts */
        .chart-box{ background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px; }
        .chart-title{ font-size:12px;color:rgba(255,255,255,0.45);margin-bottom:12px;text-transform:uppercase;letter-spacing:.07em; }
        .charts-row{ display:flex;gap:12px; }

        /* Expense list */
        .exp-list{ display:flex;flex-direction:column;gap:2px; }
        .exp-row{ display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:10px;transition:background .15s; }
        .exp-row:hover{ background:rgba(255,255,255,0.03); }
        .exp-icon{ width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0; }
        .exp-desc{ font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .exp-meta{ font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px; }
        .exp-cat-badge{ font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;white-space:nowrap; }
        .exp-amount{ font-size:13px;font-weight:700;color:#f87171;white-space:nowrap; }
        .exp-del{ background:none;border:none;color:rgba(255,255,255,0.2);cursor:pointer;font-size:11px;padding:4px;border-radius:6px;transition:color .2s; }
        .exp-del:hover{ color:#f87171; }

        /* Toast */
        .toast{
          position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:200;
          background:rgba(15,15,24,0.95);border:1px solid rgba(255,255,255,0.12);border-radius:12px;
          padding:12px 20px;color:#fff;font-size:14px;font-weight:500;
          box-shadow:0 8px 32px rgba(0,0,0,0.5);pointer-events:none;
          animation:fadeUp .25s ease;
        }
        @keyframes fadeUp{ from{opacity:0;transform:translateX(-50%) translateY(10px);} to{opacity:1;transform:translateX(-50%) translateY(0);} }

        /* Voice loader */
        .voice-loader{ position:fixed;inset:0;z-index:150;display:flex;align-items:center;justify-content:center;pointer-events:none; }
        .voice-loader-inner{ background:rgba(15,15,24,0.95);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px 22px;color:#fff;font-size:14px; }

        @media(max-width:600px){
          .kpi-grid{ grid-template-columns:repeat(2,1fr); }
          .charts-row{ flex-direction:column; }
          .drawer{ width:100vw; }
        }
      `}</style>
    </>
  );
};

export default Finanze;

export async function getServerSideProps() {
  return { props: {} };
}
