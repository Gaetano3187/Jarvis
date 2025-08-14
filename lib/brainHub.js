// lib/brainHub.js
if (typeof window !== 'undefined') {
  window.__brain = window.__brain || {
    spendingSources: [],
    stockSources: [],
    priceSources: [],
  };
}

export function registerSpendingSource(cfg){
  if (typeof window === 'undefined') return;
  const r = window.__brain;
  if (!r.spendingSources.some(s => s.name === cfg.name)) r.spendingSources.push(cfg);
}
export function registerStockSource(cfg){
  if (typeof window === 'undefined') return;
  const r = window.__brain;
  if (!r.stockSources.some(s => s.name === cfg.name)) r.stockSources.push(cfg);
}
export function registerPriceSource(cfg){
  if (typeof window === 'undefined') return;
  const r = window.__brain;
  if (!r.priceSources.some(s => s.name === cfg.name)) r.priceSources.push(cfg);
}

const USER_NAME = 'Gaetano';
const fmtEUR = (x) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(x||0));
const norm = (s='') => s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const iso  = (d) => d.toISOString().slice(0,10);
const MI = {gennaio:0,febbraio:1,marzo:2,aprile:3,maggio:4,giugno:5,luglio:6,agosto:7,settembre:8,ottobre:9,novembre:10,dicembre:11};
const withGreeting = (ans, first) => first ? `Ciao ${USER_NAME}, ${ans}` : ans;

export function parseRange(text, now=new Date()){
  const t=norm(text);
  if(/\b(questo|corrente)\s+mese\b/.test(t)){ const y=now.getFullYear(), m=now.getMonth(); return {label:'questo mese', from:iso(new Date(Date.UTC(y,m,1))), to:iso(new Date(Date.UTC(y,m+1,1)))}; }
  if(/\bmese\s+(scorso|precedente)\b/.test(t)){ const y=now.getFullYear(), m=now.getMonth(); return {label:'mese scorso', from:iso(new Date(Date.UTC(y,m-1,1))), to:iso(new Date(Date.UTC(y,m,1)))}; }
  const mm=t.match(/\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b(?:\s+(\d{2,4}))?/);
  if(mm){ let y=now.getFullYear(); if(mm[2]){const yy=+mm[2]; y=(yy<100)?2000+yy:yy;} const mi=MI[mm[1]]; return {label:`${mm[1]} ${y}`, from:iso(new Date(Date.UTC(y,mi,1))), to:iso(new Date(Date.UTC(y,mi+1,1)))}; }
  const y=now.getFullYear(), m=now.getMonth(); return {label:'questo mese', from:iso(new Date(Date.UTC(y,m,1))), to:iso(new Date(Date.UTC(y,m+1,1)))}; }

function parseITDate(s){
  if (!s || typeof s!=='string') return null;
  const m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null; const [_,dd,mm,yyyy]=m; const y=+(yyyy.length===2?('20'+yyyy):yyyy);
  const d=new Date(Date.UTC(y, +mm-1, +dd)); return isNaN(d)?null:d;
}
function inRangeDateVal(val, fromISO, toISO){
  const from=new Date(fromISO+'T00:00:00Z'), to=new Date(toISO+'T00:00:00Z');
  let d=null; if (val instanceof Date) d=val; else if(typeof val==='string') d=parseITDate(val)||new Date(val);
  return d && d>=from && d<to;
}

function detectIntent(text){
  const t=norm(text);
  if(/\b(speso|spese|totale)\b/.test(t)){ if(/\bcategoria|per categoria|breakdown\b/.test(t)) return 'SPENT_BY_CATEGORY'; return 'TOTAL_SPENT'; }
  if(/\b(prezzo|costa|pag(o|ato) meno|miglior prezzo)\b/.test(t)) return 'BEST_PRICE';
  if(/\b(scorte|scorta|magazzino|stock)\b/.test(t)) return 'STOCK_STATUS';
  if(/\b(quando finisce|esauriment|restano|giorni)\b/.test(t)) return 'DAYS_TO_DEPLETION';
  if(/\b(scadenza|in scadenza|scadono)\b/.test(t)) return 'EXPIRING_PRODUCTS';
  return 'TOTAL_SPENT';
}

