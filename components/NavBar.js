// components/NavBar.js
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { supabase } from '../lib/supabaseClient'

const NAV_ITEMS = [
  {
    href: '/home', label: 'Home', colorKey: 'purple',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/></svg>,
  },
  {
    href: '/dashboard', label: 'Dashboard', colorKey: 'blue',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  },
  {
    href: '/liste-prodotti', label: 'Liste', colorKey: 'green',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.3" fill="currentColor"/><circle cx="4" cy="12" r="1.3" fill="currentColor"/><circle cx="4" cy="18" r="1.3" fill="currentColor"/></svg>,
  },
  {
    href: '/finanze', label: 'Finanze', colorKey: 'amber',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  },
  {
    href: '/spese-casa', label: 'Casa', colorKey: 'cyan',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3 12L12 3l9 9v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9z"/><path d="M9 21v-8h6v8" strokeLinecap="round"/></svg>,
  },
  {
    href: '/vestiti-ed-altro', label: 'Vestiti', colorKey: 'pink',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 7l-4-4s-1 2-4 2-4-2-4-2L4 7l3 3v11h10V10l3-3z"/></svg>,
  },
  {
    href: '/cene-aperitivi', label: 'Cene', colorKey: 'orange',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>,
  },
  {
    href: '/varie', label: 'Varie', colorKey: 'gray',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  },
  {
    href: '/prodotti-tipici-vini', label: 'Vini', colorKey: 'violet',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M8 2h8l2 7a6 6 0 01-12 0l2-7z"/><line x1="12" y1="15" x2="12" y2="21" strokeLinecap="round"/><line x1="9" y1="21" x2="15" y2="21" strokeLinecap="round"/></svg>,
  },
]

const COLORS = {
  purple: { bg:'linear-gradient(160deg,#1a0d2e,#110820)', bgAct:'linear-gradient(160deg,#280d45,#1a0830)', color:'#c084fc', border:'#5b2d8a', glow:'rgba(160,80,255,0.22)', top:'rgba(192,132,252,0.5)' },
  blue:   { bg:'linear-gradient(160deg,#0d1a2e,#081120)', bgAct:'linear-gradient(160deg,#0d2045,#081530)', color:'#60a5fa', border:'#1a4080', glow:'rgba(56,130,250,0.2)',   top:'rgba(96,165,250,0.5)' },
  green:  { bg:'linear-gradient(160deg,#0d2214,#08180d)', bgAct:'linear-gradient(160deg,#0d2d1c,#071f10)', color:'#34d399', border:'#136638', glow:'rgba(0,200,120,0.2)',    top:'rgba(52,211,153,0.5)' },
  amber:  { bg:'linear-gradient(160deg,#1a1a0d,#111108)', bgAct:'linear-gradient(160deg,#28250d,#1a1808)', color:'#fbbf24', border:'#7a5c08', glow:'rgba(250,180,0,0.2)',    top:'rgba(251,191,36,0.5)' },
  cyan:   { bg:'linear-gradient(160deg,#0d1e2a,#081420)', bgAct:'linear-gradient(160deg,#0d2535,#081a28)', color:'#38bdf8', border:'#0e5070', glow:'rgba(30,180,240,0.2)',   top:'rgba(56,189,248,0.5)' },
  pink:   { bg:'linear-gradient(160deg,#2a0d1e,#200814)', bgAct:'linear-gradient(160deg,#380d28,#280810)', color:'#f472b6', border:'#802060', glow:'rgba(240,60,160,0.2)',   top:'rgba(244,114,182,0.5)' },
  orange: { bg:'linear-gradient(160deg,#2a1a0d,#201108)', bgAct:'linear-gradient(160deg,#38200d,#281508)', color:'#fb923c', border:'#804018', glow:'rgba(250,130,40,0.2)',   top:'rgba(251,146,60,0.5)' },
  gray:   { bg:'linear-gradient(160deg,#1a1a1a,#111111)', bgAct:'linear-gradient(160deg,#252525,#181818)', color:'#94a3b8', border:'#445060', glow:'rgba(120,150,180,0.15)', top:'rgba(148,163,184,0.4)' },
  violet: { bg:'linear-gradient(160deg,#1a0d2e,#110820)', bgAct:'linear-gradient(160deg,#220d38,#150820)', color:'#a78bfa', border:'#5040a0', glow:'rgba(140,100,250,0.2)',  top:'rgba(167,139,250,0.5)' },
}

