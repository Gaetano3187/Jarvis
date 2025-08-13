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

  // --- crea "spacer" per avere un numero totale multiplo di 3 (solo mobile) ---
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
              {/* bagliore colorato che cambia tinta e intensità */}
              <span className="brand-glow" aria-hidden="true" />
              {/* aura morbida di sfondo */}
              <span className="brand-aura" aria-hidden="true" />
              {/* scritta con riempimento stabile e vivido */}
              <span className="brand-text">JARVIS</span>
              {/* alone sottile */}
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
            {/* filler invisibili: solo su mobile per completare la griglia 3xN */}
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
          justify-content: flex-start; padding: 6px 16px;
          gap: 24px; overflow: hidden;
        }

        /* === LOGO UNIFORME (desktop & mobile) === */
        .brand{ text-decoration:none; display:inline-flex; align-items:center; margin-right: 8px; }
        .brand-wrap{
          position: relative; display:inline-grid; place-items:center;
          padding: 8px 4px; isolation:isolate;
        }

        /* Bagliore colorato a "neon" che cambia tinta e pulsa (non tocca il fill) */
        .brand-glow{
          position:absolute; inset:-10px -18px; z-index:0; border-radius: 22px;
          background: conic-gradient(from 0deg at 50% 50%,
            #22d3ee, #60a5fa, #a78bfa, #f0abfc, #fb7185, #34d399, #a3e635, #22d3ee);
          filter: blur(26px) saturate(1.25) brightness(1.1);
          opacity:.85;
          animation: glowHue 12s linear infinite, glowPulse 2.6s ease-in-out infinite;
          mix-blend-mode: screen;
        }

        /* Aura morbida di sfondo (molto leggera, statica per evitare conflitti) */
        .brand-aura{
          position:absolute; inset:-16px -24px; z-index:0;
          background: radial-gradient(70% 70% at 50% 40%, rgba(255,255,255,.14), transparent 60%),
                      radial-gradient(80% 80% at 60% 140%, rgba(167,139,250,.14), transparent 60%);
          filter: blur(18px);
          opacity:.7; border-radius: 24px;
        }

        /* Riempimento stabile e vivido (no bianco) */
        .brand-text{
          position:relative; z-index:2;
          font-family: "Orbitron", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .32rem;
          font-size: clamp(1.8rem, 4vw, 2.2rem); line-height: 1; white-space: nowrap;

          background: linear-gradient(90deg,
              #06b6d4 0%,   #22d3ee 15%,
              #60a5fa 30%,  #8b5cf6 45%,
              #f0abfc 60%,  #fb7185 75%,
              #34d399 87%,  #a3e635 100%);
          background-size: 160% 160%;
          background-position: 50% 50%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;

          -webkit-text-stroke: 0.6px rgba(0,0,0,.22);
          paint-order: stroke fill;

          /* glow leggero locale (costante, il cambio colore lo fa brand-glow) */
          text-shadow:
            0 0 10px rgba(255,255,255,.10),
            1px 1px 0 rgba(0,0,0,.40);
        }

        /* alone sottile sopra */
        .brand-halo{
          position:absolute; inset:-4px; z-index:3; pointer-events:none;
          background: radial-gradient(120% 120% at 50% -30%, rgba(255,255,255,.20), transparent 60%);
          mix-blend-mode: screen; filter: blur(8px);
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
        @keyframes glowHue     { to { filter: hue-rotate(360deg) saturate(1.25); } }
        @keyframes glowPulse   {
          0%, 100% { opacity:.70; filter: blur(22px) brightness(1.05); }
          50%      { opacity:.95; filter: blur(28px) brightness(1.20); }
        }

        /* === SMARTPHONE: 3 colonne × 3 righe (con filler se servono) === */
        @media (max-width: 560px){
          .inner{
            flex-direction: column;           /* logo sopra, menu sotto */
            align-items: stretch;
            gap: 8px;
            padding: 8px 10px 10px;
          }

          /* logo identico come resa: solo scala leggermente per spazio */
          .brand{ justify-content: center; }
          .brand-text{
            font-size: clamp(1.8rem, 8vw, 2.1rem);
            letter-spacing: .30rem;
          }

          /* Griglia fissa 3 colonne; aggiungiamo .spacer per riempire */
          .track{
            display: grid;
            grid-template-columns: repeat(3, 1fr); /* 3 per riga */
            gap: 10px;
            width: 100%;
            margin-top: 4px;
          }
          .item{ white-space: normal; }
          .item.spacer{
            visibility: hidden; /* occupa spazio ma non visibile */
            height: 0;
            padding: 0;
            margin: 0;
          }

          .link{
            width: 100%;
            padding: 10px 12px;
            text-align: center;
            border-radius: 14px;
            border:1px solid rgba(255,255,255,.12);
            background: rgba(255,255,255,.05);
          }
          .label{
            letter-spacing:.02rem;
            animation-duration: 5s;
          }
        }

        /* fascia intermedia stretta (tablet verticali): possiamo tenere flex-wrap */
        @media (min-width: 561px) and (max-width: 860px){
          .inner{ padding: 8px 12px; }
          .track{ flex-wrap: wrap; gap: 12px; }
          .item{ flex: 0 0 auto; }
        }
      `}</style>
    </>
  );
}
