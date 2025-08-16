// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

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

  /* ===== “parla/ascolta” opzionale ===== */
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

  /* Numero barre equalizzatore e memo dell’array */
  const bars = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">
          {/* ====== LOGO: JARVIS spettro + equalizer + KITT ====== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home" title="JARVIS">
            <span className={`brand-wrap ${speaking ? 'is-speaking' : ''}`} data-speaking={speaking ? 'true' : 'false'}>
              {/* Testo luminoso a gradiente fluido */}
              <span className="logo-spectrum" data-text="JARVIS">JARVIS</span>

              {/* Equalizzatore (barre animate) */}
              <span className="eq" aria-hidden="true">
                {bars.map(i => (
                  <span key={i} className="bar" style={{ '--i': i }} />
                ))}
              </span>

              {/* Barra KITT sotto alle barre */}
              <span className="kitt-slot" aria-hidden="true">
                <span className="kitt-beam" />
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

          /* Tavolozza logo */
          --deep: #0a0a0e;
          --cycle: 9s;
          --pulse: 1.1s;

          /* KITT */
          --kitt-red: #ff2727;
        }

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
          transition: filter .2s ease;
        }
        .brand-wrap.is-speaking{ filter: saturate(1.25) brightness(1.08); }

        /* Testo: gradiente fluido super-luminoso */
        .logo-spectrum{
          position: relative; z-index: 3; display:inline-block;
          font-family: "Orbitron", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .38rem;
          font-size: clamp(2.6rem, 6vw, 3.6rem);
          text-transform: uppercase;

          background: linear-gradient(270deg,
            #ff3b3b, #ff9900, #ff00ff, #1e90ff, #00ffe7, #7dff72, #ff3b3b);
          background-size: 700% 700%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;

          text-shadow:
            0 0 10px rgba(255,70,70,.95),
            0 0 22px rgba(255,170,0,.95),
            0 0 36px rgba(255,0,255,.9),
            0 0 70px rgba(0,220,255,1);

          animation:
            spectrumFlow var(--cycle) ease-in-out infinite,
            spectrumPulse var(--pulse) ease-in-out infinite;
        }
        .brand-wrap.is-speaking .logo-spectrum{
          animation:
            spectrumFlow calc(var(--cycle) * .7) ease-in-out infinite,
            spectrumPulse calc(var(--pulse) * .7) ease-in-out infinite;
          text-shadow:
            0 0 14px rgba(255,80,80,1),
            0 0 30px rgba(255,190,0,1),
            0 0 56px rgba(255,0,255,1),
            0 0 96px rgba(0,255,255,1);
        }
        .logo-spectrum::after{
          content: attr(data-text);
          position:absolute; inset:0; z-index:-1; pointer-events:none;
          transform: translate(6px, 8px);
          color: var(--deep);
          filter: blur(.7px); opacity:.98;
          animation: extrudeBreath var(--pulse) ease-in-out infinite;
        }

        /* Equalizzatore: 24 barre con fasi diverse */
        .eq{
          position:absolute; left:50%; transform:translateX(-50%);
          bottom:-6px; width: min(520px, 78vw); height: 26px;
          display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
          gap: 6px; z-index: 2;
          pointer-events: none;
          filter: drop-shadow(0 0 10px rgba(255,255,255,.45))
                  drop-shadow(0 0 28px rgba(0,220,255,.35));
        }
        .bar{
          --i: 0;
          align-self: end;
          width: 100%; height: 6px; border-radius: 6px;
          background: linear-gradient(180deg, #7dff72, #00ffe7 40%, #1e90ff 70%, #ff3b3b 100%);
          box-shadow:
            0 0 6px rgba(125,255,114,.9),
            0 0 16px rgba(0,255,231,.8),
            0 0 26px rgba(30,144,255,.7);
          animation: barDance 1.2s ease-in-out infinite;
          animation-delay: calc((var(--i) % 6) * -0.15s);
        }
        /* quando parla, movimento più energico */
        .brand-wrap.is-speaking .bar{
          animation-duration: .7s;
          box-shadow:
            0 0 10px rgba(125,255,114,1),
            0 0 26px rgba(0,255,231,1),
            0 0 44px rgba(30,144,255,1);
        }

        /* Barra KITT */
        .kitt-slot{
          position:absolute; left:50%; transform:translateX(-50%);
          bottom:-18px; width: min(520px, 78vw); height: 10px;
          background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(0,0,0,.4));
          border-radius: 999px; overflow: hidden; z-index: 1;
          box-shadow: inset 0 2px 5px rgba(0,0,0,.55), inset 0 -2px 4px rgba(0,0,0,.65);
        }
        .kitt-beam{
          position:absolute; top:50%; left:0; transform: translateY(-50%);
          width: 76px; height: 100%; border-radius: 999px;
          background:
            radial-gradient(50% 120% at 50% 50%, rgba(255,255,255,.7), rgba(255,255,255,0) 70%),
            linear-gradient(90deg, transparent, var(--kitt-red), #ff4d4d, var(--kitt-red), transparent);
          box-shadow: 0 0 12px #ff4d4d, 0 0 30px #ff2b2b, 0 0 60px rgba(255,40,40,.95);
          mix-blend-mode: screen;
          animation: kittSweep 2.2s cubic-bezier(.55,.07,.43,.99) infinite alternate,
                     kittPulse 1.2s ease-in-out infinite;
        }
        .brand-wrap.is-speaking .kitt-beam{
          animation: kittSweep 1.1s cubic-bezier(.55,.07,.43,.99) infinite alternate,
                     kittPulse .6s ease-in-out infinite;
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

        /* ===== KEYFRAMES ===== */
        @keyframes spectrumFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes spectrumPulse {
          0%,100% { filter: brightness(1) saturate(1); }
          50%     { filter: brightness(1.25) saturate(1.4); }
        }
        @keyframes barDance {
          0%   { height: 6px; }
          25%  { height: 80%; }
          50%  { height: 18px; }
          75%  { height: 65%; }
          100% { height: 6px; }
        }
        @keyframes kittSweep {
          0%   { left: 0%; transform: translateY(-50%) translateX(0); }
          100% { left: 100%; transform: translateY(-50%) translateX(-100%); }
        }
        @keyframes kittPulse {
          0%,100% { filter: brightness(1) saturate(1); opacity:.95; }
          50%     { filter: brightness(1.35) saturate(1.4); opacity:1; }
        }
        @keyframes sweepBG { to { background-position: 200% 50%; } }
        @keyframes pulseLabel { 0%,100%{ filter:brightness(1) } 50%{ filter:brightness(1.3) } }
        @keyframes pulseAura  { 0%,100%{ opacity:.48; transform:scale(1) } 50%{ opacity:.8; transform:scale(1.06) } }
        @keyframes extrudeBreath { 0%,100%{ transform:translate(6px,8px) } 50%{ transform:translate(7px,10px) } }
        @keyframes sheen { 0% { left:-60%; } 100% { left:160%; } }

        @media (prefers-reduced-motion: reduce) {
          .logo-spectrum, .logo-spectrum::after, .eq .bar, .kitt-beam,
          .label, .label::after, .link::before { animation: none !important; }
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 10px 12px; }
          .brand{ justify-content: center; }
          .track{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%; }
          .link{ width:100%; padding:10px 12px; text-align:center; border-radius:14px; }
          .eq{ width: min(360px, 90vw); gap: 5px; height: 22px; }
          .kitt-slot{ width: min(360px, 90vw); }
        }
        @media (min-width: 561px) and (max-width: 860px){
          .inner{ padding: 8px 12px; }
          .track{ flex-wrap: wrap; gap: 12px; }
        }
      `}</style>
    </>
  );
}
