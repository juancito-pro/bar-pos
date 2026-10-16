import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Se suscribe a cambios en tiempo real de una o varias tablas y
 * ejecuta `onChange` (con debounce) cuando algo cambia.
 */
export function useRealtime(tables, onChange, delay = 250) {
  const cb = useRef(onChange)
  cb.current = onChange
  const key = tables.join(',')

  useEffect(() => {
    let timer
    const fire = () => {
      clearTimeout(timer)
      timer = setTimeout(() => cb.current?.(), delay)
    }
    const channel = supabase.channel(`rt-${key}-${Math.random().toString(36).slice(2)}`)
    key.split(',').forEach((table) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire),
    )
    channel.subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [key, delay])
}
