import { useCallback, useEffect, useState } from 'react'
import { Boxes, Plus, AlertTriangle, ArrowUpRight, ArrowDownRight, History, Package } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { fmtDateTime } from '../../lib/format'
import { useRealtime } from '../../hooks/useRealtime'
import { useToast } from '../../components/Toast'
import { Loader, Stat, Empty } from '../../components/ui'
import Modal from '../../components/Modal'

export default function Inventario() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all', 'low', 'out'
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustType, setAdjustType] = useState('entrada')
  const [adjustNote, setAdjustNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([
      supabase
        .from('products')
        .select('*, categories(name, icon)')
        .eq('track_stock', true)
        .order('name'),
      supabase
        .from('stock_movements')
        .select('*, products(name)')
        .order('created_at', { ascending: false })
        .limit(40),
    ])
    setProducts(p.data || [])
    setMovements(m.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['products', 'stock_movements'], load)

  const handleAdjust = async (e) => {
    e.preventDefault()
    setBusy(true)
    const rawQty = Math.abs(parseInt(adjustQty, 10)) || 0
    const finalQty = adjustType === 'entrada' ? rawQty : -rawQty

    const { error } = await supabase.rpc('add_stock', {
      p_product_id: adjustTarget.id,
      p_quantity: finalQty,
      p_note: adjustNote.trim() || (adjustType === 'entrada' ? 'Ingreso manual' : 'Ajuste / Merma'),
    })

    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Stock actualizado correctamente')
    setAdjustTarget(null)
    setAdjustQty('')
    setAdjustNote('')
    load()
  }

  if (loading) return <Loader />

  const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= p.min_stock)
  const outOfStockProducts = products.filter((p) => p.stock <= 0)

  const filtered = products.filter((p) => {
    if (filter === 'low') return p.stock > 0 && p.stock <= p.min_stock
    if (filter === 'out') return p.stock <= 0
    return true
  })

  return (
    <>
      <div className="grid grid-3 keep-2 mb stagger">
        <Stat
          icon={Boxes}
          label="Productos en control"
          value={products.length}
          tone="primary"
          hint="Items con seguimiento de stock"
        />
        <Stat
          icon={AlertTriangle}
          label="Stock bajo"
          value={lowStockProducts.length}
          tone="accent"
          hint="Próximos a agotarse"
        />
        <Stat
          icon={Package}
          label="Agotados"
          value={outOfStockProducts.length}
          tone="danger"
          hint="Sin existencias"
        />
      </div>

      <div className="grid grid-2-1">
        <div>
          <div className="card pad-0">
            <div className="row-between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div className="card-title" style={{ margin: 0 }}>
                <Boxes size={18} className="tone-primary" /> Existencias de productos
              </div>
              <div className="tabs">
                <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                  Todos ({products.length})
                </button>
                <button className={`tab ${filter === 'low' ? 'active' : ''}`} onClick={() => setFilter('low')}>
                  Bajo ({lowStockProducts.length})
                </button>
                <button className={`tab ${filter === 'out' ? 'active' : ''}`} onClick={() => setFilter('out')}>
                  Agotados ({outOfStockProducts.length})
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th className="num">Stock Actual</th>
                    <th className="num">Mínimo</th>
                    <th className="right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="center muted" style={{ padding: 40 }}>
                        <Empty title="Sin productos en esta categoría" />
                      </td>
                    </tr>
                  ) : (
                    filtered.map((p) => {
                      const isOut = p.stock <= 0
                      const isLow = !isOut && p.stock <= p.min_stock
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="bold">{p.name}</div>
                          </td>
                          <td>
                            <span className="badge">
                              {p.categories?.icon || '🍹'} {p.categories?.name || 'Varios'}
                            </span>
                          </td>
                          <td className="num">
                            <span
                              className={`badge ${isOut ? 'cancelada' : isLow ? 'pendiente' : 'listo'}`}
                              style={isOut ? { color: 'var(--danger)', background: 'var(--danger-soft)' } : undefined}
                            >
                              <span className="dot" />
                              {p.stock} u.
                            </span>
                          </td>
                          <td className="num muted">{p.min_stock} u.</td>
                          <td className="right">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setAdjustTarget(p)
                                setAdjustType('entrada')
                                setAdjustQty('')
                                setAdjustNote('')
                              }}
                            >
                              <Plus size={14} /> Ajustar
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Historial de movimientos */}
        <div>
          <div className="card pad-0">
            <div className="card-title" style={{ padding: '16px 20px', margin: 0, borderBottom: '1px solid var(--border)' }}>
              <History size={18} className="tone-primary" /> Últimos movimientos
            </div>
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {movements.length === 0 ? (
                <div className="muted center small" style={{ padding: 30 }}>
                  No hay movimientos registrados
                </div>
              ) : (
                movements.map((m) => {
                  const isPositive = m.quantity > 0
                  return (
                    <div
                      key={m.id}
                      className="row-between"
                      style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}
                    >
                      <div>
                        <div className="bold small">{m.products?.name || 'Producto'}</div>
                        <div className="xs muted">
                          {fmtDateTime(m.created_at)} {m.note && `· ${m.note}`}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <span
                          className={`badge ${isPositive ? 'listo' : 'cancelada'}`}
                          style={!isPositive ? { color: 'var(--danger)', background: 'var(--danger-soft)' } : undefined}
                        >
                          {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {isPositive ? `+${m.quantity}` : m.quantity}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de ajuste de stock */}
      {adjustTarget && (
        <Modal
          title={`Ajustar Stock · ${adjustTarget.name}`}
          onClose={() => setAdjustTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setAdjustTarget(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" form="adjust-form" disabled={busy || !adjustQty}>
                {busy ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : 'Confirmar Ajuste'}
              </button>
            </>
          }
        >
          <form id="adjust-form" onSubmit={handleAdjust} className="col gap-lg">
            <div className="row-between" style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 12 }}>
              <span className="muted">Stock actual:</span>
              <span className="money bold" style={{ fontSize: 18 }}>{adjustTarget.stock} unidades</span>
            </div>

            <div className="field">
              <label>Tipo de movimiento</label>
              <div className="tabs" style={{ display: 'flex' }}>
                <button
                  type="button"
                  className={`tab grow center ${adjustType === 'entrada' ? 'active' : ''}`}
                  onClick={() => setAdjustType('entrada')}
                >
                  <ArrowUpRight size={15} style={{ display: 'inline', marginRight: 4 }} />
                  Entrada (Compra / Reposición)
                </button>
                <button
                  type="button"
                  className={`tab grow center ${adjustType === 'salida' ? 'active' : ''}`}
                  onClick={() => setAdjustType('salida')}
                >
                  <ArrowDownRight size={15} style={{ display: 'inline', marginRight: 4 }} />
                  Salida (Merma / Ajuste)
                </button>
              </div>
            </div>

            <div className="field">
              <label>Cantidad de unidades *</label>
              <input
                className="input"
                type="number"
                min="1"
                required
                placeholder="ej. 24, 48..."
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label>Motivo u observación</label>
              <input
                className="input"
                placeholder="ej. Compra a distribuidora, rotura, merma de barra..."
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
