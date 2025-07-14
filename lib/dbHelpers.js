async function handleVoice(blob) {
  /* … STT … Assistant … */
  const data = JSON.parse(answer);               // ← JSON garantito dal prompt

  if (data.action === 'add') {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user.id;

    const listId = await getOrCreateList(userId, data.list);

    for (const item of data.items) {
      const prodId = await getOrCreateProduct(userId, item.name);
      await addItemToList(
        userId,
        listId,
        prodId,
        item.qty ?? 1,
        item.unit ?? 'pz'
      );
    }

    // Ricarica liste da Supabase
    refreshListe();
  }
}
async function refreshListe() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('lists')
    .select(`id, name, list_type, list_items ( id, qty, unit, purchased, price, products ( name ) )`)
    .eq('user_id', user.id);

  if (!error) {
    setSuperList(data.filter(l => l.list_type === LISTA_SUPER)[0]?.list_items ?? []);
    setOnlineList(data.filter(l => l.list_type === LISTA_ONLINE)[0]?.list_items ?? []);
  }
}
