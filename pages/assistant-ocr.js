import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false, // serve per multipart/form-data
  },
};

function parseForm(req) {
  const form = formidable({ multiples: true });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ ok: false, data: null, error: 'Method Not Allowed' });
  }

  try {
    const { fields, files } = await parseForm(req);

    // Puoi usare questi dati per il tuo OCR
    const assistantId = fields.assistantId || '';
    const hints = (() => {
      try { return fields.hints ? JSON.parse(fields.hints) : null; }
      catch { return null; }
    })();
    const intent = fields.intent || '';
    const item = (() => {
      try { return fields.item ? JSON.parse(fields.item) : null; }
      catch { return null; }
    })();

    // Per ora rispondiamo con struttura vuota ma corretta
    const data = {
      purchases: [], // { name, brand, qty, expiresAt?, price?, store?, date? }
      expiries: [],  // { name, brand?, expiresAt }
      stock: []      // { name, brand?, qty, expiresAt? }
    };

    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      data: null,
      error: e?.message || 'Unhandled error',
    });
  }
}
