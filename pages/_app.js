// pages/_app.js
import React from 'react';
import '../styles/globals.css';

import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';

import { createBrowserClient } from '@supabase/ssr';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  // Evita crash silenziosi
  // eslint-disable-next-line no-console
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

const globalForSb = globalThis;
globalForSb._sbClient = globalForSb._sbClient || createBrowserClient(supabaseUrl, supabaseAnon);
const supabaseClient = globalForSb._sbClient;

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const hideNavOn = ['/', '/login'];
  const showNav = !hideNavOn.includes(router.pathname);

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={pageProps.initialSession ?? null}
    >
      <AuthProvider>
        {showNav && <NavBar />}
        <Component {...pageProps} />
      </AuthProvider>
    </SessionContextProvider>
  );
}
