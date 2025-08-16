// /pages/_app.js
import React, { useState, useEffect } from 'react';
import '../styles/globals.css';

import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';

// Supabase
import { createBrowserClient } from '@supabase/ssr';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

// Font Google con next/font
import { Poppins } from 'next/font/google';
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* ------------------------------------------------------------------ */
/*                       BRIDGE + PROXY SU jarvisBrain                */
/* ------------------------------------------------------------------ */
function bootstrapBrainProxy() {
  if (typeof window === 'undefined') return;

  // ——— Storage helpers
  const KEY_LIST = 'jarvis_list_supermercato';
  const safeParse = (s, fb=[]) => { try { return JSON.parse(s); } catch { return fb; } };
  const loadList  = () => safeParse(localStorage.getItem(KEY_LIST), []);
  const saveList  = (arr) => {
    localStorage.setItem(KEY_LIST, JSON.stringify(arr));
    // ping opzionale per eventuali listener
    window.dispatchEvent(new CustomEvent('jarvis:lists-updated', { detail:{ key: KEY_LIST }}));
  };

  const upsertItemLS = (payload) => {
    const {
      name = '',
      brand = '',
      packs = 1,
      unitsPerPack = 1,
      unitLabel = 'unità',
      listType = 'supermercato',
      category = 'spese-casa',
    } = payload || {};
    if (!name.trim()) return;

    const items = loadList();
    const i = items.findIndex(it => (it.name||'').toLowerCase() === name.toLowerCase());
    if (i >= 0) {
      items[i].qty = (items[i].qty||0) + (packs||1);
      items[i].unitsPerPack = unitsPerPack || items[i].unitsPerPack || 1;
      items[i].unitLabel    = unitLabel    || items[i].unitLabel    || 'unità';
      if (brand)    items[i].brand    = brand;
      if (listType) items[i].listType = listType;
      if (category) items[i].category = category;
    } else {
      items.push({ name, brand, qty:packs||1, unitsPerPack:unitsPerPack||1, unitLabel, listType, category, addedAt:Date.now() });
    }
    saveList(items);
  };

  const decItemLS = (name, amount=1) => {
    if (!name) return;
    const items = loadList();
    const i = items.findIndex(it => (it.name||'').toLowerCase() === String(name).toLowerCase());
    if (i === -1) return;
    const next = (items[i].qty||1) - (amount||1);
    if (next > 0) items[i].qty = next;
    else items.splice(i,1);
    saveList(items);
  };

  // ——— Wrapper che chiama sia LS sia il “vero” brain (se/ quando esiste)
  const makeWrapper = (realBrain) => {
    const wrapper = {
      async run(cmd, payload={}) {
        // Aggiorna sempre LS (così chat/Home vedono la lista)
        if (cmd === 'aggiungi-alla-lista') {
          upsertItemLS(payload);
        }
        if (cmd === 'segna-comprato') {
          const { name = '', amount = 1 } = payload;
          decItemLS(name, amount);
        }

        // Forward al brain reale se disponibile (per aggiornare la UI della pagina)
        if (realBrain?.run) {
          try {
            // Normalizzo payload per massima compatibilità
            if (cmd === 'aggiungi-alla-lista') {
              const p = {
                name: payload.name || '',
                brand: payload.brand || '',
                packs: payload.packs || payload.qty || 1,
                unitsPerPack: payload.unitsPerPack || 1,
                unitLabel: payload.unitLabel || 'unità',
                listType: payload.listType || 'supermercato',
                category: payload.category || 'spese-casa',
              };
              return await realBrain.run('aggiungi-alla-lista', p);
            }
            return await realBrain.run(cmd, payload);
          } catch (e) {
            console.warn('[jarvisBrain proxy] forward run error:', e);
          }
        }
        return { ok: 1 };
      },

      async ask(question, payload={}) {
        // Se la pagina ha un brain, prova prima quello
        if (realBrain?.ask) {
          try {
            const res = await realBrain.ask(question, payload);
            if (question === 'lista-oggi') {
              // Merge con LS (evita duplicati; priorità alla pagina)
              const ls = loadList();
              const byName = (arr) =>
                Object.fromEntries((arr||[]).map(i => [String(i.name||'').toLowerCase(), i]));
              const map = byName(res||[]);
              for (const it of (ls||[])) {
                const k = String(it.name||'').toLowerCase();
                if (!map[k]) map[k] = it;
              }
              return Object.values(map);
            }
            return res;
          } catch (e) {
            console.warn('[jarvisBrain proxy] forward ask error:', e);
          }
        }

        // Fallback: senza brain pagina, leggi LS
        if (question === 'lista-oggi') return loadList();
        if (['scorte-complete','scorte-esaurimento','scorte-scadenza','scorte-giorni-esaurimento'].includes(question)) return [];
        return null;
      }
    };
    return wrapper;
  };

  // ——— Se c’è già un brain, wrappalo; altrimenti intercetta la futura assegnazione
  const defineProxy = () => {
    // Evita doppi setup
    if (window.__JARVIS_BRAIN_PROXY_READY__) return;
    window.__JARVIS_BRAIN_PROXY_READY__ = true;

    // Se esiste già, wrappalo subito
    if (window.jarvisBrain && !window.__jarvisBrainHub) {
      window.__jarvisBrainHub = makeWrapper(window.jarvisBrain);
      window.jarvisBrain = window.__jarvisBrainHub;
    }

    // Intercetta future assegnazioni: quando /liste-prodotti monta il suo brain, lo wrappiamo
    let _real = null;
    Object.defineProperty(window, 'jarvisBrain', {
      configurable: true,
      enumerable: true,
      get() {
        return window.__jarvisBrainHub || null;
      },
      set(v) {
        _real = v || null;

        // Flush degli item già in LS verso il brain reale (così la UI si aggiorna)
        (async () => {
          try {
            if (_real?.run) {
              const items = loadList();
              // Dedup su base della lista attuale della pagina (se disponibile)
              let existing = [];
              try { existing = (await _real.ask?.('lista-oggi')) || []; } catch {}
              const exists = new Set((existing||[]).map(i => String(i.name||'').toLowerCase()));
              for (const it of items) {
                if (!exists.has(String(it.name||'').toLowerCase())) {
                  await _real.run('aggiungi-alla-lista', {
                    name: it.name, brand: it.brand||'',
                    packs: it.qty||1, unitsPerPack: it.unitsPerPack||1,
                    unitLabel: it.unitLabel||'unità',
                    listType: it.listType||'supermercato',
                    category: it.category||'spese-casa',
                  });
                }
              }
            }
          } catch (e) {
            console.warn('[jarvisBrain proxy] flush-to-real error:', e);
          }
        })();

        // (Re)crea il wrapper combinato
        window.__jarvisBrainHub = makeWrapper(_real);
      }
    });

    // Espone anche un alias stabile (se qualche codice usa __jarvisBrainHub)
    if (!window.__jarvisBrainHub) {
      window.__jarvisBrainHub = makeWrapper(null);
    }
  };

  defineProxy();
}

/* ------------------------------------------------------------------ */

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const hideNavOn = ['/', '/login']; // pagine senza NavBar
  const showNav = !hideNavOn.includes(router.pathname);

  const [supabaseClient] = useState(() =>
    createBrowserClient(supabaseUrl, supabaseAnon)
  );

  useEffect(() => {
    bootstrapBrainProxy();
  }, []);

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={pageProps.initialSession ?? null}
    >
      <AuthProvider>
        <div className={`${poppins.variable} app-shell`}>
          {showNav && <NavBar />}
          <main className="page-container">
            <Component {...pageProps} />
          </main>
        </div>
      </AuthProvider>
    </SessionContextProvider>
  );
}
