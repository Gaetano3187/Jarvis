import React from 'react'
import Head from 'next/head'
import Script from 'next/script'
import { useTranslations } from 'next-intl'


const Dashboard1 = (props) => {
  return (
    <>
      <div className="dashboard1-container1">
        <Head>
          <title>dashboard1 - Jarvis-Assistent</title>
          <meta property="og:title" content="dashboard1 - Jarvis-Assistent" />
        </Head>
        <div className="dashboard1-container2">
          <div className="dashboard1-container3">
            <Script
              html={`<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>Dashboard Dispensa – Embed</title>

  <!-- Tailwind CDN per utility -->
  <script src="https://cdn.tailwindcss.com"></script>

  <style>
    /* Token “hud” semplificati */
    :root{
      --hud-900:#0e1014; --hud-800:#1a1d22; --hud-700:#2b2e34;
      --hud-gold:#f6c346; --hud-re:#e03a3a; --hud-100:#fafafa;
    }
    body{background:var(--hud-900);color:var(--hud-100);font-family:Inter,sans-serif;}

    /* Teleport-like helper */
    .thq-card{background:var(--hud-800);border-radius:1rem;box-shadow:0 6px 16px rgba(0,0,0,.35);}
    .thq-card-padding{padding:1.5rem}
    .thq-heading-1{font-size:1.75rem;font-weight:700}
    .thq-heading-2{font-size:1.5rem;font-weight:600}
    .thq-heading-3{font-size:1.25rem;font-weight:600}
    .thq-heading-4{font-size:1.125rem;font-weight:600}
    .thq-body-small{font-size:.875rem}
    .thq-tag{font-size:.75rem;font-weight:500}
    /* badge */
    .badge{display:flex;flex-direction:column;align-items:center;border-radius:1rem;padding:.75rem 1rem}
    /* tile */
    .grid-link{display:block;width:100%;padding:2rem;border-radius:1rem;
               font-size:1.25rem;font-weight:600;color:#fff;text-align:center;
               text-decoration:none;box-shadow:0 6px 15px rgba(0,0,0,.3);
               transition:transform .15s;line-height:1.4}
    .grid-link:hover{transform:translateY(-4px)}
    /* sparkline */
    .sparkline{width:100%;height:48px}
  </style>
</head>
<body>

<div class="max-w-5xl mx-auto px-6 py-16 flex flex-col gap-12">

  <!-- Header -->
  <header class="flex justify-between items-center">
    <h1 class="thq-heading-1">Dispensa</h1>
    <button class="px-4 py-2 rounded-lg font-semibold text-hud-900" style="background:var(--hud-gold);">＋</button>
  </header>

  <!-- Griglia Overview + Expenses -->
  <div id="grid-top" class="grid md:grid-cols-3 gap-8"></div>

  <!-- Prodotti da acquistare -->
  <div id="grocery"></div>

  <!-- Prodotti in esaurimento -->
  <div id="low-stock"></div>

  <!-- Prodotti in scadenza -->
  <div id="expiring"></div>

</div>

<script>
/* ---------- MOCK DATI (rimpiazza con fetch se necessario) ---------- */
const data = {
  listaProdotti:[
    {id:1,nome:"Pasta",categoria:"Dispensa",quantita:1,scortaMinima:2,scadenza:"2026-01-15"},
    {id:2,nome:"Latte",categoria:"Frigo",quantita:0,scortaMinima:2,scadenza:"2025-07-13"},
    {id:3,nome:"Yogurt",categoria:"Frigo",quantita:1,scortaMinima:3,scadenza:"2025-07-12"},
    {id:4,nome:"Piselli surgelati",categoria:"Freezer",quantita:1,scortaMinima:1,scadenza:"2027-11-01"}
  ],
  spesaSupermercato:[
    {id:101,data:"2025-07-09",totale:42.8},
    {id:102,data:"2025-07-02",totale:35.2},
    {id:103,data:"2025-06-25",totale:51.1},
    {id:104,data:"2025-06-18",totale:38.45}
  ],
  prodottiInScadenza:[
    {idProdotto:3,nome:"Yogurt",scadenza:"2025-07-12"},
    {idProdotto:2,nome:"Latte",scadenza:"2025-07-13"}
  ]
};
const toBuy = data.listaProdotti.filter(p=>p.quantita<p.scortaMinima);

/* ---------- HELPER FUNZIONI -------------------------------------- */
const \$ = s=>document.querySelector(s);
const spark = (svg,vals)=>{
  const w=svg.clientWidth,h=svg.clientHeight;
  const max=Math.max(...vals),min=Math.min(...vals);
  const pts=vals.map((v,i)=>[i/(vals.length-1)*w,h-(v-min)/(max-min||1)*h]);
  svg.setAttribute('viewBox',\`0 0 \${w} \${h}\`);
  svg.innerHTML=\`<polyline fill="none" stroke="#fff" stroke-width="2" points="\${pts.map(p=>p.join(',')).join(' ')}"/>\`;
};
const badge=(lbl,val,cls)=>\`
  <div class="badge \${cls}">
    <span class="thq-heading-4 font-bold">\${val}</span>
    <span class="thq-body-small opacity-80">\${lbl}</span>
  </div>\`;

/* ---------- Overview + Expenses ---------------------------------- */
(()=>{
  const total=data.listaProdotti.length;
  const low=data.listaProdotti.filter(p=>p.quantita<p.scortaMinima).length;
  const exp=data.listaProdotti.filter(p=>(new Date(p.scadenza)-Date.now())/864e5<=7).length;

  const vals=data.spesaSupermercato.slice(0,4).map(s=>s.totale).reverse();
  const sum=vals.reduce((a,b)=>a+b,0).toFixed(2);

  \$('#grid-top').innerHTML=\`
    <section class="thq-card thq-card-padding flex flex-col gap-4 md:col-span-2">
      <h2 class="thq-heading-3">Panoramica dispensa</h2>
      <div class="flex gap-4 flex-wrap">
        \${badge('Articoli totali',total,'bg-hud-700')}
        \${badge('Sotto scorta',low,'bg-hud-gold text-hud-900')}
        \${badge('In scadenza',exp,'bg-hud-re text-hud-100')}
      </div>
    </section>
    <section class="thq-card thq-card-padding flex flex-col gap-2">
      <h2 class="thq-heading-3">Spesa&nbsp;4&nbsp;settimane</h2>
      <div class="flex items-baseline gap-2">
        <span class="thq-heading-2">€ \${sum}</span>
        <span class="thq-body-small opacity-70">totale</span>
      </div>
      <svg class="sparkline mt-2" id="spark"></svg>
    </section>\`;
  spark(\$('#spark'),vals);
})();

/* ---------- Prodotti da acquistare ------------------------------- */
(()=>{
  const colors=['#2563eb','#9333ea','#f97316','#6b7280','#0ea5e9','#22c55e','#e11d48'];
  \$('#grocery').innerHTML=\`
    <section class="thq-card thq-card-padding flex flex-col gap-4">
      <h2 class="thq-heading-3">Prodotti da acquistare</h2>
      \${toBuy.length===0?'<p class="opacity-80">Nessun prodotto da acquistare 🎉</p>':\`
      <div class="flex flex-wrap gap-8 justify-center">
        \${toBuy.map((p,i)=>\`
          <div style="flex:1 1 260px;max-width:420px" class="flex justify-center">
            <a class="grid-link" href="#"
               style="background:\${colors[i%colors.length]};">
              🛒 \${p.nome}<br>
              <span style="font-size:1rem;font-weight:400;">
                Da comprare: \${p.scortaMinima - p.quantita}
              </span>
            </a>
          </div>\`).join('')}
      </div>\`}
    </section>\`;
})();

/* ---------- Low Stock ------------------------------------------- */
(()=>{
  const low=data.listaProdotti.filter(p=>p.quantita<p.scortaMinima);
  \$('#low-stock').innerHTML=\`
    <section class="thq-card thq-card-padding">
      <h2 class="thq-heading-3 mb-4">Prodotti in esaurimento</h2>
      <table class="w-full text-left text-sm">
        <thead><tr>
          <th class="py-2 px-3">Prodotto</th>
          <th class="py-2 px-3">Q.tà</th>
          <th class="py-2 px-3">Min</th>
        </tr></thead>
        <tbody>
          \${low.map(r=>\`
            <tr class="border-t border-hud-700">
              <td class="py-2 px-3">\${r.nome}</td>
              <td class="py-2 px-3">\${r.quantita}</td>
              <td class="py-2 px-3">\${r.scortaMinima}</td>
            </tr>\`).join('')}
        </tbody>
      </table>
    </section>\`;
})();

/* ---------- Expiring -------------------------------------------- */
(()=>{
  const list=[...data.prodottiInScadenza]
    .sort((a,b)=>new Date(a.scadenza)-new Date(b.scadenza));
  const cls=d=>d<=3?'bg-hud-re text-hud-100':d<=7?'bg-hud-gold text-hud-900':'bg-hud-700';
  \$('#expiring').innerHTML=\`
    <section class="thq-card thq-card-padding flex flex-col gap-4">
      <h2 class="thq-heading-3">Scadenze prossimi 7 giorni</h2>
      <ul class="flex flex-col gap-3">
        \${list.map(p=>{
          const diff=Math.round((new Date(p.scadenza)-Date.now())/864e5);
          return \`<li class="flex justify-between items-center border-b border-hud-700 pb-2">
            <span>\${p.nome}</span>
            <span class="thq-tag px-2 py-1 rounded-lg \${cls(diff)}">
              \${diff<=0?'Oggi':diff+'g'}
            </span>
          </li>\`}).join('')}
      </ul>
    </section>\`;
})();
</script>
</body>
</html>
`}
            ></Script>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .dashboard1-container1 {
            width: 100%;
            display: flex;
            min-height: 100vh;
            align-items: center;
            flex-direction: column;
          }
          .dashboard1-container3 {
            display: contents;
          }
          @media (max-width: 1600px) {
            .dashboard1-container2 {
              width: 1600px;
              height: 1230px;
              padding-bottom: 0px;
            }
          }
        `}
      </style>
    </>
  )
}

export default Dashboard1

export async function getServerSideProps() {
  return { props: {} }
}
