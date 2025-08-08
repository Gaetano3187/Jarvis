// pages/finanze.js
import React, { useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'

const categories = [
  {
    href: '/entrate',
    bg: '#16a34a',
    emoji: '💶',
    title: 'Entrate & Saldi',
    subtitle: 'Stipendi, carryover, tasca',
  },
  {
    href: '/spese-casa',
    bg: '#2563eb',
    emoji: '🏠',
    title: 'Spese Casa',
    subtitle: 'Bollette, manutenzioni ecc.',
  },
  {
    href: '/vestiti-ed-altro',
    bg: '#9333ea',
    emoji: '👗',
    title: 'Vestiti ed Altro',
    subtitle: 'Vestiti e accessori',
  },
  {
    href: '/cene-aperitivi',
    bg: '#f97316',
    emoji: '🍽',
    title: 'Cene / Aperitivi',
    subtitle: 'Serate, pranzi, regali',
  },
  {
    href: '/varie',
    bg: '#6b7280',
    emoji: '📁',
    title: 'Varie',
    subtitle: 'Spese non catalogate',
  },
  {
    href: '/spese',
    bg: '#0ea5e9',
    emoji: '📋',
    title: 'Report Spese',
    subtitle: 'Tutte le spese per categoria',
  },
]

const Finanze1 = () => {
  const handleAddManual = useCallback(() => {
    const voce = prompt('Descrizione e importo (es: Enel 45,60)')
    if (voce) console.log('[ADD]', voce)
  }, [])

  const handleOCR = useCallback(() => {
    console.log('[OCR] avvia riconoscimento')
  }, [])

  const handleVoice = useCallback(() => {
    console.log('[VOICE] avvia STT')
  }, [])

  return (
    <>
      <Head>
        <title>Finanze • Jarvis-Assistant</title>
        <meta property="og:title" content="Finanze • Jarvis-Assistant" />
      </Head>

      <div className="finanze1-container1">
        <video
          src="/pagina%20finanze.mp4"
          loop
          muted
          poster="https://play.teleporthq.io/static/svg/videoposter.svg"
          autoPlay
          className="finanze1-video"
        />

        <div className="finanze1-container2">
          <section
            style={{
              padding: '4rem 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '3rem',
              alignItems: 'center',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '2rem',
                justifyContent: 'center',
                width: '100%',
                maxWidth: '1000px',
              }}
            >
              {categories.map((c) => (
                <div
                  key={c.href}
                  style={{
                    flex: '1 1 300px',
                    maxWidth: '450px',
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  <Link
                    href={c.href}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '2rem',
                      background: c.bg,
                      color: '#fff',
                      borderRadius: '1rem',
                      fontSize: '1.5rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      textAlign: 'center',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
                    }}
                  >
                    {c.emoji} {c.title}
                    <br />
                    <span style={{ fontSize: '1rem', fontWeight: 400 }}>
                      {c.subtitle}
                    </span>
                  </Link>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={handleAddManual} className="btn green">
                ➕ Aggiungi
              </button>
              <button onClick={handleOCR} className="btn blue">
                🔍 OCR
              </button>
              <button onClick={handleVoice} className="btn orange">
                🎤 Vocale
              </button>
            </div>
          </section>
        </div>
      </div>

      <style jsx>{`
        .finanze1-container1 {
          width: 100%;
          display: flex;
          min-height: 100vh;
          align-items: center;
          flex-direction: column;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .finanze1-video {
          top: -36px;
          right: -12px;
          width: 100%;
          height: auto;
          position: absolute;
          pointer-events: none;
          z-index: -1;
        }
        .finanze1-container2 {
          top: 14px;
          left: 870px;
          position: absolute;
        }
        .btn {
          padding: 1rem 2rem;
          color: #fff;
          border-radius: 1rem;
          font-size: 1.1rem;
          font-weight: 600;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
          border: 0;
          cursor: pointer;
        }
        .green { background: rgba(34, 197, 94, 0.9); }
        .blue { background: rgba(59, 130, 246, 0.9); }
        .orange { background: rgba(234, 88, 12, 0.9); }

        @media (max-width: 1600px) {
          .finanze1-video {
            top: 0;
            left: 0;
            width: 1600px;
            height: 1006px;
            pointer-events: none;
            z-index: -1;
          }
          .finanze1-container2 {
            top: 20px;
            left: 599px;
            width: auto;
          }
        }
        @media (max-width: 1200px) {
          .finanze1-video { pointer-events: none; z-index: -1; }
          .finanze1-container2 {
            top: 0;
            left: 0;
            right: 0;
            width: 768px;
            margin: auto;
            position: relative;
          }
        }
        @media (max-width: 991px) {
          .finanze1-video { pointer-events: none; z-index: -1; }
          .finanze1-container2 {
            top: 0;
            left: 0;
            right: 0;
            width: 613px;
            margin: auto;
            position: relative;
          }
        }
        @media (max-width: 767px) {
          .finanze1-video { pointer-events: none; z-index: -1; }
          .finanze1-container2 {
            top: 15px;
            left: 140px;
            width: 469px;
            height: 926px;
            position: relative;
          }
        }
        @media (max-width: 479px) {
          .finanze1-video {
            top: -83px;
            left: -131px;
            pointer-events: none;
            z-index: -1;
          }
          .finanze1-container2 {
            top: -32px;
            left: 0;
            right: 0;
            width: auto;
            height: 897px;
            margin: auto;
            align-self: stretch;
            position: relative;
          }
        }
      `}</style>
    </>
  )
}

export default Finanze1
