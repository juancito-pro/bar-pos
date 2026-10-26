import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, ExternalLink, X, UtensilsCrossed } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { subscribeToWaiterCalls, markCallAttended } from '../lib/waiterCalls'
import { money, timeAgo } from '../lib/format'
import { useAuth } from '../context/AuthContext'

export default function WaiterAlertBanner() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [calls, setCalls] = useState([])
  const [latestAlert, setLatestAlert] = useState(null)

  // Cargar llamados pendientes iniciales desde la base de datos
  const loadPendingCalls = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('table_calls')
        .select('*, bar_tables(id, number, name)')
        .eq('status', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(10)

      if (!error && data) {
        setCalls(data)
      }
    } catch {
      // Si la tabla aún no existe, no rompe la interfaz
    }
  }, [])

  useEffect(() => {
    loadPendingCalls()

    // Suscripción en tiempo real (por broadcast y por postgres_changes)
    const unsubscribe = subscribeToWaiterCalls(
      (newCall) => {
        setCalls((prev) => {
          const exists = prev.some((c) => (c.id && c.id === newCall.id) || (c.tempId && c.tempId === newCall.tempId))
          if (exists) return prev
          return [newCall, ...prev]
        })
        setLatestAlert(newCall)
      },
      (attendedId) => {
        setCalls((prev) => prev.filter((c) => c.id !== attendedId))
        setLatestAlert((cur) => (cur?.id === attendedId ? null : cur))
      },
    )

    return () => {
      unsubscribe()
    }
  }, [loadPendingCalls])

  const handleAttend = async (call) => {
    const callId = call.id
    setCalls((prev) => prev.filter((c) => c !== call && c.id !== callId))
    if (latestAlert === call || latestAlert?.id === callId) {
      setLatestAlert(null)
    }
    await markCallAttended(callId, profile?.id)
  }

  const handleGoToTable = (call) => {
    if (call.table_id) {
      navigate(`/mesas/${call.table_id}`)
    } else {
      navigate('/mesas')
    }
    setLatestAlert(null)
  }

  return (
    <>
      {/* 1. Alerta Flotante Emergente al recibir un nuevo llamado */}
      {latestAlert && (
        <aside className="waiter-alert-toast" role="alert" aria-live="assertive">
          <div className="row-between">
            <div className="row" style={{ gap: 8 }}>
              <span className="waiter-banner-pill">
                <Bell size={16} className="bell-shake" />
                ¡Llamado de Mesa #{latestAlert.table_number || 'General'}!
              </span>
              <span className="xs muted">{timeAgo(latestAlert.created_at)}</span>
            </div>
            <button
              className="icon-btn sm"
              onClick={() => setLatestAlert(null)}
              title="Cerrar notificación"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          <div>
            {latestAlert.items && latestAlert.items.length > 0 ? (
              <div className="col gap-xs mt-xs">
                <div className="xs bold tone-primary row" style={{ gap: 6 }}>
                  <UtensilsCrossed size={14} /> Bebidas solicitadas ({latestAlert.items.length}):
                </div>
                <div
                  style={{
                    maxHeight: 90,
                    overflowY: 'auto',
                    background: 'var(--surface-2)',
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  {latestAlert.items.map((item, idx) => (
                    <div key={idx} className="row-between">
                      <span>• {item.qty}x {item.name}</span>
                      <span className="money faint">{money(item.price * item.qty)}</span>
                    </div>
                  ))}
                </div>
                {latestAlert.total > 0 && (
                  <div className="row-between xs bold mt-xs">
                    <span>Total estimado:</span>
                    <span className="money tone-primary">{money(latestAlert.total)}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="small muted mt-xs" style={{ margin: 0 }}>
                El cliente solicita atención inmediata en la <strong>Mesa #{latestAlert.table_number || 'General'}</strong>.
              </p>
            )}
          </div>

          <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
            <button
              className="btn btn-primary btn-sm grow"
              onClick={() => handleGoToTable(latestAlert)}
            >
              <ExternalLink size={15} /> Ver Mesa #{latestAlert.table_number}
            </button>
            <button
              className="btn btn-success btn-sm grow"
              onClick={() => handleAttend(latestAlert)}
            >
              <Check size={15} /> Marcar Atendido
            </button>
          </div>
        </aside>
      )}

      {/* 2. Barra de llamado persistente si hay mesas pendientes esperando */}
      {calls.length > 0 && !latestAlert && (
        <div
          className="table-calls-dock row-between wrap"
          style={{
            animation: 'slideDownIn .25s ease',
            margin: '0 0 16px 0',
          }}
        >
          <div className="row" style={{ gap: 10 }}>
            <span className="waiter-banner-pill">
              <Bell size={15} className="bell-shake" />
              {calls.length} {calls.length === 1 ? 'mesa esperando atención' : 'mesas esperando atención'}
            </span>
            <span className="small bold">
              {calls.map((c) => `Mesa #${c.table_number}`).join(', ')}
            </span>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => handleGoToTable(calls[0])}
            >
              Atender Mesa #{calls[0].table_number}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => handleAttend(calls[0])}
              title="Marcar como atendida la primera mesa"
            >
              <Check size={14} /> Listo
            </button>
          </div>
        </div>
      )}
    </>
  )
}
