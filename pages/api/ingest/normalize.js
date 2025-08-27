// pages/api/ingest/normalize.js
import OpenAI from 'openai';

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } }
};

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ======== Utils ========
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const NUM_RE = /(?:€|eur|euro)\s*([0-9]+(?:[.,][0-9]{1,2})?)/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;
const STYLE_RE = /(ros[ée]|bianco|rosso|frizzante|spumante|bollicine)/i;
const DOC_RE = /\b(DOCG|DOC|IGT)\b/i;

const CHEESE_TERMS = [
  'pecorino','caciocavallo','parmigiano','grana','gorgonzola','provola','mozzarella','scamorza','asiago','fontina',
  'bitto','castelmagno','taleggio','ragusano','caprino','caciotta','fiordilatte','stracchino','bufala'
];
const SALUMI_TERMS = [
  'salame','prosciutto','culatello','finocchiona','coppa','bresaola','mortadella','speck','guanciale','lardo','salsiccia','soppressa'
];
const WINE_NAMES = [
  'barolo','barbaresco','chianti','brunello','morellino','amarone','valdobbiane?ne? prosecco|prosecco','lugana',
  'fiano','greco di tufo','vermentino','pecorino','verdicchio','grillo','catarratto','gavi','nero d.?avola',
  'frappato','etna rosso','etna bianco','cirò','aglianico','taurasi','sagrantino','montepulciano d.?abruzzo',
  'primitivo','negroamaro','soave','valpolicella','pinot grigio','pinot nero','sauvignon','merlot','cabernet','nebbiolo','sangiovese'
];

function toPriceNumber(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function guessProductType(text) {
  const t = text.toLowerCase();
  const hasCheese = CHEESE_TERMS.some(k => t.includes(k));
  const hasSalumi = SALUMI_TERMS.some(k => t.includes(k));
  if (hasCheese && !hasSalumi) return 'formaggio';
  if (!hasCheese && hasSalumi) return 'salume';
  // fallback: cerca parole chiave “caseificio/salumificio”
  if (/caseific/.test(t)) return 'formaggio';
  if (/salumific/.test(t)) return 'salume';
  return 'formaggio';
}

function pickWineName(text) {
  const t = text.toLowerCase();
  for (const pat of WINE_NAMES) {
    const re = new RegExp(`\\b(${pat})\\b`, 'i');
    const m = re.exec(t);
    if (m) return cap(m[1].replace(/ +/g,' ').replace(/\s+prosecco/i,' Prosecco'));
  }
  return null;
}

function cap(s) { return s ? s.replace(/\b([a-zà-ù])(\S*)/gi, (_,a,b)=>a.toUpperCase()+b) : s; }

function extractAfter(text, anchorRegex, maxLen=80) {
  const m = anchorRegex.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length).trim();
  return cap(rest.split(/[,.;]/)[0].slice(0,maxLen));
}

