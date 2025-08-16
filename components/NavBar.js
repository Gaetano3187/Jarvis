// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

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

export default function NavBar({ speaking: speakingProp = false }) {
  const { pathname } = useRouter();

  const modulo = links.length % 3;
  const fillers = modulo === 0 ? 0 : 3 - modulo;
  const mobileFillers = Array.from({ length: fillers }, (_, i) => `spacer-${i}`);

  const [speaking, setSpeaking] = useState(!!speakingProp);
  useEffect(() => setSpeaking(!!speakingProp), [speakingProp]);
  useEffect(() => {
    const onSpeak = () => setSpeaking(true);
    const onQuiet = () => setSpeaking(false);
    window.addEventListener('jarvis:speaking', onSpeak);
    window.addEventListener('jarvis:quiet', onQuiet);
    return () => {
      window.removeEventListener('jarvis:speaking', onSpeak);
      window.removeEventListener('jarvis:quiet', onQuiet);
    };
  }, []);

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">
          {/* ====== LOGO JARVIS rosso acceso ====== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home" title="JARVIS">
            <span className={`brand-wrap ${speaking ? 'is-speaking' : ''}`}>
              <span className="logo-jarvis" data-text="JARVIS">JARVIS</span>
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
          --pulse: 1.4s;
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

        .brand{ text-decoration:none; display:flex; align-items:center; }
        .brand-wrap{ position: relative; display:grid; place-items:center; }

        /* LOGO JARVIS rosso acceso */
        .logo-jarvis{
          position: relative;
          z-index: 3;
          display: inline-block;
          font-family: "Orbitron", system-ui, sans-serif;
          font-weight: 900;
          letter-spacing: .3rem;
          font-size: clamp(2.2rem, 5vw, 3.2rem);
          text-transform: uppercase;

          /* bordo nero sottile */
          -webkit-text-stroke: 1px #000;
          paint-order: stroke fill;

          color: #ff2a2a;
          text-shadow:
            0 0 6px rgba(255,50,50,.9),
            0 0 14px rgba(255,60,60,.8),
            0 0 26px rgba(255,0,0,.7);

          animation: pulseRed var(--pulse) ease-in-out infinite;
        }
        .logo-jarvis::after{
          content: attr(data-text);
          position:absolute; inset:0; z-index:-1;
          color: #000;
          opacity:.85;
          transform: translate(3px, 5px);
          filter: blur(1px);
        }

        @keyframes pulseRed {
          0%,100% {
            text-shadow:
              0 0 6px rgba(255,50,50,.9),
              0 0 14px rgba(255,60,60,.8),
              0 0 26px rgba(255,0,0,.7);
          }
          50% {
            text-shadow:
              0 0 12px rgba(255,80,80,1),
              0 0 26px rgba(255,40,40,.95),
              0 0 50px rgba(255,0,0,1);
          }
        }

        /* ===== MENU ===== */
        .track{
          display:flex; gap:14px; list-style:none; margin:0; padding:0;
        }
        .item{ flex: 0 0 auto; }
        .item.spacer{ visibility:hidden; height:0; padding:0; margin:0; }

        .link{
          --c1:#8b5cf6; --c2:#60a5fa;
          position: relative; display:grid; place-items:center;
          padding: 12px 20px; border-radius: 16px;
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
          position:relative; font-weight:900; letter-spacing:.06rem;
          background: linear-gradient(90deg, var(--c1), var(--c2), var(--c1));
          background-size:220% auto; -webkit-background-clip:text; color:transparent;
          text-shadow:
            0 0 6px color-mix(in oklab, var(--c2) 80%, #000),
            0 0 16px color-mix(in oklab, var(--c1) 80%, #000),
            1px 1px 0 rgba(0,0,0,.55);
          animation: sweepBG 8s linear infinite, pulseLabel var(--pulse) ease-in-out infinite;
        }
        .label::after{
          content:""; position:absolute; inset:-8px -10px; pointer-events:none; border-radius: 9999px;
          background: radial-gradient(60% 55% at 50% 50%,
            color-mix(in oklab, var(--c1) 42%, transparent),
            color-mix(in oklab, var(--c2) 30%, transparent) 40%,
            transparent 70%);
          mix-blend-mode: screen; filter: blur(12px); opacity:.55; animation: pulseAura var(--pulse) ease-in-out infinite;
        }
        .active-glow{
          position:absolute; inset:-10px; border-radius:20px; pointer-events:none;
          background: radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c1) 35%, transparent), transparent 70%);
          opacity:0; filter: blur(14px); transition: opacity .25s ease;
        }
        .link:hover{ transform: translateY(-1px) scale(1.02); }
        .link.is-active{
          background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.05));
          border-color: rgba(255,255,255,.22);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.16),
            0 18px 36px rgba(0,0,0,.34),
            0 0 24px color-mix(in oklab, var(--c2) 35%, transparent),
            0 0 48px color-mix(in oklab, var(--c1) 28%, transparent);
        }
        .link.is-active .active-glow{ opacity:.9; }

        @keyframes sweepBG { to { background-position: 200% 50%; } }
        @keyframes pulseLabel { 0%,100%{ filter:brightness(1) } 50%{ filter:brightness(1.3) } }
        @keyframes pulseAura  { 0%,100%{ opacity:.48; transform:scale(1) } 50%{ opacity:.8; transform:scale(1.06) } }
        @keyframes sheen { 0% { left:-60%; } 100% { left:160%; } }

        @media (prefers-reduced-motion: reduce) {
          .logo-jarvis, .logo-jarvis::after, .label, .label::after, .link::before { animation: none !important; }
        }

        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 10px 12px; }
          .brand{ justify-content: center; }
          .track{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%; }
          .link{ width:100%; padding:10px 12px; text-align:center; border-radius:14px; }
        }
      `}</style>
    </>
  );
}
