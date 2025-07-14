// pages/home.js
import React, { useRef } from 'react'
import Head  from 'next/head'
import Link  from 'next/link'

import withAuth            from '../hoc/withAuth'


const Home = () => {
  const fileInputRef = useRef(null)

  /* —— OCR —— */
  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const prompt = `
Analizza l’immagine OCR seguente.
Restituisci solo JSON {descrizione, importo, esercizio, data, categoria}.

IMMAGINE_BASE64:
${base64}`.trim()

      try {
        const { answer } = await askAssistant(prompt)
        console.log('🛈 Assistant OCR:', answer)
      } catch (err) {
        console.error(err)
        alert('Errore OCR/assistant')
      }
    }
    reader.readAsDataURL(file)
  }
  const handleSelectReceipt = () => fileInputRef.current?.click()

  /* —— VOCE (demo) —— */
  const handleVoice = async () => {
    const spoken = prompt('Parla o digita il testo da analizzare:')
    if (!spoken) return

    const prompt = `
Estrai descrizione, importo, data e categoria dal testo seguente.
Restituisci solo JSON.

TESTO:
"${spoken}"`.trim()

    try {
      const { answer } = await askAssistant(prompt)
      console.log('🛈 Assistant voice:', answer)
    } catch (err) {
      console.error(err)
      alert('Errore assistant')
    }
  }

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

            <button className="voice" onClick={handleVoice}>
              🎤 Comando vocale
            </button>

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

      {/* —— CSS —— */}
      <style jsx global>{`
        .home-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .sezione-home {
          position: absolute;
          inset: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 2rem;
          justify-content: center;
          align-items: flex-start;
          padding: 4rem 1rem;
          font-family: Inter, sans-serif;
        }
        .col-sinistra,
        .col-destra {
          flex: 1 1 320px;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .box-home {
          background: #3b82f6;
          color: #fff;
          padding: 2.5rem 2rem;
          border-radius: 1rem;
          text-align: center;
          font-size: 2rem;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
          transition: opacity 0.3s ease;
          text-decoration: none;
        }
        .box-home:hover { opacity: 0.8; }
        .box-prodotti   { background: #22c55e; }

        .funzionalita-box {
          background: rgba(0, 0, 0, 0.6);
          border-radius: 1rem;
          padding: 2rem;
          color: #fff;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
          display: flex;
          flex-direction: column;
          gap: 1rem;
          text-align: center;
        }
        .funzionalita-box h2 {
          font-size: 1.5rem;
          margin: 0 0 0.5rem;
        }

        .funzionalita-box a,
        .funzionalita-box button {
          display: inline-block;
          padding: 0.75rem 1.5rem;
          border-radius: 0.75rem;
          font-weight: 600;
          transition: opacity 0.3s ease;
          font-size: 1rem;
          cursor: pointer;
          border: none;
        }
        .funzionalita-box a:hover,
        .funzionalita-box button:hover { opacity: 0.8; }

        .ocr   { background: #f59e0b; color: #000; }
        .voice { background: #10b981; color: #fff; }
        .query { background: #6366f1; color: #fff; }

        @media (max-width: 480px) {
          .box-home { font-size: 1.3rem; padding: 2rem 1.25rem; }
          .funzionalita-box { padding: 1.5rem; }
          .funzionalita-box a,
          .funzionalita-box button {
            font-size: 0.95rem;
            padding: 0.6rem 1rem;
          }
        }
      `}</style>
    </>
  )
}

export default withAuth(Home)
