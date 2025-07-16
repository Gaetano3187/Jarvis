// pages/_app.js
import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import '/styles/globals.css';

import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const hideNav = router.pathname === '/';  // barra nascosta nella root

  return (
    <>                                     {/* APERTURA fragment */}
      <AuthProvider>
        <Head>
          <title>Jarvis</title>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
        </Head>

        {!hideNav && <NavBar />}

        <Component {...pageProps} />
      </AuthProvider>
    </>                                     {/* CHIUSURA fragment */}
  );
}
