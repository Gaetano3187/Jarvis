// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="it">
      <Head>
        {/* Meta di base */}
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#08131b" />
        <meta property="twitter:card" content="summary_large_image" />

        {/* Fonts: preconnect + Montserrat (titoli) + tuoi font esistenti */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
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
      </body>
    </Html>
  );
}
