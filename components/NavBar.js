// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const links = [
  { href: '/home',             label: 'Home',           c1: '#a78bfa', c2: '#93c5fd' },
  { href: '/dashboard',        label: 'Dashboard',      c1: '#c084fc', c2: '#93c5fd' },
  { href: '/liste-prodotti',   label: 'Liste Prodotti', c1: '#a78bfa', c2: '#93c5fd' },
  { href: '/finanze',          label: 'Finanze',        c1: '#a78bfa', c2: '#93c5fd' },
  { href: '/spese-casa',       label: 'Casa',           c1: '#a78bfa', c2: '#93c5fd' },
  { href: '/vestiti-ed-altro', label: 'Vestiti',        c1: '#a78bfa', c2: '#93c5fd' },
  { href: '/cene-aperitivi',   label: 'Cene',           c1: '#a78bfa', c2: '#93c5fd' },
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
          {/* LOGO 3D IN RILIEVO + PULSAZIONE + KALEIDOSCOPIO */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-wrap">
              {/* alone neon diffuso */}
              <span className="logo-glow" aria-hidden="true" data-text="JARVIS">JARVIS</span>
              {/* testo estruso 3D */}
              <span className="logo-3d" data-text="JARVIS">JARVIS</span>
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
          --nav-bg: rgba(5, 8, 22, 0.72);
          --nav-brd: rgba(255,255,255,.12);

          --violet: #a78bfa;        /* violetto */
          --blue:   #93c5fd;        /* azzurro pastello */
          --deep:   #0b0b0f;        /* ombra profonda */

          --cycle: 5.2s;            /* durata animazione colori */
          --pulse: 1.15s;           /* durata pulsazione */
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

        /* ALONE NEON DIFFUSO (dietro al testo) */
        .logo-glow{
          position:absolute; inset:-6px -10px; z-index:0; pointer-events:none;
          display:grid; place-items:center;
          font-family: "Orbitron", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .36rem;
          font-size: clamp(2.1rem, 5vw, 2.8rem);
          text-transform: uppercase;
          background:
            conic-gradient(from 0deg at 50% 50%, var(--violet), var(--blue), var(--violet));
          background-size: 300% 300%;
          -webkit-background-clip: text; color: transparent;
          filter: blur(18px) brightness(2.1) saturate(2.1);
          opacity:.95;
          animation:
            kaleido var(--cycle) linear infinite,
            pulseGlow var(--pulse) ease-in-out infinite;
        }

        /* TESTO 3D IN RILIEVO (bevel + estrusione) */
        .logo-3d{
          position:relative; z-index:1; display:inline-block;
          font-family: "Orbitron", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .36rem;
          font-size: clamp(2.1rem, 5vw, 2.8rem);
          text-transform: uppercase;

          /* riempimento caleidoscopico */
          background: conic-gradient(from 0deg at 50% 50%, var(--violet), var(--blue), var(--violet));
          background-size: 280% 280%;
          background-position: 0% 50%;
          -webkit-background-clip: text; color: transparent;

          /* bordo inciso (bevel) */
          -webkit-text-stroke: 1.4px rgba(0,0,0,.85);
          paint-order: stroke fill;

          /* rilievo: highlights + stack ombre per profondità */
          text-shadow:
            -1px -1px 0 rgba(255,255,255,.80), /* highlight cime */
            1px 1px 0 rgba(0,0,0,.65),
            2px 2px 0 rgba(0,0,0,.62),
            3px 3px 0 rgba(0,0,0,.60),
            4px 4px 0 rgba(0,0,0,.58),
            5px 5px 1px rgba(0,0,0,.56),
            6px 6px 2px rgba(0,0,0,.54),
            8px 9px 6px rgba(0,0,0,.50),
            12px 14px 18px rgba(0,0,0,.46);

          /* animazioni: colore + pulsazione */
          animation:
            kaleido var(--cycle) linear infinite,
            pulseCore var(--pulse) ease-in-out infinite;
        }

        /* estrusione solida dietro (profondità) */
        .logo-3d::after{
          content: attr(data-text);
          position:absolute; inset:0; z-index:-1; pointer-events:none;
          transform: translate(6px, 8px);
          color: var(--deep);
          letter-spacing: inherit; font: inherit;
          -webkit-text-stroke: 0;
          filter: blur(.6px);
          opacity:.95;
          /* leggero respiro per accentuare 3D */
          animation: extrudeBreath var(--pulse) ease-in-out infinite;
        }

        /* BRILLORE “vetroso” sulla parte alta (speculare) */
        .logo-3d::before{
          content:""; position:absolute; left:-4%; right:-4%; top:0; height:55%;
          background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0));
          mix-blend-mode: screen; border-radius: 16px / 60%;
          filter: blur(2px); opacity:.6;
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
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.10),
            0 10px 22px rgba(0,0,0,.28);
          transition: transform .18s ease, box-shadow .2s ease;
          overflow: hidden;
        }
        .link::before{
          /* riflesso scorrevole */
          content:""; position:absolute; left:-60%; top:-160%; width:60%; height:320%;
          background: linear-gradient(130deg, rgba(255,255,255,.16), transparent 40%);
          transform: rotate(12deg);
          animation: sheen 5s linear infinite;
          pointer-events:none;
        }
        .label{
          font-weight:900; letter-spacing:.06rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size:220% auto; -webkit-background-clip:text; color:transparent;

          /* neon “spesso” + rilievo leggero */
          text-shadow:
            0 0 4px var(--c2),
            0 0 12px var(--c1),
            1px 1px 0 rgba(0,0,0,.55),
            2px 2px 0 rgba(0,0,0,.45);

          animation:
            sweep var(--cycle) linear infinite,
            pulseLabel var(--pulse) ease-in-out infinite;
        }
        .link:hover{ transform: translateY(-1px) scale(1.02); }
        .link.is-active{
          background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.05));
          border-color: rgba(255,255,255,.22);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.16),
            0 18px 36px rgba(0,0,0,.34),
            0 0 0 1px rgba(255,255,255,.06) inset;
        }

        /* ===== ANIMAZIONI ===== */
        @keyframes kaleido { to { background-position: 200% 50%; } }
        @keyframes sweep   { to { background-position: 200% 50%; } }

        /* pulsazione intensa (glow diffuso) */
        @keyframes pulseGlow {
          0%,100% { filter: blur(16px) brightness(1.6) saturate(1.6); opacity:.9; }
          50%     { filter: blur(22px) brightness(2.4) saturate(2.2); opacity:1; }
        }
        /* pulsazione del core 3D (scala + contrasto) */
        @keyframes pulseCore {
          0%,100% { transform: translateZ(0) scale(1); filter: contrast(1) brightness(1); }
          50%     { transform: translateZ(0) scale(1.035); filter: contrast(1.1) brightness(1.08); }
        }
        /* respiro dell’estrusione */
        @keyframes extrudeBreath {
          0%,100% { transform: translate(6px, 8px); opacity:.95; }
          50%     { transform: translate(7px, 10px); opacity:1; }
        }
        /* riflesso superiore che scorre piano */
        @keyframes shineSweep {
          0%   { transform: translateY(0) }
          100% { transform: translateY(-3%) }
        }
        /* pulsazione label menu (leggera ma visibile) */
        @keyframes pulseLabel {
          0%,100% { filter: brightness(1) saturate(1); text-shadow: 0 0 6px var(--c2), 0 0 16px var(--c1), 1px 1px 0 rgba(0,0,0,.55); }
          50%     { filter: brightness(1.35) saturate(1.6); text-shadow: 0 0 12px var(--c2), 0 0 28px var(--c1), 1px 1px 0 rgba(0,0,0,.55); }
        }
        /* sheen bottoni */
        @keyframes sheen { 0% { left:-60%; } 100% { left:160%; } }

        @media (prefers-reduced-motion: reduce) {
          .logo-glow, .logo-3d, .logo-3d::after, .logo-3d::before, .label, .link::before {
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
