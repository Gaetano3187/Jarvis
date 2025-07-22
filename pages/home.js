// pages/home.js
import React, { useRef } from 'react';
import Head  from 'next/head';
import Link  from 'next/link';
import { askAssistant } from '@/lib/assistant';   // ⬅️ import corretto
import withAuth from '../hoc/withAuth';
import VoiceRecorder from '../components/VoiceRecorder'; // ⬅️ nuovo componente

const Home = () => {
  const fileInputRef = useRef(null);

  /* —— OCR —— */
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
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

  /* —— VOCE (nuovo) —— */
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

  /* —— UI —— */
  return (
    <>
      <Head>
        <title>home - Jarvis-Assistant</title>
        <meta property="og:title" content="home - Jarvis-Assistant" />
      </Head>

      {/* video di sfondo */}
      <video
        className="home-video"
        src="/composizione%201.mp4"
        autoPlay
        muted
        loop
        preload="auto"
        poster="https://play.teleporthq.io/static/svg/videoposter.svg"
      />

      {/* griglia */}
      <section className="sezione-home">
        {/* colonna sinistra */}
        <div className="col-sinistra">
          <Link href="/liste-prodotti" className="box-home box-prodotti">
            🛒 LISTE PRODOTTI
          </Link>

          <Link href="/finanze" className="box-home">
            📊 FINANZE
          </Link>
        </div>

        {/* colonna destra */}
        <div className="col-destra">
          <div className="funzionalita-box">
            <h2>Funzionalità Avanzate</h2>

            <button className="ocr" onClick={handleSelectReceipt}>
              📷 OCR Scontrino
            </button>

            {/* microfono reale */}
            <VoiceRecorder
              buttonClass="voice"
              idleLabel="🎤 Comando vocale"
              recordingLabel="⏹ Stop"
              onText={handleVoiceText}
            />

            <Link href="/dashboard" className="query">
              🔎 Interroga dati
            </Link>
          </div>
        </div>
      </section>

      {/* input nascosto OCR */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* —— CSS identico (omesso per brevità) —— */}
    </>
  );
};

export default withAuth(Home);
