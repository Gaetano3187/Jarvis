// lib/brainHub.js
import { supabase } from '@/lib/supabaseClient';

// === Costanti allineate alla pagina liste-prodotti ===
const LS_VER = 1;
const LS_KEY = 'jarvis_liste_prodotti@v1';
const CLOUD_TABLE = 'jarvis_liste_state';
const CLOUD_SYNC = true;
const DEBUG = false;

const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };

// ---- Utils base ----
const normKey = (str) => String(str||'').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9\s]/g,' ').replace(/\s{2,}/g,' ').trim();

const tokens = (s)=>new Set(normKey(s).split(' ').filter(Boolean));
function isSimilar(a,b){
  const na=normKey(a), nb=normKey(b);
  if(!na||!nb) return false;
  if(na===nb) return true;
  if(na.length>=3 && (nb.includes(na)||na.includes(nb))) return true;
  const A=tokens(a), B=tokens(b);
  let inter=0; A.forEach(t=>{ if(B.has(t)) inter++; });
  const union=new Set([...A,...B]).size;
  const j=inter/union;
  return j>=0.5 || (inter>=1 && (A.size===1||B.size===1));
}
const ensureArray = (x)=>Array.isArray(x)?x:[];

// ---- Snapshot locale/cloud ----
function readSnapshot(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== LS_VER) return null;
    return data;
  } catch { return null; }
}
function writeSnapshot(doc){
  const payload = {
    v: LS_VER,
    at: Date.now(),
    lists: doc.lists || { [LIST_TYPES.SUPERMARKET]:[], [LIST_TYPES.ONLINE]:[] },
    stock: doc.stock || [],
    currentList: doc.currentList || LIST_TYPES.SUPERMARKET,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
  return payload;
}
async function cloudLoad(userId){
  try{
    const { data, error } = await supabase
      .from(CLOUD_TABLE).select('doc, updated_at')
      .eq('user_id', userId).single();
    if (error || !data) return null;
    return { doc: data.doc || null, ts: data.updated_at ? new Date(data.updated_at).getTime() : 0 };
  }catch{ return null; }
}
async function cloudSave(userId, doc){
  const now = Date.now();
  const payload = {
    user_id: userId,
    doc: { ...(doc||{}), at: Number(doc?.at || now) },
    updated_at: new Date(now).toISOString(),
  };
  await supabase.from(CLOUD_TABLE).upsert(payload, { onConflict: 'user_id' });
}

// ---- Helpers OCR locali (come pagina liste) ----
function extractPackInfo(str){
  const s = normKey(str);
  let packs = 1, unitsPerPack = 1, unitLabel = 'unità';
  const UNIT_TERMS = '(?:pz|pezzi|unit[aà]|barrett[e]?|vasett[i]?|uova|bottiglie?|merendine?|bustin[ae]|monouso)';
  let m = s.match(new RegExp(String.raw`(\d+)\s*(?:conf(?:e(?:zioni)?)?|pacc?hi?|scatol[ae])\s*(?:da|x)\s*(\d+)\s*(?:${UNIT_TERMS})?`, 'i'));
  if (m){ packs=+m[1]; unitsPerPack=+m[2]; unitLabel = (m[3]||'unità').replace(/pz|pezzi/i,'unità'); return {packs,unitsPerPack,unitLabel}; }
  m = s.match(/(\d+)\s*[x×]\s*\d+\s*(?:g|kg|ml|cl|l|lt)?/i);
  if (m){ packs=1; unitsPerPack=+m[1]; return {packs,unitsPerPack,unitLabel}; }
  m = s.match(new RegExp(String.raw`(\d+)\s*${UNIT_TERMS}\b`, 'i'));
  if (m){ packs=1; unitsPerPack=+m[1]; unitLabel = m[2] ? m[2].replace(/pz|pezzi/i,'unità') : 'unità'; return {packs,unitsPerPack,unitLabel}; }
  m = s.match(new RegExp(String.raw`(\d+)\s*(bottiglie?|pacc?hi?|scatol[ae]|conf(?:e(?:zioni)?)?)`, 'i'));
  if (m){ packs=+m[1]; unitsPerPack=1; unitLabel = /^bott/i.test(m[2])?'bottiglie':'unità'; return {packs,unitsPerPack,unitLabel}; }
  m = s.match(/^(\d+(?:[.,]\d+)?)\s+[a-z]/i);
  if (m){ packs = Number(String(m[1]).replace(',','.'))||1; unitsPerPack=1; return {packs,unitsPerPack,unitLabel}; }
  return {packs,unitsPerPack,unitLabel};
}
function parseReceiptPurchases(ocrText){
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const ignore = /(totale|iva|bancomat|contanti|resto|scontrino|cassa|cliente|sconto|subtotale|pagato|euro)/i;
  const out = [];
  for (let raw of lines){
    if (ignore.test(raw)) continue;
    let name = raw, brand = '';
    const parts = name.split(' ');
    if (parts.length>1 && /^[A-ZÀ-ÖØ-Þ]/.test(parts[parts.length-1])) {
      brand = parts.pop(); name = parts.join(' ');
    }
    name = name
      .replace(/\b(\d+[gG]|kg|ml|l|cl)\b/g,'')
      .replace(/\s{2,}/g,' ').trim().toLowerCase()
      .replace(/\buht\b/g,'')
      .replace(/spaghetti|penne|fusilli|rigatoni/,'pasta')
      .replace(/passata\b.*pomodoro|passata\b/,'passata di pomodoro')
      .replace(/latte\b.*/,'latte')
      .replace(/yogurt\b.*/,'yogurt')
      .replace(/\bcaffe\b/g,'caffè');
    if (!name || name.length<2) continue;
    const pack = extractPackInfo(raw);
    out.push({
      name, brand: brand||'',
      packs: Number(pack.packs||1),
      unitsPerPack: Number(pack.unitsPerPack||1),
      unitLabel: pack.unitLabel||'unità',
      expiresAt: ''
    });
  }
  return out;
}

// prompt per /api/assistant (stesso della pagina)
function buildOcrAssistantPrompt(ocrText){
  return [
    'Sei Jarvis, estrattore strutturato di scontrini.',
    'DEVI rispondere SOLO in JSON con questo schema ESATTO:',
    '{ "purchases":[{ "name":"", "brand":"", "packs":1, "unitsPerPack":1, "unitLabel":"unità", "expiresAt":"" }], "expiries":[], "stock":[] }',
    '--- TESTO OCR INIZIO ---',
    ocrText,
    '--- TESTO OCR FINE ---'
  ].join('\n');
}

// Decrementa su entrambe le liste e ritorna nuovo oggetto lists
function decrementAcrossBothLists(prevLists, purchases){
  const next = { ...prevLists };
  const decList = (key)=>{
    const arr = [...(next[key]||[])];
    for (const p of purchases){
      const dec = Math.max(1, Number(p.packs ?? p.qty ?? 1));
      const brand = (p.brand||'').trim();
      const upp = Number(p.unitsPerPack ?? 1);
      let idx = arr.findIndex(i => isSimilar(i.name,p.name) && (!brand || isSimilar(i.brand||'',brand)) && Number(i.unitsPerPack||1)===upp);
      if (idx<0) idx = arr.findIndex(i => isSimilar(i.name,p.name) && (!brand || isSimilar(i.brand||'',brand)));
      if (idx<0) idx = arr.findIndex(i => isSimilar(i.name,p.name));
      if (idx>=0){
        const cur = arr[idx];
        const newQty = Math.max(0, Number(cur.qty||0) - dec);
        arr[idx] = { ...cur, qty:newQty, purchased:true };
      }
    }
    next[key] = arr.filter(i => Number(i.qty||0)>0 || !i.purchased);
  };
  decList(LIST_TYPES.SUPERMARKET);
  decList(LIST_TYPES.ONLINE);
  return next;
}

// ---- API pubbliche usate dalla Home ----

/**
 * OCR locale: accetta { files: File[] }
 * - chiama /api/ocr
 * - prova estrazione strutturata via /api/assistant (fallback parser locale)
 * - decrementa dalle liste e incrementa scorte
 * - salva localStorage + (se loggato) Supabase
 */
export async function ingestOCRLocal({ files }) {
  if (!files?.length) throw new Error('Nessun file passato a ingestOCRLocal');

  // 1) OCR
  const fdOcr = new FormData();
  for (const f of files) fdOcr.append('images', f);
  const ocrRes = await fetch('/api/ocr', { method:'POST', body: fdOcr });
  const ocrJson = await ocrRes.json();
  const ocrText = String(ocrJson?.text||'').trim();
  if (!ocrText) throw new Error('OCR vuoto');

  // 2) Assistant per strutturare (fallback parser locale)
  let purchases = [];
  try {
    const prompt = buildOcrAssistantPrompt(ocrText);
    const r = await fetch('/api/assistant', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt })
    });
    const safe = await r.json();
    const answer = safe?.answer || safe?.data || safe;
    const parsed = typeof answer==='string' ? JSON.parse(answer) : answer;
    purchases = ensureArray(parsed?.purchases);
  } catch { /* ignore */ }
  if (!purchases.length) purchases = parseReceiptPurchases(ocrText);

  // 3) Applica alle liste/scorte
  const snap = readSnapshot() || {
    v:LS_VER, at:0,
    lists:{ [LIST_TYPES.SUPERMARKET]:[], [LIST_TYPES.ONLINE]:[] },
    stock:[], currentList: LIST_TYPES.SUPERMARKET
  };

  // decrementa liste
  const nextLists = decrementAcrossBothLists(snap.lists, purchases);

  // incrementa scorte
  const todayISO = new Date().toISOString().slice(0,10);
  const nextStock = [...(snap.stock||[])];
  for (const p of purchases){
    const idx = nextStock.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
    const pack = {
      packs: Number(p.packs ?? p.qty ?? 1),
      unitsPerPack: Number(p.unitsPerPack ?? 1),
      unitLabel: p.unitLabel || 'unità'
    };
    if (idx>=0){
      const old = nextStock[idx];
      const newPacks = Number(old.packs||0) + pack.packs;
      const upp = old.unitsPerPack || pack.unitsPerPack;
      nextStock[idx] = {
        ...old,
        packs: newPacks,
        unitsPerPack: upp,
        unitLabel: old.unitLabel || pack.unitLabel,
        baselinePacks: Math.max(Number(old.baselinePacks||0), newPacks),
        lastRestockAt: todayISO,
        residueUnits: newPacks * Math.max(1, upp),
      };
    } else {
      nextStock.unshift({
        name: p.name, brand: p.brand||'',
        packs: pack.packs, unitsPerPack: pack.unitsPerPack, unitLabel: pack.unitLabel,
        expiresAt: '', baselinePacks: pack.packs, lastRestockAt: todayISO,
        avgDailyUnits: 0, residueUnits: pack.packs * (pack.unitsPerPack || 1),
      });
    }
  }

  const nextDoc = writeSnapshot({
    lists: nextLists, stock: nextStock, currentList: snap.currentList
  });

  // 4) Cloud + finanze (best-effort)
  const { data: session } = await supabase.auth.getUser();
  const uid = session?.user?.id;
  if (CLOUD_SYNC && uid){
    try { await cloudSave(uid, nextDoc); } catch(e){ if (DEBUG) console.warn('cloudSave fail', e); }
  }
  try {
    await fetch('/api/finances/ingest', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ purchases })
    });
  } catch { /* ignore */ }

  return { ok:true, result:{ purchases, updatedLists: true, updatedStock: true } };
}

