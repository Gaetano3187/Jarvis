// components/NavBar.js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

/* === NAV LINKS === */
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

          {/* Header */}
          <div className="np-wrap">
            {/* Titolo neon a due layer: stroke + fill */}
            <h1 className="np-title" aria-label="Lista Prodotti">
              <span className="np-stroke">LISTA PRODOTTI</span>
              <span className="np-fill">LISTA PRODOTTI</span>
            </h1>

            {/* Pulsanti a destra: invariati */}
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <button onClick={()=>{
                try { localStorage.removeItem(LS_KEY); } catch (e) {}
                setLists({ [LIST_TYPES.SUPERMARKET]: [], [LIST_TYPES.ONLINE]: [] });
                setStock([]);
                setCurrentList(LIST_TYPES.SUPERMARKET);
                setImagesIndex({});
                showToast('Dati locali azzerati', 'ok');
              }} style={styles.actionGhost} title="Cancella i dati locali">↺ Reset locale</button>
              <Link href="/home" legacyBehavior><a style={styles.homeBtn}>Home</a></Link>
            </div>

            {/* Lampi dietro al testo */}
            <svg className="np-bolts" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <defs>
                {/* Glow morbido per i lampi */}
                <filter id="np-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                <linearGradient id="np-bolt-grad" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%"  stopColor="#7fd9ff"/>
                  <stop offset="60%" stopColor="#34c3ff"/>
                  <stop offset="100%" stopColor="#bff0ff"/>
                </linearGradient>
              </defs>

              {/* 3 scariche sfasate per effetto pseudo-random */}
              <g filter="url(#np-glow)" stroke="url(#np-bolt-grad)" strokeWidth="3" strokeLinecap="round" fill="none">
                <path className="bolt b1" d="M90,160 L210,120 260,140 330,80 420,120 520,70 610,95 720,55 820,85 910,60 1020,90 1100,70" />
                <path className="bolt b2" d="M140,95 L230,70 300,105 370,60 450,85 520,55 600,78 690,48 780,68 860,52 950,75 1040,60 1130,80" />
                <path className="bolt b3" d="M60,120 L170,85 240,110 320,75 410,95 500,68 590,90 680,66 770,88 860,70 950,92 1040,72 1130,100" />
              </g>
            </svg>

            {/* Flash schermo (breve) */}
            <div className="np-flash" aria-hidden="true" />
          </div>

          <style jsx>{`
            /* Layout header */
            .np-wrap{
              position:relative;
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:12px;
              margin-bottom:8px;
              padding-top:6px;
              /* nessun background per lasciare visibile il globale */
              background: transparent;
            }

            /* Titolo neon */
            .np-title{
              position:relative;
              margin:0;
              line-height:1;
              height:72px;
              display:flex;
              align-items:center;
              letter-spacing:.06em;
            }
            .np-title > span{
              position:absolute; inset:0;
              display:flex; align-items:center;
              font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
              font-weight:900;
              font-size:48px;
              white-space:nowrap;
              pointer-events:none;
            }

            /* Outline forte come nel reference */
            .np-stroke{
              color: transparent;
              -webkit-text-stroke: 2px #7fd9ff;
              text-shadow:
                0 0 8px rgba(111,220,255,.9),
                0 0 16px rgba(111,220,255,.6),
                0 0 28px rgba(60,190,255,.45),
                0 0 48px rgba(60,190,255,.35);
              animation: np-flicker 4.5s linear infinite;
            }

            /* Riempimento tenue + alone interno */
            .np-fill{
              background: linear-gradient(90deg, #bff0ff 0%, #76dcff 40%, #2fb8ff 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              color: transparent;
              text-shadow:
                0 0 6px rgba(140,230,255,.55),
                0 0 14px rgba(80,210,255,.35);
              animation: np-flicker-soft 5s ease-in-out infinite;
            }

            /* Sfarfallio leggero (no fastidio) */
            @keyframes np-flicker {
              0%, 100% { opacity: 1; filter: saturate(1) brightness(1); }
              8%  { opacity: .96; }
              9%  { opacity: 1;   }
              38% { opacity: .94; }
              40% { opacity: 1;   }
              63% { opacity: .92; }
              66% { opacity: 1;   }
            }
            @keyframes np-flicker-soft {
              0%, 100% { filter: brightness(1); }
              50%      { filter: brightness(1.08); }
            }

            /* SVG lampi, dietro al testo */
            .np-bolts{
              position:absolute;
              inset: -10px 0 auto 0;
              height: 90px;
              z-index: 0;
              opacity:.0;     /* default spenti */
              pointer-events:none;
            }
            .bolt{ opacity:0; }
            .bolt.b1{ animation: np-bolt 5.6s infinite; }
            .bolt.b2{ animation: np-bolt 6.3s infinite 1.2s; }
            .bolt.b3{ animation: np-bolt 7.1s infinite 2.1s; }

            /* flash dei lampi */
            @keyframes np-bolt {
              0%, 94%, 100% { opacity:0; }
              95% { opacity:.95; }
              96% { opacity:.2; }
              97% { opacity:.8; }
              98% { opacity:.15; }
              99% { opacity:.7; }
            }

            /* bagliore sullo schermo in sincrono (breve) */
            .np-flash{
              position:absolute;
              inset:-12px -8px;
              background: radial-gradient(70% 60% at 30% 40%, rgba(160,230,255,.22), rgba(160,230,255,0) 60%);
              mix-blend-mode: screen;
              opacity:0;
              pointer-events:none;
              animation: np-flash 6.3s infinite 1s;
            }
            @keyframes np-flash{
              0%, 94%, 100% { opacity:0; }
              95% { opacity:.35; }
              96% { opacity:.08; }
              97% { opacity:.25; }
              98% { opacity:.05; }
              99% { opacity:.18; }
            }

            /* Responsivo */
            @media (max-width: 560px){
              .np-title > span { font-size:34px; }
              .np-title { height:60px; }
              .np-bolts { height:76px; }
            }
          `}</style>

}


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
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">
          {/* ===== LOGO ===== */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="bolt-logo" title="JARVIS">
              <LightningLogo />
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
          --glass: rgba(11, 16, 30, .55);
          --glass2: rgba(255,255,255,.08);
          --glassBorder: rgba(255,255,255,.22);
        }

        /* ===== NAV glass con rilievo vetrato molto accentuato ===== */
        .nav{
          position: sticky; top: 0; z-index: 60; width: 100%;
          background: var(--glass);
          backdrop-filter: blur(22px) saturate(1.25) contrast(1.05);
          -webkit-backdrop-filter: blur(22px) saturate(1.25) contrast(1.05);
          border-bottom: 1px solid rgba(255,255,255,.09);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.35),      /* highlight superiore */
            inset 0 -2px 6px rgba(0,0,0,.55),         /* inner-ombra bassa */
            0 30px 60px rgba(0,0,0,.45),              /* ombra esterna */
            0 0 80px rgba(80,180,255,.15);            /* alone freddo */
        }
        /* bordo vetroso con effetto "bevel" */
        .nav::before{
          content:"";
          position:absolute; inset:0;
          border-radius: 0;
          background:
            linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 40%),
            linear-gradient(0deg, rgba(255,255,255,.12), rgba(255,255,255,0) 70%);
          mix-blend-mode: screen;
          pointer-events:none;
        }
        /* riflesso mobile */
        .nav::after{
          content:"";
          position:absolute; left:-20%; top:-140%;
          width:60%; height:300%;
          transform: rotate(12deg);
          background: linear-gradient(130deg, rgba(255,255,255,.18), transparent 45%);
          filter: blur(8px);
          opacity:.8;
          animation: sheen 7s linear infinite;
          pointer-events:none;
        }
        @keyframes sheen { 0%{ left:-20% } 100%{ left:120% } }

        .inner{ min-height: 78px; display:flex; align-items:center; gap:18px; padding:12px 16px; position:relative; }

        /* ===== LOGO ===== */
        .brand{ text-decoration:none; display:flex; align-items:center; }
        .bolt-logo{ display:grid; place-items:center; padding:0 2px; position:relative; }
        .bolt-svg{ width:min(420px, 70vw); height:auto; }

        /* ===== MENU ===== */
        .track{ display:flex; gap:12px; list-style:none; margin:0; padding:0; }
        .item{ flex: 0 0 auto; }
        .item.spacer{ visibility:hidden; height:0; padding:0; margin:0; }

        .link{
          --c1:#8b5cf6; --c2:#60a5fa;
          position: relative; display:grid; place-items:center;
          padding: 11px 16px; border-radius: 14px;
          text-decoration:none; color:#eef2ff;
          border:1px solid var(--glassBorder);
          background:
            linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.06)),
            linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.20));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.45),
            inset 0 -2px 6px rgba(0,0,0,.55),
            0 10px 28px rgba(0,0,0,.35);
          transition: transform .18s ease, box-shadow .2s ease, border-color .2s ease;
          overflow: hidden;
        }
        .link::before{
          content:""; position:absolute; inset:-12px;
          background: radial-gradient(120% 120% at 20% 0%,
            rgba(255,255,255,.18), transparent 50%);
          mix-blend-mode: screen; opacity:.6; pointer-events:none;
        }
        .label{
          position:relative; font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2), var(--c1));
          background-size:220% auto; -webkit-background-clip:text; color:transparent;
          text-shadow: 0 0 6px rgba(0,0,0,.55), 1px 1px 0 rgba(0,0,0,.5);
          animation: sweepBG 8s linear infinite, pulseLabel 1.2s ease-in-out infinite;
        }
        .active-glow{
          position:absolute; inset:-10px; border-radius:18px; pointer-events:none;
          background:
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c2), white 20%) 0%, transparent 65%);
          opacity:0; filter: blur(14px); transition: opacity .25s ease;
        }

        .link:hover{ transform: translateY(-1px) scale(1.02); }
        .link.is-active{
          background:
            linear-gradient(180deg, rgba(255,255,255,.26), rgba(255,255,255,.10)),
            linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.25));
          border-color: rgba(255,255,255,.35);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.65),
            inset 0 -3px 8px rgba(0,0,0,.65),
            0 18px 36px rgba(0,0,0,.45),
            0 0 24px color-mix(in oklab, var(--c2), white 25%),
            0 0 60px color-mix(in oklab, var(--c2), white 15%);
        }
        .link.is-active .active-glow{ opacity:.95; }

        @keyframes sweepBG { to { background-position: 200% 50%; } }
        @keyframes pulseLabel { 0%,100%{ filter:brightness(1) } 50%{ filter:brightness(1.2) } }

        @media (prefers-reduced-motion: reduce) {
          .bolt-svg, .label, .link::before, .nav::after, .logoAura::before { animation: none !important; }
        }
        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 10px 12px; }
          .brand{ justify-content: center; }
          .track{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%; }
          .link{ width:100%; padding:10px 12px; text-align:center; border-radius:14px; }
          .bolt-svg{ width: min(320px, 86vw); }
        }
      `}</style>
    </>
  );
}
