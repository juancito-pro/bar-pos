import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, ChefHat, BellRing, ClipboardList } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { timeAgo } from '../../lib/format'
import { useRealtime } from '../../hooks/useRealtime'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { Loader, Empty } from '../../components/ui'

export default function MisPedidos() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('order_items')
      .select('*, orders!inner(id, status, waiter_id, table_id, bar_tables(name, number))')
      .eq('orders.waiter_id', profile.id)
      .in('orders.status', ['abierta', 'por_cobrar'])
      .neq('status', 'entregado')
      .order('created_at')
    setItems(data || [])
    setLoading(false)
  }, [profile.id])

  useEffect(() => { load() }, [load])
  useRealtime(['order_items', 'orders'], load)

  const deliver = async (ids) => {
    const { error } = await supabase.from('order_items').update({ status: 'entregado' }).in('id', ids)
    if (error) return toast(errMsg(error), 'error')
    toast('¡Entregado!')
    load()
  }

  if (loading) return <Loader />

  const ready = items.filter((i) => i.status === 'listo')
  const pending = items.filter((i) => i.status === 'pendiente')

  const group = (list) =>
    Object.values(
      list.reduce((acc, i) => {
        const k = i.orders.id
        acc[k] = acc[k] || { order: i.orders, items: [] }
        acc[k].items.push(i)
        return acc
      }, {}),
    )

  const Section = ({ title, icon: Icon, tone, list, action }) => (
    <section className="mb">
      <div className="row mb" style={{ marginBottom: 10 }}>
        <Icon size={18} className={`tone-${tone}`} />
        <h3 style={{ fontSize: 17 }}>{title}</h3>
        <span className={`badge bg-${tone}`}>{list.length}</span>
      </div>
      <div className="col stagger">
        {group(list).map(({ order, items: its }) => (
          <div key={order.id} className="card" style={{ padding: 16 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <button className="row" onClick={() => navigate(`/mesas/${order.table_id}`)}>
                <div className={`order-badge bg-${tone}`} style={{ width: 40, height: 40, fontSize: 17 }}>
                  {order.bar_tables?.number ?? '—'}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div className="bold">{order.bar_tables?.name || 'Mesa'}</div>
                  <div className="xs muted">Pedido #{order.id}</div>
                </div>
              </button>
              {action && (
                <button className="btn btn-success btn-sm" onClick={() => deliver(its.map((i) => i.id))}>
                  <CheckCheck size={15} /> Entregar
                </button>
              )}
            </div>
            {its.map((i) => (
              <div key={i.id} className="item-row" style={{ padding: '8px 0' }}>
                <div className="item-qty" style={{ width: 30, height: 30 }}>{i.quantity}</div>
                <div className="grow">
                  <div className="small bold">{i.product_name}</div>
                  {i.notes && <div className="xs tone-primary">{i.notes}</div>}
                </div>
                <span className="xs faint">{timeAgo(i.created_at)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )

  if (items.length === 0)
    return <Empty icon={ClipboardList} title="Todo entregado 🎉">No tienes productos pendientes en tus mesas.</Empty>

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {ready.length > 0 && <Section title="Listos para llevar" icon={BellRing} tone="success" list={ready} action />}
      {pending.length > 0 && <Section title="En preparación" icon={ChefHat} tone="primary" list={pending} />}
    </div>
  )
}
