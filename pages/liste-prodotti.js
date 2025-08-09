<div style={styles.itemActions}>
  <button
    title="Segna 1 acquistato"
    onClick={() => markBought(it.id, 1)}
    style={it.purchased ? styles.actionSuccess : styles.actionDanger}
  >
    {it.purchased ? '✔ Comprato 1' : 'Comprato 1'}
  </button>

  {Number(it.qty) > 1 && (
    <button
      title="Segna tutta la quantità come acquistata"
      onClick={() => markBought(it.id, Number(it.qty))}
      style={styles.actionSuccess}
    >
      ✅ Comprato tutto
    </button>
  )}

  <div style={{display:'flex', gap:6}}>
    <button title="Diminuisci quantità" onClick={() => incQty(it.id, -1)} style={styles.actionGhost}>−</button>
    <button title="Aumenta quantità" onClick={() => incQty(it.id, +1)} style={styles.actionGhost}>＋</button>
  </div>
  <button title="Elimina" onClick={() => removeItem(it.id)} style={styles.actionGhostDanger}>🗑 Elimina</button>
</div>
