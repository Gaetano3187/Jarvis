import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { supabase } from '@/lib/supabaseClient';

/* -------- contesto utenti -------- */
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  /* ascolta i cambi di sessione */
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null),
    );

    // sessione già presente all’avvio
    supabase.auth.getSession().then(({ data }) =>
      setUser(data.session?.user ?? null),
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, signIn }}>
      {children}
    </AuthContext.Provider>
  );
}

/* hook di comodo */
export const useAuth = () => useContext(AuthContext);
