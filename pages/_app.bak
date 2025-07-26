import React from "react";
import '../styles/globals.css';
import { AuthProvider } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  // Pagine in cui NON vogliamo la NavBar
  const hideNavOn = ['/', '/login'];   // '/' è index.js (login)

  const showNav = !hideNavOn.includes(router.pathname);

  return (
    <AuthProvider>
      {showNav && <NavBar />}   {/* NavBar visibile ovunque, tranne login */}
      <Component {...pageProps} />
    </AuthProvider>
  );
}
