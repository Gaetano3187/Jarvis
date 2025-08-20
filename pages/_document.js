// pages/_document.js
import { Html, Head, Main, NextScript } from "next/document";

const MOBILE_KILL = `
/* === MOBILE FIX UNIVERSALE (CSS + :has) — inline, ultimo, altissima priorità === */
/* 1) Portrait / width ridotta: righe con pulsanti diventano griglia 2x2 */
@media (max-width: 900px){
  html[data-mobilefix] body .app-shell { --_actions-w: 42vw; }

  /* Qualsiasi contenitore che abbia >=2 pulsanti visibili viene trattato come riga */
  html[data-mobilefix] .app-shell :where(*) :is(:has(> button + button), :has(> [role="button"] + [role="button"])):not(button):not(a){
    display: grid !important;
    grid-template-columns: 1fr auto !important;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 8px; row-gap: 6px;
    min-width: 0 !important;
  }

  /* AREA AZIONI: è qualsiasi child che contenga pulsanti */
  html[data-mobilefix] .app-shell :where(*) :has(> button, > [role="button"]){
    /* se è il pannello dei pulsanti, usalo come .actions */
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
    justify-content: flex-end !important;
    max-width: var(--_actions-w);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
    grid-column: 2 / 3;
    grid-row: 1 / span 2;
    position: static !important; /* annulla absolute */
  }

  /* NOME PRODOTTO: primo figlio NON contenente pulsanti → una riga con ellissi */
  html[data-mobilefix] .app-shell :where(*) :is(:has(> button + button), :has(> [role="button"] + [role="button"])) > :not(:has(button, [role="button"])):first-child{
    grid-column: 1 / 2; grid-row: 1 / 2;
    display:block !important; min-width:0 !important;
    white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
  }

  /* META / tag / badge: i fratelli successivi al titolo vanno sotto e possono a capo */
  html[data-mobilefix] .app-shell :is(:has(> button + button), :has(> [role="button"] + [role="button"])) > :not(:has(button, [role="button"])):not(:first-child){
    grid-column: 1 / 2; grid-row: 2 / 3;
    display:flex; flex-wrap:wrap; gap:6px; min-width:0;
    white-space: normal !important; word-break: break-word !important; overflow-wrap:anywhere !important;
    font-size: 12px; line-height: 1.25;
  }

  /* Pulsanti compatti in portrait */
  html[data-mobilefix] .app-shell :has(> button, > [role="button"]) > :is(button,[role="button"],.btn,.badge,.chip){
    flex:0 0 auto !important;
    min-width:34px; min-height:34px;
    padding:6px 8px; font-size:12px; border-radius:10px;
    white-space: nowrap;
    position: static !important;
  }

  /* Testo globale: nessun “spezza-lettere” aggressivo */
  html[data-mobilefix] .app-shell, 
  html[data-mobilefix] .app-shell *{
    word-break: keep-all !important;
    overflow-wrap: normal !important;
    white-space: normal !important;
    -webkit-hyphens: none !important;
    hyphens: none !important;
    writing-mode: horizontal-tb !important;
    text-orientation: mixed !important;
  }

  /* Tabelle: wrap solo nelle celle */
  html[data-mobilefix] .custom-table :is(th,td),
  html[data-mobilefix] .table-v :is(th,td){
    white-space: normal !important;
    word-break: break-word !important;
    overflow-wrap: anywhere !important;
  }
  html[data-mobilefix] .table-container{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
  html[data-mobilefix] .custom-table, html[data-mobilefix] .table-v{
    display: table !important; table-layout: auto !important; min-width:0 !important; overflow-x:visible !important;
  }
  html[data-mobilefix] .custom-table th, html[data-mobilefix] .custom-table td,
  html[data-mobilefix] .table-v th,     html[data-mobilefix] .table-v td{
    padding: 8px 10px !important; font-size:12px !important; line-height:1.35 !important;
  }
}

/* 2) Landscape basso (telefono sdraiato) — comandi più grandi e tabella larga */
@media (orientation: landscape) and (max-height: 480px){
  html[data-mobilefix] .app-shell :has(> button, > [role="button"]) > :is(button,[role="button"],.btn){
    min-width:40px; min-height:40px; padding:8px 12px; font-size:14px;
  }
  html[data-mobilefix] .table-container{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
  html[data-mobilefix] .custom-table, html[data-mobilefix] .table-v{ min-width:760px; }
}
`;

/* Script che etichetta automaticamente i nodi:
   - aggiunge .actions al contenitore con pulsanti
   - aggiunge .product-name al primo nodo testuale della riga
   Non reimpagina: solo classi, quindi è safe anche con React. */
const AUTO_TAGGER = `
(function(){
  const apply = (root) => {
    const rows = root.querySelectorAll('.app-shell *');
    rows.forEach(node => {
      if (node.__mobilePatched) return;
      const buttons = Array.from(node.children).filter(c => c.matches('button,[role="button"],.btn,.badge,.chip'));
      // Se i bottoni sono dentro un child (es. <div>), trova il primo che li contiene
      let actions = Array.from(node.children).find(c => c.querySelector('button,[role="button"],.btn,.badge,.chip'));
      if (!actions && buttons.length === 0) return; // non è una riga con azioni
      if (!actions) actions = node; // fallback (bottoni diretti)
      actions.classList.add('actions');

      // Primo figlio non contenente pulsanti = titolo
      const title = Array.from(node.children).find(c => !c.querySelector('button,[role="button"],.btn,.badge,.chip'));
      if (title) title.classList.add('product-name');

      node.__mobilePatched = true;
    });
  };

  const boot = () => {
    const root = document.querySelector('body');
    if (!root) return;
    apply(root);
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.addedNodes) m.addedNodes.forEach(n => {
          if (n.nodeType === 1) apply(n);
        });
      }
    });
    mo.observe(root, { subtree: true, childList: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
`;

export default function Document() {
  return (
    <Html lang="it" data-titlefx data-mobilefix>
      <Head>
        {/* Meta di base */}
        <meta charSet="utf-8" />
        {/* ✨ fondamentale su iOS per scala corretta */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#08131b" />
        <meta property="twitter:card" content="summary_large_image" />

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@100..900&display=swap" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&display=swap" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet" />

        {/* Librerie esterne */}
        <link rel="stylesheet" href="https://unpkg.com/animate.css@4.1.1/animate.css" />
        <link rel="stylesheet" href="https://unpkg.com/@teleporthq/teleport-custom-scripts/dist/style.css" />

        {/* Reset leggero */}
        <style
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
        {/* Tipografia base */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
html { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 16px; }
body {
  font-weight: 400; font-style: normal; text-decoration: none; text-transform: none;
  letter-spacing: normal; line-height: 1.15; color: inherit; background: transparent; fill: currentColor;
}
h1, h2, h3, .title { font-family: "Montserrat", Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
`,
          }}
        />
      </Head>

      <body>
        <Main />
        <NextScript />

        {/* TeleportHQ */}
        <script defer src="https://unpkg.com/@teleporthq/teleport-custom-scripts" />

        {/* CSS mobile inline finale */}
        <style id="mobile-kill-switch" dangerouslySetInnerHTML={{ __html: MOBILE_KILL }} />

        {/* Auto-etichettatore: aggiunge .actions e .product-name se mancano */}
        <script
          dangerouslySetInnerHTML={{ __html: AUTO_TAGGER }}
        />
      </body>
    </Html>
  );
}
