// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

/* === NAV LINKS === */
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

/* ===================== LOGO ANIMATO A FULMINI + GRADIENTE PULSANTE ===================== */
function LightningLogo({ text = 'JARVIS' }) {
  return (
    <div className="logoAura" aria-hidden="true">
      <svg className="bolt-svg" viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet" aria-label={`${text} logo elettrico`}>
        <defs>
          {/* Glow esterno forte */}
          <filter id="outerGlow" x="-60%" y="-60%" width="220%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="b2"/>
            <feColorMatrix in="b2" type="matrix" values="
              0 0 0 0 0.28
              0 0 0 0 0.75
              0 0 0 0 1
              0 0 0 1 0" result="cyan"/>
            <feMerge>
              <feMergeNode in="cyan"/>
              <feMergeNode in="b1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Tremolio elettrico */}
          <filter id="electricDisplace" x="-20%" y="-40%" width="140%" height="220%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="12" result="noise">
              <animate attributeName="baseFrequency" dur="4s" values="0.008;0.02;0.012;0.015;0.008" repeatCount="indefinite"/>
              <animate attributeName="seed" dur="5s" values="12;42;18;33;12" repeatCount="indefinite"/>
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" />
          </filter>

          {/* alone interno */}
          <filter id="innerGlow" x="-60%" y="-60%" width="220%" height="260%">
            <feGaussianBlur stdDeviation="2" result="b1"/>
            <feComposite in="SourceGraphic" in2="b1" operator="over" />
          </filter>

          {/* gradiente neon testo */}
          <linearGradient id="neon" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"  stopColor="#a5f3fc"/>
            <stop offset="50%" stopColor="#60a5fa"/>
            <stop offset="100%" stopColor="#38bdf8"/>
          </linearGradient>

          {/* mask per far passare i fulmini dentro il testo */}
          <mask id="textMask">
            <rect width="100%" height="100%" fill="black"/>
            <text x="50%" y="50%" dy="24" textAnchor="middle"
              fontFamily="Orbitron, system-ui, sans-serif" fontWeight="900" fontSize="122"
              fill="white" style={{ letterSpacing: '10px' }}>{text}</text>
          </mask>

          <style>{`
            .txt-stroke{ fill:transparent; stroke:url(#neon); stroke-width:6; filter:url(#outerGlow); }
            .txt-core{ fill:url(#neon); filter:url(#innerGlow); opacity:.92; }
            .bolt{ fill:none; stroke:#b3ecff; stroke-width:3.2; stroke-linecap:round; filter:url(#outerGlow); }
            .bolt2{ stroke-width:1.8; opacity:.85; }
            .spark{ stroke:#e0f2fe; stroke-width:1.2; opacity:.9; }
          `}</style>
        </defs>

        {/* contorno neon + distorsione */}
        <g filter="url(#electricDisplace)">
          <text x="50%" y="50%" dy="24" textAnchor="middle"
            fontFamily="Orbitron, system-ui, sans-serif" fontWeight="900" fontSize="122"
            className="txt-stroke" style={{ letterSpacing: '10px' }}>{text}</text>
        </g>

        {/* riempimento */}
        <text x="50%" y="50%" dy="24" textAnchor="middle"
          fontFamily="Orbitron, system-ui, sans-serif" fontWeight="900" fontSize="122"
          className="txt-core" style={{ letterSpacing: '10px' }}>{text}</text>

        {/* fulmini che attraversano il testo */}
        <g mask="url(#textMask)">
          <path className="bolt"
            d="M 60 120 C 130 60, 220 140, 300 90 S 440 80, 520 120 S 660 100, 820 80">
            <animate attributeName="stroke-dasharray" dur="1.2s" values="0 900; 450 900; 0 900" repeatCount="indefinite"/>
            <animate attributeName="opacity" dur="1.2s" values="0;1;0" repeatCount="indefinite"/>
          </path>

          <path className="bolt bolt2"
            d="M 80 80 C 150 110, 210 70, 320 120 S 480 60, 600 110 S 700 70, 840 120">
            <animate attributeName="stroke-dasharray" dur="1.55s" values="0 900; 470 900; 0 900" repeatCount="indefinite"/>
            <animate attributeName="opacity" dur="1.55s" values="0;1;0" repeatCount="indefinite" begin=".25s"/>
          </path>

          {/* scintille */}
          <path className="spark" d="M160 70 L150 60 M166 72 L172 56 M520 68 L530 52 M525 70 L515 58">
            <animate attributeName="opacity" dur="0.9s" values="0;1;0" repeatCount="indefinite" begin=".1s"/>
          </path>
          <path className="spark" d="M360 132 L350 148 M366 126 L372 144 M680 126 L690 144 M686 120 L676 138">
            <animate attributeName="opacity" dur="1.1s" values="0;1;0" repeatCount="indefinite" begin=".35s"/>
          </path>
        </g>
      </svg>

      {/* alone pulsante e caleidoscopico dietro il logo */}
      <style jsx>{`
        .logoAura{
          position: relative;
          display: grid;
          place-items: center;
        }
        .logoAura::before{
          content: "";
          position: absolute; inset: -14% -10%;
          border-radius: 50%;
          filter: blur(28px);
          opacity: .9;
          background:
            radial-gradient(60% 60% at 50% 50%,
              rgba(255,255,255,.18), transparent 62%),
            conic-gradient(from 0deg,
              #2dd4ff, #17b3a6, #ef4444, #2dd4ff);
          animation: kaleido 6.5s linear infinite, pulse 1.8s ease-in-out infinite;
          z-index: -1;
        }
        @keyframes kaleido { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{ transform: scale(1); opacity:.75 } 50%{ transform: scale(1.12); opacity:1 } }
      `}</style>
    </div>
  );
}

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
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">
          {/* ===== LOGO ===== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="bolt-logo" title="JARVIS">
              <LightningLogo />
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
                    <span className="active-glow" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
            {mobileFillers.map(key => <li key={key} className="item spacer" aria-hidden="true" />)}
          </ul>
        </div>
      </nav>

      <style jsx>{`
        :root{
          --glass: rgba(11, 16, 30, .55);
          --glass2: rgba(255,255,255,.08);
          --glassBorder: rgba(255,255,255,.22);
        }

        /* ===== NAV glass con rilievo vetrato molto accentuato ===== */
        .nav{
          position: sticky; top: 0; z-index: 60; width: 100%;
          background: var(--glass);
          backdrop-filter: blur(22px) saturate(1.25) contrast(1.05);
          -webkit-backdrop-filter: blur(22px) saturate(1.25) contrast(1.05);
          border-bottom: 1px solid rgba(255,255,255,.09);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.35),      /* highlight superiore */
            inset 0 -2px 6px rgba(0,0,0,.55),         /* inner-ombra bassa */
            0 30px 60px rgba(0,0,0,.45),              /* ombra esterna */
            0 0 80px rgba(80,180,255,.15);            /* alone freddo */
        }
        /* bordo vetroso con effetto "bevel" */
        .nav::before{
          content:"";
          position:absolute; inset:0;
          border-radius: 0;
          background:
            linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 40%),
            linear-gradient(0deg, rgba(255,255,255,.12), rgba(255,255,255,0) 70%);
          mix-blend-mode: screen;
          pointer-events:none;
        }
        /* riflesso mobile */
        .nav::after{
          content:"";
          position:absolute; left:-20%; top:-140%;
          width:60%; height:300%;
          transform: rotate(12deg);
          background: linear-gradient(130deg, rgba(255,255,255,.18), transparent 45%);
          filter: blur(8px);
          opacity:.8;
          animation: sheen 7s linear infinite;
          pointer-events:none;
        }
        @keyframes sheen { 0%{ left:-20% } 100%{ left:120% } }

        .inner{ min-height: 78px; display:flex; align-items:center; gap:18px; padding:12px 16px; position:relative; }

        /* ===== LOGO ===== */
        .brand{ text-decoration:none; display:flex; align-items:center; }
        .bolt-logo{ display:grid; place-items:center; padding:0 2px; position:relative; }
        .bolt-svg{ width:min(420px, 70vw); height:auto; }

        /* ===== MENU ===== */
        .track{ display:flex; gap:12px; list-style:none; margin:0; padding:0; }
        .item{ flex: 0 0 auto; }
        .item.spacer{ visibility:hidden; height:0; padding:0; margin:0; }

        .link{
          --c1:#8b5cf6; --c2:#60a5fa;
          position: relative; display:grid; place-items:center;
          padding: 11px 16px; border-radius: 14px;
          text-decoration:none; color:#eef2ff;
          border:1px solid var(--glassBorder);
          background:
            linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.06)),
            linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.20));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.45),
            inset 0 -2px 6px rgba(0,0,0,.55),
            0 10px 28px rgba(0,0,0,.35);
          transition: transform .18s ease, box-shadow .2s ease, border-color .2s ease;
          overflow: hidden;
        }
        .link::before{
          content:""; position:absolute; inset:-12px;
          background: radial-gradient(120% 120% at 20% 0%,
            rgba(255,255,255,.18), transparent 50%);
          mix-blend-mode: screen; opacity:.6; pointer-events:none;
        }
        .label{
          position:relative; font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2), var(--c1));
          background-size:220% auto; -webkit-background-clip:text; color:transparent;
          text-shadow: 0 0 6px rgba(0,0,0,.55), 1px 1px 0 rgba(0,0,0,.5);
          animation: sweepBG 8s linear infinite, pulseLabel 1.2s ease-in-out infinite;
        }
        .active-glow{
          position:absolute; inset:-10px; border-radius:18px; pointer-events:none;
          background:
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c2), white 20%) 0%, transparent 65%);
          opacity:0; filter: blur(14px); transition: opacity .25s ease;
        }

        .link:hover{ transform: translateY(-1px) scale(1.02); }
        .link.is-active{
          background:
            linear-gradient(180deg, rgba(255,255,255,.26), rgba(255,255,255,.10)),
            linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.25));
          border-color: rgba(255,255,255,.35);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.65),
            inset 0 -3px 8px rgba(0,0,0,.65),
            0 18px 36px rgba(0,0,0,.45),
            0 0 24px color-mix(in oklab, var(--c2), white 25%),
            0 0 60px color-mix(in oklab, var(--c2), white 15%);
        }
        .link.is-active .active-glow{ opacity:.95; }

        @keyframes sweepBG { to { background-position: 200% 50%; } }
        @keyframes pulseLabel { 0%,100%{ filter:brightness(1) } 50%{ filter:brightness(1.2) } }

        @media (prefers-reduced-motion: reduce) {
          .bolt-svg, .label, .link::before, .nav::after, .logoAura::before { animation: none !important; }
        }
        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 10px 12px; }
          .brand{ justify-content: center; }
          .track{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%; }
          .link{ width:100%; padding:10px 12px; text-align:center; border-radius:14px; }
          .bolt-svg{ width: min(320px, 86vw); }
        }
      `}</style>
    </>
  );
}
