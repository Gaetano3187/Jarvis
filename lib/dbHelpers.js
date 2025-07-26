// lib/dbHelpers.js
import { supabase } from '@/lib/supabaseClient';   // alias Next.js/TS

/* --------------------  Costanti & utilità  -------------------- */

const TABLE_EXPENSES = 'finances';          // nuovo nome tabella

/** Recupera l’id della categoria (case–insensitive) partendo dal nome. */
export async function getCategoryId(name) {
  const { data, error } = await supabase
    .from('finance_categories')
    .select('id')
    .ilike('name', name)      // match “libero” maiuscole/minuscole
    .single();

  if (error) throw error;
  return data.id;
}

/* --------------------  Products & Lists  -------------------- */

/** Restituisce (o crea) `product.id` dato un nome. */
export async function getOrCreateProduct(userId, name) {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .single();

  if (data) return data.id;

  const { data: insert } = await supabase
    .from('products')
    .insert({ user_id: userId, name })
    .select('id')
    .single();

  return insert.id;
}

/** Restituisce (o crea) `list.id` per uno `list_type`. */
export async function getOrCreateList(userId, listType) {
  const { data } = await supabase
    .from('lists')
    .select('id')
    .eq('user_id', userId)
    .eq('list_type', listType)
    .single();

  if (data) return data.id;

  const { data: insert } = await supabase
    .from('lists')
    .insert({ user_id: userId, name: listType, list_type: listType })
    .select('id')
    .single();

  return insert.id;
}

/** Inserisce una riga in `list_items` (il trigger `upsert_inventory` gestisce le scorte). */
export async function addItemToList(userId, listId, productId, qty, unit) {
  await supabase.from('list_items').insert({
    user_id: userId,
    list_id: listId,
    product_id: productId,
    qty,
    unit,
  });
}

/* --------------------  Spese / Finances  -------------------- */

/** Ritorna tutte le spese con il nome della categoria (join implicita). */
export async function getExpenses(userId) {
  return supabase
    .from(TABLE_EXPENSES)
    .select('*, finance_categories(name)')
    .eq('user_id', userId);
}

/** Inserisce una nuova spesa. */
export async function insertExpense({
  userId,
  categoryName,
  description,
  amount,
  date,
}) {
  const categoryId = await getCategoryId(categoryName);

  return supabase.from(TABLE_EXPENSES).insert({
    user_id: userId,
    category_id: categoryId,
    description,
    amount,
    date,
  });
}

/** Inserisce una riga in `finances` (il trigger `trg_finances_after_ins` flagga `purchased`). */
export async function addFinanceRow(
  userId,
  productId,
  price,
  store,
  date,
  categoryId,
) {
  await supabase.from('finances').insert({
    user_id: userId,
    product_id: productId,
    amount: price,
    store_name: store,
    spent_at: date,
    category_id: categoryId ?? null,
  });
}
