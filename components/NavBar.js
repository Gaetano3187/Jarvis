// components/NavBar.js
import Link from 'next/link';
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
      <nav className="nav">
        <div className="inner">
          {/* Brand testuale con glow + ECG */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-glow" aria-hidden="true" />
            <span className="brand-text">JARVIS</span>
            <span className="ecg" aria-hidden="true">
              <svg className="ecg-svg" viewBox="0 0 120 24" preserveAspectRatio="none">
                <polyline
                  className="ecg-line"
                  points="0,12 12,12 18,4 24,20 30,12 48,12 58,6 68,18 78,12 120,12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  pathLength="100"
                />
              </svg>
            </span>
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

      <style jsx>{`
        :root{
          --nav-bg: rgba(2,6,23,.64);     /* leggermente meno trasparente */
          --nav-brd: rgba(255,255,255,.10);
          --text: #f3f4f6;
        }

        .nav{
          position: sticky; top: 0; z-index: 50;
          width: 100%;
          background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.15);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 10px 28px rgba(0,0,0,.28);
        }

        .inner{
          height: 64px;
          display: flex; align-items: center; justify-content: flex-start;
          padding: 0 16px;
          gap: 18px;                      /* più spazio globale */
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;          /* nasconde scrollbar */
        }
        .inner::-webkit-scrollbar{ display: none; }

        /* BRAND */
        .brand{
          position: relative;
          display: inline-flex; align-items: center; gap: 14px;
          padding: 10px 12px 10px 2px;
          text-decoration: none;
          margin-right: 14px;             /* distanzia dal menu */
        }

        /* bagliore morbido che pulsa attorno al brand */
        .brand-glow{
          position: absolute; inset: -12px -18px;
          background:
            radial-gradient(60% 60% at 30% 50%, rgba(34,211,238,.32), transparent 60%),
            radial-gradient(70% 70% at 80% 50%, rgba(167,139,250,.24), transparent 62%);
          filter: blur(14px);
          animation: brandPulse 2.4s ease-in-out infinite;
          pointer-events: none;
        }

        /* testo logo più grande + “c effect” caleidoscopio */
        .brand-text{
          font-weight: 900;
          letter-spacing: .22rem;
          font-size: 1.18rem;            /* leggermente più grande */
          line-height: 1;
          background:
            conic-gradient(from 0deg,
              #22d3ee, #38bdf8, #a78bfa, #e879f9, #22d3ee);
          background-size: 200% 200%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow:
            0 0 22px rgba(56,189,248,.35),
            0 0 36px rgba(167,139,250,.25);
          animation: kaleido 8s linear infinite, glowBreath 3s ease-in-out infinite;
          filter: brightness(1.18);
          white-space: nowrap;
        }

        /* ECG animato a destra del brand */
        .ecg{
          display: inline-flex; align-items: center; justify-content: center;
          width: 72px; height: 18px; overflow: visible;
          opacity: .95;
          filter: drop-shadow(0 0 10px rgba(34,211,238,.6));
        }
        .ecg-svg{ width: 72px; height: 18px; color: #22d3ee; }
        .ecg-line{
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: ecgDraw 2.2s ease-in-out infinite;
        }

        /* LISTA LINK */
        .track{
          display: flex; gap: 12px; list-style: none; margin: 0; padding: 0;
        }
        .item{ white-space: nowrap; }

        .link{
          --c1: #22d3ee; --c2: #38bdf8;
          position: relative; display: inline-grid; place-items: center;
          padding: 10px 16px; border-radius: 12px;
          text-decoration: none; color: var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border: 1px solid transparent;
          isolation: isolate;
        }

        .glow{
          position: absolute; inset: -16px -22px; z-index: 0;
          background:
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c1), #ffffff 14%), transparent 60%),
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c2), #ffffff 12%), transparent 62%);
          filter: blur(18px);
          opacity: 0; transition: opacity .25s ease;
          pointer-events: none;
        }

        .label{
          position: relative; z-index: 1; font-weight: 800; letter-spacing: .02rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow:
            0 0 14px rgba(255,255,255,.12),
            0 0 28px color-mix(in srgb, var(--c2), #fff 10%);
          animation: shimmerText 7s linear infinite;
          filter: brightness(1.2);
        }

        .link:hover{ transform: translateY(-1px); }
        .link:hover .glow{ opacity: .85; }
        .link:hover .label{ animation-duration: 3s; filter: brightness(1.35); }

        .link.is-active{
          background: rgba(255,255,255,.08);
          border-color: rgba(255,255,255,.16);
          box-shadow:
            0 10px 26px rgba(0,0,0,.35),
            0 0 0 1px rgba(255,255,255,.06) inset;
          filter: brightness(1.1);
        }
        .link.is-active .glow{ opacity: 1; filter: brightness(1.15); }
        .link.is-active .label{
          text-shadow:
            0 0 20px color-mix(in srgb, var(--c1), #fff 28%),
            0 0 36px color-mix(in srgb, var(--c2), #fff 22%),
            0 0 56px rgba(255,255,255,.25);
          animation-duration: 2.2s;
          filter: brightness(1.45);
        }

        /* ANIMAZIONI */
        @keyframes shimmerText { to { background-position: -200% center; } }
        @keyframes kaleido { to { background-position: 200% 200%; } }
        @keyframes glowBreath {
          0%,100% { text-shadow: 0 0 18px rgba(56,189,248,.30), 0 0 30px rgba(167,139,250,.22); }
          50%     { text-shadow: 0 0 28px rgba(56,189,248,.55), 0 0 44px rgba(167,139,250,.38); }
        }
        @keyframes brandPulse {
          0%,100% { opacity:.55; transform: scale(1); }
          50%     { opacity:.9;  transform: scale(1.05); }
        }
        @keyframes ecgDraw {
          0%   { stroke-dashoffset: 100; opacity: .2; }
          20%  { opacity: 1; }
          40%  { stroke-dashoffset: 0; }
          60%  { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: -100; opacity: .2; }
        }

        @media (max-width: 520px){
          .inner{ gap: 14px; padding: 0 12px; }
          .brand-text{ font-size: 1.12rem; letter-spacing: .18rem; }
          .ecg{ width: 64px; }
          .ecg-svg{ width: 64px; }
          .track{ gap: 10px; }
          .link{ padding: 9px 14px; }
        }
      `}</style>
    </>
  );
}
