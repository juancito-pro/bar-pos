import { supabase } from './supabase'
import { triggerWaiterAlert } from './sound'

/**
 * Envía un llamado de mesero o pedido desde el Menú QR
 * Se inserta en la tabla table_calls de Supabase
 */
export async function sendWaiterCall({
  tableId = null,
  tableNumber = 0,
  type = 'llamado',
  items = [],
  total = 0,
  notes = '',
}) {
  const num = Number(tableNumber) || 0
  const payload = {
    table_id: tableId || null,
    table_number: num,
    type,
    items,
    total: Number(total) || 0,
    notes: notes || '',
    status: 'pendiente',
    created_at: new Date().toISOString(),
  }

  try {
    const { data, error } = await supabase
      .from('table_calls')
      .insert(payload)
      .select('*, bar_tables(id, number, name)')
      .single()

    if (error) {
      console.warn('Error al registrar llamado en table_calls:', error.message)
      return { ok: false, error }
    }

    return { ok: true, call: data }
  } catch (err) {
    console.error('Excepción al registrar llamado:', err)
    return { ok: false, error: err }
  }
}

/**
 * Marca un llamado como atendido
 */
export async function markCallAttended(callId, profileId = null) {
  try {
    if (callId) {
      await supabase
        .from('table_calls')
        .update({
          status: 'atendido',
          attended_at: new Date().toISOString(),
          attended_by: profileId || null,
        })
        .eq('id', callId)
    }
    return true
  } catch (e) {
    console.error('Error al marcar atendido:', e)
    return false
  }
}

/**
 * Suscripción segura a llamados de mesero en tiempo real:
 * - Registra TODOS los callbacks ANTES de invocar subscribe() (cumpliendo la regla estricta de Supabase)
 * - Mantiene un sondeo de respaldo cada 4 segundos para máxima confiabilidad
 */
export function subscribeToWaiterCalls(onNewCall, onCallAttended) {
  const seenIds = new Set()

  const handleIncoming = (call) => {
    if (!call) return
    const idKey = String(call.id || `${call.table_number}_${call.created_at}`)
    if (seenIds.has(idKey)) return
    seenIds.add(idKey)

    // Tocar timbre de campana y vibrar
    triggerWaiterAlert()

    if (onNewCall) onNewCall(call)
  }

  // Crear canal con nombre único
  const ch = supabase.channel(`waiter-events-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  // 1. REGISTRAR TODOS LOS EVENTOS ANTES DE SUBSCRIBE
  ch.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'table_calls' },
    (payload) => {
      if (payload.new && payload.new.status === 'pendiente') {
        handleIncoming(payload.new)
      }
    },
  )

  ch.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'table_calls' },
    (payload) => {
      if (payload.new && payload.new.status === 'atendido' && onCallAttended) {
        onCallAttended(payload.new.id)
      }
    },
  )

  // 2. LLAMAR A SUBSCRIBE DESPUÉS DE REGISTRAR LOS CALLBACKS
  ch.subscribe()

  // 3. Sondeo de respaldo cada 4 segundos
  const interval = setInterval(async () => {
    try {
      const { data } = await supabase
        .from('table_calls')
        .select('*')
        .eq('status', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(10)

      if (data && data.length > 0) {
        for (const item of data) {
          const idKey = String(item.id)
          if (!seenIds.has(idKey)) {
            handleIncoming(item)
          }
        }
      }
    } catch {
      // Ignorar errores temporales de conexión
    }
  }, 4000)

  // 4. Limpieza ordenada al desmontar
  return () => {
    clearInterval(interval)
    supabase.removeChannel(ch)
  }
}
