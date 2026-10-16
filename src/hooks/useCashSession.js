import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/** Devuelve la sesión de caja abierta del usuario actual */
export function useCashSession() {
  const { profile } = useAuth()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('cashier_id', profile.id)
      .eq('status', 'abierta')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSession(data)
    setLoading(false)
    return data
  }, [profile.id])

  useEffect(() => { reload() }, [reload])
  return { session, loading, reload }
}
