// components/NavBar.js
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';

const links = [
  { href: '/home',             label: 'Home',           c1: '#22d3ee', c2: '#38bdf8' },
  { href: '/dashboard',        label: 'Dashboard',      c1: '#e879f9', c2: '#8b5cf6' },
  { href: '/liste-prodotti',   label: 'Liste Prodotti', c1: '#10b981', c2: '#84cc16' },
  { href: '/finanze',          label: 'Finanze',        c1: '#3b82f6', c2: '#a78bfa' },
  { href: '/spese-casa',       label: 'Casa',           c1: '#0ea5e9', c2: '#3b82f6' },
  { href: '/vestiti-ed-altro', label: 'Vestiti',        c1: '#ec4899', c2: '#f43f5e' },
  { href: '/cene-aperitivi',   label: 'Cene',           c1: '#f59e0b', c2: '#f97316' },
  { href: '/varie',            label: 'Varie',          c1: '#64748b', c2: '#a1a1aa' },
];

export default function NavBar() {
  const { pathname } = useRouter();

  return (
    <>
      {/* Font display per il brand */}
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Audiowide&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav">
        <div className="inner scroll-fade">
          {/* Brand solo testo con effetto caleidoscopio */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-text">JARVIS</span>
          </Link>

          {/* Links */}
          <ul className="track">
            {links.map(({ href, label, c1, c2 }) => {
              const active = pathname === href;
              return (
                <li key={href} className="item">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`link ${active ? 'is-active' : ''}`}
                    style={{ ['--c1']: c1, ['--c2']: c2 }}
                    title={label}
                  >
                    <span className="glow" />
                    <span className="label">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Non coprire i contenuti */}
      <style jsx global>{`
        :root { --nav-h: 84px; }
        @media (max-width: 540px){ :root { --nav-h: 92px; } }
        body { padding-top: calc(var(--nav-h) + env(safe-area-inset-top, 0px)); }

        /* Variabile animabile per l'angolo del gradiente (kaleidoscopio) */
        @property --ang {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }
      `}</style>

      <style jsx>{`
        :root{
          --nav-bg: rgba(2,6,23,.66);
          --nav-brd: rgba(255,255,255,.12);
          --text: #f8fafc;
        }

        .nav{
          position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
          height: var(--nav-h);
          background: var(--nav-bg);
          backdrop-filter: blur(14px) saturate(1.15);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 10px 28px rgba(0,0,0,.28);
        }

        .inner{
          height: 100%;
          display: flex; align-items: center; gap: 18px;
          padding: 0 16px;
          overflow-x: auto; scrollbar-width: none;
          justify-content: center;          /* centrata anche su mobile */
        }
        .inner::-webkit-scrollbar{ display: none; }

        /* Brand: font distintivo + caleidoscopio */
        .brand{
          display: inline-flex; align-items: center;
          padding: 8px 12px; text-decoration: none;
        }
        .brand-text{
          font-family: 'Audiowide', system-ui, sans-serif;
          font-size: clamp(1.12rem, 2.8vw, 1.34rem);
          letter-spacing: .32rem; font-weight: 900;
          color: transparent;
          background:
            conic-gradient(from var(--ang),
              #ffffff,
              #e879f9,
              #60a5fa,
              #22d3ee,
              #a78bfa,
              #ffffff);
          -webkit-background-clip: text; background-clip: text;
          text-shadow:
            0 0 14px rgba(255,255,255,.55),
            0 0 28px rgba(56,189,248,.45),
            0 0 44px rgba(167,139,250,.45);
          animation:
            kscope 6s linear infinite,
            glowPulse 2.2s ease-in-out infinite;
          will-change: filter;
        }
        @keyframes kscope { to { --ang: 360deg; } }
        @keyframes glowPulse {
          0%,100% { filter: brightness(1.08) saturate(1.05); }
          50%     { filter: brightness(1.35) saturate(1.15); }
        }

        /* Lista link */
        .track{ display:flex; gap: 12px; list-style:none; margin:0; padding:0; }
        .item{ white-space: nowrap; }

        .link{
          --c1: #22d3ee; --c2: #38bdf8;
          position: relative; display: inline-grid; place-items: center;
          padding: 10px 16px; border-radius: 14px;
          text-decoration: none; color: var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border: 1px solid transparent;
          isolation: isolate;
        }
        .glow{
          position: absolute; inset: -14px -22px; z-index: 0;
          background:
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c1), #ffffff 22%), transparent 60%),
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c2), #ffffff 20%), transparent 62%);
          filter: blur(18px);
          opacity: 0; transition: opacity .25s ease;
          pointer-events: none;
        }
        .label{
          position: relative; z-index: 1; font-weight: 800; letter-spacing: .02rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size: 220% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow:
            0 0 12px rgba(255,255,255,.28),
            0 0 18px color-mix(in srgb, var(--c1), #fff 22%);
          animation: shimmerText 6s linear infinite;
        }
        .link:hover{ transform: translateY(-1px); }
        .link:hover .glow{ opacity: .95; }
        .link:hover .label{ animation-duration: 3.2s; filter: brightness(1.18); }
        @keyframes shimmerText { to { background-position: -220% center; } }

        /* Attivo: molto luminoso */
        .link.is-active{
          background: rgba(255,255,255,.12);
          border-color: rgba(255,255,255,.18);
          box-shadow:
            0 10px 26px rgba(0,0,0,.35),
            0 0 0 1px rgba(255,255,255,.10) inset,
            0 0 24px color-mix(in srgb, var(--c1), #fff 38%),
            0 0 58px color-mix(in srgb, var(--c2), #fff 38%),
            0 0 96px rgba(255,255,255,.3);
        }
        .link.is-active .glow{ opacity: 1; }
        .link.is-active .label{
          text-shadow:
            0 0 22px #fff,
            0 0 34px color-mix(in srgb, var(--c1), #fff 45%),
            0 0 48px color-mix(in srgb, var(--c2), #fff 40%);
          animation-duration: 2.2s;
          filter: brightness(1.3);
        }

        @media (max-width: 520px){
          .inner{ gap: 12px; justify-content: center; }
          .brand-text{ font-size: 1.08rem; letter-spacing: .28rem; }
        }
      `}</style>
    </>
  );
}
