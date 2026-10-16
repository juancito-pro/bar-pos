import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Send, Receipt, Trash2, CheckCheck, RotateCcw, Ban, Wallet, Clock } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { money, timeAgo, fmtTime, STATUS_LABEL } from '../../lib/format'
import { useRealtime } from '../../hooks/useRealtime'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { Loader, Empty, StatusBadge } from '../../components/ui'
import ProductPicker from '../../components/ProductPicker'
import PaymentModal from '../../components/PaymentModal'

export default function MesaPedido() {
  const { id } = useParams()
  const tableId = Number(id)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const toast = useToast()
  const [table, setTable] = useState(null)
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [paying, setPaying] = useState(false)
  const canCharge = ['admin', 'cajero'].includes(profile.role)

  const load = useCallback(async () => {
    const [t, o] = await Promise.all([
      supabase.from('bar_tables').select('*').eq('id', tableId).single(),
      supabase
        .from('orders')
        .select('*, bar_tables(name, number), waiter:profiles!waiter_id(full_name, username)')
        .eq('table_id', tableId)
        .in('status', ['abierta', 'por_cobrar'])
        .maybeSingle(),
    ])
    setTable(t.data)
    setOrder(o.data)
    if (o.data) {
      const { data } = await supabase.from('order_items').select('*').eq('order_id', o.data.id).order('created_at')
      setItems(data || [])
    } else setItems([])
    setLoading(false)
  }, [tableId])

  useEffect(() => { load() }, [load])
  useRealtime(['orders', 'order_items'], load)

  const sendItems = async (cart) => {
    setBusy(true)
    try {
      let current = order
      if (!current) {
        const { data, error } = await supabase
          .from('orders')
          .insert({ table_id: tableId, waiter_id: profile.id, type: 'mesa' })
          .select()
          .single()
        if (error) throw error
        current = data
      }
      const rows = cart.map(({ product, qty, notes }) => ({
        order_id: current.id,
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity: qty,
        notes: notes || null,
      }))
      const { error } = await supabase.from('order_items').insert(rows)
      if (error) throw error
      if (current.status === 'por_cobrar') await supabase.from('orders').update({ status: 'abierta' }).eq('id', current.id)
      toast('Pedido enviado a barra 🍻')
      setAdding(false)
      await load()
      return true
    } catch (e) {
      toast(errMsg(e), 'error')
      await load()
      return false
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (status, msg) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id)
    if (error) return toast(errMsg(error), 'error')
    toast(msg)
    if (status === 'cancelada') navigate('/mesas')
    else load()
  }

  const deliver = async (itemIds) => {
    const { error } = await supabase.from('order_items').update({ status: 'entregado' }).in('id', itemIds)
    if (error) return toast(errMsg(error), 'error')
    toast('Marcado como entregado')
    load()
  }

  const removeItem = async (item) => {
    if (!confirm(`¿Quitar ${item.quantity} x ${item.product_name}?`)) return
    const { error } = await supabase.from('order_items').delete().eq('id', item.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Producto quitado')
    load()
  }

  if (loading) return <Loader />
  if (!table) return <Empty title="Mesa no encontrada" />

  const status = order ? order.status : 'libre'
  const ready = items.filter((i) => i.status === 'listo')
  const canDelete = (i) =>
    canCharge || (i.status === 'pendiente' && i.created_by === profile.id)

  if (adding) {
    return (
      <>
        <div className="row mb">
          <button className="icon-btn" onClick={() => setAdding(false)} aria-label="Volver"><ArrowLeft size={18} /></button>
          <div>
            <h2 style={{ fontSize: 20 }}>Agregar a {table.name || `Mesa ${table.number}`}</h2>
            <div className="xs muted">Selecciona los productos y envía el pedido</div>
          </div>
        </div>
        <ProductPicker title={`Nuevo pedido · Mesa ${table.number}`} confirmLabel="Enviar" confirmIcon={Send} busy={busy} onConfirm={sendItems} />
      </>
    )
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="row-between mb">
        <div className="row">
          <button className="icon-btn" onClick={() => navigate('/mesas')} aria-label="Volver"><ArrowLeft size={18} /></button>
          <div>
            <h2 style={{ fontSize: 24 }}>{table.name || `Mesa ${table.number}`}</h2>
            {order && (
              <div className="xs muted row" style={{ gap: 6 }}>
                <Clock size={12} /> Abierta {timeAgo(order.created_at)} · {order.waiter?.full_name || order.waiter?.username}
              </div>
            )}
          </div>
        </div>
        {order ? <StatusBadge status={order.status} label={STATUS_LABEL[order.status]} /> : <span className="badge listo"><span className="dot" />Libre</span>}
      </div>

      {ready.length > 0 && (
        <div className="card mb" style={{ borderColor: 'hsla(152,62%,52%,.4)', background: 'var(--success-soft)' }}>
          <div className="row-between">
            <div>
              <div className="bold tone-success">🔔 {ready.length} producto(s) listos para llevar</div>
              <div className="xs muted">{ready.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')}</div>
            </div>
            <button className="btn btn-success btn-sm" onClick={() => deliver(ready.map((i) => i.id))}>
              <CheckCheck size={16} /> Entregados
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {!order || items.length === 0 ? (
          <Empty icon={Receipt} title={order ? 'Pedido sin productos' : 'Mesa libre'}>
            Toca <b>Agregar productos</b> para tomar el pedido.
          </Empty>
        ) : (
          <div className="items-list">
            {items.map((i) => (
              <div key={i.id} className="item-row">
                <div className="item-qty">{i.quantity}</div>
                <div className="grow">
                  <div className="bold">{i.product_name}</div>
                  <div className="xs muted">
                    {money(i.unit_price)} c/u · {fmtTime(i.created_at)}
                    {i.notes && <span className="tone-primary"> · {i.notes}</span>}
                  </div>
                </div>
                <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                  <span className="money">{money(i.quantity * i.unit_price)}</span>
                  <StatusBadge status={i.status} label={STATUS_LABEL[i.status]} />
                </div>
                {canDelete(i) && (
                  <button className="icon-btn sm" onClick={() => removeItem(i)} aria-label="Quitar"><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>
        )}

        {order && (
          <div className="cart-total" style={{ marginTop: 8 }}>
            <span className="muted">Total</span>
            <span className="money grad-text" style={{ fontSize: 30 }}>{money(order.total)}</span>
          </div>
        )}
      </div>

      <div className="col mt">
        <button id="btn-add-products" className="btn btn-primary btn-lg btn-block" onClick={() => setAdding(true)}>
          <Plus size={20} /> Agregar productos
        </button>
        {order && items.length > 0 && status === 'abierta' && (
          <button id="btn-request-bill" className="btn btn-lg btn-block" onClick={() => setStatus('por_cobrar', 'Cuenta enviada a caja 💸')}>
            <Receipt size={19} /> Pedir cuenta (enviar a caja)
          </button>
        )}
        {status === 'por_cobrar' && (
          <button className="btn btn-lg btn-block" onClick={() => setStatus('abierta', 'Cuenta reabierta')}>
            <RotateCcw size={18} /> Reabrir cuenta
          </button>
        )}
        {order && canCharge && items.length > 0 && (
          <button className="btn btn-success btn-lg btn-block" onClick={() => setPaying(true)}>
            <Wallet size={19} /> Cobrar ahora
          </button>
        )}
        {order && items.length === 0 && (
          <button className="btn btn-danger btn-block" onClick={() => setStatus('cancelada', 'Mesa liberada')}>
            <Ban size={17} /> Liberar mesa
          </button>
        )}
      </div>

      {paying && (
        <PaymentModal order={order} items={items} onClose={() => { setPaying(false); load() }} onPaid={() => {}} />
      )}
    </div>
  )
}
