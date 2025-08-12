// components/NavBar.js
import Link from 'next/link';
import { useRouter } from 'next/router';

const links = [
  { href: '/home',             label: 'Home',           c1: '#22d3ee', c2: '#38bdf8' }, // teal → cyan
  { href: '/dashboard',        label: 'Dashboard',      c1: '#e879f9', c2: '#8b5cf6' }, // fuchsia → violet
  { href: '/liste-prodotti',   label: 'Liste Prodotti', c1: '#10b981', c2: '#84cc16' }, // emerald → lime
  { href: '/finanze',          label: 'Finanze',        c1: '#3b82f6', c2: '#a78bfa' }, // blue → violet
  { href: '/spese-casa',       label: 'Casa',           c1: '#0ea5e9', c2: '#3b82f6' }, // sky → blue
  { href: '/vestiti-ed-altro', label: 'Vestiti',        c1: '#ec4899', c2: '#f43f5e' }, // pink → rose
  { href: '/cene-aperitivi',   label: 'Cene',           c1: '#f59e0b', c2: '#f97316' }, // amber → orange
  { href: '/varie',            label: 'Varie',          c1: '#64748b', c2: '#a1a1aa' }, // slate → zinc
];

export default function NavBar() {
  const { pathname } = useRouter();

  return (
    <>
      <nav className="nav">
        <div className="inner scroll-fade">
          {/* Brand */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-dot" />
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

      <style jsx>{`
        :root{
          --nav-bg: rgba(2,6,23,.58);    /* #020617 con trasparenza */
          --nav-brd: rgba(255,255,255,.08);
          --text: #e5e7eb;
        }

        .nav{
          position: sticky; top: 0; z-index: 50;
          width: 100%;
          background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.1);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 8px 24px rgba(0,0,0,.25);
        }

        .inner{
          height: 64px; display: flex; align-items: center; gap: 16px;
          padding: 0 16px; overflow-x: auto; scrollbar-width: thin;
          mask-image: linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%);
        }

        /* Brand “JARVIS” con micro glow */
        .brand{
          display: inline-flex; align-items: center; gap: 10px;
          padding: 8px 10px; text-decoration: none; position: relative;
        }
        .brand-dot{
          width: 10px; height: 10px; border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #22d3ee, #0ea5e9 60%, transparent 70%);
          box-shadow: 0 0 14px #22d3ee, 0 0 28px rgba(34,211,238,.45);
          animation: ping 2.6s ease-in-out infinite;
        }
        .brand-text{
          font-weight: 900; letter-spacing: .18rem; font-size: 0.95rem;
          background: linear-gradient(90deg, #22d3ee, #38bdf8, #a78bfa);
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow: 0 0 18px rgba(56,189,248,.25);
          animation: shimmerText 5s linear infinite;
        }

        /* Lista link */
        .track{
          display: flex; gap: 10px; list-style: none; margin: 0; padding: 0;
        }
        .item{ white-space: nowrap; }

        .link{
          --c1: #22d3ee; --c2: #38bdf8;
          position: relative; display: inline-grid; place-items: center;
          padding: 10px 14px; border-radius: 12px;
          text-decoration: none; color: var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border: 1px solid transparent;
          isolation: isolate;
        }

        /* Alone di bagliore */
        .glow{
          position: absolute; inset: -14px -22px; z-index: 0;
          background:
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c1), #ffffff 10%), transparent 60%),
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c2), #ffffff 10%), transparent 62%);
          filter: blur(18px);
          opacity: 0; transition: opacity .25s ease;
          pointer-events: none;
        }

        .label{
          position: relative; z-index: 1; font-weight: 800; letter-spacing: .02rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow: 0 0 12px rgba(255,255,255,.08);
          animation: shimmerText 8s linear infinite;
        }

        /* Hover */
        .link:hover{ transform: translateY(-1px); }
        .link:hover .glow{ opacity: .75; }
        .link:hover .label{ animation-duration: 3.2s; }

        /* Attivo */
        .link.is-active{
          background: rgba(255,255,255,.06);
          border-color: rgba(255,255,255,.14);
          box-shadow:
            0 10px 26px rgba(0,0,0,.35),
            0 0 0 1px rgba(255,255,255,.06) inset;
        }
        .link.is-active .glow{ opacity: .9; }
        .link.is-active .label{
          text-shadow:
            0 0 18px color-mix(in srgb, var(--c1), #fff 20%),
            0 0 28px color-mix(in srgb, var(--c2), #fff 15%);
          animation-duration: 2.6s;
        }

        /* Effetti */
        @keyframes shimmerText { to { background-position: -200% center; } }
        @keyframes ping {
          0%,100% { transform: scale(1);     filter: brightness(1);   opacity: .95; }
          50%     { transform: scale(1.18);  filter: brightness(1.25); opacity: 1;  }
        }

        /* Faded edges su overflow (già con mask-image sopra) */
        .scroll-fade { position: relative; }
        .scroll-fade::before,
        .scroll-fade::after{
          content:""; position:absolute; top:0; width:20px; height:100%;
          pointer-events:none;
        }
        .scroll-fade::before{
          left:0;
          background: linear-gradient(to right, rgba(2,6,23,1), rgba(2,6,23,0));
        }
        .scroll-fade::after{
          right:0;
          background: linear-gradient(to left, rgba(2,6,23,1), rgba(2,6,23,0));
        }

        @media (max-width: 520px){
          .brand-text{ display: none; }    /* su mobile solo il pallino glow */
          .inner{ gap: 10px; }
        }
      `}</style>
    </>
  );
}
