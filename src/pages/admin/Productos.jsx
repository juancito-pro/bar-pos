import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Search, Package, Check, X, FolderPlus, QrCode } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { money } from '../../lib/format'
import { useRealtime } from '../../hooks/useRealtime'
import { useToast } from '../../components/Toast'
import { Loader, Empty } from '../../components/ui'
import Modal from '../../components/Modal'
import QrMenuModal from '../../components/QrMenuModal'

export default function Productos() {
  const toast = useToast()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [editProduct, setEditProduct] = useState(null) // null = cerrado, {} = nuevo, objeto = editar
  const [editCategory, setEditCategory] = useState(null)
  const [showQrModal, setShowQrModal] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('products').select('*, categories(name, icon)').order('name'),
    ])
    setCategories(c.data || [])
    setProducts(p.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['products', 'categories'], load)

  const saveProduct = async (e) => {
    e.preventDefault()
    setBusy(true)
    const isNew = !editProduct.id
    const payload = {
      name: editProduct.name.trim(),
      category_id: editProduct.category_id ? Number(editProduct.category_id) : null,
      price: Number(editProduct.price) || 0,
      cost: Number(editProduct.cost) || 0,
      stock: Number(editProduct.stock) || 0,
      min_stock: Number(editProduct.min_stock) || 5,
      track_stock: Boolean(editProduct.track_stock),
      active: editProduct.active !== false,
    }

    let error
    if (isNew) {
      const res = await supabase.from('products').insert(payload)
      error = res.error
    } else {
      const res = await supabase.from('products').update(payload).eq('id', editProduct.id)
      error = res.error
    }

    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(isNew ? 'Producto creado' : 'Producto actualizado')
    setEditProduct(null)
    load()
  }

  const toggleActive = async (prod) => {
    const { error } = await supabase.from('products').update({ active: !prod.active }).eq('id', prod.id)
    if (error) return toast(errMsg(error), 'error')
    toast(prod.active ? 'Producto desactivado' : 'Producto activado')
    load()
  }

  const saveCategory = async (e) => {
    e.preventDefault()
    setBusy(true)
    const payload = {
      name: editCategory.name.trim(),
      icon: editCategory.icon?.trim() || '🍹',
      sort_order: Number(editCategory.sort_order) || 0,
    }
    const isNew = !editCategory.id
    const { error } = isNew
      ? await supabase.from('categories').insert(payload)
      : await supabase.from('categories').update(payload).eq('id', editCategory.id)

    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(isNew ? 'Categoría creada' : 'Categoría actualizada')
    setEditCategory(null)
    load()
  }

  if (loading) return <Loader />

  const filtered = products.filter((p) => {
    const matchCat = cat === 'all' || String(p.category_id) === String(cat)
    const matchQ = p.name.toLowerCase().includes(q.toLowerCase())
    return matchCat && matchQ
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Gestión de Catálogo</h2>
          <div className="muted small">Administra los productos, precios de venta, costos y categorías del bar.</div>
        </div>
        <div className="row wrap">
          <button className="btn btn-sm" onClick={() => setShowQrModal(true)}>
            <QrCode size={16} /> Menú Digital QR
          </button>
          <button className="btn btn-sm" onClick={() => setEditCategory({})}>
            <FolderPlus size={16} /> Nueva Categoría
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              setEditProduct({
                name: '',
                category_id: categories[0]?.id || '',
                price: '',
                cost: '',
                stock: 0,
                min_stock: 5,
                track_stock: true,
                active: true,
              })
            }
          >
            <Plus size={16} /> Nuevo Producto
          </button>
        </div>
      </div>

      <div className="card mb row wrap" style={{ padding: 14 }}>
        <div className="grow" style={{ minWidth: 220 }}>
          <div className="input-icon">
            <Search size={18} />
            <input
              className="input"
              placeholder="Buscar producto por nombre..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="chips">
          <button className={`chip ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>
            Todos ({products.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`chip ${String(cat) === String(c.id) ? 'active' : ''}`}
              onClick={() => setCat(c.id)}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card pad-0">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th className="num">Precio Venta</th>
                <th className="num">Costo</th>
                <th className="num">Margen</th>
                <th className="num">Stock</th>
                <th>Estado</th>
                <th className="right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="center muted" style={{ padding: 40 }}>
                    <Empty icon={Package} title="No se encontraron productos">
                      Crea un nuevo producto o cambia los filtros de búsqueda.
                    </Empty>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const margin = Number(p.price) - Number(p.cost)
                  const isLow = p.track_stock && p.stock <= p.min_stock
                  return (
                    <tr key={p.id} style={{ opacity: p.active ? 1 : 0.6 }}>
                      <td>
                        <div className="bold">{p.name}</div>
                        {!p.track_stock && <span className="xs muted">Sin control de stock</span>}
                      </td>
                      <td>
                        <span className="badge">
                          {p.categories?.icon || '🍹'} {p.categories?.name || 'Sin categoría'}
                        </span>
                      </td>
                      <td className="num money bold tone-primary">{money(p.price)}</td>
                      <td className="num money muted">{money(p.cost)}</td>
                      <td className="num money tone-success">{money(margin)}</td>
                      <td className="num">
                        {p.track_stock ? (
                          <span
                            className={`badge ${p.stock <= 0 ? 'cancelada' : isLow ? 'pendiente' : 'listo'}`}
                            style={p.stock <= 0 ? { color: 'var(--danger)', background: 'var(--danger-soft)' } : undefined}
                          >
                            {p.stock} u.
                          </span>
                        ) : (
                          <span className="muted xs">∞</span>
                        )}
                      </td>
                      <td>
                        <button
                          className={`badge ${p.active ? 'listo' : 'cancelada'}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleActive(p)}
                          title="Clic para cambiar estado"
                        >
                          <span className="dot" /> {p.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="right">
                        <button
                          className="icon-btn sm"
                          onClick={() => setEditProduct(p)}
                          title="Editar producto"
                        >
                          <Pencil size={14} />
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

      {/* Modal Producto */}
      {editProduct && (
        <Modal
          title={editProduct.id ? 'Editar Producto' : 'Nuevo Producto'}
          onClose={() => setEditProduct(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditProduct(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" form="prod-form" disabled={busy}>
                {busy ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : 'Guardar'}
              </button>
            </>
          }
        >
          <form id="prod-form" onSubmit={saveProduct} className="col gap-lg">
            <div className="field">
              <label>Nombre del producto *</label>
              <input
                className="input"
                required
                placeholder="ej. Paceña 620ml, Gin Tonic, Nachos"
                value={editProduct.name || ''}
                onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                autoFocus
              />
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Categoría</label>
                <select
                  className="select"
                  value={editProduct.category_id || ''}
                  onChange={(e) => setEditProduct({ ...editProduct, category_id: e.target.value })}
                >
                  <option value="">(Sin categoría)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Precio de Venta (Bs) *</label>
                <input
                  className="input"
                  type="number"
                  step="0.5"
                  min="0"
                  required
                  placeholder="0.00"
                  value={editProduct.price || ''}
                  onChange={(e) => setEditProduct({ ...editProduct, price: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Costo de Compra (Bs)</label>
                <input
                  className="input"
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="0.00"
                  value={editProduct.cost ?? ''}
                  onChange={(e) => setEditProduct({ ...editProduct, cost: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Stock Mínimo (Alerta)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={editProduct.min_stock ?? 5}
                  onChange={(e) => setEditProduct({ ...editProduct, min_stock: e.target.value })}
                />
              </div>

              {!editProduct.id && (
                <div className="field">
                  <label>Stock Inicial</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={editProduct.stock ?? 0}
                    onChange={(e) => setEditProduct({ ...editProduct, stock: e.target.value })}
                  />
                </div>
              )}
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={editProduct.track_stock ?? true}
                onChange={(e) => setEditProduct({ ...editProduct, track_stock: e.target.checked })}
              />
              <span>Controlar inventario (descontar automáticamente con cada venta)</span>
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={editProduct.active !== false}
                onChange={(e) => setEditProduct({ ...editProduct, active: e.target.checked })}
              />
              <span>Producto activo (disponible en cartas y pedidos)</span>
            </label>
          </form>
        </Modal>
      )}

      {/* Modal Categoría */}
      {editCategory && (
        <Modal
          title={editCategory.id ? 'Editar Categoría' : 'Nueva Categoría'}
          onClose={() => setEditCategory(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditCategory(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" form="cat-form" disabled={busy}>
                Guardar Categoría
              </button>
            </>
          }
        >
          <form id="cat-form" onSubmit={saveCategory} className="col gap-lg">
            <div className="field">
              <label>Nombre de la categoría *</label>
              <input
                className="input"
                required
                placeholder="ej. Cervezas, Cócteles, Piqueos"
                value={editCategory.name || ''}
                onChange={(e) => setEditCategory({ ...editCategory, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Emoji / Ícono</label>
                <input
                  className="input"
                  placeholder="ej. 🍺, 🍸, 🥃, 🍟"
                  value={editCategory.icon || '🍹'}
                  onChange={(e) => setEditCategory({ ...editCategory, icon: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Orden de visualización</label>
                <input
                  className="input"
                  type="number"
                  value={editCategory.sort_order ?? 0}
                  onChange={(e) => setEditCategory({ ...editCategory, sort_order: e.target.value })}
                />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {showQrModal && (
        <QrMenuModal onClose={() => setShowQrModal(false)} />
      )}
    </>
  )
}