/**
 * Comando vocale: quantità/scadenze.
 * Accetta stringa e decide intent via /api/assistant, poi applica allo snapshot come fa la pagina liste.
 */
export async function ingestSpokenLocal(text) {
  const t = String(text||'').trim();
  if (!t) return { ok:false, result:'Comando vuoto' };

  // Chiediamo all’assistant di decidere intent e struttura
  const prompt = [
    'Sei Jarvis. Capisci un comando VOCALE per SCORTE & SCADENZE.',
    'Rispondi SOLO JSON.',
    'Se aggiornamento scorte: { "intent":"stock_update", "updates":[ { "name":"", "mode":"packs|units", "value":3 } ] }',
    'Se scadenze: { "intent":"expiry", "expiries":[ { "name":"", "expiresAt":"YYYY-MM-DD" } ] }',
    'Testo:', t
  ].join('\n');

  let intent = null, updates=[], expiries=[];
  try{
    const r = await fetch('/api/assistant', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt })
    });
    const safe = await r.json();
    const answer = safe?.answer || safe?.data || safe;
    const parsed = typeof answer==='string'? JSON.parse(answer) : answer;
    intent   = parsed?.intent || null;
    updates  = ensureArray(parsed?.updates);
    expiries = ensureArray(parsed?.expiries);
  }catch{/* ignore */}

  const snap = readSnapshot() || {
    v:LS_VER, at:0,
    lists:{ [LIST_TYPES.SUPERMARKET]:[], [LIST_TYPES.ONLINE]:[] },
    stock:[], currentList: LIST_TYPES.SUPERMARKET
  };
  let stock = [...(snap.stock||[])];

  // applica scadenze
  let expHits=0;
  if (intent==='expiry' && expiries.length){
    stock = stock.map(s=>{
      const hit = expiries.find(e=> isSimilar(e.name,s.name) && e.expiresAt);
      return hit ? { ...s, expiresAt: toISO(hit.expiresAt) } : s;
    });
    expHits = expiries.length;
  }

  // applica aggiornamenti scorte
  let updHits=0;
  if (intent==='stock_update' && updates.length){
    const todayISO = new Date().toISOString().slice(0,10);
    for (const u of updates){
      const idx = stock.findIndex(s=> isSimilar(s.name, u.name));
      const asUnits = (String(u.mode||'').toLowerCase()==='units');
      if (idx>=0){
        const old = stock[idx];
        if (asUnits){
          const units = Math.max(0, Number(u.value||0));
          stock[idx] = { ...old, residueUnits: units };
        } else {
          const packs = Math.max(0, Number(u.value||0));
          const upp = Math.max(1, Number(old.unitsPerPack||1));
          stock[idx] = {
            ...old,
            packs,
            lastRestockAt: todayISO,
            baselinePacks: Math.max(Number(old.baselinePacks||0), packs),
            residueUnits: packs * upp
          };
        }
        updHits++;
      } else {
        // nuovo prodotto
        if (asUnits){
          const upp = Math.max(1, Number(u.value||1));
          stock.unshift({
            name: u.name, brand:'', packs:1, unitsPerPack: upp, unitLabel:'unità',
            expiresAt:'', baselinePacks:1, lastRestockAt: todayISO, avgDailyUnits:0, residueUnits: 1*upp
          });
        } else {
          const p = Math.max(1, Number(u.value||1));
          stock.unshift({
            name: u.name, brand:'', packs:p, unitsPerPack: 1, unitLabel:'unità',
            expiresAt:'', baselinePacks:p, lastRestockAt: todayISO, avgDailyUnits:0, residueUnits: p*1
          });
        }
        updHits++;
      }
    }
  }

  const nextDoc = writeSnapshot({
    lists: snap.lists, stock, currentList: snap.currentList
  });

  // cloud
  const { data: session } = await supabase.auth.getUser();
  const uid = session?.user?.id;
  if (CLOUD_SYNC && uid){
    try { await cloudSave(uid, nextDoc); } catch(e){ if (DEBUG) console.warn('cloudSave fail', e); }
  }

  return { ok:true, result:{ expiries:expHits, updates:updHits } };

  function toISO(any){
    const s = String(any||'').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m){
      const d = String(m[1]).padStart(2,'0');
      const M = String(m[2]).padStart(2,'0');
      let y = String(m[3]); if (y.length===2) y = (Number(y)>=70?'19':'20')+y;
      return `${y}-${M}-${d}`;
    }
    return '';
  }
}

