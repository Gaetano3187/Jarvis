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
    return res.status(500).json({ error: 'SERVICE_ROLE_KEY missing' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const id = body?.id;
  // user_id facoltativo con SRK; lo uso solo se lo fornisci
  const user_id = body?.user_id ? String(body.user_id).trim() : null;
  if (!id) return res.status(400).json({ error: 'id is required' });

  const supabase = createClient(SURL, SKEY, { auth: { persistSession: false } });

  let q = supabase.from('jarvis_spese_casa').delete().eq('id', id);
  if (user_id) q = q.eq('user_id', user_id);

  // v2: per avere il count devi fare .select(..., { count: 'exact' })
  const { error: delErr, count } = await q.select('id', { count: 'exact' });

  if (delErr) {
    return res.status(500).json({ ok: false, error: 'DELETE_FAILED', message: delErr.message });
  }
  return res.status(200).json({ ok: true, deleted: count || 0 });
}
