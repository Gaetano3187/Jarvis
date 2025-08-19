// pages/api/finances/ingest.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Import dinamici dentro la funzione (no top-level await)
    const { z } = await import('zod');

    // Schema di validazione input
    const ItemSchema = z.object({
      name: z.string().min(1),
      brand: z.string().optional().default(''),
      packs: z.number().nonnegative().default(0),
      unitsPerPack: z.number().nonnegative().default(0),
      unitLabel: z.string().optional().default(''),
      priceEach: z.number().nonnegative().default(0),
      priceTotal: z.number().nonnegative().default(0),
      currency: z.string().optional().default('EUR'),
      expiresAt: z.string().optional().default(''),
    });

    const BodySchema = z.object({
      user_id: z.string().min(1).optional(),
      store: z.string().optional().default(''),
      purchaseDate: z.string().optional().default(''),
      payment_method: z.enum(['cash', 'card']).optional().default('cash'),
      card_label: z.string().nullable().optional(),
      items: z.array(ItemSchema).min(1, 'items deve essere un array non vuoto'),
    });

    // Body già parsato da Next (Node runtime); gestiamo anche eventuale stringa
    const raw = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const input = BodySchema.parse(raw);

    // --- Se Supabase NON è configurato, rispondiamo ok con echo (niente 500/400) ---
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(200).json({
        ok: true,
        noop: true,
        reason: 'SUPABASE_DISABLED',
        echo: input,
      });
    }

    // --- Inserimento su Supabase ---
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    // Tabella configurabile via env; default ragionevole
    const TABLE = process.env.JARVIS_FINANCES_TABLE || 'jarvis_finances';

    // Una riga per item
    const rows = input.items.map((it) => ({
      user_id: input.user_id || null,
      store: input.store || null,
      purchase_date: input.purchaseDate || null,
      payment_method: input.payment_method || null,
      card_label: input.card_label || null,

      name: it.name,
      brand: it.brand || null,
      packs: it.packs ?? 0,
      units_per_pack: it.unitsPerPack ?? 0,
      unit_label: it.unitLabel || null,
      price_each: it.priceEach ?? 0,
      price_total: it.priceTotal ?? 0,
      currency: it.currency || 'EUR',
      expires_at: it.expiresAt || null,

      created_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from(TABLE).insert(rows);
    if (error) {
      // Non blocchiamo il client: segnaliamo warning e ritorniamo ok
      return res.status(200).json({
        ok: true,
        warning: 'SUPABASE_INSERT_FAILED',
        message: error.message,
        echo: input,
      });
    }

    return res.status(200).json({ ok: true, inserted: rows.length });
  } catch (err) {
    // Errori di parsing/validazione
    const msg = err?.message || String(err);
    if (/items.*non vuoto/i.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    return res.status(400).json({ error: msg });
  }
}
