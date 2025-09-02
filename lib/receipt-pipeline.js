// lib/receipt-pipeline.js

// -------------------- fetch helpers --------------------
async function tfetch(url, opts = {}, ms = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}
async function readJson(r) {
  const ct = (r.headers?.get?.('content-type') || '').toLowerCase();
  const raw = await r.text?.() || '';
  if (!raw.trim()) return {};
  if (ct.includes('application/json')) { try { return JSON.parse(raw); } catch { return { data: raw }; } }
  try { return JSON.parse(raw); } catch { return { data: raw }; }
}

// -------------------- small utils --------------------
export function normKey(str=''){
  return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,' ').replace(/\s{2,}/g,' ').trim();
}
export function productKey(name='', brand=''){ return `${normKey(name)}|${normKey(brand)}`; }

export function normalizeUnitLabel(lbl=''){
  const s = normKey(lbl);
  if (/bottigl/.test(s)) return 'bottiglie';
  if (/(?:pz|pezz|unit\b|unita?)/.test(s)) return 'pezzi';
  if (/bust/.test(s)) return 'buste';
  if (/lattin/.test(s)) return 'lattine';
  if (/vasett/.test(s)) return 'vasetti';
  if (/barattol/.test(s)) return 'barattoli';
  if (/vaschett/.test(s)) return 'vaschette';
  if (/rotol/.test(s)) return 'rotoli';
  if (/capsul/.test(s)) return 'capsule';
  if (/uova/.test(s)) return 'uova';
  return 'unità';
}
export function toISODate(any) {
  const s = String(any||'').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m){
    const d=m[1].padStart(2,'0'); const M=m[2].padStart(2,'0'); let y=m[3];
    if (y.length===2) y=(Number(y)>=70?'19':'20')+y; return `${y}-${M}-${d}`;
  }
  return '';
}

// -------------------- Vision prompt --------------------
export function buildVisionReceiptPrompt(){
  return [
    'Sei Jarvis. Ti do 1 immagine (scontrino). Estrai SOLO JSON:',
    '{ "store":"", "purchaseDate":"YYYY-MM-DD",',
    '  "purchases":[{"name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"",',
    '               "priceEach":0,"priceTotal":0,"currency":"EUR","expiresAt":""}] }',
    'Regole:',
    '- Se la stessa riga appare più volte → packs = numero di occorrenze.',
    '- NON usare pesi/volumi (500g, 1L, 38 lavaggi) come quantità.',
    '- Quantità solo se pattern espliciti: (x2), 2x6, "2 conf da 6", "6 bottiglie"/"6 uova".',
    '- priceEach/priceTotal in EUR; purchaseDate dalla testata o da Data/Ora.'
  ].join('\n');
}

// -------------------- name→quantities heuristics --------------------
export function inferQuantitiesFromName(name=''){
  let packs = 0, upp = 0, unitLabel = '';
  const x = name.match(/\(x(\d+)\)/i);
  if (x) packs = Math.max(packs, parseInt(x[1],10));
  const mCombo = name.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (mCombo){ packs=Math.max(packs, parseInt(mCombo[1],10)); upp=Math.max(upp, parseInt(mCombo[2],10)); }
  const mUnits = name.match(/\b(\d+)\s*(pz|pezzi|capsule|bottiglie|uova|rotoli|lattine|vasetti)\b/i);
  if (mUnits){ upp=Math.max(upp, parseInt(mUnits[1],10)); unitLabel = normalizeUnitLabel(mUnits[2]); }
  return { packs, upp, unitLabel };
}

// -------------------- merge & massage --------------------
export function mergeAndCanonizePurchases(items = []){
  const map = new Map();
  for (const p of items){
    const name = String(p.name||'').trim();
    const brand= String(p.brand||'').trim();
    const upp  = Math.max(1, Number(p.unitsPerPack||1));
    const key = `${productKey(name, brand)}|${upp}`;
    const prev = map.get(key) || { ...p, packs:0, priceTotal:0, unitsPerPack: upp, unitLabel: p.unitLabel || (upp>1?'pezzi':'unità') };
    prev.packs += Math.max(1, Number(p.packs||1));
    prev.priceTotal += Number(p.priceTotal||0);
    prev.unitLabel = normalizeUnitLabel(prev.unitLabel);
    map.set(key, prev);
  }
  return [...map.values()];
}

