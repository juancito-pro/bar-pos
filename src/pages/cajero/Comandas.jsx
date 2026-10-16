import { useCallback, useEffect, useState } from 'react'
import { ChefHat, Check, CheckCheck, Clock, Beer } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { timeAgo } from '../../lib/format'
import { useRealtime } from '../../hooks/useRealtime'
import { useToast } from '../../components/Toast'
import { Loader, Empty } from '../../components/ui'

/** Pantalla de barra/cocina: productos pendientes de preparar */
export default function Comandas() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [, tick] = useState(0)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('order_items')
      .select('*, orders!inner(id, status, type, bar_tables(name, number), waiter:profiles!waiter_id(full_name, username))')
      .eq('status', 'pendiente')
      .in('orders.status', ['abierta', 'por_cobrar'])
      .order('created_at')
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['order_items', 'orders'], load)
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(i)
  }, [])

  const markReady = async (ids) => {
    setItems((list) => list.filter((i) => !ids.includes(i.id)))
    const { error } = await supabase.from('order_items').update({ status: 'listo' }).in('id', ids)
    if (error) {
      toast(errMsg(error), 'error')
      load()
    } else toast('Listo para servir ✅')
  }

  if (loading) return <Loader />
  if (items.length === 0) return <Empty icon={ChefHat} title="Sin comandas pendientes">Los pedidos de los meseros aparecerán aquí al instante.</Empty>

  const groups = Object.values(
    items.reduce((acc, i) => {
      const k = i.orders.id
      acc[k] = acc[k] || { order: i.orders, items: [], first: i.created_at }
      acc[k].items.push(i)
      return acc
    }, {}),
  )

  const minutes = (d) => Math.floor((Date.now() - new Date(d)) / 60000)

  return (
    <div className="orders-grid stagger">
      {groups.map(({ order, items: its, first }) => {
        const late = minutes(first) >= 15
        return (
          <div key={order.id} className="card col" style={late ? { borderColor: 'hsla(355,85%,64%,.5)' } : undefined}>
            <div className="order-head">
              <div className={`order-badge ${late ? 'bg-danger' : 'bg-primary'}`}>
                {order.type === 'barra' ? <Beer size={20} /> : order.bar_tables?.number}
              </div>
              <div className="grow">
                <div className="bold">{order.type === 'barra' ? 'Barra' : order.bar_tables?.name}</div>
                <div className="xs muted">{order.waiter?.full_name || order.waiter?.username || '—'} · #{order.id}</div>
              </div>
              <span className={`badge ${late ? 'cancelada' : 'pendiente'}`} style={late ? { color: 'var(--danger)', background: 'var(--danger-soft)' } : undefined}>
                <Clock size={11} /> {timeAgo(first)}
              </span>
            </div>
            <div className="items-list">
              {its.map((i) => (
                <div key={i.id} className="item-row" style={{ padding: '10px 0' }}>
                  <div className="item-qty">{i.quantity}</div>
                  <div className="grow">
                    <div className="bold">{i.product_name}</div>
                    {i.notes && <div className="xs tone-primary">📝 {i.notes}</div>}
                  </div>
                  <button className="icon-btn" title="Listo" onClick={() => markReady([i.id])}><Check size={16} /></button>
                </div>
              ))}
            </div>
            <button className="btn btn-success btn-block" onClick={() => markReady(its.map((i) => i.id))}>
              <CheckCheck size={17} /> Todo listo
            </button>
          </div>
        )
      })}
    </div>
  )
}
