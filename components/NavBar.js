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

          {/* === LOGO CON FULMINI + AURA === */}
          <Link href="/home" className="logoWrap" aria-label="Jarvis Home">
            <div className="logoAura" aria-hidden="true" />
            <svg className="logoSvg" viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="gradNeon" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#5eead4" />
                  <stop offset="50%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#0aa39a" />
                </linearGradient>
                <filter id="glowOuter" x="-60%" y="-60%" width="220%" height="260%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b1" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="b2" />
                  <feColorMatrix
                    in="b2"
                    type="matrix"
                    values="0 0 0 0 0.28  0 0 0 0 0.75  0 0 0 0 1  0 0 0 1 0"
                    result="cyan"
                  />
                  <feMerge>
                    <feMergeNode in="cyan" />
                    <feMergeNode in="b1" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Testo neon */}
              <text
                x="50%" y="50%"
                dominantBaseline="middle" textAnchor="middle"
                fontFamily="Orbitron, system-ui, sans-serif"
                fontWeight="900" fontSize="122"
                fill="url(#gradNeon)"
                stroke="url(#gradNeon)" strokeWidth="6"
                style={{ filter: 'url(#glowOuter)', letterSpacing: '10px' }}
              >
                JARVIS
              </text>

              {/* Fulmini */}
              <path
                className="bolt"
                d="M 60 120 C 130 60, 220 140, 300 90 S 440 80, 520 120 S 660 100, 820 80"
              >
                <animate attributeName="stroke-dasharray" dur="1.1s" values="0 900;450 900;0 900" repeatCount="indefinite"/>
                <animate attributeName="opacity" dur="1.1s" values="0;1;0" repeatCount="indefinite"/>
              </path>
              <path
                className="bolt thin"
                d="M 80 80 C 150 110, 210 70, 320 120 S 480 60, 600 110 S 700 70, 840 120"
              >
                <animate attributeName="stroke-dasharray" dur="1.5s" values="0 900;470 900;0 900" repeatCount="indefinite"/>
                <animate attributeName="opacity" dur="1.5s" values="0;1;0" repeatCount="indefinite" begin=".25s"/>
              </path>
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
        .nav{
          position: sticky; top:0; z-index:60;
          width:100%; background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.2);
          border-bottom:1px solid var(--nav-brd);
          box-shadow: 0 12px 30px rgba(0,0,0,.30);
        }
        .inner{
          height:64px; display:flex; align-items:center;
          justify-content:flex-start; padding:0 16px;
          gap:28px; overflow:hidden;
        }

        /* === LOGO FULMINI === */
        .logoWrap{ position:relative; display:inline-grid; place-items:center; text-decoration:none; }
        .logoAura{
          position:absolute; inset:-20% -14%; border-radius:50%;
          background:
            conic-gradient(from 0deg,
              #5eead4, #22d3ee, #0aa39a, #ffd166, #ff9f68, #5eead4);
          filter: blur(30px); opacity:.85;
          animation: spin 7s linear infinite, pulse 1.8s ease-in-out infinite;
          z-index:-1;
        }
        .logoSvg{ height:48px; width:auto; display:block; }
        .bolt{
          fill:none; stroke:#b3ecff; stroke-width:3; stroke-linecap:round;
          filter:url(#glowOuter);
        }
        .bolt.thin{ stroke-width:1.6; opacity:.85; }

        /* === MENU === */
        .track{ display:flex; gap:16px; list-style:none; margin:0; padding:0; }
        .item{ white-space:nowrap; flex:0 0 auto; }
        .link{
          --c1:#5eead4; --c2:#22d3ee;
          display:inline-grid; place-items:center;
          padding:12px 20px; border-radius:16px;
          text-decoration:none; color:var(--text);
          transition:.2s;
        }
        .label{
          font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          -webkit-background-clip:text; background-clip:text; color:transparent;
          text-shadow:0 0 14px rgba(255,255,255,.14);
          animation: shimmerText 6s linear infinite;
        }
        .link.is-active{
          background: rgba(255,255,255,.12);
          border:1px solid rgba(255,255,255,.22);
        }

        /* === ANIMAZIONI === */
        @keyframes spin{ to{ transform:rotate(360deg);} }
        @keyframes pulse{ 0%,100%{ transform:scale(1); opacity:.75 } 50%{ transform:scale(1.1); opacity:1 } }
        @keyframes shimmerText{ to{ background-position:-200% center; } }

        /* === MOBILE === */
        @media(max-width:560px){
          .logoSvg{ height:40px; }
          .track{ overflow-x:auto; -webkit-overflow-scrolling:touch; gap:12px; }
          .link{ padding:10px 16px; }
        }
      `}</style>
    </>
  );
}
