// pages/api/inventory/snapshot.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Auth dall’header Authorization: Bearer <access_token> (arriva dal client)
    const auth = req.headers.authorization || '';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: auth } }
    });

    // Recupera user
    const { data: { user }, error: uerr } = await supabase.auth.getUser();
    if (uerr || !user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const uid = user.id;

    // Prova una lista di tabelle/view in ordine di probabilità
    const candidates = [
      'jarvis_liste_prodotti',
      'liste_prodotti',
      'jarvis_stock',
      'stock',
      'scorte',
      // eventuale VIEW unificata se la creerai:
      'jarvis_inventory_view'
    ];

    let rows = [];
    let lastError = null;

    for (const table of candidates) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', uid)
        .limit(500);

      if (error) { lastError = error; continue; }
      if (Array.isArray(data) && data.length) {
        rows = data;
        break;
      }
    }

    // Se ancora vuoto, restituisci elenco vuoto (ma con 200)
    if (!rows.length) {
      return res.status(200).json({ ok: true, items: [] });
    }

    // Mappa flessibile dei campi (name/qty/fill/scadenza)
    const mapped = rows.map(r => {
      const name =
        r.name ?? r.prodotto ?? r.item ?? r.titolo ?? 'Articolo';

      const qty =
        r.residuo ?? r.residuo_unita ?? r.units_remaining ?? r.remaining ??
        r.qty ?? r.quantity ?? r.qta ?? null;

      let fill =
        r.fill_pct ?? r.remaining_pct ?? r.consumo_pct ?? r.level_pct ?? null;

      // Calcola fill% se possibile
      if ((fill == null || isNaN(fill)) && (qty != null)) {
        const packs = Number(r.packs ?? r.confezioni ?? 0);
        const upp   = Number(r.unitsPerPack ?? r.unita_per_conf ?? 0);
        const totUnits =
          Number(r.total_units ?? r.initial_units ?? (packs && upp ? packs * upp : 0));
        if (totUnits > 0) {
          fill = Math.max(0, Math.min(100, Math.round((Number(qty) / totUnits) * 100)));
        }
      }

      const exp = r.expires_at ?? r.scadenza ?? null;

      return {
        name: String(name),
        qty: (qty != null && !isNaN(Number(qty))) ? Number(qty) : null,
        fill_pct: (fill != null && !isNaN(Number(fill))) ? Number(fill) : null,
        expires_at: exp
      };
    });

    // Ordina per fill crescente (quando presente), poi per nome
    mapped.sort((a, b) => {
      const af = a.fill_pct ?? 101, bf = b.fill_pct ?? 101;
      if (af !== bf) return af - bf;
      return String(a.name).localeCompare(String(b.name));
    });

    return res.status(200).json({ ok: true, items: mapped });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
