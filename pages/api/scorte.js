// pages/api/scorte.js
import { supabase } from '@/lib/supabaseClient';   // ← percorso corretto (2 livelli su)

/**
 * CRUD per la tabella “inventory” (scorte).
 * - GET    → lista completa
 * - POST   → inserisce nuovo record (req.body = {...})
 * - PATCH  → aggiorna { id, ...campi }
 * - DELETE → elimina { id }
 */
export default async function handler(req, res) {
  const table = supabase.from('inventory');           // se usi davvero la tabella “scorte”, cambia qui

  try {
    switch (req.method) {
      /* -------- READ -------- */
      case 'GET': {
        const { data, error } = await table.select('*');
        if (error) throw error;
        return res.status(200).json(data);
      }

      /* -------- CREATE -------- */
      case 'POST': {
        const { error } = await table.insert(req.body).select();
        if (error) throw error;
        return res.status(201).json({ ok: true });
      }

      /* -------- UPDATE -------- */
      case 'PATCH': {
        const { id, ...rest } = req.body;
        const { error } = await table.update(rest).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      /* -------- DELETE -------- */
      case 'DELETE': {
        const { id } = req.body;
        const { error } = await table.delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      /* -------- METHOD NOT ALLOWED -------- */
      default: {
        res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
