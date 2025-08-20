// pages/_document.js
import { Html, Head, Main, NextScript } from "next/document";

const MOBILE_KILL = `
/* === KILL-SWITCH MOBILE INLINE — vince su tutto perché inline e ultimo === */
@media (max-width: 900px){
  html[data-mobilefix] body .app-shell, 
  html[data-mobilefix] body .app-shell *{
    word-break: keep-all !important;
    overflow-wrap: normal !important;
    white-space: normal !important;
    -webkit-hyphens: none !important;
    hyphens: none !important;
    writing-mode: horizontal-tb !important;
    text-orientation: mixed !important;
  }

  /* Consentire wrap solo nelle celle di tabella */
  html[data-mobilefix] .custom-table :is(th,td),
  html[data-mobilefix] .table-v :is(th,td){
    white-space: normal !important;
    word-break: break-word !important;
    overflow-wrap: anywhere !important;
  }

  /* Righe lista: griglia 2x2 + azioni che non schiacciano */
  html[data-mobilefix] .list-row,
  html[data-mobilefix] .list-item,
  html[data-mobilefix] .card.row{
    display: grid !important;
    grid-template-columns: 1fr auto !important;
    grid-template-rows: auto auto;
    align-items: center; column-gap: 8px; row-gap: 6px;
    min-width: 0 !important;
  }
  html[data-mobilefix] .list-row .actions > *,
  html[data-mobilefix] .list-item .actions > *,
  html[data-mobilefix] .card.row .actions > *{ position: static !important; }

  html[data-mobilefix] :is(.product-name,.item-name,.row-title,.name,.titlecell,
                           [class*="product-name"],[class*="item-name"],[class*="row-title"]){
    grid-column: 1/2; grid-row: 1/2;
    display:block !important; min-width:0 !important;
    white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
  }
  html[data-mobilefix] :is(.row-meta,.meta,.subtitle,.badges,.tags){
    grid-column: 1/2; grid-row: 2/2;
    display:flex !important; flex-wrap:wrap; gap:6px; min-width:0;
    white-space: normal !important; word-break: break-word !important; overflow-wrap:anywhere !important;
    font-size:12px; line-height:1.25;
  }
  html[data-mobilefix] .actions{
    grid-column: 2/3; grid-row: 1 / span 2;
    display:flex !important; flex-wrap:wrap; gap:8px; justify-content:flex-end;
    max-width: 42vw; overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:2px;
  }
  html[data-mobilefix] .actions :is(button,[role="button"],.btn,.badge,.chip){
    flex:0 0 auto !important; min-width:34px; min-height:34px; padding:6px 8px; font-size:12px; border-radius:10px;
    white-space: nowrap;
  }

  /* Tabelle ritaglio portrait */
  html[data-mobilefix] .table-container{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
  html[data-mobilefix] .custom-table, html[data-mobilefix] .table-v{
    display: table !important; table-layout: auto !important; min-width:0 !important; overflow-x:visible !important;
  }
  html[data-mobilefix] .custom-table th, html[data-mobilefix] .custom-table td,
  html[data-mobilefix] .table-v th,     html[data-mobilefix] .table-v td{
    padding: 8px 10px !important; font-size:12px !important; line-height:1.35 !important;
  }
}

@media (orientation: landscape) and (max-height: 480px){
  html[data-mobilefix] .actions :is(button,[role="button"],.btn){
    min-width:40px; min-height:40px; padding:8px 12px; font-size:14px;
  }
  html[data-mobilefix] .table-container{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
  html[data-mobilefix] .custom-table, html[data-mobilefix] .table-v{ min-width:760px; }
}
`;

export default function Document() {
  return (
    <Html lang="it" data-titlefx data-mobilefix>
      <Head>
        {/* Meta di base */}
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#08131b" />
        <meta property="twitter:card" content="summary_large_image" />

        {/* Fonts: preconnect + Montserrat (titoli) + tuoi font esistenti */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@100..900&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800;900&display=swap"
          rel="stylesheet"
        />

        {/* Librerie esterne Teleport/animate */}
        <link rel="stylesheet" href="https://unpkg.com/animate.css@4.1.1/animate.css" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/@teleporthq/teleport-custom-scripts/dist/style.css"
        />

        {/* Reset leggero + default non invasivo (niente bg/colore sul body) */}
        <style
          // Reset base
          dangerouslySetInnerHTML={{
            __html: `
html { line-height: 1.15; scroll-behavior: smooth; }
body { margin: 0; }
*, *::before, *::after { box-sizing: border-box; border-width: 0; border-style: solid; -webkit-font-smoothing: antialiased; }
p,li,ul,pre,div,h1,h2,h3,h4,h5,h6,figure,blockquote,figcaption { margin: 0; padding: 0; }
button { background-color: transparent; }
button,input,optgroup,select,textarea { font: inherit; line-height: 1.15; margin: 0; }
button,select { text-transform: none; }
button,[type="button"],[type="reset"],[type="submit"] { -webkit-appearance: button; color: inherit; }
button::-moz-focus-inner,[type="button"]::-moz-focus-inner,[type="reset"]::-moz-focus-inner,[type="submit"]::-moz-focus-inner { border-style: none; padding: 0; }
a { color: inherit; text-decoration: inherit; }
img { display: block; max-width: 100%; height: auto; }
details { display: block; margin: 0; padding: 0; }
summary::-webkit-details-marker { display: none; }
[data-thq="accordion"] [data-thq="accordion-content"] { max-height: 0; overflow: hidden; transition: max-height .3s ease-in-out; padding: 0; }
[data-thq="accordion"] details[data-thq="accordion-trigger"][open] + [data-thq="accordion-content"] { max-height: 1000vh; }
details[data-thq="accordion-trigger"][open] summary [data-thq="accordion-icon"] { transform: rotate(180deg); }
`,
          }}
        />
        <style
          // Default tipografici: niente bg/colore forzati (gestiti dai global)
          dangerouslySetInnerHTML={{
            __html: `
html { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 16px; }
body {
  font-weight: 400;
  font-style: normal;
  text-decoration: none;
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
  color: inherit;          /* lascia ai global */
  background: transparent; /* lascia ai global */
  fill: currentColor;
}
/* Titoli: font Montserrat come richiesto (puoi rimuovere se lo fai nei global) */
h1, h2, h3, .title { font-family: "Montserrat", Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
`,
          }}
        />
      </Head>

      <body>
        <Main />
        <NextScript />

        {/* Script TeleportHQ */}
        <script defer src="https://unpkg.com/@teleporthq/teleport-custom-scripts" />

        {/* ⬇️ stile inline, ultimo nel DOM: batte qualsiasi CSS precedente */}
        <style id="mobile-kill-switch" dangerouslySetInnerHTML={{ __html: MOBILE_KILL }} />
      </body>
    </Html>
  );
}
