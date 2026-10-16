import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, isConfigured, toEmail, errMsg } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(isConfigured ? undefined : null) // undefined = cargando
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(Boolean(isConfigured))

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userKey = session === undefined ? 'init' : session?.user?.id ?? 'none'

  const loadProfile = useCallback(async (uid) => {
    if (!supabase) return null
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data)
    return data
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    if (userKey === 'init') return
    if (userKey === 'none') {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    loadProfile(userKey).finally(() => setLoading(false))
  }, [userKey, loadProfile])

  const signIn = async (user, password) => {
    if (!supabase) throw new Error('Supabase no está configurado')
    const { data, error } = await supabase.auth.signInWithPassword({ email: toEmail(user), password })
    if (error) throw new Error(errMsg(error))
    const p = await loadProfile(data.user.id)
    if (!p || !p.active) {
      await supabase.auth.signOut()
      throw new Error('Tu cuenta está desactivada o pendiente de activación. Contacta al administrador.')
    }
    return p
  }

  const signOut = () => {
    if (supabase) supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, isConfigured }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
