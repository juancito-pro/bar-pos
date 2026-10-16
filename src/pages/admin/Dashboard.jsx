import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import { TrendingUp, Receipt, LayoutGrid, AlertTriangle, Wallet, Trophy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { money, isoDay, METHOD_LABEL } from '../../lib/format'
import { useRealtime } from '../../hooks/useRealtime'
import { Loader, Stat } from '../../components/ui'
import { CHART_COLORS, tooltipStyle } from '../../lib/chart'

export default function Dashboard() {
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    const since = new Date()
    since.setDate(since.getDate() - 6)
    since.setHours(0, 0, 0, 0)

    const [pay, items, open, products] = await Promise.all([
      supabase.from('payments').select('amount, method, created_at, order_id').gte('created_at', since.toISOString()),
      supabase.from('order_items').select('product_name, quantity, unit_price, orders!inner(status, paid_at)')
        .eq('orders.status', 'pagada').gte('orders.paid_at', since.toISOString()),
      supabase.from('orders').select('id, type, total').in('status', ['abierta', 'por_cobrar']),
      supabase.from('products').select('id, name, stock, min_stock').eq('track_stock', true).eq('active', true),
    ])

    const today = isoDay()
    const days = [...Array(7)].map((_, i) => {
      const d = new Date(since)
      d.setDate(d.getDate() + i)
      return { day: isoDay(d), label: d.toLocaleDateString('es-BO', { weekday: 'short' }), total: 0 }
    })
    const byDay = Object.fromEntries(days.map((d) => [d.day, d]))
    const methods = {}
    let todayTotal = 0
    const todayOrders = new Set()
    for (const p of pay.data || []) {
      const d = isoDay(p.created_at)
      if (byDay[d]) byDay[d].total += Number(p.amount)
      if (d === today) {
        todayTotal += Number(p.amount)
        todayOrders.add(p.order_id)
        methods[p.method] = (methods[p.method] || 0) + Number(p.amount)
      }
    }
    const prods = {}
    for (const i of items.data || []) {
      prods[i.product_name] = (prods[i.product_name] || 0) + i.quantity
    }
    const top = Object.entries(prods).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 6)
    const low = (products.data || []).filter((p) => p.stock <= p.min_stock).sort((a, b) => a.stock - b.stock)
    const openOrders = open.data || []

    setData({
      days, todayTotal, todayOrders: todayOrders.size, top, low,
      methods: Object.entries(methods).map(([k, v]) => ({ name: METHOD_LABEL[k], value: v })),
      openTables: openOrders.filter((o) => o.type === 'mesa').length,
      openAmount: openOrders.reduce((s, o) => s + Number(o.total), 0),
      week: days.reduce((s, d) => s + d.total, 0),
    })
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['orders'], load, 1500)

  if (!data) return <Loader />

  return (
    <>
      <div className="grid grid-4 keep-2 mb stagger">
        <Stat icon={Wallet} label="Ventas de hoy" value={money(data.todayTotal)} tone="primary" hint={`${data.todayOrders} cobros`} />
        <Stat icon={Receipt} label="Ticket promedio" value={money(data.todayOrders ? data.todayTotal / data.todayOrders : 0)} tone="accent" />
        <Stat icon={LayoutGrid} label="Mesas ocupadas" value={data.openTables} tone="info" hint={`${money(data.openAmount)} por cobrar`} />
        <Stat icon={AlertTriangle} label="Stock bajo" value={data.low.length} tone={data.low.length ? 'danger' : 'success'} hint="productos" />
      </div>

      <div className="grid grid-2-1 mb">
        <div className="card">
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div className="card-title" style={{ margin: 0 }}><TrendingUp size={18} className="tone-primary" /> Ventas últimos 7 días</div>
            <span className="money grad-text">{money(data.week)}</span>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={data.days} margin={{ left: -10, right: 10, top: 10 }}>
                <defs>
                  <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffbf47" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#ff5fa2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
                <XAxis dataKey="label" stroke="#6b6579" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b6579" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v) => money(v)} />
                <Area type="monotone" dataKey="total" name="Ventas" stroke="#ffbf47" strokeWidth={3} fill="url(#gArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-title"><Wallet size={18} className="tone-primary" /> Métodos de pago (hoy)</div>
          {data.methods.length === 0 ? (
            <div className="muted small center" style={{ padding: 60 }}>Sin ventas hoy</div>
          ) : (
            <>
              <div style={{ height: 180 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data.methods} dataKey="value" innerRadius={52} outerRadius={80} paddingAngle={4} stroke="none">
                      {data.methods.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="col" style={{ gap: 6 }}>
                {data.methods.map((m, i) => (
                  <div key={m.name} className="row-between small">
                    <span className="row" style={{ gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[i] }} />{m.name}</span>
                    <span className="money">{money(m.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title"><Trophy size={18} className="tone-primary" /> Más vendidos (7 días)</div>
          {data.top.length === 0 ? <div className="muted small">Sin datos aún</div> : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={data.top} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={130} stroke="#9b95ab" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                  <Bar dataKey="qty" name="Unidades" radius={[0, 8, 8, 0]}>
                    {data.top.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="card">
          <div className="row-between" style={{ marginBottom: 14 }}>
            <div className="card-title" style={{ margin: 0 }}><AlertTriangle size={18} className="tone-danger" /> Stock bajo</div>
            <Link to="/admin/inventario" className="btn btn-sm">Ver inventario</Link>
          </div>
          {data.low.length === 0 ? <div className="muted small">Todo el inventario está en orden ✅</div> : (
            <div className="col" style={{ gap: 8 }}>
              {data.low.slice(0, 7).map((p) => (
                <div key={p.id} className="row-between">
                  <span className="small">{p.name}</span>
                  <span className={`badge ${p.stock <= 0 ? 'cancelada' : 'pendiente'}`} style={p.stock <= 0 ? { color: 'var(--danger)', background: 'var(--danger-soft)' } : undefined}>
                    {p.stock <= 0 ? 'Agotado' : `${p.stock} / mín ${p.min_stock}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
