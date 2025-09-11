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
  const user_id = String(body?.user_id || '').trim();
  if (!id || !user_id) {
    return res.status(400).json({ error: 'id and user_id are required' });
  }

  const supabase = createClient(SURL, SKEY, { auth: { persistSession: false } });

  // DELETE con count reale (v2: serve .select(..., { count:'exact' }))
  const { error: delErr, count } = await supabase
    .from('jarvis_spese_casa')
    .delete()
    .eq('id', id)
    .eq('user_id', user_id)
    .select('id', { count: 'exact' });

  if (delErr) {
    return res.status(500).json({ error: 'DELETE_FAILED', message: delErr.message });
  }
  if (!count) {
    return res.status(200).json({ ok: true, deleted: 0, note: 'No rows matched (check RLS or ID)' });
  }

  return res.status(200).json({ ok: true, deleted: count });
}
