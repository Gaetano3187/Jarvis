// components/NavBar.js
import Head from 'next/head';
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

  // filler per completare multipli di 3 su mobile
  const modulo = links.length % 3;
  const fillers = modulo === 0 ? 0 : 3 - modulo;
  const mobileFillers = Array.from({ length: fillers }, (_, i) => `spacer-${i}`);

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
          {/* ===== LOGO GIARCIS (neon + aura) ===== */}
          <Link href="/home" className="brand" aria-label="Giarcis Home">
            <span className="brand-wrap">
              {/* Aura caleidoscopio leggera ma visibile */}
              <span className="logo-aura" aria-hidden="true" />
              {/* Scritta super luminosa + pulsazione */}
              <span className="logo-text" data-text="GIARCIS">GIARCIS</span>
            </span>
          </Link>

          {/* MENU */}
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
            {mobileFillers.map(key => (
              <li key={key} className="item spacer" aria-hidden="true" />
            ))}
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
          position: sticky; top: 0; z-index: 60;
          width: 100%; background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.2);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 12px 30px rgba(0,0,0,.30);
        }
        .inner{
          min-height: 64px; display: flex; align-items: center;
          gap: 24px; padding: 6px 16px;
        }

        /* ===== BRAND ===== */
        .brand{ text-decoration:none; display:inline-flex; align-items:center; }
        .brand-wrap{
          position: relative; display:inline-grid; place-items:center;
          padding: 8px 4px; isolation:isolate;
        }

        /* AURA caleidoscopio (statica, intensa ma leggera) */
        .logo-aura{
          position:absolute; inset:-16px -22px; z-index:0; pointer-events:none;
          background:
            conic-gradient(from 0deg at 50% 50%,
              rgba(239,68,68,.58),   /* rosso */
              rgba(229,43,80,.54),   /* amaranto */
              rgba(22,163,74,.54),   /* verde  */
              rgba(239,68,68,.58));
          filter: blur(26px) saturate(1.15);
          opacity:.62;                         /* visibile ma non copre */
          mix-blend-mode: screen;              /* solo schiarisce */
          border-radius: 9999px;
          clip-path: ellipse(78% 66% at 50% 50%);
          -webkit-mask-image: radial-gradient(ellipse at center, #000 70%, transparent 78%);
                  mask-image: radial-gradient(ellipse at center, #000 70%, transparent 78%);
        }

        /* SCRITTA GIARCIS — NEON GLOW + PULSE */
        .logo-text{
          position:relative; z-index:1; display:inline-block;
          font-family: "Orbitron", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900;
          letter-spacing: .32rem;
          font-size: clamp(1.8rem, 4vw, 2.2rem);
          line-height: 1; white-space: nowrap;

          /* bordo nero netto per leggibilità */
          -webkit-text-stroke: 1.1px #000; paint-order: stroke fill;

          /* riempimento caleidoscopio (rosso → amaranto → verde) che scorre L->R */
          background:
            linear-gradient(90deg,
              #ef4444 0%,
              #e52b50 33%,
              #16a34a 66%,
              #ef4444 100%
            );
          background-size: 300% 100%;
          background-position: 0% 50%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;

          /* bagliore statico base (leggero) */
          text-shadow:
            0 0 10px rgba(255,255,255,.25),
            0 0 18px rgba(239,68,68,.25),
            0 0 26px rgba(22,163,74,.20);

          /* animazioni scritta: scorrimento colore + pulsazione */
          animation:
            fillSweep 8s linear infinite,   /* L -> R */
            neonPulse 2.4s ease-in-out infinite;
          will-change: background-position, filter, transform;
        }

        /* GLOW DINAMICO (doppio strato) tramite pseudo-elementi */
        .logo-text::before,
        .logo-text::after{
          content: attr(data-text);
          position: absolute; inset: 0;
          pointer-events: none;
          color: transparent;
          -webkit-text-fill-color: transparent;
          -webkit-background-clip: text; background-clip: text;
          mix-blend-mode: screen;
        }
        /* glow vicino al testo (più definito) */
        .logo-text::before{
          background: inherit;                   /* stesso gradiente del fill */
          filter: blur(8px) brightness(1.8) saturate(1.4);
          opacity:.85;
          animation: neonPulse 2.4s ease-in-out infinite;
        }
        /* glow più distante (alone ampio) */
        .logo-text::after{
          background: inherit;
          filter: blur(18px) brightness(1.6) saturate(1.2);
          opacity:.55;
          animation: neonPulse 2.4s ease-in-out infinite;
          animation-delay: .05s;                 /* leggero sfasamento */
        }

        /* ===== MENU ===== */
        .track{
          display:flex; gap:16px; list-style:none; margin:0; padding:0;
        }
        .item{ flex: 0 0 auto; }
        .item.spacer{ visibility:hidden; height:0; padding:0; margin:0; }
        .link{
          --c1:#5eead4; --c2:#22d3ee;
          display:inline-grid; place-items:center;
          padding: 12px 20px; border-radius: 16px;
          text-decoration:none; color:var(--text);
          border:1px solid transparent;
          transition: transform .18s ease, background .2s ease, box-shadow .2s ease;
        }
        .label{
          font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size:200% auto; -webkit-background-clip:text; background-clip:text; color:transparent;
        }
        .link:hover{ transform: translateY(-1px); }
        .link.is-active{
          background: rgba(255,255,255,.12);
          border-color: rgba(255,255,255,.22);
          box-shadow: 0 14px 32px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.07) inset;
        }

        /* ===== KEYFRAMES (solo per il nuovo logo) ===== */
        @keyframes fillSweep { to { background-position: 200% 50%; } }
        @keyframes neonPulse {
          0%, 100% { filter: brightness(1.0) saturate(1.0); transform: scale(1); }
          50%      { filter: brightness(1.45) saturate(1.25); transform: scale(1.01); }
        }

        @media (prefers-reduced-motion: reduce) {
          .logo-text, .logo-text::before, .logo-text::after { animation: none !important; }
        }

        /* ===== SMARTPHONE: 3 colonne x N righe ===== */
        @media (max-width: 560px){
          .inner{
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            padding: 8px 10px 10px;
          }
          .brand{ justify-content: center; }
          .logo-text{
            font-size: clamp(1.7rem, 8vw, 2.1rem);
            letter-spacing: .30rem;
          }
          .track{
            display:grid;
            grid-template-columns: repeat(3, 1fr);
            gap:10px; width:100%;
          }
          .link{
            width:100%;
            padding:10px 12px;
            text-align:center;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.12);
            background: rgba(255,255,255,.05);
          }
        }

        /* fascia intermedia */
        @media (min-width: 561px) and (max-width: 860px){
          .inner{ padding: 8px 12px; }
          .track{ flex-wrap: wrap; gap: 12px; }
          .item{ flex: 0 0 auto; }
        }
      `}</style>
    </>
  );
}
