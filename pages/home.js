// pages/home.js
import React, { useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { askAssistant } from '@/lib/assistant';
import withAuth from '../hoc/withAuth';
import VoiceRecorder from '../components/VoiceRecorder';

const Home = () => {
  const fileInputRef = useRef(null);

  /* —— OCR —— */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = String(reader.result).split(',')[1];
        const prompt = `
Analizza l’immagine OCR seguente.
Restituisci solo JSON {descrizione, importo, esercizio, data, categoria}.

IMMAGINE_BASE64:
${base64}`.trim();
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
    try {
      const prompt = `
Estrai descrizione, importo, data e categoria dal testo seguente.
Restituisci solo JSON.

TESTO:
"${spoken}"`.trim();
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
        <meta property="og:title" content="home - Jarvis-Assistant" />
      </Head>

      {/* Video full-screen background */}
      <video
        className="home-video"
        src="/composizione%201.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        controls={false}
        controlsList="nodownload noplaybackrate nofullscreen"
        disablePictureInPicture
        aria-hidden="true"
      />

      <div className="home-wrap">
        <div className="home-inner">
          {/* colonna sinistra */}
          <div className="col">
            <Link href="/liste-prodotti" className="box-home box-prodotti">
              🛒 LISTE PRODOTTI
            </Link>

            <Link href="/finanze" className="box-home">
              📊 FINANZE
            </Link>
          </div>

          {/* colonna destra */}
          <div className="col">
            <div className="funzionalita-box">
              <h2 className="title">Funzionalità Avanzate</h2>

              <button className="btn-ocr" onClick={handleSelectReceipt}>
                📷 OCR Scontrino
              </button>

              <VoiceRecorder
                buttonClass="btn-vocale"
                idleLabel="🎤 Comando vocale"
                recordingLabel="⏹ Stop"
                onText={handleVoiceText}
              />

              <Link href="/dashboard" className="btn-manuale" style={{ textAlign: 'center' }}>
                🔎 Interroga dati
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* input nascosto OCR */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        capture="environment"
      />

      <style jsx global>{`
        /* ——— video full-screen background ——— */
        .home-video {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          object-fit: cover;
          z-index: -1;            /* dietro i contenuti */
          pointer-events: none;   /* evita tap che aprono il player su mobile */
          background: #0f172a;    /* fallback */
        }

        /* ——— wrapper principale, stile coerente con altre pagine ——— */
        .home-wrap {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, 0.6); /* leggero overlay per leggibilità */
          padding: 2rem;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        }
        .home-inner {
          background: rgba(0, 0, 0, 0.6);
          padding: 2rem;
          border-radius: 1rem;
          color: #fff;
          box-shadow: 0 6px 16px rgba(0,0,0,.3);
          max-width: 1000px;
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .title { margin: 0 0 .75rem; font-size: 1.4rem; }

        /* ——— box link principali ——— */
        .box-home {
          display: block;
          width: 100%;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: .75rem;
          padding: 1rem 1.2rem;
          color: #fff;
          text-decoration: none;
          font-weight: 700;
          transition: transform .06s ease, opacity .12s ease, background .2s ease;
          margin-bottom: .75rem;
        }
        .box-home:hover { transform: translateY(-1px); opacity: .96; background: rgba(255,255,255,.08); }
        .box-prodotti { background: rgba(99,102,241,.18); border-color: rgba(99,102,241,.35); }

        /* ——— pannello funzionalità (usa stile pulsanti già in uso) ——— */
        .funzionalita-box {
          background: rgba(255,255,255,.06);
          padding: 1rem;
          border-radius: .75rem;
        }

        /* ——— pulsanti coerenti con altre pagine ——— */
        .btn-vocale, .btn-ocr, .btn-manuale, .btn-danger, .btn-danger-outline {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: .4rem;
          background: #6366f1;
          border: 0;
          padding: .55rem .8rem;
          border-radius: .55rem;
          cursor: pointer;
          color: #fff;
          transition: transform .06s ease, opacity .12s ease;
          text-decoration: none;
          font-weight: 600;
          margin-right: .5rem;
          margin-bottom: .5rem;
        }
        .btn-ocr { background: #06b6d4; }
        .btn-manuale { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.18); }
        .btn-danger { background: #ef4444; }
        .btn-danger-outline { background: transparent; color: #ef4444; border: 1px solid #ef4444; }
        .btn-vocale:hover, .btn-ocr:hover, .btn-manuale:hover, .btn-danger:hover, .btn-danger-outline:hover {
          transform: translateY(-1px); opacity: .95;
        }

        /* ——— responsive ——— */
        @media (max-width: 820px) {
          .home-inner { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
};

export default withAuth(Home);
