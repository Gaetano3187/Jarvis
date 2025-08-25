// pages/_app.js
import React, { useState, useEffect } from 'react';
import '../styles/globals.css';
import '../styles/mobile-overrides.css';


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
/*                    BRIDGE + PROXY (LS + CLOUD SYNC)                */
/* ------------------------------------------------------------------ */
function bootstrapBrainProxy(supabase) {
  if (typeof window === 'undefined') return;

  const log = (...a) => { if (window.__JARVIS_DEBUG__) console.log('[jarvis-proxy]', ...a); };

  // ——— localStorage
  const KEY_LIST = 'jarvis_list_supermercato';
  const safeParse = (s, fb=[]) => { try { return JSON.parse(s); } catch { return fb; } };
  const loadList  = () => safeParse(localStorage.getItem(KEY_LIST), []);
  const saveList  = (arr) => {
    localStorage.setItem(KEY_LIST, JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent('jarvis:lists-updated', { detail:{ key: KEY_LIST }}));
  };

  const upsertItemLS = (payload) => {
    const {
      name = '', brand = '', packs = 1, unitsPerPack = 1, unitLabel = 'unità',
      listType = 'supermercato', category = 'spese-casa',
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
      items.push({
        name, brand, qty:packs||1, unitsPerPack:unitsPerPack||1, unitLabel,
        listType, category, addedAt: Date.now()
      });
    }
    saveList(items);
    window.dispatchEvent(new CustomEvent('jarvis:list-add', { detail:{ item: { name, brand, qty:packs||1, unitsPerPack, unitLabel, listType, category }}}));
    log('LS upsert:', name, '(qty++), total items:', items.length);
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
    window.dispatchEvent(new CustomEvent('jarvis:lists-updated', { detail:{ key: KEY_LIST }}));
    log('LS dec:', name, 'by', amount);
  };

  // ——— "Cloud" (Supabase) – opzionale
  const cloud = (() => {
    if (!supabase) return null;

    const table = 'shopping_list';
    const getUserId = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        return data?.user?.id || null;
      } catch {
        return null;
      }
    };

    const rowShape = (user_id, it) => ({
      user_id,
      name: it.name,
      brand: it.brand || '',
      qty: it.qty || it.packs || 1,
      units_per_pack: it.unitsPerPack || 1,
      unit_label: it.unitLabel || 'unità',
      list_type: it.listType || 'supermercato',
      category: it.category || 'spese-casa',
      added_at: new Date().toISOString(),
    });

    const loadAll = async () => {
      const user_id = await getUserId();
      if (!user_id) return [];
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', user_id)
        .order('added_at', { ascending: true });
      if (error) {
        log('[cloud load] fallback only-LS:', error?.message || error);
        return [];
      }
      return (data||[]).map(r => ({
        name: r.name,
        brand: r.brand || '',
        qty: Number(r.qty || 1),
        unitsPerPack: Number(r.units_per_pack || 1),
        unitLabel: r.unit_label || 'unità',
        listType: r.list_type || 'supermercato',
        category: r.category || 'spese-casa',
        addedAt: r.added_at ? new Date(r.added_at).getTime() : Date.now()
      }));
    };

    const upsertOne = async (item) => {
      const user_id = await getUserId();
      if (!user_id) return;

      const { data: existing, error: selErr } = await supabase
        .from(table)
        .select('id, qty')
        .eq('user_id', user_id)
        .ilike('name', item.name)
        .limit(1);

      if (selErr) { log('[cloud select err]', selErr?.message || selErr); return; }

      if (existing && existing.length) {
        const row = existing[0];
        const { error: upErr } = await supabase
          .from(table)
          .update({ qty: Number(row.qty||0) + Number(item.qty||1), added_at: new Date().toISOString() })
          .eq('id', row.id);
        if (upErr) log('[cloud update err]', upErr?.message || upErr);
        else log('[cloud updated]', item.name);
      } else {
        const { error: insErr } = await supabase
          .from(table)
          .insert(rowShape(user_id, item));
        if (insErr) log('[cloud insert err]', insErr?.message || insErr);
        else log('[cloud inserted]', item.name);
      }
    };

    const decreaseOne = async (name, amount=1) => {
      const user_id = await getUserId();
      if (!user_id || !name) return;
      const { data: existing, error: selErr } = await supabase
        .from(table)
        .select('id, qty')
        .eq('user_id', user_id)
        .ilike('name', name)
        .limit(1);
      if (selErr) { log('[cloud select err]', selErr?.message || selErr); return; }
      if (!existing || !existing.length) return;

      const row = existing[0];
      const next = Number(row.qty||1) - Number(amount||1);
      if (next > 0) {
        const { error: updErr } = await supabase.from(table).update({ qty: next }).eq('id', row.id);
        if (updErr) log('[cloud dec err]', updErr?.message || updErr);
      } else {
        const { error: delErr } = await supabase.from(table).delete().eq('id', row.id);
        if (delErr) log('[cloud del err]', delErr?.message || delErr);
      }
    };

    const mergeRemoteIntoLS = (remote) => {
      const byKey = (arr) => Object.fromEntries((arr||[]).map(i => [String(i.name||'').toLowerCase(), i]));
      const ls = loadList();
      const map = byKey(ls);
      for (const r of (remote||[])) {
        const k = String(r.name||'').toLowerCase();
        if (!map[k]) map[k] = r;
        else map[k].qty = Math.max(map[k].qty||1, r.qty||1);
      }
      const merged = Object.values(map);
      saveList(merged);
      log('[cloud -> LS] merge completato', merged.length);
    };

    const pushLSIntoRemote = async () => {
      const user_id = await getUserId();
      if (!user_id) return;
      const ls = loadList();
      for (const it of (ls||[])) await upsertOne(it);
      log('[LS -> cloud] flush completato', ls.length);
    };

    return {
      enabled: true,
      loadAll,
      upsertOne,
      decreaseOne,
      mergeRemoteIntoLS,
      pushLSIntoRemote,
    };
  })();

  // ——— forward di comandi al brain reale (se presente)
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

  // ——— flush: invia LS → cloud e poi cloud → LS → brain
  const doCloudPullMergeAndFlush = async (real) => {
    try {
      if (cloud?.enabled) {
        const remote = await cloud.loadAll();
        if (remote?.length) cloud.mergeRemoteIntoLS(remote);
        await cloud.pushLSIntoRemote();
      }
      if (real?.ask || real?.run) {
        try {
          const items = loadList();
          let existing = [];
          try { existing = (await real.ask?.('lista-oggi')) || []; } catch {}
          const known = new Set((existing||[]).map(i => String(i.name||'').toLowerCase()));
          for (const it of items) {
            if (known.has(String(it.name||'').toLowerCase())) continue;
            await tryForwards(real,
              ['aggiungi-alla-lista','list/add','lista/aggiungi','add-to-list','addToList'],
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
        } catch (e) {
          log('[flush -> brain] errore', e?.message || e);
        }
      }
    } catch (e) {
      log('[sync] errore', e?.message || e);
    }
  };

  // ——— wrapper del brain
  let __REAL = null;
  const makeWrapper = (realBrain) => ({
    async run(cmd, payload={}) {
      if (cmd === 'aggiungi-alla-lista') {
        const normalized = {
          name: payload.name || '',
          brand: payload.brand || '',
          packs: payload.packs || payload.qty || 1,
          unitsPerPack: payload.unitsPerPack || 1,
          unitLabel: payload.unitLabel || 'unità',
          listType: payload.listType || 'supermercato',
          category: payload.category || 'spese-casa',
        };
        upsertItemLS(normalized);
        if (cloud?.enabled) cloud.upsertOne({ ...normalized, qty: normalized.packs });

        await tryForwards(realBrain,
          ['aggiungi-alla-lista','list/add','lista/aggiungi','add-to-list','addToList'],
          normalized
        );
        return { ok: 1 };
      }

      if (cmd === 'segna-comprato') {
        const { name = '', amount = 1 } = payload;
        decItemLS(name, amount);
        if (cloud?.enabled) cloud.decreaseOne(name, amount);
        if (realBrain?.run) {
          await tryForwards(realBrain, ['segna-comprato','list/mark-bought','mark-bought'], payload);
        }
        return { ok: 1 };
      }

      if (realBrain?.run) {
        try { return await realBrain.run(cmd, payload); }
        catch (e) { log('run passthrough fail', cmd, e?.message || e); }
      }
      return { ok: 1 };
    },

    async ask(question, payload={}) {
      if (realBrain?.ask) {
        try {
          const res = await realBrain.ask(question, payload);
          if (question === 'lista-oggi') {
            if (cloud?.enabled) {
              const remote = await cloud.loadAll();
              if (remote?.length) cloud.mergeRemoteIntoLS(remote);
            }
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
          log('ask passthrough fail', question, e?.message || e);
        }
      }

      if (question === 'lista-oggi') {
        if (cloud?.enabled) {
          const remote = await cloud.loadAll();
          if (remote?.length) cloud.mergeRemoteIntoLS(remote);
        }
        return loadList();
      }
      if (['scorte-complete','scorte-esaurimento','scorte-scadenza','scorte-giorni-esaurimento'].includes(question)) return [];
      return null;
    }
  });

  const defineProxy = () => {
    if (window.__JARVIS_BRAIN_PROXY_READY__) return;
    window.__JARVIS_BRAIN_PROXY_READY__ = true;

    if (window.jarvisBrain && !window.__jarvisBrainHub) {
      const real = window.jarvisBrain;
      window.__jarvisBrainHub = makeWrapper(real);
      window.jarvisBrain = window.__jarvisBrainHub;
      doCloudPullMergeAndFlush(real);
      log('wrappato brain pre-esistente');
    }

    Object.defineProperty(window, 'jarvisBrain', {
      configurable: true,
      enumerable: true,
      get() { return window.__jarvisBrainHub || null; },
      set(v) {
        const real = v || null;
        window.__jarvisBrainHub = makeWrapper(real);
        window.__jarvisFlush = () => doCloudPullMergeAndFlush(real);
        doCloudPullMergeAndFlush(real);
        log('brain reale collegato, wrapper ricreato', !!real);
      }
    });

    if (!window.__jarvisBrainHub) window.__jarvisBrainHub = makeWrapper(null);
    if (!window.__jarvisFlush) window.__jarvisFlush = () => doCloudPullMergeAndFlush(null);

    if (cloud?.enabled && !window.__jarvisCloudPull) {
      window.__jarvisCloudPull = async () => {
        const remote = await cloud.loadAll();
        cloud.mergeRemoteIntoLS(remote);
        log('[manual cloud pull] completata');
      };
    }
  };

  defineProxy();
}

/* ------------------------------------------------------------------ */

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  // Pagine senza NavBar
  const hideNavOn = ['/', '/login', '/auth/login'];
  const showNav = !hideNavOn.includes(router.pathname);

  // Supabase client condiviso
  const [supabaseClient] = useState(() =>
    createBrowserClient(supabaseUrl, supabaseAnon)
  );

  // Etichetta rotta + classe per /liste-prodotti (per gli stili mirati)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-route', router.pathname || '');
      if (router.pathname === '/liste-prodotti') {
        document.body.classList.add('lp-route');
      } else {
        document.body.classList.remove('lp-route');
      }
    }
    return () => document.body.classList.remove('lp-route');
  }, [router.pathname]);

  // Inizializza il proxy (cloud/lista → brain)
  useEffect(() => {
    bootstrapBrainProxy(supabaseClient);
  }, [supabaseClient]);

  // Flush aggressivo quando entri in /liste-prodotti e quando la finestra torna in focus
  useEffect(() => {
    const doFlush = () => {
      if (typeof window !== 'undefined') {
        if (window.__jarvisCloudPull) window.__jarvisCloudPull();
        if (window.__jarvisFlush) {
          setTimeout(() => window.__jarvisFlush(), 250);
          setTimeout(() => window.__jarvisFlush(), 1200);
        }
      }
    };

    const onRoute = (url) => {
      const path = typeof url === 'string' ? url : router.pathname;
      if (path.includes('/liste-prodotti')) doFlush();
    };

    router.events.on('routeChangeComplete', onRoute);
    onRoute(router.pathname); // flush immediato all'apertura della pagina
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', doFlush);
    }

    return () => {
      router.events.off('routeChangeComplete', onRoute);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', doFlush);
      }
    };
  }, [router.events, router.pathname]);

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

        {/* ---- OVERRIDE FINALE: sfondo petrolio globale e neutralizzazione sfondi celesti ---- */}
        <style jsx global>{`
          :root{
            --bg-petrol: linear-gradient(180deg,#2aa9a9 0%,#114a52 38%,#0b2b31 100%);
          }

          html, body, #__next {
            min-height: 100%;
            width: 100%;
            max-width: 100%;
          }

          html {
            background-color: #0b2b31 !important; /* fallback (iOS bounce) */
          }

          body {
            background: var(--bg-petrol) fixed !important;
            overflow-x: hidden !important;
          }

          /* Elimina eventuali sfondi “celesti” dei wrapper */
          .app-shell,
          .page-container,
          .page,
          .layout,
          .bg-app,
          .bg-global {
            background: transparent !important;
          }
          [class*="wrapper"],
          [class*="container"] {
            background-image: none !important;
          }
        `}</style>
      </div>
    </AuthProvider>
  </SessionContextProvider>
);
}
