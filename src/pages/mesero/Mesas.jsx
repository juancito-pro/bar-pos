import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Users, Clock, Plus, QrCode } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { money, timeAgo } from '../../lib/format'
import { useRealtime } from '../../hooks/useRealtime'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { Loader, Empty } from '../../components/ui'
import Modal from '../../components/Modal'
import QrMenuModal from '../../components/QrMenuModal'

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'libre', label: 'Libres' },
  { key: 'ocupada', label: 'Ocupadas' },
  { key: 'por_cobrar', label: 'Por cobrar' },
  { key: 'mine', label: 'Mis mesas' },
]

export default function Mesas() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)

  const [filter, setFilter] = useState('all')
  const [showAddTable, setShowAddTable] = useState(false)
  const [newTable, setNewTable] = useState({ number: '', name: '', capacity: 4 })
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrTable, setQrTable] = useState(null)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)

  const load = useCallback(async () => {
    try {
      const [t, o, c] = await Promise.all([
        supabase.from('bar_tables').select('*').eq('active', true).order('number'),
        supabase
          .from('orders')
          .select('id, table_id, status, total, created_at, waiter_id, waiter:profiles!waiter_id(full_name, username), order_items(status, quantity)')
          .in('status', ['abierta', 'por_cobrar'])
          .eq('type', 'mesa'),
        supabase
          .from('table_calls')
          .select('*')
          .eq('status', 'pendiente')
          .order('created_at', { ascending: false })
          .catch(() => ({ data: [] })),
      ])
      setTables(t.data || [])
      setOrders(o.data || [])
      setCalls(c?.data || [])
    } catch {
      // Manejo seguro
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['orders', 'order_items', 'bar_tables', 'table_calls'], load)

  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 60000)
    return () => clearInterval(i)
  }, [])

  const handleCreateTable = async (e) => {
    e.preventDefault()
    setBusy(true)
    const num = Number(newTable.number)
    const { error } = await supabase.from('bar_tables').insert({
      number: num,
      name: newTable.name.trim() || `Mesa ${num}`,
      capacity: Number(newTable.capacity) || 4,
      active: true,
    })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`Mesa ${num} agregada con éxito`)
    setShowAddTable(false)
    setNewTable({ number: '', name: '', capacity: 4 })
    load()
  }

  const byTable = useMemo(() => Object.fromEntries(orders.map((o) => [o.table_id, o])), [orders])

  const callsByTable = useMemo(() => {
    const map = {}
    for (const c of calls) {
      if (c.table_id) map[c.table_id] = c
      else if (c.table_number) {
        const match = tables.find((t) => t.number === c.table_number)
        if (match) map[match.id] = c
      }
    }
    return map
  }, [calls, tables])

  const enriched = tables.map((t) => {
    const o = byTable[t.id]
    const state = !o ? 'libre' : o.status === 'por_cobrar' ? 'por_cobrar' : 'ocupada'
    const call = callsByTable[t.id]
    return { ...t, order: o, state, call }
  })


  const shown = enriched.filter((t) =>
    filter === 'all' ? true : filter === 'mine' ? t.order?.waiter_id === profile.id : t.state === filter,
  )

  const counts = {
    libre: enriched.filter((t) => t.state === 'libre').length,
    ocupada: enriched.filter((t) => t.state === 'ocupada').length,
    por_cobrar: enriched.filter((t) => t.state === 'por_cobrar').length,
  }

  if (loading) return <Loader />

  return (
    <>
      <div className="grid grid-3 keep-2 mb" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div className="card center" style={{ padding: 12 }}>
          <div className="money tone-success" style={{ fontSize: 24 }}>{counts.libre}</div>
          <div className="xs muted">Libres</div>
        </div>
        <div className="card center" style={{ padding: 12 }}>
          <div className="money tone-primary" style={{ fontSize: 24 }}>{counts.ocupada}</div>
          <div className="xs muted">Ocupadas</div>
        </div>
        <div className="card center" style={{ padding: 12 }}>
          <div className="money tone-accent" style={{ fontSize: 24 }}>{counts.por_cobrar}</div>
          <div className="xs muted">Por cobrar</div>
        </div>
      </div>

      <div className="row-between mb">
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button
            className="btn btn-sm"
            onClick={() => {
              setQrTable(null)
              setShowQrModal(true)
            }}
          >
            <QrCode size={15} /> QR de Mesas
          </button>
          {profile.role === 'admin' && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                const nextNum = (tables.length ? Math.max(...tables.map((t) => t.number)) : 0) + 1
                setNewTable({ number: nextNum, name: `Mesa ${nextNum}`, capacity: 4 })
                setShowAddTable(true)
              }}
            >
              <Plus size={15} /> Nueva Mesa
            </button>
          )}
        </div>
      </div>

      {tables.length === 0 ? (
        <Empty title="No hay mesas registradas">
          {profile.role === 'admin' ? (
            <button className="btn btn-primary btn-sm mt" onClick={() => setShowAddTable(true)}>
              <Plus size={16} /> Crear la primera mesa
            </button>
          ) : (
            'El administrador debe crear las mesas.'
          )}
        </Empty>
      ) : shown.length === 0 ? (
        <Empty title="Nada por aquí">No hay mesas con este filtro.</Empty>
      ) : (
        <div className="tables-grid stagger">
          {shown.map((t) => {
            const ready = t.order?.order_items?.filter((i) => i.status === 'listo').length || 0
            const qty = t.order?.order_items?.reduce((s, i) => s + i.quantity, 0) || 0
            const isCalling = Boolean(t.call)
            return (
              <button
                key={t.id}
                id={`mesa-${t.number}`}
                className={`table-card ${t.state} ${isCalling ? 'calling' : ''}`}
                onClick={() => navigate(`/mesas/${t.id}`)}
              >
                {isCalling ? (
                  <span
                    className="badge listo t-ready"
                    style={{ background: '#eab308', color: '#111', fontWeight: 800 }}
                  >
                    <Bell size={12} className="bell-shake" /> ¡Llamando! {t.call.items?.length > 0 ? `(${t.call.items.length})` : ''}
                  </span>
                ) : ready > 0 ? (
                  <span className="badge listo t-ready"><Bell size={12} /> {ready} listo{ready > 1 ? 's' : ''}</span>
                ) : null}
                <span className="t-state">{t.state === 'libre' ? 'Libre' : t.state === 'por_cobrar' ? 'Pidió cuenta' : 'Ocupada'}</span>
                <span className="t-num">{t.number}</span>

                {t.order ? (
                  <>
                    <span className="xs muted row" style={{ gap: 5 }}>
                      <Clock size={12} /> {timeAgo(t.order.created_at)} · {qty} prod.
                    </span>
                    <span className="xs faint truncate">{t.order.waiter?.full_name || t.order.waiter?.username}</span>
                    <span className="t-total">{money(t.order.total)}</span>
                  </>
                ) : (
                  <span className="xs muted row" style={{ gap: 5, marginTop: 'auto' }}>
                    <Users size={12} /> {t.capacity} personas
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {showAddTable && (
        <Modal
          title="Agregar Nueva Mesa"
          onClose={() => setShowAddTable(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowAddTable(false)}>Cancelar</button>
              <button className="btn btn-primary" form="table-form" disabled={busy}>
                {busy ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : 'Crear Mesa'}
              </button>
            </>
          }
        >
          <form id="table-form" onSubmit={handleCreateTable} className="col gap-lg">
            <div className="field">
              <label>Número de Mesa *</label>
              <input
                className="input"
                type="number"
                min="1"
                required
                value={newTable.number}
                onChange={(e) => setNewTable({ ...newTable, number: e.target.value })}
                autoFocus
              />
            </div>
            <div className="field">
              <label>Nombre / Identificador</label>
              <input
                className="input"
                placeholder="ej. Mesa 1, Terraza A, VIP 2"
                value={newTable.name}
                onChange={(e) => setNewTable({ ...newTable, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Capacidad (personas)</label>
              <input
                className="input"
                type="number"
                min="1"
                value={newTable.capacity}
                onChange={(e) => setNewTable({ ...newTable, capacity: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      )}

      {showQrModal && (
        <QrMenuModal
          defaultTable={qrTable}
          onClose={() => {
            setShowQrModal(false)
            setQrTable(null)
          }}
        />
      )}
    </>
  )
}
