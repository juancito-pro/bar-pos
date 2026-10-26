import { supabase } from './supabase'
import { triggerWaiterAlert } from './sound'

export const WAITER_CHANNEL_NAME = 'waiter-live-alerts'

let sharedChannel = null

/**
 * Obtiene o crea el canal de comunicación en tiempo real
 * Ambos lados (emisor QR y receptor mesero) usan el MISMO canal
 */
export function getSharedAlertChannel() {
  if (!sharedChannel) {
    sharedChannel = supabase.channel(WAITER_CHANNEL_NAME, {
      config: {
        broadcast: {
          self: true, // Permite recibir el evento en la misma máquina/pestaña al probar
        },
      },
    })
    sharedChannel.subscribe((status) => {
      console.log(`[Canal Mesero] Estado de suscripción: ${status}`)
    })
  }
  return sharedChannel
}

/**
 * Envía un llamado de mesero o pedido desde el Menú QR
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

  // 1. Insertar en la base de datos Supabase
  let savedCall = null
  try {
    const { data, error } = await supabase
      .from('table_calls')
      .insert(payload)
      .select('*, bar_tables(id, number, name)')
      .single()

    if (!error && data) {
      savedCall = data
    } else if (error) {
      console.warn('Error al insertar table_calls:', error.message)
    }
  } catch (err) {
    console.warn('Excepción al insertar en BD:', err)
  }

  // Objeto final que se emitirá
  const finalCall = savedCall || {
    ...payload,
    id: `temp_${Date.now()}`,
  }

  // 2. Emitir vía Broadcast en tiempo real (mismo canal para todos)
  try {
    const ch = getSharedAlertChannel()
    await ch.send({
      type: 'broadcast',
      event: 'waiter_call',
      payload: finalCall,
    })
  } catch (err) {
    console.warn('Error emitiendo broadcast:', err)
  }

  return { ok: true, call: finalCall }
}

/**
 * Marca un llamado como atendido
 */
export async function markCallAttended(callId, profileId = null) {
  try {
    // 1. Notificar por broadcast a todos los meseros
    const ch = getSharedAlertChannel()
    ch.send({
      type: 'broadcast',
      event: 'call_attended',
      payload: { id: callId },
    }).catch(() => {})

    // 2. Actualizar en la base de datos
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
 * Suscripción ultra-robusta a llamados de mesero:
 * 1. Broadcast en tiempo real (canal común 'waiter-live-alerts')
 * 2. Eventos postgres_changes en la tabla 'table_calls'
 * 3. Polling de respaldo cada 5 segundos para máxima confiabilidad
 */
export function subscribeToWaiterCalls(onNewCall, onCallAttended) {
  const seenIds = new Set()

  const handleIncoming = (call, playAlert = true) => {
    if (!call) return
    const idKey = String(call.id || `${call.table_number}_${call.created_at}`)
    if (seenIds.has(idKey)) return
    seenIds.add(idKey)

    if (playAlert) {
      triggerWaiterAlert()
    }

    if (onNewCall) onNewCall(call)
  }

  const ch = getSharedAlertChannel()

  // Escuchar Broadcast directo
  ch.on('broadcast', { event: 'waiter_call' }, (evt) => {
    if (evt.payload) {
      console.log('[Canal Mesero] Broadcast recibido:', evt.payload)
      handleIncoming(evt.payload, true)
    }
  })

  // Escuchar cuando se atiende
  ch.on('broadcast', { event: 'call_attended' }, (evt) => {
    if (onCallAttended && evt.payload?.id) {
      onCallAttended(evt.payload.id)
    }
  })

  // Escuchar INSERT en Postgres
  ch.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'table_calls' },
    (payload) => {
      if (payload.new && payload.new.status === 'pendiente') {
        console.log('[Canal Mesero] Postgres INSERT recibido:', payload.new)
        handleIncoming(payload.new, true)
      }
    },
  )

  // Escuchar UPDATE en Postgres
  ch.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'table_calls' },
    (payload) => {
      if (payload.new && payload.new.status === 'atendido' && onCallAttended) {
        onCallAttended(payload.new.id)
      }
    },
  )

  // Polling de respaldo cada 5 segundos
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
            console.log('[Canal Mesero] Polling detectó nuevo llamado:', item)
            handleIncoming(item, true)
          }
        }
      }
    } catch {
      // Ignorar errores en sondeo
    }
  }, 5000)

  return () => {
    clearInterval(interval)
  }
}
