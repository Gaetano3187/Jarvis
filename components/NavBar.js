// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const links = [
  { href: '/home',             label: 'Home',           c1: '#5eead4', c2: '#22d3ee' },
  { href: '/dashboard',        label: 'Dashboard',      c1: '#f0abfc', c2: '#c084fc' },
  { href: '/liste-prodotti',   label: 'Liste Prodotti', c1: '#34d399', c2: '#a3e635' },
  { href: '/finanze',          label: 'Finanze',        c1: '#60a5fa', c2: '#0aa39a' },
  { href: '/spese-casa',       label: 'Casa',           c1: '#38bdf8', c2: '#60a5fa' },
  { href: '/vestiti-ed-altro', label: 'Vestiti',        c1: '#f472b6', c2: '#fb7185' },
  { href: '/cene-aperitivi',   label: 'Cene',           c1: '#f59e0b', c2: '#fb923c' },
  { href: '/varie',            label: 'Varie',          c1: '#94a3b8', c2: '#d4d4d8' },
  { href: '/prodotti-tipici-vini', label: 'Prodotti & Vini', c1: '#60a5fa', c2: '#22d3ee' }

];

export default function NavBar() {
  const { pathname } = useRouter();

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">
          {/* === LOGO: cielo in tempesta SOLO dietro JARVIS + fulmini === */}
          <Link href="/home" className="logoWrap" aria-label="Jarvis Home">
            <svg className="logoSvg" viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet">
              <defs>
                {/* Gradiente testo */}
                <linearGradient id="gradNeon" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#5eead4" />
                  <stop offset="50%"  stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#0aa39a" />
                </linearGradient>

                {/* Glow elettrico */}
                <filter id="electricGlow" x="-80%" y="-80%" width="260%" height="320%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="g1" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="g2" />
                  <feColorMatrix in="g2" type="matrix"
                    values="0 0 0 0 0.15  0 0 0 0 0.75  0 0 0 0 1  0 0 0 1 0" result="cya" />
                  <feMerge>
                    <feMergeNode in="cya" />
                    <feMergeNode in="g1" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Saette glow */}
                <filter id="boltGlow" x="-120%" y="-120%" width="340%" height="360%">
                  <feGaussianBlur stdDeviation="2" />
                </filter>

                {/* ===== CIELO IN TEMPESTA SOLO DIETRO TESTO ===== */}
                <linearGradient id="stormBase" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#0b0f17"/>
                  <stop offset="100%" stopColor="#182335"/>
                </linearGradient>

                <filter id="stormNoise" x="-20%" y="-40%" width="140%" height="180%" colorInterpolationFilters="sRGB">
                  <feTurbulence type="fractalNoise" baseFrequency="0.015 0.028" numOctaves="3" seed="12" result="n">
                    <animate attributeName="baseFrequency"
                      values="0.015 0.028;0.021 0.035;0.015 0.028"
                      dur="12s" repeatCount="indefinite" />
                  </feTurbulence>
                  <feColorMatrix in="n" type="matrix"
                    values="
                      0.55 0    0    0 0.00
                      0    0.62 0    0 0.02
                      0    0    0.90 0 0.06
                      0    0    0    1 0" result="tinted"/>
                  <feGaussianBlur in="tinted" stdDeviation="0.8" result="soft"/>
                  <feComponentTransfer>
                    <feFuncA type="table" tableValues="0 0.7"/>
                  </feComponentTransfer>
                </filter>

                {/* Maschera a bordi morbidi sul riquadro dietro al testo */}
                <radialGradient id="stormMaskGrad" cx="50%" cy="50%" r="62%">
                  <stop offset="70%" stopColor="white"/>
                  <stop offset="100%" stopColor="black"/>
                </radialGradient>
                <mask id="stormFeather" maskUnits="userSpaceOnUse">
                  <rect x="110" y="32" width="680" height="136" rx="28" fill="url(#stormMaskGrad)"/>
                </mask>
              </defs>

              {/* Riquadro “cielo in tempesta” limitato dietro al testo */}
              <g mask="url(#stormFeather)">
                <rect x="110" y="32" width="680" height="136" rx="28" fill="url(#stormBase)"/>
                <rect x="110" y="32" width="680" height="136" rx="28" filter="url(#stormNoise)" opacity=".65"/>
              </g>

              {/* Testo JARVIS */}
              <text
                x="50%" y="50%"
                dominantBaseline="middle" textAnchor="middle"
                fontFamily="Orbitron, system-ui, sans-serif"
                fontWeight="900" fontSize="122"
                fill="url(#gradNeon)"
                stroke="url(#gradNeon)" strokeWidth="6"
                style={{ filter: 'url(#electricGlow)', letterSpacing: '10px' }}
              >
                JARVIS
              </text>
              <text
                x="50%" y="50%"
                dominantBaseline="middle" textAnchor="middle"
                fontFamily="Orbitron, system-ui, sans-serif"
                fontWeight="900" fontSize="122"
                fill="transparent"
                stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1.2"
              >
                JARVIS
              </text>

              {/* Fulmini */}
              <g strokeLinecap="round" strokeLinejoin="round" filter="url(#boltGlow)">
                <path className="bolt"
                  d="M 60 120 C 130 60, 220 140, 300 90 S 440 80, 520 120 S 660 100, 820 80">
                  <animate attributeName="stroke-dasharray" dur="1.15s"
                    values="0 900;450 900;0 900" repeatCount="indefinite" />
                  <animate attributeName="opacity" dur="1.15s"
                    values="0;1;0" repeatCount="indefinite" />
                </path>
                <path className="bolt thin"
                  d="M 80 80 C 150 110, 210 70, 320 120 S 480 60, 600 110 S 700 70, 840 120">
                  <animate attributeName="stroke-dasharray" dur="1.6s"
                    values="0 900;470 900;0 900" repeatCount="indefinite" />
                  <animate attributeName="opacity" dur="1.6s"
                    values="0;1;0" begin=".25s" repeatCount="indefinite" />
                </path>
                <path className="bolt micro"
                  d="M 420 105 L 430 88 L 438 112 L 448 94">
                  <animate attributeName="opacity" dur="2.2s"
                    values="0;0;1;0" begin=".4s" repeatCount="indefinite" />
                </path>
              </g>
            </svg>
          </Link>

          {/* === MENU === */}
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
                    <span className="gloss" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <style jsx>{`
        :root{
          --nav-base: rgba(8,12,20,.35);
          --nav-tint: rgba(40,180,200,.10);
          --nav-brd: rgba(255,255,255,.22);
          --nav-brd-2: rgba(255,255,255,.08);
          --text: #eaf2ff;
        }

        /* ====== NAV GLASS / VETRIFICATA ====== */
        .nav{
          position: sticky; top:0; z-index:60; width:100%;
          background:
            linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,0) 30%),
            linear-gradient(to bottom right, var(--nav-tint), rgba(0,0,0,.08)),
            var(--nav-base);
          backdrop-filter: blur(16px) saturate(1.35) contrast(1.08);
          -webkit-backdrop-filter: blur(16px) saturate(1.35) contrast(1.08);
          border-bottom: 1px solid var(--nav-brd-2);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.25),   /* bordo superiore lucido */
            inset 0 -1px 0 rgba(255,255,255,.1),   /* bordo inferiore interno */
            0 12px 30px rgba(0,0,0,.30),           /* ombra esterna */
            0 1px 0 rgba(255,255,255,.08) inset;   /* lieve rilievo */
        }
        .nav:before{
          content:""; position:absolute; inset:0;
          background:
            radial-gradient(120% 60% at 40% -20%, rgba(255,255,255,.18), transparent 60%),
            radial-gradient(100% 60% at 100% -10%, rgba(255,255,255,.10), transparent 60%);
          pointer-events:none; mix-blend-mode:screen;
        }

        .inner{
          display:flex; flex-wrap:wrap; align-items:center;
          gap:18px; padding:10px 16px; min-height:64px;
        }

        /* ====== LOGO ====== */
        .logoWrap{
          position:relative; display:grid; place-items:center; text-decoration:none;
          flex:0 0 auto; isolation:isolate;
        }
        .logoSvg{ height:48px; width:auto; display:block; }
        .bolt{ fill:none; stroke:#d9f7ff; stroke-width:3.2; opacity:.95; }
        .bolt.thin{ stroke-width:1.6; opacity:.85; }
        .bolt.micro{ stroke:#ffffff; stroke-width:2; }

        /* ====== MENU ====== */
        .track{
          display:flex; flex-wrap:wrap; align-items:center;
          gap:12px; list-style:none; margin:0; padding:0;
          flex:1 1 auto; min-width:240px;
        }
        .item{ flex:0 1 auto; }

        .link{
          --c1:#5eead4; --c2:#22d3ee;
          position:relative; display:grid; place-items:center;
          padding:10px 16px; border-radius:16px;
          text-decoration:none; color:var(--text);
          border:1px solid transparent;
          transition: transform .12s ease, box-shadow .25s ease, border-color .25s ease, background .25s ease;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.18),
            0 4px 14px rgba(0,0,0,.18);
          background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
        }
        .link:hover{
          transform: translateY(-1px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.25),
            0 8px 20px rgba(0,0,0,.24);
          border-color: rgba(255,255,255,.18);
        }
        .label{
          font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          -webkit-background-clip:text; background-clip:text; color:transparent;
          text-shadow:
            0 1px 0 rgba(255,255,255,.25),
            0 0 12px rgba(255,255,255,.12);
          animation: pulseGlow 2.8s ease-in-out infinite;
        }
        /* riflesso vetroso del pulsante */
        .gloss{
          content:""; position:absolute; inset:0; border-radius:16px; pointer-events:none;
          background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 40%);
          opacity:.55; mix-blend-mode:screen;
        }

        /* ====== STATO ATTIVO ====== */
        .link.is-active{
          background:
            radial-gradient(120% 160% at 50% -20%, rgba(255,255,255,.18), transparent 60%),
            linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.02));
          border-color: var(--nav-brd);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.35),
            0 0 24px rgba(80,200,255,.35),
            0 10px 26px rgba(0,0,0,.28);
        }
        .link.is-active .label{
          text-shadow:
            0 0 10px var(--c1),
            0 0 20px var(--c2),
            0 0 34px rgba(255,255,255,.65);
          animation: activePulse 1.8s ease-in-out infinite;
        }

        /* ====== ANIMAZIONI ====== */
        @keyframes pulseGlow{
          0%,100% { transform:scale(1); }
          50%     { transform:scale(1.035); }
        }
        @keyframes activePulse{
          0%,100% { transform:scale(1); }
          50%     { transform:scale(1.06); }
        }

        /* ====== RESPONSIVE ====== */
        @media (max-width: 900px){
          .logoSvg{ height:44px; }
          .inner{ gap:12px; padding:8px 12px; }
          .link{ padding:9px 14px; border-radius:14px; }
        }
        /* Smartphone: 2 colonne */
        @media (max-width: 560px){
          .logoSvg{ height:40px; }
          .track{ gap:10px; }
          .item{ flex:1 1 calc(50% - 10px); }
          .link{ width:100%; padding:10px 12px; }
        }
        /* Schermi molto stretti: 1 colonna */
        @media (max-width: 380px){
          .item{ flex:1 1 100%; }
        }

        /* Accessibilità: riduci animazioni se richiesto */
        @media (prefers-reduced-motion: reduce){
          .label, .link.is-active .label { animation: none !important; }
        }
      `}</style>
    </>
  );
}
