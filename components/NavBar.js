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

  /* ===== Stato registrazione + analisi audio ===== */
  const [recording, setRecording] = useState(false);
  const [beamSpeedSec, setBeamSpeedSec] = useState(2.2); // più piccolo = più veloce
  const [glowScale, setGlowScale] = useState(1);         // intensità glow 1..~2

  const mediaStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const start = async () => {
      if (audioCtxRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;

        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.85;
        src.connect(analyser);
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);

        const loop = () => {
          analyser.getByteFrequencyData(data);
          // volume grezzo: media dei bassi+medi (prime ~1/3 bins)
          let sum = 0;
          const len = Math.max(1, Math.floor(data.length / 3));
          for (let i = 0; i < len; i++) sum += data[i];
          const avg = sum / len;           // 0..255
          const norm = Math.min(1, avg / 180); // normalizza e limita

          // mappa il volume a velocità e glow:
          // idle ~2.2s ; parlato forte ~0.7s
          const speed = 2.2 - norm * 1.5;
          setBeamSpeedSec(Math.max(0.65, speed));

          // glow 1..~2
          setGlowScale(1 + norm * 1.2);

          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        console.error('Mic error:', err);
      }
    };

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch {}
      }
      audioCtxRef.current = null;
      analyserRef.current = null;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      mediaStreamRef.current = null;
      // torna a valori "idle"
      setBeamSpeedSec(2.2);
      setGlowScale(1);
    };

    const onStart = () => { setRecording(true); start(); };
    const onStop  = () => { setRecording(false); stop(); };

    window.addEventListener('jarvis:recording:start', onStart);
    window.addEventListener('jarvis:recording:stop', onStop);
    return () => {
      window.removeEventListener('jarvis:recording:start', onStart);
      window.removeEventListener('jarvis:recording:stop', onStop);
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
          {/* ====== LOGO: JARVIS + barra KITT dinamica ====== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home" title="JARVIS">
            <span className={`brand-wrap ${recording ? 'is-recording' : ''}`}>
              {/* Scritta JARVIS rossa con bordo nero */}
              <span className="logo-jarvis" data-text="JARVIS">JARVIS</span>

              {/* Feritoia KITT: verde idle, rossa quando recording */}
              <span className="kitt-slot" aria-hidden="true">
                <span
                  className="kitt-beam"
                  // aggiorna la velocità in base al volume
                  style={{ '--sweep-sec': `${beamSpeedSec}s`, '--glow-scale': glowScale }}
                >
                  <span className="kitt-core" />
                </span>
                <span className="kitt-leds" />
                <span className="kitt-glow" />
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
            {/* filler per griglia mobile */}
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
          --pulse: 1.35s;

          /* colori barra */
          --beam-green: #2bff88;
          --beam-green-soft: #b7ffd9;
          --beam-red: #ff2a2a;
          --beam-red-soft: #ffb3b3;
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

        /* ===== LOGO JARVIS ===== */
        .logo-jarvis{
          position: relative; z-index: 3; display:inline-block;
          font-family: "Orbitron", system-ui, sans-serif;
          font-weight: 900; letter-spacing: .3rem;
          font-size: clamp(2.2rem, 5vw, 3.1rem);
          text-transform: uppercase;
          -webkit-text-stroke: 1px #000; paint-order: stroke fill;
          color: #ff2626;
          text-shadow:
            0 0 6px rgba(255,46,46,.95),
            0 0 14px rgba(255,34,34,.9),
            0 0 28px rgba(255,0,0,.85);
          animation: pulseRed var(--pulse) ease-in-out infinite;
        }
        .logo-jarvis::after{
          content: attr(data-text);
          position:absolute; inset:0; z-index:-1;
          color:#000; transform: translate(3px,5px);
          filter: blur(1px); opacity:.9;
        }
        @keyframes pulseRed {
          0%,100% { text-shadow:
            0 0 6px rgba(255,46,46,.9),
            0 0 14px rgba(255,34,34,.85),
            0 0 28px rgba(255,0,0,.8); }
          50% { text-shadow:
            0 0 12px rgba(255,70,70,1),
            0 0 26px rgba(255,32,32,1),
            0 0 56px rgba(255,0,0,1); }
        }

        /* ===== KITT feritoia ===== */
        .kitt-slot{
          position: relative;
          margin-top: 6px;
          width: min(360px, 78vw);
          height: 12px;
          border-radius: 12px;
          background: linear-gradient(180deg,#0f1116,#05060a);
          border: 1px solid #000;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.08),
            inset 0 -2px 6px rgba(0,0,0,.9),
            0 8px 26px rgba(0,0,0,.45);
          overflow: hidden;
          isolation:isolate;
        }
        .kitt-slot::before{
          content:"";
          position:absolute; inset:0;
          background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0) 60%);
          mix-blend-mode: screen; pointer-events:none;
        }

        /* LED segmentati fissi */
        .kitt-leds{
          position:absolute; inset:1px; border-radius: 10px;
          background:
            repeating-linear-gradient(90deg,
              rgba(255,255,255,.08) 0 3px,
              rgba(255,255,255,0) 3px 18px);
          opacity:.25; pointer-events:none;
        }

        /* Fascio che corre; colore e glow si adattano via CSS vars */
        .kitt-beam{
          --sweep-sec: 2.2s;          /* aggiornato da JS col volume */
          --glow-scale: 1;            /* 1..~2, aggiornato da JS */
          position:absolute; top:0; left:0;
          width: 86px; height: 100%;
          animation: kittSweep var(--sweep-sec) cubic-bezier(.55,.07,.43,.99) infinite alternate;
          filter:
            drop-shadow(0 0 calc(10px * var(--glow-scale)) var(--beam-color-strong))
            drop-shadow(0 0 calc(28px * var(--glow-scale)) var(--beam-color-strong))
            drop-shadow(0 0 calc(54px * var(--glow-scale)) var(--beam-color-strong));
          mix-blend-mode: screen;
        }
        /* Scia + nucleo */
        .kitt-beam::before{
          content:"";
          position:absolute; inset:0;
          background:
            linear-gradient(90deg,
              color-mix(in oklab, var(--beam-color-weak) 0%, transparent) 0%,
              color-mix(in oklab, var(--beam-color-weak) 70%, transparent) 20%,
              var(--beam-color) 50%,
              color-mix(in oklab, var(--beam-color-weak) 70%, transparent) 80%,
              color-mix(in oklab, var(--beam-color-weak) 0%, transparent) 100%);
          filter: blur(4px);
        }
        .kitt-core{
          position:absolute; left:8px; right:8px; top:2px; bottom:2px;
          border-radius: 8px;
          background:
            radial-gradient(60% 130% at 50% 50%, #fff 0%, rgba(255,255,255,.6) 18%, rgba(255,255,255,0) 35%),
            linear-gradient(90deg,#0000 0 6px,var(--beam-color) 6px calc(100% - 6px), #0000 calc(100% - 6px));
          box-shadow:
            inset 0 0 calc(10px * var(--glow-scale)) var(--beam-color),
            inset 0 0 calc(18px * var(--glow-scale)) var(--beam-color-strong);
        }

        .kitt-glow{
          position:absolute; inset:-10px -14px; pointer-events:none;
          background: radial-gradient(50% 60% at 50% 50%, var(--beam-color-weak), transparent 60%);
          filter: blur(14px);
          opacity:.75;
          animation: glowFlicker 2.2s ease-in-out infinite;
        }

        /* COLORI: verde idle, rosso in registrazione */
        .brand-wrap{
          --beam-color: var(--beam-green);
          --beam-color-weak: color-mix(in oklab, var(--beam-green) 45%, transparent);
          --beam-color-strong: color-mix(in oklab, var(--beam-green) 100%, #000);
        }
        .brand-wrap.is-recording{
          --beam-color: var(--beam-red);
          --beam-color-weak: color-mix(in oklab, var(--beam-red) 45%, transparent);
          --beam-color-strong: color-mix(in oklab, var(--beam-red) 100%, #000);
        }

        @keyframes kittSweep {
          0%   { left: 0%; }
          100% { left: calc(100% - 86px); }
        }
        @keyframes glowFlicker {
          0%,100% { opacity:.7; }
          40%     { opacity:calc(.7 + (.15 * var(--glow-scale))); }
          60%     { opacity:.78; }
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
          animation: sweepBG 8s linear infinite, pulseLabel 1.3s ease-in-out infinite;
        }
        .label::after{
          content:""; position:absolute; inset:-8px -10px; pointer-events:none; border-radius: 9999px;
          background: radial-gradient(60% 55% at 50% 50%,
            color-mix(in oklab, var(--c1) 42%, transparent),
            color-mix(in oklab, var(--c2) 30%, transparent) 40%,
            transparent 70%);
          mix-blend-mode: screen; filter: blur(12px); opacity:.55; animation: pulseLabel 1.3s ease-in-out infinite;
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
        @keyframes pulseLabel { 0%,100%{ filter:brightness(1) } 50%{ filter:brightness(1.25) } }
        @keyframes sheen { 0% { left:-60%; } 100% { left:160%; } }

        @media (prefers-reduced-motion: reduce) {
          .logo-jarvis, .logo-jarvis::after,
          .kitt-beam, .kitt-glow, .label, .label::after, .link::before { animation: none !important; }
        }

        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 10px 12px; }
          .brand{ justify-content: center; }
          .track{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%; }
          .link{ width:100%; padding:10px 12px; text-align:center; border-radius:14px; }
          .kitt-slot{ width: min(320px, 92vw); height: 11px; }
        }
      `}</style>
    </>
  );
}
