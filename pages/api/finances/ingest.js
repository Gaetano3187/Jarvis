// 4) Invia alle FINANZE (solo se ci sono righe acquisto)
if (!purchases.length) {
  if (DEBUG) console.log('[FINANCES_INGEST] skipped: no items');
} else {
  try {
    const itemsSafe = purchases.map(p => ({
      name: p.name,
      brand: p.brand || '',
      packs: Number.isFinite(p.packs) ? p.packs : 0,
      unitsPerPack: Number.isFinite(p.unitsPerPack) ? p.unitsPerPack : 0,
      unitLabel: p.unitLabel || '',
      priceEach: Number.isFinite(p.priceEach) ? p.priceEach : 0,
      priceTotal: Number.isFinite(p.priceTotal) ? p.priceTotal : 0,
      currency: p.currency || 'EUR',
      expiresAt: p.expiresAt || ''
    }));

    const payload = {
      ...(userIdRef.current ? { user_id: userIdRef.current } : {}),
      ...(store ? { store } : {}),
      ...(purchaseDate ? { purchaseDate } : {}),
      payment_method: 'cash',
      card_label: null,
      items: itemsSafe
    };

    if (DEBUG) console.log('[FINANCES_INGEST] payload', payload);

    const r = await fetchJSONStrict(API_FINANCES_INGEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 30000);

    if (DEBUG) console.log('[FINANCES_INGEST OK]', r);
  } catch (e) {
    console.warn('[FINANCES_INGEST] fail', e);
    showToast(`Finanze: ${e.message}`, 'err');
  }
}
