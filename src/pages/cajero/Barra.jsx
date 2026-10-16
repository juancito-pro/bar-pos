import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, AlertTriangle } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { useCashSession } from '../../hooks/useCashSession'
import { Loader } from '../../components/ui'
import ProductPicker from '../../components/ProductPicker'
import PaymentModal from '../../components/PaymentModal'

export default function Barra() {
  const { profile } = useAuth()
  const toast = useToast()
  const { session, loading } = useCashSession()
  const [busy, setBusy] = useState(false)
  const [paying, setPaying] = useState(null)

  const checkout = async (cart) => {
    setBusy(true)
    try {
      const { data: order, error } = await supabase
        .from('orders')
        .insert({ type: 'barra', cashier_id: profile.id })
        .select()
        .single()
      if (error) throw error
      const { data: items, error: e2 } = await supabase
        .from('order_items')
        .insert(cart.map(({ product, qty, notes }) => ({
          order_id: order.id, product_id: product.id, product_name: product.name,
          unit_price: product.price, quantity: qty, notes: notes || null, status: 'entregado',
        })))
        .select()
      if (e2) throw e2
      const total = items.reduce((s, i) => s + i.quantity * Number(i.unit_price), 0)
      setPaying({ order: { ...order, total }, items })
      return true
    } catch (e) {
      toast(errMsg(e), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loader />

  if (!session)
    return (
      <div className="card row" style={{ maxWidth: 560, margin: '40px auto', padding: 24 }}>
        <AlertTriangle className="tone-primary" size={28} />
        <div className="grow">
          <div className="bold">Caja cerrada</div>
          <div className="small muted">Abre la caja para realizar ventas en barra.</div>
        </div>
        <Link to="/caja" className="btn btn-primary">Abrir caja</Link>
      </div>
    )

  return (
    <>
      <ProductPicker title="Venta directa" confirmLabel="Cobrar" confirmIcon={Wallet} busy={busy} onConfirm={checkout} />
      {paying && (
        <PaymentModal
          order={paying.order}
          items={paying.items}
          onClose={() => {
            setPaying(null)
          }}
        />
      )}
    </>
  )
}
