import { supabase } from './supabase'
import { triggerWaiterAlert } from './sound'

const BROADCAST_CHANNEL = 'waiter-live-alerts'

// Canal único compartido para broadcast en tiempo real
let alertChannel = null

export function getAlertChannel() {
  if (!alertChannel) {
    alertChannel = supabase.channel(BROADCAST_CHANNEL, {
      config: { broadcast: { self: false } },
    })
    alertChannel.subscribe()
  }
  return alertChannel
}

/**
 * Envía un llamado de mesero o pedido preliminar desde el Menú QR
 * Se envía a la tabla de base de datos Y por canal broadcast para redundancia instantánea
 */
export async function sendWaiterCall({
  tableId = null,
  tableNumber = 0,
  type = 'llamado',
  items = [],
  total = 0,
  notes = '',
}) {
  const payload = {
    table_id: tableId || null,
    table_number: Number(tableNumber) || 0,
    type,
    items,
    total: Number(total) || 0,
    notes: notes || '',
    status: 'pendiente',
    created_at: new Date().toISOString(),
  }

  // 1. Emitir vía Broadcast en tiempo real (llega en milisegundos a todos los meseros conectados)
  try {
    const ch = getAlertChannel()
    ch.send({
      type: 'broadcast',
      event: 'waiter_call',
      payload: { ...payload, tempId: `call_${Date.now()}` },
    }).catch(() => {})
  } catch (err) {
    console.warn('Error emitiendo broadcast:', err)
  }

  // 2. Insertar en la tabla table_calls de Supabase
  try {
    const { data, error } = await supabase
      .from('table_calls')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.warn('Nota: table_calls aún no está en Supabase o falló:', error.message)
      // Aunque falle la tabla (si el usuario aún no ejecutó la migración SQL),
      // el broadcast ya avisó a los meseros conectados.
      return { ok: true, offlineOnly: true, call: payload }
    }

    return { ok: true, call: data }
  } catch (err) {
    console.warn('Excepción al registrar llamado:', err)
    return { ok: true, offlineOnly: true, call: payload }
  }
}

/**
 * Marca un llamado como atendido
 */
export async function markCallAttended(callId, profileId = null) {
  try {
    // 1. Notificar por broadcast para cerrar la alerta en todos los meseros
    const ch = getAlertChannel()
    ch.send({
      type: 'broadcast',
      event: 'call_attended',
      payload: { id: callId },
    }).catch(() => {})

    // 2. Actualizar en base de datos
    if (callId && typeof callId === 'number') {
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
 * Escucha llamados de mesero entrantes (por broadcast y por postgres_changes)
 */
export function subscribeToWaiterCalls(onNewCall, onCallAttended) {
  const seenIds = new Set()

  const handleIncoming = (call) => {
    const identifier = call.id || call.tempId || `${call.table_number}-${call.created_at}`
    if (seenIds.has(identifier)) return
    seenIds.add(identifier)

    // Disparar sonido de campana y vibración
    triggerWaiterAlert()

    if (onNewCall) onNewCall(call)
  }

  const ch = supabase.channel(`waiter-listener-${Math.random().toString(36).slice(2)}`)

  // Escuchar por broadcast instantáneo
  ch.on('broadcast', { event: 'waiter_call' }, (evt) => {
    if (evt.payload) handleIncoming(evt.payload)
  })

  // Escuchar cuando otro mesero atienda
  ch.on('broadcast', { event: 'call_attended' }, (evt) => {
    if (onCallAttended && evt.payload?.id) onCallAttended(evt.payload.id)
  })

  // Escuchar cambios directos en la tabla table_calls
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

  ch.subscribe()

  return () => {
    supabase.removeChannel(ch)
  }
}
