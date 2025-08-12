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
          --nav-bg: rgba(2,6,23,.8);
          --nav-brd: rgba(255,255,255,.12);
          --text: #f8fafc;
        }

        .nav{
          position: sticky; top: 0; z-index: 50; width: 100%;
          background: var(--nav-bg);
          backdrop-filter: blur(14px) saturate(1.15);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 10px 28px rgba(0,0,0,.28);
        }

        .inner{
          height: 76px;
          display: flex; align-items: center; gap: 20px;
          padding: 0 20px;
          overflow-x: auto;
          scrollbar-width: none; -ms-overflow-style: none;
          mask-image: linear-gradient(to right, transparent 0, #000 30px, #000 calc(100% - 30px), transparent 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0, #000 30px, #000 calc(100% - 30px), transparent 100%);
        }
        .inner::-webkit-scrollbar{ display: none; }

        /* Brand più luminoso */
        .brand{
          display: inline-flex; align-items: center; gap: 12px;
          padding: 8px 10px; text-decoration: none; position: relative; flex: 0 0 auto;
        }
        .brand-dot{
          width: 12px; height: 12px; border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #22d3ee, #0ea5e9 60%, transparent 70%);
          box-shadow: 0 0 18px #22d3ee, 0 0 36px rgba(34,211,238,.75);
          animation: ping 2s ease-in-out infinite;
          filter: saturate(1.3) brightness(1.2);
        }
        .brand-text{
          font-weight: 900; letter-spacing: .26rem; font-size: 1.14rem;
          background: linear-gradient(
            90deg,
            color-mix(in oklab, #22d3ee, #fff 28%),
            color-mix(in oklab, #38bdf8, #fff 28%),
            color-mix(in oklab, #a78bfa, #fff 28%)
          );
          background-size: 220% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow:
            0 0 22px rgba(255,255,255,.55),
            0 0 42px rgba(56,189,248,.5);
          animation: shimmerText 4.5s linear infinite;
          filter: brightness(1.28);
        }

        .track{
          display: flex; gap: 20px; list-style: none; margin: 0; padding: 0; align-items: center;
        }
        .item{ white-space: nowrap; }

        .link{
          --c1: #22d3ee; --c2: #38bdf8;
          position: relative; display: inline-grid; place-items: center;
          padding: 12px 18px; border-radius: 16px;
          text-decoration: none; color: var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border: 1px solid rgba(255,255,255,.08);
          isolation: isolate;
        }

        /* Aura rotante + glow più forte */
        .link::before{
          content: ""; position: absolute; inset: -2px; border-radius: inherit; z-index: 0;
          background:
            conic-gradient(from 0deg,
              color-mix(in oklab, var(--c1), #fff 35%),
              color-mix(in oklab, var(--c2), #fff 35%),
              color-mix(in oklab, var(--c1), #fff 35%)
            );
          filter: blur(18px) saturate(1.3) brightness(1.15);
          opacity: .0;
          transition: opacity .25s ease, filter .25s ease;
          mix-blend-mode: screen;
          animation: rotateAura 6s linear infinite;
        }

        .glow{
          position: absolute; inset: -18px -26px; z-index: 0;
          background:
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c1), #ffffff 22%), transparent 58%),
            radial-gradient(70% 70% at 50% 50%, color-mix(in oklab, var(--c2), #ffffff 22%), transparent 60%),
            radial-gradient(40% 40% at 10% 20%, rgba(255,255,255,.28), transparent 60%);
          filter: blur(22px) brightness(1.2);
          opacity: .0; transition: opacity .25s ease, filter .25s ease;
          mix-blend-mode: screen; pointer-events: none;
        }

        .label{
          position: relative; z-index: 1; font-weight: 900;
          letter-spacing: .055rem; font-size: 1.1rem;
          background: linear-gradient(
            90deg,
            color-mix(in oklab, var(--c1), #fff 34%),
            color-mix(in oklab, var(--c2), #fff 34%)
          );
          background-size: 240% auto;
          -webkit-background-clip: text; background-clip: text;
          color: transparent;
          text-shadow:
            0 0 20px rgba(255,255,255,.6),
            0 0 46px color-mix(in srgb, var(--c2), #fff 44%);
          animation: shimmerText 6.5s linear infinite;
          filter: brightness(1.22) saturate(1.12);
        }

        .link:hover{
          transform: translateY(-2px) scale(1.01);
          box-shadow:
            0 12px 30px rgba(0,0,0,.40),
            0 0 22px color-mix(in srgb, var(--c1), #fff 40%),
            0 0 36px color-mix(in srgb, var(--c2), #fff 36%);
        }
        .link:hover::before{ opacity: .9; filter: blur(22px) brightness(1.35); }
        .link:hover .glow{ opacity: .95; filter: blur(24px) brightness(1.35); }
        .link:hover .label{ animation-duration: 2.6s; filter: brightness(1.34) saturate(1.18); }

        /* Attivo: super luminoso + respiro */
        .link.is-active{
          background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.12));
          border-color: rgba(255,255,255,.28);
          box-shadow:
            0 16px 38px rgba(0,0,0,.44),
            0 0 28px color-mix(in srgb, var(--c1), #fff 55%),
            0 0 52px color-mix(in srgb, var(--c2), #fff 50%),
            inset 0 1px 0 rgba(255,255,255,.24);
          transform: translateY(-2px);
        }
        .link.is-active::before{
          opacity: 1; filter: blur(26px) brightness(1.5);
          animation-duration: 4.5s;
        }
        .link.is-active .glow{
          opacity: 1; filter: blur(26px) brightness(1.5);
          animation: breathe 1.8s ease-in-out infinite;
        }
        .link.is-active .label{
          text-shadow:
            0 0 26px color-mix(in srgb, var(--c1), #fff 55%),
            0 0 56px color-mix(in srgb, var(--c2), #fff 48%);
          animation-duration: 2s;
          filter: brightness(1.42) saturate(1.24);
        }

        /* Animazioni */
        @keyframes shimmerText { to { background-position: -240% center; } }
        @keyframes ping { 0%,100% { transform: scale(1);   filter: brightness(1.1); }
                          50%     { transform: scale(1.22); filter: brightness(1.35);} }
        @keyframes breathe { 0%,100% { opacity: .9; transform: scale(1); }
                             50%     { opacity: 1;  transform: scale(1.03); } }
        @keyframes rotateAura { to { transform: rotate(360deg); } }

        /* Mobile: brand centrato e link su due righe */
        @media (max-width: 520px){
          .inner{
            height: auto; min-height: 100px;
            justify-content: center; flex-wrap: wrap;
            padding: 10px 12px;
            mask-image: none; -webkit-mask-image: none;
          }
          .scroll-fade::before,
          .scroll-fade::after{ display: none; }
          .brand{
            width: 100%; justify-content: center; order: -1;
          }
          .brand-text{ display: inline; font-size: 1.2rem; }
          .track{
            width: 100%; justify-content: center; gap: 12px; flex-wrap: wrap;
          }
          .link{ padding: 10px 16px; border-radius: 14px; }
          .label{ font-size: 1.02rem; }
        }

        /* Rispetto utenti con ridotta animazione */
        @media (prefers-reduced-motion: reduce){
          .brand-dot, .brand-text, .glow, .link::before, .label { animation: none !important; }
        }
      `}</style>
    </>
  );
}
