// context/AuthContext.js
import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'   // ↖︎ percorso relativo

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  /* ─────────────── INIT + LISTENER ─────────────── */
  useEffect(() => {
    let mounted = true

    // 1. sessione al primo render
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (mounted) {
          setUser(session?.user ?? null)
          setLoading(false)
        }
      })

    // 2. listener per login / logout
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setUser(authSession?.user ?? null)
    })

    // cleanup
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  /* ──────────────── AUTH ACTIONS ──────────────── */
  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signUp = async (email, password) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    router.push('/login')
  }

  /* ───────────────── CONTEXT VALUE ───────────────── */
  const value = { user, loading, signIn, signUp, signOut }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

/* Hook di comodo */
export const useAuth = () => useContext(AuthContext)
