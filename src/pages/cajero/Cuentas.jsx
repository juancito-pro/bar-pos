import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, Clock, Wallet, Ban, AlertTriangle, Beer } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { money, timeAgo, STATUS_LABEL } from '../../lib/format'
import { useRealtime } from '../../hooks/useRealtime'
import { useCashSession } from '../../hooks/useCashSession'
import { useToast } from '../../components/Toast'
import { Loader, Empty, StatusBadge } from '../../components/ui'
import PaymentModal from '../../components/PaymentModal'

export default function Cuentas() {
  const toast = useToast()
  const { session, loading: loadingCash } = useCashSession()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(null)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, bar_tables(name, number), waiter:profiles!waiter_id(full_name, username), order_items(*)')
      .in('status', ['abierta', 'por_cobrar'])
      .order('created_at')
    // "por cobrar" primero
    const sorted = (data || []).sort((a, b) => (a.status === 'por_cobrar' ? -1 : 0) - (b.status === 'por_cobrar' ? -1 : 0))
    setOrders(sorted)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['orders', 'order_items'], load)

  const cancel = async (o) => {
    if (!confirm(`¿Anular el pedido #${o.id}? Se devolverá el stock.`)) return
    if (o.order_items.length) {
      const { error } = await supabase.from('order_items').delete().eq('order_id', o.id)
      if (error) return toast(errMsg(error), 'error')
    }
    const { error } = await supabase.from('orders').update({ status: 'cancelada' }).eq('id', o.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Pedido anulado')
    load()
  }

  if (loading || loadingCash) return <Loader />

  const shown = orders.filter((o) => filter === 'all' || o.status === filter)
  const porCobrar = orders.filter((o) => o.status === 'por_cobrar').length

  return (
    <>
      {!session && (
        <div className="card mb row" style={{ borderColor: 'hsla(38,96%,62%,.4)', background: 'var(--primary-soft)' }}>
          <AlertTriangle className="tone-primary" />
          <div className="grow">
            <div className="bold">La caja está cerrada</div>
            <div className="small muted">Debes abrir caja para poder cobrar.</div>
          </div>
          <Link to="/caja" className="btn btn-primary btn-sm">Abrir caja</Link>
        </div>
      )}

      <div className="page-head">
        <div className="tabs">
          <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todas ({orders.length})</button>
          <button className={`tab ${filter === 'por_cobrar' ? 'active' : ''}`} onClick={() => setFilter('por_cobrar')}>Por cobrar ({porCobrar})</button>
          <button className={`tab ${filter === 'abierta' ? 'active' : ''}`} onClick={() => setFilter('abierta')}>Abiertas</button>
        </div>
        <div className="muted small">Total abierto: <span className="money" style={{ color: 'var(--text)' }}>{money(orders.reduce((s, o) => s + Number(o.total), 0))}</span></div>
      </div>

      {shown.length === 0 ? (
        <Empty icon={Receipt} title="No hay cuentas abiertas">Las cuentas de las mesas aparecerán aquí en tiempo real.</Empty>
      ) : (
        <div className="orders-grid stagger">
          {shown.map((o) => (
            <div key={o.id} className={`card order-card ${o.status}`} onClick={() => session && o.order_items.length && setPaying(o)}>
              <div className="order-head">
                <div className={`order-badge ${o.status === 'por_cobrar' ? 'bg-accent' : 'bg-primary'}`}>
                  {o.type === 'barra' ? <Beer size={20} /> : o.bar_tables?.number}
                </div>
                <div className="grow">
                  <div className="bold">{o.type === 'barra' ? 'Venta en barra' : o.bar_tables?.name}</div>
                  <div className="xs muted row" style={{ gap: 5 }}>
                    <Clock size={11} /> {timeAgo(o.created_at)} {o.waiter && `· ${o.waiter.full_name || o.waiter.username}`}
                  </div>
                </div>
                <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
              </div>
              <div className="col" style={{ gap: 4 }}>
                {o.order_items.slice(0, 4).map((i) => (
                  <div key={i.id} className="row-between small">
                    <span className="muted truncate">{i.quantity} × {i.product_name}</span>
                    <span>{money(i.quantity * i.unit_price)}</span>
                  </div>
                ))}
                {o.order_items.length > 4 && <div className="xs faint">+ {o.order_items.length - 4} más…</div>}
                {o.order_items.length === 0 && <div className="xs faint">Sin productos</div>}
              </div>
              <div className="row-between" style={{ borderTop: '1px dashed var(--border-strong)', paddingTop: 12 }}>
                <span className="money" style={{ fontSize: 22 }}>{money(o.total)}</span>
                <div className="row" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn sm" title="Anular" onClick={() => cancel(o)}><Ban size={14} /></button>
                  <button className="btn btn-success btn-sm" disabled={!session || !o.order_items.length} onClick={() => setPaying(o)}>
                    <Wallet size={15} /> Cobrar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {paying && (
        <PaymentModal order={paying} items={paying.order_items} onClose={() => { setPaying(null); load() }} onPaid={load} />
      )}
    </>
  )
}
