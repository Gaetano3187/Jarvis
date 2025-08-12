// components/NavBar.js
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useCallback } from 'react';

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
  const [burst, setBurst] = useState(false);

  const handleBrandClick = useCallback(() => {
    setBurst(true);
    // il burst resta visibile anche se resti sulla stessa pagina
    setTimeout(() => setBurst(false), 700);
  }, []);

  return (
    <>
      <nav className="nav">
        <div className="inner scroll-fade">
          {/* Brand super-luminoso, cliccabile */}
          <Link href="/home" className={`brand ${burst ? 'burst' : ''}`} aria-label="Jarvis Home" onClick={handleBrandClick}>
            <span className="brand-aura" aria-hidden />
            <span className="brand-icon" aria-hidden>
              <span className="brand-ring" />
              <span className="brand-dot" />
            </span>
            <span className="brand-text">
              JARVIS
              <span className="brand-sparkle" aria-hidden />
            </span>
            <span className="brand-underline" aria-hidden />
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
          --nav-bg: rgba(2,6,23,.85);
          --nav-brd: rgba(255,255,255,.16);
          --text: #f8fafc;
        }

        /* SEMPRE IN CIMA: sticky con fondo sfocato, ottimo su mobile */
        .nav{
          position: sticky; top: 0; z-index: 1000; width: 100%;
          background: var(--nav-bg);
          backdrop-filter: blur(14px) saturate(1.15);
          -webkit-backdrop-filter: blur(14px) saturate(1.15);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 10px 28px rgba(0,0,0,.28);
        }

        .inner{
          height: 78px;
          display: flex; align-items: center; gap: 22px;
          padding: 0 20px;
          overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none;
          mask-image: linear-gradient(to right, transparent 0, #000 30px, #000 calc(100% - 30px), transparent 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0, #000 30px, #000 calc(100% - 30px), transparent 100%);
        }
        .inner::-webkit-scrollbar{ display: none; }

        /* BRAND — ultra glow + hue shift + scintilla */
        .brand{
          position: relative;
          display: inline-flex; align-items: center; gap: 14px;
          padding: 10px 12px; text-decoration: none; flex: 0 0 auto;
          isolation: isolate;
          /* rotazione tonalità continua */
          animation: brandHue 16s linear infinite;
        }
        .brand.burst{ filter: brightness(1.25) saturate(1.25); }

        .brand-aura{
          position:absolute; inset:-34px -44px; z-index: 0; pointer-events:none;
          background:
            radial-gradient(55% 55% at 15% 30%, rgba(56,189,248,.55), transparent 60%),
            radial-gradient(60% 60% at 75% 70%, rgba(167,139,250,.45), transparent 62%),
            radial-gradient(50% 50% at 50% 50%, rgba(255,255,255,.35), transparent 62%);
          filter: blur(32px) brightness(1.35) saturate(1.25);
          mix-blend-mode: screen;
          animation: breathe 2.2s ease-in-out infinite;
        }

        .brand-icon{ position: relative; width: 26px; height: 26px; display:grid; place-items:center; z-index: 1; }
        .brand-ring{
          position:absolute; width: 52px; height: 52px; border-radius: 999px; z-index: 0;
          background: conic-gradient(from 0deg, #22d3ee, #38bdf8, #a78bfa, #22d3ee);
          filter: blur(12px) brightness(1.65) saturate(1.35);
          opacity: .95; mix-blend-mode: screen; pointer-events:none;
          animation: rotateAura 4.8s linear infinite;
          -webkit-mask: radial-gradient(circle 14px at center, transparent 12px, #000 13px);
                  mask: radial-gradient(circle 14px at center, transparent 12px, #000 13px);
        }
        .brand-dot{
          width: 16px; height: 16px; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #e0f2fe 8%, #22d3ee 40%, #0ea5e9 70%);
          box-shadow:
            0 0 26px #38bdf8, 0 0 54px rgba(56,189,248,.95), 0 0 84px rgba(167,139,250,.75);
          animation: ping 1.6s ease-in-out infinite;
          filter: brightness(1.5) saturate(1.25);
        }
        .brand.burst .brand-dot{ box-shadow: 0 0 30px #fff, 0 0 90px #8b5cf6; }

        .brand-text{
          position: relative; z-index: 1;
          font-weight: 1000; letter-spacing: .30rem; font-size: 1.2rem;
          background: linear-gradient(
            90deg,
            color-mix(in oklab, #22d3ee, #fff 34%),
            color-mix(in oklab, #38bdf8, #fff 34%),
            color-mix(in oklab, #a78bfa, #fff 34%)
          );
          background-size: 240% auto;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          text-shadow:
            0 0 24px rgba(255,255,255,.9),
            0 0 60px color-mix(in srgb, #38bdf8, #fff 70%),
            0 0 90px color-mix(in srgb, #a78bfa, #fff 65%);
          animation: shimmerText 4.2s linear infinite;
          filter: brightness(1.55) saturate(1.25);
        }

        /* scintilla che attraversa il testo */
        .brand-sparkle{
          position:absolute; inset: 0; pointer-events:none;
          background:
            linear-gradient(115deg, transparent 0 44%, rgba(255,255,255,.95) 50%, transparent 56%),
            linear-gradient(115deg, transparent 0 46%, rgba(56,189,248,.6) 50%, transparent 54%);
          mix-blend-mode: screen;
          filter: blur(2px) brightness(1.8);
          transform: translateX(-120%) skewX(-18deg);
          animation: sparkleSweep 3.2s ease-in-out infinite 0.6s;
        }
        .brand.burst .brand-sparkle{ animation-duration: 1.6s; }

        .brand-underline{
          position:absolute; left:50%; bottom: 6px; transform: translateX(-50%);
          width: 96px; height: 2px; border-radius: 2px;
          background:
            radial-gradient(60% 100% at 50% 50%, rgba(255,255,255,.95), transparent 70%),
            linear-gradient(90deg, #22d3ee, #38bdf8, #a78bfa);
          filter: blur(6px) brightness(1.6);
          mix-blend-mode: screen; pointer-events:none;
          animation: sweep 2.2s ease-in-out infinite;
        }
        .brand.burst .brand-underline{ filter: blur(7px) brightness(1.9); }

        /* LINKS */
        .track{ display: flex; gap: 20px; list-style: none; margin: 0; padding: 0; align-items: center; }
        .item{ white-space: nowrap; }

        .link{
          --c1: #22d3ee; --c2: #38bdf8;
          position: relative; display: inline-grid; place-items: center;
          padding: 12px 18px; border-radius: 16px;
          text-decoration: none; color: var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border: 1px solid rgba(255,255,255,.08);
          isolation: isolate;
        }
        .link::before{
          content: ""; position: absolute; inset: -2px; border-radius: inherit; z-index: 0;
          background:
            conic-gradient(from 0deg,
              color-mix(in oklab, var(--c1), #fff 35%),
              color-mix(in oklab, var(--c2), #fff 35%),
              color-mix(in oklab, var(--c1), #fff 35%)
            );
          filter: blur(18px) saturate(1.3) brightness(1.15);
          opacity: .0; mix-blend-mode: screen;
          transition: opacity .25s ease, filter .25s ease;
          animation: rotateAura 6s linear infinite;
        }
        .glow{
          position: absolute; inset: -18px -26px; z-index: 0;
          background:
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c1), #ffffff 22%), transparent 58%),
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c2), #ffffff 22%), transparent 60%),
            radial-gradient(40% 40% at 10% 20%, rgba(255,255,255,.28), transparent 60%);
          filter: blur(22px) brightness(1.2);
          opacity: .0; transition: opacity .25s ease, filter .25s ease;
          mix-blend-mode: screen; pointer-events: none;
        }
        .label{
          position: relative; z-index: 1; font-weight: 900;
          letter-spacing: .07rem; font-size: 1.14rem;
          background: linear-gradient(90deg,
            color-mix(in oklab, var(--c1), #fff 34%),
            color-mix(in oklab, var(--c2), #fff 34%)
          );
          background-size: 240% auto;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          text-shadow: 0 0 22px rgba(255,255,255,.7),
                       0 0 48px color-mix(in srgb, var(--c2), #fff 48%);
          animation: shimmerText 6s linear infinite;
          filter: brightness(1.28) saturate(1.14);
        }

        .link:hover{
          transform: translateY(-2px) scale(1.01);
          box-shadow:
            0 12px 30px rgba(0,0,0,.40),
            0 0 22px color-mix(in srgb, var(--c1), #fff 40%),
            0 0 36px color-mix(in srgb, var(--c2), #fff 36%);
        }
        .link:hover::before{ opacity: .9; filter: blur(22px) brightness(1.35); }
        .link:hover .glow{ opacity: .95; filter: blur(24px) brightness(1.35); }
        .link:hover .label{ animation-duration: 2.6s; filter: brightness(1.34) saturate(1.18); }

        .link.is-active{
          background: linear-gradient(180deg, rgba(255,255,255,.30), rgba(255,255,255,.14));
          border-color: rgba(255,255,255,.32);
          box-shadow:
            0 16px 38px rgba(0,0,0,.44),
            0 0 32px color-mix(in srgb, var(--c1), #fff 60%),
            0 0 58px color-mix(in srgb, var(--c2), #fff 55%),
            inset 0 1px 0 rgba(255,255,255,.26);
          transform: translateY(-2px);
        }
        .link.is-active::before{
          opacity: 1; filter: blur(26px) brightness(1.6);
          animation-duration: 4.5s;
        }
        .link.is-active .glow{
          opacity: 1; filter: blur(26px) brightness(1.6);
          animation: breathe 1.6s ease-in-out infinite;
        }
        .link.is-active .label{
          text-shadow:
            0 0 28px color-mix(in srgb, var(--c1), #fff 60%),
            0 0 60px color-mix(in srgb, var(--c2), #fff 55%);
          animation-duration: 2s;
          filter: brightness(1.46) saturate(1.26);
        }

        /* Animazioni */
        @keyframes shimmerText { to { background-position: -240% center; } }
        @keyframes ping { 0%,100% { transform: scale(1);   filter: brightness(1.15); }
                          50%     { transform: scale(1.25); filter: brightness(1.45);} }
        @keyframes breathe { 0%,100% { opacity: .9; transform: scale(1); }
                             50%     { opacity: 1;  transform: scale(1.03); } }
        @keyframes rotateAura { to { transform: rotate(360deg); } }
        @keyframes sweep {
          0%,100% { transform: translateX(-50%) scaleX(.95); opacity: .9; }
          50%     { transform: translateX(-50%) scaleX(1.15); opacity: 1;  }
        }
        @keyframes sparkleSweep {
          0%   { transform: translateX(-130%) skewX(-18deg); opacity: .0; }
          25%  { opacity: 1; }
          60%  { transform: translateX(130%)  skewX(-18deg); opacity: .0; }
          100% { transform: translateX(130%)  skewX(-18deg); opacity: .0; }
        }
        @keyframes brandHue { to { filter: hue-rotate(360deg); } }

        /* Mobile: brand centrato, nav leggibile, niente scrollbar orizzontale */
        @media (max-width: 540px){
          .inner{
            height: auto; min-height: 116px;
            justify-content: center; flex-wrap: wrap;
            padding: 12px 12px;
            mask-image: none; -webkit-mask-image: none;
          }
          .scroll-fade::before, .scroll-fade::after{ display: none; }
          .brand{ width: 100%; justify-content: center; order: -1; }
          .track{ width: 100%; justify-content: center; gap: 12px; flex-wrap: wrap; }
          .link{ padding: 10px 16px; border-radius: 14px; }
          .label{ font-size: 1.06rem; }
        }

        @media (prefers-reduced-motion: reduce){
          .brand-ring, .brand-aura, .brand-text, .brand-underline,
          .brand-sparkle, .glow, .link::before, .label, .brand { animation: none !important; }
        }
      `}</style>
    </>
  );
}
