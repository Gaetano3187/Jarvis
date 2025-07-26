import { supabase } from "@/lib/supabaseClient";

/** Inserisce una spesa e restituisce { data, error } */
export async function insertExpense({ userId, categoryName, description, amount, date }) {
  const { data: cat } = await supabase
    .from("finance_categories")
    .select("id")
    .eq("name", categoryName)
    .single();

  if (!cat) return { error: { message: "Categoria non trovata" } };

  return await supabase
    .from("finances")
    .insert([{
      user_id     : userId,
      category_id : cat.id,
      description ,
      amount      ,
      date        ,
    }])
    .select()
    .single();
}
