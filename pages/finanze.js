// pages/finanze.js
import React, { useCallback, useRef, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import VoiceRecorder from '../components/VoiceRecorder';
import {
  FaMoneyBillWave, FaHome, FaTshirt, FaUtensils,
  FaFolderOpen, FaChartPie, FaPlus, FaCamera, FaMicrophone
} from 'react-icons/fa';

const categories = [
  { href: '/entrate',          base: '#16a34a', hover: '#22d3ee', icon: <FaMoneyBillWave/>, title: 'Entrate & Saldi',  subtitle: 'Stipendi, carryover, tasca' },
  { href: '/spese-casa',       base: '#2563eb', hover: '#8b5cf6', icon: <FaHome/>,          title: 'Spese Casa',       subtitle: 'Bollette, manutenzioni ecc.' },
  { href: '/vestiti-ed-altro', base: '#9333ea', hover: '#f472b6', icon: <FaTshirt/>,        title: 'Vestiti ed Altro', subtitle: 'Vestiti e accessori' },
  { href: '/cene-aperitivi',   base: '#f97316', hover: '#f43f5e', icon: <FaUtensils/>,      title: 'Cene / Aperitivi', subtitle: 'Serate, pranzi, regali' },
  { href: '/varie',            base: '#6b7280', hover: '#94a3b8', icon: <FaFolderOpen/>,    title: 'Varie',            subtitle: 'Spese non catalogate' },
  { href: '/spese',            base: '#0ea5e9', hover: '#22c55e', icon: <FaChartPie/>,      title: 'Report Spese',     subtitle: 'Tutte le spese per categoria' },
];

const Finanze = () => {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  // Evita apertura media player su mobile e forza riproduzione inline
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.controls = false;
  }, []);

  const handleAddManual = useCallback(() => {
    const voce = prompt('Descrizione e importo (es: Enel 45,60)');
    if (voce) console.log('[ADD]', voce);
  }, []);

  const handleOCR = useCallback(() => fileInputRef.current?.click(), []);
  const handleVoice = useCallback((text) => { if (text) console.log('[VOICE]', text); }, []);
  const onFileChange = (e) => { const f = e.target.files?.[0]; if (f) console.log('[OCR] file:', f.name); e.target.value=''; };

  return (
    <>
      <Head>
        <title>Finanze • Jarvis-Assistant</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* video full-bleed */}
      <video
        ref={videoRef}
        className="bg-video"
        src="/pagina%20finanze.mp4"
        autoPlay
        muted
        loop
        playsInline
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture
        preload="auto"
        poster="https://play.teleporthq.io/static/svg/videoposter.svg"
      />

      <main className="wrap">
        <section className="grid">
          {/* Cards categorie */}
          <div className="cards">
            {categories.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="cat-card glow-strong"
                style={{ ['--base']: c.base, ['--hover']: c.hover }}
              >
                <div className="cat-top">
                  <div className="icon">{c.icon}</div>
                </div>
                <div className="cat-bottom">
                  <h3 className="title">{c.title}</h3>
                  <p className="sub">{c.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Barra strumenti avanzati (compatta, in basso) */}
          <div className="tools-sticky">
            <div className="tools-card">
              <div className="icon-bar">
                <button className="icon-btn glow-strong" onClick={handleAddManual} aria-label="Aggiungi operazione">
                  <FaPlus />
                </button>
                <button className="icon-btn glow-strong" onClick={handleOCR} aria-label="OCR scontrino">
                  <FaCamera />
                </button>
                <VoiceRecorder
                  buttonClass="icon-btn glow-strong"
                  idleLabel={<FaMicrophone aria-hidden="true" />}
                  recordingLabel={<FaMicrophone aria-hidden="true" />}
                  ariaLabelIdle="Comando vocale"
                  ariaLabelRecording="Stop registrazione"
                  onText={handleVoice}
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* input nascosto OCR */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />

      <style jsx>{`
        :root{
          --glass-bg: rgba(0,0,0,0.30);   /* trasparenza ridotta */
          --glass-brd: rgba(255,255,255,0.14);
          --text: #fff;
        }

        .bg-video{
          position: fixed; inset: 0;
          width: 100vw; height: 100vh; object-fit: cover;
          z-index: -1; pointer-events: none;
          filter: saturate(1.05) contrast(1.05);
        }
        .wrap{ min-height:100vh; display:grid; grid-template-rows: 1fr auto; padding:24px; color:var(--text); }
        .grid{ width:100%; max-width:1100px; margin:0 auto; display:grid; grid-template-rows:auto 1fr; gap:16px; }
        .cards{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }

        .cat-card{
          --base:#2563eb; --hover:#8b5cf6;
          position:relative; display:grid; grid-template-rows:1fr auto;
          min-height:clamp(150px, 26vw, 240px);
          border-radius:20px; color:#fff; text-decoration:none;
          border:1px solid rgba(255,255,255,0.18);
          box-shadow:0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
          overflow:hidden; isolation:isolate;
          transition: transform .25s ease, box-shadow .25s ease, filter .25s ease, background .25s ease;
          animation: shimmer 6s linear infinite;
          background:
            radial-gradient(120% 140% at 20% 10%, color-mix(in oklab, var(--base), #ffffff 10%), transparent 55%),
            radial-gradient(130% 150% at 90% 80%, color-mix(in oklab, var(--base), #00d4ff 20%), transparent 65%),
            linear-gradient(135deg, #0b1224 0%, #0b1224 100%);
        }
        .cat-card:hover{
          transform: translateY(-2px) scale(1.01);
          background:
            radial-gradient(120% 140% at 20% 10%, color-mix(in oklab, var(--hover), #ffffff 12%), transparent 55%),
            radial-gradient(130% 150% at 90% 80%, color-mix(in oklab, var(--hover), #22d3ee 26%), transparent 65%),
            linear-gradient(135deg, #0b1224 0%, #0b1224 100%);
        }

        .cat-top{ display:flex; align-items:flex-start; justify-content:flex-end; padding:16px; }
        .icon :global(svg){ font-size:clamp(28px,5vw,42px); filter:drop-shadow(0 6px 18px rgba(0,0,0,.35)); }
        .cat-bottom{ padding:16px; background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.25) 100%); }
        .title{ margin:0 0 4px; font-size:clamp(1.1rem,3vw,1.6rem); font-weight:800; letter-spacing:.2px; text-shadow:0 2px 18px rgba(0,0,0,.35); }
        .sub{ margin:0; opacity:.9; font-size:clamp(.9rem,2.2vw,1rem); }

        /* Barra strumenti compatta in basso */
        .tools-sticky{
          margin-top: 8px;
          align-self: end;
          position: sticky;
          bottom: 12px;
        }
        .tools-card{
          background: var(--glass-bg);
          border: 1px solid var(--glass-brd);
          border-radius: 14px;
          padding: 10px 12px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 22px rgba(0,0,0,0.35);
        }
        .icon-bar{ display:flex; gap:10px; align-items:center; }
        .icon-btn{
          --btn-size:52px;
          width:var(--btn-size); height:var(--btn-size);
          display:grid; place-items:center;
          border-radius:12px;
          border:1px solid rgba(255,255,255,0.18);
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
          color:#fff; cursor:pointer;
          box-shadow:0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
          transition: transform .15s ease, box-shadow .2s ease, filter .2s ease;
          font-size:1.2rem; position:relative; overflow:hidden; isolation:isolate;
        }
        .icon-btn:hover{ transform: translateY(-2px); }

        /* Glow/shimmer forte (come home) */
        .glow-strong::before{
          content:""; position:absolute; inset:-20%;
          background: conic-gradient(from 0deg, rgba(255,255,255,0.08), rgba(255,255,255,0.28), rgba(255,255,255,0.08));
          filter: blur(18px); opacity:.65; z-index:1; animation: spinGlow 8s linear infinite; pointer-events:none;
        }
        .glow-strong::after{
          content:""; position:absolute; inset:0;
          background:
            radial-gradient(120% 80% at -10% 0%, rgba(255,255,255,0.18), transparent 40%),
            radial-gradient(120% 80% at 120% 100%, rgba(255,255,255,0.15), transparent 40%);
          z-index:1; mix-blend-mode:screen; animation: pulseBloom 2.2s ease-in-out infinite; pointer-events:none;
        }
        @keyframes spinGlow{ to{ transform: rotate(360deg); } }
        @keyframes pulseBloom{ 0%,100%{ opacity:.35; filter:brightness(1);} 50%{ opacity:.75; filter:brightness(1.35);} }
        @keyframes shimmer{ 0%{ filter:brightness(1);} 50%{ filter:brightness(1.12);} 100%{ filter:brightness(1);} }

        @media (max-width: 900px){
          .wrap{ padding:18px; }
          .cards{ grid-template-columns:1fr; }
          .icon-btn{ --btn-size:50px; font-size:1.15rem; }
          .tools-sticky{ bottom: 10px; }
        }
        @media (max-width: 480px){
          .icon-btn{ --btn-size:48px; font-size:1.1rem; }
        }
      `}</style>
    </>
  );
};

export default Finanze;
