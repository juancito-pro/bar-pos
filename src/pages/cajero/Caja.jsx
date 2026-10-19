import { useCallback, useEffect, useState } from 'react'
import { Wallet, Lock, Unlock, Banknote, CreditCard, QrCode, Receipt, Scale, History, Mail } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { money, fmtDateTime, fmtTime } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import { useCashSession } from '../../hooks/useCashSession'
import { useRealtime } from '../../hooks/useRealtime'
import { Loader, Stat, StatusBadge } from '../../components/ui'
import Modal from '../../components/Modal'
import DailyReportModal from '../../components/DailyReportModal'

export default function Caja() {
  const { profile } = useAuth()
  const toast = useToast()
  const { session, loading, reload } = useCashSession()
  const [opening, setOpening] = useState('')
  const [payments, setPayments] = useState([])
  const [history, setHistory] = useState([])
  const [closing, setClosing] = useState(false)
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showDailyReport, setShowDailyReport] = useState(false)

  const loadData = useCallback(async () => {
    const h = await supabase.from('cash_sessions').select('*').eq('cashier_id', profile.id).eq('status', 'cerrada')
      .order('opened_at', { ascending: false }).limit(10)
    setHistory(h.data || [])
    if (session) {
      const { data } = await supabase.from('payments').select('*, orders(id, type, bar_tables(name))')
        .eq('cash_session_id', session.id).order('created_at', { ascending: false })
      setPayments(data || [])
    }
  }, [session, profile.id])

  useEffect(() => { loadData() }, [loadData])
  useRealtime(['orders'], loadData, 800)

  const open = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('cash_sessions').insert({ cashier_id: profile.id, opening_amount: Number(opening) || 0 })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Caja abierta. ¡Buen turno! 🍀')
    setOpening('')
    reload()
  }

  const close = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('close_cash_session', {
      p_session_id: session.id, p_counted: Number(counted) || 0, p_notes: notes || null,
    })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    setClosing(false)
    setResult(data)
    setCounted('')
    setNotes('')
    reload()
  }

  if (loading) return <Loader />

  const sum = (m) => payments.filter((p) => p.method === m).reduce((s, p) => s + Number(p.amount), 0)
  const cash = sum('efectivo'), card = sum('tarjeta'), qr = sum('qr')
  const total = cash + card + qr
  const expected = Number(session?.opening_amount || 0) + cash
  const orders = new Set(payments.map((p) => p.order_id)).size

  return (
    <>
      {!session ? (
        <div className="grid grid-2-1">
          <form className="card" onSubmit={open} style={{ padding: 28 }}>
            <div className="stat-icon bg-primary" style={{ width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', marginBottom: 16 }}>
              <Unlock size={26} />
            </div>
            <h2>Abrir caja</h2>
            <p className="muted mb">Ingresa el monto inicial en efectivo (fondo de caja) para comenzar a cobrar.</p>
            <div className="field mb">
              <label htmlFor="opening-amount">Monto inicial (Bs)</label>
              <input id="opening-amount" className="input" type="number" inputMode="decimal" min="0" step="0.5"
                placeholder="0.00" value={opening} onChange={(e) => setOpening(e.target.value)} autoFocus />
            </div>
            <button id="btn-open-cash" className="btn btn-primary btn-lg" disabled={busy}><Unlock size={18} /> Abrir caja</button>
          </form>
          <HistoryCard history={history} />
        </div>
      ) : (
        <>
          <div className="page-head">
            <div>
              <div className="row"><h2>Caja abierta</h2><span className="badge live listo"><span className="dot" />Activa</span></div>
              <div className="muted small">Desde {fmtDateTime(session.opened_at)} · Fondo inicial {money(session.opening_amount)}</div>
            </div>
            <button id="btn-close-cash" className="btn btn-danger" onClick={() => setClosing(true)}><Lock size={17} /> Cerrar caja</button>
          </div>

          <div className="grid grid-4 keep-2 mb stagger">
            <Stat icon={Wallet} label="Total vendido" value={money(total)} tone="primary" hint={`${orders} cobros`} />
            <Stat icon={Banknote} label="Efectivo" value={money(cash)} tone="success" />
            <Stat icon={CreditCard} label="Tarjeta" value={money(card)} tone="info" />
            <Stat icon={QrCode} label="QR / Transferencia" value={money(qr)} tone="violet" />
          </div>

          <div className="grid grid-2-1">
            <div className="card pad-0">
              <div className="card-title" style={{ padding: '18px 20px 0' }}><Receipt size={18} className="tone-primary" /> Cobros del turno</div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Hora</th><th>Pedido</th><th>Método</th><th className="num">Monto</th></tr></thead>
                  <tbody>
                    {payments.length === 0 && <tr><td colSpan={4} className="center muted" style={{ padding: 30 }}>Aún no hay cobros</td></tr>}
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="muted">{fmtTime(p.created_at)}</td>
                        <td>#{p.order_id} · {p.orders?.type === 'barra' ? 'Barra' : p.orders?.bar_tables?.name}</td>
                        <td><span className={`badge ${p.method === 'efectivo' ? 'listo' : p.method === 'tarjeta' ? 'entregado' : 'admin'}`}>{p.method}</span></td>
                        <td className="num money">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <div className="card-title"><Scale size={18} className="tone-primary" /> Efectivo esperado</div>
              <div className="col">
                <div className="row-between"><span className="muted">Fondo inicial</span><span className="money">{money(session.opening_amount)}</span></div>
                <div className="row-between"><span className="muted">+ Ventas en efectivo</span><span className="money">{money(cash)}</span></div>
                <div className="cart-total"><span className="bold">En caja debe haber</span><span className="money grad-text">{money(expected)}</span></div>
              </div>
            </div>
          </div>
        </>
      )}

      {closing && (
        <Modal title="Cerrar caja · Arqueo" onClose={() => setClosing(false)}
          footer={<>
            <button className="btn" onClick={() => setClosing(false)}>Cancelar</button>
            <button id="btn-confirm-close" className="btn btn-danger" disabled={busy || counted === ''} onClick={close}><Lock size={16} /> Cerrar caja</button>
          </>}>
          <div className="pay-total">
            <div className="muted small">Efectivo esperado</div>
            <div className="money grad-text">{money(expected)}</div>
          </div>
          <div className="field mb">
            <label htmlFor="counted-cash">Efectivo contado (Bs)</label>
            <input id="counted-cash" className="input" type="number" inputMode="decimal" step="0.5" placeholder="Cuenta los billetes y monedas"
              value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
          </div>
          {counted !== '' && (
            <div className={`card mb center ${Number(counted) - expected === 0 ? 'bg-success' : Number(counted) - expected > 0 ? 'bg-info' : 'bg-danger'}`} style={{ padding: 14 }}>
              <div className="xs">Diferencia</div>
              <div className="money" style={{ fontSize: 22 }}>{money(Number(counted) - expected)}</div>
              <div className="xs">{Number(counted) - expected === 0 ? 'Cuadra perfecto ✅' : Number(counted) - expected > 0 ? 'Sobrante' : 'Faltante'}</div>
            </div>
          )}
          <div className="field">
            <label htmlFor="close-notes">Observaciones</label>
            <textarea id="close-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>
        </Modal>
      )}

      {result && (
        <Modal
          title="Caja cerrada con éxito"
          onClose={() => setResult(null)}
          footer={
            <>
              <button className="btn" onClick={() => setResult(null)}>
                Cerrar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setResult(null)
                  setShowDailyReport(true)
                }}
              >
                <Mail size={16} /> Mandar Reporte por Correo
              </button>
            </>
          }
        >
          <div className="col">
            <div className="row-between"><span className="muted">Total ventas</span><span className="money">{money(result.total_sales)}</span></div>
            <div className="row-between"><span className="muted">Efectivo esperado</span><span className="money">{money(result.expected_cash)}</span></div>
            <div className="row-between"><span className="muted">Efectivo contado</span><span className="money">{money(result.counted_cash)}</span></div>
            <div className="cart-total"><span className="bold">Diferencia</span>
              <span className={`money ${Number(result.difference) < 0 ? 'tone-danger' : 'tone-success'}`}>{money(result.difference)}</span></div>
          </div>
        </Modal>
      )}

      {showDailyReport && (
        <DailyReportModal onClose={() => setShowDailyReport(false)} />
      )}
    </>
  )
}

function HistoryCard({ history }) {
  return (
    <div className="card">
      <div className="card-title"><History size={18} className="tone-primary" /> Últimos cierres</div>
      {history.length === 0 && <div className="muted small">Sin cierres anteriores</div>}
      <div className="col">
        {history.map((h) => (
          <div key={h.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div className="small bold">{fmtDateTime(h.opened_at)}</div>
              <div className="xs muted">Ventas {money(h.total_sales)}</div>
            </div>
            <StatusBadge status={Number(h.difference) < 0 ? 'cancelada' : 'listo'} label={money(h.difference)} />
          </div>
        ))}
      </div>
    </div>
  )
}
