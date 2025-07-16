// pages/_app.js
import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import '../styles/globals.css';                // unico CSS globale

import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';     // componente di navigazione

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  /* La barra si nasconde SOLO nella root (pagina index / login) */
  const hideNav = router.pathname === '/';

  return (
    <AuthProvider>
      <Head>
        <title>Jarvis</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>

      {!hideNav && <NavBar />}

      <Component {...pageProps} />
    </AuthProvider>
  );
}
