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
          {/* BRAND */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-wrap">
              <span className="brand-glow" aria-hidden="true" />
              <span className="brand-text">JARVIS</span>
              <span className="brand-halo" aria-hidden="true" />
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

        .brand{ text-decoration:none; display:inline-flex; align-items:center; }
        .brand-wrap{
          position: relative; display:inline-grid; place-items:center;
          padding: 8px 4px; isolation:isolate;
        }

        /* Bagliore neon pulsante */
        .brand-glow{
          position:absolute; inset:-12px -20px; z-index:0; border-radius: 22px;
          background: conic-gradient(from 0deg at 50% 50%,
            #22d3ee, #60a5fa, #a78bfa, #f0abfc,
            #fb7185, #34d399, #a3e635, #22d3ee);
          filter: blur(28px) saturate(1.4) brightness(1.1);
          animation: glowHue 12s linear infinite, glowPulse 2.6s ease-in-out infinite;
          mix-blend-mode: screen;
        }

        /* Scritta viva + pulsazione */
        .brand-text{
          position:relative; z-index:2;
          font-family: "Orbitron", Inter, system-ui, sans-serif;
          font-weight: 900; letter-spacing: .32rem;
          font-size: clamp(1.8rem, 4vw, 2.2rem); white-space: nowrap;
          background: linear-gradient(90deg,
              #00f5ff 0%,   #00d8ff 15%,
              #00bfff 30%,  #008cff 45%,
              #7700ff 60%,  #ff00c8 75%,
              #00ff99 87%,  #b6ff00 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text; background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;
          -webkit-text-stroke: 0.6px rgba(0,0,0,.22);
          text-shadow: 0 0 10px rgba(255,255,255,.12);
          animation: textPulse 2.6s ease-in-out infinite;
        }

        .brand-halo{
          position:absolute; inset:-4px; z-index:3; pointer-events:none;
          background: radial-gradient(120% 120% at 50% -30%, rgba(255,255,255,.25), transparent 60%);
          mix-blend-mode: screen; filter: blur(8px);
        }

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
        }
        .label{
          font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          -webkit-background-clip:text; background-clip:text; color:transparent;
          text-shadow: 0 0 12px rgba(255,255,255,.12);
        }
        .link.is-active{
          background: rgba(255,255,255,.12);
          border-color: rgba(255,255,255,.22);
        }

        @keyframes glowHue     { to { filter: hue-rotate(360deg) saturate(1.4); } }
        @keyframes glowPulse   { 0%,100% { opacity:.75; } 50% { opacity:1; } }
        @keyframes textPulse   { 0%,100% { filter: brightness(1) saturate(1); } 50% { filter: brightness(1.35) saturate(1.4); } }

        /* Smartphone: 3 colonne x N righe */
        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; }
          .brand{ justify-content: center; }
          .track{
            display:grid;
            grid-template-columns: repeat(3, 1fr);
            gap:10px; width:100%;
          }
          .link{ width:100%; padding:10px; text-align:center; }
        }
      `}</style>
    </>
  );
}