export default function NavBar() {
  const { pathname, push } = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    push('/login')
  }

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600&display=swap" rel="stylesheet" />
      </Head>

      <nav role="navigation" aria-label="Navigazione principale" className="nav">
        <div className="inner">
          <div className="track">
            {NAV_ITEMS.map(({ href, label, icon, colorKey }) => {
              const active = pathname === href
              const c = COLORS[colorKey]
              return (
                <Link key={href} href={href} title={label} className="btn-link"
                  style={{
                    background:        active ? c.bgAct : c.bg,
                    color:             c.color,
                    borderTopColor:    active ? c.top   : 'rgba(255,255,255,0.12)',
                    borderBottomColor: active ? c.border : 'rgba(0,0,0,0.55)',
                    boxShadow: active
                      ? `0 4px 14px rgba(0,0,0,0.55), 0 0 20px ${c.glow}, inset 0 1px 0 ${c.top}`
                      : '0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.09)',
                  }}
                >
                  <span className="btn-icon">{icon}</span>
                  <span className="btn-label">{label}</span>
                </Link>
              )
            })}
          </div>

          <button title="Esci" className="logout-btn" onClick={handleLogout}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span className="btn-label">Esci</span>
          </button>
        </div>
      </nav>

      <style jsx>{`
        .nav {
          position: sticky; top: 0; z-index: 60; width: 100%;
          background: rgba(6,7,12,0.92);
          backdrop-filter: blur(20px) saturate(1.4);
          -webkit-backdrop-filter: blur(20px) saturate(1.4);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .inner {
          display: flex; align-items: center;
          padding: 8px 10px; gap: 8px;
          max-width: 1200px; margin: 0 auto;
          overflow-x: auto; scrollbar-width: none;
        }
        .inner::-webkit-scrollbar { display: none; }

        .track {
          display: flex; align-items: center;
          gap: 7px; flex: 1;
        }

        .btn-link {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 5px;
          padding: 11px 13px;
          border-radius: 14px;
          min-width: 62px; min-height: 62px;
          text-decoration: none; flex-shrink: 0;
          border-top:    1px solid rgba(255,255,255,0.12);
          border-left:   1px solid rgba(255,255,255,0.06);
          border-right:  1px solid rgba(0,0,0,0.4);
          border-bottom: 3px solid rgba(0,0,0,0.55);
          transition: transform .1s, box-shadow .1s, border-bottom-width .1s;
        }
        .btn-link:active {
          transform: translateY(2px);
          border-bottom-width: 1px;
        }

        .btn-icon {
          display: flex; align-items: center; justify-content: center;
          color: inherit;
        }

        .btn-label {
          color: inherit;
          font-family: 'Rajdhani', sans-serif;
          font-size: 11px; font-weight: 600; letter-spacing: .1em;
          text-transform: uppercase; white-space: nowrap; line-height: 1;
        }

        .logout-btn {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 5px;
          padding: 11px 13px; border-radius: 14px;
          min-width: 58px; min-height: 62px; flex-shrink: 0;
          cursor: pointer;
          background: linear-gradient(160deg,#2a0d0d,#1a0808);
          color: rgba(248,113,113,0.75);
          border-top:    1px solid rgba(239,68,68,0.2);
          border-left:   1px solid rgba(239,68,68,0.1);
          border-right:  1px solid rgba(0,0,0,0.4);
          border-bottom: 3px solid rgba(180,30,30,0.5);
          box-shadow: 0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(239,68,68,0.12);
          transition: transform .1s, color .15s, box-shadow .1s;
        }
        .logout-btn:hover  { color: #f87171; }
        .logout-btn:active { transform: translateY(2px); border-bottom-width: 1px; }

        @media (max-width: 640px) {
          .inner { padding: 7px 6px; gap: 5px; }
          .track { gap: 5px; }
          .btn-link, .logout-btn {
            min-width: 54px; min-height: 58px;
            padding: 10px 9px;
          }
          .btn-label { font-size: 10px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .btn-link, .logout-btn { transition: none; }
        }
      `}</style>
    </>
  )
}