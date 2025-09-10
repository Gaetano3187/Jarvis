// pages/home.js
import React, { useRef, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';
import { useRouter } from 'next/router';

// Registratore (solo client)
const VoiceRecorder = dynamic(() => import('../components/VoiceRecorder'), { ssr: false });

// Import dinamico del brain (solo quando serve)
const getBrain = () => import('@/lib/brainHub');

/* ================= Helpers generali ================= */
function safeJSONStringify(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch {
    const seen = new WeakSet();
    return JSON.stringify(obj, (k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    }, 2);
  }
}
function formatResult(res) {
  if (!res && res !== 0) return 'Nessun risultato.';
  if (typeof res === 'string' || typeof res === 'number' || typeof res === 'boolean') return String(res);
  return safeJSONStringify(res);
}
function fmtEuro(n) {
  if (n == null || isNaN(n)) return '—';
  try { return Number(n).toLocaleString('it-IT', { style:'currency', currency:'EUR' }); }
  catch { return `${n} €`; }
}
function fmtInt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('it-IT');
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return `${Math.round(Number(n))}%`;
}
function pad(s, len) {
  const t = String(s ?? '');
  return t.length >= len ? t.slice(0, len) : (t + ' '.repeat(len - t.length));
}
function smallTable(rows, columns) {
  if (!Array.isArray(rows) || !rows.length) return '(nessun elemento)';
  const colWidths = columns.map(c => Math.max(
    c.label.length,
    ...rows.map(r => String(r[c.key] ?? '').length)
  ));
  const header = columns.map((c,i)=>pad(c.label, colWidths[i])).join('  ');
  const sep    = colWidths.map(w => '─'.repeat(w)).join('  ');
  const body   = rows.map(r => columns.map((c,i)=>pad(String(r[c.key] ?? ''), colWidths[i])).join('  ')).join('\n');
  return `${header}\n${sep}\n${body}`;
}

/* ================= Mini-charts (SVG puri) ================= */
function svgBars(items, { max = 100, unit = '%', bg = '#0b0f14' } = {}) {
  const rows = items.slice(0, 10);
  const W = 420, H = 18 * rows.length + 24;
  const barW = 300;
  const svgRows = rows.map((r, i) => {
    const v = Math.max(0, Math.min(max, Number(r.value)||0));
    const w = (v / max) * barW;
    const y = 16 + i * 18;
    return `
      <text x="8" y="${y}" fill="#cdeafe" font-size="12">${r.label}</text>
      <rect x="160" y="${y-10}" width="${barW}" height="12" fill="#111827" rx="3" />
      <rect x="160" y="${y-10}" width="${w}" height="12" fill="#3b82f6" rx="3" />
      <text x="${160 + barW + 8}" y="${y}" fill="#cdeafe" font-size="12">${v}${unit}</text>`;
  }).join('\n');

  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" style="background:${bg}; border:1px solid #1f2a38; border-radius:12px">
    ${svgRows}
  </svg>`;
}
function clampPct(n) {
  if (n == null || isNaN(n)) return null;
  return Math.max(0, Math.min(100, Number(n)));
}

/* ============ Unified AI helpers (Home brain/arm) ============ */
// Classificazione OCR (testo)
function classifyOcrText(raw='') {
  const s = String(raw || '').toLowerCase();
  const score = (keys) => keys.reduce((n,k)=> n + (s.includes(k) ? 1 : 0), 0);

  const receiptScore = score([
    'documento commerciale','scontrino','totale','subtotale','iva','resto',
    'contanti','pagamento','euro','€','cassa','rt','cassiere','p.iva','codice a barre'
  ]);

  const wineLabelScore = score([
    'docg','doc','igt','denominazione','denom.','cantina','vinificazione','uvaggio',
    '% vol','vol %','alc','gradazione','imbottigliato da','prodotto in','bottiglia n°'
  ]);

  const rows = s.split(/\r?\n/).filter(l => l.trim());
  const yearRows = rows.filter(l => /\b(19|20)\d{2}\b/.test(l)).length;
  const euroRows = rows.filter(l => /€\s?\d/.test(l)).length;
  const wineWords = rows.filter(l => /\b(barolo|nebbiolo|chianti|amarone|etn(a|o)|franciacorta|vermentino|greco|fiano|sagrantino|montepulciano|nero d'avola)\b/.test(l)).length;
  const wineListScore = (yearRows + euroRows + wineWords);

  if (wineListScore >= 6) return 'wine_list';
  if (wineLabelScore >= 3 && wineLabelScore > receiptScore) return 'wine_label';
  if (receiptScore >= 3) return 'receipt';
  return 'unknown';
}
function guessExpenseBucket(store='') {
  const s = String(store).toLowerCase();
  if (/\b(bar|ristorante|pizzeria|pub|bistrot|trattoria|enoteca|aperi)\b/.test(s)) return 'cene-aperitivi';
  return 'spese-casa';
}

// ---- Date helpers (fallback data scontrino) ----
function toISODate(any) {
  const s = String(any || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m1) {
    const d = String(m1[1]).padStart(2,'0');
    const M = String(m1[2]).padStart(2,'0');
    let y = String(m1[3]);
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${M}-${d}`;
  }
  // es. "12 set 2025", "7 ottobre 24"
  const mesi = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  const m2 = s.toLowerCase().match(/(\d{1,2})\s+([a-zà-ú]+)\s+(\d{2,4})/i);
  if (m2) {
    const d = String(m2[1]).padStart(2,'0');
    const mon = m2[2].slice(0,3);
    const idx = mesi.indexOf(mon);
    if (idx >= 0) {
      let y = String(m2[3]);
      if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
      const M = String(idx+1).padStart(2,'0');
      return `${y}-${M}-${d}`;
    }
  }
  return '';
}
function pickDateFromTexts(texts = []) {
  // prova a scansionare tutte le righe OCR
  const joined = String((texts||[]).join('\n') || '');
  // 1) dd/mm/yyyy o dd-mm-yy
  const m1 = joined.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/);
  if (m1) {
    const iso = toISODate(m1[1]);
    if (iso) return iso;
  }
  // 2) 12 set 2025
  const m2 = joined.match(/(\d{1,2}\s+[a-zà-ú]+\s+\d{2,4})/i);
  if (m2) {
    const iso = toISODate(m2[1]);
    if (iso) return iso;
  }
  return '';
}