/**
 * Query testuale (Home → “Quanto devo comprare oggi?” ecc.)
 * Ritorna un oggetto con risultato pronto da stampare.
 */
export async function runQueryFromTextLocal(text){
  const t = String(text||'').toLowerCase();
  const snap = readSnapshot() || { lists:{ [LIST_TYPES.SUPERMARKET]:[], [LIST_TYPES.ONLINE]:[] }, stock:[], currentList: LIST_TYPES.SUPERMARKET };

  // lista oggi
  if (/cosa\s+devo\s+comprare|lista\s+(di\s+)?oggi|cosa\s+compro/.test(t)){
    const cur = snap.currentList || LIST_TYPES.SUPERMARKET;
    const items = ensureArray(snap.lists?.[cur]).filter(i=>!i.purchased && i.qty>0);
    if (!items.length) return { ok:true, result:'La lista di oggi è vuota.' };
    const rows = items.map(i=>`• ${i.name}${i.brand?` (${i.brand})`:''} — ${i.qty} conf. × ${i.unitsPerPack} ${i.unitLabel||'unità'}`).join('\n');
    return { ok:true, result:`Ecco la lista di oggi:\n${rows}` };
  }

  // in esaurimento
  if (/in\s+esaurimento|quasi\s+finiti|scorte\s+basse/.test(t)){
    const res = [];
    for (const s of ensureArray(snap.stock)){
      const upp = Math.max(1, Number(s.unitsPerPack||1));
      const currentUnits = Number.isFinite(Number(s.residueUnits)) ? Math.max(0, Number(s.residueUnits)) : Math.max(0, Number(s.packs||0)*upp);
      const bp = Number(s.baselinePacks);
      const baselineUnits = Math.max(upp, (Number.isFinite(bp)&&bp>0 ? bp*upp : Number(s.packs||0)*upp));
      const pct = baselineUnits ? (currentUnits / baselineUnits) : 1;
      if (pct < 0.20) res.push({ name:s.name, currentUnits, baselineUnits });
    }
    if (!res.length) return { ok:true, result:'Nessun prodotto in esaurimento.' };
    return { ok:true, result: res.map(r=>`• ${r.name} — ${Math.round(r.currentUnits)}/${Math.round(r.baselineUnits)} unità`).join('\n') };
  }

  // scadenze entro 10 gg
  if (/in\s+scadenza|scadono|scadenze/.test(t)){
    const soon = ensureArray(snap.stock).filter(s=>{
      const d = s.expiresAt ? new Date(s.expiresAt) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      const days = Math.floor((d - new Date())/86400000);
      return days <= 10;
    });
    if (!soon.length) return { ok:true, result:'Nessun prodotto in scadenza entro 10 giorni.' };
    return { ok:true, result: soon.map(p=>`• ${p.name}${p.brand?` (${p.brand})`:''} — scade il ${new Date(p.expiresAt).toLocaleDateString('it-IT')}`).join('\n') };
  }

  // default: dump minimale
  return { ok:true, result:'Domanda non riconosciuta. Prova: "cosa devo comprare oggi", "prodotti in esaurimento", "scadenze".' };
}