// ======== Geocoding (Nominatim / OSM) ========
async function geocodePlace(name) {
  if (!name) return null;
  const email = process.env.NOMINATIM_EMAIL || 'contact@example.com';
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(name + ', Italia')}&limit=1&addressdetails=0`;
  const r = await fetch(url, { headers: { 'User-Agent': `Jarvis/1.0 (${email})` } });
  if (!r.ok) return null;
  const arr = await r.json();
  if (!Array.isArray(arr) || !arr.length) return null;
  const hit = arr[0];
  return { name, lat: Number(hit.lat), lng: Number(hit.lon) };
}

async function enrichPlaces(origin, purchase) {
  const out = { origin:null, purchase:null };
  if (origin?.name) {
    out.origin = { name: origin.name, lat: origin.lat ?? null, lng: origin.lng ?? null };
    if (out.origin.lat == null || out.origin.lng == null) {
      const g = await geocodePlace(origin.name); if (g) out.origin = g;
      await sleep(250);
    }
  }
  if (purchase?.name) {
    out.purchase = { name: purchase.name, lat: purchase.lat ?? null, lng: purchase.lng ?? null };
    if (out.purchase.lat == null || out.purchase.lng == null) {
      const g = await geocodePlace(purchase.name); if (g) out.purchase = g;
      await sleep(250);
    }
  }
  return out;
}

// ======== Heuristic parsers ========
function parseArtisanHeuristic(text) {
  const t = ' ' + text.replace(/\s+/g,' ').trim() + ' ';
  const price = (() => {
    const m = NUM_RE.exec(t); return m ? toPriceNumber(m[1]) : null;
  })();

  // Nome prodotto (prendi la prima keyword presente + eventuale aggettivo vicino)
  let name = null;
  for (const term of [...CHEESE_TERMS, ...SALUMI_TERMS]) {
    const re = new RegExp(`\\b(${term})(?:\\s+[a-zà-ù]{3,}){0,3}`, 'i');
    const m = re.exec(t);
    if (m) { name = cap(m[0]); break; }
  }

  // Produttore
  let producer =
    extractAfter(t, /\b(?:azienda(?:\s+agricola)?|caseificio|salumificio|produttore|cantina)\s+/i) ||
    extractAfter(t, /\bdall['’]azienda\s+/i) ||
    extractAfter(t, /\bdi\s+(?:[A-Z][a-zà-ù']+\s*){1,3}/i);

  // Origine (prodotto a/in/di …)
  let originName =
    extractAfter(t, /\bprodotto (?:ad|a|in)\s+/i) ||
    extractAfter(t, /\bdi\s+(?:[A-Z][a-zà-ù']+(?:\s+[A-Z][a-zà-ù']+)*)/i);

  // Punto vendita/consumo (ristorante/enoteca/negozio/da @)
  let purchaseName =
    extractAfter(t, /\b(?:ristorante|trattoria|enoteca|vineria|negozio|punto vendita)\s+/i) ||
    extractAfter(t, /\b(?:al|alla|allo)\s+(?:ristorante|trattoria|enoteca|vineria|negozio)\s+/i) ||
    extractAfter(t, /\bda\s+(?:[A-Z][a-zà-ù']+(?:\s+[A-Z][a-zà-ù']+)*)/i);

  const data = {
    name: name || cap(extractAfter(t, /\bho (?:mangiato|acquistato)\s+un[oa]?\s+/i)) || null,
    producer: producer || null,
    product_type: guessProductType(t),
    designation: (DOC_RE.exec(t)?.[1] || null),
    price_eur: price,
    origin: originName ? { name: originName } : null,
    purchase: purchaseName ? { name: purchaseName } : null,
    notes: null
  };
  return { kind:'artisan', data };
}

function parseWineHeuristic(text) {
  const t = ' ' + text.replace(/\s+/g,' ').trim() + ' ';
  const name = pickWineName(t) || cap(extractAfter(t, /\b(?:vino|bottiglia)\s+di\s+/i));
  const winery =
    extractAfter(t, /\b(?:cantina|azienda(?:\s+agricola)?|produttore)\s+/i) ||
    null;
  const denomination = (DOC_RE.exec(t)?.[1] || null);
  const region = extractAfter(t, /\b(?:regione|in\s+)(abruzzo|piemonte|lombardia|sicilia|toscana|veneto|puglia|calabria|campania|liguria|umbria|marche|molise|basilicata|sardegna|trentino|friuli|alto adige|valle d['’]aosta)\b/i);
  const vintage = (()=>{ const m = YEAR_RE.exec(t); return m ? Number(m[0]) : null; })();
  const style = (()=>{ const m = STYLE_RE.exec(t); return m ? (m[1].toLowerCase().startsWith('ros')?'rosé':m[1].toLowerCase()) : null; })();
  const price = (()=>{ const m = NUM_RE.exec(t); return m ? toPriceNumber(m[1]) : null; })();

  // uve: “da uve X, Y”
  let grapes = null;
  const gm = /\b(?:da uve|uvaggio)\s+([^.,;]+)/i.exec(t);
  if (gm) {
    grapes = gm[1].split(/[\/,&;]|\se\s/i).map(s=>cap(s.trim())).filter(Boolean);
  }

  const originName =
    extractAfter(t, /\bprodotto (?:a|ad|in)\s+/i) ||
    extractAfter(t, /\bdi\s+(?:[A-Z][a-zà-ù']+(?:\s+[A-Z][a-zà-ù']+)*)/i);
  const purchaseName =
    extractAfter(t, /\b(?:enoteca|vineria|ristorante|negozio)\s+/i) ||
    extractAfter(t, /\bda\s+(?:[A-Z][a-zà-ù']+(?:\s+[A-Z][a-zà-ù']+)*)/i);

  const data = {
    name: name || null,
    winery: winery || null,
    denomination: denomination,
    region: region || null,
    grapes: grapes,
    vintage,
    style,
    price_eur: price,
    origin: originName ? { name: originName } : null,
    purchase: purchaseName ? { name: purchaseName } : null,
    notes: null
  };
  return { kind:'wine', data };
}

// ======== OpenAI Parser (JSON mode) ========
async function parseWithOpenAI(text, target) {
  if (!openai) return null;

  const SYSTEM = `Sei un normalizzatore. Estrarrai dati dai testi (OCR o voce) e risponderai SOLO in JSON.
