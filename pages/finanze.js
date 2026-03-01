// pages/finanze.js
import React, { useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import VoiceRecorder from '../components/VoiceRecorder';
import {
  FaMoneyBillWave, FaHome, FaTshirt, FaUtensils,
  FaFolderOpen, FaChartPie, FaPlus, FaCamera, FaMicrophone
} from 'react-icons/fa';

// Colori pieni (base) + hover per ogni sezione
const categories = [
  { href: '/entrate',          base: '#22c55e', hover: '#16a34a', icon: <FaMoneyBillWave/>, title: 'Entrate & Saldi',  subtitle: 'Stipendi, carryover, tasca' },
  { href: '/spese-casa',       base: '#3b82f6', hover: '#2563eb', icon: <FaHome/>,          title: 'Spese Casa',       subtitle: 'Bollette, manutenzioni ecc.' },
  { href: '/vestiti-ed-altro', base: '#a855f7', hover: '#9333ea', icon: <FaTshirt/>,        title: 'Vestiti ed Altro', subtitle: 'Vestiti e accessori' },
  { href: '/cene-aperitivi',   base: '#f59e0b', hover: '#f97316', icon: <FaUtensils/>,      title: 'Cene / Aperitivi', subtitle: 'Serate, pranzi, regali' },
  { href: '/varie',            base: '#64748b', hover: '#475569', icon: <FaFolderOpen/>,    title: 'Varie',            subtitle: 'Spese non catalogate' },
  { href: '/spese',            base: '#06b6d4', hover: '#0ea5e9', icon: <FaChartPie/>,      title: 'Report Spese',     subtitle: 'Tutte le spese per categoria' },
];

const Finanze = () => {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  // Evita media player su mobile (forza inline)
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

  const handleOCR   = useCallback(() => fileInputRef.current?.click(), []);
  const handleVoice = useCallback((text) => { if (text) console.log('[VOICE]', text); }, []);
  const onFileChange = (e) => { const f = e.target.files?.[0]; if (f) console.log('[OCR] file:', f.name); e.target.value=''; };

  return (
    <>
      <Head>
        <title>Finanze • Jarvis-Assistant</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Video di sfondo full-bleed */}
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
          {/* Cards sezioni: colore pieno + glow; icona AFFIANCATA al titolo */}
          <div className="cards">
            {categories.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="cat-card glow-strong"
                style={{ '--base': c.base, '--hover': c.hover }}
              >
                <div className="cat-bottom">
                  <h3 className="title">
                    <span className="chip">
                      <span className="chip-icon">{c.icon}</span>
                      <span className="chip-label">{c.title}</span>
                    </span>
                  </h3>
                  <p className="sub">{c.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Barra strumenti compatta in basso, solo icone */}
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

      {/* Input OCR nascosto */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />

      <style jsx>{`
        :root{
          --glass-bg: rgba(0,0,0,0.26);
          --glass-brd: rgba(255,255,255,0.14);
          --text: #fff;
        }

        .bg-video{
          position: fixed; inset: 0;
          width: 100vw; height: 100vh; object-fit: cover;
          z-index: -1; pointer-events: none;
          filter: saturate(1.05) contrast(1.05);
        }

        .wrap{
          min-height:100vh; display:grid;
          grid-template-rows: 1fr auto;
          padding:28px; color:var(--text);
        }
        .grid{
          width:100%; max-width:1240px; margin:0 auto;
          display:grid; grid-template-rows:auto 1fr; gap:20px;
        }

        .cards{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:24px;
        }

        /* CARD a colore pieno, MOLTO PIÙ GRANDE e senza alone nero rettangolare */
        .cat-card{
          position:relative; display:grid; grid-template-rows:1fr;
          min-height:clamp(240px, 36vw, 400px); /* <<< più grande */
          border-radius:26px;
          color:#fff; text-decoration:none;
          border:1px solid rgba(255,255,255,0.14);
          background: var(--base);
          box-shadow:
            0 12px 28px rgba(0,0,0,0.18),                  /* ombra morbida */
            0 0 36px color-mix(in srgb, var(--base), #fff 26%); /* bagliore colorato */
          overflow:hidden; isolation:isolate;
          transition: transform .25s ease, box-shadow .25s ease, filter .25s ease, background .25s ease;
          animation: shimmer 6s linear infinite;
          touch-action: manipulation;
        }
        .cat-card:hover{
          transform: translateY(-4px) scale(1.02);
          background: var(--hover);
          box-shadow:
            0 18px 50px rgba(0,0,0,0.24),
            0 0 46px color-mix(in srgb, var(--hover), #fff 30%);
        }

        .cat-bottom{
          display:flex; flex-direction:column; justify-content:flex-end;
          padding:28px;
          background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.14) 100%);
        }

        /* ---- TITOLO (pill) con icona affiancata ---- */
        .title{ margin:0 0 12px; }
        .chip{
          --soft: color-mix(in oklab, var(--base), #ffffff 22%);
          --deep: color-mix(in oklab, var(--base), #000000 10%);
          display:inline-flex; align-items:center; gap:12px;
          padding:14px 18px;                            /* <<< più grande */
          border-radius:18px;
          font-size:clamp(1.35rem,3.6vw,2rem);          /* <<< titolo più grande */
          font-weight:900; letter-spacing:.2px;
          color:#0b1020;
          background: linear-gradient(90deg, var(--soft), var(--deep));
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.16) inset,
            0 10px 24px color-mix(in srgb, var(--base), #000 22%),
            0 0 32px color-mix(in srgb, var(--base), #fff 18%);
          position:relative; overflow:hidden;
          text-shadow: 0 1px 0 rgba(255,255,255,0.35);
        }
        .chip-icon :global(svg){ font-size:clamp(26px, 4vw, 32px); filter:drop-shadow(0 4px 12px rgba(0,0,0,.28)); }
        .chip-label{ line-height:1; }

        /* scia luminosa che attraversa la chip */
        .chip::before{
          content:"";
          position:absolute; top:0; left:-35%;
          width:30%; height:100%;
          background: linear-gradient(120deg, rgba(255,255,255,0.6), rgba(255,255,255,0.14));
          transform: skewX(-20deg);
          filter: blur(0.5px);
          animation: sweep 3s linear infinite;
          mix-blend-mode: screen;
        }
        /* alone respirante */
        .chip::after{
          content:"";
          position:absolute; inset:-25%;
          background: radial-gradient(60% 40% at 50% 50%, rgba(255,255,255,0.18), transparent 70%);
          filter: blur(18px);
          animation: pulseBloom 2.1s ease-in-out infinite;
          pointer-events:none;
        }

        .sub{ margin:0; opacity:.95; font-size:clamp(1rem,2.4vw,1.2rem); }

        /* Barra strumenti compatta e in basso */
        .tools-sticky{ margin-top: 12px; align-self: end; position: sticky; bottom: 12px; }
        .tools-card{
          background: var(--glass-bg);
          border: 1px solid var(--glass-brd);
          border-radius: 14px;
          padding: 10px 12px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 22px rgba(0,0,0,0.30);
        }
        .icon-bar{ display:flex; gap:10px; align-items:center; }
        .icon-btn{
          --btn-size:56px;
          width:var(--btn-size); height:var(--btn-size);
          display:grid; place-items:center;
          border-radius:12px;
          border:1px solid rgba(255,255,255,0.16);
          background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02));
          color:#fff; cursor:pointer;
          box-shadow:0 6px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06);
          transition: transform .15s ease, box-shadow .2s ease, filter .2s ease;
          font-size:1.25rem; position:relative; overflow:hidden; isolation:isolate;
        }
        .icon-btn:hover{ transform: translateY(-2px); }

        /* Glow/shimmer forte — sopra colore pieno */
        .glow-strong::before{
          content:""; position:absolute; inset:-20%;
          background: conic-gradient(from 0deg, rgba(255,255,255,0.08), rgba(255,255,255,0.28), rgba(255,255,255,0.08));
          filter: blur(18px); opacity:.6; z-index:1; animation: spinGlow 8s linear infinite; pointer-events:none;
        }
        .glow-strong::after{
          content:""; position:absolute; inset:0;
          background:
            radial-gradient(120% 80% at -10% 0%, rgba(255,255,255,0.16), transparent 40%),
            radial-gradient(120% 80% at 120% 100%, rgba(255,255,255,0.14), transparent 40%);
          z-index:1; mix-blend-mode:screen; animation: pulseBloom 2.2s ease-in-out infinite; pointer-events:none;
        }

        /* Animazioni */
        @keyframes spinGlow{ to{ transform: rotate(360deg); } }
        @keyframes pulseBloom{ 0%,100%{ opacity:.32; filter:brightness(1);} 50%{ opacity:.75; filter:brightness(1.35);} }
        @keyframes shimmer{ 0%{ filter:brightness(1);} 50%{ filter:brightness(1.08);} 100%{ filter:brightness(1);} }
        @keyframes sweep{ 0%{ left:-35%; } 100%{ left:135%; } }

        @media (max-width: 900px){
          .wrap{ padding:20px; }
          .grid{ max-width: 100%; }
          .cards{ grid-template-columns:1fr; gap:20px; }
          .icon-btn{ --btn-size:54px; font-size:1.2rem; }
          .tools-sticky{ bottom: 10px; }
        }
        @media (max-width: 480px){
          .icon-btn{ --btn-size:52px; font-size:1.15rem; }
        }
      `}</style>
    </>
  );
};

export default Finanze;

export async function getServerSideProps() {
  return { props: {} }
}
