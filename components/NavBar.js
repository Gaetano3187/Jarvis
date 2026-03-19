// components/NavBar.js
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

const links = [
  {
    href: '/home', label: 'Home',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3l9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    c1: '#a050ff', c2: '#00dc82',
  },
  {
    href: '/dashboard', label: 'Dashboard',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/></svg>,
    c1: '#c084fc', c2: '#a050ff',
  },
  {
    href: '/liste-prodotti', label: 'Liste',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="8" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="8" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="8" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/></svg>,
    c1: '#34d399', c2: '#a3e635',
  },
  {
    href: '/finanze', label: 'Finanze',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
    c1: '#60a5fa', c2: '#00dc82',
  },
  {
    href: '/spese-casa', label: 'Casa',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3l9 9v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 21v-8h6v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
    c1: '#38bdf8', c2: '#60a5fa',
  },
  {
    href: '/vestiti-ed-altro', label: 'Vestiti',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 7l-4-4s-1 2-4 2-4-2-4-2L4 7l3 3v11h10V10l3-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>,
    c1: '#f472b6', c2: '#fb7185',
  },
  {
    href: '/cene-aperitivi', label: 'Cene',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 8h1a4 4 0 010 8h-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><line x1="6" y1="2" x2="6" y2="4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="10" y1="2" x2="10" y2="4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="14" y1="2" x2="14" y2="4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
    c1: '#f59e0b', c2: '#fb923c',
  },
  {
    href: '/varie', label: 'Varie',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
    c1: '#94a3b8', c2: '#d4d4d8',
  },
  {
    href: '/prodotti-tipici-vini', label: 'Vini',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8 2h8l2 7a6 6 0 01-12 0l2-7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><line x1="9" y1="21" x2="15" y2="21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
    c1: '#a050ff', c2: '#00dc82',
  },
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
        <link href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@1,900&family=Syne+Mono&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">

          {/* ── LOGO — solo J con pulsazione ── */}
          <Link href="/home" className="logoWrap" aria-label="Jarvis Home">
            <div className="pulse-ring pr1" />
            <div className="pulse-ring pr2" />
            <div className="pulse-ring pr3" />
            <span className="logo-j">J</span>
          </Link>

          {/* ── MENU con icone ── */}
          <ul className="track" role="list">
            {links.map(({ href, label, icon, c1, c2 }) => {
              const active = pathname === href
              return (
                <li key={href} className="item">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`link ${active ? 'is-active' : ''}`}
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

            {/* ── LOGOUT ── */}
            <li className="item item-logout">
              <button onClick={handleLogout} className="logout-btn" title="Esci">
                <span className="nav-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </span>
                <span className="label">Esci</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <style jsx>{`
        /* ══ NAVBAR — trasparente ══ */
        .nav {
          position: sticky; top: 0; z-index: 60; width: 100%;
          background: rgba(8, 2, 18, 0.55);
          backdrop-filter: blur(18px) saturate(1.3);
          -webkit-backdrop-filter: blur(18px) saturate(1.3);
          border-bottom: 1px solid rgba(160, 80, 255, 0.12);
        }

        .inner {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 10px; padding: 7px 16px; min-height: 56px;
        }

        /* ══ LOGO — J con tre anelli pulsanti ══ */
        .logoWrap {
          position: relative; display: flex; align-items: center;
          justify-content: center; width: 44px; height: 44px;
          text-decoration: none; flex-shrink: 0;
        }

        .pulse-ring {
          position: absolute; border-radius: 50%; border: 1px solid rgba(160, 80, 255, 0.5);
          animation: pRing 2.4s ease-out infinite;
        }
        .pr1 { width: 100%; height: 100%; animation-delay: 0s; }
        .pr2 { width: 100%; height: 100%; animation-delay: 0.8s; border-color: rgba(0, 220, 130, 0.35); }
        .pr3 { width: 100%; height: 100%; animation-delay: 1.6s; border-color: rgba(160, 80, 255, 0.2); }
        @keyframes pRing {
          0%   { transform: scale(0.7); opacity: 0.8; }
          100% { transform: scale(1.7); opacity: 0; }
        }

        .logo-j {
          position: relative; z-index: 1;
          font-family: 'Exo 2', sans-serif; font-style: italic;
          font-size: 1.55rem; font-weight: 900; color: #fff; line-height: 1;
          text-shadow: 0 0 14px rgba(160,80,255,.9), 0 0 32px rgba(160,80,255,.5);
          animation: jGlow 3s ease-in-out infinite;
        }
        @keyframes jGlow {
          0%,100% { text-shadow: 0 0 12px rgba(160,80,255,.8), 0 0 28px rgba(160,80,255,.4); }
          50%      { text-shadow: 0 0 22px rgba(160,80,255,1), 0 0 50px rgba(160,80,255,.7), 0 0 80px rgba(0,220,130,.3); }
        }

        /* ══ MENU ══ */
        .track {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 2px; list-style: none; margin: 0; padding: 0;
          flex: 1 1 auto;
        }
        .item { flex: 0 1 auto; }
        .item-logout { margin-left: auto; }

        /* ── Link ── */
        .link {
          --c1: #a050ff; --c2: #00dc82;
          position: relative; display: inline-flex; align-items: center;
          flex-direction: column; gap: 3px;
          padding: 6px 10px; border-radius: 10px;
          text-decoration: none; color: rgba(255,255,255,.35);
          border: 1px solid transparent;
          transition: color .18s, border-color .18s, background .18s;
          overflow: hidden;
        }
        .link:hover {
          color: rgba(255,255,255,.75);
          background: rgba(255,255,255,.04);
          border-color: rgba(255,255,255,.08);
        }

        .nav-icon {
          display: flex; align-items: center; justify-content: center;
          width: 16px; height: 16px; flex-shrink: 0;
          transition: transform .18s;
        }
        .link:hover .nav-icon { transform: translateY(-1px); }

        .label {
          position: relative; z-index: 1;
          font-family: 'Syne Mono', monospace;
          font-size: .48rem; font-weight: 400; letter-spacing: .1em;
          text-transform: uppercase; white-space: nowrap; line-height: 1;
        }

        /* Glow sotto al link attivo */
        .link-glow {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 80% 70% at 50% 120%, color-mix(in srgb, var(--c1) 22%, transparent), transparent 70%);
          animation: glowLink 2s ease-in-out infinite;
        }
        @keyframes glowLink { 0%,100%{opacity:.5} 50%{opacity:1} }

        /* ── Link attivo ── */
        .link.is-active {
          background: rgba(255,255,255,.05);
          border-color: rgba(255,255,255,.1);
          box-shadow: 0 0 14px -4px var(--c1);
        }
        .link.is-active .nav-icon,
        .link.is-active .label {
          color: transparent;
        }
        .link.is-active .nav-icon {
          color: var(--c1);
          filter: drop-shadow(0 0 4px var(--c1));
        }
        .link.is-active .label {
          background: linear-gradient(90deg, var(--c1), var(--c2));
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: activeLabel 2.5s ease-in-out infinite;
        }
        @keyframes activeLabel {
          0%,100% { filter: brightness(1); }
          50%      { filter: brightness(1.4) drop-shadow(0 0 3px var(--c1)); }
        }

        /* ── Logout ── */
        .logout-btn {
          display: inline-flex; align-items: center; flex-direction: column; gap: 3px;
          padding: 6px 10px; border-radius: 10px;
          background: transparent;
          border: 1px solid rgba(239,68,68,.2);
          color: rgba(248,113,113,.55);
          cursor: pointer; font-family: 'Syne Mono', monospace;
          font-size: .48rem; letter-spacing: .1em; text-transform: uppercase;
          transition: color .18s, border-color .18s, background .18s;
        }
        .logout-btn:hover {
          color: #f87171;
          border-color: rgba(239,68,68,.5);
          background: rgba(239,68,68,.06);
        }

        /* ══ RESPONSIVE ══ */
        @media (max-width: 900px) {
          .inner { gap: 8px; padding: 6px 12px; min-height: 50px; }
          .link, .logout-btn { padding: 5px 8px; }
        }
        @media (max-width: 640px) {
          .label { display: none; }
          .link, .logout-btn { padding: 7px; flex-direction: row; }
          .nav-icon { width: 18px; height: 18px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pulse-ring, .logo-j, .link-glow, .link.is-active .label { animation: none !important; }
        }
      `}</style>
    </>
  )
}