// pages/liste-prodotti.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Camera, Plus, Calendar } from 'lucide-react';
import dynamic from 'next/dynamic';





// ===== BASE LEXICON (minimo, espandibile) =====
const GROCERY_LEXICON = [
  'latte','latte zymil','yogurt','burro','uova','mozzarella','parmigiano',
  'pane','pasta','riso','farina','zucchero','olio evo','olio di semi','aceto',
  'passata di pomodoro','pelati','tonno in scatola','piselli','fagioli',
  'biscotti','merendine','fette biscottate','marmellata','nutella','caffè',
  'acqua naturale','acqua frizzante','birra','vino',
  'detersivo lavatrice','pods lavatrice','ammorbidente','candeggina',
  'detersivo piatti','pastiglie lavastoviglie',
  'carta igienica','carta casa','sacchi spazzatura',
  'mele','banane','arance','limoni','zucchine','melanzane','pomodori','patate'
];

// Sinonimi quantità per i parser (vocale/regex)
const UNIT_SYNONYMS = '(?:unit(?:a|à)?|unit\\b|pz\\.?|pezz(?:i|o)\\.?|bottiglie?|busta(?:e)?|bustine?|lattin(?:a|e)|barattol(?:o|i)|vasett(?:o|i)|vaschett(?:a|e)|brick|cartocc(?:io|i)|fett(?:a|e)|uova|capsul(?:a|e)|pods|rotol(?:o|i)|fogli(?:o|i))';
const PACK_SYNONYMS = '(?:conf(?:e(?:zioni)?)?|confezione|pacc?hi?|pack|multipack|scatol(?:a|e)|carton(?:e|i))';

// ===== REVIEW BRIDGE (module-scope): permette a openValidation di aprire la modale =====
let __reviewSetters = null;
function registerReviewSetters(setters){ __reviewSetters = setters; }

// usa NEXT_PUBLIC_USE_AGENT_POST=1 per abilitarlo in prod
const USE_AGENT_POST = process.env.NEXT_PUBLIC_USE_AGENT_POST === '1';



// ===== Helper “learning” SHIM per evitare ReferenceError (puoi migliorarli in seguito) =====
function applyLearnedAliases({ name, brand }, learned){
  // shim semplice: applichiamo eventuali alias dichiarati in learned (se presenti)
  let n = name || '', b = brand || '';
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if (learned?.aliases?.brand) {
    for (const [pat, repl] of Object.entries(learned.aliases.brand)) {
      const re = new RegExp(`\\b${esc(pat)}\\b`, 'i');
      if (re.test(b) || re.test(n)) { b = repl; n = n.replace(re,'').trim(); }
    }
    
  }
  if (learned?.aliases?.product) {
    for (const [pat, repl] of Object.entries(learned.aliases.product)) {
      const re = new RegExp(`\\b${esc(pat)}\\b`, 'i');
      if (re.test(n)) n = n.replace(re, repl).trim();
    }
  }
  return { name:n, brand:b };
}
function normalizeBrandName(s){ 
  const t = String(s||'');
  if (/^\s*m\s*bianco\b|mbianco\b/i.test(t) || /mulino\s*bianco/i.test(t)) return 'Mulino Bianco';
  return t.trim();
}
function normalizeProductName(n){ return String(n||'').trim(); }
function rememberItems(arr){ /* no-op minimo: evita errori; puoi collegarlo a setLearned se vuoi */ }



/* ====================== Costanti / Config ====================== */
const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;

/* ====================== Feature toggles / safety ====================== */
// Se l’OCR / vocale trova il prodotto ma non capisce le quantità,
const DEFAULT_PACKS_IF_MISSING = true;


// —— Cloud sync (Supabase) — opzionale, auto-noop se non presente
const CLOUD_SYNC = true;                       // lascia true: prova a sincronizzare se /lib/supabaseClient esiste
const CLOUD_TABLE = 'jarvis_liste_state';      // { user_id text, state jsonb, updated_at timestamptz default now() }
let __supabase = null;

/* ====================== Endpoints esistenti ====================== */
const API_ASSISTANT_TEXT = '/api/assistant';
const API_OCR = '/api/ocr';
const API_FINANCES_INGEST = '/api/finances/ingest';
const API_PRODUCTS_ENRICH = '/api/products/enrich';

/* ====================== Persistenza locale ====================== */
const LS_VER = 1;
const LS_KEY = 'jarvis_liste_prodotti@v1';

// chiave univoca per nome+marca
function normKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
/* SAFETY SHIM — garantisce che isSimilar esista nel modulo */
 /* eslint-disable no-var, no-use-before-define */
var isSimilar = isSimilar || function isSimilar(a, b) {
  const na = normKey(a), nb = normKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 3 && (nb.includes(na) || na.includes(nb))) return true;
  const A = new Set(na.split(' ').filter(Boolean));
  const B = new Set(nb.split(' ').filter(Boolean));
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
  const union = new Set([...A, ...B]).size;
  const j = inter / union;
  return j >= 0.5 || (inter >= 1 && (A.size === 1 || B.size === 1));
};
 /* eslint-enable no-var, no-use-before-define */


