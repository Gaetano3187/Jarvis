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

  // Filler per completare multipli di 3 su mobile
  const modulo = links.length % 3;
  const fillers = modulo === 0 ? 0 : 3 - modulo;
  const mobileFillers = Array.from({ length: fillers }, (_, i) => `spacer-${i}`);

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">
          {/* ===== BRAND ===== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-wrap">
              {/* Aurea caleidoscopio (visibile ma leggera) */}
              <span className="logo-aura" aria-hidden="true" />
              {/* Bagliore neon pulsante */}
              <span className="logo-glow" aria-hidden="true" data-text="jarvis">jarvis</span>
              {/* Scritta 3D: estrusione + bevel + kaleidoscopio L->R */}
              <span className="logo-text" data-text="jarvis">jarvis</span>
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

        /* ===== LOGO ===== */
        .brand{ text-decoration:none; display:inline-flex; align-items:center; }
        .brand-wrap{
          position: relative; display:inline-grid; place-items:center;
          padding: 8px 4px; isolation:isolate;
        }

        /* AUREA caleidoscopio: visibile ma non copre */
        .logo-aura{
          position:absolute; inset:-18px -24px; z-index:0; pointer-events:none;
          background:
            conic-gradient(from 0deg at 50% 50%,
              rgba(239,68,68,.60), /* rosso */
              rgba(229,43,80,.56), /* amaranto */
              rgba(22,163,74,.56), /* verde */
              rgba(239,68,68,.60));
          filter: blur(26px) saturate(1.12);
          opacity:.60;
          mix-blend-mode: screen;
          border-radius: 9999px;
          clip-path: ellipse(78% 66% at 50% 50%);
          -webkit-mask-image: radial-gradient(ellipse at center, #000 70%, transparent 78%);
                  mask-image: radial-gradient(ellipse at center, #000 70%, transparent 78%);
        }

        /* Bagliore neon (sotto al testo) + pulsazione */
        .logo-glow{
          position:absolute; z-index:1; inset:0; pointer-events:none;
          display:inline-grid; place-items:center;
          font-family: "Orbitron", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .30rem;
          font-size: clamp(2rem, 4.5vw, 2.4rem); line-height: 1; white-space: nowrap;

          background:
            conic-gradient(from 0deg at 50% 50%,
              #ef4444 0deg, #e52b50 120deg, #16a34a 240deg, #ef4444 360deg);
          background-size: 220% 220%;
          background-position: 0% 50%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;

          mix-blend-mode: screen;
          filter: blur(14px) brightness(1.8) saturate(1.8);
          opacity: .98;

          animation:
            sweepLR 7s linear infinite,     /* caleidoscopio L->R */
            neonPulse 2.2s ease-in-out infinite; /* pulsazione intensa */
          will-change: background-position, filter, opacity;
        }

        /* Scritta 3D con estrusione profonda + bevel */
        .logo-text{
          position:relative; z-index:2; display:inline-block;
          font-family: "Orbitron", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .30rem;
          font-size: clamp(2rem, 4.5vw, 2.4rem); line-height: 1; white-space: nowrap;

          /* bordo nero netto */
          -webkit-text-stroke: 1.2px #000; paint-order: stroke fill;

          /* estrusione con stack di ombre (3D più profondo) */
          text-shadow:
            -1px -1px 0 rgba(255,255,255,.75),  /* bevel highlight */
             1px  1px 0 rgba(0,0,0,.60),
             2px  2px 0 rgba(0,0,0,.58),
             3px  3px 0 rgba(0,0,0,.56),
             4px  4px 0 rgba(0,0,0,.54),
             5px  5px 1px rgba(0,0,0,.52),
             6px  6px 2px rgba(0,0,0,.50),
             7px  7px 3px rgba(0,0,0,.48),
             8px  8px 4px rgba(0,0,0,.46),
             0    10px 16px rgba(0,0,0,.50);

          /* riempimento caleidoscopio (rosso→amaranto→verde) con scorrimento L->R */
          background:
            conic-gradient(from 0deg at 50% 50%,
              #ef4444 0deg, #e52b50 120deg, #16a34a 240deg, #ef4444 360deg);
          background-size: 220% 220%;
          background-position: 0% 50%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;

          animation: sweepLR 7s linear infinite; /* sincronizzato col glow */
          will-change: background-position;
        }

        /* Gloss/bevel interno leggero (accento 3D) */
        .logo-text::before{
          content: attr(data-text);
          position:absolute; inset:0; pointer-events:none;
          background: linear-gradient(145deg, rgba(255,255,255,.38), rgba(255,255,255,0) 55%);
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;
          mix-blend-mode: screen;
          filter: blur(.6px);
          opacity:.45;
        }

        /* Estrusione solida dietro (ombra corpo) */
        .logo-text::after{
          content: attr(data-text);
          position:absolute; inset:0; pointer-events:none;
          transform: translate(4px, 6px);      /* <-- estrusione più profonda */
          z-index: -1;
          color: rgba(0,0,0,.65);
          letter-spacing: inherit; font: inherit;
          -webkit-text-stroke: 0;
          filter: blur(.7px);
        }

        /* ===== MENU ===== */
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
        }
        .link:hover{ transform: translateY(-1px); }
        .link.is-active{
          background: rgba(255,255,255,.12);
          border-color: rgba(255,255,255,.22);
          box-shadow: 0 14px 32px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.07) inset;
        }

        /* ===== KEYFRAMES ===== */
        @keyframes sweepLR { to { background-position: 100% 50%; } }
        @keyframes neonPulse {
          0%, 100% { filter: blur(12px) brightness(1.45) saturate(1.5); opacity:.88; }
          50%      { filter: blur(20px) brightness(2.15) saturate(2.0); opacity:1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .logo-glow, .logo-text { animation: none !important; }
        }

        /* ===== SMARTPHONE: 3 colonne x N righe ===== */
        @media (max-width: 560px){
          .inner{
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            padding: 8px 10px 10px;
          }
          .brand{ justify-content: center; }
          .logo-text, .logo-glow{
            font-size: clamp(2rem, 8vw, 2.4rem);
            letter-spacing: .28rem;
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
