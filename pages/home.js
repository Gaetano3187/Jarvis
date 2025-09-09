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
// Classificazione OCR (ricevuto da /api/ocrHome)
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
// Riconoscimento esplicito dei supermercati (Decò, Conad, Coop, Lidl, MD, ecc.)
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

/* ======================= Home: “cervello” ======================= */
const Home = () => {
  const fileInputRef = useRef(null);
  const [queryText, setQueryText] = useState('');
  const [busy, setBusy] = useState(false);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);

  // Stato intento (per OCR carta)
  const lastUserIntentRef = useRef({ text: '', sommelier: false });

  // Buffer “carta dei vini”
  const wineListsRef = useRef([]);

  // Deep-link Siri / TTS
  const router = useRouter();
  const deepLinkHandledRef = useRef(false);
  const speakModeRef = useRef(false);

  // UID per service role
  const [uid, setUid] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const mod = await import('@/lib/supabaseClient').catch(()=>null);
        const supabase = mod?.supabase;
        if (!supabase) return;
        const { data:{ user } } = await supabase.auth.getUser();
        setUid(user?.id || null);
      } catch {}
    })();
  }, []);

  // === Brain calls ===
  async function doOCR_Receipt(payload) {
    const { ingestOCRLocal } = await getBrain();
    return ingestOCRLocal(payload);
  }
  async function runBrainQuery(text, opts = {}) {
    const { runQueryFromTextLocal } = await getBrain();
    return runQueryFromTextLocal(text, opts);
  }

  // === Sommelier dalla Home ===
  async function runSommelierFromHome(userQuery, extra = {}) {
    const payload = {
      query: normalizeQueryForUI(userQuery),
      wineLists: wineListsRef.current.slice(),
      wineList: wineListsRef.current.join('\n'),
      qrLinks: extra.qrLinks || []
    };
    const r = await fetch('/api/sommelier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    return j;
  }

  // === TTS ===
  function maybeSpeakMessage(msg) {
    try {
      if (!speakModeRef.current) return;
      const text = (msg?.text || '').replace(/<[^>]+>/g,'').trim();
      if (!text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'it-IT';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }
  // Normalizza la risposta di ocrHome in un formato unico
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

// Normalizza la risposta del vecchio /api/ocr
function normFromLegacyOcr(j = {}) {
  const text = String(j?.text || j?.data?.text || j?.data || '');
  const meta = {
    store: String(j?.store || ''),
    purchaseDate: String(j?.purchaseDate || ''),
    totalPaid: Number(j?.totalPaid || 0),
    currency: String(j?.currency || 'EUR'),
  };
  // preferisci purchases; se non ci sono ma ci sono items (busta), usa items
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

// Esegue OCR con fallback: prima /api/ocrHome, poi /api/ocr (legacy) se serve
async function fetchOcrUnified(file) {
  const fd = new FormData();
  fd.append('images', file, file.name || 'upload.jpg');

  // primo tentativo: ocrHome
  let r = await fetch('/api/ocrHome', { method: 'POST', body: fd });
  let j = null; try { j = await r.json(); } catch {}
  if (r.ok && j && !j.error) {
    const n = normFromOcrHome(j);
    // se scontrino ma senza righe, fai fallback
    if (!(n.kind === 'receipt' && n.purchases.length === 0)) return n;
  }

  // fallback: legacy
  r = await fetch('/api/ocr', { method: 'POST', body: fd });
  j = await r.json().catch(()=> ({}));
  return normFromLegacyOcr(j);
}
// -------- Helpers OCR unificati (home) --------
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

  // 1) nuovo endpoint
  let r = await fetch('/api/ocrHome', { method: 'POST', body: fd });
  let j = null; try { j = await r.json(); } catch {}
  if (r.ok && j && !j.error) {
    const n = normFromOcrHome(j);
    // se NON è il caso “scontrino senza righe”, va bene così
    if (!(n.kind === 'receipt' && n.purchases.length === 0)) return n;
  }

  // 2) fallback legacy
  r = await fetch('/api/ocr', { method: 'POST', body: fd });
  j = await r.json().catch(()=> ({}));
  return normFromLegacyOcr(j);
}


 // === OCR Smart (Carta | Etichetta | Scontrino) via ocrHome con fallback legacy ===
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
      if (n.text) texts.push(n.text);
      const guess = n.kind || classifyOcrText(n.text || '');
      if (guess === 'receipt') receipts.push(n);
      else if (guess === 'wine_label') labels.push(n);
      else if (guess === 'wine_list') lists.push(n);
    }

    // 2) Routing

    // Carta vini (o intento Sommelier)
    if (lists.length || (wantSommelier && !labels.length && !receipts.length)) {
      const joined = (lists.length ? lists.map(x=>x.text||'').join('\n---\n') : texts.join('\n---\n')).trim();
      if (!joined) {
        setChatMsgs(arr => [...arr, { role:'assistant', text:'❌ OCR: nessun testo riconosciuto dalla carta.' }]);
        return;
      }
      wineListsRef.current.push(joined);
      setChatMsgs(arr => [...arr, { role:'assistant', text:'📄 Carta vini acquisita. Avvio il Sommelier…' }]);
      const q = lastUserIntentRef.current.text || queryText || '';
      const result = await runSommelierFromHome(q);
      const txt = renderSommelierInChat(result);
      const msg = { role:'assistant', text: txt, mono: true };
      setChatMsgs(arr => [...arr, msg]);
      maybeSpeakMessage(msg);
      return;
    }

    // Etichette vino
    if (labels.length) {
      if (!uid) {
        setChatMsgs(arr => [...arr, { role:'assistant', text:'⚠️ Non autenticato: impossibile salvare in Prodotti tipici & Vini.' }]);
      } else {
        for (const L of labels) {
          try {
            await postJSON('/api/vini/ingest', {
              user_id: uid,
              wine: L?.wine || null,
              text: L?.text || ''
            });
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
      // Combina meta + righe
      const allPurchases = [];
      const meta = { store:'', purchaseDate:'', totalPaid:0, currency:'EUR' };

      for (const R of receipts) {
        const items = Array.isArray(R?.purchases) ? R.purchases : [];
        allPurchases.push(...items);
        if (!meta.store)        meta.store        = String(R?.meta?.store || R?.store || '');
        if (!meta.purchaseDate) meta.purchaseDate = String(R?.meta?.purchaseDate || R?.purchaseDate || '');
        if (!meta.totalPaid)    meta.totalPaid    = Number(R?.meta?.totalPaid || R?.totalPaid || 0);
        if (!meta.currency)     meta.currency     = String(R?.meta?.currency || R?.currency || 'EUR');
      }

      // Normalizzazione minima
      const itemsNorm = (allPurchases || []).map(p => ({
        name: String(p.name||'').trim(),
        brand: String(p.brand||'').trim(),
        packs: Number(p.packs || 0),
        unitsPerPack: Number(p.unitsPerPack || 0),
        unitLabel: String(p.unitLabel || ''),
        priceEach: Number(p.priceEach || 0),
        priceTotal: Number(p.priceTotal || 0),
        currency: String(p.currency || 'EUR'),
        expiresAt: String(p.expiresAt || '')
      })).filter(p => p.name);

      // 👉 GUARD: se non ho righe, NON chiamare ingest (evita 400)
      if (!itemsNorm.length) {
        setChatMsgs(arr => [...arr, { role:'assistant', text:'ℹ️ Nessuna riga acquisto riconosciuta. Non invio a Finanze/Spese. Riprova con una foto più nitida o inquadra gli articoli.' }]);
        return;
      }

      // a) Finanze
      if (!uid) {
        setChatMsgs(arr => [...arr, { role:'assistant', text:'⚠️ Non autenticato: impossibile salvare in Finanze/Spese.' }]);
      } else {
        try {
          await postJSON('/api/finances/ingest', {
            user_id: uid,
            store: meta.store,
            purchaseDate: meta.purchaseDate,
            payment_method: 'cash',
            card_label: null,
            items: itemsNorm
          });
          if (typeof window !== 'undefined') {
            const stamp = Date.now();
            localStorage.setItem('__finanze_last_ingest', String(stamp));
            window.dispatchEvent(new CustomEvent('finanze:ingest:done', { detail: { count: itemsNorm.length, store: meta.store, stamp } }));
          }
        } catch (e) {
          setChatMsgs(arr => [...arr, { role:'assistant', text:`⚠️ Finanze: ${e.message}` }]);
        }

        // b) Spese Casa / Cene & Aperitivi
        const bucket = guessExpenseBucket(meta.store);
        const endpoint = bucket === 'cene-aperitivi' ? '/api/cene-aperitivi/ingest' : '/api/spese-casa/ingest';
        try {
          await postJSON(endpoint, {
            user_id: uid,
            store: meta.store,
            purchaseDate: meta.purchaseDate,
            totalPaid: meta.totalPaid,
            items: itemsNorm
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('spese:ingest:done', { detail:{ bucket, count: itemsNorm.length } }));
          }
        } catch (e) {
          setChatMsgs(arr => [...arr, { role:'assistant', text:`ℹ️ ${bucket}: ${e.message}` }]);
        }
      }

     // c) Aggiorna SCORTE solo per supermercati (no bar/ristoranti)
if (bucket !== 'cene-aperitivi' && isSupermarketStore(meta.store)) {
  try {
    // Usa lo stesso OCR file-based (aggiorna le scorte con la tua pipeline esistente).
    // Passo anche un hint per evitare doppio ingest finanze (se lo supporti in brainHub).
    await doOCR_Receipt({ files, from: 'home', mode: 'stock-only', purchases: itemsNorm });
    setChatMsgs(arr => [...arr, { role:'assistant', text:'📦 Scorte aggiornate dal scontrino del supermercato ✓' }]);
  } catch (e) {
    setChatMsgs(arr => [...arr, { role:'assistant', text:`⚠️ Scorte: ${e?.message || e}` }]);
  }
}

      // d) riepilogo in chat
      const msg = { role:'assistant', text: summarizeReceiptForChat({ ...meta, purchases: itemsNorm }), mono: true };
      setChatMsgs(arr => [
        ...arr,
        msg,
        { role:'assistant', text: '✅ Scontrino elaborato. Ora puoi chiedere: "quanto ho speso negli ultimi 2 mesi", "cosa ho a casa", "prodotti in esaurimento", "quando scade il latte", "in cosa spendo di più?".' }
      ]);
      maybeSpeakMessage(msg);
      return;
    }

    // Tipo non riconosciuto
    setChatMsgs(arr => [...arr, { role:'assistant', text:'ℹ️ OCR eseguito, ma non ho riconosciuto il tipo (scontrino/carta/etichetta).' }]);

  } catch (err) {
    setChatMsgs(arr => [...arr, { role:'assistant', text:`❌ Errore OCR: ${err?.message || err}` }]);
  } finally {
    setBusy(false);
  }
}


  // === Invio query testo (supporta input dal MODALE) ===
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

  // === OCR: onChange (multi) ===
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

  // === VOCE → testo ===
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

  // === Deep-link da Siri (?q=...&src=siri&mode=voice) ===
  useEffect(() => {
    if (!router.isReady || deepLinkHandledRef.current) return;
    const qParam = typeof router.query.q === 'string' ? router.query.q.trim() : '';
    const src    = typeof router.query.src === 'string' ? router.query.src : '';
    const mode   = typeof router.query.mode === 'string' ? router.query.mode : '';
    if (mode === 'voice') speakModeRef.current = true;
    if (qParam) {
      deepLinkHandledRef.current = true;
      if (src === 'siri') {
        setChatOpen(true);
        setChatMsgs(prev => [...prev, { role:'assistant', text:'🎙️ richiesta ricevuta da Siri…' }]);
      }
      submitQuery(qParam);
      try {
        const url = new URL(window.location.href);
        ['q','src','mode'].forEach(p => url.searchParams.delete(p));
        window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
      } catch {}
    }
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
        @media (max-width: 760px) {
          .primary-grid { grid-template-columns: 1fr; }
        }
        .card-cta {
          display: grid;
          align-content: center;
          justify-items: center;
          gap: 0.25rem;
          text-decoration: none;
          color: #fff;
          border-radius: 18px;
          padding: clamp(1.1rem, 3vw, 1.7rem);
          min-height: clamp(130px, 22vw, 220px);
          transition: transform 120ms ease, box-shadow 200ms ease, border-color 200ms ease;
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .card-cta .emoji { font-size: clamp(1.4rem, 4vw, 2rem); line-height: 1; }
        .card-cta .title { font-weight: 800; font-size: clamp(1.1rem, 2.8vw, 1.6rem); }
        .card-cta .hint  { opacity: .85; font-size: clamp(.85rem, 2vw, .95rem); }
        .card-cta:hover { transform: translateY(-2px) scale(1.02); }

        .card-prodotti {
          --tint: 236,72,153;
          background: linear-gradient(145deg, rgba(99,102,241,0.85), rgba(236,72,153,0.85));
          border: 1px solid rgba(236,72,153,0.35);
        }
        .card-finanze {
          --tint: 59,130,246;
          background: linear-gradient(145deg, rgba(6,182,212,0.85), rgba(59,130,246,0.85));
          border: 1px solid rgba(59,130,246,0.35);
        }
        .animate-card { animation: cardGlow 3.2s ease-in-out infinite; }
        .pulse-prodotti { --glowA: 236,72,153;  --glowB: 99,102,241; }
        .pulse-finanze  { --glowA: 59,130,246;  --glowB: 6,182,212; }
        @keyframes cardGlow {
          0%   { box-shadow: 0 0 15px rgba(var(--glowA), 0.4); }
          50%  { box-shadow: 0 0 35px rgba(var(--glowB), 0.85); }
          100% { box-shadow: 0 0 15px rgba(var(--glowA), 0.4); }
        }
        .sheen::before {
          content: "";
          position: absolute;
          inset: -22%;
          border-radius: inherit;
          background:
            linear-gradient(
              75deg,
              rgba(var(--tint), 0.00) 0%,
              rgba(var(--tint), 0.10) 28%,
              rgba(255,255,255, 0.45) 50%,
              rgba(var(--tint), 0.16) 72%,
              rgba(0,0,0, 0.00) 100%
            );
          transform: translateX(-130%) skewX(-12deg);
          filter: blur(0.6px);
          mix-blend-mode: screen;
          pointer-events: none;
          animation: sweepShine 2.8s ease-in-out infinite;
        }
        .card-finanze.sheen::before { animation-delay: .6s; }
        @keyframes sweepShine {
          0%   { transform: translateX(-130%) skewX(-12deg); opacity: .65; }
          60%  { transform: translateX(0%)    skewX(-12deg); opacity: 1; }
          100% { transform: translateX(130%)  skewX(-12deg); opacity: 0; }
        }
        .advanced-box {
          width: min(1100px, 96vw);
          margin-top: .5rem;
          background: rgba(0, 0, 0, 0.55);
          border-radius: 16px;
          padding: 1rem;
        }
        .advanced-actions {
          display: flex;
          flex-wrap: wrap;
          gap: .5rem;
        }
        .ask-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: .5rem;
          margin-bottom: .6rem;
        }
        .query-input {
          width: 100%;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: .55rem;
          padding: .52rem .7rem;
          color: #fff;
          outline: none;
        }
        .query-input::placeholder { color: rgba(255,255,255,0.65); }
        .btn-ask {
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: .55rem;
          padding: .45rem .7rem;
          color: #fff;
          cursor: pointer;
        }
        .btn-vocale, .btn-ocr, .btn-manuale {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: .45rem .7rem;
          border-radius: .55rem;
          cursor: pointer;
          color: #fff;
          text-decoration: none;
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

export default withAuth(Home);
