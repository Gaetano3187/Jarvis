// components/NavBar.js
import Link from 'next/link';
import { useRouter } from 'next/router';

const links = [
  { href: '/home',             label: 'Home' },
  { href: '/dashboard',        label: 'Dashboard' },
  { href: '/liste-prodotti',   label: 'Liste Prodotti' },
  { href: '/finanze',          label: 'Finanze' },
  { href: '/spese-casa',       label: 'Casa' },
  { href: '/vestiti-ed-altro', label: 'Vestiti' },
  { href: '/cene-aperitivi',   label: 'Cene' },
  { href: '/varie',            label: 'Varie' },
];

export default function NavBar() {
  const { pathname } = useRouter();

  return (
    <>
      <nav className="nav">
        <div className="inner">

          {/* BRAND (equalizer + logo + testo) */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="eq" aria-hidden="true">
              <span className="bar b1" />
              <span className="bar b2" />
              <span className="bar b3" />
              <span className="bar b4" />
              <span className="bar b5" />
              {/* immagine/idea al centro dell'equalizzatore */}
              <span className="ai-badge">
                {/* SVG “idea/AI” stilizzato */}
                <svg viewBox="0 0 64 64" className="ai-svg">
                  <defs>
                    <linearGradient id="aiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%"  stopColor="#e0f2fe"/>
                      <stop offset="50%" stopColor="#c7d2fe"/>
                      <stop offset="100%" stopColor="#a7f3d0"/>
                    </linearGradient>
                  </defs>
                  {/* lampadina/circuito */}
                  <path d="M32 8c9 0 16 7 16 16 0 5-2 9-5 12-2 2-3 4-3 7H24c0-3-1-5-3-7-3-3-5-7-5-12 0-9 7-16 16-16Z" fill="url(#aiGrad)" />
                  <path d="M26 47h12v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-3Z" fill="#e5e7eb" />
                  {/* piccole “tracce” AI */}
                  <circle cx="23" cy="25" r="2" fill="#22d3ee"/>
                  <circle cx="41" cy="25" r="2" fill="#60a5fa"/>
                  <path d="M23 25h18" stroke="#7dd3fc" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
            </span>

            <span className="brand-text">JARVIS</span>
          </Link>

          {/* LINKS */}
          <ul className="track">
            {links.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <li key={href} className="item">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`link ${active ? 'is-active' : ''}`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <style jsx>{`
        :root{
          /* TEMA EQUALIZZATORE: "blue" o "green" */
          --eq-tone: blue; /* <-- cambia in "green" per passare al verde */

          --eq-blue-1: #22d3ee;
          --eq-blue-2: #38bdf8;
          --eq-blue-3: #60a5fa;

          --eq-green-1: #34d399;
          --eq-green-2: #10b981;
          --eq-green-3: #22c55e;

          --nav-bg: rgba(2,6,23,.62);
          --nav-brd: rgba(255,255,255,.08);
          --text: #e5e7eb;
        }

        .nav{
          position: sticky; top: 0; z-index: 60;
          width: 100%;
          background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.08);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 8px 24px rgba(0,0,0,.25);
        }
        .inner{
          height: 72px; /* altezza costante, evita sovrapposizioni */
          display: flex; align-items: center; gap: 18px;
          padding: 0 16px;
        }

        /* BRAND */
        .brand{
          display: inline-flex; align-items: center; gap: 14px;
          text-decoration: none; position: relative; padding: 6px 8px;
        }

        /* Equalizer */
        .eq{
          position: relative;
          width: 72px; height: 40px;
          display: grid; grid-template-columns: repeat(5,1fr);
          align-items: end; gap: 4px; padding: 6px 10px;
          border-radius: 10px;
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.10);
          overflow: hidden;
        }
        .bar{
          width: 100%;
          border-radius: 6px 6px 2px 2px;
          background: linear-gradient(
            180deg,
            var(--eq-c1) 0%,
            var(--eq-c2) 60%,
            var(--eq-c3) 100%
          );
          animation: bounce 1.2s ease-in-out infinite;
          box-shadow: 0 8px 16px color-mix(in srgb, var(--eq-c2), #000 50%);
        }
        .b1{ height: 35%; animation-delay: 0s; }
        .b2{ height: 55%; animation-delay: .08s; }
        .b3{ height: 80%; animation-delay: .16s; }
        .b4{ height: 50%; animation-delay: .24s; }
        .b5{ height: 30%; animation-delay: .32s; }

        /* switch palette eq (blu/verde) */
        .eq{
          --eq-c1: var(--eq-blue-1);
          --eq-c2: var(--eq-blue-2);
          --eq-c3: var(--eq-blue-3);
        }
        :root[style*="--eq-tone: green"] .eq,
        .eq[data-tone="green"]{
          --eq-c1: var(--eq-green-1);
          --eq-c2: var(--eq-green-2);
          --eq-c3: var(--eq-green-3);
        }

        @keyframes bounce{
          0%,100% { transform: scaleY(.45); filter: brightness(1); }
          50%     { transform: scaleY(1);    filter: brightness(1.25); }
        }

        /* Immagine/idea al centro dell'equalizzatore (più grande + glow forte) */
        .ai-badge{
          position: absolute; inset: 50% auto auto 50%;
          transform: translate(-50%,-50%);
          width: 30px; height: 30px;
          display: grid; place-items: center;
          filter: drop-shadow(0 0 10px rgba(99,102,241,.75))
                  drop-shadow(0 0 24px rgba(56,189,248,.55));
          animation: aiGlow 2.2s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        .ai-svg{ width: 100%; height: 100%; opacity: .95; }
        @keyframes aiGlow{
          0%,100%{ filter: drop-shadow(0 0 10px rgba(99,102,241,.75)) drop-shadow(0 0 26px rgba(56,189,248,.55)); }
          50%    { filter: drop-shadow(0 0 16px rgba(99,102,241,.95)) drop-shadow(0 0 40px rgba(56,189,248,.75)); }
        }

        /* Testo JARVIS con rilievo + caleidoscopio chiaro + bordo sottile */
        .brand-text{
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          font-weight: 900;
          letter-spacing: .18rem;
          font-size: clamp(1.1rem, 3.2vw, 1.45rem);
          line-height: 1;
          position: relative;

          /* riempimento caleidoscopio (chiaro su fondo scuro) */
          background:
            conic-gradient(
              from var(--ang, 0deg),
              #e0f2fe, #c7d2fe, #a7f3d0, #93c5fd, #f5d0fe, #e0f2fe
            );
          background-size: 200% 200%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;

          /* bordo leggero (non oscurante) + rilievo */
          -webkit-text-stroke: 0.6px rgba(0,0,0,.35);
          text-shadow:
            0 1px 0 rgba(255,255,255,.35),    /* highlight alto */
            0 2px 4px rgba(0,0,0,.35);        /* ombra basso */

          /* bagliore SOLO sul brand */
          filter: drop-shadow(0 0 14px rgba(99,102,241,.35))
                  drop-shadow(0 0 26px rgba(56,189,248,.25));
          animation: kscope 9s linear infinite, glowPulse 2.6s ease-in-out infinite;
        }

        @keyframes kscope{
          0%   { --ang: 0deg;   background-position: 0% 50%; }
          50%  { --ang: 180deg; background-position: 100% 50%; }
          100% { --ang: 360deg; background-position: 0% 50%; }
        }
        @keyframes glowPulse{
          0%,100% { filter: drop-shadow(0 0 12px rgba(99,102,241,.35)) drop-shadow(0 0 22px rgba(56,189,248,.25)); }
          50%     { filter: drop-shadow(0 0 20px rgba(99,102,241,.55)) drop-shadow(0 0 34px rgba(56,189,248,.38)); }
        }

        /* LINKS (puliti, senza glow) */
        .track{
          display: flex; gap: 14px; list-style: none; margin: 0 0 0 auto; padding: 0;
          overflow: hidden; scrollbar-width: none;
        }
        .track::-webkit-scrollbar{ display:none; }
        .item{ white-space: nowrap; }

        .link{
          position: relative; display: inline-grid; place-items: center;
          padding: 10px 14px; border-radius: 10px;
          text-decoration: none; color: var(--text);
          transition: transform .16s ease, background .16s ease, color .16s ease;
        }
        .link:hover{ transform: translateY(-1px); color: #f8fafc; }
        .link.is-active{
          background: rgba(255,255,255,.08);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
          color: #fff;
          font-weight: 700;
        }

        @media (max-width: 560px){
          .inner{ gap: 12px; height: 68px; }
          .eq{ width: 66px; height: 36px; }
          .ai-badge{ width: 28px; height: 28px; }
          .brand-text{ letter-spacing: .16rem; }
        }
      `}</style>
    </>
  );
}
