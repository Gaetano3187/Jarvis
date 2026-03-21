// ═══════════════════════════════════════════════════════════════════════
// PATCH per pages/home.js — funzione _salvaRicevuta
//
// PROBLEMA: per categoria "cene" i receipt_items non venivano salvati,
// quindi in pagina cene-aperitivi compariva "Nessun dettaglio".
//
// SOLUZIONE: salvare i receipt_items PER TUTTE LE CATEGORIE,
// non solo per "casa". L'inventario rimane solo per "casa".
//
// ISTRUZIONI:
// Nel file pages/home.js, cerca il blocco:
//
//   // Salva receipt_items
//   if (recId && items.length) {
//
// E sostituisci l'INTERO blocco _salvaRicevuta con quello qui sotto.
// In alternativa, cerca solo la condizione che blocca il salvataggio items
// per cene (vedi commento FIX nel codice sotto).
// ═══════════════════════════════════════════════════════════════════════

// ─── FUNZIONE _salvaRicevuta COMPLETA E CORRETTA ────────────────────────
async function _salvaRicevuta(data) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sessione scaduta')

    const pd  = data.purchase_date ?? new Date().toISOString().slice(0, 10)
    const st  = data.store ?? 'Generico'
    const im  = parseFloat(data.price_total ?? 0)
    const cat = catFromStore(data.store, data.store_type)
      || (['casa','vestiti','cene','varie'].includes(data.categoria) ? data.categoria : 'varie')
    const pm  = data.payment_method ?? 'unknown'
    const items = Array.isArray(data.items) ? data.items : []

    // Salva spesa
    const { data: expRow, error: expErr } = await supabase.from('expenses').insert([{
      user_id: user.id, category: cat, store: st,
      store_address: data.store_address ?? null,
      description: `Spesa ${st} — ${pd}`,
      purchase_date: pd, amount: im, payment_method: pm, source: 'ocr',
    }]).select('id').single()
    if (expErr) throw new Error(expErr.message)

    // Salva receipt
    let recId = null
    try {
      const { data: rr } = await supabase.from('receipts').insert([{
        user_id: user.id, expense_id: expRow?.id, store: st,
        store_address: data.store_address ?? null,
        purchase_date: pd, price_total: im, payment_method: pm,
        raw_text: data.raw_text ?? null, confidence: data.confidence ?? 'medium',
      }]).select('id').single()
      recId = rr?.id ?? null
    } catch {}

    // ── FIX: salva receipt_items per TUTTE le categorie ──────────────────
    // Prima era: if (recId && items.length) { ... solo per casa ... }
    // Ora salviamo items per tutte le categorie (casa, cene, vestiti, varie)
    if (recId && items.length) {
      try {
        await supabase.from('receipt_items').insert(items.map(it => ({
          receipt_id: recId, user_id: user.id, name: it.name,
          brand: it.brand ?? null,
          packs: it.packs ?? 1,
          units_per_pack: it.units_per_pack ?? 1,
          unit_per_pack_label: it.unit_per_pack_label ?? 'pz',
          qty: it.qty ?? 1, unit: it.unit ?? 'pz',
          unit_price: it.unit_price ?? it.price ?? 0,
          price: it.price ?? 0,
          category_item: it.category_item ?? 'alimentari',
          expiry_date: it.expiry_date ?? null,
          purchase_date: pd,
        })))
      } catch {}
    }
    // ─────────────────────────────────────────────────────────────────────

    // Aggiorna inventario SOLO per categoria "casa"
    if (cat === 'casa' && items.length) {
      for (const item of items.filter(it => it.name && it.category_item !== 'altro')) {
        try {
          const tot = Number(item.qty || 1)
          const perishable = item.perishable_type || 'standard'
          const catItem = item.category_item || 'alimentari'
          const expiryAuto = perishable === 'fresh' && !item.expiry_date
            ? (() => { const d = new Date(pd); d.setDate(d.getDate()+2); return d.toISOString().slice(0,10) })()
            : (item.expiry_date ?? null)
          const searchKey = item.name.split(' ').slice(0,2).join(' ')
          const { data: ex } = await supabase.from('inventory').select('id,qty,initial_qty')
            .eq('user_id', user.id).ilike('product_name', `%${searchKey}%`).maybeSingle()
          if (ex) {
            await supabase.from('inventory').update({
              qty: Number(ex.qty || 0) + tot,
              initial_qty: Number(ex.initial_qty || 0) + tot,
              consumed_pct: 0, avg_price: item.unit_price || item.price || 0,
              last_updated: new Date().toISOString(), perishable_type: perishable,
              ...(expiryAuto ? { expiry_date: expiryAuto } : {}),
            }).eq('id', ex.id)
          } else {
            await supabase.from('inventory').insert({
              user_id: user.id, product_name: item.name, brand: item.brand ?? null,
              category: catItem,
              qty: tot, initial_qty: tot,
              packs: item.packs ?? 1,
              units_per_pack: item.units_per_pack ?? 1,
              unit_label: item.unit_per_pack_label ?? item.unit ?? 'pz',
              unit: item.unit ?? 'pz',
              avg_price: item.unit_price || item.price || 0,
              purchase_date: pd, expiry_date: expiryAuto, consumed_pct: 0,
              perishable_type: perishable,
            })
          }
        } catch (invErr) { console.warn('[inv] skip', item.name, invErr?.message) }
      }
    }

    // Spunta lista spesa (per tutte le categorie con items)
    if (items.length) {
      try {
        const { data: lista } = await supabase.from('shopping_list').select('id,name')
          .eq('user_id', user.id).eq('purchased', false)
        if (lista?.length) {
          const ids = []
          for (const item of items) {
            if (!item.name) continue
            const parola = item.name.split(' ')[0].toLowerCase()
            const match = lista.find(l =>
              l.name.toLowerCase().includes(parola) ||
              parola.includes(l.name.toLowerCase().split(' ')[0])
            )
            if (match && !ids.includes(match.id)) ids.push(match.id)
          }
          if (ids.length) await supabase.from('shopping_list')
            .update({ purchased: true, updated_at: new Date().toISOString() }).in('id', ids)
        }
      } catch {}
    }

    // Pocket cash (solo pagamenti in contanti)
    if (pm === 'cash' && im > 0) {
      try {
        await supabase.from('pocket_cash').insert({
          user_id: user.id, note: `Spesa ${st} (${pd})`,
          delta: -im, moved_at: new Date().toISOString(),
        })
      } catch {}
    }

    const nItems = items.length
    const catIcon = {casa:'🏠',cene:'🍽️',vestiti:'👗',varie:'🧰'}[cat] || '📦'
    const catLabel = {casa:'Casa/Dispensa',cene:'Cene & Aperitivi',vestiti:'Vestiti & Moda',varie:'Spese Varie'}[cat] || cat
    setMessages(p => [...p, { role: 'assistant', text: `✅ Scontrino salvato!\n🏪 ${st} — ${eur(im)}\n${catIcon} Categoria: ${catLabel}\n📦 ${nItems} prodotti registrati${cat === 'casa' && nItems ? ' in dispensa' : ''}` }])
    setJarvisOpen(true)
    if (userId) await loadData(userId)

  } catch (e) {
    setErr('Salvataggio: ' + e.message)
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ISTRUZIONE ALTERNATIVA (modifica minima):
//
// Se vuoi applicare solo la correzione minima invece di sostituire
// l'intera funzione, nel file home.js cerca esattamente questo blocco:
//
//   // Salva receipt_items
//   if (recId && items.length) {
//     try {
//       await supabase.from('receipt_items').insert(items.map(it => ({
//
// e RIMUOVI qualsiasi condizione che limiti il salvataggio
// alla sola categoria "casa". Il blocco deve eseguire sempre
// quando recId && items.length, indipendentemente da cat.
// ═══════════════════════════════════════════════════════════════════════