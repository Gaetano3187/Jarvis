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

  const modulo = links.length % 3;
  const fillers = modulo === 0 ? 0 : 3 - modulo;
  const mobileFillers = Array.from({ length: fillers }, (_, i) => `spacer-${i}`);

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
              <span className="brand-glow" aria-hidden="true" />
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
            {mobileFillers.map(key => (
              <li key={key} className="item spacer" aria-hidden="true" />
            ))}
          </ul>
        </div>
      </nav>

      <style jsx>{`
        :root{
          --nav-bg: rgba(2,6,23,.72);
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
          min-height: 64px; display: flex; align-items: center;
          gap: 24px; padding: 6px 16px;
        }

        /* === BRAND === */
        .brand{ text-decoration:none; display:inline-flex; align-items:center; }
        .brand-wrap{
          position: relative; display:inline-grid; place-items:center;
          padding: 8px 4px; isolation:isolate;
        }

        /* Aura caleidoscopio (lenta, sotto) */
        .brand-aura{
          position:absolute; inset:-18px -26px; z-index:0; border-radius: 28px;
          background: conic-gradient(from 0deg at 50% 50%,
            rgba(94,234,212,.85), rgba(34,211,238,.85), rgba(96,165,250,.82),
            rgba(167,139,250,.82), rgba(240,171,252,.82), rgba(94,234,212,.85));
          filter: blur(28px) saturate(1.2) brightness(1.05);
          animation: auraSpin 16s linear infinite;
        }

        /* Glow superiore: controfase rispetto al testo */
        .brand-glow{
          position:absolute; inset:-10px -18px; z-index:1; border-radius: 22px;
          background: conic-gradient(from 0deg at 50% 50%,
            #22d3ee, #60a5fa, #a78bfa, #f0abfc, #fb7185, #34d399, #a3e635, #22d3ee);
          filter: blur(26px) saturate(1.3) brightness(1.06);
          opacity:.85;
          animation: glowHue 12s linear infinite reverse, glowPulse 2.8s ease-in-out infinite;
          mix-blend-mode: screen;
        }

        /* SCRITTA: forte rilievo + SOLO pulse + cambio colore */
        .brand-text{
          position:relative; z-index:2; display:inline-block;
          font-family: "Orbitron", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .32rem;
          font-size: clamp(1.8rem, 4vw, 2.2rem); line-height: 1; white-space: nowrap;

          /* gradiente brillante (no layer bianco), fermo: niente pan */
          background: linear-gradient(90deg,
              #00f5ff 0%,
              #00d8ff 14%,
              #3aa6ff 28%,
              #7c5cff 42%,
              #ff3bd1 56%,
              #00ffa8 70%,
              #c7ff00 84%,
              #00f5ff 100%);
          background-size: 200% 200%;
          background-position: 50% 50%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;

          /* rilievo */
          -webkit-text-stroke: 0.7px rgba(0,0,0,.25);
          text-shadow:
            -1px -1px 0 rgba(255,255,255,.68),
             1.2px 1.2px 0 rgba(0,0,0,.46),
            -2px -2px 2px rgba(255,255,255,.34),
             2px  2px 3px rgba(0,0,0,.34),
             0    3px 8px rgba(0,0,0,.34);

          /* SOLO queste due animazioni */
          animation:
            textHue   12s linear infinite,
            textPulse  2.8s ease-in-out infinite;
        }

        .brand-halo{
          position:absolute; inset:-4px; z-index:3; pointer-events:none;
          background: radial-gradient(110% 110% at 50% -30%, rgba(255,255,255,.22), transparent 60%);
          mix-blend-mode: screen; filter: blur(8px);
        }

        /* === MENU === */
        .track{
          display:flex; gap:16px; list-style:none; margin:0; padding:0;
        }
        .item{ flex: 0 0 auto; }
        .item.spacer{ visibility:hidden; height:0; padding:0; margin:0; }
        .link{
          --c1:#5eead4; --c2:#22d3ee;
          display:inline-grid; place-items:center;
          padding: 12px 20px; border-radius: 16px;
          text-decoration:none; color:var(--text);
          border:1px solid transparent;
          transition: transform .18s ease, background .2s ease, box-shadow .2s ease;
        }
        .label{
          font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size:200% auto; -webkit-background-clip:text; background-clip:text; color:transparent;
          text-shadow: 0 0 12px rgba(255,255,255,.12);
        }
        .link:hover{ transform: translateY(-1px); }
        .link.is-active{
          background: rgba(255,255,255,.12);
          border-color: rgba(255,255,255,.22);
          box-shadow: 0 14px 32px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.07) inset;
        }

        /* === KEYFRAMES (solo ciò che serve) === */
        @keyframes auraSpin   { to { transform: rotate(360deg); } }
        @keyframes glowHue    { to { filter: hue-rotate(360deg) saturate(1.3); } }
        @keyframes glowPulse  { 0%,100% { opacity:.72; } 50% { opacity:1; } }
        @keyframes textHue    { to { filter: hue-rotate(360deg) saturate(1.25); } }
        @keyframes textPulse  { 0%,100% { filter: brightness(1) contrast(1.02); } 50% { filter: brightness(1.34) contrast(1.08); } }

        @media (prefers-reduced-motion: reduce) {
          .brand-aura, .brand-glow, .brand-text { animation: none !important; }
        }

        /* === SMARTPHONE: 3 colonne x N righe === */
        @media (max-width: 560px){
          .inner{
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            padding: 8px 10px 10px;
          }
          .brand{ justify-content: center; }
          .brand-text{
            font-size: clamp(1.7rem, 8vw, 2.1rem);
            letter-spacing: .30rem;
          }
          .track{
            display:grid;
            grid-template-columns: repeat(3, 1fr);
            gap:10px; width:100%;
          }
          .link{
            width:100%;
            padding:10px 12px;
            text-align:center;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.12);
            background: rgba(255,255,255,.05);
          }
        }

        /* fascia intermedia */
        @media (min-width: 561px) and (max-width: 860px){
          .inner{ padding: 8px 12px; }
          .track{ flex-wrap: wrap; gap: 12px; }
          .item{ flex: 0 0 auto; }
        }
      `}</style>
    </>
  );
}