function productKey(name = '', brand = '') {
  return `${normKey(name)}|${normKey(brand)}`;
}
/* ====================== Cloud: sanitizer stato per upsert ====================== */
// 👉 Versione aggiornata: include _ts (timestamp), sincronizza imagesIndex (solo URL http/https brevi)
//    e mantiene l’immagine in stock SOLO se è un URL http/https (no base64 pesanti).
// ⬇️ rimpiazza completamente questa funzione nel file pages/liste-prodotti.js
function stripForCloud(state = {}) {
  // 1) Liste (campi essenziali, mai immagini)
  const safeList = (arr) =>
    (Array.isArray(arr) ? arr : []).map((it) => ({
      id: String(it?.id ?? ''),
      name: String(it?.name ?? ''),
      brand: String(it?.brand ?? ''),
      qty: Number(it?.qty ?? 0),
      unitsPerPack: Number(it?.unitsPerPack ?? 1),
      unitLabel: String(it?.unitLabel ?? 'unità'),
      purchased: !!it?.purchased,
    }));

  const lists = state?.lists || {};
  const safeLists = {
    [LIST_TYPES.SUPERMARKET]: safeList(lists[LIST_TYPES.SUPERMARKET]),
    [LIST_TYPES.ONLINE]:      safeList(lists[LIST_TYPES.ONLINE]),
  };

  // 2) Scorte (togli immagini non http/https e quelle troppo lunghe)
  const safeStock = (Array.isArray(state?.stock) ? state.stock : []).map((s) => {
    const base = {
      name: String(s?.name ?? ''),
      brand: String(s?.brand ?? ''),
      packs: Number(s?.packs ?? 0),
      unitsPerPack: Number(s?.unitsPerPack ?? 1),
      unitLabel: String(s?.unitLabel ?? 'unità'),
      expiresAt: String(s?.expiresAt ?? ''),
      baselinePacks: Number(s?.baselinePacks ?? 0),
      lastRestockAt: String(s?.lastRestockAt ?? ''),
      avgDailyUnits: Number(s?.avgDailyUnits ?? 0),
      residueUnits: Number(
        s?.residueUnits ?? (Number(s?.packs ?? 0) * Number(s?.unitsPerPack ?? 1))
      ),
      packsOnly: !!s?.packsOnly,
    };

    const img = s?.image;
    if (typeof img === 'string') {
      // accetto http/https o il proxy relativo
      const isHttp = /^https?:\/\//i.test(img);
      const isProxy = img.startsWith('/api/img-proxy?');
      if (isHttp && img.length <= 2000) base.image = img;
      else if (isProxy) {
        try {
          const abs = (typeof window !== 'undefined' && window.location)
            ? `${window.location.origin}${img}`
            : img;
          if (/^https?:\/\//i.test(abs) && abs.length <= 2000) base.image = abs;
        } catch {}
      }
    }
    return base;
  });

  // 3) imagesIndex (accetta http/https e proxy relativo; se relativo → assoluto)
  const imagesIndex = {};
  const source = (state?.imagesIndex && typeof state.imagesIndex === 'object')
    ? state.imagesIndex
    : {};

  for (const [k, v] of Object.entries(source)) {
    if (typeof v !== 'string') continue;

    if (/^https?:\/\//i.test(v)) {
      if (v.length <= 2000) imagesIndex[k] = v;
      continue;
    }
    if (v.startsWith('/api/img-proxy?')) {
      try {
        const abs = (typeof window !== 'undefined' && window.location)
          ? `${window.location.origin}${v}`
          : v;
        if (/^https?:\/\//i.test(abs) && abs.length <= 2000) imagesIndex[k] = abs;
      } catch {}
    }
  }

  // 4) learned “snellito”
  const learned =
    state?.learned && typeof state.learned === 'object'
      ? {
          products: state.learned.products || {},
          aliases: state.learned.aliases || { product: {}, brand: {} },
          keepTerms: state.learned.keepTerms || {},
        }
      : undefined;

  // 5) currentList sicura
  const currentList = [LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].includes(state?.currentList)
    ? state.currentList
    : LIST_TYPES.SUPERMARKET;

  // 6) timestamp per LWW
  const _ts = Date.now();

  return { _ts, lists: safeLists, stock: safeStock, currentList, imagesIndex, learned };
}


function loadPersisted() {
  try {
    const raw =
      typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== LS_VER) return null;
    return data;
  } catch {
    return null;
  }
}
function persistNow(snapshot) {
  try {
    if (typeof window === 'undefined') return;
    const payload = {
      v: LS_VER,
      at: Date.now(),
      lists: snapshot.lists,
      stock: snapshot.stock,
      currentList: snapshot.currentList,
      imagesIndex: snapshot.imagesIndex || {},
      // 👇 NEW: memoria di apprendimento (prodotti/alias/keep)
      learned: snapshot.learned || learned,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[persist] save failed', e);
  }
}

/* ==================== LEXICON EXTENSION + QUANTITY SANITIZER + PROMPTS (SAFE) ==================== */
(() => {
  // Evita ReferenceError se non è ancora definito
  if (typeof GROCERY_LEXICON === 'undefined') return;

  const __hasLex = (term) =>
    Array.isArray(GROCERY_LEXICON) &&
    GROCERY_LEXICON.some((x) => normKey(x) === normKey(term));
  const __lexAdd = (arr) => {
    arr.forEach((t) => {
      if (t && !__hasLex(t)) GROCERY_LEXICON.push(t);
    });
  };

  // ——— ALIMENTARI & CASA (esteso) ———
  const LEX_DELI = [
    'prosciutto cotto',
    'prosciutto crudo',
    'bresaola',
    'speck',
    'mortadella',
    'salame',
    'pancetta',
    'salsiccia',
    'wurstel',
    'porchetta',
    'arrosto di tacchino',
  ];
  const LEX_DAIRY = [
    'latte',
    'latte uht',
    'latte senza lattosio',
    'latte zymil',
    'yogurt',
    'yogurt greco',
    'burro',
    'panna',
    'ricotta',
    'mozzarella',
    'burrata',
    'scamorza',
    'provola',
    'parmigiano reggiano',
    'grana padano',
    'pecorino',
    'gorgonzola',
    'stracchino',
    'robiola',
    'brie',
    'crescenza',
    'philadelphia',
    'formaggio spalmabile',
    'kefir',
  ];
  const LEX_BAKERY = [
    'pane',
    'panini',
    'pan bauletto',
    'pan carrè',
    'grissini',
    'cracker',
    'taralli',
    'piadina',
    'tortillas',
    'focaccia',
    'cornetti',
    'croissant',
    'fette biscottate',
    'pangrattato',
    'pan grattugiato',
    'pan carré',
  ];
  const LEX_PASTA = [
    'pasta',
    'spaghetti',
    'penne',
    'fusilli',
    'rigatoni',
    'lasagne',
    'gnocchi',
    'ravioli',
    'tortellini',
    'riso',
    'riso arborio',
    'riso carnaroli',
    'riso basmati',
    'farina 00',
    'semola',
    'lievito per dolci',
    'lievito di birra',
    'cous cous',
    'farro',
    'orzo',
    'quinoa',
    'polenta',
  ];
  const LEX_PANTRY = [
    'passata di pomodoro',
    'polpa di pomodoro',
    'pomodori pelati',
    'concentrato di pomodoro',
    'pesto',
    'ragù',
    'olio extravergine di oliva',
    'olio evo',
    'olio di semi',
    'aceto balsamico',
    'zucchero',
    'zucchero di canna',
    'sale fino',
    'sale grosso',
    'pepe',
    'tonno in scatola',
    'sgombro',
    'legumi in scatola',
    'ceci',
    'fagioli borlotti',
    'lenticchie',
    'piselli',
    'mais',
    'olive',
    'capperi',
    'dado da brodo',
    'maionese',
    'ketchup',
    'senape',
    'salsa barbecue',
    'salsa di soia',
    'spezie',
    'origano',
    'basilico',
    'rosmarino',
    'curry',
    'paprika',
    'curcuma',
    'cannella',
    'zafferano',
  ];
  const LEX_BREAKFAST = [
    'cereali',
    'corn flakes',
    'muesli',
    'granola',
    'biscotti',
    'biscotti integrali',
    'merendine',
    'crostatine',
    'plumcake',
    'marmellata',
    'confettura',
    'miele',
    'nutella',
    'crema di arachidi',
  ];
  const LEX_SNACKS = [
    'cioccolato',
    'barrette',
    'caramelle',
    'liquirizia',
    'gomme da masticare',
    'salatini',
    'mandorle',
    'nocciole',
    'pistacchi',
    'anacardi',
    'noci',
    'pinoli',
    'patatine',
    'popcorn',
    'grissini snack',
    'batticuori',
    'fette rigate',
    'yo-yo',
    'fiesta',
  ];
  const LEX_BEVERAGES = [
    'acqua naturale',
    'acqua frizzante',
    'succo di frutta',
    'tè freddo',
    'caffè',
    'caffè capsule',
    'caffè cialde',
    'bevanda vegetale',
    'bibita cola',
    'aranciata',
    'birra',
    'vino',
    'spumante',
  ];
  const LEX_FROZEN = [
    'piselli surgelati',
    'spinaci surgelati',
    'minestrone surgelato',
    'patatine surgelate',
    'bastoncini di pesce',
    'pizza surgelata',
    'gelato',
    'sorbetto',
  ];
  const LEX_VEG = [
    'insalata',
    'lattuga',
    'rucola',
    'pomodori',
    'zucchine',
    'melanzane',
    'peperoni',
    'carote',
    'sedano',
    'cetrioli',
    'cipolle',
    'aglio',
    'patate',
    'zucca',
    'broccoli',
    'cavolfiore',
    'asparagi',
    'carciofi',
    'funghi',
    'finocchi',
    'verza',
  ];
  const LEX_FRUIT = [
    'banane',
    'mele',
    'pere',
    'arance',
    'limoni',
    'mandarini',
    'kiwi',
    'uva',
    'fragole',
    'mirtilli',
    'lamponi',
    'ananas',
    'mango',
    'melone',
    'anguria',
    'pesche',
    'albicocche',
    'prugne',
    'fichi',
    'melagrana',
    'avocado',
    'cachi',
  ];
  const LEX_BABY_PET = [
    'pannolini',
    'salviettine umidificate',
    'omogeneizzati',
    'latte in polvere',
    'crocchette cane',
    'crocchette gatto',
    'lettiera gatti',
  ];
  const LEX_LAUNDRY = [
    'detersivo lavatrice',
    'pods lavatrice',
    'ammorbidente',
    'smacchiatore',
    'candeggina',
    'igienizzante bucato',
    'detersivo capi delicati',
    'perle profuma-bucato',
  ];
  const LEX_DISH = [
    'detersivo piatti',
    'pastiglie lavastoviglie',
    'gel lavastoviglie',
    'sale lavastoviglie',
    'brillantante lavastoviglie',
  ];
  const LEX_SURF = [
    'sgrassatore cucina',
    'detergente multiuso',
    'detergente vetri',
    'detergente pavimenti',
    'detergente bagno',
    'anticalcare',
    'gel wc',
    'igienizzante superfici',
    'cera parquet',
  ];
  const LEX_CONSUM = [
    'carta igienica',
    'carta casa',
    'scottex',
    'fazzoletti',
    'tovaglioli',
    'sacchi spazzatura',
    'sacchetti immondizia',
    'sacchetti freezer',
    'pellicola',
    'alluminio',
    'carta forno',
    'guanti lattice',
    'panni microfibra',
    'buste gelo',
    'sacchetti zip',
    'mocio',
    'ricariche mocio',
    'scopa',
    'teli copritutto',
    'accendifuoco',
    'sacchetti aspirapolvere',
    'deumidificatore ricariche',
    'rotolo bio con maniglie',
  ];
  const LEX_PERSONAL = [
    'sapone mani',
    'bagnoschiuma',
    'shampoo',
    'balsamo',
    'dentifricio',
    'collutorio',
    'spazzolino',
    'deodorante',
    'assorbenti',
    'cotton fioc',
    'crema mani',
  ];

  [
    LEX_DELI,
    LEX_DAIRY,
    LEX_BAKERY,
    LEX_PASTA,
    LEX_PANTRY,
    LEX_BREAKFAST,
    LEX_SNACKS,
    LEX_BEVERAGES,
    LEX_FROZEN,
    LEX_VEG,
    LEX_FRUIT,
    LEX_BABY_PET,
    LEX_LAUNDRY,
    LEX_DISH,
    LEX_SURF,
    LEX_CONSUM,
    LEX_PERSONAL,
  ].forEach(__lexAdd);
})();

// ——— Sanitizzazione quantità: NON toccare “pezzi” (pz/capsule/pods ecc.), neutralizza pesi/volumi/dimensioni ———
const MEASURE_TOKEN_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|lt|ml|cl|m³|m3|mq|m²|cm|mm)\b/gi;
const DIMENSION_RE =
  /\b\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?\s*(?:cm|mm|m)\b/gi;
const SUSPECT_UPP = new Set([
  125, 200, 220, 225, 230, 240, 250, 280, 300, 330, 350, 375, 400, 450, 454,
  500, 700, 720, 733, 750, 800, 900, 910, 930, 950, 1000, 1250, 1500, 1750,
  2000,
]);

function cleanupPurchasesQuantities(list) {
  return (Array.isArray(list) ? list : []).map((p) => {
    const out = { ...p };
    const joined = `${String(out.name || '')} ${String(out.brand || '')}`.toLowerCase();
    const hasMeasure =
      (joined.match(MEASURE_TOKEN_RE) || []).length > 0 ||
      (joined.match(DIMENSION_RE) || []).length > 0;
    const u = Math.max(0, Number(out.unitsPerPack || 0));
    const packs = Math.max(0, Number(out.packs || 0));
    const piecesHit = /\b(pz|pezzi|bottigli|capsul|pods|bust|lattin|vasett|rotol|fogli|uova|brick)\b/i.test(
      normKey(`${out.unitLabel || ''} ${joined}`)
    );
    const looksWeightNumber = !piecesHit && (hasMeasure || SUSPECT_UPP.has(u));
    if ((hasMeasure && u > 1) || looksWeightNumber) {
      out.unitsPerPack = 1;
      out.unitLabel = 'unità';
      if (!packs) out.packs = 1;
    }
    return out;
  });
}

// ——— PROMPT per scontrino ———
function buildOcrAssistantPrompt(ocrText, lexicon = []) {
  const LEX =
    Array.isArray(lexicon) && lexicon.length
      ? lexicon.join(', ')
      : 'latte, pasta, biscotti, detersivi, ...';
  return [
    'Sei Jarvis, estrattore strutturato di SCONTRINI. RISPONDI SOLO JSON con lo schema esatto:',
    '{ "store":"", "purchaseDate":"", "purchases":[{"name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","priceEach":0,"priceTotal":0,"currency":"","expiresAt":""}] }',
    'Regole: normalizza i nomi rispetto a questo lessico: ' + LEX,
    'NON interpretare pesi/volumi/dimensioni come quantità; packs/unitsPerPack solo con pattern espliciti (2x6, 2 conf da 6, 6 bottiglie).',
    'Ignora subtotali, IVA, metodi di pagamento, sconti (OFF.).',
    '--- INIZIO ---',
    ocrText,
    '--- FINE ---',
  ].join('\n');
}

// ——— PROMPT per foto “busta prodotti” / etichette ———
function buildOcrStockBagPrompt(ocrText, lexicon = []) {
  const LEX =
    Array.isArray(lexicon) && lexicon.length
      ? lexicon.join(', ')
      : 'latte, pane, buste freezer, ...';
  return [
    'Sei Jarvis: da foto di prodotti/buste estrai SOLO JSON { "items":[{ "name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","expiresAt":"" }] }',
    'NON usare pesi/volumi/dimensioni come quantità; quantità solo con pattern espliciti.',
    'Lessico: ' + LEX,
    '--- INIZIO ---',
    ocrText,
    '--- FINE ---',
  ].join('\n');
}

/* ====================== Parser liste rapide ====================== */
function extractPackInfo(str) {
  const raw = normKey(str);

  // parole → numeri (un|uno|una = 1, ecc.)
  const WORD_MAP = {
    un: 1,
    uno: 1,
    una: 1,
    due: 2,
    tre: 3,
    quattro: 4,
    cinque: 5,
    sei: 6,
    sette: 7,
    otto: 8,
    nove: 9,
    dieci: 10,
  };
  const s = raw.replace(
    /\b(un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/g,
    (w) => String(WORD_MAP[w] || w)
  );

  let packs = 1;
  let unitsPerPack = 1;
  let unitLabel = 'unità';

  // include anche 'unit' senza accento per tollerare "unit"
  const UNIT_TERMS =
    '(?:pz|pezzi|unit(?:a|à)?|unit\\b|barrett[e]?|vasett[i]?|uova|bottiglie?|merendine?|bustin[ae]|monouso)';

  let m;

  // "2 confezioni da 6 bottiglie" / "1 confezione da 6 unità"
  m = s.match(
    new RegExp(
      `(\\d+)\\s*(?:conf(?:e(?:zioni)?)?|pacc?hi?|scatol[ae])\\s*(?:da|x)\\s*(\\d+)\\s*(${UNIT_TERMS})?`,
      'i'
    )
  );
  if (m) {
    packs = Number(m[1]);
    unitsPerPack = Number(m[2]);
    const lab = (m[3] || 'unità').replace(/^(?:pz|pezzi|unit|unita?)$/, 'unità');
    unitLabel = /bottigl/i.test(lab) ? 'bottiglie' : 'unità';
    return { packs, unitsPerPack, unitLabel, explicit: true };
  }

  // "2 confezioni 6 bottiglie" / "2 confezioni 6 unità"
  m = s.match(
    new RegExp(`(\\d+)\\s*(?:conf(?:e(?:zioni)?)?|pacc?hi?)\\b.*?\\b(\\d+)\\s*(${UNIT_TERMS})?`, 'i')
  );
  if (m) {
    packs = Number(m[1]);
    unitsPerPack = Number(m[2]);
    const lab = (m[3] || 'unità').replace(/^(?:pz|pezzi|unit|unita?)$/, 'unità');
    unitLabel = /bottigl/i.test(lab) ? 'bottiglie' : 'unità';
    return { packs, unitsPerPack, unitLabel, explicit: true };
  }

  // "4x125" → prendo 4 come unitsPerPack
  m = s.match(/(\d+)\s*[x×]\s*\d+/i);
  if (m) {
    packs = 1;
    unitsPerPack = Number(m[1]);
    return { packs, unitsPerPack, unitLabel, explicit: true };
  }

  // "... 6 bottiglie" | "... 6 unit"
  m = s.match(new RegExp(`(\\d+)\\s*(${UNIT_TERMS})\\b`, 'i'));
  if (m) {
    packs = 1;
    unitsPerPack = Number(m[1]);
    const lab = (m[2] || 'unità').replace(/^(?:pz|pezzi|unit|unita?)$/, 'unità');
    unitLabel = /bottigl/i.test(lab) ? 'bottiglie' : 'unità';
    return { packs, unitsPerPack, unitLabel, explicit: false };
  }

  // "... 2 confezioni" (solo pacchi)
  m = s.match(
    new RegExp(
      `(\\d+)\\s*(bottiglie?|pacc?hi?|scatol[ae]|conf(?:e(?:zioni)?)?)`,
      'i'
    )
  );
  if (m) {
    packs = Number(m[1]);
    unitsPerPack = 1;
    const tok = m[2] || '';
    unitLabel = /^bott/i.test(tok) ? 'bottiglie' : 'unità';
    return { packs, unitsPerPack, unitLabel, explicit: false };
  }

  // "2 kg zucchero" → tratta come pacchi=2
  m = s.match(/^(\d+(?:[.,]\d+)?)(?=\s+[a-z])/i);
  if (m) {
    packs = Number(String(m[1]).replace(',', '.')) || 1;
    unitsPerPack = 1;
    return { packs, unitsPerPack, unitLabel, explicit: false };
  }

  return { packs, unitsPerPack, unitLabel, explicit: false };
}

function parseLinesToItems(text) {
  const chunks = String(text || '')
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = [];
  for (const raw of chunks) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;

    const packInfo = extractPackInfo(s);
    const packs = Number(packInfo.packs || 1);

    // ripulisci eventuale quantità iniziale “2 latte …”
    let rest = s;
    const mQtyLead = rest.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
    if (mQtyLead) rest = mQtyLead[2].trim();

    // name / brand (se l’ultima parola è Capitalized la tratto come brand)
    let name = rest;
    let brand = '';

    const marca = rest.match(/\b(?:marca|brand)\s+([^\s].*)$/i);
    if (marca) {
      brand = marca[1].trim();
      name = rest.replace(marca[0], '').trim();
    } else {
      const parts = rest.split(' ');
      if (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (/^[A-ZÀ-ÖØ-Þ]/.test(last)) {
          brand = last;
          name = parts.slice(0, -1).join(' ');
        }
      }
    }

    name = name.replace(/\s{2,}/g, ' ').trim();
    brand = brand.replace(/\s{2,}/g, ' ').trim();
    if (!name) continue;

    items.push({
      id: 'tmp-' + Math.random().toString(36).slice(2),
      name,
      brand: brand || '',
      qty: Number.isFinite(packs) && packs > 0 ? packs : 1,
      unitsPerPack: Number(packInfo.unitsPerPack || 1),
      unitLabel: packInfo.unitLabel || 'unità',
      purchased: false,
    });
  }

  return items;
}

/* ====================== Scadenze utils ====================== */
function toISODate(any) {
  const s = String(any || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const num = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (num) {
    const d = String(num[1]).padStart(2, '0');
    const M = String(num[2]).padStart(2, '0');
    let y = String(num[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  const mIt = [
    'gen',
    'feb',
    'mar',
    'apr',
    'mag',
    'giu',
    'lug',
    'ago',
    'set',
    'ott',
    'nov',
    'dic',
  ];
  const mm = s.toLowerCase().match(/(\d{1,2})\s+([a-zà-ú]+)\s+(\d{2,4})/i);
  if (mm) {
    const d = String(mm[1]).padStart(2, '0');
    const mon = mm[2].slice(0, 3);
    const idx = mIt.indexOf(mon);
    if (idx >= 0) {
      let y = String(mm[3]);
      if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
      const M = String(idx + 1).padStart(2, '0');
      return `${y}-${M}-${d}`;
    }
  }
  return '';
}
function parseExpiryPairs(text, lexicon = [], knownProducts = []) {
  if (DEBUG) console.log('[parseExpiryPairs] input:', text);
  const out = [];
  const norm = (x) =>
    String(x || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const s = norm(text);

  const KW = [
    'scad',
    'scadenza',
    'scade',
    'entro',
    'consumare',
    'preferibilmente',
    'da consumarsi',
    'da consumare',
  ];
  const DATE_RE =
    /((?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(?:\d{1,2}\s+[a-zà-ú]+\s+\d{2,4}))/i;

  const tokensArr = s.split(/\s+/);
  for (let i = 0; i < tokensArr.length; i++) {
    const win = tokensArr.slice(Math.max(0, i - 10), i + 10).join(' ');
    const dm = win.match(DATE_RE);
    if (!dm) continue;

    const hasKW = KW.some((k) => win.includes(k));
    const iso = toISODate(dm[1]);
    if (!iso) continue;

    const synonyms = [
      ['caffe', 'caffè'],
      [
        'latte ps',
        'latte parzialmente scremato',
        'latte p.s.',
        'latte p.s',
        'latte p s',
      ],
      ['latte uht', 'latte lunga conservazione'],
    ];
    let chosen = '';
    let bestLen = 0;

    const testList = [...lexicon];
    synonyms.forEach((group) => group.forEach((g) => testList.push(g)));

    for (const p of testList) {
      const k = norm(p);
      if (k && win.includes(k) && k.length > bestLen) {
        chosen = p;
        bestLen = k.length;
      }
    }

    if (!chosen && Array.isArray(knownProducts) && knownProducts.length) {
      for (const kp of knownProducts) {
        const k = norm(kp);
        if (k && win.includes(k)) {
          chosen = kp;
          break;
        }
      }
    }

    if (!chosen && !hasKW) continue;
    if (chosen) out.push({ name: chosen, expiresAt: iso });
  }
  if (DEBUG) console.log('[parseExpiryPairs] valid matches:', out);
  return out;
}

/* ====================== Fetch helpers / util varie ====================== */
async function readJsonSafe(res) {
  const ct = (res.headers.get?.('content-type') || '').toLowerCase();
  const raw = (await res.text?.()) || '';
  if (DEBUG)
    console.log(
      '[readJsonSafe] status:',
      res.status,
      'ct:',
      ct,
      'raw len:',
      raw.length,
      'raw preview:',
      raw.slice(0, 200)
    );
  if (!raw.trim())
    return { ok: res.ok, data: null, error: res.ok ? null : `HTTP ${res.status}` };
  if (ct.includes('application/json')) {
    try {
      return { ok: res.ok, ...(JSON.parse(raw) || {}) };
    } catch (e) {
      return { ok: res.ok, data: null, error: `JSON parse error: ${e?.message || e}` };
    }
  }
  try {
    return { ok: res.ok, ...(JSON.parse(raw) || {}) };
  } catch {
    return { ok: res.ok, data: null, error: raw.slice(0, 200) || `HTTP ${res.status}` };
  }
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function timeoutFetch(url, opts = {}, ms = 25000) {
  if (DEBUG) console.log('[fetch] →', url, opts);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .then((r) => {
      if (DEBUG) console.log('[fetch] ←', url, r.status);
      return r;
    })
    .finally(() => clearTimeout(t));
}

/* === NEW: helper per errori chiari e JSON rigoroso === */
async function readTextSafe(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function fetchJSONStrict(url, opts = {}, timeoutMs = 40000) {
  const r = await timeoutFetch(url, opts, timeoutMs);
  const ct = (r.headers.get?.('content-type') || '').toLowerCase();
  const raw = await readTextSafe(r);

  if (!r.ok) {
    let msg = raw;
    if (ct.includes('application/json')) {
      try {
        const j = JSON.parse(raw);
        msg = j.error || j.message || JSON.stringify(j);
      } catch {}
    }
    throw new Error(
      `HTTP ${r.status} ${r.statusText || ''} — ${String(msg).slice(0, 250)}`
    );
  }

  if (!raw.trim()) return {};
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`JSON parse error: ${e?.message || e}`);
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { data: raw };
  }
}

// ===== ENRICH: normalizza nome/categoria e recupera immagine dal web (match robusto) =====
async function enrichPurchasesViaWeb(purchases = []) {
  if (!Array.isArray(purchases) || purchases.length === 0) {
    return { items: purchases, images: {} };
  }

  const payload = {
    items: purchases.map(p => ({
      name: String(p.name || ''),
      brand: String(p.brand || '')
    })),
  };

  try {
    const resp = await timeoutFetch(API_PRODUCTS_ENRICH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 25000);

    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || !json.ok || !Array.isArray(json.items)) {
      throw new Error(json?.error || `enrich HTTP ${resp.status}`);
    }

    // indicizzazioni: full key (nome+brand) e solo nome
    const keyFull = (n, b) => `${normKey(n)}|${normKey(b||'')}`;
    const keyName = (n)    => normKey(n);

    const byFull = new Map();
    const byName = new Map();
    for (const x of json.items) {
      const sn = String(x.sourceName || '');
      const br = String(x.brand || '');
      byFull.set(keyFull(sn, br), x);
      if (!byName.has(keyName(sn))) byName.set(keyName(sn), x); // prima occorrenza
    }

    const imagesMap = {};
    let improved = 0;

    const out = purchases.map(p => {
      const n0 = String(p.name || '');
      const b0 = String(p.brand || '');
      const fullKey = keyFull(n0, b0);
      let hit = byFull.get(fullKey);

      // 1) se niente, prova per solo nome
      if (!hit) hit = byName.get(keyName(n0));

      // 2) se ancora niente, fuzzy: cerca quello più simile sul nome (e se c’è anche la marca)
      if (!hit) {
        let best = null, bestScore = -1;
        for (const cand of json.items) {
          const nameSim  = isSimilar(n0, cand.sourceName) ? 1 : 0;
          const brandSim = b0 ? (isSimilar(b0, cand.brand || '') ? 1 : 0) : 0.5; // se brand assente nel ticket, non penalizzare
          const score = nameSim * 0.8 + brandSim * 0.2;
          if (score > bestScore) { bestScore = score; best = cand; }
        }
        if (bestScore >= 0.8) hit = best; // soglia ragionevole
      }

      if (!hit) return p; // nessun miglioramento

      const prettyName  = String(hit.normalizedName || p.name).trim();
      const prettyBrand = String(hit.brand || p.brand || '').trim();

      // costruisci un proxy assoluto (evita problemi di salvataggio/visualizzazione)
      if (hit.imageUrl && /^https?:\/\//i.test(hit.imageUrl)) {
        const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
        const proxied = origin ? `${origin}/api/img-proxy?url=${encodeURIComponent(hit.imageUrl)}` : `/api/img-proxy?url=${encodeURIComponent(hit.imageUrl)}`;
        imagesMap[productKey(prettyName, prettyBrand)] = proxied;
      }

      // segna miglioramento solo se cambia qualcosa o se abbiamo immagine
      const changed = (prettyName !== p.name) || (prettyBrand !== (p.brand || '')) || !!imagesMap[productKey(prettyName, prettyBrand)];
      if (changed) improved++;

      return { ...p, name: prettyName, brand: prettyBrand };
    });

    // log utile in console
    try { console.log('[enrich applied]', { requested: purchases.length, improved }); } catch {}

    return { items: out, images: imagesMap };

  } catch (err) {
    console.warn('[enrich] fail:', err);
    return { items: purchases, images: {} };
  }
}


/* ====================== Calcoli scorte ====================== */
function clamp01(x){ return Math.max(0, Math.min(1, Number(x) || 0)); }
function residueUnitsOf(s){
  const upp = Math.max(1, Number(s.unitsPerPack || 1));
  const ru = Number(s.residueUnits);
  if (s.packsOnly) return Math.max(0, Number(s.packs || 0)); // barra sui pacchi in modalità solo confezioni
  if (Number.isFinite(ru)) return Math.max(0, ru);
  return Math.max(0, Number(s.packs || 0) * upp);
}
function baselineUnitsOf(s){
  const upp = Math.max(1, Number(s.unitsPerPack || 1));
  if (s.packsOnly) return Math.max(1, Number(s.baselinePacks || s.packs || 1));
  const bp  = Number(s.baselinePacks);
  const base = Number.isFinite(bp) && bp > 0 ? bp * upp : Number(s.packs || 0) * upp;
  return Math.max(upp, base);
}
function residueInfo(s){
  const current  = residueUnitsOf(s);
  const baseline = baselineUnitsOf(s);
  const pct = baseline ? clamp01(current / baseline) : 1;
  return { current, baseline, pct };
}
const RESIDUE_THRESHOLDS = { green: 0.60, amber: 0.30 };
function colorForPct(p){
  const x = clamp01(p);
  if (x >= RESIDUE_THRESHOLDS.green) return '#16a34a';
  if (x >= RESIDUE_THRESHOLDS.amber) return '#f59e0b';
  return '#ef4444';
}
function daysToExpiry(iso){
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  const now = new Date();
  return Math.floor((d - now) / 86400000);
}
function isExpiringSoon(s, days=10){
  return daysToExpiry(s?.expiresAt) <= days;
}
function totalUnitsOf(s){ return (Number(s.packs||0) * Number(s.unitsPerPack||1)); }

/* ====================== Prompt builders (moved) ====================== */
// Le funzioni buildOcrAssistantPrompt e buildOcrStockBagPrompt sono state spostate
// sopra, nel blocco “LEXICON EXTENSION + …”. Qui non lasciamo definizioni per evitare duplicati.
// buildUnifiedRowPrompt rimane definita una sola volta nella sezione "Prompt builder OCR Riga".

/* ====================== Parser fallback OCR ====================== */
function parseReceiptPurchases(ocrText) {
  const rawLines = String(ocrText || '')
    .split(/\r?\n/)
    .map(s => s.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  // unisci righe "quantità" tipo "2 X 3,60 7,20" alla riga precedente
  const lines = [];
  for (const ln of rawLines) {
    if (/^\d+\s*[xX]\s*\d+(?:[.,]\d{2})(?:\s+\d+(?:[.,]\d{2}))?\s*$/i.test(ln)) {
      if (lines.length) lines[lines.length - 1] += ' ' + ln;
      else lines.push(ln);
      continue;
    }
    lines.push(ln);
  }

  const HEADER_RE = /^\s*(totale|subtotale|di\s*cui\s*iva|iva\b|pagamento|resto|importo|pezz[i]?|cassa|cassiere|transaz|documento|documento\s+commerciale|descrizione|prezzo|\beuro\b|€|negozio|p\.?iva|tel|maxistore|deco)\b/i;
  const IGNORE_RE = /\b(shopper|sacchetto|busta|cauzione|vuoto|off\.)\b/i; // salta righe sconto "OFF."

  const out = [];
  for (let raw of lines) {
    if (HEADER_RE.test(raw)) continue;
    if (/^\d{6,}$/.test(raw)) continue; // codici a barre/plu isolati

    // togli marcatori iniziali e trattini
    let work = raw.replace(/^[T*+\-]+\s*/, '').trim();
    if (!work) continue;

    // quantità su coda "N x prezzo [totale]"
    let packsFromTail = null;
    const tailQty = work.match(/(\d+)\s*[xX]\s*\d+(?:[.,]\d{2})(?:\s+\d+(?:[.,]\d{2}))?\s*$/);
    if (tailQty) {
      packsFromTail = parseInt(tailQty[1], 10);
      work = work.replace(tailQty[0], '').trim();
    }

    // rimuovi coda "IVA% prezzo", oppure "€ prezzo", oppure solo "prezzo"
    work = work
      .replace(/\s+\d{1,2}%\s+\d+(?:[.,]\d{2})\s*$/i, '')
      .replace(/(?:€|eur|euro)\s*\d+(?:[.,]\d{2})\s*$/i, '')
      .replace(/\s+\d+(?:[.,]\d{2})\s*$/i, '')
      .trim();

    if (IGNORE_RE.test(work)) continue;

    // quantità inline "X6"
    let packsInline = null;
    const mInline = work.match(/\b[xX]\s*(\d+)\b/);
    if (mInline) {
      packsInline = parseInt(mInline[1], 10);
      work = work.replace(mInline[0], '').trim();
    }

    // rimuovi pesi/volumi "250 g", "1,5 L", ecc.
    work = work.replace(/\b(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|lt))\b/gi, '').replace(/\s{2,}/g, ' ').trim();

    // brand = ultima parola in MAIUSCOLO
    let name = work, brand = '';
    const parts = name.split(' ');
    if (parts.length > 1 && /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9\-'.]*$/.test(parts[parts.length - 1])) {
      brand = parts.pop();
      name = parts.join(' ');
    }

    const txt = name.toLowerCase();

    // normalizzazioni "intelligenti" per i casi visti
    if (/prezzemol/.test(txt)) name = 'prezzemolo';
    else if (/pane\s+e\s+pizza/.test(txt)) name = 'farina pane e pizza';
    else if (/pecor.*igt/.test(txt)) name = 'vino pecorino igt';
    else if (/pan\s+bauletto/.test(txt)) name = 'pan bauletto bianco';
    else if (/yo-?yo/.test(txt)) name = 'merendine yo-yo';
    else if (/lacca\b/i.test(name)) name = 'lacca per capelli';
    else if (/pantene.*shampoo/i.test(name)) name = 'shampoo';
    else if (/latte\s+zymil/i.test(name)) name = 'latte';
    else if (/salsiccia/i.test(name)) name = 'salsiccia';
    else if (/candeggin/i.test(name) || /ace/i.test(brand)) name = 'candeggina';
    else if (/\bcaff[eè]\b/.test(txt)) name = 'caffè';

    const packs = packsFromTail || packsInline || 1;

    out.push({
      name: name.trim(),
      brand: brand || '',
      packs: Math.max(1, packs),
      unitsPerPack: 1,
      unitLabel: 'unità',
      expiresAt: ''
    });
  }
  return out;
}

/* ===== Numeri & meta ===== */
function coerceNum(x){
  if (x == null) return 0;
  const s = String(x).trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function parseByLexicon(ocrText, lexicon = []) {
  const s = normKey(ocrText);
  const counts = Object.create(null);
  for (const term of lexicon) {
    const k = normKey(term);
    if (!k) continue;
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`, 'g');
    const m = s.match(re);
    if (m) counts[term] = (counts[term] || 0) + m.length;
  }
  return Object.entries(counts).map(([name, count]) => ({
    name,
    brand: '',
    packs: Math.max(1, count),
    unitsPerPack: 1,
    unitLabel: 'unità',
    priceEach: 0,
    priceTotal: 0,
    currency: 'EUR',
    expiresAt: ''
  }));
}

function parseReceiptMeta(ocrText) {
  const lines = String(ocrText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  // Data
  let purchaseDate = '';
  for (const ln of lines) {
    const iso = toISODate(ln);
    if (iso) { purchaseDate = iso; break; }
  }
  // Store
  const bad = /(totale|iva|imp|euro|€|tel|cassa|scontrino|fiscale|subtot|pagamento|contanti|resto)/i;
  let store = '';
  for (const ln of lines) {
    const hasLetters = /[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(ln);
    if (hasLetters && !bad.test(ln) && ln.length >= 3) { store = ln.replace(/\s{2,}/g,' ').trim(); break; }
  }
  return { store, purchaseDate };
}

/* ===== Etichette unitarie ===== */
function normalizeUnitLabel(lbl=''){
  const s = normKey(lbl);
  if (/bottigl/.test(s)) return 'bottiglie';
  if (/(?:pz|pezz|unit\b|unita?)/.test(s)) return 'pezzi';
  if (/bust/.test(s)) return 'buste';
  if (/lattin/.test(s)) return 'lattine';
  if (/vasett/.test(s)) return 'vasetti';
  if (/barattol/.test(s)) return 'barattoli';
  if (/vaschett/.test(s)) return 'vaschette';
  if (/rotol/.test(s)) return 'rotoli';
  if (/fogli?/.test(s)) return 'fogli';
  if (/capsul/.test(s)) return 'capsule';
  return 'unità';
}

/* ===== Heuristics nome ===== */
function guessProductName(chunk) {
  let best = '';
  let bestLen = 0;
  for (const lex of GROCERY_LEXICON) {
    if (isSimilar(chunk, lex) && lex.length > bestLen) { best = lex; bestLen = lex.length; }
  }
  if (!best) {
    const t = normKey(chunk).split(' ').filter(Boolean);
    if (t.length) best = t.slice(0, 2).join(' ');
  }
  return best.trim();
}
function hasExplicitPackStructure(text){
  const s = normKey(text);
  return /(?:conf(?:e(?:zioni)?)?|pacc?hi?|scatol[ae])\s*(?:da|x)\s*\d+/.test(s);
}
function looksLikeSetResidue(text) {
  const t = normKey(text);
  return /\b(sono|ce\s+ne\s+sono|ce\s+n'?e\s+sono|ne\s+ho|adesso\s+sono|ora\s+sono|in\s+totale\s+sono)\b/.test(t);
}

/* ===== Fallback pattern synonyms + intent set (evita ReferenceError) ===== */
const __DEFAULT_UNIT_SYNONYMS = '(?:unit(?:a|à)?|unit\\b|pz\\.?|pezz(?:i|o)\\.?|bottiglie?|busta(?:e)?|bustine?|lattin(?:a|e)|barattol(?:o|i)|vasett(?:o|i)|vaschett(?:a|e)|brick|cartocc(?:io|i)|fett(?:a|e)|uova|capsul(?:a|e)|pods|rotol(?:o|i)|fogli(?:o|i))';
const __DEFAULT_PACK_SYNONYMS = '(?:conf(?:e(?:zioni)?)?|confezione|pacc?hi?|pack|multipack|scatol(?:a|e)|carton(?:e|i))';

function wantsAbsoluteSet(text = '') {
  const t = normKey(text);
  return /(porta\s+a|imposta\s+a|metti\s+a|fissa\s+a|in\s+totale|totali|ora\s+sono|adesso\s+sono|fai\s+che\s+siano)/i.test(t);
}
function hasAbsoluteKeywords(text = '') {
  const t = normKey(text);
  return /\b(sono|resta(?:no)?|rimane(?:no)?|rimangono|rimasto|rimasti|rimaste|ci\s+sono\s+ancora|ancora)\b/i.test(t);
}

/* ====================== Parser aggiornamenti vocali scorte ====================== */
function parseStockUpdateText(text) {
  const t = normKey(text);
  const parts = t.split(/[,;]+/g).map(s => s.trim()).filter(Boolean);

  const res = [];
  const absoluteGlobal = wantsAbsoluteSet(text) || hasAbsoluteKeywords(text);

  // sinonimi locali (fallback se non esistono globali)
  const UNIT = (typeof UNIT_SYNONYMS === 'string' ? UNIT_SYNONYMS : __DEFAULT_UNIT_SYNONYMS);
  const PACK = (typeof PACK_SYNONYMS === 'string' ? PACK_SYNONYMS : __DEFAULT_PACK_SYNONYMS);

  // parole → numeri
  const WORD_MAP = { un:1, uno:1, una:1, due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7, otto:8, nove:9, dieci:10 };
  const wordToNum = (chunk) => {
    const m = chunk.match(/\b(un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/i);
    return m ? (WORD_MAP[m[1].toLowerCase()] || NaN) : NaN;
  };

  for (let rawChunk of parts) {
    if (/scad|scadenza|scade|entro/.test(rawChunk)) continue;
    if (/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(rawChunk)) continue;
    if (/\b20\d{2}\b/.test(rawChunk)) continue;

    const chunks = rawChunk.split(/\s+e\s+/g).map(s => s.trim()).filter(Boolean);

    for (const chunk of chunks) {
      const name = guessProductName(chunk);
      if (!name) continue;

      const forceSet = hasAbsoluteKeywords(chunk);

      // normalizza parole→cifre per i match
      const src = chunk.replace(
        /\b(un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/gi,
        (m) => WORD_MAP[m.toLowerCase()] ?? m
      );

      // 1) "2 confezioni da 4 bottiglie"
      let m = src.match(new RegExp(`(\\d+)\\s*${PACK}\\s*(?:da|x)\\s*(\\d+)\\s*(?:${UNIT})?`, 'i'));
      if (m) {
        const packs = Math.max(1, Number(m[1] || 1));
        const upp   = Math.max(1, Number(m[2] || 1));
        res.push({ name, mode:'packs', value:packs, op:'restockExplicit', _packs:packs, _upp:upp, explicit:true, forceSet });
        continue;
      }

      // 1bis) "2x4" senza parole
      m = src.match(/(\d+)\s*[x×]\s*(\d+)/i);
      if (m) {
        const packs = Math.max(1, Number(m[1] || 1));
        const upp   = Math.max(1, Number(m[2] || 1));
        res.push({ name, mode:'packs', value:packs, op:'restockExplicit', _packs:packs, _upp:upp, explicit:true, forceSet });
        continue;
      }

      // 2) "2 confezioni 4 bottiglie"
      m = src.match(new RegExp(`(\\d+)\\s*${PACK}.*?\\b(\\d+)\\s*(?:${UNIT})?`, 'i'));
      if (m) {
        const packs = Math.max(1, Number(m[1] || 1));
        const upp   = Math.max(1, Number(m[2] || 1));
        res.push({ name, mode:'packs', value:packs, op:'restockExplicit', _packs:packs, _upp:upp, explicit:true, forceSet });
        continue;
      }

      // 3) Solo UNITA' ("6 bottiglie", "6 pezzi")
      m = src.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIT})\\b`, 'i'));
      if (m) {
        const value = Math.max(0, Number(String(m[1]).replace(',','.')) || 0);
        res.push({ name, mode:'units', value, op: (forceSet || absoluteGlobal) ? 'set' : 'maybeResidue', _packs:1, _upp:value, explicit:false, forceSet });
        continue;
      }

      // 4) Solo PACCHI ("3 confezioni")
      m = src.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${PACK})\\b`, 'i'));
      if (m) {
        const value = Math.max(0, Number(String(m[1]).replace(',','.')) || 0);
        res.push({ name, mode:'packs', value, op: (forceSet || absoluteGlobal) ? 'set' : 'maybeResidue', _packs:value, _upp:1, explicit:false, forceSet });
        continue;
      }

      // 5) Numero scritto come parola
      const wnum = wordToNum(chunk);
      if (Number.isFinite(wnum)) {
        const looksUnits = new RegExp(UNIT, 'i').test(chunk);
        const looksPacks = new RegExp(PACK, 'i').test(chunk);
        if (looksUnits && !looksPacks) {
          res.push({ name, mode:'units', value: wnum, op: (forceSet || absoluteGlobal) ? 'set' : 'maybeResidue', _packs:1, _upp:wnum, explicit:false, forceSet });
        } else {
          res.push({ name, mode:'packs', value: wnum, op: (forceSet || absoluteGlobal) ? 'set' : 'maybeResidue', _packs:wnum, _upp:1, explicit:false, forceSet });
        }
        continue;
      }

      // 6) Numero finale isolato
      const mNum = src.match(/(\d+(?:[.,]\d+)?)\s*$/);
      if (mNum) {
        const value = Math.max(0, Number(String(mNum[1]).replace(',','.')) || 0);
        const looksUnits = new RegExp(UNIT, 'i').test(chunk);
        const looksPacks = new RegExp(PACK, 'i').test(chunk);
        if (looksUnits && !looksPacks) {
          res.push({ name, mode:'units', value, op:(forceSet || absoluteGlobal)?'set':'maybeResidue', _packs:1, _upp:value, explicit:false, forceSet });
        } else if (looksPacks && !looksUnits) {
          res.push({ name, mode:'packs', value, op:(forceSet || absoluteGlobal)?'set':'maybeResidue', _packs:value, _upp:1, explicit:false, forceSet });
        } else {
          res.push({ name, mode:'units', value, op:(forceSet || absoluteGlobal)?'set':'maybeResidue', _packs:1, _upp:value, explicit:false, forceSet });
        }
      }
    }
  }
  return res;
}

/* ====================== Consumi / restock helpers ====================== */
function computeNewAvgDailyUnits(old, newPacks) {
  const upp = Math.max(1, Number(old.unitsPerPack || 1));
  const oldUnits = Number(old.packs || 0) * upp;
  const newUnits = Number(newPacks || 0) * upp;
  let avg = old?.avgDailyUnits || 0;

  if (old?.lastRestockAt && newUnits < oldUnits) {
    const days = Math.max(1, (Date.now() - new Date(old.lastRestockAt).getTime())/86400000);
    const usedUnits = oldUnits - newUnits;
    const day = usedUnits / days;
    avg = avg ? (0.6*avg + 0.4*day) : day;
  }
  return avg;
}
function restockTouch(baselineFromPacks, lastDateISO, unitsPerPack){
  const upp = Math.max(1, Number(unitsPerPack || 1));
  const bp  = Math.max(0, Number(baselineFromPacks || 0));
  const fullUnits = bp * upp;
  return {
    baselinePacks: bp,
    lastRestockAt: lastDateISO,
    residueUnits: fullUnits,
  };
}

/* ====================== Piccola utility media (no-op sicura) ====================== */
function theMediaWorkaround(){ return; }
// ==== Audio Recorder helpers (robust MIME) ====
function pickAudioMime(){
  if (typeof window === 'undefined' || !window.MediaRecorder) {
    return { mime: 'audio/webm', ext: 'webm' };
  }
  const cand = [
    { mime: 'audio/webm;codecs=opus', ext:'webm' },
    { mime: 'audio/ogg;codecs=opus',  ext:'ogg'  },
    { mime: 'audio/mp4',              ext:'m4a'  },
    { mime: 'audio/webm',             ext:'webm' },
  ];
  for (const c of cand) {
    try {
      if (MediaRecorder.isTypeSupported?.(c.mime)) return c;
    } catch(_) {}
  }
  return { mime: '', ext: 'webm' };
}

/* ====================== Utility immagini ====================== */
function withRememberedImage(row, imagesIdx) {
  if (row?.image) return row;
  const k1 = productKey(row?.name, row?.brand || '');
  const k2 = productKey(row?.name, '');
  let img = imagesIdx?.[k1] || imagesIdx?.[k2];

  // fallback fuzzy: trova una chiave il cui "name" è simile
  if (!img && imagesIdx && typeof imagesIdx === 'object') {
    const want = normKey(row?.name || '');
    for (const [key, url] of Object.entries(imagesIdx)) {
      const keyName = key.split('|')[0]; // parte nome
      if (isSimilar(keyName, want)) { img = url; break; }
    }
  }
  return img ? { ...row, image: img } : row;
}
// Coercizioni/utility
function intOr(x, d=0){ const n = Number(String(x).replace(',','.')); return Number.isFinite(n) ? Math.trunc(n) : d; }
function posIntOr(x, d=0){ return Math.max(0, intOr(x, d)); }
function nonEmpty(s){ return String(s||'').trim(); }

/* ====================== Review helpers ====================== */
// Modifica una riga nella modale (usa i setter globali se disponibili)
function handleReviewChange(id, field, value){
  try {
    if (typeof __reviewSetters !== 'undefined' && __reviewSetters) {
      const { setReviewItems /*, setReviewPick*/ } = __reviewSetters;
      setReviewItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
    } else {
      // fallback: se in closure del componente
      setReviewItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
      try {
        const it = reviewItems.find(i => i.id === id);
        if (it) {
          const key = productKey(it.name, it.brand || '');
          setReviewPick(prev => ({ ...prev, [key]: true }));
        }
      } catch {}
    }
  } catch {}
}
function priceNum(x){ const n = Number(String(x).replace(',','.')); return Number.isFinite(n) ? n : 0; }
function derivePriceFields({ packs, priceEach, priceTotal }) {
  const p = Math.max(1, Number(packs || 1));
  let pe = priceNum(priceEach);
  let pt = priceNum(priceTotal);
  if (!pe && pt) pe = pt / p;           // se ho il totale ma non il “cadauno”
  if (!pt && pe) pt = pe * p;           // se ho il “cadauno” ma non il totale
  // arrotonda gentile
  pe = Math.round(pe * 100) / 100;
  pt = Math.round(pt * 100) / 100;
  return { priceEach: pe, priceTotal: pt };
}


// Normalizza le righe prima di aggiungerle
function normalizeReviewedItems(items){
  return (items||[]).map(p => {
    let name = nonEmpty(p.name);
    let brand = nonEmpty(p.brand);
    let packs = posIntOr(p.packs, 1);
    let upp   = posIntOr(p.unitsPerPack, 1);
    let unitLabel = nonEmpty(p.unitLabel) || (upp>1 ? 'pezzi' : 'unità');
    const expiresAt = toISODate(p.expiresAt || '');
    return { name, brand, packs, unitsPerPack: upp, unitLabel, expiresAt,
      priceEach: 0, priceTotal: 0, currency: 'EUR'
    };
  });
}

// Auto-normalizza le righe in modale in base ad alias/normalizzatori appresi
function autoNormalizeReview(){
  setReviewItems(prev => prev.map(it => {
    const ab = (typeof applyLearnedAliases === 'function')
      ? applyLearnedAliases({ name: it.name, brand: it.brand }, learned)
      : { name: it.name, brand: it.brand };
    const brand = (typeof normalizeBrandName === 'function') ? normalizeBrandName(ab.brand) : ab.brand;
    const name  = (typeof normalizeProductName === 'function') ? normalizeProductName(ab.name, brand, `${ab.name} ${brand}`) : ab.name;
    return { ...it, name: name || it.name, brand: brand || it.brand };
  }));
}

// Raccoglie voci NON riconosciute dall'OCR per la modale di validazione
function collectReviewCandidatesFromOCRText(ocrText, purchasesRecognized = []) {
  const existed = new Set((purchasesRecognized || []).map(p => normKey(p.name)));
  const out = [];
  const lines = String(ocrText || '')
    .split(/\r?\n/)
    .map(s => s.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  const KNOWN_BRANDS = ['Mulino Bianco','Ferrero','Motta','Lavazza','Parmalat','Zymil','Garofalo','Eridania',
    'Lenor','Dash','Arborea','Bufalart','Decò','Deco','Saiva','Barilla','Galbani','Santa Lucia'];

  for (let ln of lines) {
    if (/^(documento|descrizione|prezzo|totale|subtotale|pagamento|resto|di\s*cui\s*iva|iva|rt\b|cassa|cassiere|codice|tessera)\b/i.test(ln)) continue;
    if (/^\(off\.\b/i.test(ln)) continue;

    ln = ln.replace(/\s+vi\*?\s*$/i,'')
           .replace(/\s+(?:€|eur|euro)?\s*\d+(?:[.,]\d{2})\s*$/i,'')
           .trim();
    if (!ln) continue;

    let brand = '';
    for (const b of KNOWN_BRANDS) {
      if (new RegExp(`\\b${b.replace(/\s+/g,'\\s+')}\\b`, 'i').test(ln)) { brand = b; break; }
    }
    let name = ln;
    if (typeof normalizeBrandName === 'function') brand = normalizeBrandName(brand || ln);
    if (typeof normalizeProductName === 'function') name  = normalizeProductName(name, brand, ln);

    const key = normKey(name);
    if (!key || existed.has(key)) continue;

    const looksUpper  = /^[A-Z0-9À-ÖØ-Þ][A-Z0-9À-ÖØ-Þ .'-]{4,}$/.test(ln);
    const tokenAlpha  = (ln.match(/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/g) || []).length >= 2;
    if (!(looksUpper || tokenAlpha)) continue;

    out.push({
      id: 'rev-' + key,
      name: name.trim(),
      brand: brand && brand !== name ? brand : '',
      packs: 1, unitsPerPack: 1, unitLabel: 'unità',
      priceEach: 0, priceTotal: 0, currency: 'EUR',
      expiresAt: ''
    });
  }
  return out;
}

function openValidation(/*discardedList, meta*/) {
  return; // modale disattivata
}



/* ====================== Applica aggiunte (liste+scorte+finanze) ====================== */
async function applyAdditionalPurchases(addItems, meta = {}) {
  if (!Array.isArray(addItems) || !addItems.length) return;

  // 1) Decrementa liste
  setLists(prev => decrementAcrossBothLists(prev, addItems));

  // 2) Aggiorna scorte
  setStock(prev => {
    const arr = [...prev]; const todayISO = new Date().toISOString().slice(0,10);
    for (const p of addItems) {
      const idx = arr.findIndex(s => isSimilar(s.name, p.name) && (!p.brand || isSimilar(s.brand||'', p.brand)));
      const packs = Math.max(0, Number(p.packs || 0));
      const upp   = Math.max(1, Number(p.unitsPerPack || 1));
      const hasCounts = packs > 0 || upp > 0;

      if (idx >= 0) {
        const old = arr[idx];
        if (hasCounts) {
          const newP = Math.max(0, Number(old.packs || 0) + packs);
          const newU = Math.max(1, Number(old.unitsPerPack || upp));
          arr[idx] = { ...old, packs:newP, unitsPerPack:newU,
            unitLabel: old.unitLabel || p.unitLabel || 'unità',
            expiresAt: p.expiresAt || old.expiresAt || '',
            packsOnly:false, needsUpdate:false, ...restockTouch(newP, todayISO, newU) };
        } else {
          if (DEFAULT_PACKS_IF_MISSING) {
            const uo = Math.max(1, Number(old.unitsPerPack || 1));
            const np = Math.max(0, Number(old.packs || 0) + 1);
            arr[idx] = { ...old, packs:np, unitsPerPack:uo, unitLabel: old.unitLabel || 'unità',
              packsOnly:false, needsUpdate:false, ...restockTouch(np, todayISO, uo) };
          } else { arr[idx] = { ...old, needsUpdate:true }; }
        }
      } else {
        if (hasCounts) {
          arr.unshift(withRememberedImage({
            name:p.name, brand:p.brand || '', packs, unitsPerPack:upp, unitLabel:p.unitLabel || 'unità',
            expiresAt:p.expiresAt || '', baselinePacks:packs, lastRestockAt:todayISO, avgDailyUnits:0,
            residueUnits:packs*upp, packsOnly:false, needsUpdate:false
          }, imagesIndex));
        } else if (DEFAULT_PACKS_IF_MISSING) {
          arr.unshift(withRememberedImage({
            name:p.name, brand:p.brand || '', packs:1, unitsPerPack:1, unitLabel:'unità',
            expiresAt:p.expiresAt || '', baselinePacks:1, lastRestockAt:todayISO, avgDailyUnits:0,
            residueUnits:1, packsOnly:false, needsUpdate:false
          }, imagesIndex));
        } else {
          arr.unshift(withRememberedImage({
            name:p.name, brand:p.brand || '', packs:0, unitsPerPack:1, unitLabel:'-',
            expiresAt:p.expiresAt || '', baselinePacks:0, lastRestockAt:'', avgDailyUnits:0,
            residueUnits:0, packsOnly:true, needsUpdate:true
          }, imagesIndex));
        }
      }
    }
    return arr;
  });

  // 3) Finanze
  try {
    const itemsSafe = addItems.map(p => ({
      name:p.name, brand:p.brand||'', packs:Number(p.packs||0), unitsPerPack:Number(p.unitsPerPack||0),
      unitLabel:p.unitLabel||'', priceEach:Number(p.priceEach||0), priceTotal:Number(p.priceTotal||0),
      currency:p.currency||'EUR', expiresAt:p.expiresAt||''
    }));
    await fetchJSONStrict(API_FINANCES_INGEST, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        ...(userIdRef.current ? { user_id: userIdRef.current } : {}),
        ...(pendingOcrMeta?.store ? { store: pendingOcrMeta.store } : {}),
        ...(pendingOcrMeta?.purchaseDate ? { purchaseDate: pendingOcrMeta.purchaseDate } : {}),
        payment_method:'cash', card_label:null, items: itemsSafe
      })
    }, 30000);
  } catch(e){ if (DEBUG) console.warn('[FINANCES_INGEST] review add fail', e); }
}

// Conferma selezionati
async function applyReviewSelection() {
  const selected = reviewItems.filter(it => reviewPick[productKey(it.name, it.brand || '')]);
  setReviewOpen(false); setReviewItems([]); setReviewPick({});
  if (!selected.length) return;
  const cleaned = normalizeReviewedItems(selected);
  await applyAdditionalPurchases(cleaned, pendingOcrMeta || {});
  setPendingOcrMeta(null);
  showToast(`Aggiunti ${cleaned.length} articoli convalidati ✓`, 'ok');
}


/* ==== Toggle riconoscimento/agent (arricchimento attivo) ==== */
const ENRICH_MODE = 'on';         // 'off' | 'auto' | 'on'
// Disattiva modale di review/normalizzazione
const ASSIST_TIMEOUT_MS = 15000;  // timeout breve per l'agente
const OCR_IMAGE_MAXSIDE = 1200;
const OCR_IMAGE_QUALITY = 0.66;
const ENABLE_REVIEW = false;

/* ==== DIRECT RECOGNITION (stile ChatGPT Web) ==== */
const DIRECT_RECOGNITION = true;

/** Prompt “diretto”: nessuna normalizzazione, nessun sinonimo, mantieni i nomi come sullo scontrino */
function buildDirectReceiptPrompt(ocrText) {
  return [
    'Sei Jarvis. Estrai le righe di UN SCONTRINO da TESTO OCR.',
    '⚠️ IMPORTANTISSIMO: NON normalizzare, NON tradurre, NON sostituire sinonimi.',
    'Mantieni i nomi (name) esattamente come appaiono sullo scontrino. "brand" solo se è scritto in riga; altrimenti stringa vuota.',
    '',
    'Rispondi SOLO JSON (nessun commento) con schema esatto:',
    '{ "store":"", "purchaseDate":"", "purchases":[{"name":"","brand":"","packs":0,"unitsPerPack":0,"unitLabel":"","priceEach":0,"priceTotal":0,"currency":"EUR","expiresAt":""}] }',
    '',
    'Regole quantità:',
    '- Compila packs/unitsPerPack SOLO se il formato è esplicito (es. "2x6", "2 confezioni da 6", "6 bottiglie").',
    '- Pesi/volumi/dimensioni (g, kg, ml, L, cm, ecc.) NON sono quantità: non usarli per packs/unitsPerPack.',
    '- Se manca la quantità esplicita, lascia packs=0, unitsPerPack=0, unitLabel="".',
    '',
    'Regole prezzi:',
    '- priceEach se presente prezzo unitario; altrimenti 0.',
    '- priceTotal è il totale della riga (non il totale scontrino).',
    '- currency in "EUR" se non indicato.',
    '',
    'Date/Store:',
    '- purchaseDate nel formato YYYY-MM-DD se presente.',
    '- store è il nome dell’esercizio (testo dell’intestazione), non i metodi di pagamento.',
    '',
    '--- INIZIO OCR ---',
    ocrText,
    '--- FINE OCR ---'
  ].join('\n');
}


/* ====================== Component principale ====================== */
function ListeProdotti() {
  const [currentList, setCurrentList] = useState(LIST_TYPES.SUPERMARKET);
  const [lists, setLists] = useState({
    [LIST_TYPES.SUPERMARKET]: [],
    [LIST_TYPES.ONLINE]: [],
  });

  // Form Lista (apri/chiudi)
  const [form, setForm] = useState({ name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità' });
  const [showListForm, setShowListForm] = useState(false);

  // Scorte & critici
  const [stock, setStock] = useState([]);
  const [critical, setCritical] = useState([]);

  // Edit riga scorte
  const [editingRow, setEditingRow] = useState(null);
  const [editDraft, setEditDraft] = useState({
    name: '',
    brand: '',
    packs: '0',
    unitsPerPack: '1',
    unitLabel: 'unità',
    expiresAt: '',
    residueUnits: '0',
    _ruTouched: false,
  });

  // UI / Toast / Busy
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  function showToast(msg, type='ok'){
    setToast({ msg, type });
    setTimeout(() => setToast(null), 1800);
  }

  // Persistenza debounce
  const persistTimerRef = useRef(null);

  // Vocale lista
  theMediaWorkaround();

  const recMimeRef = useRef({ mime: 'audio/webm;codecs=opus', ext: 'webm' });
  const mediaRecRef = useRef(null);
  const recordedChunks = useRef([]);
  const streamRef = useRef(null);
  const [recBusy, setRecBusy] = useState(false);



  // registra i setter per gli helper globali
  useEffect(() => {
    registerReviewSetters({ setReviewItems, setReviewPick, setPendingOcrMeta, setReviewOpen });
  }, []);

  // Learning (memoria prodotti/alias/keep)
  const [learned, setLearned] = useState({
    products: {},
    aliases: { product: {}, brand: {} },
    keepTerms: {},
    discardTerms: {}
  });

  // Vocale inventario unificato
  const invMediaRef = useRef(null);
  const invChunksRef = useRef([]);
  const invStreamRef = useRef(null);
  const [invRecBusy, setInvRecBusy] = useState(false);

  // OCR inputs
  const ocrInputRef = useRef(null);
  const rowOcrInputRef = useRef(null);
  const [targetRowIdx, setTargetRowIdx] = useState(null);

  // Upload immagine per riga scorte
  const rowImageInputRef = useRef(null);
  const [targetImageIdx, setTargetImageIdx] = useState(null);

  // Scorte manuali
  const [stockForm, setStockForm] = useState({ name: '', brand: '', packs: '1', unitsPerPack: '1', unitLabel: 'unità', expiresAt: '' });
  const [showStockForm, setShowStockForm] = useState(false);

  // Scadenze manuali
  const [expiryForm, setExpiryForm] = useState({ name: '', expiresAt: '' });
  const [showExpiryForm, setShowExpiryForm] = useState(false);

  // 🔥 indice immagini: { "latte|parmalat": "data:image/..." }
  const [imagesIndex, setImagesIndex] = useState({});

  const curItems = lists[currentList] || [];

  /* =================== Cloud Sync (Supabase) — opzionale =================== */
  const userIdRef = useRef(null);
  useEffect(() => {
    if (!CLOUD_SYNC) return;
    let mounted = true;

    (async () => {
      try {
        const mod = await import('@/lib/supabaseClient').catch(() => null);
        if (!mod?.supabase) return;
        __supabase = mod.supabase;

        const { data: userData, error: authErr } = await __supabase.auth.getUser();
        if (authErr) return;
        const uid = userData?.user?.id || null;
        if (mounted) userIdRef.current = uid;
        if (!uid) return;

        const { data: row, error } = await __supabase
          .from(CLOUD_TABLE)
          .select('state')
          .eq('user_id', uid)
          .maybeSingle();

        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (!(error.code === '42703' || (msg.includes('column') && msg.includes('does not exist')))) {
            if (DEBUG) console.warn('[cloud] load error', error);
          }
          return;
        }

        const st = row?.state;
        if (!st) return;

        setLists({
          [LIST_TYPES.SUPERMARKET]: Array.isArray(st.lists?.[LIST_TYPES.SUPERMARKET]) ? st.lists[LIST_TYPES.SUPERMARKET] : [],
          [LIST_TYPES.ONLINE]: Array.isArray(st.lists?.[LIST_TYPES.ONLINE]) ? st.lists[LIST_TYPES.ONLINE] : [],
        });
        if (Array.isArray(st.stock)) setStock(st.stock);
        if ([LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].includes(st.currentList)) {
          setCurrentList(st.currentList);
        }
        if (st.learned && typeof st.learned === 'object') setLearned(st.learned);
        //if (st.imagesIndex && typeof st.imagesIndex === 'object') setImagesIndex(st.imagesIndex);
      } catch (e) {
        if (DEBUG) console.warn('[cloud init] skipped', e);
      }
    })();

    return () => { mounted = false; };
  }, []);

/* ==== Helpers per stato "safe" (solo utilità locali, nessun return qui) ==== */
const safeStock = (stock || []).map((s) => {
  const base = { ...s };
  const img = base.image;
  // rimuovi immagini non http/https o troppo lunghe (evita base64 pesanti)
  if (!(typeof img === 'string' && /^https?:\/\//i.test(img) && img.length <= 500)) {
    delete base.image;
  }
  return base;
}); // <-- CHIUSURA map CORRETTA

const safeImagesIndex = {};
if (imagesIndex && typeof imagesIndex === 'object') {
  for (const [k, v] of Object.entries(imagesIndex)) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v) && v.length <= 500) {
      safeImagesIndex[k] = v;
    }
  }
}

const safeLearned =
  learned && typeof learned === 'object'
    ? learned
    : { products: {}, aliases: { product: {}, brand: {} }, keepTerms: {}, discardTerms: {} };

const cur = [LIST_TYPES.SUPERMARKET, LIST_TYPES.ONLINE].includes(currentList)
  ? currentList
  : LIST_TYPES.SUPERMARKET;
// (niente return qui)


  const cloudTimerRef = useRef(null);
  useEffect(() => {
    if (!CLOUD_SYNC || !__supabase) return;
    if (!userIdRef.current) return;

    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);

    // NON mandiamo imagesIndex in cloud, e togliamo field .image
   const cloudState = stripForCloud({ lists, stock, currentList, learned, imagesIndex });

    const payload = { user_id: userIdRef.current, state: cloudState };

    cloudTimerRef.current = setTimeout(async () => {
      try {
        await __supabase
          .from(CLOUD_TABLE)
          .upsert(payload, { onConflict: 'user_id' }); // returning minimal
      } catch (e) {
        if (DEBUG) console.warn('[cloud upsert] fail', e);
      }
    }, 1200);

    return () => clearTimeout(cloudTimerRef.current);
  }, [lists, stock, currentList, learned]);

  /* === Brain Hub – versione robusta (evita forme incompatibili) === */
  const HUB_KEY = '__jarvisBrainHub_v2';
  function getHub() {
    if (typeof window === 'undefined') return null;
    const h = window[HUB_KEY];

    const isValid =
      h &&
      typeof h === 'object' &&
      typeof h.registerDataSource === 'function' &&
      typeof h.registerCommand === 'function' &&
      h._datasources instanceof Map &&
      h._commands instanceof Map;

    if (isValid) return h;

    const hub = {
      _datasources: new Map(),
      _commands: new Map(),
      registerDataSource(def) {
        if (!def?.name) return;
        this._datasources.set(def.name, def);
      },
      registerCommand(def) {
        if (!def?.name) return;
        this._commands.set(def.name, def);
      },
      async ask(name, payload) {
        const ds = this._datasources.get(name);
        return ds?.fetch(payload);
      },
      async run(name, payload) {
        const cmd = this._commands.get(name);
        return cmd?.execute(payload);
      },
      list() {
        return {
          datasources: [...this._datasources.keys() ],
          commands:    [...this._commands.keys()    ],
        };
      },
    };

    window[HUB_KEY] = hub;
    return hub;
  }

  useEffect(() => {
    const hub = getHub();
    if (!hub) return;

    const safeRegDS = (def) => {
      if (!hub._datasources.has(def.name)) hub.registerDataSource(def);
    }

    safeRegDS({
      name: 'scorte-complete',
      fetch: () => {
        return (stock || []).map((s) => {
          const upp = Math.max(1, Number(s.unitsPerPack || 1));
          const residueUnits = s.packsOnly
            ? Math.max(0, Number(s.packs || 0))
            : (Number.isFinite(Number(s.residueUnits))
                ? Math.max(0, Number(s.residueUnits))
                : Math.max(0, Number(s.packs || 0) * upp));
          const baselineUnits = s.packsOnly
            ? Math.max(1, Number(s.baselinePacks || s.packs || 1))
            : Math.max(
                upp,
                Number(s.baselinePacks) > 0 ? Number(s.baselinePacks) * upp : Number(s.packs || 0) * upp
              );
          const avgDailyUnits = Number(s.avgDailyUnits || 0);
          return {
            name: String(s.name || '').trim(),
            brand: String(s.brand || '').trim(),
            packs: Number(s.packs || 0),
            unitsPerPack: upp,
            unitLabel: s.unitLabel || 'unità',
            residueUnits,
            baselineUnits,
            avgDailyUnits,
            expiresAt: s.expiresAt || '',
          };
        });
      },
    });

    safeRegDS({
      name: 'scorte-esaurimento',
      fetch: () => {
        return (stock || []).filter((s) => {
          const upp = Math.max(1, Number(s.unitsPerPack || 1));
          const currentUnits = s.packsOnly
            ? Math.max(0, Number(s.packs || 0))
            : (Number.isFinite(Number(s.residueUnits)) ? Math.max(0, Number(s.residueUnits)) : Math.max(0, Number(s.packs || 0) * upp));
          const baselineUnits = s.packsOnly
            ? Math.max(1, Number(s.baselinePacks || s.packs || 1))
            : Math.max(upp, (Number(s.baselinePacks) > 0 ? Number(s.baselinePacks) * upp : Number(s.packs || 0) * upp));
          return baselineUnits > 0 && (currentUnits / baselineUnits) < 0.2;
        });
      },
    });

    safeRegDS({
      name: 'scorte-scadenza',
      fetch: ({ entroGiorni = 10 } = {}) => (stock || []).filter((s) => isExpiringSoon(s, entroGiorni)),
    });

    safeRegDS({
      name: 'scorte-giorni-esaurimento',
      fetch: () => {
        const out = [];
        for (const s of stock || []) {
          const upp = Math.max(1, Number(s.unitsPerPack || 1));
          const currentUnits = s.packsOnly
            ? Math.max(0, Number(s.packs || 0))
            : (Number.isFinite(Number(s.residueUnits)) ? Math.max(0, Number(s.residueUnits)) : Math.max(0, Number(s.packs || 0) * upp));
          const day = Number(s.avgDailyUnits || 0);
          const days = day > 0 ? Math.ceil(currentUnits / day) : null;
          out.push({
            name: s.name,
            brand: s.brand || '',
            unitLabel: s.unitLabel || 'unità',
            residueUnits: currentUnits,
            avgDailyUnits: day,
            daysToDepletion: days,
          });
        }
        return out;
      },
    });
  }, [stock, lists]);

   /* =================== Hydration iniziale (locale) =================== */
useEffect(() => {
  if (typeof window === 'undefined') return;
  const saved = loadPersisted();
  if (!saved) return;

  if (saved.lists && typeof saved.lists === 'object') {
    setLists({
      [LIST_TYPES.SUPERMARKET]: Array.isArray(saved.lists[LIST_TYPES.SUPERMARKET])
        ? saved.lists[LIST_TYPES.SUPERMARKET]
        : [],
      [LIST_TYPES.ONLINE]: Array.isArray(saved.lists[LIST_TYPES.ONLINE])
        ? saved.lists[LIST_TYPES.ONLINE]
        : [],
    });
  }

  if (Array.isArray(saved.stock)) setStock(saved.stock);

  if (
    saved.currentList &&
    (saved.currentList === LIST_TYPES.SUPERMARKET || saved.currentList === LIST_TYPES.ONLINE)
  ) {
    setCurrentList(saved.currentList);
  }

  if (saved.imagesIndex && typeof saved.imagesIndex === 'object') {
    setImagesIndex(saved.imagesIndex);
  }

  if (saved.learned && typeof saved.learned === 'object') {
    setLearned(saved.learned);
  }
}, []);


/* =================== Autosave debounce (locale) =================== */
// tiene traccia dell’ultimo salvataggio locale applicato (per confronto negli eventi storage)
const lastLocalAtRef = useRef(0);

useEffect(() => {
  if (typeof window === 'undefined') return;

  // clear eventuale debounce precedente
  if (persistTimerRef.current) clearTimeout(persistTimerRef.current);

  // snapshot dell’attuale stato che vogliamo persistere
  const snapshot = { lists, stock, currentList, imagesIndex, learned };

  // debounce breve per ridurre I/O su localStorage
  persistTimerRef.current = setTimeout(() => {
    try {
      // salva su localStorage (persistNow imposta anche "at")
      persistNow(snapshot);
      // aggiorna il timestamp locale per i confronti cross-tab
      lastLocalAtRef.current = Date.now();
    } catch (e) {
      if (DEBUG) console.warn('[persistNow] failed', e);
    }
  }, 300);

  return () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  };
}, [lists, stock, currentList, imagesIndex, learned]);

/* =================== Sync tra tab (robusto) =================== */
useEffect(() => {
  if (typeof window === 'undefined') return;

  const onStorage = (e) => {
    if (e.key !== LS_KEY) return;

    const saved = loadPersisted();
    if (!saved || saved.v !== LS_VER) return;

    // ignora snapshot senza timestamp o NON più nuovi
    const savedAt = Number(saved.at || 0);
    const lastAt  = Number(lastLocalAtRef.current || 0);
    if (!savedAt || savedAt <= lastAt) {
      if (DEBUG) console.log('[storage] ignorato (vecchio/uguale)', { savedAt, lastAt });
      return;
    }

    if (DEBUG) console.log('[storage] applico stato più recente', { savedAt, lastAt });

    setLists({
      [LIST_TYPES.SUPERMARKET]: Array.isArray(saved.lists?.[LIST_TYPES.SUPERMARKET]) ? saved.lists[LIST_TYPES.SUPERMARKET] : [],
      [LIST_TYPES.ONLINE]:      Array.isArray(saved.lists?.[LIST_TYPES.ONLINE])      ? saved.lists[LIST_TYPES.ONLINE]      : [],
    });
    setStock(Array.isArray(saved.stock) ? saved.stock : []);
    setCurrentList(saved.currentList === LIST_TYPES.ONLINE ? LIST_TYPES.ONLINE : LIST_TYPES.SUPERMARKET);
    setImagesIndex(saved.imagesIndex && typeof saved.imagesIndex === 'object' ? saved.imagesIndex : {});

    // IMPORTANTISSIMO: porta avanti il nostro “last”
    lastLocalAtRef.current = savedAt;
  };

  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}, []);


/* =================== Derivati: critici =================== */
// helper “safe” (non ridefinisce eventuali versioni globali)
function daysToExpirySafe(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((t - Date.now()) / 86400000);
}
function isExpiringSoonSafe(item, days = 10) {
  return daysToExpirySafe(item?.expiresAt) <= days;
}

useEffect(() => {
  const crit = (stock || []).filter((p) => {
    const current  = residueUnitsOf(p);
    const baseline = baselineUnitsOf(p);
    const pct = baseline ? current / baseline : 1;
    const lowResidue = pct < 0.2;
    const expSoon    = isExpiringSoonSafe(p, 10);
    return lowResidue || expSoon;
  });
  setCritical(crit);
}, [stock]);

// elimina una riga di scorte per indice (serve negli onClick)
const deleteStockRow = useCallback((index) => {
  setStock((prev) => prev.filter((_, i) => i !== index));
  // aggiorna subito il "lastAt" così eventuali storage più vecchi vengono ignorati
  lastLocalAtRef.current = Date.now();
}, []);

}; 

   /* =================== Styles (identici) =================== */
const styles = {
    page: {
    minHeight:'100vh',
    // completamente trasparente per mostrare lo sfondo globale
    background:'transparent',
    padding:'24px 16px',
    color:'#f8f1dc',
    textShadow:'0 0 6px rgba(255,245,200,.15)'
  },


  // Card trasparente
  card: {
    maxWidth:1000, margin:'0 auto',
    background:'transparent',
    backdropFilter:'none',
    border:'1px solid rgba(255,255,255,.06)',
    borderRadius:18, padding:16,
    boxShadow:'none'
  },

  headerRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:8 },
  title3d:{
    margin:0, fontSize:'1.6rem', letterSpacing:.6, fontWeight:800,
    textShadow:'0 2px 0 #1b2230, 0 0 14px rgba(140,200,255,.35), 0 0 2px rgba(255,255,255,.25)'
  },
  homeBtn:{ padding:'8px 12px', borderRadius:10, background:'linear-gradient(180deg,#1f2937,#111827)', color:'#e5e7eb', border:'1px solid #334155' },
  actionGhost:{ padding:'8px 12px', borderRadius:10, background:'transparent', color:'#cbd5e1', border:'1px solid #334155' },

  switchRow:{ display:'flex', gap:8, marginTop:4, marginBottom:10, flexWrap:'wrap' },
  switchBtn:{ padding:'10px 14px', borderRadius:999, border:'1px solid #334155', background:'rgba(17,24,39,.6)', color:'#e5e7eb' },
  switchBtnActive:{ padding:'10px 14px', borderRadius:999, border:'1px solid #65a30d', background:'linear-gradient(180deg,#166534,#14532d)', color:'#ecfccb', boxShadow:'inset 0 0 0 1px rgba(255,255,255,.08), 0 8px 18px rgba(0,0,0,.35)' },

  toolsRow:{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', margin:'8px 0 2px' },
  voiceBtn:{ padding:'10px 14px', borderRadius:12, border:'1px solid #334155', background:'linear-gradient(180deg,#0ea5e9,#0284c7)', color:'#05243a', fontWeight:800 },
  primaryBtn:{ padding:'10px 14px', borderRadius:12, border:'1px solid #334155', background:'linear-gradient(180deg,#16a34a,#15803d)', color:'#f0fdf4', fontWeight:700 },

    sectionLarge: {
    marginTop:18,
    padding:12,
    borderRadius:14,
    background:'transparent',                  // ← trasparente
    border:'1px solid rgba(255,255,255,.06)',  // bordo leggero
    boxShadow:'none'                           // niente ombra grigia
  },
  sectionLifted: {
    marginTop:18,
    padding:14,
    borderRadius:16,
    background:'transparent',                  // ← trasparente
    border:'1px solid rgba(255,255,255,.08)',
    boxShadow:'none'                           // niente ombra grigia
  },
  // —————————————————— Aggiungi questi nuovi stili ——————————————————
    iconCircle: {
    width:38, height:38, minWidth:38,
    display:'grid', placeItems:'center',
    borderRadius:999,
    border:'1px solid rgba(255,255,255,.18)',
    background:'rgba(15,23,42,.35)',   // vetro scuro trasparente
    color:'#e5e7eb',
    boxShadow:'0 2px 8px rgba(0,0,0,.35)',
    cursor:'pointer'
  },

  h3:{ margin:'6px 0 10px', fontSize:'1.25rem', fontWeight:700, color:'#f9fafb' },
  h4:{ margin:'6px 0 6px', fontSize:'1.05rem', fontWeight:700, color:'#e5e7eb' },

  // LISTA PRODOTTI: card rosse a pillola + bottoni icona
  listCardRed: {
    display:'flex',
    justifyContent:'space-between',
    alignItems:'center',
    gap:10,
    padding:'12px 14px',
    borderRadius:16,
    cursor:'pointer',
    userSelect:'none',
    background:'linear-gradient(180deg, #7f1d1d, #991b1b)',
    border:'1px solid #450a0a',
    boxShadow:'inset 0 0 0 1px rgba(255,255,255,.04), 0 8px 18px rgba(0,0,0,.35)',
  },
  listCardRedBought: {
    background:'linear-gradient(180deg, #166534, #14532d)',
    border:'1px solid #0f5132',
    textDecoration:'line-through',
    opacity:.9
  },
  iconBtnBase:{
    width:36, height:36, minWidth:36,
    display:'grid', placeItems:'center',
    borderRadius:999,
    border:'1px solid rgba(255,255,255,.15)',
    background:'rgba(15,23,42,.55)',
    color:'#f8fafc',
    fontWeight:800,
    boxShadow:'0 2px 8px rgba(0,0,0,.35)'
  },
  iconBtnGreen:{
    background:'linear-gradient(180deg, #16a34a, #15803d)',
    border:'1px solid #166534',
    color:'#ffffff'
  },
  iconBtnDark:{
    background:'linear-gradient(180deg, #0f172a, #111827)',
    border:'1px solid #334155',
    color:'#e5e7eb'
  },
  ocrPillBtn:{
    padding:'8px 12px',
    borderRadius:12,
    border:'1px solid #7f1d1d',
    background:'linear-gradient(180deg, #991b1b, #7f1d1d)',
    color:'#fde68a',
    fontWeight:700
  },
  trashBtn:{
    padding:'8px 10px',
    borderRadius:12,
    border:'1px solid #4b5563',
    background:'linear-gradient(180deg,#1f2937,#111827)',
    color:'#f87171',
    fontWeight:700
  },

  // LISTA — testo
  rowLeft:{ flex:1, minWidth:0 },
  rowName:{ fontSize:'1.05rem', fontWeight:600, color:'#fff' },
  rowBrand:{ opacity:.8, fontWeight:400, marginLeft:4 },
  rowMeta:{ fontSize:'.85rem', opacity:.85, marginTop:2 },
  badgeBought:{ marginLeft:6, padding:'2px 6px', borderRadius:8, background:'#166534', color:'#dcfce7', fontSize:'.75rem' },
  badgeToBuy:{ marginLeft:6, padding:'2px 6px', borderRadius:8, background:'#7f1d1d', color:'#fee2e2', fontSize:'.75rem' },
  rowActions:{ display:'flex', gap:6, alignItems:'center' },
  rowActionsRight:{ display:'flex', gap:6, alignItems:'center', marginLeft:10 },

  // STOCK / SCORTE
  stockList:{ display:'flex', flexDirection:'column', gap:6, marginTop:6 },
  stockLineZ1:{ background:'rgba(255,255,255,.02)', padding:10, borderRadius:10 },
  stockLineZ2:{ background:'rgba(0,0,0,.15)', padding:10, borderRadius:10 },
  stockRow:{ display:'flex', alignItems:'center', gap:10 },
  stockTitle:{ fontSize:'1rem', fontWeight:600, marginBottom:4 },
  stockLineSmall:{ fontSize:'.85rem', opacity:.9, marginTop:2 },

  imageBox:{
    width:56, height:56, borderRadius:10,
    border:'1px dashed #64748b',
    display:'grid', placeItems:'center',
    overflow:'hidden',
    cursor:'pointer',
    background:'rgba(255,255,255,.04)'
  },
  imageThumb:{ width:'100%', height:'100%', objectFit:'cover' },
  imagePlaceholder:{ fontSize:'1.5rem', color:'#94a3b8' },

  kvCol:{ minWidth:90, textAlign:'center' },
  kvLabel:{ fontSize:'.75rem', opacity:.75 },
  kvValue:{ fontSize:'1rem', fontWeight:600 },

  progressOuterBig:{ height:10, background:'rgba(255,255,255,.1)', borderRadius:6, overflow:'hidden', marginTop:2 },
  progressOuterCrit:{ height:8, background:'rgba(255,255,255,.08)', borderRadius:6, overflow:'hidden', flex:1 },
  progressInner:{ height:'100%' },

  critListWrap:{ display:'flex', flexDirection:'column', gap:6 },
  critRow:{ display:'flex', alignItems:'center', gap:10, padding:6, borderRadius:8, background:'rgba(255,255,255,.04)' },
  critName:{ flex:1, fontWeight:600 },
  critMeta:{ fontSize:'.8rem', opacity:.9 },
  expiryChip:{ marginLeft:6, padding:'1px 5px', borderRadius:6, background:'#7f1d1d', color:'#fee2e2', fontSize:'.7rem' },

  // Bottoni piccoli
  smallOkBtn:{ padding:'6px 10px', borderRadius:8, background:'#16a34a', color:'#fff', fontWeight:700, border:'none' },
  smallGhostBtn:{ padding:'6px 10px', borderRadius:8, background:'transparent', border:'1px solid #475569', color:'#e2e8f0' },
  smallDangerBtn:{ padding:'6px 10px', borderRadius:8, background:'#991b1b', border:'1px solid #7f1d1d', color:'#fee2e2' },

  formRow:{ display:'flex', flexWrap:'wrap', gap:8, marginTop:6 },
  formRowWrap:{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' },
   input:{
    flex:1,
    minWidth:120,
    padding:'8px 10px',
    borderRadius:8,
    border:'1px solid #475569',
    background:'rgba(15,23,42,.65)',
    color:'#f1f5f9'
  }, // ⬅️ VIRGOLA QUI
  iconSquareBase: {
    width: 38,
    height: 38,
    minWidth: 38,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 12,
    border: '1px solid #4b5563',
    background: 'linear-gradient(180deg,#1f2937,#111827)',
    color: '#e5e7eb',
    boxShadow: '0 2px 8px rgba(0,0,0,.35)',
    cursor: 'pointer',
  },

    iconDanger: {
    color: '#f87171',
  },


  sectionLarge: {
    marginTop: '2rem',
    padding: '1rem',
  },

  // ===== VIDEO OCR "GRANDE" (full width, come titolo + tasto) =====
  ocrVideoBtnXL: {
    all: 'unset',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    minHeight: 84,
    padding: '10px 14px',
    borderRadius: 14,
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    boxShadow: '0 8px 20px rgba(0,0,0,.28)',
    transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
  },

  ocrVideoXL: {
    display: 'block',
    height: 64,
    width: 'auto',
    objectFit: 'contain',
    pointerEvents: 'none',
    filter: 'drop-shadow(0 0 10px rgba(120,220,255,.55)) drop-shadow(0 0 22px rgba(80,200,255,.35))',
  },

  ocrVideoLabel: {
    flex: 1,
    fontWeight: 800,
    fontSize: '1.25rem',
    letterSpacing: '.02em',
    color: '#e6f7ff',
    textShadow: '0 0 10px rgba(120,220,255,.55), 0 0 18px rgba(80,200,255,.35)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
    ocrVideoBtn: {
    all: 'unset',
    cursor: 'pointer',
    display: 'inline-block',
    borderRadius: 12,
    overflow: 'hidden',
    width: 84,
    height: 84,
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    boxShadow: '0 4px 12px rgba(0,0,0,.25)',
    transition:
      'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
  },

  ocrVideo: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none', // così il click passa al button
    filter:
      'drop-shadow(0 0 6px rgba(120,220,255,.45)) drop-shadow(0 0 14px rgba(80,200,255,.25))',
  },
    ocrRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },

  ocrVideoBtn: {
    all: 'unset',
    cursor: 'pointer',
    display: 'inline-block',
    borderRadius: 14,
    overflow: 'hidden',
    width: 96,   // 👈 leggermente più grande
    height: 96,  // 👈 leggermente più grande
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    boxShadow: '0 4px 12px rgba(0,0,0,.25)',
    transition:
      'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
  },

  ocrVideo: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
    filter:
      'drop-shadow(0 0 6px rgba(120,220,255,.45)) drop-shadow(0 0 14px rgba(80,200,255,.25))',
  },

  ocrText: {
    flex: 1,
    fontSize: '1.05rem',
    fontWeight: 500,
    fontFamily: "'Poppins', 'Inter', sans-serif", // 👈 carattere elegante e moderno
    color: '#e6f7ff',
    textShadow:
      '0 0 6px rgba(120,220,255,.45), 0 0 12px rgba(80,200,255,.25)',
    lineHeight: 1.4,
  },
  switchImgRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 14,
  },
  switchImgBtn: {
    all: 'unset',
    cursor: 'pointer',
    display: 'inline-grid',
    placeItems: 'center',
    borderRadius: 12,
    background: 'rgba(255,255,255,.04)',
    border: '1px solid rgba(255,255,255,.08)',
    boxShadow: '0 6px 16px rgba(0,0,0,.28)',
    transition: 'transform .18s ease, box-shadow .18s ease',
  },
  switchImg: {
    display: 'block',
    width: '100%',
    height: 'auto',
  },
    switchImgBtn: {
    appearance: 'none',
    border: 0,
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    lineHeight: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',

    /* --- Arrotondamento e maschera --- */
    borderRadius: 16,
    overflow: 'hidden',

    /* --- Effetto rilievo / vetro --- */
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(4px)',
    boxShadow:
      'inset 0 1px 3px rgba(255,255,255,.25), ' +  // highlight interno
      '0 4px 12px rgba(0,0,0,.35)',                 // ombra esterna
    border: '1px solid rgba(255,255,255,.12)',

    transition: 'transform .18s ease, box-shadow .18s ease',
  },

  switchImgBtnHover: {
    transform: 'translateY(-2px) scale(1.02)',
    boxShadow:
      'inset 0 1px 3px rgba(255,255,255,.25), ' +
      '0 8px 20px rgba(0,0,0,.45)',
    borderColor: 'rgba(148,233,255,.35)',
  },

  switchImg: {
    display: 'block',
    width: '100%',
    height: 'auto',
    pointerEvents: 'none',   // clic solo sul button
    borderRadius: 16,        // segue il contenitore
  },
voiceVideoBtn: {
  all: 'unset',
  cursor: 'pointer',
  display: 'inline-grid',
  placeItems: 'center',
  width: 96,
  height: 96,
  borderRadius: '50%',
  overflow: 'hidden',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  boxShadow: '0 4px 12px rgba(0,0,0,.35), inset 0 2px 6px rgba(255,255,255,.12)',
  transition: 'transform .18s ease, box-shadow .18s ease',
},
  voiceVideoBtn: {
    all: 'unset',
    cursor: 'pointer',
    display: 'inline-block',
    width: 100,    // quadrato più grande
    height: 100,
    borderRadius: 18,     // angoli arrotondati ma forma quadrata
    overflow: 'hidden',
    background: 'linear-gradient(180deg,#1f2937,#111827)', // base scura
    border: '1px solid rgba(255,255,255,.2)',
    boxShadow:
      'inset 0 1px 3px rgba(255,255,255,.25), ' + // highlight interno
      '0 6px 14px rgba(0,0,0,.45)',               // ombra esterna
    transition: 'transform .15s ease, box-shadow .15s ease',
  },

  voiceVideoBtnHover: {
    transform: 'translateY(-2px) scale(1.02)',
    boxShadow:
      'inset 0 1px 3px rgba(255,255,255,.25), ' +
      '0 10px 20px rgba(0,0,0,.55)',
    borderColor: 'rgba(148,233,255,.35)',
  },

  voiceVideo: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
    filter:
      'drop-shadow(0 0 6px rgba(120,220,255,.45)) ' +
      'drop-shadow(0 0 14px rgba(80,200,255,.25))',
  },
iconCircle: {
  width: 42,
  height: 42,
  minWidth: 42,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 12, // più squadrato invece che cerchio
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(15,23,42,.35)',
  boxShadow: '0 2px 6px rgba(0,0,0,.4)',
  cursor: 'pointer',
  overflow: 'hidden',
},
headerRowScorte: {
  display: 'grid',
  gridTemplateColumns: '1fr auto', // banner | comandi
  alignItems: 'center',
  gap: 12,
  width: '100%',
},

// Banner sottile tipo "titolo"
headerBannerBox: {
  height: 96,                 // <- PUOI RENDERLO PIÙ SOTTILE (es. 80)
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 6px 16px rgba(0,0,0,.35)',
  background: 'rgba(0,0,0,.5)',
},

headerBannerVideo: {
  width: '100%',
  height: '160%',
  objectFit: 'cover',         // niente bande: riempie e taglia sopra/sotto
  objectPosition: 'center',   // centra (muletto + scritte)
  display: 'block',
},

headerActions: {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
},

headerIcon: {
  width: 42,
  height: 42,
  minWidth: 42,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(15,23,42,.35)',
  boxShadow: '0 2px 6px rgba(0,0,0,.4)',
  cursor: 'pointer',
},
headerRowScorte: {
  // wrapper del titolo "Stato Scorte": colonna, piena larghezza
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 10,
  width: '100%',
},

// Banner: piena larghezza, altezza controllabile
headerBannerBox: {
  width: '100%',
  height: 120,               // ← REGOLA qui l'altezza per far vedere muletto + scritta
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 6px 16px rgba(0,0,0,.35)',
  background: 'rgba(0,0,0,.5)',
},

headerBannerVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',        // riempie senza bande
  objectPosition: 'center',  // centra soggetti (muletto + scritta)
  display: 'block',
},

// Pulsanti sotto al banner
headerActions: {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
},
scorteSection: {
  position: 'relative',
  marginTop: 18,
  borderRadius: 16,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,.08)',
  // padding solo per il contenuto (il bg è assoluto)
},

scorteBg: {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  pointerEvents: 'none',
},

scorteBgVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
},

scorteBgOverlay: {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.45))',
},

scorteContent: {
  position: 'relative',
  zIndex: 1,
  padding: 14,
},

scorteHeader: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 8,
},
  /* ——— Banner largo con video + tasti sotto ——— */
bannerArea: {
  marginTop: 12,
},
bannerBox: {
  position: 'relative',
  width: '100%',
  height: 120,                 // ← altezza del banner (120–180 a gusto)
  borderRadius: 16,
  overflow: 'hidden',
  background: 'rgba(0,0,0,.6)',
  boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  border: '1px solid rgba(255,255,255,.10)',
},
bannerVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  backgroundColor: '#000', 
   objectPosition: 'right center', // 👈 sposta tutto a destra 
  display: 'block',
},
bannerOverlay: {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.45))',
  pointerEvents: 'none',
},
bannerButtons: {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginTop: 10,
  /* cambia l’allineamento qui: */
  justifyContent: 'flex-start', // 'center' | 'flex-end' | 'space-between'
},
/* === STILI BANNER STATO SCORTE === */
bannerArea: {
  width: '100%',
  margin: '24px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
},

bannerBox: {
  position: 'relative',
  width: '100%',
  maxWidth: '100%',       // banner sempre a tutta larghezza sezione
  borderRadius: 14,
  overflow: 'hidden',
  boxShadow: '0 6px 18px rgba(0,0,0,.4)',
},

bannerVideo: {
  display: 'block',
  width: '25%',
  height: '120px',        // 👈 altezza fissa ottimizzata per PC
  objectFit: 'cover',     // ritaglia solo sopra/sotto
  objectPosition: 'center', // centra scritta + muletto
  borderRadius: 14,
},

bannerOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.1)',
},

/* OCR + Tasti sotto al banner */
ocrRow: {
  display: 'flex',
  gap: 12,
  justifyContent: 'center',
  alignItems: 'center',
  flexWrap: 'wrap',
  marginTop: 8,
},

ocrVideoBtn: {
  width: 64,
  height: 64,
  borderRadius: 16,
  overflow: 'hidden',
  padding: 0,
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 10px rgba(0,0,0,.25)',
},

ocrVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
},

voiceVideoBtn: {
  width: 64,
  height: 64,
  borderRadius: 16,
  overflow: 'hidden',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 10px rgba(0,0,0,.25)',
},

voiceVideoBtnHover: {
  transform: 'scale(1.05)',
  transition: 'transform 0.2s ease',
},

voiceVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
},
/* === LAYOUT SEZIONI === */
sectionBox: {
  marginTop: 18,
  padding: 14,
  borderRadius: 16,
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.12)',
  boxShadow: '0 10px 24px rgba(0,0,0,.28)',
},
sectionInner: {
  marginTop: 10,
},

kicker: {
  margin: 0,
  marginBottom: 8,
  fontSize: '0.95rem',
  fontWeight: 700,
  letterSpacing: '.02em',
  textTransform: 'none',
  color: '#eaf7ff',
  textShadow: '0 1px 0 rgba(0,0,0,.45)',
  borderLeft: '3px solid rgba(148,233,255,.65)',
  paddingLeft: 10,
  opacity: .95,
},

/* === SEZIONE 1: BANNER FULL-BLEED === */
sec1FullBleed: {
  position: 'relative',
  width: '100%',
  /* altezza della “striscia” banner: regola a piacere */
  height: 160,                 // es: 140–200 per più/meno taglio
  borderRadius: 16,
  backgroundColor: '#4B4336',  
  boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  border: '1px solid rgba(255,255,255,.10)',
  margin: '8px 0 14px'
},

sec1Video: {
  width: '30%',
  height: '100%',
  display: 'block',
  objectFit: 'cover',          // riempi e taglia sopra/sotto
  /* sposta la “finestra” verticale per decidere cosa si vede */
  objectPosition: 'center 75%' // ↓ aumenta per scendere, ↓ diminuisci per salire
  // esempi: 'center 30%' (più alto), 'center 50%' (centrato), 'center 65%' (più basso)
},

sec1Overlay: {
  position: 'absolute',
  inset: 0,
  /* leggero velo per leggibilità */
  background: 'linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.08))',
  pointerEvents: 'none'
},
voiceVideoBtn: {
  position: 'relative',            // <— serve per ancorare la maschera
  width: 100,
  height: 100,
  borderRadius: 22,
  padding: 0,
  border: 'none',
  background: 'linear-gradient(180deg,#1f2937,#111827)',
  boxShadow: '0 6px 14px rgba(0,0,0,.45), inset 0 1px 3px rgba(255,255,255,.22)',
  cursor: 'pointer',
  overflow: 'visible'              // la maschera sotto farà il taglio
},

// “cornice” interna che definisce il ritaglio (puoi cambiare gli inset)
voiceCrop: {
  position: 'absolute',
  top: 10,                         // ← taglio sopra
  right: 10,                       // ← taglio a dx
  bottom: 10,                      // ← taglio sotto
  left: 10,                        // ← taglio a sx
  borderRadius: 18,                // raggio interno ≈ al rettangolo neon
  overflow: 'hidden',              // <— il vero taglio
  pointerEvents: 'none'            // il click passa al bottone
},

voiceVideo: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  // opzionale: ritaglio ancora più preciso con angoli arrotondati
  // clipPath: 'inset(6% 6% 10% 6% round 18px)',
  filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' // niente alone aggiuntivo
},
voiceVideoBtn: {
  position: 'relative',
  width: 100, height: 100,
  borderRadius: 22,
  background: 'linear-gradient(180deg,#1f2937,#111827)',
  border: 'none', padding: 0, cursor: 'pointer',
  boxShadow: '0 6px 14px rgba(0,0,0,.45), inset 0 1px 3px rgba(255,255,255,.22)',
  overflow: 'visible'
},

// Maschera che taglia tutto fuori dal bordo giallo
voiceCrop: {
  position: 'absolute',
  inset: 10,                      // padding interno dal bordo esterno del tasto
  overflow: 'hidden',             // taglio fisico
  borderRadius: 18,
  // clip ancora più precisa (taglio in % su ogni lato)
  clipPath: 'inset(7% 6% 9% 6% round 18px)',
  WebkitClipPath: 'inset(7% 6% 9% 6% round 18px)'
},

voiceVideo: {
  width: '100%', height: '100%',
  objectFit: 'cover',
  display: 'block',
  borderRadius: 0, boxShadow: 'none'   // evita aloni/curve indesiderate
},
  ocr42: {
    width: 42,
    height: 42,
    minWidth: 42,
    minHeight: 42,
    padding: 0,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,.18)',
    background: 'transparent',           // fondo trasparente
    display: 'inline-grid',
    placeItems: 'center',
    overflow: 'hidden',                  // taglia il video perfettamente
    boxShadow:
      'inset 0 1px 1px rgba(255,255,255,.25),' + // piccolo highlight interno
      '0 2px 6px rgba(0,0,0,.35)',               // ombra esterna soft
    cursor: 'pointer',
  },

  ocr42Video: {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',      // riempie senza bande
    pointerEvents: 'none',   // il click passa al button
    transform: 'translateZ(0)', // evita aliasing/blur su alcuni browser
  },
  // contenitore 42x42 con ritaglio, rilievo leggero
  voice42: {
    width: 42,
    height: 42,
    borderRadius: 12,
    padding: 0,
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(0,0,0,.18)',
    display: 'inline-grid',
    placeItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,.35), inset 0 1px 1px rgba(255,255,255,.18)',
    overflow: 'hidden',        // 👉 taglia il video ai bordi arrotondati
    cursor: 'pointer'
  },

  // il video riempie e viene ritagliato dal contenitore
  voice42Video: {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',        // 👉 niente bande: riempi e ritaglia
    objectPosition: 'center'   // puoi anche provare 'center 55%' se vuoi scendere leggermente
  }
  
}; 
const ListeProdottiNoSSR = dynamic(() => Promise.resolve(ListeProdotti), { ssr: false });
export default ListeProdottiNoSSR;







