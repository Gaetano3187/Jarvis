// components/NavBar.js
import Link from 'next/link';
import { useRouter } from 'next/router';

const links = [
  { href: '/home',             label: 'Home',           c1: '#5eead4', c2: '#22d3ee' },
  { href: '/dashboard',        label: 'Dashboard',      c1: '#f0abfc', c2: '#c084fc' },
  { href: '/liste-prodotti',   label: 'Liste Prodotti', c1: '#34d399', c2: '#a3e635' },
  { href: '/finanze',          label: 'Finanze',        c1: '#60a5fa', c2: '#a78bfa' },
  { href: '/spese-casa',       label: 'Casa',           c1: '#38bdf8', c2: '#60a5fa' },
  { href: '/vestiti-ed-altro', label: 'Vestiti',        c1: '#f472b6', c2: '#fb7185' },
  { href: '/cene-aperitivi',   label: 'Cene',           c1: '#f59e0b', c2: '#fb923c' },
  { href: '/varie',            label: 'Varie',          c1: '#94a3b8', c2: '#d4d4d8' },
];

export default function NavBar() {
  const { pathname } = useRouter();

  return (
    <>
      <nav className="nav">
        <div className="inner">
          {/* BRAND: JARVIS super luminoso + alternanza Equalizer / Robot */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-glow" aria-hidden="true" />
            <span className="brand-text">JARVIS</span>

            <span className="brand-anim" aria-hidden="true">
              {/* EQUALIZER (verde→giallo→rosso) */}
              <span className="eq">
                <span className="bar b1" />
                <span className="bar b2" />
                <span className="bar b3" />
                <span className="bar b4" />
                <span className="bar b5" />
                <span className="bar b6" />
              </span>

              {/* ROBOT “I, Robot style” minimal neon */}
              <span className="irobot">
                <svg className="rb-svg" viewBox="0 0 120 48" aria-hidden="true">
                  <defs>
                    <clipPath id="rbHeadClip">
                      <path d="M60 6c18 0 32 12 32 26 0 6-2.5 8-8 8H36c-5.5 0-8-2-8-8 0-14 14-26 32-26z" />
                    </clipPath>
                  </defs>

                  {/* contorno testa */}
                  <path className="rb-head" d="M60 6c18 0 32 12 32 26 0 6-2.5 8-8 8H36c-5.5 0-8-2-8-8 0-14 14-26 32-26z"
                        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

                  {/* placca “viso” */}
                  <path className="rb-plate" d="M36 27h48c4 0 6 2 6 5 0 3-2 5-6 5H36c-4 0-6-2-6-5 0-3 2-5 6-5z"
                        fill="currentColor" opacity=".08"/>

                  {/* occhi glow */}
                  <g className="rb-eyes">
                    <circle cx="48" cy="24" r="2.6" />
                    <circle cx="72" cy="24" r="2.6" />
                  </g>

                  {/* riflesso scorrevole dentro la testa */}
                  <g clipPath="url(#rbHeadClip)">
                    <circle className="rb-glint" cx="-10" cy="22" r="18" />
                  </g>

                  {/* “jack” mento */}
                  <rect x="58" y="39.5" width="4" height="4.5" rx="1" className="rb-jack" />
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
          --nav-bg: rgba(2,6,23,.7);
          --nav-brd: rgba(255,255,255,.12);
          --text: #f8fafc;
        }
        .nav{
          position: sticky; top: 0; z-index: 60;
          width: 100%; background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.2);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 12px 30px rgba(0,0,0,.30);
        }
        .inner{
          height: 64px;
          display: flex; align-items: center; justify-content: flex-start;
          padding: 0 16px; gap: 32px;
          overflow: hidden; /* niente barra di scorrimento */
        }

        /* BRAND */
        .brand{
          position: relative;
          display: inline-flex; align-items: center; gap: 20px;
          padding: 10px 10px 10px 2px;
          text-decoration: none;
          margin-right: 30px; /* distacco dal menu */
        }
        .brand-glow{
          position: absolute; inset: -14px -20px; pointer-events:none;
          background:
            radial-gradient(60% 60% at 30% 50%, rgba(94,234,212,.45), transparent 60%),
            radial-gradient(70% 70% at 80% 50%, rgba(96,165,250,.40), transparent 62%);
          filter: blur(18px); animation: brandPulse 2.2s ease-in-out infinite;
        }

        /* Scritta JARVIS luminosa, kaleidoscopio, bordo interno nero */
        .brand-text{
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900;
          letter-spacing: .28rem;
          font-size: clamp(1.5rem, 3.4vw, 1.9rem);
          line-height: 1;
          background: conic-gradient(from 0deg,
            #5eead4 0%, #22d3ee 16%, #60a5fa 32%, #a78bfa 48%, #f0abfc 64%, #60a5fa 80%, #5eead4 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          -webkit-text-stroke: 1px rgba(0,0,0,.65);
          paint-order: stroke fill;
          text-shadow:
            0 1px 0 rgba(0,0,0,.6),
            0 2px 4px rgba(0,0,0,.4),
            0 0 24px rgba(96,165,250,.55),
            0 0 46px rgba(167,139,250,.45);
          animation: kaleido 6.5s linear infinite, glowBreath 2.6s ease-in-out infinite;
          filter: brightness(1.45) contrast(1.05);
          white-space: nowrap;
        }

        /* Alternanza Equalizer / Robot */
        .brand-anim{ position: relative; width: 130px; height: 24px; display: inline-grid; place-items: center; margin-left: 2px; }

        /* Equalizer colorato */
        .eq{
          position: absolute; inset: 0;
          display: grid; grid-auto-flow: column; align-items: end; justify-content: center;
          gap: 5px; opacity: 1;
          animation: eqPhase 5s ease-in-out infinite;
        }
        .bar{
          width: 8px; height: 10px; border-radius: 3px; transform-origin: bottom center;
          background: linear-gradient(to top, #ef4444 0%, #f59e0b 45%, #22c55e 100%);
          box-shadow:
            0 0 10px rgba(34,197,94,.55),
            0 0 18px rgba(245,158,11,.35),
            0 0 26px rgba(239,68,68,.25);
          animation: barHop 1s ease-in-out infinite;
        }
        .b1{ animation-duration: 0.9s; } .b2{ animation-duration: 1.12s; animation-delay: .05s; }
        .b3{ animation-duration: 0.96s; animation-delay: .1s; }
        .b4{ animation-duration: 1.08s; animation-delay: .15s; }
        .b5{ animation-duration: 1.22s; animation-delay: .2s; }
        .b6{ animation-duration: 0.86s; animation-delay: .25s; }

        /* Robot neon “I, Robot” minimal */
        .irobot{
          position: absolute; inset: 0; display: grid; place-items: center;
          opacity: 0; transform: translateY(2px) scale(.98);
          animation: rbPhase 5s ease-in-out infinite;
          color: #7dd3fc;
          filter:
            drop-shadow(0 0 10px rgba(125,211,252,.9))
            drop-shadow(0 0 22px rgba(167,139,250,.45));
        }
        .rb-svg{ width: 100px; height: 100%; }
        .rb-head{ color: #93c5fd; }
        .rb-plate{ color: #60a5fa; }
        .rb-eyes circle{
          fill: #22d3ee;
          filter: drop-shadow(0 0 8px rgba(34,211,238,.95)) drop-shadow(0 0 16px rgba(167,139,250,.6));
          animation: eyesBlink 4.8s ease-in-out infinite;
        }
        .rb-jack{ fill: #38bdf8; opacity:.9; }
        .rb-glint{
          fill: radial-gradient(circle, #e0f2fe 0%, rgba(224,242,254,.65) 35%, rgba(224,242,254,0) 70%);
          /* fallback solid + CSS glow */
          fill: #e0f2fe;
          opacity: .22;
          animation: glintMove 3.2s linear infinite;
          filter: blur(2px);
        }

        /* MENU */
        .track{ display: flex; gap: 14px; list-style: none; margin: 0; padding: 0; }
        .item{ white-space: nowrap; }
        .link{
          --c1: #5eead4; --c2: #22d3ee;
          position: relative; display: inline-grid; place-items: center;
          padding: 10px 18px; border-radius: 14px;
          text-decoration: none; color: var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border: 1px solid transparent; isolation: isolate;
        }
        .glow{
          position: absolute; inset: -16px -24px; z-index: 0;
          background:
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c1), #ffffff 20%), transparent 60%),
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c2), #ffffff 18%), transparent 62%);
          filter: blur(22px); opacity: 0; transition: opacity .25s ease; pointer-events: none;
        }
        .label{
          position: relative; z-index: 1; font-weight: 900; letter-spacing: .04rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          text-shadow: 0 0 16px rgba(255,255,255,.20), 0 0 32px color-mix(in srgb, var(--c2), #fff 18%);
          animation: shimmerText 6.2s linear infinite; filter: brightness(1.35);
        }
        .link:hover{ transform: translateY(-1px); }
        .link:hover .glow{ opacity: 1; }
        .link:hover .label{ animation-duration: 3s; filter: brightness(1.5); }
        .link.is-active{
          background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.24);
          box-shadow: 0 14px 34px rgba(0,0,0,.36), 0 0 0 1px rgba(255,255,255,.08) inset;
          filter: brightness(1.16);
        }
        .link.is-active .glow{ opacity: 1; filter: brightness(1.28); }
        .link.is-active .label{
          text-shadow:
            0 0 28px color-mix(in srgb, var(--c1), #fff 40%),
            0 0 46px color-mix(in srgb, var(--c2), #fff 32%),
            0 0 70px rgba(255,255,255,.32);
          animation-duration: 2.2s; filter: brightness(1.65);
        }

        /* ANIMAZIONI */
        @keyframes shimmerText { to { background-position: -200% center; } }
        @keyframes kaleido { to { background-position: 200% 200%; } }
        @keyframes glowBreath {
          0%,100% { text-shadow: 0 1px 0 rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.4), 0 0 22px rgba(96,165,250,.55), 0 0 42px rgba(167,139,250,.42); }
          50%     { text-shadow: 0 1px 0 rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.4), 0 0 32px rgba(96,165,250,.85), 0 0 60px rgba(167,139,250,.60); }
        }

        @keyframes brandPulse { 0%,100% { opacity:.55; transform: scale(1); } 50% { opacity:.95; transform: scale(1.05); } }
        @keyframes barHop { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
        @keyframes eqPhase { 0%,48% { opacity: 1; transform: translateY(0) scale(1); } 52%,100% { opacity: 0; transform: translateY(2px) scale(.98); } }
        @keyframes rbPhase { 0%,48% { opacity: 0; transform: translateY(2px) scale(.98); } 52%,100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes eyesBlink { 0%,92%,100% { opacity: 1; } 95% { opacity: .15; } }
        @keyframes glintMove { 0% { transform: translateX(-10px); } 100% { transform: translateX(140px); } }

        @media (max-width: 560px){
          .inner{ gap: 22px; padding: 0 12px; }
          .brand-text{ font-size: 1.55rem; letter-spacing: .26rem; }
          .brand-anim{ width: 112px; height: 22px; }
          .track{ gap: 10px; }
          .link{ padding: 9px 14px; }
        }
      `}</style>
    </>
  );
}
