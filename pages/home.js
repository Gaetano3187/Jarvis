// pages/home.js
import React, { useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import withAuth from '../hoc/withAuth';
import { askAssistant } from '@/lib/assistant';
import VoiceRecorder from '../components/VoiceRecorder';

const Home = () => {
  const fileInputRef = useRef(null);

  /* —— OCR —— */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result || '').split(',')[1];
      const prompt = `
Analizza l’immagine OCR seguente.
Restituisci solo JSON {descrizione, importo, esercizio, data, categoria}.

IMMAGINE_BASE64:
${base64}`.trim();

      try {
        const { answer } = await askAssistant(prompt);
        console.log('🛈 Assistant OCR:', answer);
      } catch (err) {
        console.error(err);
        alert('Errore OCR/assistant');
      }
    };
    reader.readAsDataURL(file);
  };
  const handleSelectReceipt = () => fileInputRef.current?.click();

  /* —— VOCE —— */
  const handleVoiceText = async (spoken) => {
    if (!spoken) return;

    const prompt = `
Estrai descrizione, importo, data e categoria dal testo seguente.
Restituisci solo JSON.

TESTO:
"${spoken}"`.trim();

    try {
      const { answer } = await askAssistant(prompt);
      console.log('🛈 Assistant voice:', answer);
    } catch (err) {
      console.error(err);
      alert('Errore assistant');
    }
  };

  return (
    <>
      <Head>
        <title>Home - Jarvis-Assistant</title>
        <meta property="og:title" content="Home - Jarvis-Assistant" />
      </Head>

      {/* Video di sfondo full-bleed (non apre media player su mobile) */}
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

      {/* Velo per contrasto */}
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

        {/* Funzionalità avanzate (più piccole, sotto) */}
        <section className="advanced-box">
          <h2>Funzionalità Avanzate</h2>

          <div className="advanced-actions">
            <button className="btn-ocr" onClick={handleSelectReceipt}>
              📷 OCR Scontrino
            </button>

            <VoiceRecorder
              buttonClass="btn-vocale"
              idleLabel="🎤 Comando vocale"
              recordingLabel="⏹ Stop"
              onText={handleVoiceText}
            />

            <Link href="/dashboard" className="btn-manuale">
              🔎 Interroga dati
            </Link>
          </div>
        </section>
      </main>

      {/* input nascosto per OCR */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <style jsx global>{`
        /* —— Video full-bleed —— */
        .bg-video {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: -2;
          pointer-events: none; /* non cattura il tocco */
          background: #000;
        }
        .bg-overlay {
          position: fixed;
          inset: 0;
          z-index: -1;
          background: radial-gradient(1200px 600px at 30% 20%, rgba(99, 102, 241, 0.28), transparent 50%),
                      radial-gradient(1000px 500px at 70% 80%, rgba(6, 182, 212, 0.22), transparent 50%),
                      rgba(0, 0, 0, 0.35); /* velo per migliorare il contrasto */
          pointer-events: none;
        }

        /* —— Shell centrale —— */
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

        /* —— Griglia primaria: due card grandi —— */
        .primary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(240px, 1fr));
          gap: 1rem;
          width: min(1100px, 96vw);
          margin-top: clamp(1rem, 4vw, 2.5rem);
        }
        @media (max-width: 760px) {
          .primary-grid {
            grid-template-columns: 1fr;
            gap: 0.9rem;
          }
        }

        /* —— Card CTA principali —— */
        .card-cta {
          display: grid;
          align-content: center;
          justify-items: center;
          gap: 0.25rem;
          text-decoration: none;
          color: #fff;
          background: rgba(0, 0, 0, 0.55);  /* meno trasparente */
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 18px;
          padding: clamp(1.1rem, 3vw, 1.7rem);
          min-height: clamp(130px, 22vw, 220px);
          box-shadow:
            0 12px 28px rgba(0, 0, 0, 0.35),
            inset 0 0 0 1px rgba(255, 255, 255, 0.04);
          position: relative;
          transition: transform 120ms ease, box-shadow 200ms ease, border-color 200ms ease;
          will-change: transform;
          overflow: hidden;
          isolation: isolate;
        }
        .card-cta .emoji { font-size: clamp(1.4rem, 4vw, 2rem); line-height: 1; opacity: .95; }
        .card-cta .title { font-weight: 800; letter-spacing: .2px; font-size: clamp(1.1rem, 2.8vw, 1.6rem); }
        .card-cta .hint  { opacity: .85; font-size: clamp(.85rem, 2vw, .95rem); }

        .card-cta:hover,
        .card-cta:focus-visible {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.18);
          box-shadow:
            0 16px 40px rgba(0,0,0,.45),
            0 0 0 2px rgba(255,255,255,0.06) inset;
        }

        /* —— Colori & bagliore personalizzati —— */
        .card-prodotti {
          box-shadow:
            0 0 0 0 rgba(99, 102, 241, 0), /* base */
            0 12px 28px rgba(0, 0, 0, 0.35),
            inset 0 0 0 1px rgba(99, 102, 241, 0.16);
        }
        .card-finanze {
          box-shadow:
            0 0 0 0 rgba(6, 182, 212, 0),
            0 12px 28px rgba(0, 0, 0, 0.35),
            inset 0 0 0 1px rgba(6, 182, 212, 0.16);
        }

        /* —— Pulsazione “più forte” graduale —— */
        .animate-card { animation: cardGlow 3.2s ease-in-out infinite; }
        .pulse-prodotti { --glowA: 99,102,241;  --glowB: 139,92,246; }
        .pulse-finanze {  --glowA: 6,182,212;   --glowB: 59,130,246; }

        @keyframes cardGlow {
          0%   { box-shadow: 0 12px 28px rgba(0,0,0,.35), inset 0 0 0 1px rgba(var(--glowA), .16), 0 0 0 0 rgba(var(--glowA), 0); }
          35%  { box-shadow: 0 14px 32px rgba(0,0,0,.38), inset 0 0 0 1px rgba(var(--glowB), .22), 0 0 32px 4px rgba(var(--glowA), .18); }
          52%  { box-shadow: 0 16px 40px rgba(0,0,0,.45), inset 0 0 0 1px rgba(var(--glowB), .28), 0 0 46px 10px rgba(var(--glowB), .26); }
          70%  { box-shadow: 0 14px 34px rgba(0,0,0,.40), inset 0 0 0 1px rgba(var(--glowA), .22), 0 0 34px 6px rgba(var(--glowA), .2); }
          100% { box-shadow: 0 12px 28px rgba(0,0,0,.35), inset 0 0 0 1px rgba(var(--glowA), .16), 0 0 0 0 rgba(var(--glowA), 0); }
        }

        /* —— Riflesso di luce “sheen” —— */
        .sheen::before {
          content: "";
          position: absolute;
          inset: -22%;
          border-radius: inherit;
          background: linear-gradient(
            75deg,
            transparent 0%,
            rgba(255,255,255,0.05) 35%,
            rgba(255,255,255,0.35) 50%,
            rgba(255,255,255,0.06) 65%,
            transparent 100%
          );
          transform: translateX(-130%) skewX(-12deg);
          filter: blur(0.6px);
          mix-blend-mode: screen;
          pointer-events: none;
          animation: sweepShine 2.8s ease-in-out infinite;
        }
        .card-finanze.sheen::before { animation-delay: .6s; }

        @keyframes sweepShine {
          0%   { transform: translateX(-130%) skewX(-12deg); opacity: .6; }
          45%  { opacity: 0; }
          60%  { transform: translateX(0%) skewX(-12deg);   opacity: .98; }
          75%  { transform: translateX(130%) skewX(-12deg); opacity: 0; }
          100% { transform: translateX(130%) skewX(-12deg); opacity: 0; }
        }

        /* —— Box “Funzionalità Avanzate” (più piccolo) —— */
        .advanced-box {
          width: min(1100px, 96vw);
          margin: 0 auto;
          margin-top: .25rem;
          background: rgba(0, 0, 0, 0.55); /* meno trasparente come richiesto */
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 16px;
          padding: 1rem;
          box-shadow: 0 10px 26px rgba(0,0,0,.32), inset 0 0 0 1px rgba(255,255,255,.04);
          backdrop-filter: blur(6px);
        }
        .advanced-box h2 {
          font-size: clamp(1rem, 2.2vw, 1.15rem);
          margin: 0 0 .6rem 0;
          font-weight: 700;
          opacity: .92;
        }
        .advanced-actions {
          display: flex;
          flex-wrap: wrap;
          gap: .5rem;
          align-items: center;
        }

        /* —— Bottoni già usati nelle altre pagine —— */
        .btn-vocale, .btn-ocr, .btn-manuale {
          background: #6366f1;
          border: 0;
          padding: .45rem .7rem;
          border-radius: .55rem;
          cursor: pointer;
          color: #fff;
          transition: transform .06s ease, opacity .12s ease;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn-ocr { background: #06b6d4; }
        .btn-manuale { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); }
        .btn-vocale:hover, .btn-ocr:hover, .btn-manuale:hover {
          transform: translateY(-1px);
          opacity: .95;
        }

        /* — Accessibilità: meno movimento — */
        @media (prefers-reduced-motion: reduce) {
          .animate-card, .sheen::before { animation: none !important; }
        }
      `}</style>
    </>
  );
};

export default withAuth(Home);
