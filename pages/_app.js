// pages/_app.js
import React from 'react';
import '../styles/globals.css';

import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';

// Usa il client singleton definito in lib/supabaseClient.ts
import { supabase } from '@/lib/supabaseClient';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  // Pagine senza NavBar
  const hideNavOn = ['/', '/login'];
  const showNav = !hideNavOn.includes(router.pathname);

  return (
    <SessionContextProvider
      supabaseClient={supabase}
      initialSession={pageProps.initialSession ?? null}
    >
      <AuthProvider>
        {showNav && <NavBar />}
        <Component {...pageProps} />
      </AuthProvider>
    </SessionContextProvider>
  );
}
