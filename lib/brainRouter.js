// lib/brainRouter.js 
// Router per inserire spese da voce e da OCR.

const CATEGORY_IDS = {
  'spese casa':       '4cfaac74-aab4-4d96-b335-6cc64de59afc',
  'vestiti':          '89e223d4-1ec0-4631-b0d4-52472579a04a',
  'cene e aperitivi': '0f8eb04a-8a1a-4899-9f29-236a5be7e9db',
  'varie':            '075ce548-15a9-467c-afc8-8b156064eeb6',
};

function toISODate(d = new Date()) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function extractAmountEuros(text) {
  const m = String(text).replace(/\./g, '').match(/(?:€\s*)?(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extractDate(text) {
  const t = String(text).toLowerCase();
  const today = new Date();
  if (/\boggi\b/.test(t)) return toISODate(today);
  if (/\bier[oi]\b/.test(t)) {
    const d = new Date(today);
    d.setDate(today.getDate() - 1);
    return toISODate(d);
  }
  const m1 = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = t.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
  if (m2) {
    const dd = m2[1].padStart(2, '0');
    const mm = m2[2].padStart(2, '0');
    const yyyy = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return toISODate(today);
}

function detectCategoryFromText(text) {
  const t = String(text).toLowerCase();

  // Spese casa
  if (/(supermercat|market|alimentar|iper|discount|coop|conad|esselunga|carrefour|md|lidl)/.test(t)) {
    return { name: 'spese casa', id: CATEGORY_IDS['spese casa'] };
  }
  if (/(latte|uova|pane|pasta|riso|olio|formagg|prosciutt|salame|yogurt|burro|mozzarella|verdure?|frutt|detersiv|caffe)/.test(t)) {
    return { name: 'spese casa', id: CATEGORY_IDS['spese casa'] };
  }

  // Vestiti
  if (/(abbigliament|pantalon|magli[ae]|felp|scarpe|camici[ae]|giubb|jeans)/.test(t)) {
    return { name: 'vestiti', id: CATEGORY_IDS['vestiti'] };
  }

  // Cene e aperitivi
  if (/(ristorant|pizzeri|trattori|oster|aperitiv|bar|cena|pranzo)/.test(t)) {
    return { name: 'cene e aperitivi', id: CATEGORY_IDS['cene e aperitivi'] };
  }

  return { name: 'varie', id: CATEGORY_IDS['varie'] };
}

async function ingestFinance({ description, amount, spent_at, category_id }) {
  const res = await fetch('/api/finances/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, amount, spent_at, category_id })
  });
  if (!res.ok) throw new Error(`Ingest HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data.ok) throw new Error(data?.error || 'Ingest fallito');
  return data;
}

export async function handleVoiceTranscript(spoken) {
  const text = String(spoken || '').trim();
  if (!text) return;
  const amount = extractAmountEuros(text);
  const spent_at = extractDate(text);
  const { id: category_id } = detectCategoryFromText(text);
  const description = text;
  if (amount == null) throw new Error('Importo non trovato nella frase.');
  await ingestFinance({ description, amount, spent_at, category_id });
}

export async function handleOCR({ base64 }) {
  if (!base64) throw new Error('Manca immagine OCR.');
  const res = await fetch('/api/assistant-ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: base64 })
  });
  if (!res.ok) throw new Error(`assistant-ocr HTTP ${res.status}`);
  const data = await res.json();

  const descrizione = data?.descrizione || data?.description || data?.testo || 'Scontrino';
  const importo = Number(
    (data?.importo ?? data?.amount ?? '').toString().replace(',', '.')
  );
  const dataISO = data?.data || extractDate(descrizione);
  const catBasis = data?.categoria || descrizione || data?.esercizio || '';
  const { id: category_id } = detectCategoryFromText(catBasis);

  if (!Number.isFinite(importo)) throw new Error('Importo OCR non valido.');
  await ingestFinance({ description: descrizione, amount: importo, spent_at: dataISO, category_id });
}
