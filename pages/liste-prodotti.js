{/* Stato scorte */}
<div style={styles.sectionXL}>
  <div style={styles.scorteHeader}>
    <h3 style={{ ...styles.h3, marginBottom: 0 }}>📊 Stato Scorte</h3>

    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {!invRecBusy ? (
        <button
          type="button"
          onClick={toggleVoiceInventory}
          style={styles.voiceBtnSmall}
          disabled={busy}
        >
          🎙 Vocale Scadenze/Scorte
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleVoiceInventory}
          style={styles.voiceBtnSmallStop}
        >
          ⏹️ Stop
        </button>
      )}

      <button
        type="button"
        onClick={() => ocrInputRef.current?.click()}
        style={styles.ocrBtnSmall}
        disabled={busy}
      >
        📷 OCR Scontrini
      </button>

      <input
        ref={ocrInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        hidden
        onChange={(e) => handleOCR(Array.from(e.target.files || []))}
      />
    </div>
  </div>

  {stock.length === 0 ? (
    <p style={{ opacity: 0.8, marginTop: 8 }}>Nessun dato scorte</p>
  ) : (
    <table style={{ ...styles.table, marginTop: 10 }}>
      <thead>
        <tr>
          <th style={styles.th}>Prodotto</th>
          <th style={styles.th}>Marca</th>
          <th style={styles.th}>Confezioni</th>
          <th style={styles.th}>Unità/conf.</th>
          <th style={styles.th}>Residuo unità</th>
          <th style={styles.th}>Scadenza</th>
          <th style={styles.th}></th>
        </tr>
      </thead>
      <tbody>
        {stock.map((s, i) => (
          <tr key={i}>
            <td style={styles.td}>{s.name}</td>
            <td style={styles.td}>{s.brand || '-'}</td>
            <td style={styles.td}>
              {(s.packs ?? 0).toFixed?.(2) ?? s.packs}
            </td>
            <td style={styles.td}>
              {s.unitsPerPack ?? 1} {s.unitLabel || 'unità'}
            </td>
            <td style={styles.td}>
              {totalUnitsOf(s)}
              <button
                type="button"
                onClick={() => setResidualUnits(i)}
                style={{ ...styles.actionGhost, marginLeft: 8 }}
              >
                ✎ Imposta
              </button>
              <div style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
                <button
                  type="button"
                  onClick={() => addOneUnit(i, -1)}
                  style={styles.actionGhost}
                  title="− 1 unità"
                >
                  −1
                </button>
                <button
                  type="button"
                  onClick={() => addOneUnit(i, +1)}
                  style={styles.actionGhost}
                  title="+ 1 unità"
                >
                  +1
                </button>
              </div>
            </td>
            <td style={styles.td}>
              {s.expiresAt
                ? new Date(s.expiresAt).toLocaleDateString('it-IT')
                : '-'}
            </td>
            <td style={styles.td}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => openRowOcr(i)}
                  style={styles.ocrInlineBtn}
                  disabled={busy}
                >
                  📷 OCR
                </button>

                {/* Controlli rapidi confezioni */}
                <button
                  type="button"
                  onClick={() => addOnePack(i, -1)}
                  style={styles.actionGhost}
                  title="− 1 confezione"
                >
                  −1 conf.
                </button>
                <button
                  type="button"
                  onClick={() => addOnePack(i, +1)}
                  style={styles.actionGhost}
                  title="+ 1 confezione"
                >
                  +1 conf.
                </button>

                <button
                  type="button"
                  onClick={() => editStockRow(i)}
                  style={styles.actionGhost}
                >
                  ✎ Modifica
                </button>
                <button
                  type="button"
                  onClick={() => deleteStockRow(i)}
                  style={styles.actionGhostDanger}
                >
                  🗑 Elimina
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}

  {/* input file unico per OCR scadenza di riga */}
  <input
    ref={rowOcrInputRef}
    type="file"
    accept="image/*,application/pdf"
    capture="environment"
    hidden
    onChange={(e) => handleRowOcrChange(Array.from(e.target.files || []))}
  />

  <p style={{ opacity: 0.75, marginTop: 8 }}>
    Esempi scadenze: “il latte scade il 15/07/2025; lo yogurt il 10 agosto
    2025”.
  </p>
  <p style={{ opacity: 0.75, marginTop: 4 }}>
    Esempi scorte: “latte sono 3 bottiglie, pasta 4 pacchi, ferrero fiesta 3
    unità”. Per impostare il totale invece di aggiungere: “latte <b>porta a</b>{' '}
    3 bottiglie”.
  </p>
</div>

{/* Aggiungi SCORTA manuale */}
<div style={styles.sectionLarge}>
  <h3 style={styles.h3}>➕ Aggiungi scorta manuale</h3>

  <form onSubmit={addManualStock} style={styles.formRow}>
    <input
      placeholder="Prodotto (es. latte)"
      value={stockForm.name}
      onChange={(e) => setStockForm((f) => ({ ...f, name: e.target.value }))}
      style={styles.input}
      required
    />
    <input
      placeholder="Marca (opzionale)"
      value={stockForm.brand}
      onChange={(e) => setStockForm((f) => ({ ...f, brand: e.target.value }))}
      style={styles.input}
    />
    <input
      placeholder="Confezioni"
      inputMode="decimal"
      value={stockForm.packs}
      onChange={(e) => setStockForm((f) => ({ ...f, packs: e.target.value }))}
      style={{ ...styles.input, width: 120 }}
      required
    />
    <input
      placeholder="Unità/conf."
      inputMode="decimal"
      value={stockForm.unitsPerPack}
      onChange={(e) =>
        setStockForm((f) => ({ ...f, unitsPerPack: e.target.value }))
      }
      style={{ ...styles.input, width: 120 }}
      required
    />
    <input
      placeholder="Etichetta unità (es. bottiglie)"
      value={stockForm.unitLabel}
      onChange={(e) =>
        setStockForm((f) => ({ ...f, unitLabel: e.target.value }))
      }
      style={{ ...styles.input, width: 180 }}
    />
    <input
      placeholder="Scadenza YYYY-MM-DD (opz.)"
      value={stockForm.expiresAt}
      onChange={(e) =>
        setStockForm((f) => ({ ...f, expiresAt: e.target.value }))
      }
      style={{ ...styles.input, width: 200 }}
    />
    <button type="submit" style={styles.primaryBtn} disabled={busy}>
      Aggiungi alle scorte
    </button>
  </form>

  <p style={{ opacity: 0.8, marginTop: 6 }}>
    Esempio: “Latte — confezioni 1 — unità/conf. 6 — etichetta bottiglie”.
  </p>
</div>

{/* Toast */}
{toast && (
  <div
    style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      background:
        toast.type === 'ok'
          ? '#16a34a'
          : toast.type === 'err'
          ? '#ef4444'
          : '#334155',
      color: '#fff',
      padding: '10px 14px',
      borderRadius: 10,
      boxShadow: '0 6px 16px rgba(0,0,0,.35)',
      zIndex: 9999,
    }}
  >
    {toast.msg}
  </div>
)}
