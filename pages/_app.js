import React, { useState } from 'react';
import '../styles/globals.css';

import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';

// 👉 Nuovo pacchetto unificato
import { createBrowserClient } from '@supabase/ssr';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  // pagine senza NavBar
  const hideNavOn = ['/', '/login'];
  const showNav = !hideNavOn.includes(router.pathname);

  // client Supabase creato una sola volta per sessione browser
  const [supabaseClient] = useState(() => createBrowserClient());

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={pageProps.initialSession ?? null}
    >
      <AuthProvider>
        {showNav && <NavBar />}{/* Navbar visibile ovunque, tranne login */}
        <Component {...pageProps} />
      </AuthProvider>
    </SessionContextProvider>
  );
}
