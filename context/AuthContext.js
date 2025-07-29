import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

/* 1. Crea il contesto */
export const AuthContext = createContext(null);

/* 2. Hook di comodo per consumare il contesto */
export const useAuth = () => useContext(AuthContext);

/* 3. Provider che gestisce utente e sessione */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Sessione già presente all’avvio
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
    });

    // Listener per i cambi di stato dell’autenticazione
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
      }
    );

    // Cleanup
    return () => listener.subscription.unsubscribe();
  }, []);

  /* Helper di login (eventualmente aggiungi signUp, signOut, ecc.) */
  const signIn = (credentials) =>
    supabase.auth.signInWithPassword(credentials);

  return (
    <AuthContext.Provider value={{ user, session, signIn }}>
      {children}
    </AuthContext.Provider>
  );
}

/* 4. Default export opzionale (se serve) */
export default useAuth;
