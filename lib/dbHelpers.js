import { supabase } from '@/lib/supabaseClient';

/**
 * Inserisce una spesa nella tabella `finances`.
 *
 * @param {Object}  params
 * @param {string}  params.userId        - UUID dell’utente (auth.uid()).
 * @param {string}  params.categoryName  - Nome della categoria (es. 'casa').
 * @param {string}  params.description   - Descrizione libera.
 * @param {number}  params.amount        - Importo in euro.
 * @param {string}  params.date          - ISO date (YYYY‑MM‑DD) o ISO datetime.
 * @param {number}  [params.qty=1]       - Quantità (valore di default = 1).
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function insertExpense({
  userId,
  categoryName,
  description,
  amount,
  date,
  qty = 1  // nuovo parametro opzionale con default
}) {
  // Normalizza il nome categoria (minuscolo + trim)
  const normalized = categoryName.trim().toLowerCase();

  // 1. Recupera l’id della categoria
  const { data: cat, error: catError } = await supabase
    .from('finance_categories')
    .select('id')
    .eq('name', normalized)
    .maybeSingle();

  if (catError) return { data: null, error: catError };
  if (!cat)     return { data: null, error: { message: 'Categoria non trovata' } };

  // 2. Inserisce la spesa
  console.log('DEBUG categoryName:', categoryName, '| length:', categoryName.length);
  const { data, error } = await supabase
    .from('finances')
    .insert([{
      user_id:     userId,
      category_id: cat.id,
      description,
      amount,
      qty,         // nuovo campo
      date
    }])
    .select()
    .single();

  return { data, error };
}
