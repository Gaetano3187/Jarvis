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
          {/* ===== BRAND: vulcano + roccia che si spacca ciclicamente ===== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-wrap" title="JARVIS">
              {/* Aura caleidoscopica soft */}
              <span className="logo-aura" aria-hidden="true" />
              {/* Glow neon pulsante (dietro testo) */}
              <span className="logo-glow" aria-hidden="true" data-text="JARVIS">JARVIS</span>

              {/* Testo 3D scolpito nella pietra */}
              <span className="logo-text" data-text="JARVIS">JARVIS</span>

              {/* SCENA VULCANO: roccia, crepe, lava, frammenti (in loop) */}
              <span className="logo-scene" aria-hidden="true">
                <span className="rock-core" />
                <span className="rock-cracks" />
                <span className="lava-flare" />
                <span className="debris d1" />
                <span className="debris d2" />
                <span className="debris d3" />
                <span className="debris d4" />
              </span>
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
          --nav-bg: rgba(6, 10, 28, .58);   /* vetro scuro */
          --nav-brd: rgba(255,255,255,.14); /* bordo vetro */
          --nav-brd2: rgba(255,255,255,.06);
          --nav-sheen: rgba(255,255,255,.18);
          --text: #f8fafc;

          /* durata ciclo animazione logo */
          --cycle: 6.2s;
        }

        .nav{
          position: sticky; top: 0; z-index: 60;
          width: 100%;
          background: linear-gradient(180deg, rgba(10,14,34,.62), rgba(6,10,28,.50));
          backdrop-filter: blur(14px) saturate(1.25);
          -webkit-backdrop-filter: blur(14px) saturate(1.25);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: inset 0 1px 0 var(--nav-brd2), 0 20px 40px rgba(0,0,0,.35);
        }
        .nav::after{
          /* riflesso “vetrificato” in alto */
          content:""; position: absolute; inset: 0 0 auto 0; height: 52%;
          background: linear-gradient(180deg, var(--nav-sheen), transparent 60%);
          pointer-events: none; opacity: .25;
        }
        .inner{
          min-height: 70px; display: flex; align-items: center;
          gap: 22px; padding: 8px 16px;
        }

        /* ===== LOGO ===== */
        .brand{ text-decoration:none; display:inline-flex; align-items:center; }
        .brand-wrap{
          position: relative; display:inline-grid; place-items:center;
          padding: 10px 6px; isolation:isolate;
        }

        .logo-aura{
          position:absolute; inset:-22px -28px; z-index:0; pointer-events:none;
          background:
            conic-gradient(from 0deg at 50% 50%,
              rgba(255,81,0,.72) 0deg,      /* lava */
              rgba(229,43,80,.60) 120deg,   /* magenta caldo */
              rgba(234,179,8,.65) 240deg,   /* amber */
              rgba(255,81,0,.72) 360deg);
          filter: blur(30px) saturate(1.15);
          opacity:.70; mix-blend-mode: screen;
          border-radius: 9999px;
          clip-path: ellipse(80% 66% at 50% 50%);
          -webkit-mask-image: radial-gradient(ellipse at center, #000 70%, transparent 80%);
                  mask-image: radial-gradient(ellipse at center, #000 70%, transparent 80%);
          animation: auraDrift calc(var(--cycle) * 2) linear infinite;
        }

        .logo-glow{
          position:absolute; z-index:1; inset:0; pointer-events:none;
          display:inline-grid; place-items:center;
          font-family: "Orbitron", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .32rem;
          font-size: clamp(2rem, 4.8vw, 2.6rem); line-height: 1; white-space: nowrap;
          text-transform: uppercase;
          background:
            conic-gradient(from 0deg at 50% 50%,
              #ff5a00 0deg, #e11d48 120deg, #f59e0b 240deg, #ff5a00 360deg);
          background-size: 220% 220%;
          background-position: 0% 50%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;
          mix-blend-mode: screen;
          filter: blur(16px) brightness(1.95) saturate(2.0);
          opacity: .98;
          animation:
            sweepLR calc(var(--cycle) * 1.1) linear infinite,
            neonPulse 2.1s ease-in-out infinite;
        }

        .logo-text{
          position:relative; z-index:2; display:inline-block;
          font-family: "Orbitron", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .32rem;
          font-size: clamp(2rem, 4.8vw, 2.6rem); line-height: 1; white-space: nowrap;
          text-transform: uppercase;

          /* bordo inciso / scolpito */
          -webkit-text-stroke: 1.3px #0b0b0b; paint-order: stroke fill;

          /* estrusione pietra 3D */
          text-shadow:
            -1px -1px 0 rgba(255,255,255,.75),
             1px  1px 0 rgba(0,0,0,.62),
             2px  2px 0 rgba(0,0,0,.60),
             3px  3px 0 rgba(0,0,0,.58),
             4px  4px 0 rgba(0,0,0,.56),
             5px  6px 1px rgba(0,0,0,.54),
             8px 10px 14px rgba(0,0,0,.55);

          /* metallo lavico che cambia colore solo dentro il testo */
          background:
            conic-gradient(from 0deg at 50% 50%,
              #ffd166 0deg, #ff5a00 120deg, #e11d48 240deg, #ffd166 360deg);
          background-size: 240% 240%;
          background-position: 0% 50%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;
          animation: sweepLR calc(var(--cycle) * 1.1) linear infinite;
        }
        .logo-text::after{
          /* estrusione solida retro */
          content: attr(data-text);
          position:absolute; inset:0; pointer-events:none;
          transform: translate(5px, 7px);
          z-index: -1;
          color: rgba(0,0,0,.68);
          letter-spacing: inherit; font: inherit; -webkit-text-stroke: 0;
          filter: blur(.8px);
        }

        /* ===== SCENA VULCANO (loop continuo) ===== */
        .logo-scene{
          position:absolute; inset:-6px -8px; z-index:3; pointer-events:none;
          display:block;
          animation: sceneLoop var(--cycle) ease-out infinite;
        }
        /* Roccia principale che si spacca, ciclica */
        .rock-core{
          position:absolute; inset:8px 0; margin:auto; height:34px; width: clamp(170px, 28vw, 280px);
          background:
            radial-gradient(120% 160% at 20% 20%, rgba(255,255,255,.10), transparent 50%),
            radial-gradient(140% 160% at 80% 80%, rgba(255,255,255,.08), transparent 58%),
            linear-gradient(180deg, #3b3b3b, #242424 40%, #151515 100%);
          border-radius: 10px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.08),
            inset 0 -2px 6px rgba(0,0,0,.55),
            0 12px 24px rgba(0,0,0,.45);
          transform-origin: center;
          animation: rockCrackOut calc(var(--cycle) * 0.20) cubic-bezier(.2,.8,.2,1) calc(var(--cycle) * 0.13) infinite;
        }
        /* Crepe luminose */
        .rock-cracks{
          position:absolute; inset:8px 0; margin:auto; height:34px; width: clamp(170px, 28vw, 280px);
          background:
            repeating-linear-gradient(110deg, transparent 0 9px, rgba(0,0,0,.18) 9px 10px),
            radial-gradient(60% 180% at 50% 10%, rgba(0,0,0,.35), transparent 60%);
          -webkit-mask: radial-gradient(100% 100% at 50% 50%, #000 65%, transparent 70%);
                  mask: radial-gradient(100% 100% at 50% 50%, #000 65%, transparent 70%);
          opacity:.0;
          animation:
            cracksGlow calc(var(--cycle) * 0.10) ease-out calc(var(--cycle) * 0.10) infinite,
            cracksFade calc(var(--cycle) * 0.14) ease-out calc(var(--cycle) * 0.24) infinite;
          filter: drop-shadow(0 0 10px rgba(255,90,0,.55));
        }
        /* Bagliore lava */
        .lava-flare{
          position:absolute; inset:-6px -18px;
          background:
            radial-gradient(60% 50% at 50% 50%, rgba(255,90,0,.95), rgba(255,140,0,.55) 35%, transparent 60%),
            radial-gradient(100% 80% at 50% 60%, rgba(255,225,120,.65), transparent 60%);
          filter: blur(16px) saturate(1.4) brightness(1.2);
          opacity: 0; mix-blend-mode: screen;
          animation: lavaBurst calc(var(--cycle) * 0.09) ease-out calc(var(--cycle) * 0.22) infinite;
        }
        /* Frammenti di roccia */
        .debris{
          position:absolute; width:10px; height:6px; background: #1d1d1d;
          border-radius: 2px; opacity:0; transform: translate(0,0) rotate(0deg);
          box-shadow: 0 1px 0 rgba(255,255,255,.05), 0 6px 12px rgba(0,0,0,.5);
        }
        .d1{ left: 10%; top: 30%; animation: debrisFly calc(var(--cycle) * 0.10) ease-out calc(var(--cycle) * 0.20) infinite; --dx:-90px; --dy:-60px; }
        .d2{ left: 30%; top: 10%; animation: debrisFly calc(var(--cycle) * 0.11) ease-out calc(var(--cycle) * 0.21) infinite; --dx:-40px; --dy:-80px; }
        .d3{ right: 22%; top: 28%; animation: debrisFly calc(var(--cycle) * 0.12) ease-out calc(var(--cycle) * 0.21) infinite; --dx: 60px; --dy:-70px; }
        .d4{ right: 8%;  top: 12%; animation: debrisFly calc(var(--cycle) * 0.12) ease-out calc(var(--cycle) * 0.22) infinite; --dx:110px; --dy:-50px; }

        /* ===== MENU ===== */
        .track{
          display:flex; gap:14px; list-style:none; margin:0; padding:0;
        }
        .item{ flex: 0 0 auto; }
        .item.spacer{ visibility:hidden; height:0; padding:0; margin:0; }

        .link{
          --c1:#5eead4; --c2:#22d3ee;
          position: relative;
          display:inline-grid; place-items:center;
          padding: 12px 20px; border-radius: 16px;
          text-decoration:none; color:var(--text);
          border:1px solid rgba(255,255,255,.12);
          background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 12px 24px rgba(0,0,0,.30);
          transition: transform .18s ease, background .2s ease, box-shadow .2s ease;
          overflow: hidden;
        }
        .link::before{
          /* riflesso scorrevole sul vetro */
          content:""; position:absolute; left:-60%; top:-120%; width:60%; height:300%;
          background: linear-gradient(130deg, rgba(255,255,255,.12), transparent 40%);
          transform: rotate(12deg);
          animation: sheenMove 5.5s linear infinite;
          pointer-events:none;
        }
        .label{
          font-weight:900; letter-spacing:.06rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size:220% auto; -webkit-background-clip:text; background-clip:text; color:transparent;
          text-shadow: 0 0 6px rgba(255,255,255,.35), 0 0 14px rgba(34,211,238,.35);
          animation: sweepLR calc(var(--cycle) * 1.2) linear infinite, neonPulseSoft 2.8s ease-in-out infinite;
        }
        .link:hover{ transform: translateY(-1px) scale(1.02); }
        .link.is-active{
          background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04));
          border-color: rgba(255,255,255,.22);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 18px 38px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.06) inset;
        }

        /* ===== KEYFRAMES ===== */
        @keyframes sweepLR { to { background-position: 100% 50%; } }
        @keyframes neonPulse {
          0%, 100% { filter: blur(12px) brightness(1.45) saturate(1.5); opacity:.88; }
          50%      { filter: blur(20px) brightness(2.15) saturate(2.0); opacity:1;  }
        }
        @keyframes neonPulseSoft {
          0%, 100% { filter: brightness(1.0); }
          50%      { filter: brightness(1.25); }
        }
        @keyframes auraDrift {
          0% { transform: rotate(0deg) scale(1); }
          100% { transform: rotate(360deg) scale(1.02); }
        }
        @keyframes sheenMove { 0% { left: -60%; } 100% { left: 160%; } }

        /* Roccia che “si apre” e svanisce rivelando il testo */
        @keyframes rockCrackOut {
          0%   { transform: scale(1) rotate(0deg); opacity:1; }
          40%  { transform: scale(1.02) rotate(-0.6deg); }
          60%  { transform: scale(1.03) rotate(0.6deg); }
          100% { transform: scale(0.96) translateY(-18px); opacity:0; filter: blur(3px); }
        }
        @keyframes cracksGlow {
          0%   { opacity:0; filter: drop-shadow(0 0 0 rgba(255,90,0,0)); }
          100% { opacity:.85; filter: drop-shadow(0 0 14px rgba(255,90,0,.7)); }
        }
        @keyframes cracksFade { to { opacity:0; } }
        @keyframes lavaBurst {
          0%   { opacity:0; transform: scale(.8); }
          80%  { opacity:1; transform: scale(1.05); }
          100% { opacity:.0; transform: scale(1.15); }
        }
        @keyframes debrisFly {
          0%   { opacity:0; transform: translate(0,0) rotate(0deg); }
          30%  { opacity:1; }
          100% { opacity:0; transform: translate( var(--dx, 80px), var(--dy, -60px)) rotate(25deg); }
        }

        /* sincronizzazione ciclo */
        @keyframes sceneLoop { 0%, 100% { opacity:1; } }

        @media (prefers-reduced-motion: reduce) {
          .logo-aura, .logo-glow, .logo-text, .logo-scene, .label, .link::before {
            animation: none !important;
          }
        }

        /* ===== SMARTPHONE: 3 colonne ===== */
        @media (max-width: 560px){
          .inner{
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            padding: 8px 10px 12px;
          }
          .brand{ justify-content: center; }
          .logo-text, .logo-glow{
            font-size: clamp(2rem, 8vw, 2.6rem);
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
