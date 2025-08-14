// lib/brainRouter.js
// Router "cervello" per INGEST da voce e OCR.
// - handleVoiceTranscript(spoken)
// - handleOCR({ base64 })  → chiama /api/assistant-ocr se già presente nel tuo progetto
//
// Regole categoria: supermercato/market/alimentari → "spese casa"
//                   pantaloni/maglia/scarpe/abbigliamento → "vestiti"
//                   ristorante/pizzeria/aperitivo/bar/cena → "cene e aperitivi"

const CATEGORY_IDS = {
  'spese casa':       '4cfaac74-aab4-4d96-b335-6cc64de59afc',
  'vestiti':          '89e223d4-1ec0-4631-b0d4-52472579a04a',
  'cene e aperitivi': '0f8eb04a-8a1a-4899-9f29-236a5be7e9db',
  'varie':            '075ce548-15a9-467c-afc8-8b156064eeb6',
};

function toISODate(d = new Date()) {
  // restituisce YYYY-MM-DD (compatibile con colonna spent_at)
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}

function extractAmountEuros(text) {
  // cattura "10", "10,50", "€ 10,50"
  const m = String(text).replace(/\./g,'').match(/(?:€\s*)?(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extractDate(text) {
  const t = String(text).toLowerCase();
  const today = new Date();
  if (/\boggi\b/.test(t)) return toISODate(today);
  if (/\bier[oi]\b/.test(t)) {
    const d = new Date(today); d.setDate(today.getDate()-1);
    return toISODate(d);
  }
  // yyyy-mm-dd o dd/mm/yyyy
  const m1 = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = t.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (m2) {
    const dd = m2[1].padStart(2,'0'), mm = m2[2].padStart(2,'0');
    const yyyy = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return toISODate(today);
}

function detectCategoryFromText(text) {
  const t = String(text).toLowerCase();

  // Spese casa: supermercato/market/alimentari/latte/uova/pane/pasta/riso
  if (/(supermercat|market|alimentar|iper|discount|coop|conad|esselunga|carrefour|md|lid[li])/i.test(t)) {
    return { name: 'spese casa', id: CATEGORY_IDS['spese casa'] };
  }
  if (/(latte|uov[ae]|pane|pasta|riso|olio|formagg|prosciutt|salame|yogurt|burro|mozzarella|verdur|frutt|detersiv|caff[eè])/i.test(t)) {
    return { name: 'spese casa', id: CATEGORY_IDS['spese casa'] };
  }

  // Vestiti / abbigliamento
  if (/(abbigliament|pantalon|magli[ae]|felp|scarpe|camici[ae]|giubb|jeans|fiocca)/i.test(t)) {
    return { name: 'vestiti', id: CATEGORY_IDS['vestiti'] };
  }

  // Cene e aperitivi / ristorazione
  if (/(ristorant|pizzeri|trattori|oster|aperitiv|bar|cenat|pranzat|cena|pranzo)/i.test(t)) {
    return { name: 'cene e aperitivi', id: CATEGORY_IDS['cene e aperitivi'] };
  }

  return { name: 'varie', id: CATEGORY_IDS['varie'] };
}

async function ingestFinance({ description, amount, spent_at, category_id }) {
  // Passa dal backend (service role): sicurezza con RLS
  const res = await fetch('/api/finances/ingest', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ description, amount, spent_at, category_id })
  });
  if (!res.ok) throw new Error(`Ingest HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || 'Ingest fallito');
  return data;
}

/** ---- Voce: "ho comprato..." */
export async function handleVoiceTranscript(spoken) {
  const text = String(spoken || '').trim();
  if (!text) return;

  const amount = extractAmountEuros(text);
  const spent_at = extractDate(text);
  const { id: category_id } =_
