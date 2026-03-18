// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

const links = [
  { href: '/home',              label: 'Home',           c1: '#5eead4', c2: '#22d3ee' },
  { href: '/dashboard',         label: 'Dashboard',      c1: '#f0abfc', c2: '#c084fc' },
  { href: '/liste-prodotti',    label: 'Liste',          c1: '#34d399', c2: '#a3e635' },
  { href: '/finanze',           label: 'Finanze',        c1: '#60a5fa', c2: '#0aa39a' },
  { href: '/spese-casa',        label: 'Casa',           c1: '#38bdf8', c2: '#60a5fa' },
  { href: '/vestiti-ed-altro',  label: 'Vestiti',        c1: '#f472b6', c2: '#fb7185' },
  { href: '/cene-aperitivi',    label: 'Cene',           c1: '#f59e0b', c2: '#fb923c' },
  { href: '/varie',             label: 'Varie',          c1: '#94a3b8', c2: '#d4d4d8' },
  { href: '/prodotti-tipici-vini', label: 'Vini',        c1: '#60a5fa', c2: '#22d3ee' },
];

export default function NavBar() {
  const { pathname, push } = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    push('/login');
  };

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        {/* Linea luminosa superiore animata */}
        <div className="nav-scanline" />

        <div className="inner">

          {/* ── LOGO ── */}
          <Link href="/home" className="logoWrap" aria-label="Jarvis Home">
            <div className="logo-ring logo-ring-a" />
            <div className="logo-ring logo-ring-b" />
            <div className="logo-text-wrap">
              <span className="logo-j">J</span><span className="logo-arvis">ARVIS</span>
            </div>
          </Link>

          {/* ── MENU ── */}
          <ul className="track" role="list">
            {links.map(({ href, label, c1, c2 }) => {
              const active = pathname === href;
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
                    <span className="label">{label}</span>
                  </Link>
                </li>
              );
            })}

            {/* ── LOGOUT ── */}
            <li className="item item-logout">
              <button
                onClick={handleLogout}
                className="logout-btn"
                title="Esci"
              >
                <span className="logout-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </span>
                <span className="label">Esci</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <style jsx>{`
        /* ══ NAVBAR ══ */
        .nav {
          position: sticky; top: 0; z-index: 60; width: 100%;
          background:
            linear-gradient(180deg, rgba(0,10,20,.92) 0%, rgba(0,6,15,.88) 100%);
          backdrop-filter: blur(20px) saturate(1.4);
          -webkit-backdrop-filter: blur(20px) saturate(1.4);
          border-bottom: 1px solid rgba(34,211,238,.15);
          box-shadow: 0 1px 0 rgba(34,211,238,.08), 0 8px 32px rgba(0,0,0,.5);
        }

        /* Linea scan animata */
        .nav-scanline {
          position: absolute; top: 0; left: -100%; width: 60%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(34,211,238,.6), transparent);
          animation: scanline 4s linear infinite;
          pointer-events: none;
        }
        @keyframes scanline { to { left: 140%; } }

        .inner {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 14px; padding: 8px 16px; min-height: 60px;
        }

        /* ══ LOGO ══ */
        .logoWrap {
          position: relative; display: flex; align-items: center;
          text-decoration: none; flex: 0 0 auto; isolation: isolate;
          padding: 4px 8px;
        }

        /* Anelli attorno al logo */
        .logo-ring {
          position: absolute; border-radius: 50%; pointer-events: none;
          border: 1px solid rgba(34,211,238,.2);
        }
        .logo-ring-a {
          width: 120px; height: 28px; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          animation: ringPulse 3s ease-in-out infinite;
        }
        .logo-ring-b {
          width: 150px; height: 22px; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          border-color: rgba(34,211,238,.1);
          animation: ringPulse 3s ease-in-out infinite .6s;
        }
        @keyframes ringPulse {
          0%,100% { opacity: .35; transform: translate(-50%,-50%) scaleX(1); }
          50%      { opacity: 1;   transform: translate(-50%,-50%) scaleX(1.05); }
        }

        .logo-text-wrap {
          position: relative; display: flex; align-items: baseline; gap: 0; z-index: 1;
        }
        .logo-j {
          font-family: 'Orbitron', monospace; font-size: 1.55rem; font-weight: 900;
          color: #fff; line-height: 1;
          text-shadow:
            0 0 12px rgba(34,211,238,.9),
            0 0 28px rgba(34,211,238,.6),
            0 0 50px rgba(34,211,238,.3);
          animation: glowJ 2.5s ease-in-out infinite;
        }
        .logo-arvis {
          font-family: 'Orbitron', monospace; font-size: 1.55rem; font-weight: 900;
          background: linear-gradient(90deg, #5eead4, #22d3ee, #38bdf8, #22d3ee, #5eead4);
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: shimmerLogo 3s linear infinite;
          letter-spacing: 2px;
        }
        @keyframes glowJ {
          0%,100% { text-shadow: 0 0 10px rgba(34,211,238,.8), 0 0 24px rgba(34,211,238,.4); }
          50%      { text-shadow: 0 0 22px rgba(34,211,238,1), 0 0 50px rgba(34,211,238,.7), 0 0 80px rgba(56,189,248,.4); }
        }
        @keyframes shimmerLogo { to { background-position: 200% center; } }

        /* ══ MENU TRACK ══ */
        .track {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 4px; list-style: none; margin: 0; padding: 0;
          flex: 1 1 auto; min-width: 200px;
        }
        .item { flex: 0 1 auto; }
        .item-logout { margin-left: auto; }

        /* ── Link normale ── */
        .link {
          --c1: #5eead4; --c2: #22d3ee;
          position: relative; display: inline-flex; align-items: center;
          padding: 7px 13px; border-radius: 8px;
          text-decoration: none; color: rgba(148,163,184,.75);
          border: 1px solid transparent;
          transition: color .18s, border-color .18s, background .18s;
          overflow: hidden;
        }
        .link:hover {
          color: #e2e8f0;
          border-color: rgba(255,255,255,.1);
          background: rgba(255,255,255,.05);
        }

        /* Glow sotto al link attivo */
        .link-glow {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 80% 60% at 50% 120%, color-mix(in srgb, var(--c1) 25%, transparent), transparent 70%);
          animation: glowLink 2s ease-in-out infinite;
        }
        @keyframes glowLink { 0%,100%{opacity:.5} 50%{opacity:1} }

        .label {
          position: relative; z-index: 1;
          font-size: .8rem; font-weight: 700; letter-spacing: .04em;
          white-space: nowrap;
        }

        /* ── Link attivo ── */
        .link.is-active {
          color: transparent;
          background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02));
          border-color: rgba(255,255,255,.15);
          box-shadow: 0 0 16px -4px var(--c1), inset 0 1px 0 rgba(255,255,255,.2);
        }
        .link.is-active .label {
          background: linear-gradient(90deg, var(--c1), var(--c2));
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: activeLabel 2s ease-in-out infinite;
        }
        @keyframes activeLabel {
          0%,100% { filter: brightness(1); }
          50%      { filter: brightness(1.35) drop-shadow(0 0 4px var(--c1)); }
        }

        /* ── Logout ── */
        .logout-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 7px 13px; border-radius: 8px;
          background: transparent;
          border: 1px solid rgba(239,68,68,.3);
          color: rgba(248,113,113,.8);
          cursor: pointer; font-family: inherit; font-size: .8rem; font-weight: 700;
          letter-spacing: .04em;
          transition: color .18s, border-color .18s, background .18s, box-shadow .18s;
        }
        .logout-btn:hover {
          color: #f87171;
          border-color: rgba(239,68,68,.6);
          background: rgba(239,68,68,.08);
          box-shadow: 0 0 12px -4px rgba(239,68,68,.5);
        }
        .logout-icon { display: flex; align-items: center; }

        /* ══ RESPONSIVE ══ */
        @media (max-width: 900px) {
          .inner { gap: 10px; padding: 7px 12px; min-height: 54px; }
          .logo-j, .logo-arvis { font-size: 1.3rem; }
          .link { padding: 6px 10px; }
          .label { font-size: .76rem; }
        }
        @media (max-width: 560px) {
          .track { gap: 3px; }
          .item { flex: 1 1 calc(50% - 3px); }
          .link, .logout-btn { width: 100%; justify-content: center; padding: 9px 8px; }
          .item-logout { margin-left: 0; flex: 1 1 calc(50% - 3px); }
        }
        @media (max-width: 380px) {
          .item { flex: 1 1 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nav-scanline, .logo-ring, .logo-j, .logo-arvis, .link-glow, .link.is-active .label { animation: none !important; }
        }
      `}</style>
    </>
  );
}