import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingBag, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { useRealtime } from '../hooks/useRealtime'
import { Loader, Empty } from './ui'

/**
 * Catálogo de productos con carrito.
 * onConfirm(cartItems) -> cartItems = [{ product, qty, notes }]
 */
export default function ProductPicker({ onConfirm, confirmLabel = 'Confirmar', confirmIcon: ConfirmIcon, busy, title = 'Pedido' }) {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [cart, setCart] = useState({})
  const [collapsed, setCollapsed] = useState(true)

  const load = async () => {
    const [c, p] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('products').select('*').eq('active', true).order('name'),
    ])
    setCategories(c.data || [])
    setProducts(p.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  useRealtime(['products'], load, 600)

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])

  const visible = products.filter(
    (p) => (cat === 'all' || p.category_id === cat) && p.name.toLowerCase().includes(q.toLowerCase()),
  )

  const items = Object.values(cart)
  const total = items.reduce((s, i) => s + i.qty * Number(i.product.price), 0)
  const count = items.reduce((s, i) => s + i.qty, 0)

  const available = (p) => (p.track_stock ? p.stock : Infinity)

  const add = (p, d = 1) =>
    setCart((c) => {
      const cur = c[p.id]?.qty || 0
      const next = Math.min(cur + d, available(p))
      if (next <= 0) {
        const { [p.id]: _, ...rest } = c
        return rest
      }
      return { ...c, [p.id]: { product: p, qty: next, notes: c[p.id]?.notes || '' } }
    })

  const setNote = (id, notes) => setCart((c) => ({ ...c, [id]: { ...c[id], notes } }))

  const confirm = async () => {
    const ok = await onConfirm(items)
    if (ok !== false) {
      setCart({})
      setCollapsed(true)
    }
  }

  if (loading) return <Loader />

  return (
    <div className="picker">
      <div className="picker-catalog">
        <div className="input-icon">
          <Search size={18} />
          <input id="product-search" className="input" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips mt" style={{ marginTop: 12 }}>
          <button className={`chip ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>✨ Todos</button>
          {categories.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Empty title="Sin productos" icon={Search}>No hay productos que coincidan.</Empty>
        ) : (
          <div className="products-grid">
            {visible.map((p) => {
              const out = p.track_stock && p.stock <= 0
              return (
                <button key={p.id} className="product-card" disabled={out} onClick={() => add(p)} id={`product-${p.id}`}>
                  {cart[p.id] && <span className="p-qty">{cart[p.id].qty}</span>}
                  <span className="p-emoji">{catMap[p.category_id]?.icon || '🍹'}</span>
                  <span className="p-name">{p.name}</span>
                  {p.track_stock && (
                    <span className="p-stock" style={p.stock <= p.min_stock ? { color: 'var(--danger)' } : undefined}>
                      {out ? 'Agotado' : `Stock: ${p.stock}`}
                    </span>
                  )}
                  <span className="p-price">{money(p.price)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <aside className={`card picker-cart ${collapsed ? 'collapsed' : ''}`}>
        <div className="row-between cart-toggle" onClick={() => setCollapsed(!collapsed)} style={{ cursor: 'pointer' }}>
          <div className="row">
            <div className="stat-icon bg-primary" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}>
              <ShoppingBag size={18} />
            </div>
            <div>
              <div className="bold">{count} {count === 1 ? 'producto' : 'productos'}</div>
              <div className="money tone-primary">{money(total)}</div>
            </div>
          </div>
          {collapsed ? (
            <div className="row">
              <button className="btn btn-primary" disabled={!count || busy}
                onClick={(e) => { e.stopPropagation(); confirm() }}>
                {ConfirmIcon && <ConfirmIcon size={17} />} {confirmLabel}
              </button>
              <ChevronUp size={20} className="muted" />
            </div>
          ) : (
            <ChevronDown size={20} className="muted" />
          )}
        </div>

        <div className="cart-body col" style={{ minHeight: 0, flex: 1 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            <ShoppingBag size={18} className="tone-primary" /> {title}
          </div>
          <div className="cart-items">
            {items.length === 0 && <div className="muted small center" style={{ padding: 20 }}>Toca un producto para agregarlo</div>}
            {items.map(({ product: p, qty, notes }) => (
              <div key={p.id} className="cart-item">
                <div className="grow">
                  <div className="bold small truncate">{p.name}</div>
                  <div className="xs muted">{money(p.price)} c/u</div>
                  <input className="input" placeholder="Nota (sin hielo, etc.)" value={notes}
                    onChange={(e) => setNote(p.id, e.target.value)}
                    style={{ height: 30, fontSize: 12, marginTop: 6, padding: '0 10px', borderRadius: 8 }} />
                </div>
                <div className="col" style={{ alignItems: 'flex-end', gap: 6 }}>
                  <div className="qty">
                    <button onClick={() => add(p, -1)} aria-label="Quitar">{qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}</button>
                    <span>{qty}</span>
                    <button onClick={() => add(p, 1)} aria-label="Agregar"><Plus size={14} /></button>
                  </div>
                  <div className="money small">{money(qty * p.price)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="cart-total">
            <span className="muted">Total</span>
            <span className="money">{money(total)}</span>
          </div>
          <button id="cart-confirm" className="btn btn-primary btn-lg btn-block" disabled={!count || busy} onClick={confirm}>
            {busy ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : <>{ConfirmIcon && <ConfirmIcon size={18} />} {confirmLabel}</>}
          </button>
        </div>
      </aside>
    </div>
  )
}
