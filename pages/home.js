import React, { useRef, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';

/* eslint-disable react/no-danger */

// Registratore solo client
const VoiceRecorder = dynamic(() => import('../components/VoiceRecorder'), { ssr: false });

// Import dinamico del brain (solo quando serve, lato client)
const getBrain = () => import('@/lib/brainHub');

/* ---------- Helpers di formattazione ---------- */
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

/* ---------- SVG charts helpers (inline, no libs) ---------- */
function svgDonut(segments, { size = 180, stroke = 16, bg = '#0b0f14' } = {}) {
  const total = segments.reduce((t,s)=>t+(Number(s.value)||0), 0);
  const R = (size/2) - stroke/2;
  const C = size/2;
  const circ = 2 * Math.PI * R;

  let offset = 0;
  const arcs = total > 0
    ? segments.map((s)=> {
        const v = Math.max(0, Number(s.value)||0);
        const frac = v / total;
        const dash = frac * circ;
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
      <text x="22" y="0" fill="#e5eeff" font-size="12">${s.label}: ${s.value_fmt ?? s.value}</text>
    </g>`).join('');

  return `
  <svg viewBox="0 0 ${size+160} ${size}" width="100%" height="auto" style="background:${bg}; border:1px solid #1f2a38; border-radius:12px">
    <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#1f2a38" stroke-width="${stroke}"/>
    ${arcs}
    ${legend}
  </svg>`;
}
function svgBars(items, { max = null, unit = '', bg = '#0b0f14' } = {}) {
  const rows = items.slice(0, 10);
  const localMax = max ?? Math.max(...rows.map(r => Number(r.value)||0), 1);
  const W = 460, H = 18 * rows.length + 24;
  const barW = 300;
  const svgRows = rows.map((r, i) => {
    const v = Math.max(0, Number(r.value)||0);
    const w = (v / localMax) * barW;
    const y = 16 + i * 18;
    return `
      <text x="8" y="${y}" fill="#cdeafe" font-size="12">${r.label}</text>
      <rect x="160" y="${y-10}" width="${barW}" height="12" fill="#111827" rx="3" />
      <rect x="160" y="${y-10}" width="${w}" height="12" fill="#3b82f6" rx="3" />
      <text x="${160 + barW + 8}" y="${y}" fill="#cdeafe" font-size="12">${unit ? fmtInt(v) + unit : fmtInt(v)}</text>`;
  }).join('\n');

  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" style="background:${bg}; border:1px solid #1f2a38; border-radius:12px">
    ${svgRows}
  </svg>`;
}

/* ---------- Intent Router ---------- */
function looksLikeSommelierIntent(text='') {
  const s = text.toLowerCase();
  if (/\b(sommelier|carta (dei )?vini|mi consigli|consigliami|tra questi|da questa carta)\b/.test(s)) return true;
  if (/\b(vino|barolo|nebbiolo|chianti|amarone|rosso|bianco|ros[ée]?)\b/.test(s) &&
      /\b(corposo|tannico|non troppo tannico|fresco|minerale|fruttato|profumato|aspro|setoso)\b/.test(s)) return true;
  return false;
}
function normalizeQueryForUI(q) {
  return q?.trim() || 'Consigliami il migliore in base al mio gusto';
}

/* ---------- Formatter intelligente risultati + grafici ---------- */
function prettyAnswer(result) {
  if (result == null || ['string','number','boolean'].includes(typeof result)) {
    return { text: String(result ?? 'Nessun risultato.'), blocks: [] };
  }

  if (result.kind === 'finances.month_summary') {
    const r = result;
    const righe = [];
    righe.push(`📅 Intervallo: ${r.intervallo || '—'}`);
    righe.push(`💶 Totale: ${r.totale_fmt || fmtEuro(r.totale)}  •  Transazioni: ${fmtInt(r.transazioni)}`);
    if (Array.isArray(r.top_negozi) && r.top_negozi.length) {
      righe.push('\n🏪 Top negozi:');
      righe.push(
        smallTable(
          r.top_negozi.slice(0, 8).map(x => ({ store: x.store, speso: x.speso_fmt || fmtEuro(x.speso) })),
          [{key:'store', label:'Negozio'}, {key:'speso', label:'Speso'}]
        )
      );
    }
    if (Array.isArray(r.categorie) && r.categorie.length) {
      righe.push('\n📂 Categorie:');
      righe.push(
        smallTable(
          r.categorie.slice(0, 8).map(x => ({ categoria: x.categoria || x.label, speso: x.speso_fmt || fmtEuro(x.speso) })),
          [{key:'categoria', label:'Categoria'}, {key:'speso', label:'Speso'}]
        )
      );
    }
    if (r.note) righe.push(`\n📝 ${r.note}`);

    const blocks = [];
    if (Array.isArray(r.categorie) && r.categorie.length) {
      const palette = ['#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#22c55e','#fde047'];
      const segs = r.categorie.slice(0, 6).map((c,i)=>({
        label: (c.categoria || c.label || '—').slice(0,18),
        value: Number(c.speso)||0,
        value_fmt: c.speso_fmt || fmtEuro(c.speso),
        color: palette[i % palette.length],
      }));
      blocks.push({
        svg: svgDonut(segs, { size: 180 }),
        caption: 'Ripartizione per categoria (prime 6)'
      });
    }
    if (Array.isArray(r.top_negozi) && r.top_negozi.length) {
      const bars = r.top_negozi.slice(0, 8).map(n => ({ label: n.store.slice(0,18), value: Number(n.speso)||0 }));
      blocks.push({
        svg: svgBars(bars, { unit:' €' }),
        caption: 'Top negozi per spesa'
      });
    }

    return { text: righe.join('\n'), blocks };
  }

  if (result.kind === 'inventory.snapshot') {
    const r = result;
    const s = r.summary || {};
    const stati = s.stati || {};
    const righe = [];
    righe.push(`📦 Totale articoli: ${fmtInt(s.totale ?? r.total ?? 0)}`);
    righe.push(`🧭 Stato → LOW: ${fmtInt(stati.low || 0)}  •  MED: ${fmtInt(stati.med || 0)}  •  OK: ${fmtInt(stati.ok || 0)}`);

    if (Array.isArray(r.elenco) && r.elenco.length) {
      righe.push('\n🗒️  Elenco (prime 10 voci):');
      const rows = r.elenco.slice(0,10).map(x => ({
        nome: (x.name || '').slice(0,28),
        qta:  x.qty ?? '—',
        um:   x.unit ?? '',
        fill: (x.fill_pct == null ? '—' : fmtPct(x.fill_pct)),
        st:   x.status || '—'
      }));
      righe.push(
        smallTable(rows, [
          {key:'nome', label:'Prodotto'},
          {key:'qta',  label:'Qtà'},
          {key:'um',   label:'U.M.'},
          {key:'fill', label:'Riemp.'},
          {key:'st',   label:'Stato'}
        ])
      );
    }
    if (r.note) righe.push(`\n📝 ${r.note}`);

    const blocks = [];
    const stateBars = [
      { label:'LOW', value:Number(stati.low)||0 },
      { label:'MED', value:Number(stati.med)||0 },
      { label:'OK',  value:Number(stati.ok)||0 },
    ];
    blocks.push({ svg: svgBars(stateBars, {}), caption:'Distribuzione per stato' });

    const lowList = (r.elenco||[])
      .filter(x => typeof x.fill_pct === 'number')
      .sort((a,b)=>(a.fill_pct)-(b.fill_pct))
      .slice(0,8)
      .map(x => ({ label:(x.name||'').slice(0,18), value: Math.max(0, Math.min(100, x.fill_pct)) }));
    if (lowList.length) {
      blocks.push({ svg: svgBars(lowList, { max:100, unit:'%' }), caption:'Articoli con riempimento più basso' });
    }

    return { text: righe.join('\n'), blocks };
  }

  return { text: safeJSONStringify(result), blocks: [] };
}

/* ---------- Chat Modal (supporta testo, HTML e blocchi grafici) ---------- */
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
              “Che cosa ho a casa?” • “Mi consigli un rosso da questa carta?” (poi premi <strong>OCR</strong>).
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display:'grid', justifyContent: m.role === 'user' ? 'end' : 'start' }}>
              <div style={S.bubble}>
                {m.html
                  ? <div dangerouslySetInnerHTML={{ __html: m.text }} />
                  : (m.mono ? <pre style={S.pre}>{m.text}</pre> : <span>{m.text}</span>)
                }
                {Array.isArray(m.blocks) && m.blocks.map((b, idx) => (
                  <figure key={idx} style={{ margin:'10px 0 0', padding:0 }}>
                    <div
                      style={{ borderRadius:12, overflow:'hidden' }}
                      dangerouslySetInnerHTML={{ __html: b.svg }}
                    />
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

/* ---------- Home: “cervello” ---------- */
const Home = () => {
  const fileInputRef = useRef(null);
  const [queryText, setQueryText] = useState('');
  const [busy, setBusy] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);

  const lastUserIntentRef = useRef({ text:'', sommelier:false });
  const wineListsRef = useRef([]);

  async function doOCR_Receipt(payload) {
    const { ingestOCRLocal } = await getBrain();
    return ingestOCRLocal(payload);
  }
  async function doVoice_Generic(spokenText) {
    const { ingestSpokenLocal } = await getBrain();
    return ingestSpokenLocal(spokenText);
  }
  async function runBrainQuery(text, opts={}) {
    const { runQueryFromTextLocal } = await getBrain();
    return runQueryFromTextLocal(text, opts);
  }

  async function runSommelierFromHome(userQuery, extra={}) {
    const payload = {
      query: normalizeQueryForUI(userQuery),
      wineLists: wineListsRef.current.slice(),
      wineList: wineListsRef.current.join('\n'),
      qrLinks: extra.qrLinks || []
    };
    const r = await fetch('/api/sommelier', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    return j;
  }

  function renderSommelierPlainText(result) {
    const recs = Array.isArray(result?.recommendations) ? result.recommendations : [];
    if (!recs.length) return 'Nessun risultato dalla carta. Fotografa meglio o specifica meglio la richiesta.';
    const byBand = recs.reduce((acc, r) => {
      const k = r.price_band || 'mix';
      if (!acc[k]) acc[k] = [];
      acc[k].push(r);
      return acc;
    }, {});
    const out = ['🍷 Sommelier — fonte: ' + (result?.source || '—')];
    for (const band of Object.keys(byBand)) {
      out.push(`\n${band.toUpperCase()}`);
      byBand[band].slice(0,6).forEach(r=>{
        const price = r.typical_price_eur!=null ? ` ~${fmtEuro(r.typical_price_eur)}` : '';
        out.push(`• ${r.name} — ${r.winery||'—'}${r.denomination?` • ${r.denomination}`:''}${r.region?` • ${r.region}`:''}${price}`);
        if (r.why) out.push(`  ${r.why}`);
      });
    }
    out.push('\nApri: /prodotti-tipici-vini');
    return out.join('\n');
  }

  async function handleSmartOCR(files) {
    const wantSommelier =
      lastUserIntentRef.current.sommelier ||
      looksLikeSommelierIntent(queryText);

    setChatOpen(true);

    if (wantSommelier) {
      try {
        setBusy(true);
        let joined = '';
        for (const f of files) {
          const fd = new FormData(); fd.append('images', f, f.name || 'card.jpg');
          const r = await fetch('/api/ocr', { method:'POST', body: fd });
          const j = await r.json();
          const text = (j?.text || '').trim();
          if (text) {
            wineListsRef.current.push(text);
            joined += (joined ? '\n' : '') + text;
          }
        }
        if (!joined) {
          setChatMsgs(arr => [...arr, { role:'assistant', text: '❌ OCR: nessun testo riconosciuto dalla carta.' }]);
          return;
        }
        setChatMsgs(arr => [...arr, { role:'assistant', text: '📄 Carta acquisita. Avvio il Sommelier…' }]);

        const q = lastUserIntentRef.current.text || queryText || '';
        const result = await runSommelierFromHome(q);
        const plain = renderSommelierPlainText(result);
        setChatMsgs(arr => [...arr, { role:'assistant', text: plain, mono:true }]);
      } catch (err) {
        setChatMsgs(arr => [...arr, { role:'assistant', text: `❌ Errore Sommelier: ${err?.message || err}` }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      setBusy(true);
      const res = await doOCR_Receipt({ files });
      const pretty = prettyAnswer(res?.result ?? 'OCR eseguito');
      setChatMsgs(arr => [...arr, { role:'assistant', text: pretty.text, mono:true, blocks: pretty.blocks }]);
    } catch (err) {
      setChatMsgs(arr => [...arr, { role:'assistant', text: `❌ Errore OCR: ${err?.message || err}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function handleVoiceText(spoken) {
    const text = String(spoken||'').trim();
    if (!text || busy) return;
    setChatOpen(true);
    setChatMsgs(arr => [...arr, { role:'user', text }]);

    lastUserIntentRef.current = { text, sommelier: looksLikeSommelierIntent(text) };

    if (lastUserIntentRef.current.sommelier) {
      setChatMsgs(arr => [
        ...arr,
        { role:'assistant', html:true, text: '📷 Per consigli mirati, premi <b>OCR</b> e fotografa la <b>carta dei vini</b>.' }
      ]);
      return;
    }

    try {
      setBusy(true);
      const res = await doVoice_Generic(text);
      const pretty = prettyAnswer(res?.result ?? '');
      setChatMsgs(arr => [...arr, { role:'assistant', text: pretty.text, mono:true, blocks: pretty.blocks }]);
    } catch (err) {
      setChatMsgs(arr => [...arr, { role:'assistant', text: `❌ Errore comando vocale: ${err?.message || err}` }]);
    } finally {
      setBusy(false);
    }
  }

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
        { role:'assistant', html:true, text: 'Premi <b>OCR</b> e fotografa la <b>carta dei vini</b> per il consiglio dalla lista del locale.' }
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
      if (res?.ok && res?.result !== undefined) {
        const pretty = prettyAnswer(res.result);
        setChatMsgs(arr => [...arr, { role:'assistant', text: pretty.text, mono:true, blocks: pretty.blocks }]);
      } else {
        const dbg = res?.debug ? safeJSONStringify(res.debug) : 'Nessuna risposta.';
        setChatMsgs(arr => [...arr, { role:'assistant', text: dbg, mono: true }]);
      }
    } catch (err) {
      console.error(err);
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

      <div className="bg-overlay" aria-hidden="true" />

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

        <section className="advanced-box">
          <h2>Funzionalità Avanzate</h2>

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

            <Link href="/dashboard" className="btn-manuale">🔎 Interroga dati</Link>
            <Link href="/prodotti-tipici-vini" className="btn-manuale">🍷 Prodotti tipici & Vini</Link>
          </div>
        </section>
      </main>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSend={submitQuery}
        messages={chatMsgs}
        busy={busy}
      />

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

/* ---------- Stili inline per la chat ---------- */
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
