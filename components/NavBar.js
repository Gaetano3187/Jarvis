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

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
      </Head>

      <nav className="nav">
        <div className="inner">
          {/* BRAND */}
          <Link href="/home" className="brand" aria-label="Jarvis Home">
            <span className="brand-wrap">
              <span className="brand-aura" aria-hidden="true" />
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
                    title={label}
                  >
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
        }

        .nav{
          position: sticky; top: 0; z-index: 60;
          width: 100%; background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.2);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 12px 30px rgba(0,0,0,.30);
        }
        .inner{
          height: 64px; display: flex; align-items: center;
          justify-content: flex-start; padding: 0 16px;
          gap: 28px; overflow: hidden;
        }

        /* === LOGO JARVIS (rilievo + kaleidoscopio) === */
        .brand{ text-decoration:none; display:inline-flex; align-items:center; }
        .brand-wrap{
          position: relative; display:inline-grid; place-items:center;
          padding: 6px 2px; isolation:isolate;
        }
        .brand-aura{
          position:absolute; inset:-18px -26px; z-index:0;
          background: conic-gradient(from 0deg at 50% 50%,
              rgba(94,234,212,.75),
              rgba(34,211,238,.75),
              rgba(96,165,250,.70),
              rgba(167,139,250,.70),
              rgba(94,234,212,.75));
          filter: blur(28px) saturate(1.1) brightness(1.05);
          opacity:.9; border-radius: 24px;
          animation: auraSpin 10s linear infinite;
        }
        /* AURA più luminosa attorno al logo (sostituisce la tua .brand-glow) */
.brand-glow{
  position:absolute; inset:-18px -26px; z-index:0;
  background: conic-gradient(from 0deg at 50% 50%,
      rgba(94,234,212,.85),
      rgba(34,211,238,.85),
      rgba(96,165,250,.82),
      rgba(167,139,250,.82),
      rgba(94,234,212,.85));
  filter: blur(28px) saturate(1.15) brightness(1.08);
  opacity:.95; border-radius: 24px;
  mix-blend-mode: screen;
  animation: auraSpin 9s linear infinite;
}

/* TESTO JARVIS: scolpito + riempimento caleidoscopio (sostituisce la tua .brand-text) */
.brand-text{
  /* stop a override globali tipo color:#fff */
  all: unset;

  position:relative; z-index:1; display:inline-block;
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-weight: 900; letter-spacing: .35rem;
  font-size: clamp(1.9rem, 4vw, 2.3rem);
  line-height: 1; white-space: nowrap;

  /* riempimento lucido + caleidoscopio */
  --k1:#a7f3d0; --k2:#5eead4; --k3:#22d3ee; --k4:#60a5fa; --k5:#a78bfa; --k6:#f0abfc;
  background:
    linear-gradient(180deg, rgba(255,255,255,.38), rgba(255,255,255,0) 48%, rgba(255,255,255,.26) 96%),
    conic-gradient(from 0deg at 50% 50%, var(--k1), var(--k2), var(--k3), var(--k4), var(--k5), var(--k6), var(--k4), var(--k2), var(--k1));
  background-size: 180% 200%, 220% 220%;
  background-position: 50% 0%, 0% 0%;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  color: transparent !important;

  /* rilievo “scolpito” (bordo leggero + luce/ombra) */
  -webkit-text-stroke: 0.55px rgba(0,0,0,.18);
  text-shadow:
    -1px -1px 0 rgba(255,255,255,.75),
     1px  1px 0 rgba(0,0,0,.35),
    -2px -2px 1px rgba(255,255,255,.35),
     2px  2px 2px rgba(0,0,0,.28),
     0    2px 6px rgba(0,0,0,.26);

  filter: brightness(1.55) saturate(1.12) contrast(1.06);
  animation: kShift 7s linear infinite, glossDrift 4.6s ease-in-out infinite;
}

/* Animazioni necessarie */
@keyframes auraSpin   { to { transform: rotate(360deg); } }
@keyframes kShift     { to { background-position: 50% 0%, 200% 200%; } }
@keyframes glossDrift {
  0%,100% { background-position: 50% 0%, 40% 40%; }
  50%     { background-position: 50% 16%, 60% 60%; }
}

