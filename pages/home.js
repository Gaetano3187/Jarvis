import React, { useRef, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import withAuth from '../hoc/withAuth';

// Registratore solo client
const VoiceRecorder = dynamic(() => import('../components/VoiceRecorder'), { ssr: false });

// Import dinamico del brain (solo quando serve, lato client)
const getBrain = () => import('@/lib/brainHub');

/* ----------------- Helpers di formattazione ----------------- */
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
  try { return Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }
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
  const colWidths = columns.map(c => Math.max(c.label.length, ...rows.map(r => String(r[c.key] ?? '').length)));
  const header = columns.map((c, i) => pad(c.label, colWidths[i])).join('  ');
  const sep = colWidths.map(w => '─'.repeat(w)).join('  ');
  const body = rows.map(r => columns.map((c, i) => pad(String(r[c.key] ?? ''), colWidths[i])).join('  ')).join('\n');
  return `${header}\n${sep}\n${body}`;
}

/* ----------------- Grafici SVG inline (no libs) ----------------- */
function svgBars(items, { max = 100, unit = '%', bg = '#0b0f14' } = {}) {
  const rows = items.slice(0, 10);
  const W = 420, H = 18 * rows.length + 24;
  const barW = 300;
  const svgRows = rows.map((r, i) => {
    const v = Math.max(0, Math.min(max, Number(r.value) || 0));
    const w = (v / max) * barW;
    const y = 16 + i * 18;
    return `
      <text x="8" y="${y}" fill="#cdeafe" font-size="12">${r.label}</text>
      <rect x="160" y="${y - 10}" width="${barW}" height="12" fill="#111827" rx="3" />
      <rect x="160" y="${y - 10}" width="${w}" height="12" fill="#3b82f6" rx="3" />
      <text x="${160 + barW + 8}" y="${y}" fill="#cdeafe" font-size="12">${v}${unit}</text>`;
  }).join('\n');
  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" style="background:${bg}; border:1px solid #1f2a38; border-radius:12px">
    ${svgRows}
  </svg>`;
}

/* ----------------- Intent router ----------------- */
function looksLikeSommelierIntent(text = '') {
  const s = text.toLowerCase();
  // parole tipiche per “consiglio da carta”
  if (/\b(sommelier|carta (dei )?vini|mi consigli|consigliami|tra questi|da questa carta)\b/.test(s)) return true;
  // richieste vino con aggettivi sensoriali
  if (/\b(vino|barolo|nebbiolo|chianti|amarone|rosso|bianco|ros[ée]?)\b/.test(s) &&
      /\b(corposo|tannico|non troppo tannico|fresco|minerale|fruttato|profumato|aspro|setoso)\b/.test(s)) return true;
  return false;
}
function normalizeQueryForUI(q) {
  return q?.trim() || 'Consigliami il migliore in base al mio gusto';
}

/* ----------------- Chat Modal ----------------- */
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
              Inizia chiedendo: “Quanto ho speso questo mese?” • “Che cosa ho a casa?” •
              “Mi consigli un rosso da questa carta?” (poi premi <b>OCR</b>).
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'grid', justifyContent: m.role === 'user' ? 'end' : 'start' }}>
              <div style={S.bubble}>
                {m.mono ? <pre style={S.pre}>{m.text}</pre> : <span>{m.text}</span>}
                {Array.isArray(m.blocks) && m.blocks.map((b, idx) => (
                  <figure key={idx} style={{ margin: '10px 0 0', padding: 0 }}>
                    <div
                      style={{ borderRadius: 12, overflow: 'hidden' }}
                      dangerouslySetInnerHTML={{ __html: b.svg }}
                    />
                    {b.caption && (
                      <figcaption style={{ color: '#cdeafe', fontSize: 12, opacity: .9, marginTop: 4 }}>
                        {b.caption}
                      </figcaption>
                    )}
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

/* ----------------- Home: “cervello” ----------------- */
const Home = () => {
  const fileInputRef = useRef(null);
  const [queryText, setQueryText] = useState('');
  const [busy, setBusy] = useState(false);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);

  // Intent corrente (utile per far capire all’OCR se deve trattare la carta)
  const lastUserIntentRef = useRef({ text: '', sommelier: false });

  // Buffer “carta dei vini” (multi-foto OCR)
  const wineListsRef = useRef([]);

  /* ========== Bridge verso il brain ========== */
  async function doOCR_Receipt(payload) {
    const { ingestOCRLocal } = await getBrain();
    return ingestOCRLocal(payload);
  }
  async function doVoice_Generic(spokenText) {
    const { ingestSpokenLocal } = await getBrain();
    return ingestSpokenLocal(spokenText);
  }
  async function runBrainQuery(text, opts = {}) {
    const { runQueryFromTextLocal } = await getBrain();
    return runQueryFromTextLocal(text, opts);
  }

  /* ========== Sommelier dalla Home ========== */
  async function runSommelierFromHome(userQuery, extra = {}) {
    const payload = {
      query: normalizeQueryForUI(userQuery),
      wineLists: wineListsRef.current.slice(),      // array testi OCR (multi)
      wineList: wineListsRef.current.join('\n'),    // compat vecchie API
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

  function renderSommelierInChat(result) {
    const recs = Array.isArray(result?.recommendations) ? result.recommendations : [];
    if (!recs.length) {
      return 'Nessun risultato dalla carta. Prova a fotografare meglio o a cambiare richiesta.';
    }
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

  /* ========== MINI-ROUTER INTENTI ========== */
  // Pattern “umani” → azioni specifiche sul brain
  function routeHomeIntent(text = '') {
    const s = text.toLowerCase();

    // Sommelier: chiedo consigli dalla carta
    if (looksLikeSommelierIntent(s)) {
      return { kind: 'sommelier', hint: null };
    }

    // Scorte: “cosa ho a casa”, “scorte”, “magazzino”
    if (/\b(cosa ho a casa|che cosa ho a casa|scorte|magazzino|inventario)\b/.test(s)) {
      return {
        kind: 'inventory.snapshot',
        hint:
`[SYSTEM_HINT]
Se puoi, restituisci:
{ "kind":"inventory.snapshot",
  "elenco":[{"name":string,"qty":number,"unit":string,"consumed_pct":number|null}],
  "charts":true }
[/SYSTEM_HINT]`
      };
    }

    // Scorte in esaurimento
    if (/\b(esauriment|in esaurimento|quasi finito|quasi finite)\b/.test(s)) {
      return {
        kind: 'inventory.low',
        hint:
`[SYSTEM_HINT]
Trova prodotti con consumed_pct >= 70 oppure qty molto bassa.
Restituisci:
{ "kind":"inventory.snapshot","elenco":[...],"charts":false }
[/SYSTEM_HINT]`
      };
    }

    // Aggiorna scorte (dal documento OCR appena inserito)
    if (/\b(aggiorna|sincronizza)\b.*\b(scorte|magazzino|inventario)\b/.test(s)) {
      return {
        kind: 'inventory.update_from_last',
        hint:
`[SYSTEM_HINT]
Aggiorna le scorte a partire dagli ultimi movimenti/ocr registrati (se disponibili).
Restituisci un breve esito stringa.
[/SYSTEM_HINT]`
      };
    }

    // Finanze: mese corrente
    if (/\b(spes[eo] (di|del)? (questo|quest')?mese|quanto ho speso (questo|quest')?mese)\b/.test(s)) {
      return {
        kind: 'finances.month_summary',
        hint:
`[SYSTEM_HINT]
Riepiloga il mese corrente.
Restituisci:
{ "kind":"finances.month_summary",
  "intervallo":"YYYY-MM",
  "total":number,
  "transactions":number,
  "top_stores":[{"store":string,"amount":number}] }
[/SYSTEM_HINT]`
      };
    }

    // Finanze: dove spendo di più
    if (/\b(dove spendo di più|in quali prodotti spendo di più|top spese|classifica spese)\b/.test(s)) {
      return {
        kind: 'finances.top_spend',
        hint:
`[SYSTEM_HINT]
Mostra 5-10 voci principali (negozi o categorie) su base recente.
Restituisci nella stessa forma di finances.month_summary (usa top_stores o top_negozi).
[/SYSTEM_HINT]`
      };
    }

    // Prezzo pagato / storico
    if (/\b(quanto pago|quanto ho pagato|storico prezzo)\b/.test(s)) {
      return {
        kind: 'finances.product_price',
        hint:
`[SYSTEM_HINT]
Se l'utente menziona un prodotto, mostra prezzo minimo/medio/massimo e negozi.
Restituisci testo breve o una tabellina semplice.
[/SYSTEM_HINT]`
      };
    }

    // Fallback: generic → usa il cervello così com’è
    return { kind: 'generic', hint: null };
  }

  async function handleRoutedIntent(userText) {
    // Determina l’intento
    const route = routeHomeIntent(userText);
    // Se è sommelier → chiedi la carta e basta (non interrogo web/DB qui)
    if (route.kind === 'sommelier') {
      lastUserIntentRef.current = { text: userText, sommelier: true };
      setChatMsgs(arr => [
        ...arr,
        { role: 'assistant', text: '📷 Per consigli mirati, premi **OCR** e fotografa la **carta dei vini**. Poi ti suggerisco 3×3 alternative per fascia di prezzo.' }
      ]);
      return;
    }

    // Altrimenti: arricchisco il prompt con l’hint (se c’è), così il cervello risponde strutturato
    const enriched = route.hint
      ? `${userText}\n\n${route.hint}`
      : userText;

    const res = await runBrainQuery(enriched, { first: chatMsgs.length === 0 });

    // Provo a usare il tuo renderer unificato (se lo hai già definito in questa pagina)
    if (typeof renderBrainResponse === 'function') {
      const rendered = renderBrainResponse(res);
      setChatMsgs(arr => [...arr, rendered]);
      return;
    }

    // Fallback: testo normale
    setChatMsgs(arr => [
      ...arr,
      { role: 'assistant', text: formatResult(res?.result ?? res ?? 'Nessuna risposta.'), mono: typeof (res?.result ?? res) !== 'string' }
    ]);
  }

  /* ========== OCR Smart (Carta o Scontrino) ========== */
  async function handleSmartOCR(files) {
    // Sommelier attivo **solo** se l’utente ha chiesto vino/carta
    const wantSommelier =
      lastUserIntentRef.current.sommelier ||
      looksLikeSommelierIntent(queryText);

    setChatOpen(true);

    if (wantSommelier) {
      try {
        setBusy(true);
        let joined = '';
        for (const f of files) {
          const fd = new FormData();
          fd.append('images', f, f.name || 'card.jpg');
          const r = await fetch('/api/ocr', { method: 'POST', body: fd });
          const j = await r.json();
          const text = (j?.text || '').trim();
          if (text) {
            wineListsRef.current.push(text);
            joined += (joined ? '\n' : '') + text;
          }
        }
        if (!joined) {
          setChatMsgs(arr => [...arr, { role: 'assistant', text: '❌ OCR: nessun testo riconosciuto dalla carta.' }]);
          return;
        }
        setChatMsgs(arr => [...arr, { role: 'assistant', text: '📄 Carta acquisita. Avvio il Sommelier…' }]);

        const q = lastUserIntentRef.current.text || queryText || '';
        const result = await runSommelierFromHome(q);
        const txt = renderSommelierInChat(result);
        setChatMsgs(arr => [...arr, { role: 'assistant', text: txt, mono: true }]);

        // pulizia buffer carta (così la prossima carta non si mescola)
        wineListsRef.current = [];
      } catch (err) {
        setChatMsgs(arr => [...arr, { role: 'assistant', text: `❌ Errore Sommelier: ${err?.message || err}` }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Altrimenti è scontrino → smista a finanze/scorte via brain
    try {
      setBusy(true);
      const res = await doOCR_Receipt({ files });
      setChatMsgs(arr => [
        ...arr,
        { role: 'assistant', text: formatResult(res?.result ?? 'OCR eseguito') },
        { role: 'assistant', text: '✅ Scontrino elaborato. Puoi chiedere: "aggiorna scorte", "quanto ho speso questo mese", "prodotti in esaurimento", ecc.' }
      ]);
    } catch (err) {
      setChatMsgs(arr => [...arr, { role: 'assistant', text: `❌ Errore OCR: ${err?.message || err}` }]);
    } finally {
      setBusy(false);
    }
  }

  /* ========== VOCE / TESTO: usa il router ========== */
  async function handleVoiceText(spoken) {
    const text = String(spoken || '').trim();
    if (!text || busy) return;

    setChatOpen(true);
    setChatMsgs(arr => [...arr, { role: 'user', text }]);

    // Memorizza l’intento per guidare eventuale OCR carta
    lastUserIntentRef.current = { text, sommelier: looksLikeSommelierIntent(text) };

    try {
      setBusy(true);
      await handleRoutedIntent(text);
    } catch (err) {
      setChatMsgs(arr => [...arr, { role: 'assistant', text: `❌ Errore comando vocale: ${err?.message || err}` }]);
    } finally {
      setBusy(false);
    }
  
    // Memorizza intento per OCR carta
    lastUserIntentRef.current = { text: q, sommelier: looksLikeSommelierIntent(q) };

    try {
      setBusy(true);
      await handleRoutedIntent(q);
    } catch (err) {
      setChatMsgs(arr => [...arr, { role: 'assistant', text: `❌ Errore interrogazione dati: ${err?.message || err}` }]);
    } finally {
      setBusy(false);
    }
  }

  // ========== Fine blocco “cervello” — il resto del file (UI) resta uguale ==========


  // === Invio query testo ===
  const submitQuery = async () => {
    const q = queryText.trim();
    if (!q || busy) return;

    setQueryText('');
    setChatOpen(true);
    setChatMsgs(arr => [...arr, { role: 'user', text: q }]);

    lastUserIntentRef.current = { text: q, sommelier: looksLikeSommelierIntent(q) };

    if (lastUserIntentRef.current.sommelier) {
      setChatMsgs(arr => [
        ...arr,
        { role: 'assistant', text: 'Per favore premi OCR e fotografa la carta dei vini.' }
      ]);
      return;
    }

    try {
      setBusy(true);
      const res = await runBrainQuery(q, { first: chatMsgs.length === 0 });
      const rendered = renderBrainResponse(res);
      setChatMsgs(arr => [...arr, rendered]);
    } catch (err) {
      setChatMsgs(arr => [...arr, { role: 'assistant', text: `❌ Errore interrogazione dati: ${err?.message || err}` }]);
    } finally {
      setBusy(false);
    }
  };
  const handleQueryKey = (ev) => { if (ev.key === 'Enter') submitQuery(); };

// === Renderer unificato per le risposte del brain (FIX) ===
function renderBrainResponse(res) {
  // Alcuni endpoint ritornano { result: {...} }, altri direttamente l’oggetto
  const payload = (res && typeof res === 'object' && 'result' in res) ? res.result : res;
  const kind = payload?.kind;

  // -------- 1) INVENTORY / SCORTE ----------
  // Riconoscimento sia via kind che via forma ({ ok:true, elenco:[...] })
  const looksLikeInventory =
    kind === 'inventory.snapshot' ||
    (payload && typeof payload === 'object' && Array.isArray(payload.elenco));

  if (looksLikeInventory) {
    const rendered = renderInventorySnapshot(payload);
    return { role: 'assistant', text: rendered.text, mono: true, blocks: rendered.blocks };
  }

  // -------- 2) FINANZE / RIEPILOGO MESE ----------
  // Supporta sia kind, sia struttura { totale, transazioni, top_negozi|top_stores }
  const topList = payload?.top_negozi || payload?.top_stores;
  const looksLikeMonthFinances =
    kind === 'finances.month_summary' ||
    (payload && typeof payload === 'object' &&
      (payload.totale != null || payload.total != null) &&
      (Array.isArray(topList)));

  if (looksLikeMonthFinances) {
    const totRaw = payload.total ?? payload.totale ?? 0;
    const txs = payload.transactions ?? payload.transazioni ?? 0;
    const top = Array.isArray(topList) ? topList : [];

    // Normalizza chiavi per la tabella (store/speso oppure name/amount)
    const rows = top.map(r => ({
      store: r.store || r.nome || r.name || '—',
      speso: fmtEuro(r.speso ?? r.amount ?? 0)
    }));

    const table = smallTable(
      rows.slice(0, 10),
      [
        { key: 'store', label: 'Negozio' },
        { key: 'speso', label: 'Speso' }
      ]
    );

    const txt =
`📊 Spese del mese
Intervallo: ${payload.intervallo || 'mese corrente'}
Totale: ${fmtEuro(totRaw)} • Transazioni: ${fmtInt(txs)}

${table}${rows.length > 10 ? `\n…(+${rows.length - 10})` : ''}`;

    return { role: 'assistant', text: txt, mono: true };
  }

  // -------- 3) DEFAULT ----------
  // Se non riconosciuto, mostro una stringa o un JSON formattato
  const text = formatResult(payload ?? res);
  return { role: 'assistant', text, mono: typeof (payload ?? res) !== 'string' };
}


  // === Renderer scorte con fallback fill/status e grafico ===
  function renderInventorySnapshot(r) {
    const el = Array.isArray(r?.elenco) ? r.elenco : [];

    const rows = el.map(x => {
      const name = (x.name || x.product_name || x.prodotto || '—').slice(0, 40);
      const qty = Number(x.qty ?? x.quantita ?? 0) || 0;
      const unit = x.unit || x.uom || '';
      const init = x.initial_qty != null ? Number(x.initial_qty) : null;
      const cons = x.consumed_pct != null ? Number(x.consumed_pct) : null;

      // fill: priorità DB -> consumed_pct -> qty/initial -> qty>0 => 100
      let fill = x.fill_pct != null ? Number(x.fill_pct) : null;
      if (fill == null) {
        if (cons != null) fill = (1 - cons) * 100;
        else if (init != null && init > 0) fill = (qty / init) * 100;
        else if (qty > 0) fill = 100;
      }

      const dte = x.days_to_expiry ?? (
        x.expiry_date ? Math.ceil((new Date(x.expiry_date).getTime() - Date.now()) / 86400000) : null
      );

      let status = x.status || '';
      if (!status || status === 'unknown') {
        if (fill != null) {
          if (fill <= 20) status = 'low';
          else if (fill <= 60) status = 'med';
          else status = 'ok';
        } else {
          status = 'unknown';
        }
      }

      return {
        nome: name,
        qt: qty || '—',
        u: unit,
        fill_raw: fill,
        riemp: fill != null ? fmtPct(fill) : '—',
        stato: status,
        dte
      };
    });

    const stats = rows.reduce((a, it) => {
      if (it.stato === 'low') a.low++;
      else if (it.stato === 'med') a.med++;
      else if (it.stato === 'ok') a.ok++;
      return a;
    }, { low: 0, med: 0, ok: 0 });

    const table = smallTable(
      rows.slice(0, 20).map(({ nome, qt, u, riemp, stato }) => ({ nome, qt, u, riemp, stato })),
      [
        { key: 'nome', label: 'Prodotto' },
        { key: 'qt', label: 'Qt' },
        { key: 'u', label: 'U' },
        { key: 'riemp', label: 'Riemp.' },
        { key: 'stato', label: 'Stato' }
      ]
    );

    const lowBars = rows
      .filter(r => r.fill_raw != null)
      .sort((a, b) => a.fill_raw - b.fill_raw)
      .slice(0, 8)
      .map(r => ({ label: r.nome.slice(0, 28), value: Math.round(r.fill_raw) }));

    const blocks = [];
    if (lowBars.length) {
      blocks.push({
        svg: svgBars(lowBars, { max: 100, unit: '%' }),
        caption: 'Riempimento più basso'
      });
    }

    const text =
`📦 Scorte
Totale voci: ${fmtInt(el.length)} • Low: ${fmtInt(stats.low)} • Med: ${fmtInt(stats.med)} • Ok: ${fmtInt(stats.ok)}

${table}${rows.length > 20 ? `\n…(+${rows.length - 20})` : ''}`;

    return { text, blocks };
  }

  // === Gestione file OCR (multi) ===
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

  return (
    <>
      <Head>
        <title>Home - Jarvis-Assistant</title>
        <meta property="og:title" content="Home - Jarvis-Assistant" />
      </Head>

      {/* Video di sfondo */}
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

      {/* Overlay */}
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
              onChange={(ev) => setQueryText(ev.target.value)}
              onKeyDown={handleQueryKey}
              disabled={busy}
            />
            <button className="btn-ask" onClick={submitQuery} disabled={busy}>
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

            <Link href="/dashboard" className="btn-manuale">
              🔎 Interroga dati
            </Link>
            <Link href="/prodotti-tipici-vini" className="btn-manuale">
              🍷 Prodotti tipici & Vini
            </Link>
          </div>
        </section>
      </main>

      {/* Input OCR nascosto (multi) */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Chat */}
      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSend={submitQuery /* riuso input alto */}
        messages={chatMsgs}
        busy={busy}
      />

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
              rgba(var(--tint), 0.00) 100%
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

/* ----------------- Stili inline per la chat ----------------- */
const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', zIndex: 9999, backdropFilter: 'blur(2px)' },
  modal: { width: 'min(920px, 92vw)', maxHeight: '82vh', background: 'rgba(0,0,0,.85)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 12, display: 'grid', gridTemplateRows: 'auto 1fr auto', overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,.45)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'linear-gradient(145deg, rgba(99,102,241,.28), rgba(6,182,212,.22))', borderBottom: '1px solid rgba(255,255,255,.16)' },
  btnGhost: { background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,.25)', borderRadius: 10, padding: '4px 8px', cursor: 'pointer' },
  body: { padding: '10px 12px', overflow: 'auto', display: 'grid', gap: 8, background: 'radial-gradient(1200px 500px at 10% 0%, rgba(236,72,153,.05), transparent 60%), radial-gradient(800px 400px at 100% 100%, rgba(59,130,246,.06), transparent 60%), rgba(0,0,0,.15)' },
  bubble: { maxWidth: '78ch', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)', padding: '8px 10px', borderRadius: 12, color: '#fff' },
  pre: { margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
  inputRow: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.16)', background: 'rgba(0,0,0,.35)' },
  input: { width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 12px', color: '#fff', outline: 'none' },
  btnPrimary: { background: '#6366f1', border: 0, borderRadius: 10, padding: '10px 12px', color: '#fff', cursor: 'pointer' }
};

export default withAuth(Home);
