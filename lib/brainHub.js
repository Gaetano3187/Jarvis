// /lib/brainHub.js
import { supabase } from '@/lib/supabaseClient';

/* ======================== Config & Costanti ======================== */

export const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };

// Se RLS ti blocca gli insert lato client, puoi usare una API server-side (vedi note).
const USE_SERVER_INSERT = false;

/* ============================ Helpers ============================== */

function normInt(n, def = 1) {
  const v = parseInt(String(n).replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : def;
}

function pickListType(text = '') {
  const s = text.toLowerCase();
  if (s.includes('online')) return LIST_TYPES.ONLINE;
  if (s.includes('supermercat') || s.includes('spesa')) return LIST_TYPES.SUPERMARKET;
  return LIST_TYPES.SUPERMARKET;
}

function dispatchListUpdated(detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('list:updated', { detail }));
  }
}

/* ================= Bridge verso /liste-prodotti ==================== */
/** Se la pagina Liste è aperta ed espone window.JarvisListAPI.addItem,
 *  usiamo direttamente la SUA funzione (quella che già salva e aggiorna la UI).
 *  Altrimenti si passa al fallback Supabase.
 */
async function insertViaBridge(payload) {
  if (typeof window === 'undefined') return null;
  const api = window.JarvisListAPI;
  if (!api || typeof api.addItem !== 'function') return null;
  try {
    const res = await api.addItem(payload);
    if (res?.ok) return res.item || payload;
    console.warn('[brainHub] bridge addItem ha risposto errore:', res?.error);
    return null;
  } catch (e) {
    console.warn('[brainHub] bridge addItem eccezione:', e);
    return null;
  }
}

/* ======================= Fallback: Supabase ======================== */
/** Inserisce il payload MINIMO, solo colonne realmente presenti:
 *  name, qty, type (+ unit, note se esistono nella tabella).
 *  ⚠️ NON inviamo 'bought' (la tua tabella non ce l'ha).
 */
async function insertViaSupabase(payload) {
  const minimal = {
    name: payload.name,
    qty: payload.qty,
    type: payload.type,
    ...(payload.unit ? { unit: payload.unit } : {}),
    ...(payload.note ? { note: payload.note } : {}),
  };

  const { data, error } = await supabase
    .from('list_items') // cambia se la tabella ha un altro nome
    .insert([minimal])
    .select()
    .single();

  if (error) throw new Error(error.message || 'Insert fallito (Supabase)');
  return data;
}

/* ======================= (Opz.) Insert via API ===================== */
/** Se vuoi aggirare RLS lato client, crea /pages/api/list/add.js con SERVICE_ROLE
 *  e metti USE_SERVER_INSERT = true. Qui sotto la chiamata; commentata per default.
 */
async function insertViaServerAPI(payload) {
  const resp = await fetch('/api/list/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  if (!resp.ok || json?.error) {
    throw new Error(json?.error || `Insert via API fallito (HTTP ${resp.status})`);
  }
  return json?.item;
}

/* ======================= Inserimento unificato ====================== */
export async function addListItemLocal({
  name,
  qty = 1,
  type = LIST_TYPES.SUPERMARKET,
  unit = '',
  note = '',
}) {
  const payload = {
    name: String(name || '').trim(),
    qty: normInt(qty),
    type,
    unit,
    note,
  };
  if (!payload.name) throw new Error('Nome prodotto vuoto.');

  console.log('[brainHub] addListItemLocal -> provo bridge', payload);

  // 1) Tenta la funzione della pagina (bridge)
  const bridged = await insertViaBridge(payload);
  if (bridged) {
    dispatchListUpdated({ op: 'insert', item: bridged });
    return bridged;
  }

  console.log('[brainHub] bridge non disponibile: fallback');

  // 2) (Opzionale) via API server-side (se attivo)
  if (USE_SERVER_INSERT) {
    const serverItem = await insertViaServerAPI(payload);
    dispatchListUpdated({ op: 'insert', item: serverItem });
    return serverItem;
  }

  // 3) Fallback: insert diretto su Supabase
  const dbItem = await insertViaSupabase(payload);
  dispatchListUpdated({ op: 'insert', item: dbItem });
  return dbItem;
}