// Riconoscimento supermercati
function isSupermarketStore(store = '') {
  const s = String(store).toLowerCase();
  const re = new RegExp(
    [
      'supermercat', 'ipermercat', 'market', 'discount',
      'conad', 'coop', 'esselunga', 'carrefour', 'auchan', 'pam', 'despar', 'a&o', 'iper',
      'lidl', 'md', 'eurospin', 'todis', 'alter discount', 'tigros', 'gs', 'famila',
      'deco', 'decò', 'tigre', 'simply', 'sidis', 'ipercoop', 'iper la grande i',
      'dok', 'cra\\s?i', 'penny'
    ].join('|'),
    'i'
  );
  return re.test(s);
}

async function postJSON(url, body, timeoutMs=30000) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!r.ok) throw new Error(json?.error || json?.message || `${r.status} ${text?.slice(0,180)}`);
    return json ?? { data: text };
  } finally { clearTimeout(t); }
}
function summarizeReceiptForChat({ store, purchaseDate, totalPaid, currency='EUR', purchases=[] }) {
  const tot = (Number(totalPaid)||0).toLocaleString('it-IT',{style:'currency',currency});
  const lines = purchases.slice(0,8).map(p => {
    const q = Math.max(1, Number(p.packs||p.qty||1));
    const up = Math.max(1, Number(p.unitsPerPack||1));
    const label = p.unitLabel || 'unità';
    return `• ${p.name}${p.brand ? ` (${p.brand})` : ''} — ${q} conf. × ${up} ${label}${p.priceTotal?` = ${(Number(p.priceTotal)||0).toLocaleString('it-IT',{style:'currency',currency})}`:''}`;
  }).join('\n');
  return (
`🧾 Scontrino rilevato
Negozio: ${store || '—'}
Data: ${purchaseDate || '—'}
Totale: ${tot}

Righe principali:
${lines}${purchases.length>8?`\n…(+${purchases.length-8})`:''}`
  );
}

/* ================= Intent / Sommelier helpers ================= */
function looksLikeSommelierIntent(text='') {
  const s = text.toLowerCase();
  if (/\b(sommelier|carta (dei )?vini|mi consigli|consigliami|tra questi|da questa carta)\b/.test(s)) return true;
  if (/\b(vino|barolo|nebbiolo|chianti|amarone|rosso|bianco|ros[ée]?)\b/.test(s) &&
      /\b(corposo|tannico|non troppo tannico|fresco|minerale|fruttato|profumato|aspro|setoso)\b/.test(s)) return true;
  return false;
}
function normalizeQueryForUI(q) {
  return q?.trim() || 'Consigliami il migliore in base al mio gusto';
}
function LoadingOverlay({ open, message }) {
  if (!open) return null;
  return (
    <div style={LO.overlay} aria-live="polite" aria-busy="true">
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={LO.video}
      >
        {/* usa un tuo video; fallback a quello che già hai in repo */}
        <source src="/video/stato-scorte-small.mp4" type="video/mp4" />
      </video>
      <div style={LO.scrim} />
      <div style={LO.box}>
        <div style={LO.caption}>{message || 'Elaborazione in corso…'}</div>
      </div>
    </div>
  );
}


