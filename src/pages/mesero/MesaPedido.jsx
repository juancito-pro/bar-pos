import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Send, Receipt, Trash2, CheckCheck, RotateCcw, Ban, Wallet, Clock, Bell, Check } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { money, timeAgo, fmtTime, STATUS_LABEL } from '../../lib/format'
import { useRealtime } from '../../hooks/useRealtime'
import { markCallAttended } from '../../lib/waiterCalls'

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
  const [pendingCall, setPendingCall] = useState(null)
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

      // Cargar si la mesa tiene un llamado o pedido pendiente desde el QR
      try {
        const { data: callData } = await supabase
          .from('table_calls')
          .select('*')
          .eq('status', 'pendiente')
          .or(`table_id.eq.${tableId},table_number.eq.${t.data?.number || 0}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setPendingCall(callData || null)
      } catch {
        setPendingCall(null)
      }

      setLoading(false)
    }, [tableId])

    useEffect(() => { load() }, [load])
    useRealtime(['orders', 'order_items', 'table_calls'], load)


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

      {/* Alerta de Pedido o Llamado enviado desde el QR */}
      {pendingCall && (
        <div
          className="card mb"
          style={{
            background: 'linear-gradient(135deg, hsla(45, 95%, 50%, 0.12), var(--surface-2))',
            border: '2px solid #eab308',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div className="row-between">
            <div className="row" style={{ gap: 8 }}>
              <span className="waiter-banner-pill">
                <Bell size={15} className="bell-shake" />
                {pendingCall.items?.length > 0 ? 'Pedido enviado desde el Menú QR' : 'Cliente llamando al mesero'}
              </span>
              <span className="xs muted">{timeAgo(pendingCall.created_at)}</span>
            </div>
            <button
              className="btn btn-sm btn-ghost"
              onClick={async () => {
                await markCallAttended(pendingCall.id, profile?.id)
                setPendingCall(null)
                toast('Llamado marcado como atendido')
              }}
              title="Marcar atendido"
            >
              <Check size={14} /> Atendido
            </button>
          </div>

          {pendingCall.items && pendingCall.items.length > 0 && (
            <div className="col gap-xs mt">
              <div className="xs bold tone-primary">Tragos seleccionados por el cliente ({pendingCall.items.length}):</div>
              <div style={{ background: 'var(--surface-3)', borderRadius: 10, padding: '8px 12px' }}>
                {pendingCall.items.map((it, idx) => (
                  <div key={idx} className="row-between small" style={{ padding: '3px 0' }}>
                    <span className="bold">• {it.qty}x {it.name}</span>
                    <span className="money tone-primary">{money(it.price * it.qty)}</span>
                  </div>
                ))}
                <div className="row-between bold mt-xs" style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  <span>Total estimado:</span>
                  <span className="money grad-text">{money(pendingCall.total)}</span>
                </div>
              </div>

              <div className="row wrap mt-xs" style={{ gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm grow"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      const cart = pendingCall.items.map((it) => ({
                        product: { id: it.id, name: it.name, price: it.price },
                        qty: it.qty,
                        notes: 'Pedido desde QR del cliente',
                      }))
                      const ok = await sendItems(cart)
                      if (ok) {
                        await markCallAttended(pendingCall.id, profile?.id)
                        setPendingCall(null)
                        toast('¡Tragos del QR cargados a la comanda con éxito! 🍻')
                      }
                    } catch (err) {
                      toast(errMsg(err), 'error')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <Plus size={15} /> Cargar automáticamente a la comanda
                </button>
              </div>
            </div>
          )}
        </div>
      )}


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
