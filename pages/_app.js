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

  const log = (...a) => { if (window.__JARVIS_DEBUG__) console.log('[jarvis-proxy]', ...a); };

  // ——— Storage helpers
  const KEY_LIST = 'jarvis_list_supermercato';
  const safeParse = (s, fb = []) => { try { return JSON.parse(s); } catch { return fb; } };
  const loadList  = () => (typeof localStorage !== 'undefined' ? safeParse(localStorage.getItem(KEY_LIST), []) : []);
  const saveList  = (arr) => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(KEY_LIST, JSON.stringify(arr || []));
      window.dispatchEvent(new CustomEvent('jarvis:lists-updated', { detail: { key: KEY_LIST } }));
    } catch {}
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
    const idx = items.findIndex(it => (it.name || '').toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
      items[idx].qty = (items[idx].qty || 0) + (packs || 1);
      items[idx].unitsPerPack = unitsPerPack || items[idx].unitsPerPack || 1;
      items[idx].unitLabel    = unitLabel    || items[idx].unitLabel    || 'unità';
      if (brand)    items[idx].brand    = brand;
      if (listType) items[idx].listType = listType;
      if (category) items[idx].category = category;
    } else {
      items.push({
        name,
        brand,
        qty: packs || 1,
        unitsPerPack: unitsPerPack || 1,
        unitLabel,
        listType,
        category,
        addedAt: Date.now(),
      });
    }
    saveList(items);
    // ping immediato per eventuali listener della pagina
    window.dispatchEvent(new CustomEvent('jarvis:list-add', {
      detail: { item: { name, brand, qty: packs || 1, unitsPerPack, unitLabel, listType, category } }
    }));
    log('LS upsert:', name, '(qty++), total items:', items.length);
  };

  const decItemLS = (name, amount = 1) => {
    if (!name) return;
    const items = loadList();
    const i = items.findIndex(it => (it.name || '').toLowerCase() === String(name).toLowerCase());
    if (i === -1) return;
    const next = (items[i].qty || 1) - (amount || 1);
    if (next > 0) items[i].qty = next;
    else items.splice(i, 1);
    saveList(items);
    window.dispatchEvent(new CustomEvent('jarvis:lists-updated', { detail: { key: KEY_LIST } }));
    log('LS dec:', name, 'by', amount);
  };

  // ——— forward robusto per ADD se la pagina usa nomi comando diversi
  const tryForwards = async (real, candidateCmds, payload) => {
    if (!real?.run) return null;
    for (const cmd of candidateCmds) {
      try {
        const out = await real.run(cmd, payload);
        log('forward OK', cmd, payload);
        return out ?? { ok: 1 };
      } catch (e) {
        log('forward FAIL', cmd, e?.message || e);
      }
    }
    return null;
  };

  // ——— wrapper combinato
  let __REAL = null;

  const flushLSInto = async (real) => {
    if (!real?.run) return;
    try {
      const items = loadList();
      let existing = [];
      try { existing = (await real.ask?.('lista-oggi')) || []; } catch {}
      const exists = new Set((existing || []).map(i => String(i.name || '').toLowerCase()));
      for (const it of items) {
        const k = String(it.name || '').toLowerCase();
        if (exists.has(k)) continue;
        await tryForwards(real,
          ['aggiungi-alla-lista', 'list/add', 'lista/aggiungi', 'add-to-list', 'addToList'],
          {
            name: it.name,
            brand: it.brand || '',
            packs: it.qty || 1,
            unitsPerPack: it.unitsPerPack || 1,
            unitLabel: it.unitLabel || 'unità',
            listType: it.listType || 'supermercato',
            category: it.category || 'spese-casa',
          }
        );
      }
      log('flush completato verso brain reale. Items:', items.length);
    } catch (e) {
      log('flush error:', e?.message || e);
    }
  };

  const makeWrapper = (realBrain) => ({
    async run(cmd, payload = {}) {
      if (cmd === 'aggiungi-alla-lista') {
        upsertItemLS(payload);
        // tenta anche sul brain reale (varianti comando)
        await tryForwards(realBrain,
          ['aggiungi-alla-lista', 'list/add', 'lista/aggiungi', 'add-to-list', 'addToList'],
          {
            name: payload.name || '',
            brand: payload.brand || '',
            packs: payload.packs || payload.qty || 1,
            unitsPerPack: payload.unitsPerPack || 1,
            unitLabel: payload.unitLabel || 'unità',
            listType: payload.listType || 'supermercato',
            category: payload.category || 'spese-casa',
          }
        );
        return { ok: 1 };
      }
      if (cmd === 'segna-comprato') {
        const { name = '', amount = 1 } = payload;
        decItemLS(name, amount);
        if (realBrain?.run) {
          await tryForwards(realBrain, ['segna-comprato', 'list/mark-bought', 'mark-bought'], payload);
        }
        return { ok: 1 };
      }

      // default passthrough
      if (realBrain?.run) {
        try { return await realBrain.run(cmd, payload); }
        catch (e) { log('run passthrough fail', cmd, e?.message || e); }
      }
      return { ok: 1 };
    },

    async ask(question, payload = {}) {
      // prima prova il brain reale
      if (realBrain?.ask) {
        try {
          const res = await realBrain.ask(question, payload);
          if (question === 'lista-oggi') {
            const ls = loadList();
            // merge by name (locale + remoto)
            const byName = (arr) => Object.fromEntries((arr || []).map(i => [String(i.name || '').toLowerCase(), i]));
            const map = byName(res || []);
            for (const it of (ls || [])) {
              const k = String(it.name || '').toLowerCase();
              if (!map[k]) {
                // adatta shape LS alla shape attesa dalla pagina
                map[k] = {
                  name: it.name,
                  brand: it.brand,
                  qty: it.qty,
                  unitsPerPack: it.unitsPerPack,
                  unitLabel: it.unitLabel,
                  listType: it.listType,
                  category: it.category,
                };
              }
            }
            return Object.values(map);
          }
          return res;
        } catch (e) {
          log('ask passthrough fail', question, e?.message || e);
        }
      }

      // fallback solo-LS
      if (question === 'lista-oggi') return loadList().map(it => ({
        name: it.name, brand: it.brand, qty: it.qty, unitsPerPack: it.unitsPerPack, unitLabel: it.unitLabel,
      }));
      if (['scorte-complete', 'scorte-esaurimento', 'scorte-scadenza', 'scorte-giorni-esaurimento'].includes(question)) return [];
      return null;
    },
  });

  // ——— definizione proxy + intercettazione futura
  const defineProxy = () => {
    if (window.__JARVIS_BRAIN_PROXY_READY__) return;
    window.__JARVIS_BRAIN_PROXY_READY__ = true;

    // se c'è già un brain → wrappa subito
    if (window.jarvisBrain && !window.__jarvisBrainHub) {
      __REAL = window.jarvisBrain;
      window.__jarvisBrainHub = makeWrapper(__REAL);
      window.jarvisBrain = window.__jarvisBrainHub;
      flushLSInto(__REAL);
      log('wrappato brain pre-esistente');
    }

    Object.defineProperty(window, 'jarvisBrain', {
      configurable: true,
      enumerable: true,
      get() { return window.__jarvisBrainHub || null; },
      set(v) {
        __REAL = v || null;
        window.__jarvisBrainHub = makeWrapper(__REAL);
        // esponi flush manuale
        window.__jarvisFlush = () => flushLSInto(__REAL);
        // flush automatico
        flushLSInto(__REAL);
        log('brain reale collegato, wrapper ricreato', !!__REAL);
      },
    });

    // alias stabile
    if (!window.__jarvisBrainHub) window.__jarvisBrainHub = makeWrapper(null);
    if (!window.__jarvisFlush) window.__jarvisFlush = () => flushLSInto(__REAL);
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

  // Monta il proxy solo lato client
  useEffect(() => {
    bootstrapBrainProxy();
  }, []);

  // flush aggressivo quando entri su /liste-prodotti + quando torni focus
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const doFlush = () => {
      if (window.__jarvisFlush) {
        setTimeout(() => window.__jarvisFlush(), 250);
        setTimeout(() => window.__jarvisFlush(), 1200);
      }
    };

    const onRoute = (url) => { if (typeof url === 'string' && url.includes('/liste-prodotti')) doFlush(); };
    router.events.on('routeChangeComplete', onRoute);

    // se già sei lì
    onRoute(router.pathname);

    // flush anche al focus (es. torni alla tab)
    window.addEventListener('focus', doFlush);

    return () => {
      router.events.off('routeChangeComplete', onRoute);
      window.removeEventListener('focus', doFlush);
    };
  }, [router]);

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