/* ================= Chat Modal ================= */
function ChatModal({ open, onClose, onSend, messages, busy }) {
  const [input, setInput] = useState('');
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages, open]);
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose?.(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const doSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await onSend(text);
  };

  if (!open) return null;
  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Chat dati">
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ fontWeight: 800 }}>💬 Interroga dati</div>
          <button onClick={onClose} aria-label="Chiudi" style={S.btnGhost}>✖</button>
        </div>

        <div ref={bodyRef} style={S.body}>
          {messages.length === 0 && (
            <div style={{ opacity: .85 }}>
              Inizia chiedendo: “Quanto ho speso questo mese?” •
              “Che cosa ho a casa?” • “Mi consigli un rosso da questa carta?” (poi premi <b>OCR</b>).
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display:'grid', justifyContent: m.role === 'user' ? 'end' : 'start' }}>
              <div style={S.bubble}>
                {m.mono ? <pre style={S.pre}>{m.text}</pre> : <span dangerouslySetInnerHTML={{ __html: m.text }} />}
                {Array.isArray(m.blocks) && m.blocks.map((b, idx) => (
                  <figure key={idx} style={{ margin:'10px 0 0', padding:0 }}>
                    <div
                      style={{ borderRadius:12, overflow:'hidden' }}
                      dangerouslySetInnerHTML={{ __html: b.svg }}
                    />
                    {b.caption && <figcaption style={{ color:'#cdeafe', fontSize:12, opacity:.9, marginTop:4 }}>{b.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={S.inputRow}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Scrivi la tua domanda e premi Invio…"
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => !busy && ev.key === 'Enter' && doSend()}
            disabled={busy}
            style={S.input}
          />
          <button onClick={doSend} disabled={busy} style={S.btnPrimary}>
            {busy ? '⏳' : 'Invia'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= Inventory renderer ================= */
function renderInventorySnapshot(payload) {
  const list = Array.isArray(payload?.elenco) ? payload.elenco : [];
  const rows = list.map(it => ({
    nome:  (it.name ?? '').trim() || '—',
    qty:   (it.qty ?? it.quantity ?? it.qta ?? null),
    pct:   clampPct(it.consumed_pct ?? it.consumo_pct ?? it.fill_pct ?? null)
  }));
  const table = smallTable(
    rows.map(r => ({
      prodotto: r.nome,
      qta:      r.qty ?? '—',
      consumo:  (r.pct != null ? fmtPct(r.pct) : '—')
    })),
    [
      { key: 'prodotto', label: 'Prodotto' },
      { key: 'qta',      label: 'Qtà'     },
      { key: 'consumo',  label: 'Consumo' },
    ]
  );
  const barsData = rows
    .filter(r => r.pct != null)
    .sort((a,b)=> (a.pct - b.pct))
    .slice(0, 10)
    .map(r => ({ label: r.nome, value: r.pct }));
  const svg = svgBars(barsData, { max: 100, unit: '%', bg: '#0b0f14' });

  const text =
`🏠 Scorte (snapshot)
Totale articoli: ${fmtInt(rows.length)}

${table}`;

  return {
    text,
    blocks: barsData.length ? [{ svg, caption: 'Consumo stimato (prime 10 voci)' }] : []
  };
}

/* ================= Renderer unificato brain ================= */
function renderBrainResponse(res) {
  const payload = (res && typeof res === 'object' && 'result' in res) ? res.result : res;
  const kind = payload?.kind;

  const looksLikeInventory =
    kind === 'inventory.snapshot' ||
    (payload && typeof payload === 'object' && Array.isArray(payload.elenco));
  if (looksLikeInventory) {
    const rendered = renderInventorySnapshot(payload);
    return { role: 'assistant', text: rendered.text, mono: true, blocks: rendered.blocks };
  }

  const topList = payload?.top_negozi || payload?.top_stores;
  const looksLikeMonthFinances =
    kind === 'finances.month_summary' ||
    (payload && typeof payload === 'object' &&
      (payload.totale != null || payload.total != null) &&
      Array.isArray(topList));
  if (looksLikeMonthFinances) {
    const totRaw = payload.total ?? payload.totale ?? 0;
    const txs = payload.transactions ?? payload.transazioni ?? 0;
    const top = Array.isArray(topList) ? topList : [];
    const rows = top.map(r => ({
      store: r.store || r.nome || r.name || '—',
      speso: fmtEuro(r.speso ?? r.amount ?? 0)
    }));
    const table = smallTable(rows.slice(0, 10), [
      { key: 'store', label: 'Negozio' },
      { key: 'speso', label: 'Speso' }
    ]);
    const txt =
`📊 Spese del mese
Intervallo: ${payload.intervallo || 'mese corrente'}
Totale: ${fmtEuro(totRaw)} • Transazioni: ${fmtInt(txs)}

${table}${rows.length > 10 ? `\n…(+${rows.length - 10})` : ''}`;
    return { role: 'assistant', text: txt, mono: true };
  }

  const text = formatResult(payload ?? res);
  return { role: 'assistant', text, mono: typeof (payload ?? res) !== 'string' };
}

/* ================= Sommelier renderer ================= */
function renderSommelierInChat(result) {
  const recs = Array.isArray(result?.recommendations) ? result.recommendations : [];
  if (!recs.length) return 'Nessun risultato dalla carta. Prova a fotografare meglio o a cambiare richiesta.';
  const byBand = recs.reduce((acc, r) => {
    const k = r.price_band || 'mix';
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});
  let output = '🍷 Sommelier\n';
  output += `Fonte: ${result?.source || '—'}\n`;
  Object.keys(byBand).forEach(band => {
    output += `\n${band.toUpperCase()}\n`;
    byBand[band].slice(0, 6).forEach(r => {
      const price = r.typical_price_eur != null ? ` ~${fmtEuro(r.typical_price_eur)}` : '';
      output += `• ${r.name} — ${r.winery || '—'}${r.denomination ? ` • ${r.denomination}` : ''}${r.region ? ` • ${r.region}` : ''}${price}\n  ${r.why || ''}\n`;
    });
  });
  output += `\nApri: /prodotti-tipici-vini`;
  return output;
}

/* ======================= Home: “cervello & braccio” ======================= */
const Home = () => {
  const fileInputRef = useRef(null);
  const [queryText, setQueryText] = useState('');
  const [busy, setBusy] = useState(false);

  // Loader video a schermo intero
const [loading, setLoading] = useState(false);
const [loadingMsg, setLoadingMsg] = useState('Elaboro lo scontrino…');


  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);

  // Intenti
  const lastUserIntentRef = useRef({ text: '', sommelier: false });
  const wineListsRef = useRef([]);

  // Router / Siri
  const router = useRouter();
  const deepLinkHandledRef = useRef(false);
  const speakModeRef = useRef(false);

// UID per service role
const [uid, setUid] = useState(null);
useEffect(() => {
  (async () => {
    const mod = await import('@/lib/supabaseClient').catch(()=>null);
    const supabase = mod?.supabase;
    if (!supabase) return;
    const { data:{ user } } = await supabase.auth.getUser();
    setUid(user?.id || null);
  })();
}, []);
// === Brain calls ===
async function runBrainQuery(text, opts = {}) {
  const mod = await getBrain().catch(() => null);
  const fn = mod?.runQueryFromTextLocal || mod?.default?.runQueryFromTextLocal;
  if (typeof fn !== 'function') throw new Error('runQueryFromTextLocal non disponibile (brainHub)');
  return await fn(text, opts);
}
async function updateStockFromReceipt({ files = [], purchases = [], from = 'home' } = {}) {
  const mod = await getBrain().catch(() => null);
  const ingest = mod?.ingestOCRLocal || mod?.default?.ingestOCRLocal;
  if (typeof ingest !== 'function') throw new Error('ingestOCRLocal non disponibile (brainHub)');
  return await ingest({ files, purchases, from, mode: 'stock-only' });
}
// Alias compat: se altrove c'è ancora doOCR_Receipt
async function doOCR_Receipt(payload) { return updateStockFromReceipt(payload); }

/**
 * Aggiorna le SCORTE a partire dallo scontrino/righe riconosciute.
 * Usa la pipeline locale (ingestOCRLocal) in modalità “stock-only”
 * per evitare doppi insert in Finanze.
 */
async function updateStockFromReceipt({ files = [], purchases = [], from = 'home' } = {}) {
  const mod = await getBrain().catch(() => null);
  const ingest =
    mod?.ingestOCRLocal ||
    mod?.default?.ingestOCRLocal;

  if (typeof ingest !== 'function') {
    throw new Error('ingestOCRLocal non disponibile (brainHub)');
  }
  return await ingest({ files, purchases, from, mode: 'stock-only' });
}

/* Compat: se da qualche parte richiami ancora doOCR_Receipt, manteniamo l’alias */
async function doOCR_Receipt(payload) {
  return updateStockFromReceipt(payload);
}

  /* ===== TTS: stato, voci, persistenza ===== */
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const ttsEnabledRef = useRef(false);

  const [voices, setVoices] = useState([]);
  const [voiceId, setVoiceId] = useState(null);
  const voicesRef = useRef([]);
  const selectedVoiceRef = useRef(null);

  function loadVoices() {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const synth = window.speechSynthesis;
      const list = synth.getVoices() || [];
      if (!list.length) return; // arriveranno su voiceschanged
      const it = list.filter(v => String(v.lang || '').toLowerCase().startsWith('it'));
      const ordered = [...it, ...list.filter(v => !String(v.lang || '').toLowerCase().startsWith('it'))];
      voicesRef.current = ordered;
      setVoices(ordered);
      const saved = (typeof window !== 'undefined') ? localStorage.getItem('__tts_voice') : null;
      const chosen = ordered.find(v => v.name === saved) || it[0] || ordered[0] || null;
      setVoiceId(chosen ? chosen.name : null);
      selectedVoiceRef.current = chosen;
    } catch {}
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const onVoices = () => loadVoices();
    synth.addEventListener('voiceschanged', onVoices);
    loadVoices();
    return () => synth.removeEventListener('voiceschanged', onVoices);
  }, []);

  useEffect(() => {
    try {
      if (!voiceId) return;
      if (typeof window !== 'undefined') localStorage.setItem('__tts_voice', voiceId);
      const v = voicesRef.current.find(v => v.name === voiceId) || null;
      selectedVoiceRef.current = v;
    } catch {}
  }, [voiceId]);

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('__tts_enabled') : null;
      const on = saved === '1';
      setTtsEnabled(on);
      ttsEnabledRef.current = on;
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem('__tts_enabled', ttsEnabled ? '1' : '0');
      ttsEnabledRef.current = ttsEnabled;
    } catch {}
  }, [ttsEnabled]);

  // === TTS sicuro ===
  function maybeSpeakMessage(msg) {
    try {
      if (!(ttsEnabledRef.current || speakModeRef.current)) return;
      const text = String(msg?.text || '').replace(/<[^>]+>/g, '').trim();
      if (!text) return;
      const synth = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null;
      const Utter = (typeof window !== 'undefined') ? window.SpeechSynthesisUtterance : null;
      if (!synth || typeof Utter !== 'function') return;
      const utt = new Utter(text);
      utt.lang = selectedVoiceRef.current?.lang || 'it-IT';
      if (selectedVoiceRef.current) utt.voice = selectedVoiceRef.current;
      // utt.rate = 1.0; utt.pitch = 1.0; // opzionali
      synth.cancel();
      synth.speak(utt);
    } catch (e) {
      console.warn('[TTS] skip', e);
    }
  }

  /* ========== OCR helpers unificati (ocrHome + fallback legacy) ========== */
  function normFromOcrHome(j = {}) {
    const kind = j?.kind || 'unknown';
    const text = String(j?.text || '');
    const meta = {
      store: String(j?.store || ''),
      purchaseDate: String(j?.purchaseDate || ''),
      totalPaid: Number(j?.totalPaid || 0),
      currency: String(j?.currency || 'EUR'),
    };
    const purchases = Array.isArray(j?.purchases) ? j.purchases.map(p => ({
      name: String(p.name||'').trim(),
      brand: String(p.brand||'').trim(),
      packs: Number(p.packs || 0),
      unitsPerPack: Number(p.unitsPerPack || 0),
      unitLabel: String(p.unitLabel || ''),
      priceEach: Number(p.priceEach || 0),
      priceTotal: Number(p.priceTotal || 0),
      currency: String(p.currency || 'EUR'),
      expiresAt: String(p.expiresAt || '')
    })) : [];
    return { kind, text, meta, purchases, wine: j?.wine || null, entries: j?.entries || null };
  }
  function normFromLegacyOcr(j = {}) {
    const text = String(j?.text || j?.data?.text || j?.data || '');
    const meta = {
      store: String(j?.store || ''),
      purchaseDate: String(j?.purchaseDate || ''),
      totalPaid: Number(j?.totalPaid || 0),
      currency: String(j?.currency || 'EUR'),
    };
    const src = Array.isArray(j?.purchases) ? j.purchases
              : Array.isArray(j?.items)     ? j.items
              : [];
    const purchases = src.map(p => ({
      name: String(p.name||'').trim(),
      brand: String(p.brand||'').trim(),
      packs: Number(p.packs || 0),
      unitsPerPack: Number(p.unitsPerPack || 0),
      unitLabel: String(p.unitLabel || ''),
      priceEach: Number(p.priceEach || 0),
      priceTotal: Number(p.priceTotal || 0),
      currency: String(p.currency || 'EUR'),
      expiresAt: String(p.expiresAt || '')
    }));
    return { kind: 'receipt', text, meta, purchases, wine: null, entries: null };
  }
  async function fetchOcrUnified(file) {
    const fd = new FormData();
    fd.append('images', file, file.name || 'upload.jpg');
    // ocrHome
    let r = await fetch('/api/ocrHome', { method: 'POST', body: fd });
    let j = null; try { j = await r.json(); } catch {}
    if (r.ok && j && !j.error) {
      const n = normFromOcrHome(j);
      if (!(n.kind === 'receipt' && n.purchases.length === 0)) return n;
    }
    // fallback legacy
    r = await fetch('/api/ocr', { method: 'POST', body: fd });
    j = await r.json().catch(()=> ({}));
    return normFromLegacyOcr(j);
  }

  // Utility per Siri: URL/DataURL -> File
  async function urlOrDataUrlToFile(src, name='siri.jpg') {
    try {
      if (!src) return null;
      if (src.startsWith('data:')) {
        const [head, b64] = src.split(',');
        const mime = (head.match(/data:(.*?);base64/i)?.[1]) || 'image/jpeg';
        const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return new File([buf], name, { type: mime });
      }
      const resp = await fetch(src, { mode: 'cors' });
      const blob = await resp.blob();
      const ext = (blob.type && blob.type.includes('png')) ? 'png'
                : (blob.type && (blob.type.includes('jpeg') || blob.type.includes('jpg'))) ? 'jpg'
                : 'bin';
      return new File([blob], name.endsWith(ext) ? name : `${name}.${ext}`, { type: blob.type || 'application/octet-stream' });
    } catch { return null; }
    async function runFullIngestOnHome(itemsNorm, meta) {
  const results = { finanze:null, spese:null, scorte:null, errors:[] };

  // assicura user id
  let uidLocal = uid;
  if (!uidLocal) {
    try {
      const mod = await import('@/lib/supabaseClient').catch(()=>null);
      const supabase = mod?.supabase;
      const { data:{ user } } = await supabase.auth.getUser();
      uidLocal = user?.id || null;
    } catch {}
  }
  if (!uidLocal) {
    setChatMsgs(arr => [...arr, { role:'assistant', text:'⚠️ Non autenticato: impossibile salvare in Finanze/Spese/Scorte.' }]);
    return;
  }

  try {
    setLoadingMsg('Inserisco in Finanze…');
    setLoading(true);

    // Finanze
    try {
      await postJSON('/api/finances/ingest', {
        user_id: uidLocal,
        store: meta.store,
        purchaseDate: meta.purchaseDate,
        payment_method:'cash',
        card_label:null,
        items: itemsNorm
      });
      results.finanze = itemsNorm.length;
      // opzionale: notifica le viste Finanze
      if (typeof window !== 'undefined') {
        const stamp = Date.now();
        localStorage.setItem('__finanze_last_ingest', String(stamp));
        window.dispatchEvent(new CustomEvent('finanze:ingest:done', { detail:{ count: itemsNorm.length, store: meta.store, stamp } }));
      }
    } catch (e) { results.errors.push(`Finanze: ${e.message}`); }

    // Spese Casa / Cene & Aperitivi
    const bucket = guessExpenseBucket(meta.store);
    setLoadingMsg(bucket === 'cene-aperitivi' ? 'Inserisco Cene & Aperitivi…' : 'Inserisco Spese Casa…');
    try {
      const endpoint = bucket === 'cene-aperitivi' ? '/api/cene-aperitivi/ingest' : '/api/spese-casa/ingest';
      await postJSON(endpoint, {
        user_id: uidLocal,
        store: meta.store,
        purchaseDate: meta.purchaseDate,
        totalPaid: meta.totalPaid,
        items: itemsNorm
      });
      results.spese = itemsNorm.length;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('spese:ingest:done', { detail:{ bucket, count: itemsNorm.length } }));
      }
    } catch (e) { results.errors.push(`${bucket}: ${e.message}`); }

    // Scorte (solo supermercati)
    if (isSupermarketStore(meta.store)) {
      setLoadingMsg('Aggiorno le scorte…');
      try {
        await postJSON('/api/stock/apply', { user_id: uidLocal, items: itemsNorm });
        results.scorte = itemsNorm.length;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('scorte:updated', { detail:{ count: itemsNorm.length, at: Date.now() } }));
        }
      } catch (e) { results.errors.push(`Scorte: ${e.message}`); }
    }

  } finally {
    setLoading(false);
  }

  // Log unico in chat (+ voce)
  const lines = [];
  lines.push(`Negozio: ${meta.store || '—'}`);
  lines.push(`Data: ${meta.purchaseDate || '—'}`);
  lines.push(results.finanze != null ? `✓ Finanze: ${results.finanze} righe` : `✗ Finanze: non inserite`);
  const lbl = guessExpenseBucket(meta.store) === 'cene-aperitivi' ? 'Cene & Aperitivi' : 'Spese Casa';
  lines.push(results.spese != null ? `✓ ${lbl}: ${results.spese} righe` : `✗ ${lbl}: non inserite`);
  if (isSupermarketStore(meta.store)) {
    lines.push(results.scorte != null ? `✓ Scorte aggiornate: ${results.scorte} articoli` : `✗ Scorte: non aggiornate`);
  }
  if (results.errors.length) lines.push('\nNote:\n' + results.errors.map(e => `• ${e}`).join('\n'));
  const txt = `📋 Operazioni completate\n${lines.join('\n')}`;

  setChatMsgs(prev => [...prev, { role:'assistant', text: txt, mono: true }]);
  maybeSpeakMessage({ text: txt });
}
// === Normalizzazione via web (uguale a Liste Prodotti) ===
async function normalizeViaWeb(items) {
  try {
    // chiama l’API interna /api/normalize come fa la pagina
    const resp = await timeoutFetch('/api/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: (items || []).map(p => ({ name: p.name, brand: p.brand || '' })),
        locale: 'it-IT',
        trace: true
      })
    }, 60000);

    const raw = await resp.text();
    let j = null; try { j = JSON.parse(raw); } catch {}
    if (!resp.ok || !j?.ok || !Array.isArray(j.results)) return items;

    // merge: normalizedName, canonicalBrand, eventuale imageUrl
    return items.map((p, i) => {
      const r = j.results[i]?.out;
      if (!r) return p;
      const normName   = String(r.normalizedName || '').trim();
      const canonBrand = String(r.canonicalBrand || '').trim();
      const imageUrl   = r.imageUrl && String(r.imageUrl).trim();

      const out = {
        ...p,
        name:  normName   || p.name,
        brand: canonBrand || p.brand || ''
      };

      // opzionale: tieni una thumb come fa LP (proxy per evitare CORS)
      if (imageUrl) {
        out.image = `/api/img-proxy?url=${encodeURIComponent(imageUrl)}&w=256&h=256&fit=cover&format=jpg`;
        out.imageDirect = imageUrl;
      }
      return out;
    });
  } catch {
    return items; // fallback: se salta la normalizzazione, continua senza bloccare la pipeline
  }
}


  }

  /* =================== OCR Smart (carta/etichetta/scontrino) =================== */
  async function handleSmartOCR(files) {
  const wantSommelier =
    lastUserIntentRef.current.sommelier ||
    looksLikeSommelierIntent(queryText);

  setChatOpen(true);

  try {
    setBusy(true);

    const texts = [];
    const receipts = [];
    const labels = [];
    const lists = [];

    // 1) OCR ogni file con fallback automatico
    for (const f of files) {
      const n = await fetchOcrUnified(f);
      if (n?.text) texts.push(n.text);
      const guess = n?.kind || classifyOcrText(n?.text || '');
      if (guess === 'receipt') receipts.push(n);
      else if (guess === 'wine_label') labels.push(n);
      else if (guess === 'wine_list') lists.push(n);
    }

    // 2) Routing

    // Carta vini / intento Sommelier
    if (lists.length || (wantSommelier && !labels.length && !receipts.length)) {
      const joined = (lists.length ? lists.map(x => x.text || '').join('\n---\n') : texts.join('\n---\n')).trim();
      if (!joined) {
        setChatMsgs(arr => [...arr, { role: 'assistant', text: '❌ OCR: nessun testo riconosciuto dalla carta.' }]);
        return;
      }
      wineListsRef.current.push(joined);
      setChatMsgs(arr => [...arr, { role: 'assistant', text: '📄 Carta vini acquisita. Avvio il Sommelier…' }]);
      const q = lastUserIntentRef.current.text || queryText || '';
      const result = await runSommelierFromHome(q);
      const txt = renderSommelierInChat(result);
      const msg = { role: 'assistant', text: txt, mono: true };
      setChatMsgs(arr => [...arr, msg]);
      maybeSpeakMessage(msg);
      return;
    }

    // Etichette vino
    if (labels.length) {
      if (!uid) {
        setChatMsgs(arr => [...arr, { role: 'assistant', text: '⚠️ Non autenticato: impossibile salvare in Prodotti tipici & Vini.' }]);
      } else {
        for (const L of labels) {
          try {
            const res = await postJSON('/api/vini/ingest', {
              user_id: uid,
              wine: L?.wine || null,
              text: L?.text || ''
            });
            if (!(res?.ok || res?.inserted === 1)) {
              setChatMsgs(arr => [...arr, { role:'assistant', text:'ℹ️ Vini: nessuna riga inserita' }]);
            }
          } catch(e) {
            setChatMsgs(arr => [...arr, { role:'assistant', text:`⚠️ Vini: ${e.message}` }]);
          }
        }
        setChatMsgs(arr => [...arr, { role:'assistant', text:'🍷 Etichetta registrata in "Prodotti tipici & Vini".' }]);
      }
      return;
    }

    // Scontrino/i
    if (receipts.length || texts.length) {
      // --- Combina meta + righe ---
      const allPurchases = [];
      const meta = { store: '', purchaseDate: '', totalPaid: 0, currency: 'EUR' };

      for (const R of receipts) {
        const items = Array.isArray(R?.purchases) ? R.purchases : [];
        allPurchases.push(...items);
        if (!meta.store)        meta.store        = String(R?.meta?.store || R?.store || '');
        if (!meta.purchaseDate) meta.purchaseDate = String(R?.meta?.purchaseDate || R?.purchaseDate || '');
        if (!meta.totalPaid)    meta.totalPaid    = Number(R?.meta?.totalPaid || R?.totalPaid || 0);
        if (!meta.currency)     meta.currency     = String(R?.meta?.currency || R?.currency || 'EUR');
      }

      // --- Fallback DATA (se meta vuota) ---
      const isoFromMeta = toISODate(meta.purchaseDate);
      const isoFromOCR  = pickDateFromTexts(texts);
      const isoToday    = new Date().toISOString().slice(0, 10);
      meta.purchaseDate = isoFromMeta || isoFromOCR || isoToday;

      // --- Normalizza righe ---
      const itemsNorm = (allPurchases || []).map(p => ({
        name: String(p.name || '').trim(),
        brand: String(p.brand || '').trim(),
        packs: Number(p.packs || 0),
        unitsPerPack: Number(p.unitsPerPack || 0),
        unitLabel: String(p.unitLabel || ''),
        priceEach: Number(p.priceEach || 0),
        priceTotal: Number(p.priceTotal || 0),
        currency: String(p.currency || 'EUR'),
        expiresAt: String(p.expiresAt || '')
      })).filter(p => p.name);

      if (!itemsNorm.length) {
        setChatMsgs(arr => [...arr, { role: 'assistant', text: 'ℹ️ Nessuna riga acquisto riconosciuta. Non invio a Finanze/Spese.' }]);
        return;
      }
      // 🔎 normalizzazione web (come Liste Prodotti)
const itemsReady = await normalizeViaWeb(itemsNorm);


      // Bucket + supermercato?
      const bucket = guessExpenseBucket(meta.store);
      const storeIsSuper = (bucket !== 'cene-aperitivi' && isSupermarketStore(meta.store));

      // Accumuliamo risultati veri dagli endpoint
      const notes = [];

      // --- a) FINANZE ---
      if (!uid) {
        notes.push('⚠️ Non autenticato: Finanze/Spese non salvate');
      } else {
        try {
         const payloadFin = {
  user_id: uid,
  store: meta.store,
  purchaseDate: meta.purchaseDate,
  payment_method: 'cash',
  card_label: null,
  items: itemsReady
};
          const finRes = await postJSON('/api/finances/ingest', payloadFin);
          if (finRes?.ok && (finRes?.inserted || 0) > 0) {
            // refresh Finanze
            if (typeof window !== 'undefined') {
              const stamp = Date.now();
              localStorage.setItem('__finanze_last_ingest', String(stamp));
              window.dispatchEvent(new CustomEvent('finanze:ingest:done', { detail: { count: itemsNorm.length, store: meta.store, stamp } }));
            }
            setChatMsgs(arr => [...arr, { role:'assistant', text:'💾 Finanze: inserimento completato ✓' }]);
          } else {
            notes.push('Finanze: nessuna riga inserita');
          }
        } catch (e) {
          notes.push(`Finanze: ${e.message}`);
        }

        // --- b) SPESE CASA / CENE & APERITIVI ---
        try {
      const payloadSpese = {
  user_id: uid,
  store: meta.store,
  purchaseDate: meta.purchaseDate,
  totalPaid: meta.totalPaid,
  items: itemsReady
};

          const spRes = await postJSON(endpoint, payloadSpese);
          if (spRes?.ok && (spRes?.inserted || 0) > 0) {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('spese:ingest:done', { detail:{ bucket, count: itemsNorm.length } }));
            }
            setChatMsgs(arr => [...arr, { role:'assistant', text:`💾 ${bucket}: inserimento completato ✓` }]);
          } else {
            notes.push(`${bucket}: nessuna riga inserita`);
          }
        } catch (e) {
          notes.push(`${bucket}: ${e.message}`);
        }
      }

      // --- c) SCORTE (solo supermercato, via endpoint server) ---
      if (storeIsSuper && uid) {
        try {
       const stRes = await postJSON('/api/stock/apply', { user_id: uid, items: itemsReady });

          if (stRes?.ok) {
            setChatMsgs(arr => [...arr, { role:'assistant', text:'📦 Scorte aggiornate dal scontrino del supermercato ✓' }]);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('scorte:updated', { detail:{ count: itemsNorm.length, at: Date.now() } }));
            }
          } else {
            notes.push('Scorte: nessun aggiornamento');
          }
        } catch (e) {
          notes.push(`Scorte: ${e.message}`);
        }
      }

      // --- d) riepilogo + voce ---
    const msg = { role:'assistant', text: summarizeReceiptForChat({ ...meta, purchases: itemsReady }), mono: true };

      setChatMsgs(arr => [
        ...arr,
        msg,
        ...(notes.length ? [{ role:'assistant', text: 'Note:\n' + notes.map(n => `• ${n}`).join('\n'), mono: true }] : []),
        { role: 'assistant', text: '✅ Scontrino elaborato. Ora puoi chiedere: "quanto ho speso negli ultimi 2 mesi", "cosa ho a casa", "prodotti in esaurimento", "quando scade il latte", "in cosa spendo di più?".' }
      ]);
      maybeSpeakMessage(msg);
      return;
    }

    // Tipo non riconosciuto
    setChatMsgs(arr => [...arr, { role: 'assistant', text: 'ℹ️ OCR eseguito, ma non ho riconosciuto il tipo (scontrino/carta/etichetta).' }]);

  } catch (err) {
    console.error('[OCR flow] error', err, err?.stack);
    setChatMsgs(arr => [...arr, { role: 'assistant', text: `❌ Errore OCR: ${err?.message || err}` }]);
  } finally {
    setBusy(false);
  }
}

  /* =================== Query testo (anche da Siri) =================== */
  async function submitQuery(textParam) {
    const raw = (textParam != null ? String(textParam) : queryText).trim();
    if (!raw || busy) return;
    if (textParam == null) setQueryText('');
    setChatOpen(true);
    setChatMsgs(prev => [...prev, { role: 'user', text: raw }]);
    lastUserIntentRef.current = { text: raw, sommelier: looksLikeSommelierIntent(raw) };
    if (lastUserIntentRef.current.sommelier && wineListsRef.current.length === 0) {
      setChatMsgs(prev => [
        ...prev,
        { role:'assistant', text: 'Per favore premi <b>OCR</b> e fotografa la <b>carta dei vini</b> così ti consiglio dalla lista del locale.' }
      ]);
      return;
    }
    try {
      setBusy(true);
      const out = await runBrainQuery(raw, { first: chatMsgs.length === 0 });
      const msg = renderBrainResponse(out);
      setChatMsgs(prev => [...prev, msg]);
      maybeSpeakMessage(msg);
    } catch (err) {
      setChatMsgs(prev => [...prev, { role:'assistant', text: `❌ Errore interrogazione dati: ${err?.message || err}` }]);
    } finally {
      setBusy(false);
    }
  }

  /* =================== OCR handlers =================== */
  const handleFileChange = (ev) => {
    const files = Array.from(ev.target.files || []);
    if (!files.length || busy) return;
    (async () => {
      try {
        setBusy(true);
        await handleSmartOCR(files);
      } finally {
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    })();
  };
  const handleSelectOCR = () => { if (!busy) fileInputRef.current?.click(); };

  /* =================== VOCE → testo =================== */
  const handleVoiceText = async (spoken) => {
    const text = String(spoken||'').trim();
    if (!text || busy) return;
    lastUserIntentRef.current = { text, sommelier: looksLikeSommelierIntent(text) };
    if (lastUserIntentRef.current.sommelier && wineListsRef.current.length === 0) {
      setChatOpen(true);
      setChatMsgs(prev => [
        ...prev,
        { role:'user', text },
        { role:'assistant', text: '📷 Per consigli mirati, premi <b>OCR</b> e fotografa la <b>carta dei vini</b>.' }
      ]);
      return;
    }
    await submitQuery(text);
  };

  /* =================== Deep-link Siri =================== */
  useEffect(() => {
    if (!router.isReady || deepLinkHandledRef.current) return;

    const sp = new URLSearchParams(window.location.search);
    const src  = sp.get('src')  || '';
    const mode = sp.get('mode') || '';           // 'voice' abilita TTS per la prossima risposta
    const q    = sp.get('q')    || '';           // domanda testuale
    const tts  = sp.get('tts');                  // '1' o '0'
    const voiceParam = sp.get('voice') || '';    // nome voce
    const imgParams = sp.getAll('img');          // uno o più 'img='

    if (tts === '1') setTtsEnabled(true);
    if (tts === '0') setTtsEnabled(false);
    if (mode === 'voice') speakModeRef.current = true;

    // selezione voce richiesta (se esiste)
    if (voiceParam) {
      // se le voci non sono ancora pronte, verrà applicata quando loadVoices finisce
      const attempt = () => {
        const found = voicesRef.current.find(v => v.name === voiceParam);
        if (found) setVoiceId(found.name);
      };
      // prova subito e poi riprova fra poco (alcuni browser ritardano getVoices)
      attempt();
      setTimeout(attempt, 700);
    }

    deepLinkHandledRef.current = true;

    // Notifica Siri
    if (src === 'siri') {
      setChatOpen(true);
      setChatMsgs(prev => [...prev, { role:'assistant', text:'🎙️ richiesta ricevuta da Siri…' }]);
    }

    // Se ci sono immagini passate da Siri (URL o dataURL), avvia OCR
    (async () => {
      const files = [];
      for (let i=0; i<imgParams.length; i++) {
        const f = await urlOrDataUrlToFile(imgParams[i], `siri_${i+1}.jpg`);
        if (f) files.push(f);
      }
      if (files.length) {
        await handleSmartOCR(files);
      } else if (q) {
        await submitQuery(q);
      }
      // Pulizia URL
      try {
        const url = new URL(window.location.href);
        ['q','src','mode','tts','voice','img'].forEach(p => url.searchParams.delete(p));
        window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
      } catch {}
    })();

  }, [router.isReady]);

  const handleQueryKey = (ev) => { if (ev.key === 'Enter') submitQuery(); };

  return (
    <>
      <Head>
        <title>Home - Jarvis-Assistant</title>
        <meta property="og:title" content="Home - Jarvis-Assistant" />
      </Head>

      {/* Video bg */}
      <video
        className="bg-video"
        src="/composizione%201.mp4"
        autoPlay
        loop
        muted
        playsInline
        controls={false}
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback"
        aria-hidden="true"
      />
      <div className="bg-overlay" aria-hidden="true" />

      {/* Contenuto */}
      <main className="home-shell">
        <section className="primary-grid">
          <Link href="/liste-prodotti" className="card-cta card-prodotti animate-card pulse-prodotti sheen">
            <span className="emoji">🛒</span>
            <span className="title">LISTE PRODOTTI</span>
            <span className="hint">Crea e gestisci le tue liste</span>
          </Link>

          <Link href="/finanze" className="card-cta card-finanze animate-card pulse-finanze sheen" style={{ animationDelay: '0.15s' }}>
            <span className="emoji">📊</span>
            <span className="title">FINANZE</span>
            <span className="hint">Entrate, spese e report</span>
          </Link>
        </section>

        {/* Funzionalità Avanzate */}
        <section className="advanced-box">
          <h2>Funzionalità Avanzate</h2>

          <div className="ask-row">
            <input
              className="query-input"
              type="text"
              placeholder='Chiedi a Jarvis… (es. "Quanto ho speso questo mese?" • "Cosa ho a casa?" • "Mi consigli un vino rosso da questa carta?")'
              value={queryText}
              onChange={(ev)=>setQueryText(ev.target.value)}
              onKeyDown={handleQueryKey}
              disabled={busy}
            />
            <button className="btn-ask" onClick={() => submitQuery()} disabled={busy}>
              {busy ? '⏳' : '💬 Chiedi'}
            </button>
          </div>

          <div className="advanced-actions">
            <button className="btn-ocr" onClick={handleSelectOCR} disabled={busy}>
              {busy ? '⏳' : '📷 OCR'}
            </button>

            {/* Toggle TTS */}
            <button
              className="btn-manuale"
              onClick={() => setTtsEnabled(v => !v)}
              title="Abilita o disabilita la lettura vocale delle risposte"
              aria-pressed={ttsEnabled}
            >
              {ttsEnabled ? '🔊 Lettura vocale: ON' : '🔇 Lettura vocale: OFF'}
            </button>

            {/* Selettore voce */}
            <select
              value={voiceId || ''}
              onChange={(e) => setVoiceId(e.target.value || null)}
              className="btn-manuale"
              title="Seleziona la voce per la lettura"
              style={{ minWidth: 220 }}
              disabled={!voices.length}
            >
              {voices.length === 0 ? (
                <option value="">(Caricamento voci…)</option>
              ) : (
                voices.map(v => (
                  <option key={v.name} value={v.name}>
                    {`${v.name} — ${v.lang}`}
                  </option>
                ))
              )}
            </select>

            {/* Comando vocale (speech-to-text) */}
            <VoiceRecorder
              buttonClass="btn-vocale"
              idleLabel="🎤 Comando vocale"
              recordingLabel="⏹ Stop"
              onText={handleVoiceText}
              disabled={busy}
            />

            <Link href="/dashboard" className="btn-manuale">🔎 Interroga dati</Link>
            <Link href="/prodotti-tipici-vini" className="btn-manuale">🍷 Prodotti tipici & Vini</Link>
          </div>
        </section>
      </main>

      {/* Input OCR nascosto */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Chat Modal */}
      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSend={(text) => submitQuery(text)}
        messages={chatMsgs}
        busy={busy}
      />

      <LoadingOverlay open={loading} message={loadingMsg} />


      {/* CSS globale */}
      <style jsx global>{`
        .bg-video {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: -2;
          pointer-events: none;
          background: #000;
        }
        .bg-overlay {
          position: fixed;
          inset: 0;
          z-index: -1;
          background: rgba(0, 0, 0, 0.35);
          pointer-events: none;
        }
        .home-shell {
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto auto;
          align-items: start;
          justify-items: center;
          gap: 1.25rem;
          padding: 2rem 1rem 3rem;
          color: #fff;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        }
        .primary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(240px, 1fr));
          gap: 1rem;
          width: min(1100px, 96vw);
        }
        @media (max-width: 760px) { .primary-grid { grid-template-columns: 1fr; } }
        .card-cta {
          display: grid; align-content: center; justify-items: center; gap: 0.25rem;
          text-decoration: none; color: #fff; border-radius: 18px;
          padding: clamp(1.1rem, 3vw, 1.7rem);
          min-height: clamp(130px, 22vw, 220px);
          transition: transform 120ms ease, box-shadow 200ms ease, border-color 200ms ease;
          position: relative; overflow: hidden; isolation: isolate;
        }
        .card-cta .emoji { font-size: clamp(1.4rem, 4vw, 2rem); line-height: 1; }
        .card-cta .title { font-weight: 800; font-size: clamp(1.1rem, 2.8vw, 1.6rem); }
        .card-cta .hint  { opacity: .85; font-size: clamp(.85rem, 2vw, .95rem); }
        .card-cta:hover { transform: translateY(-2px) scale(1.02); }
        .card-prodotti { --tint: 236,72,153; background: linear-gradient(145deg, rgba(99,102,241,0.85), rgba(236,72,153,0.85)); border: 1px solid rgba(236,72,153,0.35); }
        .card-finanze { --tint: 59,130,246; background: linear-gradient(145deg, rgba(6,182,212,0.85), rgba(59,130,246,0.85)); border: 1px solid rgba(59,130,246,0.35); }
        .animate-card { animation: cardGlow 3.2s ease-in-out infinite; }
        .pulse-prodotti { --glowA: 236,72,153;  --glowB: 99,102,241; }
        .pulse-finanze  { --glowA: 59,130,246;  --glowB: 6,182,212; }
        @keyframes cardGlow {
          0% { box-shadow: 0 0 15px rgba(var(--glowA), 0.4); }
          50% { box-shadow: 0 0 35px rgba(var(--glowB), 0.85); }
          100% { box-shadow: 0 0 15px rgba(var(--glowA), 0.4); }
        }
        .advanced-box { width: min(1100px, 96vw); margin-top: .5rem; background: rgba(0, 0, 0, 0.55); border-radius: 16px; padding: 1rem; }
        .advanced-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
        .ask-row { display: grid; grid-template-columns: 1fr auto; gap: .5rem; margin-bottom: .6rem; }
        .query-input { width: 100%; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: .55rem; padding: .52rem .7rem; color: #fff; outline: none; }
        .query-input::placeholder { color: rgba(255,255,255,0.65); }
        .btn-ask { background: linear-gradient(135deg, #6366f1, #06b6d4); border: 1px solid rgba(255,255,255,0.2); border-radius: .55rem; padding: .45rem .7rem; color: #fff; cursor: pointer; }
        .btn-vocale, .btn-ocr, .btn-manuale {
          display: inline-flex; align-items: center; justify-content: center;
          padding: .45rem .7rem; border-radius: .55rem; cursor: pointer; color: #fff; text-decoration: none;
        }
        .btn-vocale { background: #6366f1; }
        .btn-ocr { background: #06b6d4; }
        .btn-manuale { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); }
        .btn-vocale:hover, .btn-ocr:hover, .btn-manuale:hover { opacity: .9; }
      `}</style>
    </>
  );
};

