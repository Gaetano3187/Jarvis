// pages/home.js
import React, { useRef, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';

// Registratore solo client
const VoiceRecorder = dynamic(() => import('../components/VoiceRecorder'), { ssr: false });

// Import dinamico del brain (solo quando serve, lato client)
const getBrain = () => import('@/lib/brainHub');

/* ============================= Helpers base ============================= */

function safeJSONStringify(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch {
    const seen = new WeakSet();
    return JSON.stringify(obj, (k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    }, 2);
  }
}
function fmtEuro(n) {
  if (n == null || isNaN(n)) return '—';
  try { return Number(n).toLocaleString('it-IT', { style:'currency', currency:'EUR' }); }
  catch { return `${n} €`; }
}
function fmtInt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('it-IT');
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return `${Math.round(Number(n))}%`;
}
function pad(s, len) {
  const t = String(s ?? '');
  return t.length >= len ? t.slice(0, len) : (t + ' '.repeat(len - t.length));
}
function smallTable(rows, columns) {
  if (!Array.isArray(rows) || !rows.length) return '(nessun elemento)';
  const colWidths = columns.map(c => Math.max(c.label.length, ...rows.map(r => String(r[c.key] ?? '').length)));
  const header = columns.map((c,i)=>pad(c.label, colWidths[i])).join('  ');
  const sep    = colWidths.map(w => '─'.repeat(w)).join('  ');
  const body   = rows.map(r => columns.map((c,i)=>pad(String(r[c.key] ?? ''), colWidths[i])).join('  ')).join('\n');
  return `${header}\n${sep}\n${body}`;
}
const clampPct = (n) => (n == null || isNaN(n)) ? null : Math.max(0, Math.min(100, Number(n)));

/* ============================= SVG mini-charts ============================= */

function svgDonut(segments, { size = 180, stroke = 16, bg = '#0b0f14' } = {}) {
  // segments: [{label, value, color}]
  const total = segments.reduce((t,s)=>t+(Number(s.value)||0), 0);
  const R = (size/2) - stroke/2;
  const C = size/2;
  const circ = 2 * Math.PI * R;

  let offset = 0;
  const arcs = total > 0
    ? segments.map((s)=> {
        const v = Math.max(0, Number(s.value)||0);
        const dash = (v / total) * circ;
        const arc = `<circle cx="${C}" cy="${C}" r="${R}" fill="none"
          stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${dash} ${circ-dash}"
          stroke-dashoffset="${-offset}" transform="rotate(-90 ${C} ${C})"/>`;
        offset += dash;
        return arc;
      }).join('\n')
    : `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#374151" stroke-width="${stroke}"/>`;

  const legend = segments.map((s,i)=>`
    <g transform="translate(${size+10}, ${14 + i*22})">
      <rect x="0" y="-10" width="14" height="14" rx="2" fill="${s.color}" />
      <text x="22" y="0" fill="#e5eeff" font-size="12">${s.label}: ${fmtInt(s.value)}</text>
    </g>`).join('');

  return `
  <svg viewBox="0 0 ${size+160} ${size}" width="100%" height="auto" style="background:${bg}; border:1px solid #1f2a38; border-radius:12px">
    <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#1f2a38" stroke-width="${stroke}"/>
    ${arcs}
    ${legend}
  </svg>`;
}

