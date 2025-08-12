// components/NavBar.js
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

  return (
    <>
      <nav className="nav">
        <div className="inner">
          {/* BRAND */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-skin">
              <span className="brand-glow" aria-hidden="true" />
              <span className="brand-text brand-text--stone">JARVIS</span>
            </span>

            {/* Equalizzatore + alternanza immagine */}
            <span className="brand-anim" aria-hidden="true">
              <span className="eqbox">
                <span className="bar b1" />
                <span className="bar b2" />
                <span className="bar b3" />
                <span className="bar b4" />
                <span className="bar b5" />
                <span className="bar b6" />
              </span>
            </span>
          </Link>

          {/* LINKS */}
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
                    {/* niente glow dietro i link */}
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
          --eq-bg: url('/ai-eq-bg.jpg'); /* opzionale */
        }

        .nav{
          position: sticky; top: 0; z-index: 60;
          width: 100%; background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.2);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 12px 30px rgba(0,0,0,.30);
        }
        .inner{
          height: 64px;
          display: flex; align-items: center; justify-content: flex-start;
          padding: 0 16px; gap: 32px; overflow: hidden;
        }

        /* BRAND (animazioni) */
        .brand{
          display:inline-flex; align-items:center; gap:22px;
          padding:8px 8px 8px 0; text-decoration:none; margin-right:28px;
        }
        .brand-skin{
          position: relative; display: inline-grid; place-items: center;
          animation: toneSync 14s linear infinite; /* sincronizza tono glow */
        }
        .brand-glow{
          position:absolute; inset:-14px -20px; pointer-events:none;
          background:
            radial-gradient(60% 60% at 30% 50%, rgba(94,234,212,.55), transparent 60%),
            radial-gradient(70% 70% at 80% 50%, rgba(96,165,250,.48), transparent 62%);
          filter: blur(20px);
          animation: brandPulse 2.3s ease-in-out infinite;
        }

        /* === SCRITTA "SCOLPITA NELLA PIETRA" === */
        .brand-text{
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .30rem;
          font-size: clamp(1.65rem, 3.6vw, 2rem);
          line-height: 1;
          white-space: nowrap;
        }
        .brand-text--stone{
          /* riempimento pietra con venature leggere */
          background:
            linear-gradient(180deg, #f2f2f2 0%, #d9d9d9 40%, #cfcfcf 60%, #bdbdbd 100%),
            radial-gradient(120% 180% at 20% 0%, rgba(255,255,255,.25), transparent 55%),
            radial-gradient(120% 180% at 80% 100%, rgba(0,0,0,.10), transparent 60%),
            repeating-linear-gradient(45deg, rgba(0,0,0,.03) 0 2px, rgba(255,255,255,.03) 2px 4px);
          background-size: 200% 200%;
          -webkit-background-clip: text; background-clip: text; color: transparent;

          /* incisione/rilievo: bordo leggero + ombre/luci opposte */
          -webkit-text-stroke: 0.7px rgba(0,0,0,.22);
          paint-order: stroke fill;

          /* scolpito (concavo): luce sopra/sinistra, ombra sotto/destra */
          text-shadow:
            -1px -1px 0 rgba(255,255,255,.70),   /* cresta chiara in alto-sx */
             1px  1px 0 rgba(0,0,0,.40),        /* taglio scuro in basso-dx */
            -2px -2px 1px rgba(255,255,255,.35), /* highlight più ampio */
             2px  2px 2px rgba(0,0,0,.35),       /* profondità */
             0    1px 2px rgba(0,0,0,.28),       /* ombra morbida */
             0    0   30px rgba(56,189,248,.55), /* alone freddo delicato */
             0    0   54px rgba(167,139,250,.40);

          /* più brillante per non risultare scura */
          filter: brightness(1.25) contrast(1.05) saturate(1.05);

          /* movimento delicato delle venature (effetto “vivo” ma pietra) */
          animation: kaleidoStone 12s linear infinite, glowBreath 2.4s ease-in-out infinite;
        }

        /* Equalizzatore blu/verde */
        .brand-anim{ width: 140px; height: 24px; display:inline-grid; place-items:center; }
        .eqbox{
          position: relative; width: 100%; height: 100%;
          display:grid; grid-auto-flow:column; align-items:end; justify-content:center; gap:6px;
        }
        .eqbox::before{
          content:""; position:absolute; inset:-2px -6px; z-index:-1;
          background: var(--eq-bg) center/cover no-repeat,
                      radial-gradient(120% 120% at 80% 20%, rgba(255,255,255,.14), transparent 60%);
          border-radius: 8px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 10px 24px rgba(0,0,0,.35);
          opacity: 0; filter: saturate(1.05) contrast(1.05) brightness(0.95);
          animation: bgAlt 5.2s ease-in-out infinite;
        }
        .bar{
          width: 9px; height: 10px; border-radius: 3px; transform-origin: bottom center;
          background: linear-gradient(to top, #22c55e 0%, #38bdf8 60%, #60a5fa 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.35),
            0 0 12px rgba(56,189,248,.55),
            0 0 22px rgba(96,165,250,.45);
          animation: barHop 1s ease-in-out infinite;
        }
        .b1{ animation-duration: .92s; }
        .b2{ animation-duration: 1.08s; animation-delay: .05s; }
        .b3{ animation-duration: .96s;  animation-delay: .10s; }
        .b4{ animation-duration: 1.14s; animation-delay: .15s; }
        .b5{ animation-duration: 1.26s; animation-delay: .20s; }
        .b6{ animation-duration: .88s;  animation-delay: .25s; }

        /* MENU (niente glow di sfondo) */
        .track{ display:flex; gap:16px; list-style:none; margin:0; padding:0; }
        .item{ white-space:nowrap; }
        .link{
          --c1:#5eead4; --c2:#22d3ee;
          position:relative; display:inline-grid; place-items:center;
          padding: 12px 20px; border-radius: 16px;
          text-decoration:none; color:var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border:1px solid transparent; isolation:isolate;
        }
        .label{
          position:relative; z-index:1; font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size:200% auto; -webkit-background-clip:text; background-clip:text; color:transparent;
          text-shadow: 0 0 16px rgba(255,255,255,.16);
          animation: shimmerText 6s linear infinite; filter: brightness(1.25);
        }
        .link:hover{ transform: translateY(-1px); }
        .link.is-active{
          background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.22);
          box-shadow: 0 14px 32px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.07) inset;
          filter: brightness(1.12);
        }
        .link.is-active .label{
          text-shadow:
            0 0 28px color-mix(in srgb, var(--c1), #fff 40%),
            0 0 46px color-mix(in srgb, var(--c2), #fff 30%),
            0 0 64px rgba(255,255,255,.28);
          animation-duration: 2.2s; filter: brightness(1.5);
        }

        /* ANIMAZIONI */
        @keyframes shimmerText { to { background-position: -200% center; } }
        @keyframes toneSync    { to { filter: hue-rotate(360deg); } }
        @keyframes glowBreath  {
          0%,100% { text-shadow:
            -1px -1px 0 rgba(255,255,255,.70), 1px 1px 0 rgba(0,0,0,.40),
            -2px -2px 1px rgba(255,255,255,.35), 2px 2px 2px rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.28),
            0 0 26px rgba(56,189,248,.55), 0 0 48px rgba(167,139,250,.40); }
          50%     { text-shadow:
            -1px -1px 0 rgba(255,255,255,.85), 1px 1px 0 rgba(0,0,0,.46),
            -2px -2px 2px rgba(255,255,255,.45), 2px 2px 3px rgba(0,0,0,.40), 0 2px 3px rgba(0,0,0,.30),
            0 0 38px rgba(56,189,248,.80), 0 0 70px rgba(167,139,250,.60); }
        }
        @keyframes brandPulse  { 0%,100% { opacity:.60; transform: scale(1); } 50% { opacity:.98; transform: scale(1.05); } }
        @keyframes barHop      { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
        @keyframes bgAlt       { 0%,42% { opacity: 0; } 50%,92% { opacity: .95; } 100% { opacity: 0; } }

        /* movimento “venature” della pietra: lento e sobrio */
        @keyframes kaleidoStone { to { background-position: 180% 160%, 0 0, 0 0, 0 0; } }

        @media (max-width: 560px){
          .inner{ gap:22px; padding:0 12px; }
          .brand-text{ font-size:1.7rem; letter-spacing:.28rem; }
          .brand-anim{ width:120px; height:22px; }
          .track{ gap:12px; }
          .link{ padding:10px 16px; }
        }
      `}</style>
    </>
  );
}
