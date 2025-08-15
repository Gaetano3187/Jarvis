// pages/_app.js
import React, { useState } from 'react';
import '../styles/globals.css';

import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';

// Supabase
import { createBrowserClient } from '@supabase/ssr';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

// Font Google con next/font (caricamento ottimizzato)
import { Poppins } from 'next/font/google';
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const hideNavOn = ['/', '/login']; // pagine senza NavBar
  const showNav = !hideNavOn.includes(router.pathname);

  const [supabaseClient] = useState(() =>
    createBrowserClient(supabaseUrl, supabaseAnon)
  );

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={pageProps.initialSession ?? null}
    >
      <AuthProvider>
        {/* wrapper globale: font + bg gradiente + palette */}
        <div className={`${poppins.variable} app-shell`}>
          {showNav && <NavBar />}

          {/* contenitore con effetto vetro (tutte le pagine dentro) */}
          <main className="page-container">
            <Component {...pageProps} />
          </main>
        </div>
      </AuthProvider>
    </SessionContextProvider>
  );
}
