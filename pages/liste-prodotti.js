 {/* Toast */}
          {toast && (
            <div style={{
              position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
              background: toast.type==='ok' ? '#16a34a' : (toast.type==='err' ? '#ef4444' : '#334155'),
              color:'#fff', padding:'10px 14px', borderRadius:10, boxShadow:'0 6px 16px rgba(0,0,0,.35)', zIndex:9999
            }}>
              {toast.msg}
            </div>
          )}
<style jsx>{`
  @keyframes jarvisPulse {
    0%   { box-shadow: 0 0 0 0 rgba(239,68,68,.65); }
    70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  .jarvisLow {
    animation: jarvisPulse 1.5s infinite;
  }
`}</style>

        </div>
      </div>
    </>
  );
}
/** Piccolo workaround per evitare warning su più MediaRecorder in certi browser */
function theMediaWorkaround(){}

/* ---------------- styles (ottimizzati) ---------------- */
const styles = {
  page: {
    width: '100%',
    minHeight: '100vh',
    background: '#0f172a',
    padding: 24, // più compatto per mobile
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontFamily:
      'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  },

  card: {
    width: '100%',
    maxWidth: 1000,
    background: 'rgba(0,0,0,.6)',
    borderRadius: 16,
    padding: 22,
    boxShadow: '0 6px 16px rgba(0,0,0,.3)',
  },

  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  homeBtn: {
    background: '#6366f1',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    textDecoration: 'none',
    fontWeight: 700,
  },

  switchRow: { display: 'flex', gap: 10, margin: '16px 0 10px', flexWrap: 'wrap' },
  switchBtn: {
    background: 'rgba(255,255,255,.08)',
    border: '1px solid rgba(255,255,255,.15)',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 600,
  },
  switchBtnActive: {
    background: '#06b6d4',
    border: 0,
    color: '#0b1220',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
  },

  toolsRow: { display: 'flex', flexWrap: 'wrap', gap: 10, margin: '12px 0 6px' },

  voiceBtn: {
    background: '#6366f1',
    border: 0,
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 12,
    cursor: 'pointer',
    fontWeight: 800,
  },

  sectionLarge: { marginTop: 30, marginBottom: 10 },
  sectionXL: { marginTop: 38, marginBottom: 12 },
  h3: { margin: '6px 0 12px' },

  listGrid: { display: 'flex', flexDirection: 'column', gap: 12 },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 12,
    padding: '10px 12px',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemMain: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 260, flex: 1 },
  qtyBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 10,
    background: 'rgba(99,102,241,.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
  },
  itemName: { fontSize: 16, fontWeight: 700, lineHeight: 1.1 },
  itemBrand: { fontSize: 12, opacity: 0.8 },

  itemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  actionSuccess: {
    background: '#16a34a',
    border: 0,
    color: '#fff',
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
  },
  actionDanger: {
    background: '#ef4444',
    border: 0,
    color: '#fff',
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
  },
  actionGhost: {
    background: 'rgba(255,255,255,.12)',
    border: '1px solid rgba(255,255,255,.2)',
    color: '#fff',
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
  },
  actionGhostDanger: {
    background: 'rgba(239,68,68,.1)',
    border: '1px solid rgba(239,68,68,.6)',
    color: '#fff',
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
  },

  formRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,.15)',
    background: 'rgba(255,255,255,.06)',
    color: '#fff',
    minWidth: 160, // -40px vs prima per stare su schermi stretti
    flex: '1 1 160px',
  },
  primaryBtn: {
    background: '#16a34a',
    border: 0,
    color: '#fff',
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'rgba(255,255,255,.04)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '10px',
    borderBottom: '1px solid rgba(255,255,255,.12)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px',
    borderBottom: '1px solid rgba(255,255,255,.08)',
    verticalAlign: 'middle',
  },

  scorteHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },

  voiceBtnSmall: {
    background: '#6366f1',
    border: 0,
    color: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  voiceBtnSmallStop: {
    background: '#ef4444',
    border: 0,
    color: '#fff',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  ocrBtnSmall: {
    background: '#06b6d4',
    border: 0,
    color: '#0b1220',
    padding: '8px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
    ocrInlineBtn: {
    background: 'rgba(6,182,212,.15)',
    border: '1px solid rgba(6,182,212,.6)',
    color: '#e0fbff',
    padding: '6px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }, // <-- VIRGOLA QUI

  /* ---------- Badge “Giorni rimasti” ---------- */
  daysBadgeBase: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    height: 26,
    padding: '0 8px',
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  },
  daysBadgeGreen: {
    background: 'rgba(22,163,74,.18)',
    border: '1px solid rgba(22,163,74,.7)',
    color: '#dcfce7',
  },
  daysBadgeAmber: {
    background: 'rgba(245,158,11,.18)',
    border: '1px solid rgba(245,158,11,.7)',
    color: '#fffbeb',
  },
  daysBadgeRed: {
    background: 'rgba(239,68,68,.18)',
    border: '1px solid rgba(239,68,68,.7)',
    color: '#fee2e2',
  },
  daysBadgeGray: {
    background: 'rgba(148,163,184,.18)',
    border: '1px solid rgba(148,163,184,.6)',
    color: '#e2e8f0',
  },
  inputTable: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: '100%',
  minWidth: 0,
},
inputTableSm: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: 90,
  minWidth: 0,
},
inputTableXs: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: 110,
  minWidth: 0,
},
  inputTable: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: '100%',
  minWidth: 0,
},
inputTableSm: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: 90,
  minWidth: 0,
},
progressWrap: {
  position: 'relative',
  width: 120,
  height: 10,
  borderRadius: 999,
  background: 'rgba(255,255,255,.15)',
  overflow: 'hidden',
  flex: '0 0 120px',
},
progressBar: {
  position: 'absolute',
  left: 0,          // <-- usa left/top/bottom (NON inset)
  top: 0,
  bottom: 0,
  width: '0%',      // verrà sovrascritta inline con `${pct * 100}%`
  transition: 'width .25s ease, background-color .25s ease',
},

  inputTableXs: {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  width: 110,
  minWidth: 0,
},

}; // <-- e chiudi l’oggetto con punto e virgola
