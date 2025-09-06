// pages/api/ocr.js
import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';
import crypto from 'crypto';

export const config = {
  api: { bodyParser: false, sizeLimit: '25mb' },
};

const MODEL_VISION = process.env.OCR_VISION_MODEL || 'gpt-4o-mini';

// ---------- utils ----------
const nz = (s) => String(s || '').trim();
const num = (x) => {
  const n = Number(String(x ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
function toISO(s = '') {
  const t = String(s).trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m1 = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m1) {
    const d = String(m1[1]).padStart(2, '0');
    const M = String(m1[2]).padStart(2, '0');
    let y = String(m1[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  return '';
}
function sanitize(text = '') {
  const BAD = /(mi\s*dispiace|non\s*posso\s*aiut|cannot\s*assist|i\s*can't|policy)/i;
  return String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !BAD.test(s))
    .join('\n')
    .trim();
}
async function bufferFromDataUrl(dataUrl) {
  const m = /^data:(.*?);base64,(.*)$/i.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1] || 'image/jpeg';
  const buf = Buffer.from(m[2], 'base64');
  return { buf, mime, name: 'upload.' + (mime.split('/')[1] || 'jpg') };
}
function mergePurchases(list = []) {
  const map = new Map();
  for (const p of list) {
    const name = nz(p.name);
    if (!name) continue;
    const brand = nz(p.brand);
    const upp = Math.max(1, Math.trunc(num(p.unitsPerPack) || 1));
    const unitLabel = nz(p.unitLabel) || (upp > 1 ? 'pezzi' : 'unità');
    const pe = num(p.priceEach);
    const packs = Math.max(1, Math.trunc(num(p.packs) || 1));
    const key = [
      name.toLowerCase(),
      brand.toLowerCase(),
      String(upp),
      unitLabel.toLowerCase(),
      String(pe.toFixed(2)),
    ].join('|');

    const row = map.get(key) || {
      name, brand, packs: 0, unitsPerPack: upp, unitLabel,
      priceEach: pe, priceTotal: 0, currency: nz(p.currency) || 'EUR',
      expiresAt: nz(p.expiresAt) || ''
    };
    row.packs += packs;
    const pt = num(p.priceTotal) || pe * packs;
    row.priceTotal += pt;
    map.set(key, row);
  }
  return [...map.values()].map(r => ({
    ...r,
    priceEach: Math.round(r.priceEach * 100) / 100,
    priceTotal: Math.round(r.priceTotal * 100) / 100
  }));
}

// ---------- prompt ----------
function buildReceiptPrompt() {
  return [
    'Sei un estrattore OCR di SCONTRINI. Rispondi SEMPRE e SOLO JSON valido con questo schema:',
    '{',
    '  "store": "",               // nome punto vendita',
    '  "location": "",            // indirizzo/città',
    '  "purchaseDate": "",        // YYYY-MM-DD',
    '  "currency": "EUR",',
    '  "paymentMethod": "",       // es. cash, card, unknown',
    '  "totalPaid": 0,',
    '  "purchases": [',
    '    { "name": "", "brand": "", "packs": 0, "unitsPerPack": 0, "unitLabel": "", "priceEach": 0, "priceTotal": 0, "currency": "EUR", "expiresAt": "" }',
    '  ],',
    '  "text": ""                 // opzionale: OCR grezzo, righe con \\n',
    '}',
    '',
    'REGOLE:',
    '- -NON consolidare righe uguali: se lo scontrino ripete la stessa voce su più righe, restituisci una entry PER OGNI RIGA.',
    '- "unitsPerPack" è >1 SOLO se dal testo emerge un pattern esplicito (2x6, 6 bottiglie, 3 conf. da 6).',
    '- NON usare pesi/volumi (500g, 1L) come unitsPerPack.',
    '- "unitLabel" tra: "unità","pezzi","bottiglie","buste","lattine","vasetti","rotoli","capsule","brick","uova".',
    '- "priceEach" = prezzo unitario della voce; se hai solo il totale riga e "packs", ricava priceEach = totale/packs.',
    '- "priceTotal" = priceEach * packs (arrotonda a 2 decimali).',
    '- "currency" dedotta da simbolo (default EUR).',
    '- "purchaseDate" in formato YYYY-MM-DD; se trovi data nel piè di pagina, usala.',
    '- "paymentMethod" da testo (contanti, carta, ecc., altrimenti "unknown").',
    '- "totalPaid" = importo effettivamente pagato (non il resto).',
  ].join('\n');
}

// ---------- handler ----------
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY non configurata' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1) Input: JSON (dataUrl / imageUrl) o multipart
    let files = [];
    let fields = {};
    const ct = (req.headers['content-type'] || '').toLowerCase();

    if (ct.includes('application/json')) {
      // JSON
      const body = await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
        req.on('error', reject);
      });
      const { dataUrl, imageUrl } = body || {};
      if (!dataUrl && !imageUrl) return res.status(400).json({ error: 'Provide dataUrl (base64) or imageUrl' });
      if (dataUrl) {
        const f = await bufferFromDataUrl(dataUrl);
        if (!f) return res.status(400).json({ error: 'dataUrl non valido' });
        files = [f];
      } else {
        files = [{ remoteUrl: imageUrl }];
      }
    } else {
      // multipart
      const parsed = await new Promise((resolve, reject) => {
        const form = formidable({ multiples: true, keepExtensions: true, maxFileSize: 25 * 1024 * 1024 });
        form.parse(req, (err, flds, f) => (err ? reject(err) : resolve({ fields: flds, files: f })));
      });
      fields = parsed.fields || {};
      const grab = (k) => {
        const v = parsed.files?.[k];
        return v ? (Array.isArray(v) ? v : [v]) : [];
      };
      let fileList = [...grab('images'), ...grab('files'), ...grab('file'), ...grab('image')];
      if (!fileList.length) fileList = Object.values(parsed.files || {}).flat().filter(Boolean);

      const seen = new Set();
      for (const f of fileList) {
        const p = f.filepath || f.path;
        const buf = await fs.readFile(p);
        const h = crypto.createHash('sha256').update(buf).digest('hex');
        if (seen.has(h)) continue;
        seen.add(h);
        files.push({ buf, mime: (f.mimetype || '').toLowerCase(), name: f.originalFilename || '' });
      }
    }

    if (!files.length) return res.status(400).json({ error: 'Nessuna immagine ricevuta' });

    // 2) Prepara image parts (una sola chiamata Vision con tutte le foto)
    const imageParts = [];
    for (const f of files) {
      if ((f.mime && f.mime.includes('pdf')) || /\.pdf$/i.test(f.name || '')) {
        // PDF non OCR qui (puoi aggiungere pdf-parse se vuoi)
        continue;
      }
      if (f.remoteUrl) {
        imageParts.push({ type: 'image_url', image_url: { url: f.remoteUrl } });
      } else {
        const mime = f.mime || 'image/jpeg';
        const b64 = f.buf.toString('base64');
        imageParts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } });
      }
    }
    if (!imageParts.length) return res.status(415).json({ error: 'Solo immagini supportate in questa route' });

    // 3) Vision → JSON strutturato
    let parsed = null;
    try {
      const resp = await client.chat.completions.create({
        model: MODEL_VISION,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Rispondi solo JSON valido.' },
          { role: 'user', content: [{ type: 'text', text: buildReceiptPrompt() }, ...imageParts] },
        ],
      });
      const raw = resp?.choices?.[0]?.message?.content || '';
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = null;
    }

    // 4) Normalize + merge
    let store = nz(parsed?.store);
    let location = nz(parsed?.location);
    let purchaseDate = toISO(parsed?.purchaseDate);
    let currency = nz(parsed?.currency) || 'EUR';
    let paymentMethod = nz(parsed?.paymentMethod) || 'cash';
    let totalPaid = num(parsed?.totalPaid);
    let purchases = Array.isArray(parsed?.purchases) ? parsed.purchases : [];

    // hard sanitize righe
    purchases = purchases.map(p => ({
      name: nz(p.name),
      brand: nz(p.brand),
      packs: Math.max(1, Math.trunc(num(p.packs) || 1)),
      unitsPerPack: Math.max(1, Math.trunc(num(p.unitsPerPack) || 1)),
      unitLabel: nz(p.unitLabel) || 'unità',
      priceEach: Math.round(num(p.priceEach) * 100) / 100,
      priceTotal: Math.round(num(p.priceTotal) * 100) / 100,
      currency: nz(p.currency) || currency || 'EUR',
      expiresAt: toISO(p.expiresAt),
    })).filter(p => p.name);

     purchases = mergePurchases(purchases);
// non unire: processiamo ogni riga separatamente


    const text = sanitize(parsed?.text || '');

    return res.status(200).json({
      ok: true,
      store,
      location,
      purchaseDate,
      currency,
      paymentMethod,
      totalPaid,
      purchases,
      text, // opzionale, utile per debug
    });
  } catch (err) {
    console.error('[OCR] fail', err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
