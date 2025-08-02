import { supabase } from '@/lib/supabaseClient';

/**
 * Inserisce una spesa nella tabella `finances`.
 *
 * @param {Object}  params
 * @param {string}  params.userId        - UUID dell’utente (auth.uid()).
 * @param {string}  params.categoryName  - Nome della categoria (es. 'casa').
 * @param {string}  params.description   - Descrizione libera.
 * @param {number}  params.amount        - Importo in euro.
 * @param {string}  params.spentAt       - ISO date (YYYY‑MM‑DD) o ISO datetime.
 * @param {number}  [params.qty=1]       - Quantità (valore di default = 1).
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function insertExpense({
  userId,
  categoryName,
  description,
  amount,
  spentAt,
  qty = 1
}) {
  const normalized = categoryName.trim().toLowerCase();

  const { data: cat, error: catError } = await supabase
    .from('finance_categories')
    .select('id')
    .eq('slug', normalized)
    .maybeSingle();

  if (catError) return { data: null, error: catError };
  if (!cat)     return { data: null, error: { message: 'Categoria non trovata' } };

  const { data, error } = await supabase
    .from('finances')
    .insert([{
      user_id:     userId,
      category_id: cat.id,
      description,
      amount,
      spent_at:    spentAt,
      qty
    }])
    .select()
    .single();

  return { data, error };
}
