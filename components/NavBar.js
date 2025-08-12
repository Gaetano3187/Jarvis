// components/NavBar.js
import Link from 'next/link';
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
          --nav-bg: rgba(2,6,23,.76);   /* un po' meno trasparente */
          --nav-brd: rgba(255,255,255,.10);
          --text: #f8fafc;
        }

        .nav{
          position: sticky; top: 0; z-index: 50;
          width: 100%;
          background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.12);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 8px 24px rgba(0,0,0,.25);
        }

        .inner{
          height: 72px;
          display: flex; align-items: center; gap: 18px;
          padding: 0 18px;
          overflow-x: auto;
          scrollbar-width: none;         /* Firefox */
          -ms-overflow-style: none;      /* IE/Edge */
          mask-image: linear-gradient(to right, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%);
        }
        .inner::-webkit-scrollbar{ display: none; }  /* Chrome/Safari */

        /* Brand */
        .brand{
          display: inline-flex; align-items: center; gap: 12px;
          padding: 8px 10px; text-decoration: none; position: relative;
          flex: 0 0 auto;
        }
        .brand-dot{
          width: 12px; height: 12px; border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #22d3ee, #0ea5e9 60%, transparent 70%);
          box-shadow: 0 0 16px #22d3ee, 0 0 32px rgba(34,211,238,.6);
          animation: ping 2.2s ease-in-out infinite;
        }
        .brand-text{
          font-weight: 900; letter-spacing: .24rem; font-size: 1.08rem;
          background: linear-gradient(
            90deg,
            color-mix(in oklab, #22d3ee, #fff 22%),
            color-mix(in oklab, #38bdf8, #fff 22%),
            color-mix(in oklab, #a78bfa, #fff 22%)
          );
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow:
            0 0 18px rgba(255,255,255,.45),
            0 0 34px rgba(56,189,248,.4);
          animation: shimmerText 5s linear infinite;
          filter: brightness(1.2);
        }

        /* Lista link */
        .track{
          display: flex; gap: 18px; list-style: none; margin: 0; padding: 0;
          align-items: center;
        }
        .item{ white-space: nowrap; }

        .link{
          --c1: #22d3ee; --c2: #38bdf8;
          position: relative; display: inline-grid; place-items: center;
          padding: 12px 18px; border-radius: 14px;
          text-decoration: none; color: var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border: 1px solid transparent;
          isolation: isolate;
        }
        .glow{
          position: absolute; inset: -16px -24px; z-index: 0;
          background:
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c1), #ffffff 16%), transparent 60%),
            radial-gradient(60% 60% at 50% 50%, color-mix(in oklab, var(--c2), #ffffff 16%), transparent 62%);
          filter: blur(18px);
          opacity: 0; transition: opacity .25s ease;
          pointer-events: none;
        }
        .label{
          position: relative; z-index: 1; font-weight: 900;
          letter-spacing: .045rem; font-size: 1.06rem;
          background: linear-gradient(
            90deg,
            color-mix(in oklab, var(--c1), #fff 26%),
            color-mix(in oklab, var(--c2), #fff 26%)
          );
          background-size: 220% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow:
            0 0 16px rgba(255,255,255,.5),
            0 0 34px color-mix(in srgb, var(--c2), #fff 32%);
          animation: shimmerText 7s linear infinite;
          filter: brightness(1.12);
        }

        .link:hover{ transform: translateY(-1px); }
        .link:hover .glow{ opacity: .85; }
        .link:hover .label{ animation-duration: 3s; filter: brightness(1.22); }

        /* Pagina attiva: molto luminosa */
        .link.is-active{
          background: linear-gradient(180deg, rgba(255,255,255,.24), rgba(255,255,255,.10));
          border-color: rgba(255,255,255,.26);
          box-shadow:
            0 12px 30px rgba(0,0,0,.40),
            0 0 22px color-mix(in srgb, var(--c1), #fff 50%),
            0 0 40px color-mix(in srgb, var(--c2), #fff 40%),
            inset 0 1px 0 rgba(255,255,255,.20);
          transform: translateY(-2px);
        }
        .link.is-active .glow{
          opacity: 1; filter: blur(22px) brightness(1.25);
          animation: breathe 2s ease-in-out infinite;
        }
        .link.is-active .label{
          text-shadow:
            0 0 22px color-mix(in srgb, var(--c1), #fff 45%),
            0 0 48px color-mix(in srgb, var(--c2), #fff 38%);
          animation-duration: 2.2s;
          filter: brightness(1.32) saturate(1.18);
        }

        @keyframes shimmerText { to { background-position: -220% center; } }
        @keyframes ping {
          0%,100% { transform: scale(1);     filter: brightness(1.05); opacity: .95; }
          50%     { transform: scale(1.2);   filter: brightness(1.3);  opacity: 1; }
        }
        @keyframes breathe {
          0%,100% { opacity: .9; transform: scale(1); }
          50%     { opacity: 1;  transform: scale(1.02); }
        }

        /* Mobile: logo sempre visibile e barra centrata su due righe */
        @media (max-width: 520px){
          .inner{
            height: auto; min-height: 92px;
            justify-content: center; flex-wrap: wrap;
            padding: 8px 12px;
            mask-image: none; -webkit-mask-image: none;  /* evita taglio alle estremità */
          }
          .scroll-fade::before,
          .scroll-fade::after{ display: none; }
          .brand{
            width: 100%; justify-content: center; order: -1;   /* brand in alto centrato */
          }
          .brand-text{ display: inline; font-size: 1.12rem; }
          .track{
            width: 100%; justify-content: center; gap: 12px; flex-wrap: wrap;
          }
          .link{ padding: 10px 14px; border-radius: 12px; }
          .label{ font-size: 1rem; }
        }
      `}</style>
    </>
  );
}
