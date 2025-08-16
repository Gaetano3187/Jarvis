// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';

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

  // ====== Mic reactive (start/stop con eventi globali) ======
  const hostRef = useRef(null);        // nodo che porta la CSS var --amp
  const ctxRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const setAmp = (val) => {
      if (hostRef.current) hostRef.current.style.setProperty('--amp', String(val));
    };

    const loop = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);

      // media dei bassi/medi
      let sum = 0;
      const n = Math.max(8, Math.floor(data.length / 3));
      for (let i = 0; i < n; i++) sum += data[i];
      const avg = sum / n;                 // 0..255
      const norm = Math.min(1, avg / 180); // 0..1
      const amp = 1 + norm * 1.2;          // 1..2.2 circa
      setAmp(amp);

      rafRef.current = requestAnimationFrame(loop);
    };

    const startMic = async () => {
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
        analyserRef.current = analyser;
        loop();
      } catch (e) {
        console.warn('Mic non disponibile:', e);
      }
    };

    const stopMic = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try { ctxRef.current?.close(); } catch {}
      ctxRef.current = null;
      analyserRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setAmp(1); // torna a baseline
    };

    const onStart = () => startMic();
    const onStop  = () => stopMic();

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
          {/* ===== LOGO: Onda ECG (è il logo; niente testo) ===== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="ecg-wrap" ref={hostRef} title="JARVIS">
              <svg className="ecg" viewBox="0 0 600 120" preserveAspectRatio="xMidYMid meet" role="img" aria-label="ECG animated">
                <defs>
                  <linearGradient id="jarvisGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="#16b7ff"/>
                    <stop offset="45%"  stopColor="#7c4dff"/>
                    <stop offset="100%" stopColor="#ff3aa6"/>
                  </linearGradient>
                  <filter id="jarvisGlow" x="-40%" y="-120%" width="180%" height="300%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b1"/>
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b2"/>
                    <feMerge>
                      <feMergeNode in="b2"/>
                      <feMergeNode in="b1"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>

                {/* “glow” sotto, più spesso */}
                <path
                  className="ecg-line ecg-glow"
                  d="M 0 60
                     L 40 60 55 58 65 62 80 60
                     110 60 122 40 126 85 130 60
                     170 60 180 60 200 60
                     230 60 245 58 255 62 270 60
                     300 60 312 38 316 88 320 60
                     360 60 380 60
                     410 60 425 58 435 62 450 60
                     480 60 492 40 496 85 500 60
                     540 60 560 60 600 60"
                />
                {/* linea principale */}
                <path
                  className="ecg-line"
                  d="M 0 60
                     L 40 60 55 58 65 62 80 60
                     110 60 122 40 126 85 130 60
                     170 60 180 60 200 60
                     230 60 245 58 255 62 270 60
                     300 60 312 38 316 88 320 60
                     360 60 380 60
                     410 60 425 58 435 62 450 60
                     480 60 492 40 496 85 500 60
                     540 60 560 60 600 60"
                />
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
          gap: 22px; padding: 10px 16px;
        }

        /* ===== LOGO ECG ===== */
        .brand{ text-decoration:none; display:flex; align-items:center; }
        .ecg-wrap{
          --amp: 1; /* 1..~2.2; aggiornato dal mic */
          position:relative; display:grid; place-items:center; padding:4px 6px; isolation:isolate;
        }
        .ecg{ width: min(520px, 56vw); height:auto; transform-origin:center;
              animation: waveBreath 2.6s ease-in-out infinite; }
        /* quando il mic è attivo, l'ampiezza (via --amp) fa “respirare” di più */
        @keyframes waveBreath {
          0%,100% { transform: scaleY(calc(1 * var(--amp))); filter: brightness(1) saturate(1); }
          50%     { transform: scaleY(calc(1.10 * var(--amp))); filter: brightness(1.12) saturate(1.12); }
        }

        .ecg-line{
          fill: none;
          stroke: url(#jarvisGradient);
          stroke-width: 3.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: url(#jarvisGlow);
          stroke-dasharray: 14 24;
          animation: ecgFlow 3.6s linear infinite, ecgPulse 1.8s ease-in-out infinite;
        }
        .ecg-glow{
          stroke-width: 6.6;
          opacity: .35;
          animation: ecgFlow 3.6s linear infinite, ecgPulseGlow 1.8s ease-in-out infinite;
        }
        @keyframes ecgFlow { to { stroke-dashoffset: -420; } }
        @keyframes ecgPulse {
          0%,100% { transform: translateY(0) }
          50%     { transform: translateY(-0.6px) }
        }
        @keyframes ecgPulseGlow { 0%,100% { opacity:.35 } 50% { opacity:.55 } }

        /* ===== MENU ===== */
        .track{ display:flex; gap:14px; list-style:none; margin:0; padding:0; }
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
          animation: sweepBG 8s linear infinite, pulseLabel 1.3s ease-in-out infinite;
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
          .ecg, .ecg-line, .label, .link::before { animation: none !important; }
        }
        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 10px 12px; }
          .brand{ justify-content: center; }
          .track{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%; }
          .link{ width:100%; padding:10px 12px; text-align:center; border-radius:14px; }
          .ecg{ width: min(420px, 90vw); }
        }
      `}</style>
    </>
  );
}
