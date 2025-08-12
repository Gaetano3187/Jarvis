// pages/home.js
import React, { useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { askAssistant } from '@/lib/assistant';
import withAuth from '../hoc/withAuth';
import VoiceRecorder from '../components/VoiceRecorder';

const Home = () => {
  const fileInputRef = useRef(null);

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
          {/* Pulsanti grandi */}
          <div className="top-buttons">
            <Link href="/liste-prodotti" className="big-btn big-prodotti">
              🛒 LISTE PRODOTTI
            </Link>
            <Link href="/finanze" className="big-btn big-finanze">
              📊 FINANZE
            </Link>
          </div>

          {/* Funzionalità Avanzate */}
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

      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        capture="environment"
      />

      <style jsx global>{`
        .home-video {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          object-fit: cover;
          z-index: -1;
          pointer-events: none;
          background: #0f172a;
        }
        .home-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, 0.6);
          padding: 2rem;
        }
        .home-inner {
          background: rgba(0, 0, 0, 0.6);
          padding: 2rem;
          border-radius: 1rem;
          color: #fff;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
          max-width: 800px;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .top-buttons {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .big-btn {
          display: block;
          text-align: center;
          padding: 1.5rem;
          font-size: 1.4rem;
          font-weight: 800;
          border-radius: 0.75rem;
          text-decoration: none;
          transition: transform 0.06s ease, opacity 0.12s ease;
          color: #fff;
        }
        .big-btn:hover {
          transform: translateY(-1px);
          opacity: 0.95;
        }
        .big-prodotti {
          background: rgba(99, 102, 241, 0.25);
          border: 1px solid rgba(99, 102, 241, 0.5);
        }
        .big-finanze {
          background: rgba(6, 182, 212, 0.25);
          border: 1px solid rgba(6, 182, 212, 0.5);
        }
        .funzionalita-box {
          background: rgba(255, 255, 255, 0.06);
          padding: 1rem;
          border-radius: 0.75rem;
        }
        .title {
          margin: 0 0 0.75rem;
          font-size: 1.2rem;
        }
        .btn-vocale,
        .btn-ocr,
        .btn-manuale {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #6366f1;
          border: 0;
          padding: 0.55rem 0.8rem;
          border-radius: 0.55rem;
          cursor: pointer;
          color: #fff;
          transition: transform 0.06s ease, opacity 0.12s ease;
          font-weight: 600;
          margin-right: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .btn-ocr {
          background: #06b6d4;
        }
        .btn-manuale {
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
        @media (max-width: 600px) {
          .big-btn {
            font-size: 1.2rem;
            padding: 1rem;
          }
        }
      `}</style>
    </>
  );
};

export default withAuth(Home);
