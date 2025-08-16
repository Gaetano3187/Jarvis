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

/** Bridge globale per liste/scorte — persiste su localStorage */
function bootstrapBrain() {
  if (typeof window === 'undefined') return;

  const KEY_LIST = 'jarvis_list_supermercato';

  const safeJSON = {
    parse: (v, fb) => { try { return JSON.parse(v); } catch { return fb; } },
    stringify: (v) => { try { return JSON.stringify(v); } catch { return '[]'; } }
  };

  const loadList = () => {
    try { return safeJSON.parse(localStorage.getItem(KEY_LIST), []) || []; }
    catch { return []; }
  };

  const saveList = (arr) => {
    try {
      localStorage.setItem(KEY_LIST, safeJSON.stringify(arr));
      window.dispatchEvent(new CustomEvent('jarvis:lists-updated', { detail: { key: KEY_LIST } }));
    } catch { /* noop */ }
  };

  if (!window.__jarvisBrainHub) {
    window.__jarvisBrainHub = {
      /** Esegue comandi mutanti */
      async run(cmd, payload = {}) {
        if (cmd === 'aggiungi-alla-lista') {
          const {
            name = '',
            packs = 1,
            unitsPerPack = 1,
            unitLabel = 'unità',
            brand = '',
            listType = 'supermercato',
            category = 'spese-casa',
          } = payload;

          if (!name.trim()) return { ok: 0, error: 'invalid_name' };

          const items = loadList();
          const i = items.findIndex(it => (it.name || '').toLowerCase() === name.toLowerCase());
          if (i >= 0) {
            items[i].qty = (items[i].qty || 0) + (packs || 1);
            items[i].unitsPerPack = unitsPerPack || items[i].unitsPerPack || 1;
            items[i].unitLabel = unitLabel || items[i].unitLabel || 'unità';
            if (brand) items[i].brand = brand;
            if (listType) items[i].listType = listType;
            if (category) items[i].category = category;
          } else {
            items.push({
              name, brand, qty: packs, unitsPerPack, unitLabel,
              listType, category, addedAt: Date.now(),
            });
          }
          saveList(items);
          return { ok: 1, count: 1 };
        }

        if (cmd === 'segna-comprato') {
          const { name = '', amount = 1 } = payload;
          const items = loadList();
          const i = items.findIndex(it => (it.name || '').toLowerCase() === name.toLowerCase());
          if (i === -1) return { ok: 0, error: 'not_found' };

          const next = (items[i].qty || 1) - (amount || 1);
          if (next > 0) items[i].qty = next;
          else items.splice(i, 1);

          saveList(items);
          return { ok: 1 };
        }

        // Comandi placeholder per compatibilità
        if (cmd === 'aggiorna-scorte' || cmd === 'imposta-scadenze') {
          return { ok: 1 };
        }

        return { ok: 0, error: 'cmd_unknown' };
      },

      /** Q&A per letture */
      async ask(question/*, payload */) {
        if (question === 'lista-oggi') return loadList();
        if (question === 'scorte-complete') return []; // estendibile
        if (question === 'scorte-esaurimento') return [];
        if (question === 'scorte-scadenza') return [];
        if (question === 'scorte-giorni-esaurimento') return [];
        return null;
      }
    };
  }

  // Alias di compatibilità
  if (!window.jarvisBrain) window.jarvisBrain = window.__jarvisBrainHub;
}

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const hideNavOn = ['/', '/login']; // pagine senza NavBar
  const showNav = !hideNavOn.includes(router.pathname);

  const [supabaseClient] = useState(() =>
    createBrowserClient(supabaseUrl, supabaseAnon)
  );

  useEffect(() => {
    bootstrapBrain();
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
