// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

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

  // ===== (Facoltativo) “parlato” reale con microfono =====
  const [speaking, setSpeaking] = useState(false);
  const ampRef = useRef(1);
  const ctxRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    const start = async () => {
      if (ctxRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.82;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const loop = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          const n = Math.max(1, Math.floor(data.length / 3));
          for (let i = 0; i < n; i++) sum += data[i];
          const avg = sum / n;            // 0..255
          const norm = Math.min(1, avg / 180); // 0..1
          ampRef.current = 1 + norm * 0.9;     // 1..1.9
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        // se l'utente non concede il microfono, lasciamo l'animazione finta
      }
    };
    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try { ctxRef.current?.close(); } catch {}
      ctxRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      ampRef.current = 1;
    };

    const onStart = () => { setSpeaking(true); start(); };
    const onStop  = () => { setSpeaking(false); stop(); };

    window.addEventListener('jarvis:speaking', onStart);
    window.addEventListener('jarvis:quiet', onStop);
    return () => {
      window.removeEventListener('jarvis:speaking', onStart);
      window.removeEventListener('jarvis:quiet', onStop);
      onStop();
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
          {/* ====== LOGO: curva sonora animata ====== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span
              className={`brand-wrap ${speaking ? 'is-speaking' : ''}`}
              // aggiorna ampiezza via JS quando c'è il mic
              style={{ '--amp': ampRef.current }}
              title="JARVIS"
            >
              <svg
                className="logo-wave"
                viewBox="0 0 520 110"
                role="img"
                aria-label="Waveform JARVIS"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  {/* Gradiente multicolore */}
                  <linearGradient id="gJarvis" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="#16b7ff"/>
                    <stop offset="45%"  stopColor="#7c4dff"/>
                    <stop offset="100%" stopColor="#ff3ba7"/>
                  </linearGradient>

                  {/* Glow morbido */}
                  <filter id="softGlow" x="-30%" y="-80%" width="160%" height="240%">
                    <feGaussianBlur stdDeviation="3" result="blur1"/>
                    <feGaussianBlur stdDeviation="8" in="SourceGraphic" result="blur2"/>
                    <feMerge>
                      <feMergeNode in="blur2"/>
                      <feMergeNode in="blur1"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>

                  {/* Pennello arrotondato */}
                  <style>{`
                    .wave {
                      fill: none;
                      stroke: url(#gJarvis);
                      stroke-width: 3.2;
                      stroke-linecap: round;
                      stroke-linejoin: round;
                      filter: url(#softGlow);
                    }
                  `}</style>
                </defs>

                {/* traccia 1 (lenta e ampia) */}
                <path className="wave w1" d="
                  M 0,55
                  C 20,55  40,20  60,55
                  S 100,90 120,55
                  S 160,20 180,55
                  S 220,90 240,55
                  S 280,20 300,55
                  S 340,90 360,55
                  S 400,20 420,55
                  S 460,90 480,55
                  S 500,20 520,55
                "/>

                {/* traccia 2 (media, sfasata) */}
                <path className="wave w2" d="
                  M 0,55
                  C 15,55  35,35  55,55
                  S 95,75 115,55
                  S 155,35 175,55
                  S 215,75 235,55
                  S 275,35 295,55
                  S 335,75 355,55
                  S 395,35 415,55
                  S 455,75 475,55
                  S 505,35 525,55
                "/>

                {/* traccia 3 (veloce e sottile, più luminosa) */}
                <path className="wave w3" d="
                  M 0,55
                  C 10,55  30,45  50,55
                  S 90,65 110,55
                  S 150,45 170,55
                  S 210,65 230,55
                  S 270,45 290,55
                  S 330,65 350,55
                  S 390,45 410,55
                  S 450,65 470,55
                  S 510,45 530,55
                "/>
              </svg>
              {/* testo piccolo “JARVIS” come caption, rosso con bordo leggero */}
              <span className="brand-caption">JARVIS</span>
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
            {Array.from({ length: (links.length % 3 === 0 ? 0 : 3 - (links.length % 3)) })
              .map((_, i) => <li key={`sp-${i}`} className="item spacer" aria-hidden="true" />)}
          </ul>
        </div>
      </nav>

      <style jsx>{`
        :root{
          --nav-bg: rgba(6, 10, 28, .72);
          --nav-brd: rgba(255,255,255,.12);
          --pulse: 1.25s;
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

        /* ===== LOGO WAVE ===== */
        .brand{ text-decoration:none; display:flex; align-items:center; }
        .brand-wrap{
          position:relative; display:flex; flex-direction:column; align-items:center;
          padding: 4px 6px; isolation:isolate;
          --amp: 1; /* ampiezza (1..~2) — aggiornata se c'è microfono */
        }

        .logo-wave{
          width: min(520px, 56vw);
          height: auto;
          transform-origin: center;
          /* respiro costante + ampiezza variabile (mic) */
          animation: waveBreath 2.6s ease-in-out infinite;
        }
        .brand-wrap.is-speaking .logo-wave{
          animation-duration: 1.6s;
        }

        /* scorrimento delle tre tracce */
        .w1{ stroke-width: 3.2; opacity:.85; animation: dash 7s linear infinite, wobble 3.2s ease-in-out infinite; }
        .w2{ stroke-width: 2.6; opacity:.75; animation: dash 5.4s linear infinite reverse, wobble 2.8s ease-in-out infinite reverse; }
        .w3{ stroke-width: 1.8; opacity:.95; animation: dash 3.8s linear infinite, wobble 2.2s ease-in-out infinite; }

        /* lunghezza virtuale per creare il flusso */
        .wave{ stroke-dasharray: 8 18; stroke-dashoffset: 0; }

        /* sottotitolo piccolo JARVIS */
        .brand-caption{
          margin-top: 6px;
          font-family: "Orbitron", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .28rem;
          font-size: clamp(.8rem, 2.2vw, .95rem);
          color: #ff2b2b;
          -webkit-text-stroke: 0.8px #000;
          text-shadow:
            0 0 6px rgba(255,46,46,.9),
            0 0 16px rgba(255,0,0,.6);
        }

        /* animazioni */
        @keyframes dash { to { stroke-dashoffset: -260; } }
        @keyframes wobble {
          0%,100% { transform: translateY(0) scaleY(calc(1 * var(--amp))); }
          50%     { transform: translateY(-1px) scaleY(calc(1.18 * var(--amp))); }
        }
        @keyframes waveBreath {
          0%,100% { transform: scaleY(calc(1 * var(--amp))); filter: brightness(1) saturate(1); }
          50%     { transform: scaleY(calc(1.12 * var(--amp))); filter: brightness(1.15) saturate(1.15); }
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
            0 0 6px rgba(0,0,0,.6),
            0 0 16px rgba(0,0,0,.5),
            1px 1px 0 rgba(0,0,0,.55);
          animation: sweepBG 8s linear infinite, pulseLabel var(--pulse) ease-in-out infinite;
        }
        .active-glow{
          position:absolute; inset:-10px; border-radius:20px; pointer-events:none;
          background: radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,.2), transparent 70%);
          opacity:0; filter: blur(14px); transition: opacity .25s ease;
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
        @keyframes pulseLabel { 0%,100%{ filter:brightness(1) } 50%{ filter:brightness(1.25) } }
        @keyframes sheen { 0% { left:-60%; } 100% { left:160%; } }

        @media (prefers-reduced-motion: reduce) {
          .logo-wave, .wave, .label, .label::after, .link::before { animation: none !important; }
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 10px 12px; }
          .brand{ justify-content: center; }
          .track{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%; }
          .link{ width:100%; padding:10px 12px; text-align:center; border-radius:14px; }
          .logo-wave{ width: min(400px, 88vw); }
        }
      `}</style>
    </>
  );
}
