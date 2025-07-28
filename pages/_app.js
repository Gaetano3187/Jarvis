import React, { useState } from 'react';
import '../styles/globals.css';

import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router  '
import { createBrowserClient, SessionContextProvider } from '@supabase/ssr';


// 👉 tutto dal nuovo pacchetto unificato
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  // pagine senza NavBar
  const hideNavOn = ['/', '/login'];
  const showNav = !hideNavOn.includes(router.pathname);

  // il client viene creato una sola volta
  const [supabaseClient] = useState(() =>
    createBrowserClient(supabaseUrl, supabaseAnon)
  );

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={pageProps.initialSession ?? null}
    >
      <AuthProvider>
        {showNav && <NavBar />} {/* Navbar visibile ovunque, tranne login */}
        <Component {...pageProps} />
      </AuthProvider>
    </SessionContextProvider>
  );
}
aii
