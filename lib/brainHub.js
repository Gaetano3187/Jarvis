
// /lib/brainHub.js
// Router d’intenti unico per la Home (testo+voce+OCR).
// - Comprensione "elastica" con prompt strutturati → /api/assistant
// - Fallback locali robusti se l'assistant non risponde in JSON
// - Integra categorie via UUID (category_id) e collega liste/scorte tramite jarvisBrain

import { supabase } from '@/lib/supabaseClient';

/* --------------------------- Mappa categorie (dai tuoi file) --------------------------- */
const CATEGORY_IDS = {
  'spese-casa':       '4cfaac74-aab4-4d96-b335-6cc64de59afc',
  'vestiti-ed-altro': '89e223d4-1ec0-4631-b0d4-52472579a04a',
  'cene-aperitivi':   '0f8eb04a-8a1a-4899-9f29-236a5be7e9db',
  'varie':            '075ce548-15a9-467c-afc8-8b156064eeb6',
};
const CATEGORY_SLUGS = {
  CASA:   'spese-casa',
  VESTITI:'vestiti-ed-altro',
  CENE:   'cene-aperitivi',
  VARIE:  'varie'
};

/* --------------------------- Utils di data/numero --------------------------- */
function isoLocal(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function monthRange(d=new Date()){
  const y=d.getFullYear(), m=d.getMonth();
  return { start: isoLocal(new Date(y,m,1)), end: isoLocal(new Date(y,m+1,0)) };
}
function parseAmountLoose(v){
  if(typeof v==='number') return v;
  const s=String(v??'').trim().replace(/\s/g,'').replace(/\./g,'').replace(',', '.');
  const n=Number(s); return Number.isFinite(n)?n:0;
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

/* --------------------------- Login utente --------------------------- */
async function requireUser(){
  const { data:{ user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Sessione scaduta');
  return user;
}

/* --------------------------- Lessico/metodi --------------------------- */
const ELECTRONIC_TOKENS = ['carta','carta di credito','credito','debito','pos','visa','mastercard','amex','paypal','iban','bonifico','satispay','apple pay','google pay'];
const WORD2NUM = { uno:1, una:1, due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7, otto:8, nove:9, dieci:10, undici:11, dodici:12 };

function detectPaymentMethod(desc){
  const t=(desc||'').toLowerCase();
  return ELECTRONIC_TOKENS.some(k=>t.includes(k)) ? 'card' : 'cash';
}

function categorizeExpense(text){
  const t=(text||'').toLowerCase();
  const home = /\b(supermercat|coop|conad|esselunga|iper|carrefour|eurospin|md|lidl|market|spesa|detersiv|bollett|enel|gas|acqua|internet|telefono|manutenz|ferrament|arred|casa|elettrodom|utenza|lavatrice|tariffa)\b/.test(t);
  const clothes = /\b(pantalon|jeans|magliett|felp|scarpe|giubbott|cappott|vestit[oi]|borsa|cintur|intim|calzini|tuta|camicia|gonna)\b/.test(t);
  const dining = /\b(pizza|ristorant|trattori|bar\b|aperitiv|cena|pranzo|pasticcer|pub|sush|kebab|panin|caff[eè]|\bdrink\b|cocktail)\b/.test(t);
  if (home) return CATEGORY_SLUGS.CASA;
  if (clothes) return CATEGORY_SLUGS.VESTITI;
  if (dining) return CATEGORY_SLUGS.CENE;
  return CATEGORY_SLUGS.VARIE;
}

/* --------------------------- Query finanze --------------------------- */
async function sumFinancesBetween(userId, startISO, endISO){
  const { data, error } = await supabase
    .from('finances').select('amount')
    .eq('user_id', userId)
    .gte('spent_date', startISO)
    .lte('spent_date', endISO);
  if (error) throw error;
  return (data||[]).reduce((t,r)=>t + Math.abs(Number(r.amount||0)), 0);
}
async function sumCategoryBetween(userId, categorySlug, startISO, endISO){
  const catId = CATEGORY_IDS[categorySlug] || null;
  const base = supabase.from('finances').select('amount').eq('user_id', userId)
    .gte('spent_date', startISO).lte('spent_date', endISO);
  const query = catId ? base.eq('category_id', catId) : base.eq('category_slug', categorySlug);
  const { data, error } = await query;
  if (error) throw error;
  return (data||[]).reduce((t,r)=>t + Math.abs(Number(r.amount||0)), 0);
}
async function lastIncomes(userId, n=10){
  const { data, error } = await supabase
    .from('incomes')
    .select('source, description, amount, received_date, received_at')
    .eq('user_id', userId)
    .order('received_at', { ascending:false, nullsFirst:false })
    .order('received_date', { ascending:false, nullsFirst:false })
    .limit(n);
  if (error) throw error;
  return data||[];
}
async function computeDisponibileETasca(userId, periodStart, periodEnd){
  const { data: inc } = await supabase
    .from('incomes').select('amount')
    .eq('user_id', userId).gte('received_date', periodStart).lte('received_date', periodEnd);
  const entratePeriodo = (inc||[]).reduce((t,r)=>t+Number(r.amount||0),0);

  const { data: co } = await supabase
    .from('carryovers').select('amount')
    .eq('user_id', userId).eq('month_key', periodEnd.slice(0,7)).maybeSingle();
  const carryover = Number(co?.amount||0);

  const { data: pc } = await supabase
    .from('pocket_cash').select('delta, amount, direction')
    .eq('user_id', userId).gte('moved_date', periodStart).lte('moved_date', periodEnd);
  const pocketRows = (pc||[]).map(r => r.delta!=null ? Number(r.delta||0) : r.amount!=null ? (r.direction==='in'?+1:-1)*Number(r.amount||0) : 0);
  const prelievi = pocketRows.filter(x=>x>0).reduce((t,x)=>t+x,0);
  const pocketBalance = pocketRows.reduce((t,x)=>t+x,0);

  const { data: finAll } = await supabase
    .from('finances').select('description, amount, payment_method')
    .eq('user_id', userId).gte('spent_date', periodStart).lte('spent_date', periodEnd);
  const isElectronicByText = (d)=> ELECTRONIC_TOKENS.some(k=>String(d||'').toLowerCase().includes(k));
  const isCashByFields = (row)=>{
    const pm = String(row.payment_method||'').toLowerCase();
    if (pm==='cash'||pm==='contanti') return true;
    if (pm && pm!=='cash' && pm!=='contanti') return false;
    return !isElectronicByText(row.description);
  };
  const spesePeriodo = (finAll||[]).filter(isCashByFields).reduce((t,r)=>t+Math.abs(Number(r.amount||0)),0);

  const saldoDisponibile = Math.max(0, entratePeriodo + carryover - prelievi);
  return { entratePeriodo, carryover, pocketBalance, spesePeriodo, saldoDisponibile };
}

/* --------------------------- Bridge col "brain" liste/scorte --------------------------- */
function getBrain(){
  if (typeof window === 'undefined') return null;
  return window.jarvisBrain || window.__jarvisBrainHub || null;
}

/* --------------------------- NLU via Assistant --------------------------- */
async function callAssistantJSON(prompt, { timeoutMs=25000 } = {}){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: ctrl.signal
    });
    const { answer, error: apiErr } = await res.json();
    if (!res.ok || apiErr) throw new Error(apiErr || String(res.status));
    const trimmed = String(answer||'').trim();
    // Tieni solo il JSON (alcuni modelli aggiungono testo prima/dopo)
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd   = trimmed.lastIndexOf('}');
    const slice = jsonStart>=0 && jsonEnd>=jsonStart ? trimmed.slice(jsonStart, jsonEnd+1) : trimmed;
    return JSON.parse(slice);
  } finally {
    clearTimeout(timer);
  }
}

/* ========= PROMPT: comprensione comandi naturali (elastico ma preciso) ========= */
function buildNLUPrompt(userText){
  // Nota: elenco intenti ben definiti + schema JSON rigido.
  return [
    'Sei Jarvis, un parser NLU. Leggi un comando in italiano e restituisci SOLO JSON VALIDO.',
    'SCHEMA UNICO (proprietà opzionali per intenti diversi):',
    '{',
    '  "intent": "expense_add | list_add | list_mark_bought | stock_update | expiry_set | query_spending_month | query_spending_category_recent_months | query_balance | query_pocket | query_last_incomes | query_list_today | query_stock_low | query_expiring | query_days_to_depletion | receipt_voice | query_expiry",',
    '  "amount": 0,                // per expense_add',
    '  "description": "",          // per expense_add (testo originale o pulito)',
    '  "payment_method": "cash|card|",',
    '  "category_suggestion": "spese-casa|vestiti-ed-altro|cene-aperitivi|varie|",',
    '  "months": 2,                // per query_spending_category_recent_months',
    '  "category": "cene-aperitivi|spese-casa|vestiti-ed-altro|varie|",',
    '  "items": [                  // per list_add / receipt_voice',
    '     { "name":"latte", "qty":2, "mode":"packs|units", "unitLabel":"bottiglie|unità|vasetti|...", "brand":"" }',
    '  ],',
    '  "updates": [                // per stock_update',
    '     { "name":"latte", "value":3, "mode":"packs|units" }',
    '  ],',
    '  "expiries": [               // per expiry_set',
    '     { "name":"latte", "expiresAt":"YYYY-MM-DD" }',
    '  ],',
    '  "product": "latte",         // per query_expiry o query_days_to_depletion',
    '  "listType": "supermercato|online|"',
    '}',
    '',
    'REGOLE:',
    '- Sii TOLLERANTE: supporta forme come "2 pacchi", "3 bottiglie", "4 unità", numeri in lettere ("due", "tre").',
    '- NON scrivere testo fuori dal JSON, niente spiegazioni.',
    '- Non inventare importi: se non è chiaro, ometti "amount".',
    '- category_suggestion: prova a inferire tra: spese-casa, vestiti-ed-altro, cene-aperitivi, varie.',
    '- listType default: "supermercato" se non specificato.',
    '- Esempi:',
    '  "aggiungi 2 pacchi di pasta barilla alla lista": { "intent":"list_add", "listType":"supermercato", "items":[{"name":"pasta","qty":2,"mode":"packs","unitLabel":"unità","brand":"barilla"}] }',
    '  "metti latte 3 bottiglie in lista": { "intent":"list_add", "items":[{"name":"latte","qty":3,"mode":"packs","unitLabel":"bottiglie"}] }',
    '  "segna comprata la pasta (2 pacchi)": { "intent":"list_mark_bought", "items":[{"name":"pasta","qty":2}] }',
    '  "latte 3 bottiglie, yogurt 4 vasetti": { "intent":"stock_update", "updates":[{"name":"latte","value":3,"mode":"packs"},{"name":"yogurt","value":4,"mode":"units"}] }',
    '  "il latte scade il 12/09/2025": { "intent":"expiry_set", "expiries":[{"name":"latte","expiresAt":"2025-09-12"}] }',
    '  "quando scade il latte?": { "intent":"query_expiry", "product":"latte" }',
    '  "quanto ho speso questo mese": { "intent":"query_spending_month" }',
    '  "quanto ho speso di cene negli ultimi due mesi": { "intent":"query_spending_category_recent_months", "category":"cene-aperitivi", "months":2 }',
    '  "quanto ho in tasca / saldo disponibile": { "intent":"query_balance" }',
    '  "ultimi dieci incassi": { "intent":"query_last_incomes" }',
    '  "cosa devo comprare oggi / lista di oggi": { "intent":"query_list_today" }',
    '  "prodotti in esaurimento": { "intent":"query_stock_low" }',
    '  "prodotti in scadenza (entro 7 giorni)": { "intent":"query_expiring", "days":7 }',
    '  "scontrino a voce: latte 2 bottiglie, pasta 3 pacchi": { "intent":"receipt_voice", "items":[... come sopra ...] }',
    '',
    'TESTO UTENTE:',
    userText
  ].join('\n');
}

/* --------------------------- Heuristics (fallback locale) --------------------------- */
function wordOrNumber(s){
  const t = String(s||'').toLowerCase().trim();
  if (WORD2NUM[t]!=null) return WORD2NUM[t];
  const m=t.match(/(\d+(?:[.,]\d+)?)/); return m?Number(String(m[1]).replace(',','.')):null;
}
function guessMonths(t){ const m=t.match(/ultim[ei]\s+(\d+|due|tre|quattro|cinque)\s+mes/i); return m? clamp(wordOrNumber(m[1])||2,1,24):null; }
function inferProductName(text){
  const t=(text||'').toLowerCase();
  const LEX=['latte','yogurt','pasta','pane','uova','burro','mozzarella','riso','acqua','olio','zucchero','farina','caffè','caffe','tonno','biscotti','detersivo','scottex','carta igienica','pomodori','insalata','mele','banane'];
  let best=''; let bestLen=0;
  for (const w of LEX){ if (t.includes(w) && w.length>bestLen){ best=w; bestLen=w.length; } }
  if (best) return best;
  return t.split(/\s+/)[0] || 'prodotto';
}
function splitVoiceItems(text){
  return String(text||'').toLowerCase().split(/\s*(?:,| e | più | poi )\s*/g).map(s=>s.trim()).filter(Boolean);
}
function parseUnitsHint(chunk){
  const c = chunk.toLowerCase();
  if (/bottigl/.test(c)) return { unitLabel:'bottiglie', mode:'packs' };
  if (/pacch|conf|scatol/.test(c)) return { unitLabel:'unità', mode:'packs' };
  if (/unit|pz|pezzi|vasett|uova|barrett|merendine|bustin|monouso/.test(c)) return { unitLabel:'unità', mode:'units' };
  return { unitLabel:'unità', mode:'packs' };
}

/* --------------------------- Azioni DB e Brain --------------------------- */
async function ingestTextExpense(text){
  const user = await requireUser();
  const m = String(text||'').match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(€|euro)?/i);
  const amount = m ? parseAmountLoose(m[1]) : null;

  const category_slug = categorizeExpense(text);
  const category_id = CATEGORY_IDS[category_slug] || null;
  const payment_method = detectPaymentMethod(text);
  const description = text.charAt(0).toUpperCase() + text.slice(1);
  const spent_date = isoLocal(new Date());

  if (amount == null) {
    return { ok:false, result:'Dimmi anche l’importo (es. "pantaloni 39,90€") così registro la spesa.' };
  }

  const payload = {
    user_id: user.id,
    description,
    amount,
    spent_date,
    spent_at: `${spent_date}T12:00:00`,
    payment_method,
    category_slug,
    category_id
  };
  const { error } = await supabase.from('finances').insert(payload);
  if (error) throw error;

  return { ok:true, result:`✅ Spesa registrata in "${category_slug}".` };
}

