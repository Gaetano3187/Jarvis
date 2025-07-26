// lib/dbHelpers.js
import { supabase } from '@/lib/supabaseClient';

/** restituisce (o crea) product.id per un nome */
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

/** restituisce (o crea) list.id per list_type */
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

/** inserisce riga in list_items (trigger upsert_inventory gestirà scorte) */
export async function addItemToList(userId, listId, productId, qty, unit) {
  await supabase.from('list_items').insert({
    user_id: userId,
    list_id: listId,
    product_id: productId,
    qty,
    unit,
  });
}

/** inserisce riga finances (trigger trg_finances_after_ins flagga purchased) */
export async function addFinanceRow(
  userId,
  productId,
  price,
  store,
  date,
  categoryId
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
