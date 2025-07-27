import { createContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
      }
    );

    // sessione già presente all’avvio
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  /* helper di login */
  const signIn = (credentials) =>
    supabase.auth.signInWithPassword(credentials);

  return (
    <AuthContext.Provider value={{ user, session, signIn }}>
      {children}
    </AuthContext.Provider>
  );
}