async function addItemsToList(items, listType='supermercato'){
  const hb = getBrain();
  if (!hb?.run) return 'Apri "Liste Prodotti" per collegare le liste.';
  let added=0;
  for (const it of (items||[])){
    const name = it.name || inferProductName('');
    const qty = clamp(Number(it.qty||1),1,999);
    const hint = parseUnitsHint(`${it.unitLabel||''} ${it.mode||''}`);
    const packs = (it.mode==='units') ? 1 : qty;
    const unitsPerPack = (it.mode==='units') ? qty : 1;
    await hb.run('aggiungi-alla-lista', {
      name,
      brand: it.brand || '',
      packs,
      unitsPerPack,
      unitLabel: it.unitLabel || hint.unitLabel,
      listType,
      category: 'spese-casa', // categorizza nel carrello
    });
    added++;
  }
  return `Aggiunti ${added} elemento/i alla lista ${listType}.`;
}

async function markBoughtFromList(items, listType){
  const hb = getBrain();
  if (!hb?.run) return 'Apri "Liste Prodotti" per collegare le liste.';
  const it = (items && items[0]) || null;
  if (!it) return 'Specifica cosa segnare come comprato.';
  const amount = clamp(Number(it.qty||1),1,999);
  const res = await hb.run('segna-comprato', { name: it.name || inferProductName(''), amount, listType });
  return res || `Segnato "${it.name}" come comprato.`;
}

