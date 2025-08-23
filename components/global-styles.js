// components/GlobalStyles.js
import React from 'react'
import Head from 'next/head'
import Script from 'next/script'
import PropTypes from 'prop-types'
import { useRouter } from 'next/router'

/**
 * Stili globali HUD + CDN (RemixIcon, AOS opzionale).
 * - Heroicons rimosso (usi lucide-react).
 * - AOS caricato solo se NON sei su /login (lazyOnload).
 * - Background applicato direttamente al body.
 */
export default function GlobalStyles({ rootClassName = '' }) {
  const { pathname } = useRouter()
  const isLogin = pathname === '/login'

  return (
    <>
      <Head>
        {/* Hint rete per CDN */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />

        {/* Remix Icon (leggero) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css"
        />

        {/* AOS CSS solo dove serve (non sul login) */}
        {!isLogin && (
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.css"
          />
        )}
      </Head>

      {/* AOS JS lazy, inizializzato al volo (non sul login) */}
      {!isLogin && (
        <Script
          src="https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.js"
          strategy="lazyOnload"
          onLoad={() => {
            try {
              window.AOS?.init?.({ once: true, duration: 400, easing: 'ease-out' })
            } catch {}
          }}
        />
      )}

      {/* CSS globali */}
      <style jsx global>{`
        html, body, #__next { min-height: 100%; }

        /* ---------- GLOBAL BACKGROUND ---------- */
        body {
          background:
            radial-gradient(circle at 50% 50%, #10131a 0%, #07090c 70%),
            radial-gradient(rgba(0, 228, 255, 0.05) 1px, transparent 1px),
            radial-gradient(rgba(0, 228, 255, 0.05) 1px, transparent 1px);
          background-size: auto, 3px 3px, 7px 7px;
          background-position: 0 0, 0 0, 1px 1px;
          color: #e6e7eb;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* Manteniamo la classe .hud-bg per retrocompatibilità (se usata altrove) */
        .hud-bg {
          background:
            radial-gradient(circle at 50% 50%, #10131a 0%, #07090c 70%),
            radial-gradient(rgba(0, 228, 255, 0.05) 1px, transparent 1px),
            radial-gradient(rgba(0, 228, 255, 0.05) 1px, transparent 1px);
          background-size: auto, 3px 3px, 7px 7px;
          background-position: 0 0, 0 0, 1px 1px;
          color: #e6e7eb;
        }

        /* ---------- TIPOGRAFIA ---------- */
        .hud-title {
          font-family: 'Orbitron', sans-serif;
          text-shadow: 0 0 6px rgba(0, 228, 255, 0.6);
          letter-spacing: 0.05em;
        }
        .hud-text {
          font-family: 'Inter', sans-serif;
        }

        /* ---------- BUTTON ripple ---------- */
        .hud-button { position: relative; overflow: hidden; }
        .hud-button::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          background: rgba(0, 228, 255, 0.4);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          opacity: 0;
          transition: width .4s ease, height .4s ease, opacity .4s ease;
        }
        .hud-button:hover::after { width: 200%; height: 200%; opacity: 0; }

        /* ---------- GLASS CARD hover ---------- */
        .glass-card:hover { box-shadow: 0 0 8px rgba(0, 228, 255, 0.6); }

        /* ---------- VOICE FAB ping ---------- */
        @keyframes ping {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .voice-fab::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(0, 228, 255, 0.6);
          animation: ping 2s infinite;
        }

        /* ---------- ICONE HUD ---------- */
        .icon-hud {
          color: #00e4ff;
          filter: drop-shadow(0 0 4px rgba(0, 228, 255, 0.6));
          transition: transform 0.2s ease;
        }
        .icon-hud:hover { transform: scale(1.15); }
      `}</style>
    </>
  )
}

GlobalStyles.propTypes = {
  rootClassName: PropTypes.string,
}
