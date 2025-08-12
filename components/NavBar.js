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
              <span className="brand-text">JARVIS</span>
            </span>

            {/* animazione alternata: equalizzatore ⇄ AI idea */}
            <span className="brand-anim" aria-hidden="true">
              {/* equalizzatore */}
              <span className="eqbox">
                <span className="bar b1" />
                <span className="bar b2" />
                <span className="bar b3" />
                <span className="bar b4" />
                <span className="bar b5" />
                <span className="bar b6" />
              </span>

              {/* “AI idea” stilizzata (rete neurale che pulsa) */}
              <span className="aiidea">
                <svg className="ai-svg" viewBox="0 0 160 36" aria-hidden="true">
                  <defs>
                    <radialGradient id="gCyan" cx="50%" cy="50%" r="70%">
                      <stop offset="0%" stopColor="#67e8f9" />
                      <stop offset="55%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                    </radialGradient>
                    <linearGradient id="gStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#67e8f9"/><stop offset="50%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#22d3ee"/>
                    </linearGradient>
                  </defs>

                  {/* alone soft dietro */}
                  <circle cx="28" cy="18" r="13" fill="url(#gCyan)" opacity="0.55">
                    <animate attributeName="r" values="12;14;12" dur="2.2s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values=".45;.8;.45" dur="2.2s" repeatCount="indefinite"/>
                  </circle>

                  {/* “cervello” stilizzato */}
                  <path d="M16,18 a12,12 0 1,1 24,0 q0,7 -7,10 v3 h-10 v-3 q-7,-3 -7,-10 z"
                        fill="none" stroke="url(#gStroke)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />

                  {/* connessioni */}
                  <g stroke="url(#gStroke)" strokeWidth="1.4" opacity=".9">
                    <path d="M28,10 q6,3 6,8" fill="none"/>
                    <path d="M22,14 q6,2 6,6" fill="none"/>
                    <path d="M34,16 q-4,4 -8,4" fill="none"/>
                  </g>

                  {/* nodi che pulsano */}
                  <g fill="#a7f3d0">
                    <circle className="n n1" cx="34" cy="16" r="1.6"/>
                    <circle className="n n2" cx="22" cy="14" r="1.6"/>
                    <circle className="n n3" cx="28" cy="10" r="1.6"/>
                  </g>

                  {/* scie di “intuizione” */}
                  <g stroke="url(#gStroke)" strokeWidth="1.4" strokeLinecap="round" opacity=".95">
                    <path className="spark s1" d="M52,10 h16" />
                    <path className="spark s2" d="M52,18 h22" />
                    <path className="spark s3" d="M52,26 h14" />
                  </g>
                </svg>
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
          --nav-bg: rgba(2,6,23,.76);
          --nav-brd: rgba(255,255,255,.14);
          --text: #f8fafc;
        }

        .nav{
          position: sticky; top: 0; z-index: 70;
          width: 100%; background: var(--nav-bg);
          backdrop-filter: blur(12px) saturate(1.25);
          border-bottom: 1px solid var(--nav-brd);
          box-shadow: 0 16px 40px rgba(0,0,0,.32);
        }
        .inner{
          height: 68px;
          display: flex; align-items: center; justify-content: flex-start;
          padding: 0 16px; gap: 34px; overflow: hidden;
        }

        /* BRAND */
        .brand{
          display:inline-flex; align-items:center; gap:24px;
          padding:8px 8px 8px 0; text-decoration:none; margin-right:30px;
        }
        .brand-skin{
          position: relative; display: inline-grid; place-items: center;
          animation: toneSync 14s linear infinite;
        }
        .brand-glow{
          position:absolute; inset:-18px -24px; pointer-events:none;
          background:
            radial-gradient(60% 60% at 30% 50%, rgba(94,234,212,.75), transparent 60%),
            radial-gradient(70% 70% at 80% 50%, rgba(96,165,250,.72), transparent 62%);
          filter: blur(26px);
          animation: brandPulse 2.1s ease-in-out infinite;
        }
        .brand-text{
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          font-weight: 900; letter-spacing: .32rem;
          font-size: clamp(1.8rem, 3.8vw, 2.2rem); line-height: 1;
          background: conic-gradient(from 0deg,
            #67e8f9 0%, #22d3ee 15%, #60a5fa 32%, #a78bfa 49%, #f0abfc 66%, #60a5fa 83%, #67e8f9 100%);
          background-size: 220% 220%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          -webkit-text-stroke: 0.5px rgba(0,0,0,.55);   /* bordo leggero */
          paint-order: stroke fill;
          text-shadow:
            0 0 2px rgba(255,255,255,.35),
            0 0 24px rgba(103,232,249,.85),
            0 0 52px rgba(167,139,250,.7);
          animation: kaleido 5.8s linear infinite, glowBreath 2.2s ease-in-out infinite;
          filter: brightness(1.75) contrast(1.06);
          white-space: nowrap;
        }

        /* blocco animazioni a destra del brand */
        .brand-anim{ width: 150px; height: 26px; display:grid; place-items:center; position: relative; }

        /* equalizzatore (visibile 0%-48%) */
        .eqbox{
          position:absolute; inset:0; display:grid; grid-auto-flow:column;
          align-items:end; justify-content:center; gap:7px;
          animation: swapVoice 6s ease-in-out infinite;
        }
        .bar{
          width: 10px; height: 10px; border-radius: 3px; transform-origin: bottom center;
          background: linear-gradient(to top, #ef4444 0%, #f59e0b 45%, #22c55e 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.45),
            0 0 12px rgba(34,197,94,.85),
            0 0 22px rgba(245,158,11,.65),
            0 0 34px rgba(239,68,68,.55);
          animation: barHop 1s ease-in-out infinite;
          filter: brightness(1.2);
        }
        .b1{ animation-duration: .92s; }
        .b2{ animation-duration: 1.08s; animation-delay: .05s; }
        .b3{ animation-duration: .96s;  animation-delay: .10s; }
        .b4{ animation-duration: 1.14s; animation-delay: .15s; }
        .b5{ animation-duration: 1.26s; animation-delay: .20s; }
        .b6{ animation-duration: .88s;  animation-delay: .25s; }

        /* AI idea (visibile 52%-100%) */
        .aiidea{
          position:absolute; inset:-2px 0 0 0; display:grid; place-items:center;
          opacity:0; animation: swapAI 6s ease-in-out infinite;
          filter: drop-shadow(0 0 18px rgba(103,232,249,.75)) drop-shadow(0 0 36px rgba(167,139,250,.55));
        }
        .ai-svg{ width:100%; height:100%; }
        .n{ transform-origin: center; }
        .n.n1{ animation: pulseNode 1.2s ease-in-out infinite .1s; }
        .n.n2{ animation: pulseNode 1.2s ease-in-out infinite .25s; }
        .n.n3{ animation: pulseNode 1.2s ease-in-out infinite .4s; }
        .spark{ stroke-dasharray: 90; stroke-dashoffset: 90; }
        .s1{ animation: draw 2.6s ease-in-out infinite .0s; }
        .s2{ animation: draw 2.6s ease-in-out infinite .2s; }
        .s3{ animation: draw 2.6s ease-in-out infinite .4s; }

        /* menu */
        .track{ display:flex; gap:18px; list-style:none; margin:0; padding:0; }
        .item{ white-space:nowrap; }
        .link{
          --c1:#5eead4; --c2:#22d3ee;
          position:relative; display:inline-grid; place-items:center;
          padding: 12px 22px; border-radius: 16px;
          text-decoration:none; color:var(--text);
          transition: transform .18s ease, filter .2s ease, background .2s ease, box-shadow .2s ease;
          border:1px solid transparent; isolation:isolate;
        }
        .glow{
          position:absolute; inset:-22px -30px; z-index:0;
          background:
            radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,.32), transparent 60%),
            radial-gradient(60% 60% at 50% 50%, color-mix(in srgb, var(--c1), #ffffff 35%), transparent 62%),
            radial-gradient(60% 60% at 50% 50%, color-mix(in srgb, var(--c2), #ffffff 28%), transparent 64%);
          filter: blur(28px); opacity:.85; pointer-events:none;
        }
        .label{
          position:relative; z-index:1; font-weight:900; letter-spacing:.05rem;
          background: linear-gradient(90deg, var(--c1), var(--c2));
          background-size:200% auto; -webkit-background-clip:text; background-clip:text; color:transparent;
          text-shadow:
            0 0 22px rgba(255,255,255,.28),
            0 0 42px color-mix(in srgb, var(--c2), #fff 30%),
            0 0 68px color-mix(in srgb, var(--c1), #fff 24%);
          animation: shimmerText 6s linear infinite; filter: brightness(1.6);
        }
        .link:hover{ transform: translateY(-1px); filter: brightness(1.12); }
        .link.is-active{
          background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.30);
          box-shadow: 0 18px 40px rgba(0,0,0,.34), 0 0 0 1px rgba(255,255,255,.10) inset;
          filter: brightness(1.22);
        }

        /* ANIMAZIONI */
        @keyframes shimmerText { to { background-position: -200% center; } }
        @keyframes kaleido { to { background-position: 200% 200%; } }
        @keyframes toneSync { to { filter: hue-rotate(360deg); } }
        @keyframes glowBreath {
          0%,100% { text-shadow: 0 0 2px rgba(255,255,255,.35), 0 0 24px rgba(103,232,249,.85), 0 0 52px rgba(167,139,250,.70); }
          50%     { text-shadow: 0 0 6px rgba(255,255,255,.55), 0 0 36px rgba(103,232,249,1), 0 0 70px rgba(167,139,250,.9); }
        }
        @keyframes brandPulse { 0%,100% { opacity:.60; transform: scale(1); } 50% { opacity:1; transform: scale(1.06); } }
        @keyframes barHop { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
        @keyframes pulseNode { 0%,100% { r: 1.4; opacity:.8; } 50% { r: 2.2; opacity:1; } }
        @keyframes draw { 0% { stroke-dashoffset: 90; opacity:.0; } 30% { opacity:1; } 60% { stroke-dashoffset: 0; } 100% { opacity:.0; } }

        /* alternanza: 0-48% voce, 52-100% AI idea */
        @keyframes swapVoice { 0%,48% { opacity:1 } 52%,100%{ opacity:0 } }
        @keyframes swapAI    { 0%,48% { opacity:0 } 52%,100%{ opacity:1 } }

        @media (max-width: 560px){
          .inner{ gap:24px; padding:0 12px; }
          .brand-text{ font-size:1.9rem; letter-spacing:.30rem; }
          .brand-anim{ width:132px; height:24px; }
          .track{ gap:12px; }
          .link{ padding:10px 18px; }
        }
      `}</style>
    </>
  );
}
