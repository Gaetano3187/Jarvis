// components/NavBar.js
// VERSIONE MODIFICATA — label visibili su mobile, tasti più grandi

import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { supabase } from '../lib/supabaseClient'

const NAV_ITEMS = [
  { href: '/home',                 label: 'Home',      c1: '#a050ff', c2: '#00dc82',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3l9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/dashboard',            label: 'Dashboard', c1: '#c084fc', c2: '#a050ff',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/></svg> },
  { href: '/liste-prodotti',       label: 'Liste',     c1: '#34d399', c2: '#a3e635',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><line x1="8" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="8" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="8" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="4" cy="6" r="1.3" fill="currentColor"/><circle cx="4" cy="12" r="1.3" fill="currentColor"/><circle cx="4" cy="18" r="1.3" fill="currentColor"/></svg> },
  { href: '/finanze',              label: 'Finanze',   c1: '#60a5fa', c2: '#00dc82',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg> },
  { href: '/spese-casa',           label: 'Casa',      c1: '#38bdf8', c2: '#60a5fa',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3l9 9v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 21v-8h6v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg> },
  { href: '/vestiti-ed-altro',     label: 'Vestiti',   c1: '#f472b6', c2: '#fb7185',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 7l-4-4s-1 2-4 2-4-2-4-2L4 7l3 3v11h10V10l3-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg> },
  { href: '/cene-aperitivi',       label: 'Cene',      c1: '#f59e0b', c2: '#fb923c',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M18 8h1a4 4 0 010 8h-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><line x1="6" y1="2" x2="6" y2="4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="10" y1="2" x2="10" y2="4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="14" y1="2" x2="14" y2="4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg> },
  { href: '/varie',                label: 'Varie',     c1: '#94a3b8', c2: '#d4d4d8',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg> },
  { href: '/prodotti-tipici-vini', label: 'Vini',      c1: '#a050ff', c2: '#00dc82',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M8 2h8l2 7a6 6 0 01-12 0l2-7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="9" y1="21" x2="15" y2="21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg> },
]

export default function NavBar() {
  const { pathname, push } = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    push('/login')
  }

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne+Mono&display=swap" rel="stylesheet" />
      </Head>

      <nav role="navigation" aria-label="Navigazione principale" className="nav">
        <div className="inner">
          <ul role="list" className="track">
            {NAV_ITEMS.map(({ href, label, icon, c1, c2 }) => {
              const active = pathname === href
              return (
                <li key={href} className="item">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`link${active ? ' is-active' : ''}`}
                    style={{ '--c1': c1, '--c2': c2 }}
                    title={label}
                  >
                    {active && <span className="link-glow" style={{ '--c1': c1 }} />}
                    <span className="nav-icon">{icon}</span>
                    <span className="label">{label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <button title="Esci" className="logout-btn" onClick={handleLogout}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span className="logout-label">Esci</span>
          </button>
        </div>
      </nav>

      <style jsx>{`
        .nav {
          position: sticky; top: 0; z-index: 60; width: 100%;
          background: rgba(8,2,18,.45);
          backdrop-filter: blur(20px) saturate(1.3);
          -webkit-backdrop-filter: blur(20px) saturate(1.3);
          border-bottom: 1px solid rgba(160,80,255,.1);
        }
        .inner {
          display: flex; align-items: center; justify-content: center;
          padding: 0 16px; min-height: 66px; position: relative;
          max-width: 1200px; margin: 0 auto;
        }
        .track {
          display: flex; align-items: center; justify-content: center;
          flex-wrap: wrap; gap: 3px; list-style: none; margin: 0; padding: 0;
        }
        .item { flex: 0 0 auto; }
        .link {
          --c1: #a050ff; --c2: #00dc82;
          position: relative; display: inline-flex; flex-direction: column;
          align-items: center; gap: 3px; padding: 8px 10px; border-radius: 12px;
          text-decoration: none; color: rgba(255,255,255,.3);
          border: 1px solid transparent;
          transition: color .2s, border-color .2s, background .2s; overflow: hidden;
        }
        .link:hover { color: rgba(255,255,255,.7); background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.08); }
        .link:hover .nav-icon { transform: translateY(-2px); }
        .nav-icon { display: flex; align-items: center; justify-content: center; transition: transform .2s, filter .2s; }
        .label {
          font-family: "Syne Mono", monospace; font-size: .46rem; font-weight: 400;
          letter-spacing: .12em; text-transform: uppercase; white-space: nowrap;
          line-height: 1; position: relative; z-index: 1;
        }
        .link-glow {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 90% 70% at 50% 130%, color-mix(in srgb, var(--c1) 28%, transparent), transparent 70%);
          animation: glowAnim 2.5s ease-in-out infinite;
        }
        @keyframes glowAnim { 0%,100%{opacity:.5} 50%{opacity:1} }
        .link.is-active {
          background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.1);
          box-shadow: 0 0 16px -5px var(--c1);
        }
        .link.is-active .nav-icon { filter: drop-shadow(0 0 5px var(--c1)) drop-shadow(0 0 2px var(--c2)); color: var(--c1); }
        .link.is-active .label {
          background: linear-gradient(90deg, var(--c1), var(--c2));
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: labelShimmer 2.5s ease-in-out infinite;
        }
        @keyframes labelShimmer { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.45)drop-shadow(0 0 3px var(--c1))} }

        .logout-btn {
          position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 8px 10px; border-radius: 12px; background: transparent;
          border: 1px solid rgba(239,68,68,.18); color: rgba(248,113,113,.4);
          cursor: pointer; transition: all .2s;
        }
        .logout-btn:hover { color: #f87171; border-color: rgba(239,68,68,.5); background: rgba(239,68,68,.07); box-shadow: 0 0 14px -5px rgba(239,68,68,.6); }
        .logout-label { font-family: "Syne Mono",monospace; font-size: .46rem; letter-spacing: .12em; text-transform: uppercase; }

        @media (max-width: 900px) {
          .link { padding: 7px 8px; }
          .logout-btn { padding: 7px 9px; right: 10px; }
        }

        /* ─── MOBILE: label SEMPRE VISIBILI ─── */
        @media (max-width: 640px) {
          .inner { min-height: 62px; padding: 0 6px; }
          .track { gap: 1px; }
          .link {
            padding: 6px 7px;
            flex-direction: column;  /* MANTIENI colonna — icona sopra, label sotto */
            /* RIMOSSO: nessun display:none sulle label */
          }
          .logout-btn { flex-direction: column; right: 4px; padding: 6px 8px; }
          .label { font-size: .40rem; }
          .logout-label { font-size: .40rem; }
          .nav-icon svg { width: 20px; height: 20px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .link-glow, .link.is-active .label { animation: none !important; }
          .link:hover .nav-icon { transform: none; }
        }
      `}</style>
    </>
  )
}