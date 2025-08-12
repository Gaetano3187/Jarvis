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

      {/* Video background */}
      <div className="video-wrap" aria-hidden="true">
        <video
          className="bg-video"
          src="/composizione%201.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          controls={false}
          poster="https://play.teleporthq.io/static/svg/videoposter.svg"
        />
        <div className="video-overlay" />
      </div>

      <main className="home-wrap">
        <div className="home-inner">
          {/* Pulsanti grandi */}
          <section className="primary-grid">
            <Link href="/liste-prodotti" className="card-cta card-prodotti animate-card">
              <span className="emoji">🛒</span>
              <span className="title">LISTE PRODOTTI</span>
              <span className="hint">Crea e gestisci le tue liste</span>
            </Link>

            <Link href="/finanze" className="card-cta card-finanze animate-card" style={{ animationDelay: '0.15s' }}>
              <span className="emoji">📊</span>
              <span className="title">FINANZE</span>
              <span className="hint">Entrate, spese e report</span>
            </Link>
          </section>

          {/* Funzionalità Avanzate */}
          <section className="advanced">
            <h2>Funzionalità avanzate</h2>
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

              <Link href="/dashboard" className="btn-manuale btn-link">
                🔎 Interroga dati
              </Link>
            </div>
          </section>
        </div>
      </main>

      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <style jsx global>{`
        /* VIDEO BG */
        .video-wrap {
          position: fixed;
          inset: 0;
          z-index: -2;
          overflow: hidden;
          background: #000;
        }
        .bg-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          pointer-events: none;
        }
        .video-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
              to bottom,
              rgba(0, 0, 0, 0.35),
              rgba(0, 0, 0, 0.55)
            );
          z-index: -1;
        }

        /* CONTAINER */
        .home-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .home-inner {
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(2px);
          padding: 2rem;
          border-radius: 1rem;
          color: #fff;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
          width: 100%;
          max-width: 1000px;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        /* GRID TOP (2 card grandi) */
        .primary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .card-cta {
          display: grid;
          place-items: center;
          gap: 0.25rem;
          text-align: center;
          text-decoration: none;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 1rem;
          padding: 2.2rem 1rem;
          transition: transform 0.25s ease, box-shadow 0.25s ease, background 0.2s ease;
        }
        .card-cta:hover {
          transform: translateY(-4px) scale(1.03);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
          background: rgba(255, 255, 255, 0.08);
        }
        .card-cta .emoji {
          font-size: 2.4rem;
          line-height: 1;
        }
        .card-cta .title {
          font-size: 1.5rem;
          font-weight: 800;
          letter-spacing: 0.2px;
        }
        .card-cta .hint {
          opacity: 0.9;
          font-size: 0.95rem;
        }
        .card-prodotti {
          box-shadow: 0 10px 24px rgba(99, 102, 241, 0.25);
        }
        .card-finanze {
          box-shadow: 0 10px 24px rgba(34, 197, 94, 0.25);
        }

        /* ANIMAZIONE INGRESSO */
        @keyframes fadeSlideUp {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-card {
          animation: fadeSlideUp 0.5s ease forwards;
        }

        /* AVANZATE */
        .advanced h2 {
          margin: 0 0 0.75rem;
          font-size: 1.15rem;
          opacity: 0.9;
        }
        .advanced-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }

        /* BOTTONI */
        .btn-vocale,
        .btn-ocr,
        .btn-manuale {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          background: #6366f1;
          border: 0;
          padding: 0.45rem 0.7rem;
          border-radius: 0.55rem;
          cursor: pointer;
          color: #fff;
          transition: transform 0.06s ease, opacity 0.12s ease, background 0.2s ease;
          text-decoration: none;
          font-weight: 600;
        }
        .btn-ocr {
          background: #06b6d4;
        }
        .btn-manuale {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .btn-vocale:hover,
        .btn-ocr:hover,
        .btn-manuale:hover {
          transform: translateY(-1px);
          opacity: 0.95;
        }

        @media (max-width: 900px) {
          .primary-grid {
            grid-template-columns: 1fr;
          }
          .card-cta {
            padding: 1.6rem 1rem;
          }
        }
      `}</style>
    </>
  );
};

export default withAuth(Home);