/* ---------- Stili inline per il modale ---------- */
const S = {
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'grid', placeItems:'center', zIndex:9999, backdropFilter:'blur(2px)' },
  modal:{ width:'min(920px, 92vw)', maxHeight:'82vh', background:'rgba(0,0,0,.85)', border:'1px solid rgba(255,255,255,.18)', borderRadius:12, display:'grid', gridTemplateRows:'auto 1fr auto', overflow:'hidden', boxShadow:'0 12px 30px rgba(0,0,0,.45)' },
  header:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'linear-gradient(145deg, rgba(99,102,241,.28), rgba(6,182,212,.22))', borderBottom:'1px solid rgba(255,255,255,.16)' },
  btnGhost:{ background:'transparent', color:'#fff', border:'1px solid rgba(255,255,255,.25)', borderRadius:10, padding:'4px 8px', cursor:'pointer' },
  body:{ padding:'10px 12px', overflow:'auto', display:'grid', gap:8, background:'radial-gradient(1200px 500px at 10% 0%, rgba(236,72,153,.05), transparent 60%), radial-gradient(800px 400px at 100% 100%, rgba(59,130,246,.06), transparent 60%), rgba(0,0,0,.15)' },
  bubble:{ maxWidth:'78ch', whiteSpace:'pre-wrap', wordBreak:'break-word', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.18)', padding:'8px 10px', borderRadius:12, color:'#fff' },
  pre:{ margin:0, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
  inputRow:{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,.16)', background:'rgba(0,0,0,.35)' },
  input:{ width:'100%', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'10px 12px', color:'#fff', outline:'none' },
  btnPrimary:{ background:'#6366f1', border:0, borderRadius:10, padding:'10px 12px', color:'#fff', cursor:'pointer' },
};
const LO = {
  overlay:{ position:'fixed', inset:0, zIndex:10000, display:'grid', placeItems:'center' },
  video:{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' },
  scrim:{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.65))' },
  box:{ position:'relative', zIndex:2, padding:'12px 16px', borderRadius:14, background:'rgba(0,0,0,.45)', border:'1px solid rgba(255,255,255,.15)', boxShadow:'0 12px 30px rgba(0,0,0,.45)' },
  caption:{ color:'#fff', fontWeight:800, letterSpacing:.2, textShadow:'0 2px 6px rgba(0,0,0,.45)' }
};

export default withAuth(Home);
