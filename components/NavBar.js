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
          {/* Brand testuale con glow + alternanza Equalizer / Idea */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-glow" aria-hidden="true" />
            <span className="brand-text">JARVIS</span>

            {/* contenitore animazioni alternate */}
            <span className="brand-anim" aria-hidden="true">
              {/* EQUALIZER */}
              <span className="eq">
                <span className="bar b1" />
                <span className="bar b2" />
                <span className="bar b3" />
                <span className="bar b4" />
                <span className="bar b5" />
                <span className="bar b6" />
              </span>

              {/* IDEA: testa + lampadina */}
              <span className="idea">
                <svg className="idea-svg" viewBox="0 0 64 64" aria-hidden="true">
                  {/* testa */}
                  <path d="M22 42c-6-4-10-10-10-17 0-9.4 7.6-17 17-17s17 7.6 17 17c0 6-3.2 10.8-8 14v4c0 2.2-1.8 4-4 4h-10c-2.2 0-4-1.8-4-4v-1.5"
                        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  {/* lampadina */}
                  <g className="bulb">
                    <circle cx="46" cy="14" r="6" fill="none" stroke="currentColor" strokeWidth="2"/>
                    <rect x="43" y="20" width="6" height="4" rx="1" fill="currentColor"/>
                  </g>
                  {/* scintille */}
                  <g className="sparks" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="46" y1="2"  x2="46" y2="6"/>
                    <line x1="36" y1="14" x2="40" y2="14"/>
                    <line x1="52" y1="14" x2="56" y2="14"/>
                    <line x1="40" y1="7"  x2="43" y2="10"/>
                    <line x1="49" y1="18" x2="52" y2="21"/>
                  </g>
                </svg>
              </span>
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
                    style={{ '--c1': c1, '--c2': c2 }}
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
          --nav-bg: rgba(2,6,23,.66);
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
          gap: 20px;
          overflow-x: auto; -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .inner::-webkit-scrollbar{ display: none; }

        /* BRAND */
        .brand{
          position: relative;
          display: inline-flex; align-items: center; gap: 16px;
          padding: 10px 12px 10px 2px;
          text-decoration: none;
          margin-right: 18px; /* distanza dal menu */
        }
        .brand-glow{
          position: absolute; inset: -12px -18px;
          background:
            radial-gradient(60% 60% at 30% 50%, rgba(34,211,238,.34), transparent 60%),
            radial-gradient(70% 70% at 80% 50%, rgba(167,139,250,.26), transparent 62%);
          filter: blur(14px);
          animation: brandPulse 2.4s ease-in-out infinite;
          pointer-events: none;
        }
        /* stesso “carattere”/stile di prima, solo un filo più grande */
        .brand-text{
          font-weight: 900;
          letter-spacing: .22rem;
          font-size: 1.2rem;
          line-height: 1;
          background: conic-gradient(from 0deg, #22d3ee, #38bdf8, #a78bfa, #e879f9, #22d3ee);
          background-size: 200% 200%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow: 0 0 22px rgba(56,189,248,.35), 0 0 36px rgba(167,139,250,.25);
          animation: kaleido 8s linear infinite, glowBreath 3s ease-in-out infinite;
          filter: brightness(1.2);
          white-space: nowrap;
        }

        /* CONTENITORE animazioni alternate */
        .brand-anim{
          position: relative;
          width: 96px; height: 22px;
          display: inline-grid; place-items: center;
          margin-left: 2px;
        }

        /* EQUALIZER */
        .eq{
          position: absolute; inset: 0;
          display: grid; grid-auto-flow: column; align-items: end; justify-content: center;
          gap: 4px; opacity: 1;
          color: #22d3ee;
          filter: drop-shadow(0 0 10px rgba(34,211,238,.6));
          animation: eqPhase 5s ease-in-out infinite;
        }
        .bar{
          width: 6px; height: 10px; border-radius: 3px;
          background: currentColor;
          transform-origin: bottom center;
          animation: barHop 1s ease-in-out infinite;
        }
        .b1{ animation-duration: 0.9s; }
        .b2{ animation-duration: 1.1s; animation-delay: .05s; }
        .b3{ animation-duration: 0.95s; animation-delay: .1s; }
        .b4{ animation-duration: 1.05s; animation-delay: .15s; }
        .b5{ animation-duration: 1.2s; animation-delay: .2s; }
        .b6{ animation-duration: 0.85s; animation-delay: .25s; }

        /* IDEA (testa + lampadina) */
        .idea{
          position: absolute; inset: 0;
          display: grid; place-items: center;
          opacity: 0; transform: translateY(2px) scale(.98);
          color: #fbbf24; /* amber */
          animation: ideaPhase 5s ease-in-out infinite;
          filter: drop-shadow(0 0 8px rgba(251,191,36,.55));
        }
        .idea-svg{ width: 64px; height: 64px; }
        .bulb{ animation: bulbGlow 1.8s ease-in-out infinite; transform-origin: center; }
        .sparks{ opacity: .0; animation: sparkFlicker 1.8s ease-in-out infinite; }

        /* MENU LINKS */
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
          position: relative; z-index: 1; font-weight: 800; letter-spacing: .03rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow: 0 0 14px rgba(255,255,255,.14), 0 0 28px color-mix(in srgb, var(--c2), #fff 12%);
          animation: shimmerText 7s linear infinite;
          filter: brightness(1.22);
        }
        .link:hover{ transform: translateY(-1px); }
        .link:hover .glow{ opacity: .9; }
        .link:hover .label{ animation-duration: 3s; filter: brightness(1.4); }

        .link.is-active{
          background: rgba(255,255,255,.10);
          border-color: rgba(255,255,255,.18);
          box-shadow: 0 10px 26px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.06) inset;
          filter: brightness(1.12);
        }
        .link.is-active .glow{ opacity: 1; filter: brightness(1.18); }
        .link.is-active .label{
          text-shadow:
            0 0 22px color-mix(in srgb, var(--c1), #fff 30%),
            0 0 36px color-mix(in srgb, var(--c2), #fff 24%),
            0 0 56px rgba(255,255,255,.25);
          animation-duration: 2.2s;
          filter: brightness(1.5);
        }

        /* ANIMAZIONI GENERALI */
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

        /* Equalizer: altezze a onde */
        @keyframes barHop {
          0%,100% { transform: scaleY(.35); }
          50%     { transform: scaleY(1);   }
        }

        /* Alternanza equalizer -> idea */
        @keyframes eqPhase {
          0%   { opacity: 1;   transform: translateY(0) scale(1); }
          45%  { opacity: 1;   transform: translateY(0) scale(1); }
          55%  { opacity: 0;   transform: translateY(2px) scale(.98); }
          100% { opacity: 0;   transform: translateY(2px) scale(.98); }
        }
        @keyframes ideaPhase {
          0%   { opacity: 0;   transform: translateY(2px) scale(.98); }
          45%  { opacity: 0;   transform: translateY(2px) scale(.98); }
          55%  { opacity: 1;   transform: translateY(0) scale(1); }
          100% { opacity: 1;   transform: translateY(0) scale(1); }
        }

        /* Lampadina viva */
        @keyframes bulbGlow {
          0%,100% { transform: scale(1);    filter: drop-shadow(0 0 6px rgba(251,191,36,.45)); }
          50%     { transform: scale(1.06); filter: drop-shadow(0 0 12px rgba(251,191,36,.75)); }
        }
        @keyframes sparkFlicker {
          0%,100% { opacity: .0; }
          30%     { opacity: .9; }
          60%     { opacity: .3; }
        }

        @media (max-width: 520px){
          .inner{ gap: 16px; padding: 0 12px; }
          .brand-text{ font-size: 1.16rem; letter-spacing: .2rem; }
          .brand-anim{ width: 86px; height: 20px; }
          .track{ gap: 10px; }
          .link{ padding: 9px 14px; }
        }
      `}</style>
    </>
  );
}
