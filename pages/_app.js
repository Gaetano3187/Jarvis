import React from "react";
import '../styles/globals.css';
import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabaseClient';

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  // Pagine in cui NON vogliamo la NavBar
  const hideNavOn = ['/', '/login'];   // '/' è index.js (login)

  const showNav = !hideNavOn.includes(router.pathname);

  return (
   <SessionContextProvider supabaseClient={supabase} initialSession={pageProps.initialSession ||? null}>
      <AuthProvider>
       {showNav && <NavBar />}{/* Navbar visibile ovunque, tranne login */}
        <Component {...pageProps} />
      </AuthProvider>
    </SessionContextProvider>
  );
}
