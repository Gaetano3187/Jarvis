// pages/home.js
import React, { useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { askAssistant } from '@/lib/assistant';
import withAuth from '../hoc/withAuth';
import VoiceRecorder from '../components/VoiceRecorder';

// Icone (react-icons)
import { FaCamera, FaMicrophone, FaSearch } from 'react-icons/fa';

const Home = () => {
  const fileInputRef = useRef(null);

  /* —— OCR —— */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1];
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
        <title>Home - Jarvis Assistant</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Video full-bleed */}
      <video
        className="home-video"
        src="/composizione%201.mp4"
        autoPlay
        muted
        loop
        playsInline
        // iOS
        webkit-playsinline="true"
        // evitare player/controlli
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture
        preload="auto"
        poster="https://play.teleporthq.io/static/svg/videoposter.svg"
      />

      {/* Contenuto sovrapposto */}
      <main className="home-wrap">
        {/* Griglia principale */}
        <section className="sezione-home">
          {/* Colonna sinistra: 2 pulsanti grandi */}
          <div className="col-sinistra">
            <Link href="/liste-prodotti" className="box-home box-grad-green glow-strong">
              <span className="box-title">LISTE PRODOTTI</span>
            </Link>

            <Link href="/finanze" className="box-home box-grad-blue glow-strong">
              <span className="box-title">FINANZE</span>
            </Link>
          </div>

          {/* Colonna destra: Strumenti avanzati (icone) */}
          <div className="col-destra">
            <div className="funzionalita-card">
              <h2 className="funz-title">Strumenti Avanzati</h2>

              <div className="icon-bar">
                {/* OCR */}
                <button
                  className="icon-btn glow-strong"
                  onClick={handleSelectReceipt}
                  aria-label="OCR scontrino"
                  title="OCR scontrino"
                >
                  <FaCamera />
                </button>

                {/* Microfono/voce */}
                <VoiceRecorder
                  buttonClass="icon-btn glow-strong"
                  idleLabel={<FaMicrophone aria-hidden="true" />}
                  recordingLabel={<FaMicrophone aria-hidden="true" />}
                  ariaLabelIdle="Comando vocale"
                  ariaLabelRecording="Stop registrazione"
                  onText={handleVoiceText}
                />

                {/* Interroga dati */}
                <Link
                  href="/dashboard"
                  className="icon-btn glow-strong"
                  aria-label="Interroga dati"
                  title="Interroga dati"
                >
                  <FaSearch />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* input nascosto OCR */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* STILI */}
      <style jsx>{`
        :root {
          --glass-bg: rgba(0, 0, 0, 0.35);   /* trasparenza ridotta */
          --border-glass: rgba(255, 255, 255, 0.12);
          --text: #fff;
        }

        .home-video {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          object-fit: cover;
          pointer-events: none; /* evita tocchi su mobile */
          z-index: -1;
          filter: saturate(1.05) contrast(1.05);
        }

        .home-wrap {
          min-height: 100vh;
          width: 100%;
          display: grid;
          place-items: center;
          padding: 24px;
        }

        .sezione-home {
          width: 100%;
          max-width: 1100px;
          display: grid;
          grid-template-columns: 1fr 0.9fr;
          gap: 16px;
          color: var(--text);
        }

        /* Colonna sinistra: box grandi */
        .col-sinistra {
          display: grid;
          gap: 16px;
        }

        .box-home {
          position: relative;
          display: grid;
          place-items: center;
          height: clamp(140px, 26vw, 240px);
          border-radius: 20px;
          color: #0b1020;
          font-weight: 900;
          letter-spacing: 0.6px;
          text-decoration: none;
          border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
          overflow: hidden;
          isolation: isolate;
          transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
          animation: shimmer 6s linear infinite;
        }
        .box-home:hover { transform: translateY(-2px) scale(1.01); }

        .box-title {
          font-size: clamp(1.2rem, 3vw, 2rem);
          color: #fff;
          text-shadow: 0 2px 18px rgba(0,0,0,0.35);
          z-index: 2;
        }

        /* Due colori diversi */
        .box-grad-green {
          background: radial-gradient(120% 140% at 20% 10%, #22c55e, transparent 50%),
                      radial-gradient(130% 150% at 90% 80%, #0ea5e9, transparent 60%),
                      linear-gradient(135deg, #0b1224 0%, #0b1224 100%);
        }
        .box-grad-blue {
          background: radial-gradient(120% 140% at 20% 10%, #a855f7, transparent 50%),
                      radial-gradient(130% 150% at 90% 80%, #3b82f6, transparent 60%),
                      linear-gradient(135deg, #0b1224 0%, #0b1224 100%);
        }

        /* Colonna destra: card strumenti */
        .col-destra {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .funzionalita-card {
          background: var(--glass-bg);
          border: 1px solid var(--border-glass);
          border-radius: 16px;
          padding: 16px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 22px rgba(0,0,0,0.35);
        }

        .funz-title {
          margin: 0 0 10px;
          font-size: clamp(1.05rem, 2.4vw, 1.2rem);
          font-weight: 700;
          opacity: .95;
        }

        .icon-bar {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .icon-btn {
          --btn-size: 56px;
          width: var(--btn-size);
          height: var(--btn-size);
          display: grid;
          place-items: center;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.18);
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
          color: #fff;
          cursor: pointer;
          text-decoration: none;
          box-shadow: 0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
          transition: transform .15s ease, box-shadow .2s ease, filter .2s ease;
          font-size: 1.25rem;
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .icon-btn:hover { transform: translateY(-2px); }

        /* Glow/shimmer forte (anche sui grandi) */
        .glow-strong::before {
          content: "";
          position: absolute;
          inset: -20%;
          background: conic-gradient(
            from 0deg,
            rgba(255,255,255,0.08),
            rgba(255,255,255,0.28),
            rgba(255,255,255,0.08)
          );
          filter: blur(18px);
          opacity: 0.65;
          z-index: 1;
          animation: spinGlow 8s linear infinite;
          pointer-events: none;
        }
        .glow-strong::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(120% 80% at -10% 0%, rgba(255,255,255,0.18), transparent 40%),
                      radial-gradient(120% 80% at 120% 100%, rgba(255,255,255,0.15), transparent 40%);
          z-index: 1;
          pointer-events: none;
          mix-blend-mode: screen;
          animation: pulseBloom 2.2s ease-in-out infinite;
        }

        @keyframes spinGlow {
          to { transform: rotate(360deg); }
        }
        @keyframes pulseBloom {
          0%, 100% { opacity: .35; filter: brightness(1); }
          50%      { opacity: .75; filter: brightness(1.35); }
        }
        @keyframes shimmer {
          0%   { filter: brightness(1); }
          50%  { filter: brightness(1.12); }
          100% { filter: brightness(1); }
        }

        /* Responsive */
        @media (max-width: 900px) {
          .sezione-home {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .box-home { height: clamp(120px, 34vw, 200px); }
          .icon-btn { --btn-size: 54px; }
        }
        @media (max-width: 480px) {
          .home-wrap { padding: 18px; }
          .funzionalita-card { padding: 14px; }
          .icon-btn { --btn-size: 52px; font-size: 1.2rem; }
        }
      `}</style>
    </>
  );
};

export default withAuth(Home);