async function aggTotalSpent(range){
  const R=window.__brain?.spendingSources||[]; let tot=0;
  for(const src of R){
    try{
      const rows=await src.fetchAll();
      const sum=(rows||[]).reduce((s,row)=>{
        const v=row[src.amountField]; const d=row[src.dateField];
        return inRangeDateVal(d,range.from,range.to) ? s+Number(v||0) : s;
      },0);
      tot+=sum;
    }catch{}
  }
  return tot;
}
async function aggSpentByCategory(range){
  const R=window.__brain?.spendingSources||[]; const map={};
  for(const src of R){
    if(!src.categoryField) continue;
    try{
      const rows=await src.fetchAll();
      (rows||[]).forEach(row=>{
        if(!inRangeDateVal(row[src.dateField],range.from,range.to)) return;
        const k=row[src.categoryField]||'Senza categoria';
        map[k]=(map[k]||0)+Number(row[src.amountField]||0);
      });
    }catch{}
  }
  return Object.entries(map).map(([categoria,tot])=>({categoria,tot})).sort((a,b)=>b.tot-a.tot);
}
async function aggStockStatus(){
  const R=window.__brain?.stockSources||[]; let tot=0,sotto=0;
  for(const src of R){
    try{ const rows=await src.fetchAll(); const f=src.fields;
      (rows||[]).forEach(r=>{ tot+=1; if(Number(r[f.qty]||0)<=Number(r[f.min]||0)) sotto+=1; });
    }catch{}
  }
  return {totale:tot,in_soglia:sotto};
}
async function aggDaysToDepletion(name){
  const q=norm(name||''); const R=window.__brain?.stockSources||[];
  for(const src of R){
    try{ const rows=await src.fetchAll(); const f=src.fields;
      const m=(rows||[]).find(r=>norm(String(r[f.name]||'')).includes(q));
      if(!m) continue; const d=Number(m[f.daily]||0), s=Number(m[f.qty]||0);
      return {nome:m[f.name], days: d>0 ? Math.max(0, Math.ceil(s/d)) : Infinity};
    }catch{}
  }
  return null;
}
async function aggExpiringProducts(days=14){
  const R=window.__brain?.stockSources||[]; const out=[]; const today=new Date(); today.setHours(0,0,0,0); const lim=new Date(today); lim.setDate(lim.getDate()+days);
  for(const src of R){
    const f=src.fields; if(!f.expiry) continue;
    try{ const rows=await src.fetchAll();
      (rows||[]).forEach(r=>{
        const d=r[f.expiry] && (parseITDate(r[f.expiry])||new Date(r[f.expiry]));
        if(d && d>=today && d<=lim) out.push({nome:r[f.name], scadenza:r[f.expiry]});
      });
    }catch{}
  }
  return out.sort((a,b)=> new Date(a.scadenza)-new Date(b.scadenza));
}

export async function runQueryFromTextLocal(text,{first=false}={}){
  const intent=detectIntent(text);
  try{
    if(intent==='TOTAL_SPENT'){
      const range=parseRange(text); const tot=await aggTotalSpent(range);
      const label=/^(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/i.test(range.label)
        ? `nel mese di ${range.label.split(' ')[0]}` : range.label;
      return {ok:true, result: withGreeting(`${label} hai speso ${fmtEUR(tot)}.`, first)};
    }
    if(intent==='SPENT_BY_CATEGORY'){
      const range=parseRange(text); const arr=await aggSpentByCategory(range);
      const top=(arr||[]).slice(0,5).map(x=>`${x.categoria}: ${fmtEUR(x.tot)}`).join(' · ') || '—';
      return {ok:true, result: withGreeting(`Top categorie in ${range.label}: ${top}`, first), data:{breakdown:arr}};
    }
    if(intent==='STOCK_STATUS'){ const st=await aggStockStatus(); return {ok:true, result: withGreeting(`ho ${st.in_soglia} prodotti sotto soglia e ${st.totale} in totale.`, first), data:st}; }
    if(intent==='DAYS_TO_DEPLETION'){ const name=text.replace(/.*di\s+/i,'').trim(); const info=await aggDaysToDepletion(name); if(!info) return {ok:true, result: withGreeting('non trovo il prodotto richiesto.', first)}; const when=info.days===Infinity?'consumo medio non disponibile':`${info.days} giorni`; return {ok:true, result: withGreeting(`${info.nome} finisce in ${when}.`, first), data:info}; }
    if(intent==='EXPIRING_PRODUCTS'){ const list=await aggExpiringProducts(14); const txt=(list||[]).slice(0,5).map(p=>`${p.nome} (${p.scadenza})`).join(' · ') || 'nessun prodotto in scadenza a breve'; return {ok:true, result: withGreeting(txt, first), data:{items:list}}; }
    if(intent==='BEST_PRICE'){ const m=text.match(/(?:del|di|per)\s+(.+)$/i)||text.match(/prezzo\s+(.+)$/i); const q=(m?.[1]||text).trim(); const S=window.__brain?.priceSources||[]; for(const src of S){ try{ const bp=await src.getBestPrice(q); if(bp) return {ok:true, result: withGreeting(`il ${bp.nome} costa meno da ${bp.fornitore} a ${fmtEUR(bp.prezzo)}${bp.data?` (${bp.data})`:''}.`, first), data:bp}; }catch{} } return {ok:true, result: withGreeting('non ho trovato il prodotto richiesto.', first)}; }
    return {ok:true, result: withGreeting('non ho capito, riprova specificando meglio 🙂', first)};
  }catch(e){ console.error('brainHub',e); return {ok:false, result: withGreeting('si è verificato un errore durante la richiesta.', first)}; }
}
