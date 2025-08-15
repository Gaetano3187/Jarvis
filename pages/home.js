// pages/home.js
import React, { useRef, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';

// Carico il registratore SOLO client-side (evita SSR crash)
const VoiceRecorder = dynamic(() => import('../components/VoiceRecorder'), { ssr: false });

// Brain wrappers (solo funzioni, non eseguono nulla a livello modulo)
import { runQueryFromTextLocal, ingestOCRLocal, ingestSpokenLocal } from '@/lib/brainHub';

/* ---------- Helpers ---------- */
function formatResult(res) {
  if (!res) return 'Nessun risultato.';
  if (typeof res === 'string') return res;
  try { return JSON.stringify(res, null, 2); } catch { return String(res); }
}

/* ---------- Chat Modal (senza styled-jsx) ---------- */
function ChatModal({ open, onClose, onSend, messages, busy }) {
  const [input, setInput] = useState('');
  const bodyRef = useRef(null);

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
              Inizia chiedendo: “Quanto ho speso questo mese?” oppure
              “Il prosciutto San Daniele dove l’ho pagato di meno?”.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'grid', justifyContent: m.role === 'user' ? 'end' : 'start' }}>
              <div style={S.bubble}>{m.mono ? <pre style={S.pre}>{m.text}</pre> : <span>{m.text}</span>}</div>
            </div>
          ))}
        </div>

        <div style={S.inputRow}>
          <input
            type="text"
            placeholder="Scrivi la tua domanda e premi Invio…"
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => ev.key === 'Enter' && doSend()}
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

