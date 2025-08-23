// components/GlobalStyles.js
import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useRouter } from 'next/router'

/**
 * Global minimal & non-blocking.
 * - Su /login NON carica nulla da CDN.
 * - Fuori dal login carica RemixIcon + AOS in modo asincrono (client-side).
 * - Sfondo e classi HUD applicati sempre.
 */
export default function GlobalStyles({ rootClassName = '' }) {
  const { pathname } = useRouter()
  const isLogin = pathname === '/login'

  // Helper non-bloccanti per caricare assets solo lato client
  useEffect(() => {
    if (isLogin) return

    const loadStylesheet = (href) =>
      new Promise((res, rej) => {
        const l = document.createElement('link')
        l.rel = 'stylesheet'
        l.href = href
        l.onload = res
        l.onerror = rej
        document.head.appendChild(l)
      })

    const loadScript = (src) =>
      new Promise((res, rej) => {
        const s = document.createElement('script')
        s.src = src
        s.defer = true
        s.onload = res
        s.onerror = rej
        document.body.appendChild(s)
      })

    ;(async () => {
      try {
        // RemixIcon (icone vettoriali leggere)
        await loadStylesheet('https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css')

        // AOS (solo dove serve, non su login)
        await loadStylesheet('https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.css')
        await loadScript('https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.js')
        try { window.AOS?.init?.({ once: true, duration: 400, easing: 'ease-out' }) } catch {}
      } catch {
        // se la rete al CDN fallisce, l'app continua a funzionare senza blocchi
      }
    })()
  }, [isLogin])

  // Migliora reattività su SPA
  useEffect(() => {
    if ('scrollRestoration' in history) {
      try { history.scrollRestoration = 'manual' } catch {}
    }
  }, [])

  return (
    <>
      {/* wrapper opzionale per classi HUD, non influisce sul layout */}
      <div className={`hud-bg hud-title hud-button ${rootClassName}`} />

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

        /* Retrocompatibilità se .hud-bg è usata altrove */
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
          font-family: 'Orbitron', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          text-shadow: 0 0 6px rgba(0, 228, 255, 0.6);
          letter-spacing: 0.05em;
        }
        .hud-text {
          font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
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

        /* Riduci carico animazioni su sistemi lenti */
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
        }
      `}</style>
    </>
  )
}

GlobalStyles.propTypes = {
  rootClassName: PropTypes.string,
}
