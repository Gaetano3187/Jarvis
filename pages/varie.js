const fetchSpese = async () => {
  setLoading(true);
  const { data, error } = await supabase
    .from('finances')
    .select('id, description, amount, qty, spent_at, category_id')
    .eq('category_id', '075ce548-15a9-467c-afc8-8b156064eeb6')
    .order('created_at', { ascending: false });

  if (!error) setSpese(data);
  else setError(error.message);

  setLoading(false);
};
