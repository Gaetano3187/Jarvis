// /lib/brainBridge.js
// Shim del Brain per far funzionare pagine che chiamano registerDataSource/ask/run
// + staging locale per la lista (localStorage)

const LOCAL_LIST_KEY = 'jarvis_list_supermercato';

function readLocalList() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try { return JSON.parse(localStorage.getItem(LOCAL_LIST_KEY) || '[]') || []; }
  catch { return []; }
}
function writeLocalList(items) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(LOCAL_LIST_KEY, JSON.stringify(items || []));
    window.dispatchEvent(new CustomEvent('jarvis:lists-updated'));
  } catch {}
}

function parseUnitsHint(chunk='') {
  const c = String(chunk).toLowerCase();
  if (/\b(bottigl|pacch|conf|scatol|rotol|fardell|brick|confezion)\b/.test(c)) {
    return { unitLabel: /bottigl/.test(c) ? 'bottiglie' : /rotol/.test(c) ? 'rotoli' : 'unità', mode: 'packs' };
  }
  if (/\b(unit|pz|pezzi|vasett|uova|barrett|merendin|bustin|monouso)\b/.test(c)) {
    return { unitLabel: /vasett/.test(c) ? 'vasetti' : /uova/.test(c) ? 'uova' : 'unità', mode: 'units' };
  }
  return { unitLabel: 'unità', mode: 'packs' };
}

function normalizeItemForList(it={}, listType='supermercato'){
  const name = (it.name || '').trim() || 'prodotto';
  const qty  = Math.max(1, Number(it.qty || 1));
  const hint = parseUnitsHint(`${it.unitLabel||''} ${it.mode||''}`);
  const mode = it.mode || hint.mode;

  const packs        = (mode === 'units') ? 1   : qty;
  const unitsPerPack = (mode === 'units') ? qty : 1;
  const unitLabel    = it.unitLabel || hint.unitLabel;

  return {
    id: Math.random().toString(36).slice(2),
    name,
    brand: it.brand || '',
    packs,
    unitsPerPack,
    unitLabel,
    listType,
    category: 'spese-casa',
  };
}

function addOrMergeToLocalList(items, listType='supermercato') {
  const prev = readLocalList();
  const next = [...prev];

  for (const raw of (items||[])) {
    const it = normalizeItemForList(raw, listType);
    const idx = next.findIndex(x =>
      x.name.toLowerCase() === it.name.toLowerCase() &&
      (x.brand||'') === (it.brand||'') &&
      (x.unitLabel||'unità') === (it.unitLabel||'unità')
    );
    if (idx >= 0) {
      next[idx].packs = Math.max(1, Number(next[idx].packs||1)) + Math.max(1, Number(it.packs||1));
    } else {
      next.push(it);
    }
  }
  writeLocalList(next);
  return next.length - prev.length;
}

export function mountBrainBridge() {
  if (typeof window === 'undefined') return;

  const hub = window.__jarvisBrainHub || {};

  // Sorgenti dati registrabili dalla pagina
  if (typeof hub._sources !== 'object') hub._sources = {};

  hub.registerDataSource = function(name, fn) {
    this._sources[name] = fn; // la pagina può registrare i propri fetcher
  };

  // ask: prima verifica se la pagina ha registrato un datasource; altrimenti fallback locale
  hub.ask = async function(name, args={}) {
    if (this._sources[name]) return this._sources[name](args);

    switch (name) {
      case 'lista-oggi':
        return readLocalList();

      case 'scorte-complete':
        // usiamo la lista come stock minimo per non dare risultati vuoti
        return readLocalList().map(i => ({
          name: i.name,
          brand: i.brand,
          packs: i.packs,
          unitsPerPack: i.unitsPerPack,
          unitLabel: i.unitLabel,
          expiresAt: null,
        }));

      case 'scorte-esaurimento':
      case 'scorte-scadenza':
        return []; // nessun dato locale strutturato → vuoto

      default:
        return null;
    }
  };

  // run: azioni minime per lista
  hub.run = async function(action, payload) {
    switch (action) {
      case 'aggiungi-alla-lista': {
        const added = addOrMergeToLocalList([payload], payload?.listType || 'supermercato');
        return added > 0 ? 'OK' : 'NOOP';
      }
      case 'segna-comprato': {
        const name = String(payload?.name || '').toLowerCase();
        const q    = Math.max(1, Number(payload?.amount || 1));
        const cur  = readLocalList();
        const idx  = cur.findIndex(i => i.name && i.name.toLowerCase() === name);
        if (idx >= 0) {
          const rest = Math.max(0, Number(cur[idx].packs||1) - q);
          if (rest === 0) cur.splice(idx,1); else cur[idx].packs = rest;
          writeLocalList(cur);
          return 'OK';
        }
        return 'MISS';
      }
      case 'aggiorna-scorte':
      case 'imposta-scadenze':
        // non gestiti in locale, ma evitiamo errori
        return 'OK';
      default:
        return null;
    }
  };

  window.__jarvisBrainHub = hub;
}
