import { useCallback, useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Calendar, Download, Package, Users, Wallet, TrendingUp, Receipt, Scale, Mail } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { money, isoDay, startOfDay, endOfDay, fmtDate, fmtDateTime, METHOD_LABEL, downloadCSV } from '../../lib/format'
import { Loader, Stat } from '../../components/ui'
import { tooltipStyle } from '../../lib/chart'
import DailyReportModal from '../../components/DailyReportModal'

const PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 6 },
  { label: '30 días', days: 29 },
]

export default function Reportes() {
  const [from, setFrom] = useState(isoDay())
  const [to, setTo] = useState(isoDay())
  const [tab, setTab] = useState('productos')
  const [r, setR] = useState(null)
  const [showEmailModal, setShowEmailModal] = useState(false)

  const preset = (days) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    setFrom(isoDay(d))
    setTo(isoDay())
  }

  const load = useCallback(async () => {
    setR(null)
    const a = startOfDay(from), b = endOfDay(to)
    const [orders, pays, sessions] = await Promise.all([
      supabase.from('orders')
        .select('id, total, type, paid_at, waiter_id, waiter:profiles!waiter_id(full_name, username), order_items(product_id, product_name, quantity, unit_price, products(cost))')
        .eq('status', 'pagada').gte('paid_at', a).lte('paid_at', b).order('paid_at').limit(5000),
      supabase.from('payments').select('method, amount').gte('created_at', a).lte('created_at', b).limit(10000),
      supabase.from('cash_sessions').select('*, cashier:profiles!cashier_id(full_name, username)')
        .gte('opened_at', a).lte('opened_at', b).order('opened_at', { ascending: false }),
    ])
    const list = orders.data || []
    const byDay = {}, byProduct = {}, byWaiter = {}, byMethod = {}
    let total = 0, cost = 0
    for (const o of list) {
      total += Number(o.total)
      const d = isoDay(o.paid_at)
      byDay[d] = (byDay[d] || 0) + Number(o.total)
      const wk = o.type === 'barra' ? 'Barra (cajero)' : o.waiter?.full_name || o.waiter?.username || 'Sin asignar'
      byWaiter[wk] = byWaiter[wk] || { name: wk, orders: 0, total: 0 }
      byWaiter[wk].orders++
      byWaiter[wk].total += Number(o.total)
      for (const i of o.order_items) {
        const k = i.product_name
        const c = Number(i.products?.cost || 0) * i.quantity
        byProduct[k] = byProduct[k] || { name: k, qty: 0, revenue: 0, cost: 0 }
        byProduct[k].qty += i.quantity
        byProduct[k].revenue += i.quantity * Number(i.unit_price)
        byProduct[k].cost += c
        cost += c
      }
    }
    for (const p of pays.data || []) byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount)

    setR({
      total, cost, count: list.length,
      days: Object.entries(byDay).map(([day, total]) => ({ day, label: fmtDate(day + 'T12:00:00'), total })),
      products: Object.values(byProduct).sort((x, y) => y.revenue - x.revenue),
      waiters: Object.values(byWaiter).sort((x, y) => y.total - x.total),
      methods: byMethod,
      sessions: sessions.data || [],
    })
  }, [from, to])

  useEffect(() => { load() }, [load])

  const exportCSV = () => {
    if (!r) return
    if (tab === 'productos')
      downloadCSV(`productos_${from}_${to}.csv`, [['Producto', 'Cantidad', 'Ingresos', 'Costo', 'Ganancia'],
        ...r.products.map((p) => [p.name, p.qty, p.revenue.toFixed(2), p.cost.toFixed(2), (p.revenue - p.cost).toFixed(2)])])
    else if (tab === 'meseros')
      downloadCSV(`meseros_${from}_${to}.csv`, [['Mesero', 'Pedidos', 'Total'], ...r.waiters.map((w) => [w.name, w.orders, w.total.toFixed(2)])])
    else
      downloadCSV(`cajas_${from}_${to}.csv`, [['Apertura', 'Cierre', 'Cajero', 'Fondo', 'Ventas', 'Esperado', 'Contado', 'Diferencia'],
        ...r.sessions.map((s) => [fmtDateTime(s.opened_at), s.closed_at ? fmtDateTime(s.closed_at) : 'Abierta', s.cashier?.full_name,
          s.opening_amount, s.total_sales ?? '', s.expected_cash ?? '', s.counted_cash ?? '', s.difference ?? ''])])
  }

  return (
    <>
      <div className="card mb row wrap" style={{ padding: 14 }}>
        <Calendar size={18} className="tone-primary" />
        <input type="date" className="input" style={{ width: 170 }} value={from} onChange={(e) => setFrom(e.target.value)} id="report-from" />
        <span className="muted">a</span>
        <input type="date" className="input" style={{ width: 170 }} value={to} onChange={(e) => setTo(e.target.value)} id="report-to" />
        <div className="chips">
          {PRESETS.map((p) => <button key={p.label} className="chip" onClick={() => preset(p.days)}>{p.label}</button>)}
        </div>
        <div className="grow" />
        <button className="btn btn-sm btn-primary" onClick={() => setShowEmailModal(true)} disabled={!r}>
          <Mail size={15} /> Mandar Reporte por Correo
        </button>
        <button className="btn btn-sm" onClick={exportCSV} disabled={!r}><Download size={15} /> Exportar CSV</button>
      </div>

      {showEmailModal && (
        <DailyReportModal targetDate={to} onClose={() => setShowEmailModal(false)} />
      )}

      {!r ? <Loader /> : (
        <>
          <div className="grid grid-4 keep-2 mb stagger">
            <Stat icon={Wallet} label="Ventas totales" value={money(r.total)} tone="primary" />
            <Stat icon={Receipt} label="Pedidos cobrados" value={r.count} tone="info" hint={`Promedio ${money(r.count ? r.total / r.count : 0)}`} />
            <Stat icon={TrendingUp} label="Ganancia estimada" value={money(r.total - r.cost)} tone="success" hint={`Costo ${money(r.cost)}`} />
            <div className="card">
              <div className="stat-label muted small" style={{ marginBottom: 10 }}>Por método de pago</div>
              {['efectivo', 'tarjeta', 'qr'].map((m) => (
                <div key={m} className="row-between small" style={{ padding: '3px 0' }}>
                  <span className="muted">{METHOD_LABEL[m]}</span><span className="money">{money(r.methods[m] || 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {r.days.length > 1 && (
            <div className="card mb">
              <div className="card-title"><TrendingUp size={18} className="tone-primary" /> Ventas por día</div>
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={r.days} margin={{ left: -10 }}>
                    <defs>
                      <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffbf47" /><stop offset="100%" stopColor="#ff5fa2" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
                    <XAxis dataKey="label" stroke="#6b6579" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#6b6579" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,.04)' }} formatter={(v) => money(v)} />
                    <Bar dataKey="total" name="Ventas" fill="url(#gBar)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="tabs mb">
            <button className={`tab ${tab === 'productos' ? 'active' : ''}`} onClick={() => setTab('productos')}><Package size={14} /> Productos</button>
            <button className={`tab ${tab === 'meseros' ? 'active' : ''}`} onClick={() => setTab('meseros')}><Users size={14} /> Meseros</button>
            <button className={`tab ${tab === 'cajas' ? 'active' : ''}`} onClick={() => setTab('cajas')}><Scale size={14} /> Cierres de caja</button>
          </div>

          <div className="card pad-0">
            <div className="table-wrap">
              {tab === 'productos' && (
                <table className="table">
                  <thead><tr><th>Producto</th><th className="num">Cant.</th><th className="num">Ingresos</th><th className="num">Costo</th><th className="num">Ganancia</th></tr></thead>
                  <tbody>
                    {r.products.length === 0 && <tr><td colSpan={5} className="center muted" style={{ padding: 30 }}>Sin ventas en este periodo</td></tr>}
                    {r.products.map((p) => (
                      <tr key={p.name}>
                        <td className="bold">{p.name}</td>
                        <td className="num">{p.qty}</td>
                        <td className="num money">{money(p.revenue)}</td>
                        <td className="num muted">{money(p.cost)}</td>
                        <td className="num tone-success">{money(p.revenue - p.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab === 'meseros' && (
                <table className="table">
                  <thead><tr><th>Mesero</th><th className="num">Pedidos</th><th className="num">Total vendido</th><th className="num">Promedio</th></tr></thead>
                  <tbody>
                    {r.waiters.length === 0 && <tr><td colSpan={4} className="center muted" style={{ padding: 30 }}>Sin ventas en este periodo</td></tr>}
                    {r.waiters.map((w) => (
                      <tr key={w.name}>
                        <td className="bold">{w.name}</td>
                        <td className="num">{w.orders}</td>
                        <td className="num money">{money(w.total)}</td>
                        <td className="num muted">{money(w.total / w.orders)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab === 'cajas' && (
                <table className="table">
                  <thead><tr><th>Apertura</th><th>Cajero</th><th className="num">Fondo</th><th className="num">Ventas</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferencia</th></tr></thead>
                  <tbody>
                    {r.sessions.length === 0 && <tr><td colSpan={7} className="center muted" style={{ padding: 30 }}>Sin cajas en este periodo</td></tr>}
                    {r.sessions.map((s) => (
                      <tr key={s.id}>
                        <td>{fmtDateTime(s.opened_at)}{s.status === 'abierta' && <span className="badge listo" style={{ marginLeft: 8 }}>Abierta</span>}</td>
                        <td>{s.cashier?.full_name || s.cashier?.username}</td>
                        <td className="num">{money(s.opening_amount)}</td>
                        <td className="num money">{s.total_sales != null ? money(s.total_sales) : '—'}</td>
                        <td className="num">{s.expected_cash != null ? money(s.expected_cash) : '—'}</td>
                        <td className="num">{s.counted_cash != null ? money(s.counted_cash) : '—'}</td>
                        <td className={`num bold ${Number(s.difference) < 0 ? 'tone-danger' : 'tone-success'}`}>{s.difference != null ? money(s.difference) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
