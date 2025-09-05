// pages/api/vision.js
import OpenAI from "openai";
import formidable from "formidable";
import fs from "fs/promises";

export const config = { api: { bodyParser: false } };

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

// ---- JSON Schemas (Structured Outputs) ----
const schemaReceipt = {
  name: "ReceiptExtraction",
  schema: {
    type: "object",
    properties: {
      store: { type: "string" },
      purchaseDate: { type: "string", description: "YYYY-MM-DD se presente, altrimenti stringa vuota" },
      purchases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            brand: { type: "string" },
            packs: { type: "number" },
            unitsPerPack: { type: "number" },
            unitLabel: { type: "string" },
            priceEach: { type: "number" },
            priceTotal: { type: "number" },
            currency: { type: "string", default: "EUR" },
            expiresAt: { type: "string" }
          },
          required: ["name","brand","packs","unitsPerPack","unitLabel","priceEach","priceTotal","currency","expiresAt"],
          additionalProperties: false
        }
      }
    },
    required: ["purchases"],
    additionalProperties: false
  },
  strict: true
};

const schemaRow = {
  name: "RowExtraction",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      brand: { type: "string" },
      packs: { type: "number" },
      unitsPerPack: { type: "number" },
      unitLabel: { type: "string" },
      expiresAt: { type: "string" }
    },
    required: ["name","brand","packs","unitsPerPack","unitLabel","expiresAt"],
    additionalProperties: false
  },
  strict: true
};

const schemaBag = {
  name: "BagExtraction",
  schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            brand: { type: "string" },
            packs: { type: "number" },
            unitsPerPack: { type: "number" },
            unitLabel: { type: "string" },
            expiresAt: { type: "string" }
          },
          required: ["name","brand","packs","unitsPerPack","unitLabel","expiresAt"],
          additionalProperties: false
        }
      }
    },
    required: ["items"],
    additionalProperties: false
  },
  strict: true
};

function promptFor(mode, hints = {}) {
  if (mode === "receipt") {
    return [
      "Sei Jarvis. Estrai righe da uno SCONTRINO.",
      "NON usare pesi/volumi come quantità; packs/unitsPerPack solo se espliciti (2x6, 6 bottiglie, 2 conf da 6).",
      "Mantieni i nomi leggibili (no sinonimi creativi).",
      "Compila currency 'EUR' se mancante."
    ].join("\n");
  }
  if (mode === "row") {
    return [
      "Sei Jarvis. Hai una foto di ETICHETTA/PRODOTTO o porzione di scontrino riferita a UNA SOLA VOCE.",
      `Se possibile mantieni name≈"${hints.name || ""}" e brand≈"${hints.brand || ""}".`,
      "Estrarre: name, brand, packs, unitsPerPack, unitLabel, expiresAt (YYYY-MM-DD se presente).",
      "Se quantità non esplicite, lascia packs=0, unitsPerPack=0, unitLabel=''."
    ].join("\n");
  }
  // bag
  return [
    "Sei Jarvis. Da foto di più prodotti (una busta/cesto) estrai una lista items.",
    "Ogni item: name, brand, packs/unitsPerPack solo se espliciti; expiresAt se visibile."
  ].join("\n");
}

function chooseSchema(mode) {
  if (mode === "receipt") return schemaReceipt;
  if (mode === "row") return schemaRow;
  return schemaBag;
}

async function parseForm(req) {
  const form = formidable({ multiples: true, maxFileSize: 20 * 1024 * 1024 });
  return await new Promise((ok, ko) => {
    form.parse(req, (err, fields, files) => (err ? ko(err) : ok({ fields, files })));
  });
}

async function fileToDataUrl(file) {
  const buf = await fs.readFile(file.filepath || file.file || file.path);
  const b64 = buf.toString("base64");
  const mime = file.mimetype || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const { fields, files } = await parseForm(req);
    const mode = String(fields.mode || "receipt").toLowerCase(); // 'receipt' | 'row' | 'bag'
    const hintName = String(fields.hintName || "");
    const hintBrand = String(fields.hintBrand || "");

    const picked =
      [].concat(files.images || files.image || files.file || files.files || [])
        .filter(Boolean);

    if (picked.length === 0) return res.status(400).json({ ok: false, error: "Nessuna immagine" });

    // Concatena le immagini come contenuti Vision
    const visionContent = [
      { type: "input_text", text: promptFor(mode, { name: hintName, brand: hintBrand }) },
      ...(await Promise.all(
        picked.map(async (f) => ({ type: "input_image", image_url: await fileToDataUrl(f) }))
      ))
    ];

    // Structured Outputs + Vision (Responses API)
    const schema = chooseSchema(mode);

    const ai = await client.responses.create({
      model: MODEL, // gpt-4o / gpt-4o-mini
      input: [{ role: "user", content: visionContent }],
      response_format: { type: "json_schema", json_schema: schema }
    });

    // Estrarre il testo (il Node SDK espone output_text); fallback robusto
    const text =
      ai.output_text ??
      (ai.output?.[0]?.content?.[0]?.text || ai.output?.[0]?.content?.[0]?.string_value) ??
      JSON.stringify(ai, null, 2);

    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }

    if (!parsed) return res.status(502).json({ ok: false, error: "Formato risposta non valido", raw: text });

    return res.status(200).json({ ok: true, mode, data: parsed });
  } catch (e) {
    console.error("[/api/vision] error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
