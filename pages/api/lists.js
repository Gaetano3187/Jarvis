// pages/api/lists.js
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

function getBearer(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (!URL || !ANON) {
    return res.status(500).json({ ok:false, error: 'Supabase env not configured' });
  }

  const accessToken = getBearer(req);
  if (!accessToken) {
    return res.status(401).json({ ok:false, error: 'Missing Authorization Bearer token' });
  }

  const supabase = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false }
  });

  if (req.method === 'GET') {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok:false, error: userErr?.message || 'Unauthenticated' });
    }
    const userId = userData.user.id;

    const { data, error } = await supabase
      .from('grocery_lists')
      .select('data, updated_at')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ ok:false, error: error.message });
    }

    const payload = data?.data || {
      lists: { supermercato: [], online: [] },
      stock: [],
      currentList: 'supermercato'
    };

    return res.json({ ok:true, data: payload, updated_at: data?.updated_at || null });
  }

  if (req.method === 'PUT') {
    const { lists, stock, currentList } = req.body || {};
    const payload = { lists, stock, currentList };

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok:false, error: userErr?.message || 'Unauthenticated' });
    }
    const userId = userData.user.id;

    const { error } = await supabase
      .from('grocery_lists')
      .upsert({ user_id: userId, data: payload })
      .select()
      .single();

    if (error) return res.status(500).json({ ok:false, error: error.message });
    return res.json({ ok:true });
  }

  return res.status(405).json({ ok:false, error: 'Method not allowed' });
}
