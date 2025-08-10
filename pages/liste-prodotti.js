// pages/stato-scorte.js
import { useEffect, useRef, useState } from 'react';

const styles = {
  page: { maxWidth: 1100, margin: '32px auto', padding: '0 16px', color: '#fff', fontFamily: 'ui-sans-serif, system-ui' },
  h1: { fontSize: 28, fontWeight: 700, marginBottom: 16 },
  panel: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 16, marginBottom: 16 },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 14 },
  th: { textAlign: 'left', opacity: 0.8, padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.1)' },
  td: { padding: '10px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  tag: { fontSize: 12, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.2)' },
  btn: { padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer' },
  danger: { color: '#fecaca' },
  ok: { color: '#bbf7d0' },
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  micro: { width: 120, height: 32 },
};

export default function StatoScorte() {
  const [data, setData] = useState({ critical: [], normal: [], all: [] });
  const [loading, setLoading] = useState(true);
  const [listening, setListening] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/inventory/list');
      const j = await r.json();
      if (j.ok) setData(j);
      else console.warn(j.error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ————— Sparkline
  function Sparkline({ series }) {
    const ref = useRef(null);
    useEffect(() => {
      const ctx = ref.current.getContext('2d');
      const w = ref.current.width, h = ref.current.height;
      ctx.clearRect(0,0,w,h);
      if (!series || series.length < 2) return;
      const min = Math.min(...series), max = Math.max(...series);
      const pad = 4;
      ctx.beginPath();
      series.forEach((v, i) => {
        const x = pad + (i * (w - 2*pad)) / (series.length - 1);
        const y = h - pad - (max === min ? 0.5 : ( (v - min) / (max - min) )) * (h - 2*pad);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#a5b4fc';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, [series]);
    return <canvas ref={ref} width={styles.micro.width} height={styles.micro.height} style={{ display: 'block', opacity: 0.9 }} />;
  }

  // ————— Registrazione → /api/stt → /api/inventory/voice-adjust
  async function toggleVoice() {
    if (listening) {
      mediaRecorderRef.current?.stop();
      setListening(false);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    chunksRef.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      // 1) trascrivi
      const fd = new FormData();
      fd.append('audio', blob, 'voice.webm');
      const stt = await fetch('/api/stt', { method: 'POST', body: fd }).then(r => r.json());
      const text = stt?.text || '';
      if (!text) { alert('Riconoscimento vocale non riuscito'); return; }

      // 2) invia a voice-adjust
      const adj = await fetch('/api/inventory/voice-adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).then(r => r.json());

      if (!adj?.ok) alert('Aggiornamento non riuscito: ' + (adj?.error || ''));
      else alert('Aggiornamento effettuato.\n' + (adj?.parsed?.map(x => `• ${x.raw}`).join('\n') || ''));

      await load();
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setListening(true);
  }

  function Row({ r }) {
    const packsOnHand = r.perPack ? (r.onHandUnits / r.perPack) : null;
    return (
      <tr>
        <td style={styles.td}><strong>{r.name}</strong>{r.brand ? <span style={{ opacity: .7 }}> – {r.brand}</span> : null}</td>
        <td style={styles.td}>{r.category}</td>
        <td style={styles.td} title="Unità a magazzino">{r.onHandUnits ?? 0}</td>
        <td style={styles.td}>{r.perPack ?? '—'}</td>
        <td style={styles.td}>{packsOnHand != null ? packsOnHand.toFixed(2) : '—'}</td>
        <td style={styles.td}>{r.rateUnitsPerDay != null ? r.rateUnitsPerDay.toFixed(2) : '—'}</td>
        <td style={styles.td}><Sparkline series={r.sparkline} /></td>
        <td style={styles.td}>
          {r.alert.depleting ? <span style={{ ...styles.tag, borderColor: '#fca5a5' }}>consumo &ge; 80%</span> : null}{' '}
          {r.alert.expiring ? <span style={{ ...styles.tag, borderColor: '#fde68a' }}>scadenza &lt; 10gg</span> : null}{' '}
          {r.alert.lowPacks ? <span style={{ ...styles.tag, borderColor: '#93c5fd' }}>&lt; 2 confez.</span> : null}
        </td>
      </tr>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <h1 style={styles.h1}>Stato Scorte</h1>
        <button style={styles.btn} onClick={toggleVoice}>
          {listening ? '⏺️ Registrazione… clicca per fermare' : '🎙️ Aggiorna via voce'}
        </button>
      </div>

      <div style={styles.panel}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Prodotti in esaurimento / scadenza</h3>
        {loading ? <div>Caricamento…</div> : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Prodotto</th>
                <th style={styles.th}>Categoria</th>
                <th style={styles.th}>Unità</th>
                <th style={styles.th}>per confezione</th>
                <th style={styles.th}>Confezioni</th>
                <th style={styles.th}>Consumo u/g</th>
                <th style={styles.th}>Trend</th>
                <th style={styles.th}>Alert</th>
              </tr>
            </thead>
            <tbody>
              {data.critical.length === 0
                ? <tr><td style={styles.td} colSpan={8}>&nbsp;— Nessuna criticità</td></tr>
                : data.critical.map(r => <Row key={r.id} r={r} />)}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.panel}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Tutte le scorte</h3>
        {loading ? <div>Caricamento…</div> : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Prodotto</th>
                <th style={styles.th}>Categoria</th>
                <th style={styles.th}>Unità</th>
                <th style={styles.th}>per confezione</th>
                <th style={styles.th}>Confezioni</th>
                <th style={styles.th}>Consumo u/g</th>
                <th style={styles.th}>Trend</th>
                <th style={styles.th}>Alert</th>
              </tr>
            </thead>
            <tbody>
              {data.all.map(r => <Row key={r.id} r={r} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
