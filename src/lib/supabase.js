import { createClient } from '@supabase/supabase-js'

const envUrl = import.meta.env.VITE_SUPABASE_URL
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const localUrl = typeof window !== 'undefined' ? localStorage.getItem('barpos_supabase_url') : null
const localKey = typeof window !== 'undefined' ? localStorage.getItem('barpos_supabase_key') : null

const url = envUrl && !envUrl.includes('TU-PROYECTO') ? envUrl : localUrl
const key = envKey && !envKey.includes('tu-anon') ? envKey : localKey

export const EMAIL_DOMAIN = import.meta.env.VITE_EMAIL_DOMAIN || 'bar.app'

export const isConfigured = Boolean(url && key && url.startsWith('http'))

export const supabase = isConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export function saveLocalConfig(newUrl, newKey) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('barpos_supabase_url', newUrl.trim())
    localStorage.setItem('barpos_supabase_key', newKey.trim())
    window.location.reload()
  }
}

export function clearLocalConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('barpos_supabase_url')
    localStorage.removeItem('barpos_supabase_key')
    window.location.reload()
  }
}

/** Convierte "juan" en "juan@bar.app". Si ya es un correo, lo deja igual. */
export function toEmail(userOrEmail) {
  const v = userOrEmail.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${EMAIL_DOMAIN}`
}

/**
 * Cliente aislado (sin guardar sesión) para que el administrador cree
 * usuarios nuevos sin cerrar su propia sesión actual.
 */
export function createIsolatedClient() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'barpos-signup' },
  })
}

/** Traduce errores comunes de Supabase al español */
export function errMsg(error) {
  const m = error?.message || String(error || 'Error desconocido')
  if (m.includes('Invalid login credentials')) return 'Usuario o contraseña incorrectos'
  if (m.includes('Email not confirmed')) return 'Cuenta sin confirmar. En Supabase > Authentication > Providers > Email, desactiva "Confirm email".'
  if (m.includes('User already registered')) return 'Ese usuario ya existe'
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres'
  if (m.includes('uq_open_order_per_table')) return 'Esta mesa ya tiene una cuenta abierta'
  if (m.includes('row-level security')) return 'No tienes permiso para esta acción'
  if (m.includes('Failed to fetch')) return 'Error de conexión con Supabase. Revisa tu URL y conexión a internet.'
  return m
}
