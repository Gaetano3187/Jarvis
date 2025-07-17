import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

/*
  AuthContext gestisce lo stato d’autenticazione dell’intera app.
  Espone:
  - user      → oggetto utente (o null se non loggato)
  - loading   → boolean in attesa di conferma sessione
  - signIn    → (email, pw)  → login
  - signUp    → (email, pw)  → registrazione
  - signOut   → logout e redirect a /login
*/

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  /* ─────────────── INIT + LISTENER ─────────────── */
  useEffect(() => {
    let isMounted = true;

    // 1. Sessione al primo render
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    // 2. Listener per login / logout
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setUser(authSession?.user ?? null);
    });

    // cleanup
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /* ──────────────── AUTH ACTIONS ──────────────── */
  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    router.push('/login');
  };

  /* ───────────────── CONTEXT VALUE ───────────────── */
  const value = { user, loading, signIn, signUp, signOut };

  return (
    <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>
  );
};

/* Hook di comodo */
export const useAuth = () => useContext(AuthContext);
