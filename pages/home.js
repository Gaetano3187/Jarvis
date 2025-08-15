import React, { useRef, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link'; import withAuth from '../hoc/withAuth';
import VoiceRecorder from '../components/VoiceRecorder';

 // —— CERVELLO (solo client wrappers)
import { runQueryFromTextLocal, ingestOCRLocal, ingestSpokenLocal } from '@/lib/brainHub';
async function handleOCR(payload) {
  const res = await ingestOCRLocal(payload);
  setChatOpen(true);
  setChatMsgs(arr => [...arr, { role:'assistant', text: formatResult(res?.result ?? 'OCR eseguito') }]);
  return res;


/* ---------- Helper formattazione risultato ---------- */
function formatResult(res) {
  if (!res) return 'Nessun risultato.';
  // Se backend restituisce stringa, usala; altrimenti JSON pretty.
  if (typeof res === 'string') return res;
  try {
    return JSON.stringify(res, null, 2);
  } catch {
    return String(res);
  }
}

/* ---------- Componente Chat Modal ---------- */
function ChatModal({ open, onClose, onSend, messages, busy }) {
  const [input, setInput] = useState('');
  const bodyRef = useRef(null);

  useEffect(() => {
    // scroll in fondo ad ogni nuovo messaggio
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await onSend(text);
  };

  if (!open) return null;
  return (
    <div className="chat-overlay" role="dialog" aria-modal="true" aria-label="Chat dati">
      <div className="chat-modal">
        <div className="chat-header">
          <div className="chat-title">💬 Interroga dati</div>
          <button className="chat-close" onClick={onClose} aria-label="Chiudi">✖</button>
        </div>

        <div className="chat-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="chat-hint">
              Inizia chiedendo: “Quanto ho speso questo mese?” oppure
              “Il prosciutto San Daniele dove l’ho pagato di meno?”.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role === 'user' ? 'me' : 'bot'}`}>
              <div className="bubble">
                {m.mono ? <pre>{m.text}</pre> : <span>{m.text}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="chat-inputrow">
          <input
            type="text"
            className="chat-input"
            placeholder="Scrivi la tua domanda e premi Invio…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={busy}
          />
          <button className="chat-send" onClick={handleSend} disabled={busy}>
            {busy ? '⏳' : 'Invia'}
          </button>
        </div>
      </div>
    </div>
  );
}

const Home = () => {
  const fileInputRef = useRef(null);
  const [queryText, setQueryText] = useState('');
  const [busy, setBusy] = useState(false);
   // —— Wrapper OCR per la Home (usa il brain) ——
  async function handleOCR({ base64 }) {
    const res = await ingestOCRLocal({ base64 });
    // opzionale: apri chat e mostra risposta
    setChatOpen(true);
    setChatMsgs((arr) => [
      ...arr,
      { role: 'assistant', text: formatResult(res?.result ?? 'OCR eseguito') }
    ]);
    return res;
  }

 // —— Wrapper VOCE per la Home (usa il brain) ——
  async function handleVoiceTranscript(spokenText) {
    const res = await ingestSpokenLocal(spokenText);
    // opzionale: apri chat e mostra domanda/risposta
    setChatOpen(true);
    setChatMsgs((arr) => [
     ...arr,
     { role: 'user', text: spokenText },
     { role: 'assistant', text: formatResult(res?.result ?? ''), mono: typeof res?.result !== 'string' }
   ]);
    return res;
  }

  // Stato chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]); // {role:'user'|'assistant', text, mono?}

  /* —— OCR → ingest —— */
  const handleFileChange = (e) => {
     const file = e.target.files?.[0];
  if (!file) return;
 (async () => {
    try {
      setBusy(true);
      await handleOCR({ file }); // ← passa il File, non base64
      alert('✅ Scontrino riconosciuto e registrato');
    } catch (err) {
      console.error(err);
      alert('❌ Errore OCR: ' + (err?.message || err));
   } finally {
     setBusy(false);
     e.target.value = ''; // reset input
   }
 })();

  };
  const handleSelectReceipt = () => fileInputRef.current?.click();

  /* —— VOCE → ingest —— */
  const handleVoiceText = async (spoken) => {
    if (!spoken) return;
    try {
      setBusy(true);
     await handleVoiceTranscript(spoken);
      alert('✅ Spesa registrata correttamente');
    } catch (err) {
      console.error(err);
      alert('❌ Errore registrazione spesa');
    } finally {
      setBusy(false);
    }
  };

  /* —— Invio domanda rapida dalla barra —— */
  const submitQuery = async () => {
    const q = queryText.trim();
    if (!q) return;
    setQueryText('');
    // Apri chat e logga messaggio utente
    setChatOpen(true);
    setChatMsgs((arr) => [...arr, { role: 'user', text: q }]);
    await handleChatSend(q);
  };
  const handleQueryKey = (e) => {
    if (e.key === 'Enter') submitQuery();
  };

  /* —— Invio dalla chat —— */
  const handleChatSend = async (text) => {
    try {
      setBusy(true);
    const res = await runQueryFromTextLocal(text, { first: chatMsgs.length === 0 });
      if (res?.redirect) {
        setChatMsgs((arr) => [
          ...arr,
          { role: 'assistant', text: `Apri: ${res.redirect}` },
        ]);
        // Se preferisci navigare automaticamente:
        // window.location.href = res.redirect;
        return;
      }
      if (res?.ok && res?.result) {
        setChatMsgs((arr) => [
          ...arr,
          { role: 'assistant', text: formatResult(res.result), mono: typeof res.result !== 'string' },
        ]);
      } else {
        // Fallback debug (azione strutturata)
        const dbg = res?.debug ? JSON.stringify(res.debug, null, 2) : 'Nessuna risposta.';
        setChatMsgs((arr) => [
          ...arr,
          { role: 'assistant', text: dbg, mono: true },
        ]);
      }
    } catch (err) {
      console.error(err);
      setChatMsgs((arr) => [
        ...arr,
        { role: 'assistant', text: '❌ Errore interrogazione dati.' },
      ]);
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
          <Link
            href="/liste-prodotti"
            className="card-cta card-prodotti animate-card pulse-prodotti sheen"
          >
            <span className="emoji">🛒</span>
            <span className="title">LISTE PRODOTTI</span>
            <span className="hint">Crea e gestisci le tue liste</span>
          </Link>

        <Link
            href="/finanze"
            className="card-cta card-finanze animate-card pulse-finanze sheen"
            style={{ animationDelay: '0.15s' }}
          >
            <span className="emoji">📊</span>
            <span className="title">FINANZE</span>
            <span className="hint">Entrate, spese e report</span>
          </Link>
        </section>

        {/* Funzionalità Avanzate */}
        <section className="advanced-box">
          <h2>Funzionalità Avanzate</h2>

          {/* —— STRINGA DI DIALOGO —— */}
          <div className="ask-row">
            <input
              className="query-input"
              type="text"
              placeholder="Chiedi a Jarvis… (es. Quanto ho speso questo mese? Dove ho pagato meno il prosciutto San Daniele?)"
              value={queryText}
              onChange={(e)=>setQueryText(e.target.value)}
              onKeyDown={handleQueryKey}
              disabled={busy}
            />
            <button className="btn-ask" onClick={submitQuery} disabled={busy}>
              {busy ? '⏳' : '💬 Chiedi'}
            </button>
          </div>

          <div className="advanced-actions">
            <button className="btn-ocr" onClick={handleSelectReceipt} disabled={busy}>
              {busy ? '⏳' : '📷 OCR Scontrino'}
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
          </div>
        </section>
      </main>

      {/* Input OCR nascosto */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* —— CHAT MODAL —— */}
      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSend={handleChatSend}
        messages={chatMsgs}
        busy={busy}
      />

      <style jsx global>{`
        /* —— Video —— */
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

        /* —— Shell —— */
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

        /* —— Griglia primaria —— */
        .primary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(240px, 1fr));
          gap: 1rem;
          width: min(1100px, 96vw);
        }
        @media (max-width: 760px) {
          .primary-grid { grid-template-columns: 1fr; }
        }

        /* —— Card CTA —— */
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

        /* —— Colori a gradiente + tinta sheen —— */
        .card-prodotti {
          --tint: 236,72,153; /* rosa */
          background: linear-gradient(145deg, rgba(99,102,241,0.85), rgba(236,72,153,0.85));
          border: 1px solid rgba(236,72,153,0.35);
        }
        .card-finanze {
          --tint: 59,130,246; /* blu */
          background: linear-gradient(145deg, rgba(6,182,212,0.85), rgba(59,130,246,0.85));
          border: 1px solid rgba(59,130,246,0.35);
        }

        /* —— Pulsazione bagliore —— */
        .animate-card { animation: cardGlow 3.2s ease-in-out infinite; }
        .pulse-prodotti { --glowA: 236,72,153;  --glowB: 99,102,241; }
        .pulse-finanze  { --glowA: 59,130,246;  --glowB: 6,182,212; }
        @keyframes cardGlow {
          0%   { box-shadow: 0 0 15px rgba(var(--glowA), 0.4); }
          50%  { box-shadow: 0 0 35px rgba(var(--glowB), 0.85); }
          100% { box-shadow: 0 0 15px rgba(var(--glowA), 0.4); }
        }

        /* —— Riflesso sheen colorato —— */
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

        /* —— Funzionalità Avanzate —— */
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

        /* —— Barra domande —— */
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

        /* —— Chat Modal —— */
        .chat-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.55);
          display: grid;
          place-items: center;
          z-index: 9999;
          backdrop-filter: blur(2px);
        }
        .chat-modal {
          width: min(920px, 92vw);
          max-height: 82vh;
          background: rgba(0,0,0,.78);
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 16px;
          display: grid;
          grid-template-rows: auto 1fr auto;
          overflow: hidden;
          box-shadow: 0 12px 30px rgba(0,0,0,.45);
        }
        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: .7rem .9rem;
          background: linear-gradient(145deg, rgba(99,102,241,.28), rgba(6,182,212,.22));
          border-bottom: 1px solid rgba(255,255,255,.16);
        }
        .chat-title { font-weight: 800; color: #fff; }
        .chat-close {
          background: transparent;
          color: #fff;
          border: 1px solid rgba(255,255,255,.25);
          border-radius: 10px;
          padding: .2rem .5rem;
          cursor: pointer;
        }
        .chat-body {
          padding: .8rem .9rem;
          overflow: auto;
          display: grid;
          gap: .6rem;
          background:
            radial-gradient(1200px 500px at 10% 0%, rgba(236,72,153,.05), transparent 60%),
            radial-gradient(800px 400px at 100% 100%, rgba(59,130,246,.06), transparent 60%),
            rgba(0,0,0,.15);
        }
        .chat-hint {
          opacity: .85;
          font-size: .95rem;
          color: #e5e7eb;
        }
        .chat-msg { display: grid; }
        .chat-msg.me { justify-content: end; }
        .chat-msg.bot { justify-content: start; }
        .bubble {
          max-width: 78ch;
          white-space: pre-wrap;
          word-break: break-word;
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.18);
          padding: .55rem .7rem;
          border-radius: 12px;
          color: #fff;
        }
        .chat-msg.me .bubble {
          background: linear-gradient(145deg, rgba(99,102,241,.45), rgba(6,182,212,.38));
          border-color: rgba(255,255,255,.22);
        }
        .chat-inputrow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: .6rem;
          padding: .7rem .9rem;
          border-top: 1px solid rgba(255,255,255,.16);
          background: rgba(0,0,0,.35);
        }
        .chat-input {
          width: 100%;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: .55rem;
          padding: .55rem .7rem;
          color: #fff;
          outline: none;
        }
        .chat-input::placeholder { color: rgba(255,255,255,.65); }
        .chat-send {
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: .55rem;
          padding: .45rem .9rem;
          color: #fff;
          cursor: pointer;
        }

        /* —— Bottoni —— */
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

export default withAuth(Home);
