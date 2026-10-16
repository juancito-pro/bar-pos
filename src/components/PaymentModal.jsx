import { useState } from 'react'
import { Banknote, CreditCard, QrCode, Check, Printer } from 'lucide-react'
import Modal from './Modal'
import { supabase, errMsg } from '../lib/supabase'
import { money, fmtDateTime, METHOD_LABEL } from '../lib/format'
import { useToast } from './Toast'

const METHODS = [
  { key: 'efectivo', icon: Banknote, tone: 'success' },
  { key: 'tarjeta', icon: CreditCard, tone: 'info' },
  { key: 'qr', icon: QrCode, tone: 'violet' },
]

export function Ticket({ order, items, payments, change = 0 }) {
  return (
    <div className="ticket">
      <h4>🍸 BarPOS</h4>
      <div style={{ textAlign: 'center', fontSize: 11 }}>Comprobante de venta</div>
      <hr />
      <div className="t-line"><span>Pedido</span><span>#{order.id}</span></div>
      <div className="t-line"><span>{order.type === 'barra' ? 'Barra' : order.bar_tables?.name || 'Mesa'}</span><span>{fmtDateTime(order.paid_at || new Date())}</span></div>
      {order.waiter?.full_name && <div className="t-line"><span>Mesero</span><span>{order.waiter.full_name}</span></div>}
      <hr />
      {items.map((i) => (
        <div key={i.id} className="t-line">
          <span>{i.quantity} x {i.product_name}</span>
          <span>{(i.quantity * i.unit_price).toFixed(2)}</span>
        </div>
      ))}
      <hr />
      <div className="t-line" style={{ fontWeight: 700, fontSize: 15 }}><span>TOTAL</span><span>Bs {Number(order.total).toFixed(2)}</span></div>
      {payments.map((p, idx) => (
        <div key={idx} className="t-line"><span>{METHOD_LABEL[p.method]}</span><span>{Number(p.amount).toFixed(2)}</span></div>
      ))}
      {change > 0 && <div className="t-line"><span>Cambio</span><span>{change.toFixed(2)}</span></div>}
      <hr />
      <div style={{ textAlign: 'center', fontSize: 11 }}>¡Gracias por su visita!</div>
    </div>
  )
}

/** Modal para cobrar un pedido con uno o varios métodos de pago */
export default function PaymentModal({ order, items, onClose, onPaid }) {
  const toast = useToast()
  const total = Number(order.total)
  const [amounts, setAmounts] = useState({ efectivo: '', tarjeta: '', qr: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const num = (v) => Number(v) || 0
  const paid = num(amounts.efectivo) + num(amounts.tarjeta) + num(amounts.qr)
  const nonCash = num(amounts.tarjeta) + num(amounts.qr)
  const remaining = Math.max(0, total - paid)
  const change = Math.max(0, paid - total)
  const invalid = paid < total || nonCash > total

  const fillRest = (key) => {
    const others = paid - num(amounts[key])
    setAmounts((a) => ({ ...a, [key]: Math.max(0, total - others).toFixed(2) }))
  }

  const pay = async () => {
    setBusy(true)
    const payments = METHODS.map((m) => ({ method: m.key, amount: num(amounts[m.key]) })).filter((p) => p.amount > 0)
    const { error } = await supabase.rpc('pay_order', { p_order_id: order.id, p_payments: payments })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`Pedido #${order.id} cobrado`)
    // registrar pagos tal como quedaron (el efectivo se ajusta al total)
    const recorded = payments.map((p) => ({ ...p }))
    if (change > 0) {
      const cash = recorded.find((p) => p.method === 'efectivo')
      if (cash) cash.amount = cash.amount - change
    }
    setDone({ payments: recorded, change, received: num(amounts.efectivo) })
    onPaid?.()
  }

  if (done) {
    return (
      <Modal title="¡Cobro realizado!" onClose={onClose}
        footer={<>
          <button className="btn" onClick={() => window.print()}><Printer size={17} /> Imprimir</button>
          <button className="btn btn-primary" onClick={onClose} id="pay-done">Listo</button>
        </>}>
        {done.change > 0 && (
          <div className="pay-total" style={{ background: 'var(--success-soft)' }}>
            <div className="muted small">Entregar cambio</div>
            <div className="money tone-success">{money(done.change)}</div>
          </div>
        )}
        <Ticket order={{ ...order, paid_at: new Date() }} items={items} payments={done.payments} change={done.change} />
      </Modal>
    )
  }

  const quick = [...new Set([Math.ceil(total), Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, 200])]
    .filter((v) => v >= total)
    .slice(0, 4)

  return (
    <Modal title={`Cobrar ${order.type === 'barra' ? 'venta en barra' : order.bar_tables?.name || ''} · #${order.id}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button id="pay-confirm" className="btn btn-success btn-lg" disabled={invalid || busy} onClick={pay}>
          {busy ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : <><Check size={18} /> Confirmar cobro</>}
        </button>
      </>}>
      <div className="pay-total">
        <div className="muted small">Total a cobrar</div>
        <div className="money grad-text">{money(total)}</div>
        <div className="xs faint">{items.reduce((s, i) => s + i.quantity, 0)} productos</div>
      </div>

      <div className="pay-methods">
        {METHODS.map(({ key, icon: Icon, tone }) => (
          <div key={key} className="pay-method">
            <div className={`pm-icon bg-${tone}`}><Icon size={20} /></div>
            <div className="bold">{METHOD_LABEL[key]}</div>
            <input id={`pay-${key}`} className="input" type="number" inputMode="decimal" min="0" step="0.5" placeholder="0.00"
              value={amounts[key]} onChange={(e) => setAmounts((a) => ({ ...a, [key]: e.target.value }))} />
            <button className="btn btn-sm" onClick={() => fillRest(key)}>Resto</button>
          </div>
        ))}
      </div>

      <div className="quick-cash">
        <span className="xs muted" style={{ alignSelf: 'center' }}>Efectivo rápido:</span>
        {quick.map((v) => (
          <button key={v} className="chip" onClick={() => setAmounts((a) => ({ ...a, efectivo: String(v) }))}>Bs {v}</button>
        ))}
      </div>

      <div className="pay-summary">
        <div><div className="xs muted">Recibido</div><div className="money">{money(paid)}</div></div>
        <div><div className="xs muted">Falta</div><div className={`money ${remaining > 0 ? 'tone-danger' : ''}`}>{money(remaining)}</div></div>
        <div><div className="xs muted">Cambio</div><div className="money tone-success">{money(change)}</div></div>
      </div>
      {nonCash > total && <p className="small tone-danger mt">Tarjeta/QR no pueden superar el total.</p>}
    </Modal>
  )
}
