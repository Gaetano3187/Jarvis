// /lib/brainHub.js
// Brain "locale" usato dalla Home (dynamic import). Tutte le funzioni sono lato client.
// Se vuoi aggirare RLS, vedi l'opzione USE_SERVER_INSERT e l'endpoint /pages/api/list/add.js

import { supabase } from '@/lib/supabaseClient';

/* ======================== Config & Costanti ======================== */

export const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };

// Se RLS ti blocca gli insert lato client, imposta a true e crea l'API /pages/api/list/add.js
const USE_SERVER_INSERT = false; // <-- metti true se vuoi inserire via API server-side

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

/* ======================= Persistenza: Insert ======================= */
/** Inserisce un item nella tabella list_items.
 *  Schema atteso (adatta i nomi se diversi):
 *    id uuid, name text, qty int, type text, unit text?, note text?, bought bool default false, created_at timestamptz default now()
 */
export async function addListItemLocal({ name, qty = 1, type = LIST_TYPES.SUPERMARKET, unit = '', note = '' }) {
  if (!name || !name.trim()) throw new Error('Nome prodotto vuoto.');
  const payload = { name: name.trim(), qty: normInt(qty), type, unit, note, bought: false };

  console.log('[brainHub/addListItemLocal] inserting ->', payload);

  if (USE_SERVER_INSERT) {
    // Inserimento via API server-side (bypassa RLS con SERVICE_ROLE nella route)
    const resp = await fetch('/api/list/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();
    if (!resp.ok || json?.error) {
      console.error('[brainHub/addListItemLocal] server insert error:', json?.error || resp.statusText);
      throw new Error(json?.error || `Insert via API fallito (HTTP ${resp.status})`);
    }
    console.log('[brainHub/addListItemLocal] inserted via API OK:', json?.item);
    dispatchListUpdated({ op: 'insert', item: json?.item });
    return json?.item;
  }

  // Inserimento diretto via client (richiede policy RLS corretta o RLS off)
  const { data, error } = await supabase
    .from('list_items') // <-- CAMBIA se la tabella ha un altro nome
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('[brainHub/addListItemLocal] supabase error:', error);
    throw new Error(error.message || 'Insert fallito (Supabase).');
  }
  console.log('[brainHub/addListItemLocal] inserted OK:', data);

  dispatchListUpdated({ op: 'insert', item: data });
  return data;
}

/* =================== Ingest: Testo / Comando vocale =================== */
/** Capisce frasi tipo:
 * "aggiungi 2 latte", "metti pane", "compra 3x acqua online", "metti 1 kg mele"
 */
export async function ingestSpokenLocal(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, result: 'Testo vuoto.' };

  // Quantità: es. "2", "3x", "4 ×"
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
    return { ok: true, result: `🛒 Aggiunto ${item.qty}× ${item.name} nella lista ${item.type}.`, action: 'ADD_LIST_ITEM', item };
  } catch (e) {
    return { ok: false, error: true, result: `Errore insert: ${e.message || e}` };
  }
}

/* ========================= Ingest: OCR Scontrino ======================== */
/** Accetta { files } (FileList/Array) come passa la Home.
 * Chiama il tuo endpoint /api/ocr e inserisce in lista ogni riga rilevante.
 */
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
      console.error('[brainHub/ingestOCRLocal] insert error per riga OCR:', row, e);
    }
  }

  return {
    ok: true,
    result: `📷 OCR: aggiunti ${inserted.length} prodotti in lista.`,
    items: inserted,
  };
}

/* ========================= Query: Chat/Brain ========================== */
/** Mantiene il comportamento esistente della tua chat:
 * delega al tuo endpoint /api/assistant che già risponde “bene”.
 */
export async function runQueryFromTextLocal(text, { first = false } = {}) {
  try {
    const resp = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, first }),
    });
    const json = await resp.json();
    // Normalizzo una forma { ok, result, redirect? } che la Home già gestisce
    if (!resp.ok) {
      return { ok: false, result: json?.error || `Assistant HTTP ${resp.status}` };
    }
    // Se il tuo assistant già restituisce {ok, result, redirect}, passo-through
    if (typeof json === 'object' && ('ok' in json || 'result' in json || 'redirect' in json)) {
      return json;
    }
    // fallback minimale
    return { ok: true, result: json };
  } catch (e) {
    console.error('[brainHub/runQueryFromTextLocal] error:', e);
    return { ok: false, result: e.message || String(e) };
  }
}

/* ======================== Export di default (fac.) ======================= */
// (Non necessario, ma comodo se vuoi import * as brain)
const brain = {
  LIST_TYPES,
  addListItemLocal,
  ingestSpokenLocal,
  ingestOCRLocal,
  runQueryFromTextLocal,
};
export default brain;