async function updateStock(updates){
  const hb = getBrain();
  if (!hb?.run) return 'Apri "Liste Prodotti" per collegare le scorte.';
  // Passo l’input naturale ricostruito (funzione del brain già robusta)
  const rebuilt = (updates||[]).map(u=>{
    const label = u.mode==='units' ? 'unità' : 'pacchi';
    return `${u.name} ${u.value} ${label}`;
  }).join(', ');
  return hb.run('aggiorna-scorte', rebuilt);
}

async function setExpiries(expiries){
  const hb = getBrain();
  if (!hb?.run) return 'Apri "Liste Prodotti" per collegare le scadenze.';
  const line = (expiries||[]).map(e=>`${e.name} scade il ${e.expiresAt}`).join(', ');
  return hb.run('imposta-scadenze', line);
}

async function queryExpiry(product){
  const hb = getBrain();
  if (!hb?.ask) return 'Apri "Liste Prodotti" per leggere le scadenze.';
  const stock = await hb.ask('scorte-complete');
  if (!stock?.length) return `Non trovo scorte.`;
  const hit = stock.find(s => s.name && product && s.name.toLowerCase().includes(product.toLowerCase()));
  if (!hit) return `Non trovo "${product}" nelle scorte.`;
  if (!hit.expiresAt) return `Per "${hit.name}" non ho una data di scadenza registrata.`;
  const d = new Date(hit.expiresAt);
  return `La scadenza di "${hit.name}" è ${isNaN(d)? hit.expiresAt : d.toLocaleDateString('it-IT')}.`;
}

