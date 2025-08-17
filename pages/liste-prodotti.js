// pages/liste-prodotti.js
import React, { useEffect, useRef, useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { supabase } from '@/lib/supabaseClient';

const LIST_TYPES = { SUPERMARKET: 'supermercato', ONLINE: 'online' };
const DEBUG = false;

// —— Cloud sync (Supabase)
const CLOUD_TABLE = 'jarvis_liste_state';
const CLOUD_SYNC = true; // metti a false per disattivare rapidamente

// Endpoints esistenti (già usati nel tuo progetto)
const API_ASSISTANT_TEXT = '/api/assistant';
const API_OCR = '/api/ocr';
const API_FINANCES_INGEST = '/api/finances/ingest';

/* ---------------- Persistenza locale (localStorage) ---------------- */
const LS_VER = 1;
const LS_KEY = 'jarvis_liste_prodotti@v1';

function loadPersisted() {
  try {
    const raw =
      typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== LS_VER) return null;
    return data;
  } catch {
    return null;
  }
}
function persistNow(snapshot) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
  } catch {}
}

/* ---------------------- Supabase Cloud helpers ---------------------- */
async function cloudSave(userId, doc) {
  // upsert sulla tabella CLOUD_TABLE: { user_id (pk/unique), doc (jsonb), updated_at }
  const { error } = await supabase
    .from(CLOUD_TABLE)
    .upsert(
      { user_id: userId, doc, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
}

async function cloudLoad(userId) {
  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('doc, updated_at')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // nessuna riga trovata -> ok
  if (!data) return null;
  return { doc: data.doc, ts: new Date(data.updated_at).getTime() };
}

/* ------------------------- UI Helper styles ------------------------- */
const styles = {
  container:
    'min-h-screen w-full px-4 sm:px-6 md:px-8 pb-24 bg-[#0b1320] text-[#f5f1e6]',
  header:
    'max-w-4xl mx-auto py-6 flex items-center justify-between border-b border-white/10',
  title:
    'text-2xl sm:text-3xl font-bold drop-shadow-[0_0_6px_rgba(255,255,255,0.25)]',
  nav: 'flex gap-3 text-sm',
  card:
    'max-w-4xl mx-auto mt-6 p-4 sm:p-6 rounded-2xl bg-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] border border-white/10',
  tabRow:
    'flex gap-2 mb-4',
  tab:
    'px-3 py-2 rounded-full border border-white/15 hover:border-white/30 transition',
  tabActive:
    'px-3 py-2 rounded-full border border-white/30 bg-white/10 shadow-inner',
  addRow:
    'flex flex-wrap items-center gap-2 mb-4',
  addBtn:
    'px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15',
  listWrap: 'space-y-2',
  rowBtn:
    'w-full text-left px-3 py-3 rounded-xl border flex items-center justify-between gap-3 transition select-none',
  rowLeft: 'flex items-center gap-3',
  qtyWrap: 'flex items-center gap-2',
  qtyBtn:
    'px-2 py-1 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20',
  delBtn:
    'px-2 py-1 rounded-lg border border-white/20 bg-white/5 hover:bg-white/15',
  pill:
    'inline-block text-[11px] px-2 py-0.5 rounded-full border border-white/15 ml-2 opacity-80',
  sectionTitle:
    'mt-6 mb-3 text-lg font-semibold opacity-90',
  hint:
    'text-xs opacity-70',
};

/* ============================== COMPONENTE ============================== */
export default function ListeProdotti() {
  const { user } = useAuth();

  // ---- Stato base
  const [lists, setLists] = useState(() => {
    const p = loadPersisted();
    if (p?.lists) return p.lists;
    return {
      [LIST_TYPES.SUPERMARKET]: [],
      [LIST_TYPES.ONLINE]: [],
    };
  });
  const [stock, setStock] = useState(() => {
    const p = loadPersisted();
    return Array.isArray(p?.stock) ? p.stock : [];
  });
  const [currentList, setCurrentList] = useState(() => {
    const p = loadPersisted();
    return p?.currentList === LIST_TYPES.ONLINE
      ? LIST_TYPES.ONLINE
      : LIST_TYPES.SUPERMARKET;
  });

  // ---- UI: mostra/nascondi form manuale
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState(1);

  // ---- Refs (UNICA DICHIARAZIONE — NON DUPLICARE)
  const persistTimerRef = useRef(null);
  const lastCloudWriteRef = useRef(0); // anti-eco
  const lastCloudSeenRef = useRef(0); // ultimo doc remoto applicato

  /* -------- Persistenza locale con piccolo debounce (300ms) -------- */
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const snapshot = {
        v: LS_VER,
        at: Date.now(),
        lists,
        stock,
        currentList,
      };
      persistNow(snapshot);
      if (DEBUG) console.log('[Local] saved');
    }, 300);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [lists, stock, currentList]);

  /* -------------------- Primo load: merge con Cloud -------------------- */
  useEffect(() => {
    (async () => {
      if (!CLOUD_SYNC || !user?.id) return;
      try {
        const local = loadPersisted();
        const cloud = await cloudLoad(user.id);
        const localAt = Number(local?.at || 0);
        const remoteAt = Number(cloud?.doc?.at || cloud?.ts || 0);

        if (remoteAt > 0) lastCloudSeenRef.current = remoteAt;

        if (remoteAt > localAt) {
          // Applica Cloud
          const doc = cloud.doc || {};
          setLists({
            [LIST_TYPES.SUPERMARKET]: Array.isArray(
              doc.lists?.[LIST_TYPES.SUPERMARKET]
            )
              ? doc.lists[LIST_TYPES.SUPERMARKET]
              : [],
            [LIST_TYPES.ONLINE]: Array.isArray(doc.lists?.[LIST_TYPES.ONLINE])
              ? doc.lists[LIST_TYPES.ONLINE]
              : [],
          });
          setStock(Array.isArray(doc.stock) ? doc.stock : []);
          setCurrentList(
            doc.currentList === LIST_TYPES.ONLINE
              ? LIST_TYPES.ONLINE
              : LIST_TYPES.SUPERMARKET
          );
          if (DEBUG) console.log('[Init] Caricato da Cloud');
        } else if (local) {
          // Mantieni locale
          if (DEBUG) console.log('[Init] Mantengo Locale');
        } else {
          if (DEBUG) console.log('[Init] Vuoto');
        }
      } catch (e) {
        if (DEBUG) console.warn('[Init] merge cloud/local fallito', e);
      }
    })();
  }, [user?.id]);

  /* ---- Cloud Save debounce (Supabase) ---- */
  useEffect(() => {
    if (!CLOUD_SYNC || !user?.id) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const doc = {
        v: LS_VER,
        at: Date.now(), // timestamp usato anche per anti-eco del realtime
        lists,
        stock,
        currentList,
      };

      try {
        await cloudSave(user.id, doc);
        if (!cancelled) {
          lastCloudWriteRef.current = doc.at; // anti-eco
          if (DEBUG) console.log('[Cloud] saved @', doc.at);
        }
      } catch (e) {
        if (DEBUG) console.warn('[Cloud] save failed', e);
      }
    }, 500); // un filo più lento del local (300ms)

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lists, stock, currentList, user?.id]);

  /* ---- Realtime: ascolta cambi su jarvis_liste_state dell’utente ---- */
  useEffect(() => {
    if (!CLOUD_SYNC || !user?.id) return;

    const channel = supabase
      .channel('jarvis_liste_state_rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: CLOUD_TABLE,
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          // evita riapplicare l’eco del nostro ultimo salvataggio
          const now = Date.now();
          if (now - lastCloudWriteRef.current < 800) return;

          try {
            const res = await cloudLoad(user.id);
            const doc = res?.doc;
            const ts = res?.ts || 0;
            if (!doc) return;

            const remoteAt = Number(doc.at || ts || 0);
            if (remoteAt <= lastCloudSeenRef.current) return;

            lastCloudSeenRef.current = remoteAt;

            setLists({
              [LIST_TYPES.SUPERMARKET]: Array.isArray(
                doc.lists?.[LIST_TYPES.SUPERMARKET]
              )
                ? doc.lists[LIST_TYPES.SUPERMARKET]
                : [],
              [LIST_TYPES.ONLINE]: Array.isArray(
                doc.lists?.[LIST_TYPES.ONLINE]
              )
                ? doc.lists[LIST_TYPES.ONLINE]
                : [],
            });
            setStock(Array.isArray(doc.stock) ? doc.stock : []);
            setCurrentList(
              doc.currentList === LIST_TYPES.ONLINE
                ? LIST_TYPES.ONLINE
                : LIST_TYPES.SUPERMARKET
            );

            if (DEBUG)
              console.log('[Realtime] stato applicato da cloud', remoteAt);
          } catch (e) {
            if (DEBUG) console.warn('[Realtime] fetch failed', e);
          }
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [user?.id]);

  /* ------------------------- Brain Bridge (facolt.) ------------------------- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;

    async function wireBrain() {
      // Qui colleghi gli handler del “cervello” (assistant) ai metodi locali
      // es: aggiungi prodotto -> addItem('latte', 1)
      // lascia vuoto se l’hai già altrove
    }

    wireBrain();
    return () => {
      cancelled = true;
    };
  }, []); // deps volutamente vuote

  /* ----------------------------- FUNZIONI UI ----------------------------- */
  const activeListItems = useMemo(() => {
    return lists[currentList] || [];
  }, [lists, currentList]);

  function addItem(name, qty = 1) {
    const normalized = String(name || '').trim();
    if (!normalized) return;
    setLists((prev) => {
      const next = { ...prev };
      const items = Array.isArray(next[currentList]) ? [...next[currentList]] : [];
      // se esiste già, incrementa solo qty
      const idx = items.findIndex(
        (r) => r && r.name && r.name.toLowerCase() === normalized.toLowerCase()
      );
      if (idx >= 0) {
        const row = { ...items[idx] };
        row.qty = Math.max(1, Number(row.qty || 1) + Number(qty || 1));
        items[idx] = row;
      } else {
        items.push({
          id: crypto.randomUUID(),
          name: normalized,
          qty: Math.max(1, Number(qty || 1)),
          bought: false,
        });
      }
      next[currentList] = items;
      return next;
    });
  }

  function toggleBought(id) {
    setLists((prev) => {
      const next = { ...prev };
      const items = Array.isArray(next[currentList]) ? [...next[currentList]] : [];
      const idx = items.findIndex((r) => r?.id === id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], bought: !items[idx].bought };
      }
      next[currentList] = items;
      return next;
    });
  }

  function incQty(id, delta) {
    setLists((prev) => {
      const next = { ...prev };
      const items = Array.isArray(next[currentList]) ? [...next[currentList]] : [];
      const idx = items.findIndex((r) => r?.id === id);
      if (idx >= 0) {
        const q = Math.max(1, Number(items[idx].qty || 1) + Number(delta || 0));
        items[idx] = { ...items[idx], qty: q };
      }
      next[currentList] = items;
      return next;
    });
  }

  function removeItem(id) {
    setLists((prev) => {
      const next = { ...prev };
      next[currentList] = (prev[currentList] || []).filter((r) => r?.id !== id);
      return next;
    });
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    addItem(manualName, manualQty);
    setManualName('');
    setManualQty(1);
    setShowManual(false);
  }

  /* -------------------------------- RENDER -------------------------------- */
  return (
    <>
      <Head>
        <title>Liste Prodotti · Jarvis</title>
      </Head>

      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Liste Prodotti</h1>
          <nav className={styles.nav}>
            <Link href="/home" className="underline hover:opacity-80">
              Home
            </Link>
            <Link href="/dashboard" className="underline hover:opacity-80">
              Dashboard
            </Link>
            <Link href="/spese-casa" className="underline hover:opacity-80">
              Casa
            </Link>
          </nav>
        </header>

        <section className={styles.card}>
          <div className={styles.tabRow}>
            <button
              className={
                currentList === LIST_TYPES.SUPERMARKET
                  ? styles.tabActive
                  : styles.tab
              }
              onClick={() => setCurrentList(LIST_TYPES.SUPERMARKET)}
            >
              Supermercato
              <span className={styles.pill}>
                {(lists[LIST_TYPES.SUPERMARKET] || []).length}
              </span>
            </button>
            <button
              className={
                currentList === LIST_TYPES.ONLINE ? styles.tabActive : styles.tab
              }
              onClick={() => setCurrentList(LIST_TYPES.ONLINE)}
            >
              Online
              <span className={styles.pill}>
                {(lists[LIST_TYPES.ONLINE] || []).length}
              </span>
            </button>
          </div>

          <div className={styles.addRow}>
            <button
              className={styles.addBtn}
              onClick={() => setShowManual((v) => !v)}
            >
              {showManual ? 'Chiudi' : 'Aggiungi manuale'}
            </button>
            <span className={styles.hint}>
              Suggerimento: tocca una riga per segnarla come presa (rosso → verde).
            </span>
          </div>

          {showManual && (
            <form onSubmit={handleManualSubmit} className="mb-4 flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-sm">
                Nome prodotto
                <input
                  className="mt-1 px-3 py-2 rounded-xl bg-white/10 border border-white/15 outline-none"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="es. Latte"
                  required
                />
              </label>
              <label className="flex flex-col text-sm">
                Quantità
                <input
                  type="number"
                  min={1}
                  className="mt-1 px-3 py-2 w-28 rounded-xl bg-white/10 border border-white/15 outline-none"
                  value={manualQty}
                  onChange={(e) => setManualQty(Number(e.target.value || 1))}
                  required
                />
              </label>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15"
              >
                Aggiungi
              </button>
            </form>
          )}

          <h3 className={styles.sectionTitle}>Lista</h3>
          <div className={styles.listWrap}>
            {activeListItems.length === 0 && (
              <div className="opacity-70 text-sm">Lista vuota.</div>
            )}

            {activeListItems.map((row) => {
              const isBought = !!row.bought;
              const base =
                'border-white/15 hover:border-white/30';
              const color =
                isBought
                  ? 'bg-emerald-700/50 hover:bg-emerald-700/60'
                  : 'bg-red-700/50 hover:bg-red-700/60';
              return (
                <div
                  key={row.id}
                  className={`${styles.rowBtn} ${base} ${color}`}
                  onClick={() => toggleBought(row.id)}
                  role="button"
                  aria-pressed={isBought}
                >
                  <div className={styles.rowLeft}>
                    <span className="font-semibold">
                      {row.name}
                    </span>
                    <span className={styles.pill}>
                      {isBought ? 'Presa' : 'Da prendere'}
                    </span>
                  </div>

                  <div className={styles.qtyWrap} onClick={(e) => e.stopPropagation()}>
                    <button
                      className={styles.qtyBtn}
                      onClick={() => incQty(row.id, -1)}
                      type="button"
                      aria-label="Diminuisci"
                    >
                      −
                    </button>
                    <span className="w-8 text-center">{row.qty || 1}</span>
                    <button
                      className={styles.qtyBtn}
                      onClick={() => incQty(row.id, +1)}
                      type="button"
                      aria-label="Aumenta"
                    >
                      +
                    </button>

                    <button
                      className={styles.delBtn}
                      onClick={() => removeItem(row.id)}
                      type="button"
                      aria-label="Elimina"
                      title="Elimina riga"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Sezioni “Stato scorte” e “Prodotti in esaurimento” (placeholders se già gestite altrove) */}
        <section className={styles.card}>
          <h3 className={styles.sectionTitle}>Stato scorte</h3>
          <p className={styles.hint}>
            Qui puoi mostrare la dispensa (si popola da scontrino/voce). Mantengo
            la tua logica esistente: lo stato è sincronizzato e persiste.
          </p>
          {stock?.length ? (
            <ul className="list-disc ml-5">
              {stock.map((s) => (
                <li key={s.id || s.name}>{s.name} — {s.qty || 1}</li>
              ))}
            </ul>
          ) : (
            <div className="opacity-70 text-sm">Nessun elemento in dispensa.</div>
          )}
        </section>

        <section className={styles.card}>
          <h3 className={styles.sectionTitle}>Prodotti in esaurimento</h3>
          <p className={styles.hint}>
            Resta invariata: se già calcoli le soglie altrove, lasciala così.
          </p>
        </section>
      </div>
    </>
  );
}