function svgBars(items, { max = 100, unit = '%', bg = '#0b0f14' } = {}) {
  // items: [{label, value}] (max 10)
  const rows = items.slice(0, 10);
  const W = 460, H = 18 * rows.length + 24;
  const barW = 320;
  const svgRows = rows.map((r, i) => {
    const v = Math.max(0, Math.min(max, Number(r.value)||0));
    const w = (v / max) * barW;
    const y = 16 + i * 18;
    return `
      <text x="8" y="${y}" fill="#cdeafe" font-size="12">${r.label}</text>
      <rect x="160" y="${y-10}" width="${barW}" height="12" fill="#111827" rx="3" />
      <rect x="160" y="${y-10}" width="${w}" height="12" fill="#3b82f6" rx="3" />
      <text x="${160 + barW + 8}" y="${y}" fill="#cdeafe" font-size="12">${unit === '%' ? fmtPct(v) : fmtEuro(v)}</text>`;
  }).join('\n');

  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" style="background:${bg}; border:1px solid #1f2a38; border-radius:12px">
    ${svgRows}
  </svg>`;
}

/* ============================= Intent & normalizzazione ============================= */

function looksLikeSommelierIntent(text='') {
  const s = text.toLowerCase();
  if (/\b(sommelier|carta (dei )?vini|mi consigli|consigliami|tra questi|da questa carta)\b/.test(s)) return true;
  if (/\b(vino|barolo|nebbiolo|chianti|amarone|rosso|bianco|ros[ée]?)\b/.test(s) &&
      /\b(corposo|tannico|non troppo tannico|fresco|minerale|fruttato|profumato|aspro|setoso)\b/.test(s)) return true;
  return false;
}
const normalizeQueryForUI = (q) => q?.trim() || 'Consigliami il migliore in base al mio gusto';

// Unifica risposte { ok, result }, payload diretto, array
function unwrapResult(res) {
  if (res == null) return null;
  if (typeof res === 'object' && 'result' in res) return res.result;
  if (Array.isArray(res)) return { kind: 'array', items: res };
  return res;
}

/* ============================= Pretty-printer risposte ============================= */

function prettyAnswer(result) {
  // normalizza
  let r = unwrapResult(result);

  // inferisci "kind" se assente
  if (r && !r.kind && r.elenco && (r.summary || r.ok || r.total)) {
    r = { kind: 'inventory.snapshot', ...r };
  }
  if (r && !r.kind && r.intervallo && (r.categorie || r.top_negozi)) {
    r = { kind: 'finances.month_summary', ...r };
  }

  // scalari
  if (r == null || ['string','number','boolean'].includes(typeof r)) {
    return { text: String(r ?? 'Nessun risultato.'), blocks: [] };
  }

  // ===== Finanze: riepilogo mese =====
  if (r.kind === 'finances.month_summary') {
    const tot = r.totale ?? r.total ?? 0;
    const topShops = Array.isArray(r.top_negozi) ? r.top_negozi : [];
    const cats = Array.isArray(r.categorie) ? r.categorie : [];

    const t1 = smallTable(
      cats.map(c => ({ categoria: c.categoria || c.name || '—', speso: fmtEuro(c.totale ?? c.amount ?? 0) })),
      [{key:'categoria',label:'Categoria'},{key:'speso',label:'Speso'}]
    );

    const t2 = smallTable(
      topShops.map(s => ({ store: s.store || s.nome || '—', speso: fmtEuro(s.speso ?? s.amount ?? 0) })),
      [{key:'store',label:'Negozio'},{key:'speso',label:'Speso'}]
    );

    const blocks = [];
    if (cats.length) {
      const palette = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a78bfa','#14b8a6','#f472b6'];
      const segs = cats.map((c,i)=>({ label: (c.categoria || c.name || '').slice(0,18) || '—', value: Number(c.totale ?? c.amount ?? 0), color: palette[i % palette.length] }));
      blocks.push({ svg: svgDonut(segs), caption: 'Distribuzione per categoria' });
    }
    if (topShops.length) {
      const items = topShops.map(s => ({ label: (s.store || s.nome || '').slice(0,22) || '—', value: Number(s.speso ?? s.amount ?? 0) }));
      blocks.push({ svg: svgBars(items, { max: Math.max(...items.map(i=>i.value)) || 100, unit:'€' }), caption: 'Top negozi per spesa' });
    }

    const text =
`💸 Spese — ${r.intervallo || 'periodo'}
Totale: ${fmtEuro(tot)} | Transazioni: ${fmtInt(r.transazioni ?? r.count ?? 0)}

Categorie:
${t1}

Top negozi:
${t2}`;
    return { text, blocks };
  }

  // ===== Scorte: snapshot =====
if (r.kind === 'inventory.snapshot') {
  const el = Array.isArray(r.elenco) ? r.elenco : [];
  const rows = el.map(x => ({
    nome: (x.name || x.prodotto || '—').slice(0,28),
    qt: x.qty ?? x.quantita ?? '—',
    u: x.unit || x.uom || '',
    riemp: x.fill_pct != null ? fmtPct(x.fill_pct) : '—',
    stato: x.status || '—'
  }));

  const text =
`📦 Scorte
Totale voci: ${fmtInt(r.summary?.totale ?? el.length)} | In scadenza (<=3gg): ${fmtInt(r.summary?.['in_scadenza_<=3gg'] ?? 0)}

${smallTable(rows.slice(0,20), [
  {key:'nome',label:'Prodotto'},
  {key:'qt',label:'Qt'},
  {key:'u',label:'U'},
  {key:'riemp',label:'Riemp.'},
  {key:'stato',label:'Stato'}
])}${rows.length>20?`\n…(+${rows.length-20})`:''}`;

  const low = el
    .map(x => ({ label: (x.name || x.prodotto || '').slice(0,26) || '—', value: clampPct(x.fill_pct ?? null) }))
    .filter(x => x.value != null)
    .sort((a,b)=>a.value-b.value)
    .slice(0,8);

  const blocks = [];
  if (low.length) {
    blocks.push({ svg: svgBars(low, { max: 100, unit:'%' }), caption: 'Riempimento più basso' });
  }
  return { text, blocks };
}
}


/* ============================= Chat Modal ============================= */

function ChatModal({ open, onClose, onSend, messages, busy }) {
  const [input, setInput] = useState('');
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages, open]);
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose?.(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const doSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await onSend(text);
  };

  if (!open) return null;
  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Chat dati">
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ fontWeight: 800 }}>💬 Interroga dati</div>
          <button onClick={onClose} aria-label="Chiudi" style={S.btnGhost}>✖</button>
        </div>

        <div ref={bodyRef} style={S.body}>
          {messages.length === 0 && (
            <div style={{ opacity: .85 }}>
              Inizia chiedendo: “Quanto ho speso questo mese?” •
              “Che cosa ho a casa?” • “Mi consigli un rosso da questa carta?” (poi premi <b>OCR</b>).
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display:'grid', justifyContent: m.role === 'user' ? 'end' : 'start' }}>
              <div style={S.bubble}>
                {m.mono ? <pre style={S.pre}>{m.text}</pre> : <span>{m.text}</span>}
                {Array.isArray(m.blocks) && m.blocks.map((b, idx) => (
                  <figure key={idx} style={{ margin:'10px 0 0', padding:0 }}>
                    <div style={{ borderRadius:12, overflow:'hidden' }} dangerouslySetInnerHTML={{ __html: b.svg }} />
                    {b.caption && <figcaption style={{ color:'#cdeafe', fontSize:12, opacity:.9, marginTop:4 }}>{b.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={S.inputRow}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Scrivi la tua domanda e premi Invio…"
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => !busy && ev.key === 'Enter' && doSend()}
            disabled={busy}
            style={S.input}
          />
          <button onClick={doSend} disabled={busy} style={S.btnPrimary}>
            {busy ? '⏳' : 'Invia'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================= Home (cervello) ============================= */

const Home = () => {
  const fileInputRef = useRef(null);
  const [queryText, setQueryText] = useState('');
  const [busy, setBusy] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);

  // per OCR smart (carta/scontrino)
  const lastUserIntentRef = useRef({ text:'', sommelier:false });
  const wineListsRef = useRef([]); // buffer carta (multi-foto)

  // ==== bridge verso brain ====
  async function doOCR_Receipt(payload) {
    const { ingestOCRLocal } = await getBrain();
    return ingestOCRLocal(payload); // deve già smistare e aggiornare DB (scorte, finanze)
  }
  async function doVoice_Generic(spokenText) {
    const { ingestSpokenLocal } = await getBrain();
    return ingestSpokenLocal(spokenText);
  }
  async function runBrainQuery(text, opts={}) {
    const { runQueryFromTextLocal } = await getBrain();
    return runQueryFromTextLocal(text, opts);
  }

  // ==== Sommelier da Home (riusa /api/sommelier) ====
  async function runSommelierFromHome(userQuery, extra={}) {
    const payload = {
      query: normalizeQueryForUI(userQuery),
      wineLists: wineListsRef.current.slice(),
      wineList: wineListsRef.current.join('\n'), // compat vecchie API
      qrLinks: extra.qrLinks || []
    };
    const r = await fetch('/api/sommelier', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    return r.json();
  }
  function renderSommelierInChat(result) {
    const recs = Array.isArray(result?.recommendations) ? result.recommendations : [];
    if (!recs.length) return 'Nessun risultato dalla carta. Prova a fotografare meglio o a cambiare richiesta.';

    const byBand = recs.reduce((acc, r) => {
      const k = r.price_band || 'mix';
      (acc[k] ||= []).push(r);
      return acc;
    }, {});
    let out = `🍷 Sommelier — fonte: ${result?.source || '—'}\n`;
    for (const band of Object.keys(byBand)) {
      out += `\n[${band.toUpperCase()}]\n`;
      byBand[band].slice(0,6).forEach((r)=>{
        const price = r.typical_price_eur!=null ? ` ~${fmtEuro(r.typical_price_eur)}` : '';
        out += `• ${r.name} — ${r.winery||'—'}${r.denomination?` • ${r.denomination}`:''}${r.region?` • ${r.region}`:''}${price}\n   ${r.why||''}\n`;
      });
    }
    out += `\nApri: /prodotti-tipici-vini`;
    return out;
  }

  // ==== OCR smart (carta o scontrino) ====
  async function handleSmartOCR(files) {
    const wantSommelier =
      lastUserIntentRef.current.sommelier ||
      looksLikeSommelierIntent(queryText);

    setChatOpen(true);

    if (wantSommelier) {
      try {
        setBusy(true);
        // OCR della carta (multi immagini)
        let any = false;
        for (const f of files) {
          const fd = new FormData(); fd.append('images', f, f.name || 'card.jpg');
          const r = await fetch('/api/ocr', { method:'POST', body: fd });
          const j = await r.json();
          const text = (j?.text || '').trim();
          if (text) { wineListsRef.current.push(text); any = true; }
        }
        if (!any) {
          setChatMsgs(arr => [...arr, { role:'assistant', text: '❌ OCR: nessun testo riconosciuto dalla carta.' }]);
          return;
        }
        setChatMsgs(arr => [...arr, { role:'assistant', text: '📄 Carta acquisita. Avvio il Sommelier…' }]);

        const q = lastUserIntentRef.current.text || queryText || '';
        const result = await runSommelierFromHome(q);
        const text = renderSommelierInChat(result);
        setChatMsgs(arr => [...arr, { role:'assistant', text, mono:true }]);
      } catch (err) {
        setChatMsgs(arr => [...arr, { role:'assistant', text: `❌ Errore Sommelier: ${err?.message || err}` }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    // OCR scontrino → smistamento / aggiornamento (scorte/finanze)
    try {
      setBusy(true);
      const res = await doOCR_Receipt({ files }); // il brain salva e può restituire info
      const payload = unwrapResult(res);
      const pretty = prettyAnswer(payload ?? 'OCR eseguito');

      // Se il brain segnala pagina di pertinenza, mostra link rapido
      const redirectHint = res?.redirect
        ? `\nApri: ${res.redirect}`
        : (payload?.redirect ? `\nApri: ${payload.redirect}` : '');

      setChatMsgs(arr => [
        ...arr,
        { role:'assistant', text: `${pretty.text}${redirectHint}`, mono:true, blocks: pretty.blocks }
      ]);
    } catch (err) {
      setChatMsgs(arr => [...arr, { role:'assistant', text: `❌ Errore OCR: ${err?.message || err}` }]);
    } finally {
      setBusy(false);
    }
  }

  // ==== Voce ====
  async function handleVoiceText(spoken) {
    const text = String(spoken||'').trim();
    if (!text || busy) return;
    setChatOpen(true);
    setChatMsgs(arr => [...arr, { role:'user', text }]);

    lastUserIntentRef.current = { text, sommelier: looksLikeSommelierIntent(text) };

    if (lastUserIntentRef.current.sommelier) {
      setChatMsgs(arr => [
        ...arr,
        { role:'assistant', text: '📷 Per consigli mirati, premi **OCR** e fotografa la **carta dei vini**. Poi analizzerò la carta in base alla tua richiesta.' }
      ]);
      return;
    }

    try {
      setBusy(true);
      const res = await doVoice_Generic(text);
      const pretty = prettyAnswer(res);
      setChatMsgs(arr => [
        ...arr,
        { role:'assistant', text: pretty.text, mono:true, blocks: pretty.blocks },
      ]);
    } catch (err) {
      setChatMsgs(arr => [
        ...arr,
        { role:'assistant', text: `❌ Errore comando vocale: ${err?.message || err}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // ==== OCR input (file) ====
  const handleFileChange = (ev) => {
    const files = Array.from(ev.target.files || []);
    if (!files.length || busy) return;
    (async () => {
      try {
        setBusy(true);
        await handleSmartOCR(files);
      } finally {
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    })();
  };
  const handleSelectOCR = () => { if (!busy) fileInputRef.current?.click(); };

  // ==== Query testo ====
  const submitQuery = async () => {
    const q = queryText.trim();
    if (!q || busy) return;
    setQueryText('');
    setChatOpen(true);
    setChatMsgs(arr => [...arr, { role:'user', text: q }]);

    lastUserIntentRef.current = { text:q, sommelier: looksLikeSommelierIntent(q) };

    if (lastUserIntentRef.current.sommelier) {
      setChatMsgs(arr => [
        ...arr,
        { role:'assistant', text: 'Per favore premi **OCR** e fotografa la **carta dei vini** così ti consiglio al volo dalla lista del locale.' }
      ]);
      return;
    }

    try {
      setBusy(true);
      const res = await runBrainQuery(q, { first: chatMsgs.length === 0 });
      if (res?.redirect) {
        setChatMsgs(arr => [...arr, { role:'assistant', text: `Apri: ${res.redirect}` }]);
        return;
      }
      const pretty = prettyAnswer(res);
      setChatMsgs(arr => [
        ...arr,
        { role:'assistant', text: pretty.text, mono:true, blocks: pretty.blocks },
      ]);
    } catch (err) {
      setChatMsgs(arr => [...arr, { role:'assistant', text: `❌ Errore interrogazione dati: ${err?.message || err}` }]);
    } finally {
      setBusy(false);
    }
  };
  const handleQueryKey = (ev) => { if (ev.key === 'Enter') submitQuery(); };

  return (
    <>
      <Head>
        <title>Home - Jarvis-Assistant</title>
        <meta property="og:title" content="Home - Jarvis-Assistant" />
      </Head>

      {/* Video di sfondo */}
      <video
        className="bg-video"
        src="/composizione%201.mp4"
        autoPlay
        loop
        muted
        playsInline
        controls={false}
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback"
        aria-hidden="true"
      />

      {/* Overlay */}
      <div className="bg-overlay" aria-hidden="true" />

      {/* Contenuto */}
      <main className="home-shell">
        <section className="primary-grid">
          <Link href="/liste-prodotti" className="card-cta card-prodotti animate-card pulse-prodotti sheen">
            <span className="emoji">🛒</span>
            <span className="title">LISTE PRODOTTI</span>
            <span className="hint">Crea e gestisci le tue liste</span>
          </Link>

          <Link href="/finanze" className="card-cta card-finanze animate-card pulse-finanze sheen" style={{ animationDelay: '0.15s' }}>
            <span className="emoji">📊</span>
            <span className="title">FINANZE</span>
            <span className="hint">Entrate, spese e report</span>
          </Link>
        </section>

        {/* Funzionalità Avanzate */}
        <section className="advanced-box">
          <h2>Funzionalità Avanzate</h2>

          {/* Stringa di dialogo */}
          <div className="ask-row">
            <input
              className="query-input"
              type="text"
              placeholder='Chiedi a Jarvis… (es. "Quanto ho speso questo mese?" • "Cosa ho a casa?" • "Mi consigli un vino rosso da questa carta?")'
              value={queryText}
              onChange={(ev)=>setQueryText(ev.target.value)}
              onKeyDown={handleQueryKey}
              disabled={busy}
            />
            <button className="btn-ask" onClick={submitQuery} disabled={busy}>
              {busy ? '⏳' : '💬 Chiedi'}
            </button>
          </div>

          <div className="advanced-actions">
            {/* OCR smart: carta o scontrino */}
            <button className="btn-ocr" onClick={handleSelectOCR} disabled={busy}>
              {busy ? '⏳' : '📷 OCR'}
            </button>

            <VoiceRecorder
              buttonClass="btn-vocale"
              idleLabel="🎤 Comando vocale"
              recordingLabel="⏹ Stop"
              onText={handleVoiceText}
              disabled={busy}
            />

            <Link href="/dashboard" className="btn-manuale">
              🔎 Interroga dati
            </Link>
            <Link href="/prodotti-tipici-vini" className="btn-manuale">
              🍷 Prodotti tipici & Vini
            </Link>
          </div>
        </section>
      </main>

      {/* Input OCR nascosto (multi) */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Chat */}
      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSend={submitQuery}
        messages={chatMsgs}
        busy={busy}
      />

      {/* CSS globale */}
      <style jsx global>{`
        .bg-video {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: -2;
          pointer-events: none;
          background: #000;
        }
        .bg-overlay {
          position: fixed;
          inset: 0;
          z-index: -1;
          background: rgba(0, 0, 0, 0.35);
          pointer-events: none;
        }
        .home-shell {
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto auto;
          align-items: start;
          justify-items: center;
          gap: 1.25rem;
          padding: 2rem 1rem 3rem;
          color: #fff;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        }
        .primary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(240px, 1fr));
          gap: 1rem;
          width: min(1100px, 96vw);
        }
        @media (max-width: 760px) {
          .primary-grid { grid-template-columns: 1fr; }
        }
        .card-cta {
          display: grid;
          align-content: center;
          justify-items: center;
          gap: 0.25rem;
          text-decoration: none;
          color: #fff;
          border-radius: 18px;
          padding: clamp(1.1rem, 3vw, 1.7rem);
          min-height: clamp(130px, 22vw, 220px);
          transition: transform 120ms ease, box-shadow 200ms ease, border-color 200ms ease;
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .card-cta .emoji { font-size: clamp(1.4rem, 4vw, 2rem); line-height: 1; }
        .card-cta .title { font-weight: 800; font-size: clamp(1.1rem, 2.8vw, 1.6rem); }
        .card-cta .hint  { opacity: .85; font-size: clamp(.85rem, 2vw, .95rem); }
        .card-cta:hover { transform: translateY(-2px) scale(1.02); }

        .card-prodotti {
          --tint: 236,72,153;
          background: linear-gradient(145deg, rgba(99,102,241,0.85), rgba(236,72,153,0.85));
          border: 1px solid rgba(236,72,153,0.35);
        }
        .card-finanze {
          --tint: 59,130,246;
          background: linear-gradient(145deg, rgba(6,182,212,0.85), rgba(59,130,246,0.85));
          border: 1px solid rgba(59,130,246,0.35);
        }
        .animate-card { animation: cardGlow 3.2s ease-in-out infinite; }
        .pulse-prodotti { --glowA: 236,72,153;  --glowB: 99,102,241; }
        .pulse-finanze  { --glowA: 59,130,246;  --glowB: 6,182,212; }
        @keyframes cardGlow {
          0%   { box-shadow: 0 0 15px rgba(var(--glowA), 0.4); }
          50%  { box-shadow: 0 0 35px rgba(var(--glowB), 0.85); }
          100% { box-shadow: 0 0 15px rgba(var(--glowA), 0.4); }
        }
        .sheen::before {
          content: "";
          position: absolute;
          inset: -22%;
          border-radius: inherit;
          background:
            linear-gradient(
              75deg,
              rgba(var(--tint), 0.00) 0%,
              rgba(var(--tint), 0.10) 28%,
              rgba(255,255,255, 0.45) 50%,
              rgba(var(--tint), 0.16) 72%,
              rgba(var(--tint), 0.00) 100%
            );
          transform: translateX(-130%) skewX(-12deg);
          filter: blur(0.6px);
          mix-blend-mode: screen;
          pointer-events: none;
          animation: sweepShine 2.8s ease-in-out infinite;
        }
        .card-finanze.sheen::before { animation-delay: .6s; }
        @keyframes sweepShine {
          0%   { transform: translateX(-130%) skewX(-12deg); opacity: .65; }
          60%  { transform: translateX(0%)    skewX(-12deg); opacity: 1; }
          100% { transform: translateX(130%)  skewX(-12deg); opacity: 0; }
        }
        .advanced-box {
          width: min(1100px, 96vw);
          margin-top: .5rem;
          background: rgba(0, 0, 0, 0.55);
          border-radius: 16px;
          padding: 1rem;
        }
        .advanced-actions {
          display: flex;
          flex-wrap: wrap;
          gap: .5rem;
        }
        .ask-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: .5rem;
          margin-bottom: .6rem;
        }
        .query-input {
          width: 100%;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: .55rem;
          padding: .52rem .7rem;
          color: #fff;
          outline: none;
        }
        .query-input::placeholder { color: rgba(255,255,255,0.65); }
        .btn-ask {
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: .55rem;
          padding: .45rem .7rem;
          color: #fff;
          cursor: pointer;
        }
        .btn-vocale, .btn-ocr, .btn-manuale {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: .45rem .7rem;
          border-radius: .55rem;
          cursor: pointer;
          color: #fff;
          text-decoration: none;
        }
        .btn-vocale { background: #6366f1; }
        .btn-ocr { background: #06b6d4; }
        .btn-manuale { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); }
        .btn-vocale:hover, .btn-ocr:hover, .btn-manuale:hover { opacity: .9; }
      `}</style>
    </>
  );
};

/* ============================= Stili inline chat ============================= */

const S = {
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'grid', placeItems:'center', zIndex:9999, backdropFilter:'blur(2px)' },
  modal:{ width:'min(920px, 92vw)', maxHeight:'82vh', background:'rgba(0,0,0,.85)', border:'1px solid rgba(255,255,255,.18)', borderRadius:12, display:'grid', gridTemplateRows:'auto 1fr auto', overflow:'hidden', boxShadow:'0 12px 30px rgba(0,0,0,.45)' },
  header:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'linear-gradient(145deg, rgba(99,102,241,.28), rgba(6,182,212,.22))', borderBottom:'1px solid rgba(255,255,255,.16)' },
  btnGhost:{ background:'transparent', color:'#fff', border:'1px solid rgba(255,255,255,.25)', borderRadius:10, padding:'4px 8px', cursor:'pointer' },
  body:{ padding:'10px 12px', overflow:'auto', display:'grid', gap:8, background:'radial-gradient(1200px 500px at 10% 0%, rgba(236,72,153,.05), transparent 60%), radial-gradient(800px 400px at 100% 100%, rgba(59,130,246,.06), transparent 60%), rgba(0,0,0,.15)' },
  bubble:{ maxWidth:'78ch', whiteSpace:'pre-wrap', wordBreak:'break-word', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.18)', padding:'8px 10px', borderRadius:12, color:'#fff' },
  pre:{ margin:0, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
  inputRow:{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,.16)', background:'rgba(0,0,0,.35)' },
  input:{ width:'100%', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'10px 12px', color:'#fff', outline:'none' },
  btnPrimary:{ background:'#6366f1', border:0, borderRadius:10, padding:'10px 12px', color:'#fff', cursor:'pointer' },
};

export default withAuth(Home);