async function verifyItemsAgainstStock(items){
  const hb = getBrain();
  if (!hb?.ask) return 'Apri "Liste Prodotti" per verificare le scorte.';
  const stock = await hb.ask('scorte-complete');
  const isSimilar = (a,b)=>{
    const na=String(a||'').toLowerCase(); const nb=String(b||'').toLowerCase();
    return nb.includes(na) || na.includes(nb);
  };
  const lines = (items||[]).map(it=>{
    const hit = (stock||[]).find(s=> isSimilar(s.name, it.name));
    return `• ${it.name} — ${hit ? '✅ Presente in scorte' : '❌ Non presente in scorte'}`;
  });
  return `Verifica scorte:\n${lines.join('\n')}`;
}

/* --------------------------- OCR ingest --------------------------- */

e// /lib/brainHub.js  —— sostituisci SOLO questa funzione + helper b64ToBlob

export async function ingestOCRLocal({ file, files, base64 } = {}) {
  // Normalizza files: FileList → Array<File>
  let pick = [];
  if (files) {
    if (Array.isArray(files)) pick = files.filter(Boolean);
    else if (typeof files.length === 'number') pick = Array.from(files);
  }
  if (!pick.length && file) pick = [file];

  // Se non ho nessun file, prova base64 → Blob
  if (!pick.length && base64) {
    const blob = b64ToBlob(base64, 'image/jpeg');
    pick = [new File([blob], 'ocr.jpg', { type: 'image/jpeg' })];
  }

  if (!pick.length) {
    throw new Error('OCR: nessun file/immagine valido.');
  }

  // 1) Prepara FormData per /api/ocr
  const fd = new FormData();
  for (const f of pick) {
    // check robusto (Safari/realms diversi possono rompere instanceof)
    const isFileLike = f && typeof f === 'object' && ('size' in f) && ('type' in f);
    if (!isFileLike) continue;
    fd.append('images', f);
  }
  if (![...fd.keys()].length) {
    throw new Error('OCR: i dati selezionati non sono file validi.');
  }

  // 2) Chiamata OCR
  const ocrRes = await fetch('/api/ocr', { method: 'POST', body: fd });
  const ocrJson = await ocrRes.json().catch(() => ({}));
  if (!ocrRes.ok || ocrJson?.error) {
    const msg = ocrJson?.error || `OCR HTTP ${ocrRes.status}`;
    throw new Error(msg);
  }

  const ocrText = String(ocrJson?.text || '').trim();
  if (!ocrText) throw new Error('OCR: risposta vuota.');

  // 3) Trova “TOTALE” e inserisci su finances (Spese Casa)
  const lines = ocrText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const totalLine = lines.find(l => /totale/i.test(l));
  const mm = totalLine?.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/);
  const amount = mm ? parseAmountLoose(mm[1]) : null;

  if (amount != null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sessione scaduta');

    const spent_date = isoLocal(new Date());
    const payload = {
      user_id: user.id,
      description: 'Scontrino supermercato (OCR)',
      amount,
      spent_date,
      spent_at: `${spent_date}T12:00:00Z`, // coerente con spese-casa.js
      payment_method: 'cash',
      category_slug: 'spese-casa',
      category_id: CATEGORY_IDS['spese-casa'] || null
    };
    const { error: dbErr } = await supabase.from('finances').insert(payload);
    if (dbErr) throw new Error(dbErr.message || 'Insert fallito su finances');
  }

  // 4) (Opz.) popola lista supermercato con pochi item riconosciuti
  const hb = (typeof window !== 'undefined') ? (window.jarvisBrain || window.__jarvisBrainHub) : null;
  if (hb?.run) {
    const picks = lines
      .filter(l => !/totale|iva|bancomat|contanti|resto|scontrino|cassa|cliente|sconto|subtotale|pagato|euro/i.test(l))
      .filter(l => /\b(latte|yogurt|pasta|pane|uova|burro|mozzarella|riso|olio|zucchero|farina|acqua|biscott|tonno|detersiv|scottex|carta igienica|pomodori|insalata|mele|banane)\b/i.test(l))
      .slice(0, 8);

    for (const line of picks) {
      const name = inferProductName(line);
      await hb.run('aggiungi-alla-lista', {
        name, packs: 1, unitsPerPack: 1, unitLabel: 'unità',
        listType: 'supermercato', category: 'spese-casa'
      });
    }
  }

  return { ok: true, result: '✅ Scontrino riconosciuto e registrato su Spese Casa.' };
}

