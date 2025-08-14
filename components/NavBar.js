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

  // Filler per completare multipli di 3 su mobile
  const modulo = links.length % 3;
  const fillers = modulo === 0 ? 0 : 3 - modulo;
  const mobileFillers = Array.from({ length: fillers }, (_, i) => `spacer-${i}`);

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav" role="navigation" aria-label="Navigazione principale">
        <div className="inner">
          {/* LOGO */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-wrap">
              <span className="logo-glow" data-text="JARVIS">JARVIS</span>
              <span className="logo-text" data-text="JARVIS">JARVIS</span>
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
                    style={{ '--c1': c1, '--c2': c2 }}
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
          --nav-bg: rgba(5, 8, 22, 0.72);
          --nav-brd: rgba(255,255,255,.12);
          --text: #f8fafc;
        }

        .nav{
          position: sticky; top: 0; z-index: 60;
          width: 100%;
          background: var(--nav-bg);
          backdrop-filter: blur(14px) saturate(1.2);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 12px 30px rgba(0,0,0,.30);
        }
        .inner{
          min-height: 70px; display: flex; align-items: center;
          gap: 24px; padding: 8px 16px;
        }

        /* ===== LOGO ===== */
        .brand{ text-decoration:none; display:inline-flex; align-items:center; }
        .brand-wrap{
          position: relative; display:inline-grid; place-items:center;
          padding: 8px 4px; isolation:isolate;
        }

        /* Bagliore neon */
        .logo-glow{
          position:absolute; z-index:1; inset:0; pointer-events:none;
          display:inline-grid; place-items:center;
          font-family: "Orbitron", sans-serif;
          font-weight: 900; letter-spacing: .32rem;
          font-size: clamp(2rem, 4.8vw, 2.6rem);
          text-transform: uppercase;
          background:
            conic-gradient(from 0deg at 50% 50%,
              #ff00ff, #00ffff, #ffff00, #ff0000, #ff00ff);
          background-size: 300% 300%;
          -webkit-background-clip: text;
          color: transparent;
          filter: blur(14px) brightness(2) saturate(2);
          animation:
            kaleido 6s linear infinite,
            neonPulse 2.5s ease-in-out infinite;
        }

        /* Testo 3D neon */
        .logo-text{
          position:relative; z-index:2; display:inline-block;
          font-family: "Orbitron", sans-serif;
          font-weight: 900; letter-spacing: .32rem;
          font-size: clamp(2rem, 4.8vw, 2.6rem);
          text-transform: uppercase;
          -webkit-text-stroke: 1.3px #000;
          text-shadow:
            0 0 5px #fff,
            0 0 10px #fff,
            0 0 20px #ff00de,
            0 0 30px #ff00de,
            0 0 40px #ff00de,
            0 0 55px #ff00de,
            0 0 75px #ff00de;
          background:
            conic-gradient(from 0deg at 50% 50%,
              #ff00ff, #00ffff, #ffff00, #ff0000, #ff00ff);
          background-size: 300% 300%;
          -webkit-background-clip: text;
          color: transparent;
          animation: kaleido 6s linear infinite;
        }

        /* ===== MENU ===== */
        .track{
          display:flex; gap:14px; list-style:none; margin:0; padding:0;
        }
        .item.spacer{ visibility:hidden; }
        .link{
          --c1:#5eead4; --c2:#22d3ee;
          display:inline-grid; place-items:center;
          padding: 12px 20px; border-radius: 16px;
          text-decoration:none;
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.12);
          transition: transform .18s ease, box-shadow .2s ease;
        }
        .label{
          font-weight:900;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size:200% auto;
          -webkit-background-clip:text;
          color:transparent;
          text-shadow: 0 0 8px currentColor, 0 0 20px currentColor;
          animation: sweep 6s linear infinite, neonPulse 2.5s ease-in-out infinite;
        }
        .link:hover{ transform: scale(1.05); }

        /* ===== ANIMAZIONI ===== */
        @keyframes kaleido { to { background-position: 360deg center; } }
        @keyframes sweep { to { background-position: 200% center; } }
        @keyframes neonPulse {
          0%,100% { filter: brightness(1) saturate(1); }
          50% { filter: brightness(1.4) saturate(1.8); }
        }

        @media (max-width: 560px){
          .inner{ flex-direction: column; align-items: stretch; gap: 8px; }
          .brand{ justify-content: center; }
          .track{
            display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; width:100%;
          }
          .link{ width:100%; padding:10px 12px; text-align:center; }
        }
      `}</style>
    </>
  );
}
