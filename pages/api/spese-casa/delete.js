// pages/api/spese-casa/delete.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SURL || !SKEY) {
    return res.status(500).json({ ok: false, error: 'SERVICE_ROLE_MISSING', message: 'Configure SUPABASE_SERVICE_ROLE_KEY & NEXT_PUBLIC_SUPABASE_URL' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ ok: false, error: 'BAD_JSON', message: 'Invalid JSON body' });
  }

  const idRaw = body?.id;
  if (!idRaw) return res.status(400).json({ ok: false, error: 'MISSING_ID', message: 'id is required' });

  const supabase = createClient(SURL, SKEY, { auth: { persistSession: false } });

  // 1) Trova la riga (gestione tipo id string/number)
  let row = null;
  let sel = await supabase
    .from('jarvis_spese_casa')
    .select('id')
    .eq('id', idRaw)
    .maybeSingle();

  if (!sel.error && sel.data) row = sel.data;

  if (!row && /^[0-9]+$/.test(String(idRaw))) {
    // prova come numero (es. bigserial)
    sel = await supabase
      .from('jarvis_spese_casa')
      .select('id')
      .eq('id', Number(idRaw))
      .maybeSingle();
    if (!sel.error && sel.data) row = sel.data;
  }

  if (sel.error) {
    return res.status(500).json({ ok: false, error: 'SELECT_FAILED', message: sel.error.message });
  }
  if (!row) {
    return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Row not found for given id' });
  }

  // 2) Cancella (v2: per avere count usa .select(..., { count:'exact' }))
  const del = await supabase
    .from('jarvis_spese_casa')
    .delete()
    .eq('id', row.id)
    .select('id', { count: 'exact' });

  if (del.error) {
    return res.status(500).json({ ok: false, error: 'DELETE_FAILED', message: del.error.message });
  }

  return res.status(200).json({ ok: true, deleted: del.count || 0 });
}