/* ---------- Pagina Home ---------- */
function Home() {
  const fileInputRef = useRef(null);
  const [queryText, setQueryText] = useState('');
  const [busy, setBusy] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);

  // OCR wrapper
  async function handleOCR(payload) {
    const res = await ingestOCRLocal(payload);
    setChatOpen(true);
    setChatMsgs((arr) => [...arr, { role: 'assistant', text: formatResult(res?.result ?? 'OCR eseguito') }]);
    return res;
  }

  // Voce wrapper
  async function handleVoiceTranscript(spokenText) {
    const res = await ingestSpokenLocal(spokenText);
    setChatOpen(true);
    setChatMsgs((arr) => [
      ...arr,
      { role: 'user', text: spokenText },
      { role: 'assistant', text: formatResult(res?.result ?? ''), mono: typeof res?.result !== 'string' }
    ]);
    return res;
  }

  // OCR → ingest
  const handleFileChange = (ev) => {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    (async () => {
      try {
        setBusy(true);
        await handleOCR({ files }); // passa SEMPRE "files"
        alert('✅ Scontrino riconosciuto e registrato');
      } catch (err) {
        console.error(err);
        alert('❌ Errore OCR: ' + (err?.message || err));
      } finally {
        setBusy(false);
        ev.target.value = ''; // reset input
      }
    })();
  };
  const handleSelectReceipt = () => fileInputRef.current?.click();

  // VOCE → ingest
  const handleVoiceText = async (spoken) => {
    if (!spoken) return;
    try {
      setBusy(true);
      await handleVoiceTranscript(spoken);
      alert('✅ Operazione eseguita');
    } catch (err) {
      console.error(err);
      alert('❌ Errore comando vocale: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  // Query rapida
  const submitQuery = async () => {
    const q = queryText.trim();
    if (!q) return;
    setQueryText('');
    setChatOpen(true);
    setChatMsgs((arr) => [...arr, { role: 'user', text: q }]);
    await handleChatSend(q);
  };
  const handleQueryKey = (ev) => { if (ev.key === 'Enter') submitQuery(); };

  // Chat send
  const handleChatSend = async (text) => {
    try {
      setBusy(true);
      const res = await runQueryFromTextLocal(text, { first: chatMsgs.length === 0 });
      if (res?.redirect) {
        setChatMsgs((arr) => [...arr, { role: 'assistant', text: `Apri: ${res.redirect}` }]);
        return;
      }
      if (res?.ok && res?.result) {
        setChatMsgs((arr) => [
          ...arr,
          { role: 'assistant', text: formatResult(res.result), mono: typeof res.result !== 'string' },
        ]);
      } else {
        const dbg = res?.debug ? JSON.stringify(res.debug, null, 2) : 'Nessuna risposta.';
        setChatMsgs((arr) => [...arr, { role: 'assistant', text: dbg, mono: true }]);
      }
    } catch (err) {
      console.error(err);
      setChatMsgs((arr) => [...arr, { role: 'assistant', text: '❌ Errore interrogazione dati.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Home - Jarvis-Assistant</title>
        <meta property="og:title" content="Home - Jarvis-Assistant" />
      </Head>

      {/* Layout minimale per ridurre il rischio SSR */}
      <div style={S.page}>
        <div style={{ display:'flex', gap:12, marginBottom:12, flexWrap:'wrap' }}>
          <Link href="/liste-prodotti" style={S.linkBtn}>🛒 Liste Prodotti</Link>
          <Link href="/finanze" style={S.linkBtn}>📊 Finanze</Link>
          <button onClick={handleSelectReceipt} disabled={busy} style={S.btn}>
            {busy ? '⏳' : '📷 OCR Scontrino'}
          </button>

          {/* VoiceRecorder solo client-side (dynamic ssr:false) */}
          <VoiceRecorder
            buttonClass=""
            idleLabel="🎤 Voce"
            recordingLabel="⏹ Stop"
            onText={handleVoiceText}
            disabled={busy}
          />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
          <input
            type="text"
            placeholder="Chiedi a Jarvis…"
            value={queryText}
            onChange={(ev)=>setQueryText(ev.target.value)}
            onKeyDown={handleQueryKey}
            disabled={busy}
            style={S.input}
          />
          <button onClick={submitQuery} disabled={busy} style={S.btnPrimary}>
            {busy ? '⏳' : '💬 Chiedi'}
          </button>
        </div>
      </div>

      {/* Input OCR nascosto */}
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display:'none' }} />

      {/* Chat */}
      <ChatModal open={chatOpen} onClose={() => setChatOpen(false)} onSend={handleChatSend} messages={chatMsgs} busy={busy} />
    </>
  );
}

/* ---------- Stili inline minimi ---------- */
const S = {
  page: { minHeight:'100vh', background:'#0f172a', color:'#fff', padding:16, fontFamily:'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' },
  linkBtn: { display:'inline-block', padding:'8px 12px', background:'#334155', color:'#fff', borderRadius:8, textDecoration:'none', border:'1px solid rgba(255,255,255,.2)' },
  btn: { padding:'8px 12px', background:'#06b6d4', color:'#0b1220', borderRadius:8, border:0, cursor:'pointer' },
  btnPrimary: { padding:'8px 12px', background:'#6366f1', color:'#fff', borderRadius:8, border:0, cursor:'pointer', whiteSpace:'nowrap' },
  input: { padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'rgba(255,255,255,.08)', color:'#fff' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'grid', placeItems:'center', zIndex:9999 },
  modal: { width:'min(920px, 92vw)', maxHeight:'82vh', background:'rgba(0,0,0,.85)', border:'1px solid rgba(255,255,255,.18)', borderRadius:12, display:'grid', gridTemplateRows:'auto 1fr auto', overflow:'hidden' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,.16)' },
  btnGhost: { background:'transparent', color:'#fff', border:'1px solid rgba(255,255,255,.3)', borderRadius:8, padding:'4px 8px', cursor:'pointer' },
  body: { padding:12, overflow:'auto', display:'grid', gap:8 },
  bubble: { maxWidth:'78ch', whiteSpace:'pre-wrap', wordBreak:'break-word', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.18)', padding:'8px 10px', borderRadius:10 },
  pre: { margin:0, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
  inputRow: { display:'grid', gridTemplateColumns:'1fr auto', gap:8, padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,.16)' }
};

export default withAuth(Home);