/* =================== Ingest: Testo / Comando vocale =================== */
export async function ingestSpokenLocal(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, result: 'Testo vuoto.' };

  // Quantità (es. "2", "3x", "4 ×")
  const qtyMatch = raw.match(/(?:^|\s)(\d+)\s?(?:x|×)?(?:\s|$)/i);
  const qty = qtyMatch ? normInt(qtyMatch[1], 1) : 1;
  const noQty = qtyMatch ? raw.replace(qtyMatch[0], ' ') : raw;

  // Nome prodotto dopo verbi comuni
  let name =
    (noQty.match(/(?:aggiungi|metti|compra(?:re)?|inserisci)\s+([^@#;:,\.]+?)(?:\s+(?:alla|nella|in)\s+lista|\s*$)/i)?.[1]) ||
    (noQty.match(/([a-zàèéìòù0-9\-\s]{2,})/i)?.[1]) ||
    '';

  name = name
    .replace(/\s+(alla|nella|in)\s+lista.*$/i, '')
    .replace(/\b(lista|supermercato|online|da comprare|da acquistare)\b$/i, '')
    .trim();

  if (!name) return { ok: false, result: 'Non ho capito il prodotto da aggiungere.' };

  const type = pickListType(raw);

  try {
    const item = await addListItemLocal({ name, qty, type });
    return {
      ok: true,
      result: `🛒 Aggiunto ${item.qty}× ${item.name} nella lista ${item.type}.`,
      action: 'ADD_LIST_ITEM',
      item,
    };
  } catch (e) {
    return { ok: false, error: true, result: `Errore insert: ${e.message || e}` };
  }
}

/* ========================= Ingest: OCR Scontrino ======================== */
export async function ingestOCRLocal({ files }) {
  if (!files || !files.length) throw new Error('Nessun file fornito per OCR.');

  const fd = new FormData();
  for (const f of files) fd.append('files', f);

  const resp = await fetch('/api/ocr', { method: 'POST', body: fd });
  if (!resp.ok) throw new Error(`OCR HTTP ${resp.status}`);
  const payload = await resp.json();

  // payload.items = [{name, qty?}] oppure payload.lines[]
  const rows = Array.isArray(payload?.items) ? payload.items : (payload?.lines || []);
  const inserted = [];

  for (const row of rows) {
    const name = (row?.name || row?.desc || row?.prodotto || row?.label || row?.text || '').trim();
    if (!name) continue;
    const qty = normInt(row?.qty || row?.quantita || 1, 1);
    const type = LIST_TYPES.SUPERMARKET;
    try {
      const item = await addListItemLocal({ name, qty, type });
      inserted.push(item);
    } catch (e) {
      console.error('[brainHub/ingestOCRLocal] errore insert:', e);
    }
  }

  return {
    ok: true,
    result: `📷 OCR: aggiunti ${inserted.length} prodotti in lista.`,
    items: inserted,
  };
}

/* ========================= Query: Chat/Brain ========================== */
export async function runQueryFromTextLocal(text, { first = false } = {}) {
  try {
    const resp = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, first }),
    });
    const json = await resp.json();
    if (!resp.ok) return { ok: false, result: json?.error || `Assistant HTTP ${resp.status}` };
    if (typeof json === 'object' && ('ok' in json || 'result' in json || 'redirect' in json)) return json;
    return { ok: true, result: json };
  } catch (e) {
    console.error('[brainHub/runQueryFromTextLocal] error:', e);
    return { ok: false, result: e.message || String(e) };
  }
}

/* ======================== Export di default ======================= */

const brain = {
  LIST_TYPES,
  addListItemLocal,
  ingestSpokenLocal,
  ingestOCRLocal,
  runQueryFromTextLocal,
};
export default brain;
