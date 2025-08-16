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
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@800;900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">

          {/* ===== LOGO: “JARVIS” disegnato dall'onda ECG ===== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="ecg-logo" title="JARVIS">
              <svg
                className="ecg-svg"
                viewBox="0 0 720 150"
                aria-label="Logo JARVIS a forma di onda ECG"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  {/* Gradiente brillante */}
                  <linearGradient id="ecgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="#12b7ff"/>
                    <stop offset="50%"  stopColor="#7b4dff"/>
                    <stop offset="100%" stopColor="#ff3aa6"/>
                  </linearGradient>

                  {/* Glow morbido */}
                  <filter id="ecgGlow" x="-50%" y="-150%" width="200%" height="400%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b1"/>
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b2"/>
                    <feMerge>
                      <feMergeNode in="b2"/>
                      <feMergeNode in="b1"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>

                  {/* Maschera: le onde si vedono solo dentro le lettere JARVIS */}
                  <mask id="jarvisMask">
                    <rect width="100%" height="100%" fill="black"/>
                    <text
                      x="50%" y="50%"
                      dy="18"
                      textAnchor="middle"
                      fontFamily="Orbitron, system-ui, sans-serif"
                      fontWeight="900"
                      fontSize="84"
                      letterSpacing="10"
                      fill="white"
                    >
                      JARVIS
                    </text>
                  </mask>
                </defs>

                {/* Contorno nero sottile per leggibilità */}
                <text
                  x="50%" y="50%"
                  dy="18"
                  textAnchor="middle"
                  fontFamily="Orbitron, system-ui, sans-serif"
                  fontWeight="900"
                  fontSize="84"
                  letterSpacing="10"
                  fill="transparent"
                  stroke="#000"
                  strokeWidth="2.2"
                >
                  JARVIS
                </text>

                {/* Gruppo onde: tante creste, sovrapposte e animate, ritagliate nella parola */}
                <g mask="url(#jarvisMask)">
                  {/* base glow sfocata sotto */}
                  <g opacity=".45" filter="url(#ecgGlow)">
                    <path className="wave w1 glow" d={genPath(0, 75, 720, 16, 18, 28)} />
                    <path className="wave w2 glow" d={genPath(0, 75, 720, 22, 14, 22)} />
                    <path className="wave w3 glow" d={genPath(0, 75, 720, 28, 10, 18)} />
                  </g>

                  {/* linee principali */}
                  <path className="wave w1" d={genPath(0, 75, 720, 16, 18, 28)} />
                  <path className="wave w2" d={genPath(0, 75, 720, 22, 14, 22)} />
                  <path className="wave w3" d={genPath(0, 75, 720, 28, 10, 18)} />
                </g>
              </svg>
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
          --nav-bg: rgba(6, 10, 28, .72);
          --nav-brd: rgba(255,255,255,.12);
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
          gap: 18px; padding: 10px 16px;
        }

        /* ===== LOGO ECG (più piccolo) ===== */
        .brand{ text-decoration:none; display:flex; align-items:center; }
        .ecg-logo{ display:grid; place-items:center; padding:2px 4px; }
        .ecg-svg{ width: min(360px, 60vw); height:auto; }

        .wave{
          fill: none;
          stroke: url(#ecgGrad);
          stroke-width: 2.6;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: url(#ecgGlow);
          stroke-dasharray: 9 15;
          animation: flow 3.4s linear infinite, pulse 2s ease-in-out infinite;
        }
        .glow{ stroke-width: 6; opacity:.35; }

        .w1{ animation-duration: 6s, 2.6s; }
        .w2{ stroke-width: 2.2; opacity:.9; animation-duration: 4.4s, 2.2s; animation-direction: reverse, normal; }
        .w3{ stroke-width: 1.8; opacity:.95; animation-duration: 3.2s, 1.8s; }

        @keyframes flow { to { stroke-dashoffset: -420; } }
        @keyframes pulse {
          0%,100% { transform: translateY(0) scaleY(1); }
          50%     { transform: translateY(-0.6px) scaleY(1.12); }
        }

        /* ===== MENU ===== */
        .track{ display:flex; gap:12px; list-style:none; margin:0; padding:0; }
        .item{ flex: 0 0 auto; }
        .item.spacer{ visibility:hidden; height:0; padding:0; margin:0; }

        .link{
          --c1:#8b5cf6; --c2:#60a5fa;
          position: relative; display:grid; place-items:center;
          padding: 10px 16px; border-radius: 14px;
          text-decoration:none; color:#eef2ff;
          border:1px solid rgba(255,255,255,.14);
          background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 10px 22px rgba(0,0,0,.28);
          transition: transform .18s ease, box-shadow .2s ease, border-color .2s ease;
          overflow: hidden;
        }
        .link::before{
          content:""; position:absolute; left:-60%; top:-160%; width:60%; height:320%;
          background: linear-gradient(130deg, rgba(255,255,255,.16), transparent 40%);
          transform: rotate(12deg);
          animation: sheen 5s linear infinite; pointer-events:none;
        }
        .label{
          position:relative; font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2), var(--c1));
          background-size:220% auto; -webkit-background-clip:text; color:transparent;
          text-shadow:
            0 0 6px rgba(0,0,0,.6),
            0 0 16px rgba(0,0,0,.5),
            1px 1px 0 rgba(0,0,0,.55);
          animation: sweepBG 8s linear infinite, pulseLabel 1.2s ease-in-out infinite;
        }
        .active-glow{
          position:absolute; inset:-10px; border-radius:18px; pointer-events:none;
          background: radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,.18), transparent 70%);
          opacity:0; filter: blur(12px); transition: opacity .25s ease;
        }
        .link:hover{ transform: translateY(-1px) scale(1.02); }
        .link.is-active{
          background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.05));
          border-color: rgba(255,255,255,.22);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.16),
            0 18px 36px rgba(0,0,0,.34),
            0 0 24px rgba(255,255,255,.18),
            0 0 48px rgba(255,255,255,.12);
        }
        .link.is-active .active-glow{ opacity:.9; }

        @keyframes sweepBG { to { background-position: 200% 50%; } }
        @keyframes pulseLabel { 0%,100%{ filter:brightness(1) } 50%{ filter:brightness(1.2) } }
        @keyframes sheen { 0% { left:-60%; } 100% { left:160%; } }

        @media (prefers-reduced-motion: reduce) {
          .ecg-svg, .wave, .label, .link::before { animation: none !important; }
        }
        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 10px 12px; }
          .brand{ justify-content: center; }
          .track{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%; }
          .link{ width:100%; padding:10px 12px; text-align:center; border-radius:14px; }
          .ecg-svg{ width: min(300px, 86vw); }
        }
      `}</style>
    </>
  );
}

/* ===== Helper =====
 * Genera un path “ECG” fitto (tanti sali/scendi).
 * startX, baseY, width, stepX, up, down controllano densità/ampiezze.
 */
function genPath(startX, baseY, width, stepX, up, down) {
  let x = startX;
  const endX = startX + width;
  const parts = [`M ${x} ${baseY}`];
  let toggle = true;
  while (x < endX) {
    const mid = x + stepX * 0.5;
    const next = x + stepX;
    const y1 = baseY + (toggle ? -up : -Math.max(6, up * 0.6));
    const y2 = baseY + (toggle ? down : Math.max(6, down * 0.6));
    // un piccolo zig-zag a tre punti (su/giu) per dare look ECG
    parts.push(`L ${x + stepX * 0.2} ${y1}`);
    parts.push(`L ${mid} ${y2}`);
    parts.push(`L ${next} ${baseY}`);
    x = next;
    toggle = !toggle;
  }
  return parts.join(' ');
}