export function massageVisionPurchases(list = []){
  const out = [];
  for (const p of (Array.isArray(list)?list:[])){
    let name = String(p?.name||'').trim();
    let brand = String(p?.brand||'').trim();

    const implied = inferQuantitiesFromName(name);
    if (implied.packs) name = name.replace(/\(x\d+\)/i,'').trim();

    let packs = Math.max(1, Number(p?.packs || implied.packs || 1));
    let upp   = Math.max(1, Number(p?.unitsPerPack || implied.upp || 1));
    let label = normalizeUnitLabel(p?.unitLabel || implied.unitLabel || (upp>1?'pezzi':'unità'));

    if (/uova/i.test(name) && upp === 1 && /\b6\b/.test(name)) { upp = 6; label = 'uova'; }

    const priceEach  = Number(String(p?.priceEach ?? 0).replace(',','.')) || 0;
    const priceTotal = Number(String(p?.priceTotal ?? 0).replace(',','.')) || (priceEach * packs);

    out.push({ name, brand, packs, unitsPerPack: upp, unitLabel: label, priceEach, priceTotal, currency:'EUR', expiresAt: toISODate(p?.expiresAt || '') });
  }
  return mergeAndCanonizePurchases(out);
}

// -------------------- calls --------------------
export async function callVisionEndpoint(file){
  const fd = new FormData();
  fd.append('image', file, file.name || 'receipt.jpg');
  fd.append('prompt', buildVisionReceiptPrompt());
  const r = await tfetch('/api/assistant/vision', { method:'POST', body: fd }, 60000);
  const safe = await readJson(r);
  const ans = safe?.answer || safe?.data || safe;
  try { return typeof ans === 'string' ? JSON.parse(ans) : ans; } catch { return null; }
}
export async function callOcrTextEndpoint(file){
  const fd = new FormData();
  fd.append('images', file, file.name || 'receipt.jpg');
  const r = await tfetch('/api/ocr', { method:'POST', body: fd }, 45000);
  const safe = await readJson(r);
  return { text: safe?.text || '' };
}

// -------------------- high level (files -> {meta, purchases}) --------------------
export async function visionFirstParseFromFiles(files){
  const list = Array.from(files||[]);
  if (!list.length) return { meta:{}, purchases: [] };
  const first = list[0];

  let vision = null;
  try { vision = await callVisionEndpoint(first); } catch {}
  if (vision && Array.isArray(vision.purchases) && vision.purchases.length){
    return {
      meta: { store: String(vision.store||'').trim(), purchaseDate: toISODate(vision.purchaseDate||'') },
      purchases: massageVisionPurchases(vision.purchases)
    };
  }

  const ocr = await callOcrTextEndpoint(first);
  const text = String(ocr.text||'').trim();
  if (!text) return { meta:{}, purchases: [] };

  // very naive fallback (you puoi sostituirlo col tuo parseReceiptPurchases)
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const naive = [];
  for (const ln of lines){
    const m = ln.match(/^(.+?)\s+(\d+[.,]\d{2})$/);
    if (m){ naive.push({ name:m[1], brand:'', packs:1, unitsPerPack:1, unitLabel:'unità', priceEach:Number(m[2].replace(',','.')), priceTotal:Number(m[2].replace(',','.')), currency:'EUR', expiresAt:'' }); }
  }
  return { meta:{}, purchases: mergeAndCanonizePurchases(naive) };
}

// -------------------- enrichment via web (server endpoint) --------------------
export async function enrichPurchasesViaWeb(purchases = []){
  const out = [];
  for (const p of purchases){
    const needsUPP = !p.unitsPerPack || p.unitsPerPack <= 1;
    const body = JSON.stringify({ name: p.name, brand: p.brand, needsUPP });
    try {
      const r = await tfetch('/api/products/enrich', { method:'POST', headers:{'Content-Type':'application/json'}, body }, 35000);
      const ans = await readJson(r);
      if (ans?.best && ans.best.confidence >= 0.65){
        const upp = Math.max(1, Number(ans.best.unitsPerPack||1));
        const label = normalizeUnitLabel(ans.best.unitLabel || (upp>1?'pezzi':'unità'));
        out.push({ ...p, unitsPerPack: upp, unitLabel: label });
        continue;
      }
    } catch {}
    out.push(p);
  }
  return mergeAndCanonizePurchases(out);
}
