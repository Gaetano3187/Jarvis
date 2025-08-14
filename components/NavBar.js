// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const links = [
  { href: '/home',             label: 'Home',           c1: '#5eead4', c2: '#22d3ee' }, // teal-cyan
  { href: '/dashboard',        label: 'Dashboard',      c1: '#f0abfc', c2: '#c084fc' }, // pink-lilac
  { href: '/liste-prodotti',   label: 'Liste Prodotti', c1: '#34d399', c2: '#a3e635' }, // green-lime
  { href: '/finanze',          label: 'Finanze',        c1: '#60a5fa', c2: '#a78bfa' }, // blue-violet
  { href: '/spese-casa',       label: 'Casa',           c1: '#38bdf8', c2: '#60a5fa' }, // sky-blue
  { href: '/vestiti-ed-altro', label: 'Vestiti',        c1: '#f472b6', c2: '#fb7185' }, // pink-peach
  { href: '/cene-aperitivi',   label: 'Cene',           c1: '#f59e0b', c2: '#fb923c' }, // amber-orange
  { href: '/varie',            label: 'Varie',          c1: '#a78bfa', c2: '#93c5fd' }, // violet-pastel blue
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
          {/* ===== BRAND: Logo 3D neon con aurea arcobaleno ===== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-wrap" title="JARVIS">
              {/* Aurea arcobaleno tenue dietro al logo */}
              <span className="logo-aura" aria-hidden="true" />
              {/* Alone neon interno (blur sul testo) */}
              <span className="logo-glow" data-text="JARVIS" aria-hidden="true">JARVIS</span>
              {/* Testo in rilievo 3D con cambio colore */}
              <span className="logo-3d" data-text="JARVIS">JARVIS</span>
            </span>
          </Link>

          {/* ===== MENU ===== */}
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
          --nav-bg: rgba(5, 8, 22, 0.72);
          --nav-brd: rgba(255,255,255,.12);

          /* Palette principale logo */
          --violet: #a78bfa;        /* violetto */
          --blue:   #93c5fd;        /* azzurro pastello */
          --deep:   #0b0b0f;        /* ombra estrusione 3D */

          --cycle: 5.2s;            /* durata ciclo colori */
          --pulse: 1.25s;           /* durata pulsazione */
        }

        .nav{
          position: sticky; top: 0; z-index: 60;
          width: 100%;
          background: var(--nav-bg);
          backdrop-filter: blur(14px) saturate(1.2);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 12px 30px rgba(0,0,0,.30);
        }
        .inner{
          min-height: 72px; display: flex; align-items: center;
          gap: 24px; padding: 10px 16px;
        }

        /* ===== LOGO ===== */
        .brand{ text-decoration:none; display:inline-flex; align-items:center; }
        .brand-wrap{
          position: relative; display:inline-grid; place-items:center;
          padding: 6px 4px; isolation:isolate;
        }

        /* Aurea arcobaleno tenue dietro al logo */
        .logo-aura{
          position:absolute; inset:-26px -34px; z-index:0; pointer-events:none;
          border-radius: 9999px;
          background:
            conic-gradient(from 0deg,
              rgba(167,139,250,.55),   /* violet */
              rgba(147,197,253,.45),   /* pastel blue */
              rgba(34,211,238,.35),    /* cyan */
              rgba(16,185,129,.35),    /* emerald */
              rgba(250,204,21,.35),    /* amber */
              rgba(244,114,182,.40),   /* pink */
              rgba(167,139,250,.55));
          filter: blur(28px) saturate(1.15);
          opacity:.60;
          mix-blend-mode: screen;
          -webkit-mask-image: radial-gradient(ellipse at center, #000 64%, transparent 78%);
                  mask-image: radial-gradient(ellipse at center, #000 64%, transparent 78%);
          animation: auraSpin calc(var(--cycle) * 2) linear infinite;
        }

        /* Alone neon interno (bagliore sul testo) */
        .logo-glow{
          position:absolute; inset:0; z-index:1; pointer-events:none;
          display:grid; place-items:center;
          font-family: "Orbitron", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .38rem;
          font-size: clamp(2.1rem, 5vw, 2.8rem);
          text-transform: uppercase;
          background: linear-gradient(90deg, var(--violet), var(--blue), var(--violet));
          background-size: 220% 220%;
          -webkit-background-clip: text; color: transparent;
          filter: blur(16px) brightness(2.1) saturate(2.1);
          opacity:.95;
          animation:
            sweepColors var(--cycle) linear infinite,
            pulseGlow var(--pulse) ease-in-out infinite;
        }

        /* Testo 3D in rilievo (bevel + estrusione) con cambio colore */
        .logo-3d{
          position:relative; z-index:2; display:inline-block;
          font-family: "Orbitron", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .38rem;
          font-size: clamp(2.1rem, 5vw, 2.8rem);
          text-transform: uppercase;

          /* riempimento animato (cambia colore) */
          background: linear-gradient(90deg, var(--violet), var(--blue), var(--violet));
          background-size: 220% 220%;
          background-position: 0% 50%;
          -webkit-background-clip: text; color: transparent;

          /* bordo inciso + highlight */
          -webkit-text-stroke: 1.4px rgba(0,0,0,.85);
          paint-order: stroke fill;

          /* rilievo profondo con stack ombre */
          text-shadow:
            -1px -1px 0 rgba(255,255,255,.85), /* bevel alto */
            1px 1px 0 rgba(0,0,0,.64),
            2px 2px 0 rgba(0,0,0,.62),
            3px 3px 1px rgba(0,0,0,.60),
            4px 4px 2px rgba(0,0,0,.58),
            6px 7px 6px rgba(0,0,0,.50),
            10px 12px 16px rgba(0,0,0,.46);

          animation:
            sweepColors var(--cycle) linear infinite,
            pulseCore var(--pulse) ease-in-out infinite;
        }
        /* estrusione solida dietro (profondità) */
        .logo-3d::after{
          content: attr(data-text);
          position:absolute; inset:0; z-index:-1; pointer-events:none;
          transform: translate(6px, 8px);
          color: var(--deep);
          letter-spacing: inherit; font: inherit; -webkit-text-stroke: 0;
          filter: blur(.7px); opacity:.96;
          animation: extrudeBreath var(--pulse) ease-in-out infinite;
        }
        /* riflesso vetroso superiore */
        .logo-3d::before{
          content:""; position:absolute; left:-4%; right:-4%; top:0; height:56%;
          background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0));
          mix-blend-mode: screen; border-radius: 18px / 62%;
          filter: blur(2px); opacity:.58;
          animation: shineSweep calc(var(--cycle) * 1.1) linear infinite;
        }

        /* ===== MENU ===== */
        .track{
          display:flex; gap:14px; list-style:none; margin:0; padding:0;
        }
        .item{ flex: 0 0 auto; }
        .item.spacer{ visibility:hidden; height:0; padding:0; margin:0; }

        .link{
          --c1:#a78bfa; --c2:#93c5fd;
          position: relative;
          display:inline-grid; place-items:center;
          padding: 12px 20px; border-radius: 16px;
          text-decoration:none; color:#eef2ff;
          border:1px solid rgba(255,255,255,.14);
          background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 10px 22px rgba(0,0,0,.28);
          transition: transform .18s ease, box-shadow .2s ease;
          overflow: hidden;
        }
        .link::before{
          /* riflesso scorrevole sul “vetro” */
          content:""; position:absolute; left:-60%; top:-160%; width:60%; height:320%;
          background: linear-gradient(130deg, rgba(255,255,255,.16), transparent 40%);
          transform: rotate(12deg);
          animation: sheen 5s linear infinite;
          pointer-events:none;
        }

        .label{
          position: relative;
          font-weight:900; letter-spacing:.06rem;
          background: linear-gradient(90deg, var(--c1), var(--c2), var(--c1));
          background-size:220% auto; -webkit-background-clip:text; color:transparent;

          /* glow neon “americano” spesso */
          text-shadow:
            0 0 6px var(--c2),
            0 0 14px var(--c1),
            1px 1px 0 rgba(0,0,0,.55);

          animation:
            sweepColors var(--cycle) linear infinite,
            pulseLabel var(--pulse) ease-in-out infinite;
        }
        /* aurea morbida dietro ogni etichetta */
        .label::after{
          content:""; position:absolute; inset:-8px -10px; pointer-events:none;
          border-radius: 9999px;
          background: radial-gradient(60% 55% at 50% 50%,
            color-mix(in oklab, var(--c1) 55%, transparent) 0%,
            color-mix(in oklab, var(--c2) 40%, transparent) 35%,
            transparent 70%);
          mix-blend-mode: screen;
          filter: blur(12px);
          opacity:.65;
          animation: pulseAura var(--pulse) ease-in-out infinite;
        }

        .link:hover{ transform: translateY(-1px) scale(1.02); }
        .link.is-active{
          background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.05));
          border-color: rgba(255,255,255,.22);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 18px 36px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.06) inset;
        }

        /* ===== ANIMAZIONI ===== */
        @keyframes sweepColors { to { background-position: 200% 50%; } }
        @keyframes auraSpin { to { transform: rotate(360deg); } }
        @keyframes shineSweep { 0% { transform: translateY(0) } 100% { transform: translateY(-3%) } }

        /* Pulsazioni */
        @keyframes pulseGlow {
          0%,100% { filter: blur(16px) brightness(1.7) saturate(1.6); opacity:.9; }
          50%     { filter: blur(22px) brightness(2.5) saturate(2.2); opacity:1; }
        }
        @keyframes pulseCore {
          0%,100% { transform: scale(1); filter: contrast(1) brightness(1); }
          50%     { transform: scale(1.04); filter: contrast(1.12) brightness(1.08); }
        }
        @keyframes extrudeBreath {
          0%,100% { transform: translate(6px, 8px); opacity:.96; }
          50%     { transform: translate(7px, 10px); opacity:1; }
        }
        @keyframes pulseLabel {
          0%,100% { filter: brightness(1) saturate(1); text-shadow: 0 0 6px var(--c2), 0 0 14px var(--c1), 1px 1px 0 rgba(0,0,0,.55); }
          50%     { filter: brightness(1.35) saturate(1.6); text-shadow: 0 0 12px var(--c2), 0 0 28px var(--c1), 1px 1px 0 rgba(0,0,0,.55); }
        }
        @keyframes pulseAura {
          0%,100% { opacity:.55; transform: scale(1); }
          50%     { opacity:.85; transform: scale(1.06); }
        }
        @keyframes sheen { 0% { left:-60%; } 100% { left:160%; } }

        @media (prefers-reduced-motion: reduce) {
          .logo-aura, .logo-glow, .logo-3d, .logo-3d::after, .logo-3d::before,
          .label, .label::after, .link::before {
            animation: none !important;
          }
        }

        /* ===== MOBILE ===== */
        @media (max-width: 560px){
          .inner{
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            padding: 8px 10px 12px;
          }
          .brand{ justify-content: center; }
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
          }
        }
        @media (min-width: 561px) and (max-width: 860px){
          .inner{ padding: 8px 12px; }
          .track{ flex-wrap: wrap; gap: 12px; }
          .item{ flex: 0 0 auto; }
        }
      `}</style>
    </>
  );
}
