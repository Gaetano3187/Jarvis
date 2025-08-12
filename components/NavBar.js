// components/NavBar.js
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';

const links = [
  { href: '/home',             label: 'Home',           c1: '#22d3ee', c2: '#38bdf8' },
  { href: '/dashboard',        label: 'Dashboard',      c1: '#e879f9', c2: '#8b5cf6' },
  { href: '/liste-prodotti',   label: 'Liste Prodotti', c1: '#10b981', c2: '#84cc16' },
  { href: '/finanze',          label: 'Finanze',        c1: '#3b82f6', c2: '#a78bfa' },
  { href: '/spese-casa',       label: 'Casa',           c1: '#0ea5e9', c2: '#3b82f6' },
  { href: '/vestiti-ed-altro', label: 'Vestiti',        c1: '#ec4899', c2: '#f43f5e' },
  { href: '/cene-aperitivi',   label: 'Cene',           c1: '#f59e0b', c2: '#f97316' },
  { href: '/varie',            label: 'Varie',          c1: '#64748b', c2: '#a1a1aa' },
];

export default function NavBar() {
  const { pathname } = useRouter();

  return (
    <>
      <nav className="nav">
        <div className="inner scroll-fade">
          {/* Brand con logo da /public/favicon.ico */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-mark">
              <Image
                src="/favicon.ico"  // ← viene da public/
                alt="Jarvis logo"
                width={28}
                height={28}
                priority
              />
            </span>
            <span className="brand-text">JARVIS</span>
          </Link>

          {/* Links */}
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
                    <span className="glow" />
                    <span className="label">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* spazio per non far coprire i contenuti dalla nav fissa */}
      <style jsx global>{`
        :root { --nav-h: 78px; }
        @media (max-width: 540px){ :root { --nav-h: 86px; } }
        body { padding-top: calc(var(--nav-h) + env(safe-area-inset-top, 0px)); }
      `}</style>

      <style jsx>{`
        :root{
          --nav-bg: rgba(2,6,23,.62);
          --nav-brd: rgba(255,255,255,.10);
          --text: #f7fafc;
        }

        .nav{
          position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
          height: var(--nav-h);
          background: var(--nav-bg);
          backdrop-filter: blur(14px) saturate(1.15);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 10px 28px rgba(0,0,0,.28);
        }

        .inner{
          height: 100%;
          display: flex; align-items: center; gap: 18px;
          padding: 0 16px;
          overflow-x: auto; scrollbar-width: none;
          justify-content: center;  /* centrata su mobile/desktop */
        }
        .inner::-webkit-scrollbar{ display:none; }

        /* Brand super luminoso + scintilla */
        .brand{
          display: inline-flex; align-items: center; gap: 12px;
          padding: 8px 10px; text-decoration: none; position: relative;
        }
        .brand-mark{
          position: relative; display: inline-grid; place-items: center;
          width: 32px; height: 32px;
          border-radius: 10px;
          overflow: hidden;
          /* glow forte intorno al logo */
          filter:
            drop-shadow(0 0 10px rgba(56,189,248,.85))
            drop-shadow(0 0 28px rgba(167,139,250,.65))
            drop-shadow(0 0 44px rgba(255,255,255,.45));
          animation: brandPulse 2.4s ease-in-out infinite;
        }
        .brand-mark :global(img){
          width: 28px; height: 28px; border-radius: 6px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.2);
        }
        /* scintilla animata (niente cerchio pulsante dietro) */
        .brand-mark::after{
          content:"";
          position:absolute; right:-2px; top:-2px;
          width:18px; height:18px;
          background:
            radial-gradient(circle at 50% 50%, #fff 0 30%, transparent 45%),
            conic-gradient(from 0deg, #fff 0 22%, transparent 22% 100%);
          filter:
            drop-shadow(0 0 6px #fff)
            drop-shadow(0 0 18px rgba(56,189,248,.9))
            drop-shadow(0 0 26px rgba(167,139,250,.8));
          mix-blend-mode: screen;
          border-radius: 50%;
          animation: sparkleSpin 1.6s linear infinite;
          pointer-events: none;
        }
        .brand-text{
          font-weight: 900; letter-spacing: .2rem; font-size: 1.02rem;
          background: linear-gradient(90deg, #fff, #e0f2fe, #a78bfa, #fff);
          background-size: 260% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow:
            0 0 10px rgba(255,255,255,.45),
            0 0 28px rgba(56,189,248,.35);
          animation: shimmerText 3.6s linear infinite;
        }

        /* Links */
        .track{ display:flex; gap: 12px; list-style:none; margin:0; padding:0; }
        .item{ white-space: nowrap; }

        .link{
          --c1: #22d3ee; --c2: #38bdf8;
          position: relative; display: inline-grid; place-items: center;
          padding: 10px 16px; border-radius: 14px;
          text-decoration: none; color: var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border: 1px solid transparent;
          isolation: isolate;
        }
        .glow{
          position: absolute; inset: -14px -22px; z-index: 0;
          background:
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c1), #ffffff 18%), transparent 60%),
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c2), #ffffff 16%), transparent 62%);
          filter: blur(16px);
          opacity: 0; transition: opacity .25s ease;
          pointer-events: none;
        }
        .label{
          position: relative; z-index: 1; font-weight: 800; letter-spacing: .02rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size: 220% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow:
            0 0 12px rgba(255,255,255,.25),
            0 0 18px color-mix(in srgb, var(--c1), #fff 20%);
          animation: shimmerText 6s linear infinite;
        }
        .link:hover{ transform: translateY(-1px); }
        .link:hover .glow{ opacity: .9; }
        .link:hover .label{ animation-duration: 3.2s; filter: brightness(1.15); }

        /* Attivo super luminoso */
        .link.is-active{
          background: rgba(255,255,255,.10);
          border-color: rgba(255,255,255,.16);
          box-shadow:
            0 10px 26px rgba(0,0,0,.35),
            0 0 0 1px rgba(255,255,255,.08) inset,
            0 0 24px color-mix(in srgb, var(--c1), #fff 30%),
            0 0 48px color-mix(in srgb, var(--c2), #fff 30%);
        }
        .link.is-active .glow{ opacity: 1; }
        .link.is-active .label{
          text-shadow:
            0 0 18px #fff,
            0 0 28px color-mix(in srgb, var(--c1), #fff 40%),
            0 0 36px color-mix(in srgb, var(--c2), #fff 35%);
          animation-duration: 2.2s;
          filter: brightness(1.25);
        }

        /* Effetti */
        @keyframes shimmerText { to { background-position: -260% center; } }
        @keyframes sparkleSpin { to { transform: rotate(360deg); } }
        @keyframes brandPulse {
          0%,100% { filter: drop-shadow(0 0 10px rgba(56,189,248,.85)) drop-shadow(0 0 28px rgba(167,139,250,.65)) drop-shadow(0 0 44px rgba(255,255,255,.45)); }
          50%     { filter: drop-shadow(0 0 16px rgba(56,189,248,1))   drop-shadow(0 0 38px rgba(167,139,250,.9))  drop-shadow(0 0 60px rgba(255,255,255,.7)); }
        }

        @media (max-width: 520px){
          .inner{ gap: 12px; justify-content: center; }
          .brand-text{ font-size: .98rem; letter-spacing: .18rem; }
        }
      `}</style>
    </>
  );
}