Campi attesi:

Per "artisan" (Formaggi & Salumi):
{
  "kind": "artisan",
  "data": {
    "name": string|null,
    "producer": string|null,
    "product_type": "formaggio"|"salume"|null,
    "designation": "DOP"|"IGP"|null,
    "price_eur": number|null,
    "origin": {"name": string, "lat": null, "lng": null} | null,
    "purchase": {"name": string, "lat": null, "lng": null} | null,
    "notes": string|null
  }
}

Per "wine":
{
  "kind": "wine",
  "data": {
    "name": string|null,
    "winery": string|null,
    "denomination": "DOCG"|"DOC"|"IGT"|null,
    "region": string|null,
    "grapes": string[]|null,
    "vintage": number|null,
    "style": "rosso"|"bianco"|"rosé"|"frizzante"|null,
    "price_eur": number|null,
    "origin": {"name": string, "lat": null, "lng": null} | null,
    "purchase": {"name": string, "lat": null, "lng": null} | null,
    "notes": string|null
  }
}

Regole:
- Normalizza i prezzi a numero (es. "20 € al kg" → 20).
- "origin.name" = luogo di produzione (es. "prodotto a ...").
- "purchase.name" = ristorante/negozio/enoteca dove consumato/acquistato.
- Se non trovi un campo, mettilo a null.`;

  const USER = JSON.stringify({ target, text });

  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: USER }
    ],
    temperature: 0.1,
  });

  const out = resp.choices?.[0]?.message?.content?.trim();
  if (!out) return null;

  try { return JSON.parse(out); } catch { return null; }
}

// ======== Handler ========
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { text, target } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Missing text' });

    const targetHint = (target === 'wine' || target === 'cellar') ? 'wine'
                      : (target === 'artisan') ? 'artisan'
                      : null;

    // 1) Prova con OpenAI se disponibile
    let norm = null;
    if (openai) {
      norm = await parseWithOpenAI(text, targetHint || 'auto');
    }

    // 2) Fallback euristico
    if (!norm || !norm.kind) {
      const t = text.toLowerCase();
      const looksWine = /vino|cantina|enoteca|barolo|chianti|docg|doc|igt|annata|vendemmia|ros[ée]|bianco|rosso|frizzante|spumante/.test(t) || pickWineName(t);
      if ((targetHint === 'wine') || looksWine) norm = parseWineHeuristic(text);
      else norm = parseArtisanHeuristic(text);
    }

    // 3) Geocoding (se mancano lat/lng)
    const { origin, purchase } = await enrichPlaces(norm.data?.origin, norm.data?.purchase);
    norm.data.origin = origin || null;
    norm.data.purchase = purchase || null;

    // Fallback: prova a forzare un nome se manca
try {
  const raw = text || '';
  if (norm && norm.data) {
    if (!norm.data.name || String(norm.data.name).trim().length < 2) {
      if (norm.kind === 'wine') {
        const m = /\b(barolo|barbaresco|chianti|brunello|amarone|lugana|vermentino|pecorino|grillo|gavi|nero d.?avola|frappato|aglianico|taurasi|montepulciano d.?abruzzo|primitivo|negroamaro|soave|valpolicella|pinot nero|pinot grigio|sauvignon|merlot|cabernet|nebbiolo|sangiovese)\b/i.exec(raw);
        if (m) norm.data.name = m[1].replace(/\s+/g,' ').replace(/^\w/, c => c.toUpperCase());
      } else {
        const m = /\b(pecorino|caciocavallo(?:\s+podolico)?|parmigiano|grana|gorgonzola|provola|mozzarella|scamorza|asiago|fontina|salame|prosciutto|culatello|finocchiona|coppa|bresaola|mortadella|speck)\b/i.exec(raw);
        if (m) norm.data.name = m[1].replace(/\s+/g,' ').replace(/^\w/, c => c.toUpperCase());
      }
      if (!norm.data.name) norm.data.name = (norm.kind === 'wine') ? 'Vino (da completare)' : 'Prodotto (da completare)';
    }
  }
} catch {}


    return res.status(200).json(norm);
  } catch (e) {
    console.error('normalize error', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
