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
          {/* BRAND: JARVIS in rilievo + alternanza Equalizer / AI bulb */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-glow" aria-hidden="true" />
            <span className="brand-text">JARVIS</span>

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

              {/* IDEA: lampadina “AI style” con circuiti */}
              <span className="ai">
                <svg className="ai-svg" viewBox="0 0 80 80" aria-hidden="true">
                  {/* bulbo */}
                  <g className="ai-bulb">
                    <path d="M40 8c14 0 24 10.7 24 23.8 0 8-4.2 14-10.3 18.3-1.9 1.3-3.1 3.4-3.1 5.6v1.3c0 2.2-1.8 4-4 4H33.4c-2.2 0-4-1.8-4-4v-1.3c0-2.2-1.2-4.3-3.1-5.6C20.2 45.8 16 39.8 16 31.8 16 18.7 26 8 40 8Z"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    {/* attacco */}
                    <rect x="33" y="57.5" width="14" height="5.5" rx="1.5" fill="currentColor" />
                    <rect x="33" y="64" width="14" height="4.5" rx="1.5" fill="currentColor" />
                  </g>

                  {/* CORE AI: esagono con nodi e tracce */}
                  <g className="ai-core">
                    <polygon points="40,20 52,27 52,41 40,48 28,41 28,27"
                             fill="none" stroke="currentColor" strokeWidth="1.6"/>
                    {/* nodi */}
                    <circle cx="40" cy="20" r="2.2" fill="currentColor"/>
                    <circle cx="52" cy="27" r="2.2" fill="currentColor"/>
                    <circle cx="52" cy="41" r="2.2" fill="currentColor"/>
                    <circle cx="40" cy="48" r="2.2" fill="currentColor"/>
                    <circle cx="28" cy="41" r="2.2" fill="currentColor"/>
                    <circle cx="28" cy="27" r="2.2" fill="currentColor"/>
                    {/* tracce */}
                    <path d="M40 20 L52 27 L52 41 L40 48 L28 41 L28 27 Z" fill="none" stroke="currentColor" strokeWidth="1"/>
                    <path d="M40 20 L40 48 M28 27 L52 41 M52 27 L28 41" fill="none" stroke="currentColor" strokeWidth=".9" strokeDasharray="3 2"/>
                  </g>

                  {/* alone orbitale */}
                  <g className="ai-orbit">
                    <ellipse cx="40" cy="34" rx="22" ry="9" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6"/>
                  </g>
                </svg>
              </span>
            </span>
          </Link>

          {/* LINKS */}
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
          --nav-bg: rgba(2,6,23,.66);
          --nav-brd: rgba(255,255,255,.10);
          --text: #f3f4f6;
        }
        .nav{
          position: sticky; top: 0; z-index: 50;
          width: 100%; background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.15);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 10px 28px rgba(0,0,0,.28);
        }
        .inner{
          height: 64px;
          display: flex; align-items: center; justify-content: flex-start;
          padding: 0 16px; gap: 28px;
          overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none;
        }
        .inner::-webkit-scrollbar{ display: none; }

        /* BRAND */
        .brand{
          position: relative;
          display: inline-flex; align-items: center; gap: 18px;
          padding: 10px 8px 10px 2px;
          text-decoration: none;
          margin-right: 26px; /* più distacco dal menu */
        }
        .brand-glow{
          position: absolute; inset: -12px -18px; pointer-events:none;
          background:
            radial-gradient(60% 60% at 30% 50%, rgba(34,211,238,.38), transparent 60%),
            radial-gradient(70% 70% at 80% 50%, rgba(167,139,250,.30), transparent 62%);
          filter: blur(16px); animation: brandPulse 2.2s ease-in-out infinite;
        }
        /* Scritta grande, in rilievo, con bordo sottile nero */
        .brand-text{
          font-weight: 900;
          letter-spacing: .26rem;
          font-size: clamp(1.32rem, 3.2vw, 1.72rem);
          line-height: 1;
          background: conic-gradient(from 0deg, #22d3ee, #38bdf8, #a78bfa, #e879f9, #22d3ee);
          background-size: 200% 200%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          -webkit-text-stroke: 0.8px rgba(0,0,0,.55);
          paint-order: stroke fill;
          text-shadow:
            0 1px 0 rgba(0,0,0,.6),
            0 2px 4px rgba(0,0,0,.35),
            0 0 20px rgba(56,189,248,.35),
            0 0 34px rgba(167,139,250,.28);
          animation: kaleido 7s linear infinite, glowBreath 3s ease-in-out infinite;
          filter: brightness(1.28);
          white-space: nowrap;
        }

        /* Alternanza EQUALIZER / AI BULB */
        .brand-anim{ position: relative; width: 112px; height: 22px; display: inline-grid; place-items: center; margin-left: 2px; }

        /* Equalizer */
        .eq{
          position: absolute; inset: 0;
          display: grid; grid-auto-flow: column; align-items: end; justify-content: center;
          gap: 4px; opacity: 1; color: #22d3ee;
          filter: drop-shadow(0 0 12px rgba(34,211,238,.7));
          animation: eqPhase 5s ease-in-out infinite;
        }
        .bar{ width: 6px; height: 10px; border-radius: 3px; background: currentColor; transform-origin: bottom center; animation: barHop 1s ease-in-out infinite; }
        .b1{ animation-duration: 0.9s; } .b2{ animation-duration: 1.1s; animation-delay: .05s; }
        .b3{ animation-duration: 0.95s; animation-delay: .1s; }
        .b4{ animation-duration: 1.05s; animation-delay: .15s; }
        .b5{ animation-duration: 1.2s;  animation-delay: .2s; }
        .b6{ animation-duration: 0.85s; animation-delay: .25s; }

        /* AI bulb (cromia ciano/viola) */
        .ai{
          position: absolute; inset: 0; display: grid; place-items: center;
          opacity: 0; transform: translateY(2px) scale(.98);
          color: #7dd3fc;
          animation: aiPhase 5s ease-in-out infinite;
          filter: drop-shadow(0 0 10px rgba(125,211,252,.8)) drop-shadow(0 0 22px rgba(167,139,250,.4));
        }
        .ai-svg{ width: 72px; height: 72px; }
        .ai-bulb{ opacity:.95; }
        .ai-core{ color: #a78bfa; animation: neonFlow 2.4s linear infinite; }
        .ai-orbit{ color: #22d3ee; animation: orbitSpin 6s linear infinite; transform-origin: 40px 34px; }

        /* MENU */
        .track{ display: flex; gap: 12px; list-style: none; margin: 0; padding: 0; }
        .item{ white-space: nowrap; }
        .link{
          --c1: #22d3ee; --c2: #38bdf8;
          position: relative; display: inline-grid; place-items: center;
          padding: 10px 16px; border-radius: 12px;
          text-decoration: none; color: var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border: 1px solid transparent; isolation: isolate;
        }
        .glow{
          position: absolute; inset: -16px -22px; z-index: 0;
          background:
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c1), #ffffff 16%), transparent 60%),
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c2), #ffffff 14%), transparent 62%);
          filter: blur(20px); opacity: 0; transition: opacity .25s ease; pointer-events: none;
        }
        .label{
          position: relative; z-index: 1; font-weight: 800; letter-spacing: .03rem;
          background: linear-gradient(90deg, var(--c1), var(--c2)); background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          text-shadow: 0 0 16px rgba(255,255,255,.16), 0 0 28px color-mix(in srgb, var(--c2), #fff 14%);
          animation: shimmerText 7s linear infinite; filter: brightness(1.24);
        }
        .link:hover{ transform: translateY(-1px); }
        .link:hover .glow{ opacity: 1; }
        .link:hover .label{ animation-duration: 3s; filter: brightness(1.42); }
        .link.is-active{
          background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.2);
          box-shadow: 0 12px 30px rgba(0,0,0,.36), 0 0 0 1px rgba(255,255,255,.06) inset;
          filter: brightness(1.14);
        }
        .link.is-active .glow{ opacity: 1; filter: brightness(1.22); }
        .link.is-active .label{
          text-shadow:
            0 0 24px color-mix(in srgb, var(--c1), #fff 34%),
            0 0 38px color-mix(in srgb, var(--c2), #fff 26%),
            0 0 60px rgba(255,255,255,.28);
          animation-duration: 2.2s; filter: brightness(1.55);
        }

        /* ANIMAZIONI */
        @keyframes shimmerText { to { background-position: -200% center; } }
        @keyframes kaleido { to { background-position: 200% 200%; } }
        @keyframes glowBreath {
          0%,100% { text-shadow: 0 1px 0 rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.35), 0 0 18px rgba(56,189,248,.30), 0 0 30px rgba(167,139,250,.22); }
          50%     { text-shadow: 0 1px 0 rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.35), 0 0 28px rgba(56,189,248,.55), 0 0 44px rgba(167,139,250,.38); }
        }
        @keyframes brandPulse { 0%,100% { opacity:.55; transform: scale(1); } 50% { opacity:.9; transform: scale(1.05); } }
        @keyframes barHop { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
        @keyframes eqPhase { 0%,45% { opacity: 1; transform: translateY(0) scale(1); } 55%,100% { opacity: 0; transform: translateY(2px) scale(.98); } }
        @keyframes aiPhase { 0%,45% { opacity: 0; transform: translateY(2px) scale(.98); } 55%,100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes neonFlow { 0% { filter: drop-shadow(0 0 8px rgba(167,139,250,.55)); } 50% { filter: drop-shadow(0 0 16px rgba(167,139,250,.9)); } 100% { filter: drop-shadow(0 0 8px rgba(167,139,250,.55)); } }
        @keyframes orbitSpin { to { transform: rotate(360deg); } }

        @media (max-width: 520px){
          .inner{ gap: 20px; padding: 0 12px; }
          .brand-text{ font-size: 1.38rem; letter-spacing: .24rem; }
          .brand-anim{ width: 98px; height: 20px; }
          .track{ gap: 10px; }
          .link{ padding: 9px 14px; }
        }
      `}</style>
    </>
  );
}
