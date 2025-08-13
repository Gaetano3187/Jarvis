// components/NavBar.js
import Head from 'next/head';
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
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">
          {/* BRAND */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-wrap">
              <span className="brand-aura" aria-hidden="true" />
              <span className="brand-text">JARVIS</span>
              <span className="brand-halo" aria-hidden="true" />
            </span>
          </Link>

          {/* MENU */}
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
          --nav-bg: rgba(2,6,23,.72);
          --nav-brd: rgba(255,255,255,.12);
          --text: #f8fafc;
        }

        /* NAV WRAPPER */
        .nav{
          position: sticky; top: 0; z-index: 60;
          width: 100%; background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.2);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 12px 30px rgba(0,0,0,.30);
        }
        .inner{
          min-height: 64px; display: flex; align-items: center;
          justify-content: flex-start; padding: 0 16px;
          gap: 28px; overflow: hidden;
        }

        /* === LOGO JARVIS (riempimento vivido + animazione compatibile) === */
        .brand{ text-decoration:none; display:inline-flex; align-items:center; }
        .brand-wrap{ position: relative; display:inline-grid; place-items:center; padding: 6px 2px; isolation:isolate; }

        .brand-aura{
          position:absolute; inset:-18px -26px; z-index:0;
          background: conic-gradient(from 0deg at 50% 50%,
            rgba(34,211,238,.90), rgba(96,165,250,.85),
            rgba(167,139,250,.85), rgba(240,171,252,.85),
            rgba(94,234,212,.90));
          filter: blur(26px) saturate(1.15) brightness(1.08);
          opacity:.9; border-radius: 24px;
          animation: auraSpin 10s linear infinite;
        }

        /* Riempimento multicolore animato (no bianco) — colori più vivi */
        .brand-text{
          position:relative; z-index:1;
          font-family: "Orbitron", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .35rem;
          font-size: clamp(1.9rem, 4vw, 2.3rem); line-height: 1; white-space: nowrap;

          background:
            conic-gradient(from 0deg at 50% 50%,
              #06b6d4 0%,   #22d3ee 10%,
              #60a5fa 20%,  #3b82f6 30%,
              #a78bfa 40%,  #8b5cf6 50%,
              #f0abfc 60%,  #fb7185 70%,
              #34d399 80%,  #a3e635 90%,
              #06b6d4 100%);
          background-size: 220% 220%;
          background-position: 50% 50%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;

          -webkit-text-stroke: 0.6px rgba(0,0,0,.22);
          paint-order: stroke fill;

          text-shadow:
            -1px -1px 0 rgba(255,255,255,.45),
             1px  1px 0 rgba(0,0,0,.40),
             0    2px 4px rgba(0,0,0,.30);
          filter: contrast(1.1) saturate(1.2);

          /* Solo due animazioni non conflittuali */
          animation:
            gradientPan 6s linear infinite,
            hueShift    12s linear infinite;
        }

        .brand-halo{
          position:absolute; inset:-6px; z-index:2; pointer-events:none;
          background:
            radial-gradient(120% 120% at 50% -30%, rgba(255,255,255,.18), transparent 60%),
            radial-gradient(100% 100% at 60% 140%, rgba(167,139,250,.20), transparent 60%);
          mix-blend-mode: screen; filter: blur(10px);
          animation: haloBreath 2.6s ease-in-out infinite;
        }

        /* === MENU (desktop base) === */
        .track{
          display:flex; gap:16px; list-style:none; margin:0; padding:0;
        }
        .item{ white-space:nowrap; flex: 0 0 auto; }
        .link{
          --c1:#5eead4; --c2:#22d3ee;
          position:relative; display:inline-grid; place-items:center;
          padding: 12px 20px; border-radius: 16px;
          text-decoration:none; color:var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border:1px solid transparent; isolation:isolate;
          background: transparent;
        }
        .label{
          position:relative; z-index:1; font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size:200% auto; -webkit-background-clip:text; background-clip:text; color:transparent;
          text-shadow: 0 0 12px rgba(255,255,255,.12);
          animation: shimmerText 6s linear infinite;
        }
        .link:hover{ transform: translateY(-1px); }
        .link.is-active{
          background: rgba(255,255,255,.12);
          border-color: rgba(255,255,255,.22);
          box-shadow: 0 14px 32px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.07) inset;
          filter: brightness(1.12);
        }
        .link.is-active .label{
          text-shadow:
            0 0 24px color-mix(in srgb, var(--c1), #fff 40%),
            0 0 36px color-mix(in srgb, var(--c2), #fff 30%);
          animation-duration: 2.4s;
        }

        /* === ANIMAZIONI === */
        @keyframes shimmerText { to { background-position: -200% center; } }
        @keyframes auraSpin     { to { transform: rotate(360deg); } }
        @keyframes haloBreath   { 0%,100% { opacity:.55; filter: blur(10px); } 50% { opacity:.95; filter: blur(14px); } }
        @keyframes gradientPan  { to { background-position: 120% 120%; } }
        @keyframes hueShift     { to { filter: hue-rotate(360deg); } }

        /* === SMARTPHONE: logo in alto, griglia compatta 2–3 colonne === */
        @media (max-width: 560px){
          .inner{
            flex-direction: column;           /* logo sopra, menu sotto */
            align-items: stretch;
            gap: 6px;
            padding: 8px 10px 10px;
          }

          /* LOGO più compatto e senza animazioni in conflitto */
          .brand{
            justify-content: center;
          }
          .brand-text{
            font-size: 1.7rem;
            letter-spacing: .28rem;
          }
          /* Disabilita spin e respiro per evitare overload visivo su mobile */
          .brand-aura{ animation: none; }
          .brand-halo{ animation: none; }

          /* Menu a griglia: auto-fit -> 2 o 3 colonne in base allo spazio */
          .track{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
            gap: 10px;
            width: 100%;
            margin-top: 4px;
          }
          .item{
            white-space: normal;               /* consente capo se testo lungo */
          }
          .link{
            width: 100%;
            padding: 10px 12px;
            text-align: center;
            border-radius: 14px;
            border:1px solid rgba(255,255,255,.10);
            background: rgba(255,255,255,.04);
          }
          .label{
            letter-spacing:.02rem;
            animation-duration: 5s;
          }
        }

        /* fascia intermedia stretta (tablet verticali) — può andare su 2 righe */
        @media (min-width: 561px) and (max-width: 860px){
          .inner{ padding: 6px 12px; }
          .track{ flex-wrap: wrap; gap: 12px; }
          .item{ flex: 0 0 auto; }
        }
      `}</style>
    </>
  );
}
