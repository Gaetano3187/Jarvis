// pages/api/stock/apply.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ error:'Method not allowed' }); }

  const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SURL || !SKEY) return res.status(500).json({ error:'Supabase service role non configurata' });

  const str = (v,d='') => String(v ?? d).trim();
  const int = (v,d=0) => Math.max(0, Math.trunc(Number(String(v ?? '').replace(',','.')) || d));

  let raw;
  try { raw = typeof req.body==='string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error:'Body non valido (JSON)' }); }

  const user_id = str(raw.user_id,'');
  const items = Array.isArray(raw.items) ? raw.items : [];
  if (!user_id) return res.status(400).json({ error:'user_id richiesto' });
  if (!items.length) return res.status(400).json({ error:'items deve essere un array non vuoto' });

  const supabase = createClient(SURL, SKEY, { auth:{ persistSession:false } });

  // ✅ questa è la tabella di stato che la UI "Liste Prodotti" legge
  const TABLE = 'jarvis_liste_state';

  // carica stato
  const { data: row, error: selErr } = await supabase
    .from(TABLE).select('state').eq('user_id', user_id).maybeSingle();

  if (selErr && selErr.code !== 'PGRST116') {
    return res.status(500).json({ error:'LOAD_STATE_FAILED', message: selErr.message });
  }

  const state = (row?.state && typeof row.state === 'object')
    ? row.state
    : { lists:{ supermercato:[], online:[] }, stock:[], currentList:'supermercato', learned:{} };

  const stock = Array.isArray(state.stock) ? [...state.stock] : [];
  const keyOf = (n,b,u) => `${String(n||'').toLowerCase().trim()}|${String(b||'').toLowerCase().trim()}|${int(u,1)}`;
  const nowISO = new Date().toISOString().slice(0,10);

  // merge semplice (puoi innestare la tua normalizzazione avanzata qui)
  for (const it of items) {
    const name = str(it.name), brand = str(it.brand);
    const packs = int(it.packs, 0);
    const upp   = Math.max(1, int(it.unitsPerPack, 1));
    if (!name) continue;

    const k = keyOf(name, brand, upp);
    const i = stock.findIndex(s => keyOf(s.name, s.brand||'', s.unitsPerPack||1) === k);

    if (i >= 0) {
      const old = stock[i];
      const newP = int((old.packs || 0) + (packs || 0), 0);
      stock[i] = {
        ...old,
        name, brand,
        packs: newP,
        unitsPerPack: upp,
        unitLabel: old.unitLabel || it.unitLabel || 'unità',
        expiresAt: it.expiresAt || old.expiresAt || '',
        baselinePacks: newP,
        lastRestockAt: nowISO,
        avgDailyUnits: old.avgDailyUnits || 0,
        residueUnits: newP * upp,
        packsOnly: false,
        needsUpdate: false
      };
    } else {
      stock.unshift({
        name, brand,
        packs: packs || 1,
        unitsPerPack: upp,
        unitLabel: it.unitLabel || 'unità',
        expiresAt: it.expiresAt || '',
        baselinePacks: packs || 1,
        lastRestockAt: nowISO,
        avgDailyUnits: 0,
        residueUnits: (packs || 1) * upp,
        packsOnly: false,
        needsUpdate: false
      });
    }
  }

  const newState = { ...state, stock };
  const { error: upErr } = await supabase
    .from(TABLE)
    .upsert({ user_id, state: newState }, { onConflict: 'user_id' });

  if (upErr) return res.status(500).json({ error:'SAVE_STATE_FAILED', message: upErr.message });

  return res.status(200).json({ ok:true, stock_len: stock.length });
}
