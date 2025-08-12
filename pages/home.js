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

      {/* Input OCR nascosto */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
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
          .primary-grid {
            grid-template-columns: 1fr;
          }
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
