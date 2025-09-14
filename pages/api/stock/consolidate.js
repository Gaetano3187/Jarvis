// pages/api/stock/consolidate.js
// Consolidamento scorte duplicate per utente, con chiave canonica.
// Dry-run di default: POST { user_id:"...", apply?:true, days?:null|number }

import { createClient } from '@supabase/supabase-js';

const TBL_STOCK = process.env.JARVIS_STOCK_TABLE || 'jarvis_scorte'; // <— Cambia se usi un nome diverso

function serverClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase URL/key mancanti nelle env');
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ================= Canonicalizzazione ================ */
const BRAND_ALIASES = {
  'm. bianco':'Mulino Bianco','m.bianco':'Mulino Bianco','mulino bianco':'Mulino Bianco',
  'sanwa':'Saiwa','saiwa':'Saiwa','san carlo':'San Carlo',
  'dash':'Dash','lenor':'Lenor','ferrero':'Ferrero','motta':'Motta',
  'arborea':'Arborea','parmalat':'Parmalat','galbani':'Galbani',
  'garofalo':'Garofalo','lavazza':'Lavazza','eridania':'Eridania','chiquita':'Chiquita','decò':'Decò','deco':'Decò'
};
function canonBrand(b=''){ const k = String(b).toLowerCase().replace(/\./g,'').trim(); return BRAND_ALIASES[k] || (b ? b.trim() : ''); }
function stripAccents(s=''){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function tokenClean(s=''){
  return stripAccents(String(s).toLowerCase())
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\b(\d+)\s*(g|gr|gramm|kg|ml|cl|l)\b/g,' ')
    .replace(/\b(\d+)\s*(pz|pezzi|x|×)\b/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function milkAttrs(name=''){
  const s = tokenClean(name);
  const fat = /\bintero\b/.test(s) ? 'fat:i'
            : /\b(ps|parzialmente|semi|parz)\b/.test(s) ? 'fat:ps'
            : /\bscrem\b/.test(s) ? 'fat:s'
            : 'fat:?';
  const lf  = /\b(zymil|zl|senza lattosio|s\/la|senzalattosio|delact)\b/.test(s) ? 'lf:1' : 'lf:0';
  return `${fat}|${lf}`;
}
function productFamily(name=''){
  const s = tokenClean(name);
  if (/\bfiesta\b/.test(s)) return 'fam:fiesta';
  if (/\byo[-\s]?yo\b/.test(s)) return 'fam:yoyo';
  if (/\bpods?\b/.test(s)) return 'fam:pods';
  if (/\bpancarr[ei]\b/.test(s)) return 'fam:pancarre';
  if (/\bcipster\b/.test(s)) return 'fam:cipster';
  if (/\bgalletti\b/.test(s)) return 'fam:galletti';
  if (/\bcornetti\b/.test(s)) return 'fam:cornetti';
  if (/\bzucchero\b/.test(s)) return 'fam:zucchero';
  if (/\buova\b/.test(s)) return 'fam:uova';
  if (/\bmozzarella\b/.test(s)) return 'fam:mozzarella';
  if (/\blatte\b/.test(s)) return 'fam:latte';
  return 'fam:?';
}
function canonicalKey(r) {
  const brand = canonBrand(r.brand || '');
  let base = tokenClean(r.name || '');
  base = base
    .replace(/\b(doc|uht|buono|classica|regular|regolare|shop|biodegr|bio)\b/g,' ')
    .replace(/\s+/g,' ').trim();
  const fam  = productFamily(r.name || '');
  const milk = milkAttrs(r.name || '');
  return /fam:\?/.test(fam)
    ? `${brand}|${base}`
    : `${brand}|${base}|${fam}${fam==='fam:fiesta'||fam==='fam:yoyo'||fam==='fam:uova'||fam==='fam:latte' ? '|'+milk : ''}`;
}
function sanitizeUnits(row) {
  const bad = /^(g|gr|gramm|kg|ml|cl|l|litri?|grammi?)$/i;
  const u = String(row.unit_label || '').trim();
  if (bad.test(u)) return { ...row, units_per_pack: 1, unit_label: 'unità' };
  return row;
}
// Correzioni “tipiche”
function fixKnown(row) {
  let out = { ...row, brand: canonBrand(row.brand||'') };
  const s = tokenClean(out.name || '');
  if (/\bpods?\b/.test(s)) { out.brand = 'Dash'; if (!out.units_per_pack || out.unit_label==='unità') { out.units_per_pack = /30\b/.test(s) ? 30 : out.units_per_pack || 30; out.unit_label = 'pod'; } }
  if (/\bfiesta\b/.test(s)) { out.brand = 'Ferrero'; out.units_per_pack = out.units_per_pack || 10; out.unit_label = 'pezzi'; }
  if (/\byo[-\s]?yo\b/.test(s)) { out.brand = 'Motta'; out.units_per_pack = out.units_per_pack || 10; out.unit_label = 'pezzi'; }
  if (/\bpancarr[ei]\b/.test(s) && /16/.test(s) && (!out.units_per_pack || out.unit_label==='unità')) { out.units_per_pack = 16; out.unit_label = 'fette'; }
  if (/\blatte\b/.test(s) && /\buht\b/.test(s)) { if (!out.units_per_pack || out.unit_label==='unità') { out.units_per_pack = 1; out.unit_label = 'cartone'; } }
  if (/\buova\b/.test(s) && (!out.units_per_pack || out.units_per_pack===1) && out.unit_label==='unità') { out.units_per_pack = 6; out.unit_label = 'uova'; }
  return sanitizeUnits(out);
}
function minIso(a,b){ if(!a) return b||null; if(!b) return a||null; return (a<b)?a:b; }

/* ================= Consolidatore ================ */
async function consolidateForUser(supabase, user_id, { apply=false, days=null } = {}) {
  // Finestra temporale opzionale (es. ultimi N giorni)
  const cols = 'id, user_id, name, brand, packs, units_per_pack, unit_label, expires_at, image, image_url, created_at, updated_at';
  let q = supabase.from(TBL_STOCK).select(cols).eq('user_id', user_id);
  if (days && Number(days) > 0) {
    const d = new Date(); d.setDate(d.getDate() - Number(days));
    q = q.gte('created_at', d.toISOString());
  }
  const { data: rows, error } = await q.limit(10000);
  if (error) throw error;

  // Build gruppi
  const groups = new Map();
  for (const row of rows) {
    const r = fixKnown(sanitizeUnits(row));
    const key = canonicalKey({ name:r.name, brand:r.brand });
    const g = groups.get(key) || { key, items:[] };
    g.items.push(r);
    groups.set(key, g);
  }

  // Piano di merge
  const plan = [];
  for (const g of groups.values()) {
    if (g.items.length <= 1) continue;
    // packs tot
    const packsSum = g.items.reduce((s,x)=> s + Math.max(1, Number(x.packs || 1)), 0);
    // units_per_pack: preferisci il più alto non “unità”
    const cand = g.items
      .map(x => ({ u: Number(x.units_per_pack || 0), l: String(x.unit_label || 'unità') }))
      .sort((a,b)=> (b.u||0) - (a.u||0));
    let up = 1, ul = 'unità';
    for (const c of cand) { if (c.u>0 && c.l !== 'unità') { up = c.u; ul = c.l; break; } }
    // expiry più vicina
    let exp = null;
    for (const x of g.items) exp = minIso(exp, x.expires_at);
    // brand/name “migliori”
    const brand = canonBrand(g.items[0].brand || '');
    const dispName = g.items
      .map(x => String(x.name || ''))
      .sort((a,b)=> b.length - a.length)[0] || g.items[0].name;

    // Winner: il più recente (o il primo)
    const winner = [...g.items].sort((a,b)=> new Date(b.updated_at||b.created_at||0) - new Date(a.updated_at||a.created_at||0))[0];
    const losers = g.items.filter(x => x.id !== winner.id).map(x => x.id);

    plan.push({
      key: g.key,
      winner: { id: winner.id, name: winner.name, brand: winner.brand },
      update: {
        name: dispName,
        brand,
        packs: packsSum,
        units_per_pack: up,
        unit_label: ul,
        expires_at: exp
      },
      delete: losers,
      count: g.items.length
    });
  }

  if (!apply) {
    return { ok:true, dryRun:true, found: plan.length, plan };
  }

  // Applica piano: update winner + delete losers, in sequenza
  for (const step of plan) {
    // update
    const { error: upErr } = await supabase
      .from(TBL_STOCK)
      .update({
        name: step.update.name,
        brand: step.update.brand,
        packs: step.update.packs,
        units_per_pack: step.update.units_per_pack,
        unit_label: step.update.unit_label,
        expires_at: step.update.expires_at || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', step.winner.id);
    if (upErr) throw upErr;

    // delete
    if (step.delete.length) {
      const { error: delErr } = await supabase
        .from(TBL_STOCK)
        .delete()
        .in('id', step.delete);
      if (delErr) throw delErr;
    }
  }

  return { ok:true, dryRun:false, applied: plan.length, plan };
}

/* ================= API handler ================ */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });
  try {
    const { user_id, apply=false, days=null } = req.body || {};
    if (!user_id) return res.status(400).json({ ok:false, error:'user_id required' });

    const supabase = serverClient();
    const out = await consolidateForUser(supabase, user_id, { apply: !!apply, days });

    return res.status(200).json(out);
  } catch (e) {
    console.error('[stock/consolidate] error', e);
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