function b64ToBlob(b64, mime='application/octet-stream'){
  // lato browser va bene atob; se un giorno lo usi server-side, cambia in Buffer.from
  const byteString = atob(b64);
  const bytes = new Uint8Array(byteString.length);
  for (let i=0; i<byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}



/* --------------------------- Router principale (testo+voce) --------------------------- */
export async function runQueryFromTextLocal(text, { first=false } = {}){
  const raw = String(text||'').trim();
  if (!raw) return { ok:false, result:'Dimmi cosa vuoi sapere o registrare.' };

  // 1) Prova NLU via assistant (ampio ma preciso)
  let nlu = null;
  try {
    nlu = await callAssistantJSON(buildNLUPrompt(raw));
  } catch { /* silent fallback */ }

  const { start, end } = monthRange(new Date());
  const t = raw.toLowerCase();

  // 2) Se il NLU ha capito l’intento → esegui
  if (nlu && nlu.intent){
    try {
      switch(nlu.intent){
        case 'expense_add': {
          const amount = (nlu.amount!=null)? Number(nlu.amount) : null;
          const desc   = nlu.description || raw;
          const pm     = nlu.payment_method || detectPaymentMethod(desc);
          const catS   = nlu.category_suggestion || categorizeExpense(desc);
          const catId  = CATEGORY_IDS[catS] || null;
          if (amount==null || !Number.isFinite(amount)) {
            return { ok:false, result:'Dimmi anche l’importo (es. "39,90€").' };
          }
          const user = await requireUser();
          const spent_date = isoLocal(new Date());
          const payload = {
            user_id: user.id,
            description: desc,
            amount,
            spent_date,
            spent_at: `${spent_date}T12:00:00`,
            payment_method: pm,
            category_slug: catS,
            category_id: catId
          };
          const { error } = await supabase.from('finances').insert(payload);
          if (error) throw error;
          return { ok:true, result:`✅ Spesa registrata in "${catS}".` };
        }

        case 'list_add': {
          const listType = nlu.listType || 'supermercato';
          return { ok:true, result: await addItemsToList(nlu.items||[], listType) };
        }

        case 'list_mark_bought': {
          return { ok:true, result: await markBoughtFromList(nlu.items||[], nlu.listType) };
        }

        case 'stock_update': {
          return { ok:true, result: await updateStock(nlu.updates||[]) };
        }

        case 'expiry_set': {
          return { ok:true, result: await setExpiries(nlu.expiries||[]) };
        }

        case 'query_expiry': {
          const prod = nlu.product || inferProductName(raw);
          return { ok:true, result: await queryExpiry(prod) };
        }

        case 'query_spending_month': {
          const user = await requireUser();
          const total = await sumFinancesBetween(user.id, start, end);
          return { ok:true, result:`Hai speso € ${total.toFixed(2)} nel mese corrente.` };
        }

        case 'query_spending_category_recent_months': {
          const months = clamp(Number(nlu.months||2), 1, 24);
          const cat = nlu.category || CATEGORY_SLUGS.CENE;
          const user = await requireUser();
          let sum=0; const now=new Date();
          for (let i=0;i<months;i++){
            const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
            const mr=monthRange(d);
            sum += await sumCategoryBetween(user.id, cat, mr.start, mr.end);
          }
          return { ok:true, result:`Spesa ${cat.replace('-',' ')} negli ultimi ${months} mesi: € ${sum.toFixed(2)}.` };
        }

        case 'query_balance': {
          const user = await requireUser();
          const s = await computeDisponibileETasca(user.id, start, end);
          return { ok:true, result: `Saldo disponibile: € ${s.saldoDisponibile.toFixed(2)} • Soldi in tasca: € ${s.pocketBalance.toFixed(2)}.` };
        }

        case 'query_pocket': {
          const user = await requireUser();
          const s = await computeDisponibileETasca(user.id, start, end);
          return { ok:true, result: `Soldi in tasca: € ${s.pocketBalance.toFixed(2)}.` };
        }

        case 'query_last_incomes': {
          const user = await requireUser();
          const rows = await lastIncomes(user.id, 10);
          if (!rows.length) return { ok:true, result:'Nessun incasso trovato.' };
          const lines = rows.map(r=>{
            const d = r.received_date || String(r.received_at||'').slice(0,10);
            return `• ${new Date(d).toLocaleDateString('it-IT')} — ${r.description||r.source||'Entrata'}: € ${Number(r.amount).toFixed(2)}`;
          }).join('\n');
          return { ok:true, result:`Ultimi 10 incassi:\n${lines}` };
        }

        case 'query_list_today': {
          const hb = getBrain();
          if (!hb?.ask) return { ok:false, result:'Apri "Liste Prodotti" per leggere la lista.' };
          const items = await hb.ask('lista-oggi');
          if (!items?.length) return { ok:true, result:'La lista di oggi è vuota.' };
          const rows = items.map(i => `• ${i.name}${i.brand?` (${i.brand})`:''} — ${i.qty} conf. × ${i.unitsPerPack} ${i.unitLabel}`).join('\n');
          return { ok:true, result:`Ecco la lista di oggi:\n${rows}` };
        }

        case 'query_stock_low': {
          const hb = getBrain();
          if (!hb?.ask) return { ok:false, result:'Apri "Liste Prodotti" per consultare le scorte.' };
          const crit = await hb.ask('scorte-esaurimento');
          if (!crit?.length) return { ok:true, result:'Nessun prodotto in esaurimento.' };
          const residueInfo = (s)=>{
            const upp = Math.max(1, Number(s.unitsPerPack||1));
            const current = Number.isFinite(Number(s.residueUnits)) ? Math.max(0, Number(s.residueUnits)) : Math.max(0, Number(s.packs||0)*upp);
            const baseline = Math.max(upp, (Number(s.baselineUnits)||Number(s.packs||0)*upp));
            return { current, baseline };
          };
          const lines = crit.map(p=> {
            const { current, baseline } = residueInfo(p);
            const pct = baseline? Math.round((current/ baseline)*100):0;
            return `• ${p.name}${p.brand?` (${p.brand})`:''} — ${Math.round(current)}/${Math.round(baseline)} unità (${pct}%)`;
          }).join('\n');
          return { ok:true, result:`Prodotti in esaurimento:\n${lines}` };
        }

        case 'query_expiring': {
          const hb = getBrain();
          if (!hb?.ask) return { ok:false, result:'Apri "Liste Prodotti" per consultare le scadenze.' };
          const entro = clamp(Number(nlu.days||10),1,90);
          const exp = await hb.ask('scorte-scadenza', { entroGiorni: entro });
          if (!exp?.length) return { ok:true, result:`Nessun prodotto in scadenza entro ${entro} giorni.` };
          const lines = exp.map(p => `• ${p.name}${p.brand?` (${p.brand})`:''} — scade il ${new Date(p.expiresAt).toLocaleDateString('it-IT')}`).join('\n');
          return { ok:true, result:`Prodotti in scadenza entro ${entro} giorni:\n${lines}` };
        }

        case 'query_days_to_depletion': {
          const hb = getBrain();
          if (!hb?.ask) return { ok:false, result:'Apri "Liste Prodotti" per stimare i giorni.' };
          const all = await hb.ask('scorte-giorni-esaurimento');
          const prod = nlu.product || inferProductName(raw);
          const hit = (all||[]).find(p => p.name && prod && p.name.toLowerCase().includes(prod.toLowerCase()));
          if (!hit) return { ok:true, result:`Non trovo "${prod}" fra le scorte.` };
          if (hit.daysToDepletion == null) return { ok:true, result:`Non ho abbastanza dati per stimare i giorni per "${hit.name}".` };
          return { ok:true, result:`Per ${hit.name} mancano circa ${hit.daysToDepletion} giorni all’esaurimento.` };
        }

        case 'receipt_voice': {
          // Verifica scorte + aggiungi a lista supermercato
          const items = nlu.items || [];
          let report = await verifyItemsAgainstStock(items);
          const addMsg = await addItemsToList(items, 'supermercato');
          report += `\n\n${addMsg}`;
          return { ok:true, result: report };
        }

        default:
          // Non riconosciuto → vai a fallback
          break;
      }
    } catch (err){
      console.error('[NLU dispatch error]', err);
      // continua ai fallback
    }
  }

  // 3) Fallback locale (regex euristici) — copre i casi principali senza NLU
  // 3.1 Lista (aggiungi … in lista)
  if (/(aggiung[ei]|metti|inserisc[ei]).*(lista|carrello|supermercato|online)/.test(t)) {
    const listType = /online/.test(t) ? 'online' : 'supermercato';
    const chunks = splitVoiceItems(t.replace(/(aggiung[ei]|metti|inserisc[ei])\s+/,'').replace(/(alla|in)\s+lista.*$/,''));
    const items = chunks.map(ch=>{
      const qty = wordOrNumber(ch) || 1;
      const hint = parseUnitsHint(ch);
      return { name: inferProductName(ch), qty, mode: hint.mode, unitLabel: hint.unitLabel };
    });
    return { ok:true, result: await addItemsToList(items, listType) };
  }

  // 3.2 Segna comprato
  if (/(segna|marca).*(comprat[oa]|pres[oa])/.test(t)) {
    const name = inferProductName(t);
    const q = wordOrNumber(t) || 1;
    return { ok:true, result: await markBoughtFromList([{ name, qty:q }], /online/.test(t)?'online':undefined) };
  }

  // 3.3 Aggiorna scorte (quantità con unità)
  if (/\b(pacch|conf|scatol|bottigl|unit|pz|pezzi|uova|vasetti|barrette|merendine|bustine)\b|\d+\s*$/.test(t)) {
    const chunks = splitVoiceItems(t);
    const updates = chunks.map(ch=>{
      const qty = wordOrNumber(ch) || 1;
      const hint = parseUnitsHint(ch);
      return { name: inferProductName(ch), value: qty, mode: hint.mode };
    });
    return { ok:true, result: await updateStock(updates) };
  }

  // 3.4 Scadenze set
  if (/scad|scadenza|scade/.test(t) && /\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(t)) {
    // Esempio veloce: "latte scade il 12/09/2025"
    const prod = inferProductName(t);
    const d = t.match(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/)?.[0] || '';
    const [dd,mm,yy] = d.split(/[\/.-]/);
    const yyyy = yy.length===2 ? (Number(yy)>=70? '19'+yy : '20'+yy) : yy;
    return { ok:true, result: await setExpiries([{ name: prod, expiresAt: `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` }]) };
  }

  // 3.5 “quando scade X?”
  if (/quando\s+scad[ea]/.test(t)) {
    const prod = inferProductName(t);
    return { ok:true, result: await queryExpiry(prod) };
  }

  // 3.6 Finanze rapide
  if (/quanto.*(spes[oa]|uscit[ae]).*(questo|quest’|sto)\s*mese/.test(t)) {
    const user = await requireUser();
    const total = await sumFinancesBetween(user.id, start, end);
    return { ok:true, result:`Hai speso € ${total.toFixed(2)} nel mese corrente.` };
  }
  if (/cene|ristorant|aperitiv|bar/.test(t) && /ultim[ei]|scorsi/.test(t) && /mes/i.test(t)) {
    const months = guessMonths(t) || 2;
    const user = await requireUser();
    let sum=0; const now=new Date();
    for (let i=0;i<months;i++){
      const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
      const mr=monthRange(d);
      sum += await sumCategoryBetween(user.id, CATEGORY_SLUGS.CENE, mr.start, mr.end);
    }
    return { ok:true, result:`Spesa ristoranti/aperitivi negli ultimi ${months} mesi: € ${sum.toFixed(2)}.` };
  }
  if (/(saldo|disponibil|in\s+tasca)/.test(t)) {
    const user = await requireUser();
    const s = await computeDisponibileETasca(user.id, start, end);
    return { ok:true, result: `Saldo disponibile: € ${s.saldoDisponibile.toFixed(2)} • Soldi in tasca: € ${s.pocketBalance.toFixed(2)}.` };
  }
  if (/(ultim[ei]|ultime)\s+(10|dieci)\s+(incass|entrat|pagamenti|accrediti)/.test(t)) {
    const user = await requireUser();
    const rows = await lastIncomes(user.id, 10);
    if (!rows.length) return { ok:true, result:'Nessun incasso trovato.' };
    const lines = rows.map(r=>{
      const d = r.received_date || String(r.received_at||'').slice(0,10);
      return `• ${new Date(d).toLocaleDateString('it-IT')} — ${r.description||r.source||'Entrata'}: € ${Number(r.amount).toFixed(2)}`;
    }).join('\n');
    return { ok:true, result:`Ultimi 10 incassi:\n${lines}` };
  }

  // 3.7 Inserimento spesa testuale
  if (/ho\s+comprat|pagat|spes[oa]|scontrin|cassa|prezz|€|euro/.test(t) || /(pantalon|latte|yogurt|ristorant|pizza|bar|bollett|conad|iper|coop|esselunga|md|lidl)/.test(t)) {
    const ins = await ingestTextExpense(raw);
    return ins;
  }

  // 4) Primo messaggio: guida
  if (first) {
    return {
      ok:true,
      result:
`Posso:
• Dirti quanto hai speso questo mese, il saldo disponibile e i soldi in tasca
• Mostrarti gli ultimi 10 incassi
• Dire cosa devi comprare oggi, scorte in esaurimento o in scadenza
• Registrare spese (testo/voce) o scontrini OCR con categoria corretta (Casa, Vestiti, Cene, Varie)
• Aggiungere prodotti alla lista e aggiornare le scorte (es. "latte 3 bottiglie")
• Rispondere a "quando scade il latte?" o a "scontrino a voce: latte 2 bottiglie, pasta 3 pacchi"`
    };
  }

  return { ok:false, result:'Non ho capito. Prova: "Quanto ho speso questo mese?", "Cosa devo comprare oggi?", "Ho comprato pantaloni 39,90€".' };
}

/* --------------------------- Voce wrapper --------------------------- */
export async function ingestSpokenLocal(text){
  return runQueryFromTextLocal(text);
}

export default { runQueryFromTextLocal, ingestOCRLocal, ingestSpokenLocal };
