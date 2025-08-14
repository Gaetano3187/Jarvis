// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const links = [
  { href: '/home',             label: 'Home',           c1: '#8b5cf6', c2: '#60a5fa' },
  { href: '/dashboard',        label: 'Dashboard',      c1: '#22d3ee', c2: '#a78bfa' },
  { href: '/liste-prodotti',   label: 'Liste Prodotti', c1: '#34d399', c2: '#a3e635' },
  { href: '/finanze',          label: 'Finanze',        c1: '#f472b6', c2: '#fb7185' },
  { href: '/spese-casa',       label: 'Casa',           c1: '#38bdf8', c2: '#60a5fa' },
  { href: '/vestiti-ed-altro', label: 'Vestiti',        c1: '#f59e0b', c2: '#fb923c' },
  { href: '/cene-aperitivi',   label: 'Cene',           c1: '#06b6d4', c2: '#22d3ee' },
  { href: '/varie',            label: 'Varie',          c1: '#a78bfa', c2: '#93c5fd' },
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
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">
          {/* ====== LOGO: AI Agent neon 3D con aurea arcobaleno ====== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-wrap" title="JARVIS">
              {/* Aurea arcobaleno tenue (dietro) */}
              <span className="logo-halo" aria-hidden="true" />
              {/* Contorno neon morbido (non sbianca il riempimento) */}
              <span className="logo-stroke" aria-hidden="true">JARVIS</span>
              {/* Trama “scan” da AI (righe sottili che scorrono) */}
              <span className="logo-scan" aria-hidden="true">JARVIS</span>
              {/* Core 3D a gradiente dinamico (mai bianco) */}
              <span className="logo-core" data-text="JARVIS">JARVIS</span>
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
                    style={{ '--c1': c1, '--c2': c2 }}
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
          --nav-bg: rgba(6, 10, 28, .72);
          --nav-brd: rgba(255,255,255,.12);

          /* Palette logo (veri colori, niente bianco) */
          --c1: #8b5cf6; /* violet */
          --c2: #60a5fa; /* light blue */
          --c3: #22d3ee; /* cyan */
          --c4: #f472b6; /* pink */
          --c5: #f59e0b; /* amber */

          --deep: #0a0a0e;  /* ombra estrusione */

          --cycle: 7s;   /* giro colori */
          --pulse: 1.3s; /* pulsazione */
        }

        /* Supporto animazione angolo per gradienti rotanti */
        @property --ang {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }

        .nav{
          position: sticky; top: 0; z-index: 60;
          width: 100%;
          background: var(--nav-bg);
          backdrop-filter: blur(14px) saturate(1.22);
          -webkit-backdrop-filter: blur(14px) saturate(1.22);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 18px 40px rgba(0,0,0,.36);
        }
        .inner{
          min-height: 74px; display: flex; align-items: center;
          gap: 22px; padding: 10px 16px;
        }

        /* ===== LOGO ===== */
        .brand{ text-decoration:none; display:flex; align-items:center; }
        .brand-wrap{
          position: relative; display:grid; place-items:center;
          padding: 6px 6px; isolation:isolate;
        }

        /* Aurea arcobaleno tenue dietro */
        .logo-halo{
          position:absolute; inset:-26px -34px; z-index:0; pointer-events:none;
          border-radius: 9999px;
          background:
            conic-gradient(from var(--ang),
              rgba(139,92,246,.55), /* violet */
              rgba(96,165,250,.45), /* blue  */
              rgba(34,211,238,.40), /* cyan  */
              rgba(244,114,182,.40),/* pink  */
              rgba(245,158,11,.38), /* amber */
              rgba(139,92,246,.55));
          filter: blur(28px) saturate(1.15);
          opacity:.65;
          mix-blend-mode: screen;
          animation: spinAng var(--cycle) linear infinite;
        }

        /* Contorno neon morbido (non riempie il testo) */
        .logo-stroke{
          position:absolute; z-index:1; pointer-events:none;
          font-family: "Orbitron", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .38rem;
          font-size: clamp(2.1rem, 5vw, 3rem);
          text-transform: uppercase;
          color: transparent; -webkit-text-fill-color: transparent;
          -webkit-text-stroke: 2px #7c3aed; /* viola pieno come base del neon */
          filter: blur(6px) brightness(1.8) saturate(1.8);
          opacity:.9;
          animation: pulseGlow var(--pulse) ease-in-out infinite;
        }

        /* Trama “AI scan” (righe nel testo) */
        .logo-scan{
          position:absolute; z-index:2; pointer-events:none;
          font-family: "Orbitron", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .38rem;
          font-size: clamp(2.1rem, 5vw, 3rem);
          text-transform: uppercase;
          background:
            linear-gradient(90deg, transparent 0 46%, rgba(255,255,255,.55) 50%, transparent 54%),
            repeating-linear-gradient(180deg, rgba(255,255,255,.10) 0 2px, transparent 2px 6px);
          background-size: 200% 100%, 100% 100%;
          background-position: 0% 0%, 50% 50%;
          -webkit-background-clip: text; color: transparent; -webkit-text-fill-color: transparent;
          mix-blend-mode: screen; opacity:.35;
          animation: scanX 2.6s linear infinite;
        }

        /* Core 3D con gradiente dinamico (mai bianco) */
        .logo-core{
          position:relative; z-index:3; display:inline-block;
          font-family: "Orbitron", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .38rem;
          font-size: clamp(2.1rem, 5vw, 3rem);
          text-transform: uppercase;

          /* riempimento a gradiente in rotazione + sweep */
          --ang: 0deg;
          background:
            conic-gradient(from var(--ang) at 50% 50%, var(--c1), var(--c2), var(--c3), var(--c4), var(--c5), var(--c1));
          background-size: 200% 200%;
          background-position: 50% 50%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;

          /* bordo inciso + estrusione (rilievo) */
          -webkit-text-stroke: 1.4px rgba(0,0,0,.85);
          paint-order: stroke fill;
          text-shadow:
            /* highlights */
            -1px -1px 0 rgba(255,255,255,.80),
            /* estrusione */
            1px 1px 0 rgba(0,0,0,.64),
            2px 2px 0 rgba(0,0,0,.62),
            3px 3px 1px rgba(0,0,0,.60),
            4px 4px 2px rgba(0,0,0,.58),
            6px 7px 6px rgba(0,0,0,.50),
            10px 12px 16px rgba(0,0,0,.46);

          animation:
            spinAng var(--cycle) linear infinite,
            sweepBG calc(var(--cycle) * 1.1) linear infinite,
            pulseCore var(--pulse) ease-in-out infinite;
        }
        /* estrusione solida retro */
        .logo-core::after{
          content: attr(data-text);
          position:absolute; inset:0; z-index:-1; pointer-events:none;
          transform: translate(6px, 8px);
          color: var(--deep);
          letter-spacing: inherit; font: inherit; -webkit-text-stroke: 0;
          filter: blur(.7px); opacity:.98;
          animation: extrudeBreath var(--pulse) ease-in-out infinite;
        }
        /* riflesso vetroso superiore */
        .logo-core::before{
          content:""; position:absolute; left:-4%; right:-4%; top:0; height:58%;
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
          --c1:#8b5cf6; --c2:#60a5fa;
          position: relative;
          display:grid; place-items:center;
          padding: 12px 20px; border-radius: 16px;
          text-decoration:none; color:#eef2ff;
          border:1px solid rgba(255,255,255,.14);
          background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 10px 22px rgba(0,0,0,.28);
          transition: transform .18s ease, box-shadow .2s ease;
          overflow: hidden;
        }
        .link::before{
          /* riflesso scorrevole tipo vetro */
          content:""; position:absolute; left:-60%; top:-160%; width:60%; height:320%;
          background: linear-gradient(130deg, rgba(255,255,255,.16), transparent 40%);
          transform: rotate(12deg);
          animation: sheen 5s linear infinite;
          pointer-events:none;
        }

        .label{
          position:relative;
          font-weight:900; letter-spacing:.06rem;
          background: linear-gradient(90deg, var(--c1), var(--c2), var(--c1));
          background-size:220% auto; -webkit-background-clip:text; color:transparent;

          /* neon “americano” colorato (no bianco) */
          text-shadow:
            0 0 6px color-mix(in oklab, var(--c2) 80%, #000),
            0 0 16px color-mix(in oklab, var(--c1) 80%, #000),
            1px 1px 0 rgba(0,0,0,.55);

          animation:
            sweepBG var(--cycle) linear infinite,
            pulseLabel var(--pulse) ease-in-out infinite;
        }
        .label::after{
          /* aurea morbida dietro ogni voce */
          content:""; position:absolute; inset:-8px -10px; pointer-events:none;
          border-radius: 9999px;
          background: radial-gradient(60% 55% at 50% 50%,
            color-mix(in oklab, var(--c1) 42%, transparent),
            color-mix(in oklab, var(--c2) 30%, transparent) 40%,
            transparent 70%);
          mix-blend-mode: screen;
          filter: blur(12px);
          opacity:.55;
          animation: pulseAura var(--pulse) ease-in-out infinite;
        }

        .link:hover{ transform: translateY(-1px) scale(1.02); }
        .link.is-active{
          background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.05));
          border-color: rgba(255,255,255,.22);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 18px 36px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.06) inset;
        }

        /* ===== KEYFRAMES ===== */
        @keyframes spinAng { to { --ang: 360deg; } }
        @keyframes sweepBG { to { background-position: 200% 50%; } }
        @keyframes scanX  { to { background-position: 200% 0, 50% 50%; } }
        @keyframes pulseGlow {
          0%,100% { filter: blur(6px) brightness(1.4) saturate(1.4); opacity:.85; }
          50%     { filter: blur(10px) brightness(2.0) saturate(2.0); opacity:1; }
        }
        @keyframes pulseCore {
          0%,100% { transform: scale(1); filter: contrast(1) brightness(1); }
          50%     { transform: scale(1.04); filter: contrast(1.1) brightness(1.08); }
        }
        @keyframes extrudeBreath {
          0%,100% { transform: translate(6px, 8px); opacity:.98; }
          50%     { transform: translate(7px, 10px); opacity:1; }
        }
        @keyframes shineSweep { 0% { transform: translateY(0) } 100% { transform: translateY(-3%) } }
        @keyframes pulseLabel {
          0%,100% { filter: brightness(1) saturate(1); }
          50%     { filter: brightness(1.3) saturate(1.5); }
        }
        @keyframes pulseAura {
          0%,100% { opacity:.48; transform: scale(1); }
          50%     { opacity:.8;  transform: scale(1.06); }
        }
        @keyframes sheen { 0% { left:-60%; } 100% { left:160%; } }

        @media (prefers-reduced-motion: reduce) {
          .logo-halo, .logo-stroke, .logo-scan, .logo-core,
          .logo-core::before, .logo-core::after,
          .label, .label::after, .link::before { animation: none !important; }
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 10px 12px; }
          .brand{ justify-content: center; }
          .track{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%; }
          .link{ width:100%; padding:10px 12px; text-align:center; border-radius:14px; }
        }
        @media (min-width: 561px) and (max-width: 860px){
          .inner{ padding: 8px 12px; }
          .track{ flex-wrap: wrap; gap: 12px; }
        }
      `}</style>
    </>
  );
}
