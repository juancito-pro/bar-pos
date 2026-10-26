import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  Search, Wine, Sparkles, Bell, Heart, Check, X,
  AlertCircle, ChevronRight, Share2, Plus, Minus, Smartphone, ShoppingBag
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { sendWaiterCall } from '../../lib/waiterCalls'
import ThemeToggle from '../../components/ThemeToggle'

export default function MenuPublico() {
  const { mesa: paramMesa } = useParams()
  const [searchParams] = useSearchParams()
  const tableQuery = paramMesa || searchParams.get('mesa')

  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [tableInfo, setTableInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedCat, setSelectedCat] = useState('all')
  const [search, setSearch] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  const [wishlist, setWishlist] = useState({}) // { [id]: qty }
  const [showWishlist, setShowWishlist] = useState(false)
  const [showBillboard, setShowBillboard] = useState(false)
  const [waiterCalled, setWaiterCalled] = useState(false)
  const [callingWaiter, setCallingWaiter] = useState(false)
  const [callSuccessMsg, setCallSuccessMsg] = useState('')


  // Cargar catálogo de tragos y mesa
  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true)
        setError(null)

        const [catRes, prodRes] = await Promise.all([
          supabase.from('categories').select('*').order('sort_order'),
          supabase.from('products').select('*, categories(name, icon)').eq('active', true).order('name'),
        ])

        if (catRes.error) throw catRes.error
        if (prodRes.error) throw prodRes.error

        setCategories(catRes.data || [])
        setProducts(prodRes.data || [])

        // Si se especificó mesa, buscar datos de la mesa
        if (tableQuery) {
          const num = parseInt(tableQuery, 10)
          if (!isNaN(num)) {
            const { data: tData } = await supabase
              .from('bar_tables')
              .select('*')
              .eq('number', num)
              .maybeSingle()
            if (tData) setTableInfo(tData)
          }
        }
      } catch (err) {
        console.error('Error cargando menú digital:', err)
        setError('No pudimos cargar la carta en este momento. Revisa tu conexión.')
      } finally {
        setLoading(false)
      }
    }

    loadCatalog()
  }, [tableQuery])

  // Filtrado de productos disponibles
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Filtro de disponibilidad
      if (onlyAvailable && p.track_stock && p.stock <= 0) return false

      // Filtro de categoría
      if (selectedCat !== 'all' && p.category_id !== selectedCat) return false

      // Filtro de búsqueda
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesName = p.name.toLowerCase().includes(q)
        const matchesCat = p.categories?.name?.toLowerCase().includes(q)
        if (!matchesName && !matchesCat) return false
      }

      return true
    })
  }, [products, selectedCat, search, onlyAvailable])

  // Agrupados por categoría para vista organizada
  const groupedByCategory = useMemo(() => {
    if (selectedCat !== 'all') {
      const catObj = categories.find((c) => c.id === selectedCat)
      return [{
        category: catObj || { name: 'Selección', icon: '🍸' },
        items: filteredProducts
      }]
    }

    const map = new Map()
    categories.forEach((cat) => map.set(cat.id, { category: cat, items: [] }))
    const uncategorized = { category: { id: 0, name: 'Otros tragos', icon: '🍹' }, items: [] }

    filteredProducts.forEach((p) => {
      if (p.category_id && map.has(p.category_id)) {
        map.get(p.category_id).items.push(p)
      } else {
        uncategorized.items.push(p)
      }
    })

    const groups = Array.from(map.values()).filter((g) => g.items.length > 0)
    if (uncategorized.items.length > 0) groups.push(uncategorized)
    return groups
  }, [categories, filteredProducts, selectedCat])

  // Manejo de la lista de deseos / pre-orden
  const toggleWishlist = (product) => {
    setWishlist((prev) => {
      const current = prev[product.id] || 0
      if (current > 0) {
        const next = { ...prev }
        delete next[product.id]
        return next
      } else {
        return { ...prev, [product.id]: 1 }
      }
    })
  }

  const updateWishlistQty = (id, delta) => {
    setWishlist((prev) => {
      const current = prev[id] || 0
      const nextVal = current + delta
      if (nextVal <= 0) {
        const copy = { ...prev }
        delete copy[id]
        return copy
      }
      return { ...prev, [id]: nextVal }
    })
  }

  const wishlistItems = useMemo(() => {
    return Object.entries(wishlist)
      .map(([id, qty]) => {
        const prod = products.find((p) => p.id === Number(id))
        return prod ? { ...prod, qty } : null
      })
      .filter(Boolean)
  }, [wishlist, products])

  const wishlistTotal = wishlistItems.reduce((acc, item) => acc + item.price * item.qty, 0)
  const wishlistCount = wishlistItems.reduce((acc, item) => acc + item.qty, 0)

  const handleCallWaiter = async () => {
    if (callingWaiter) return
    setCallingWaiter(true)

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([120, 60, 120])
    }

    const tNumber = tableQuery ? Number(tableQuery) || 0 : (tableInfo?.number || 0)
    const itemsFormatted = wishlistItems.map((it) => ({
      id: it.id,
      name: it.name,
      price: it.price,
      qty: it.qty,
      category: it.categories?.name || 'Trago',
    }))

    const hasItems = itemsFormatted.length > 0

    try {
      await sendWaiterCall({
        tableId: tableInfo?.id || null,
        tableNumber: tNumber,
        type: hasItems ? 'pedido' : 'llamado',
        items: itemsFormatted,
        total: wishlistTotal,
        notes: hasItems
          ? `Selección de ${itemsFormatted.length} bebida(s) desde el Menú QR`
          : 'Solicitud de mesero desde el Menú QR',
      })

      setWaiterCalled(true)
      const successText = hasItems
        ? `🔔 ¡Mesero notificado con tu selección de ${wishlistCount} bebida(s)! En breve se acerca a tu mesa.`
        : (tNumber ? `🔔 ¡Mesero avisado para la Mesa #${tNumber}!` : '🔔 ¡Mesero avisado! En breve se acerca a atenderte.')
      setCallSuccessMsg(successText)

      setTimeout(() => {
        setWaiterCalled(false)
        setCallSuccessMsg('')
      }, 7000)
    } catch (err) {
      console.error('Error al llamar mesero:', err)
      setWaiterCalled(true)
      setTimeout(() => setWaiterCalled(false), 5000)
    } finally {
      setCallingWaiter(false)
    }
  }


  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Menú Digital – BarPOS',
        text: '¡Mira la carta de tragos disponibles!',
        url: window.location.href,
      }).catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
      alert('¡Enlace de la carta copiado al portapapeles!')
    }
  }

  return (
    <div className="menu-publico-page">
      {/* Fondo decorativo con luces de neón de bar */}
      <div className="menu-glow-top" />
      <div className="menu-glow-bottom" />

      {/* Barra superior fija */}
      <header className="menu-header">
        <div className="menu-header-content">
          <div className="menu-brand">
            <span className="menu-logo">🍸</span>
            <div>
              <div className="menu-title">BarPOS</div>
              <div className="menu-subtitle">Carta Digital & Tragos</div>
            </div>
          </div>

          <div className="menu-header-actions">
            <ThemeToggle size="sm" />
            <button className="menu-icon-btn" onClick={handleShare} title="Compartir carta">
              <Share2 size={18} />
            </button>
            <Link to="/login" className="menu-staff-link" title="Acceso personal">
              Personal
            </Link>
          </div>
        </div>

        {/* Banner de Mesa y Llamado Rápido al Mesero */}
        <div className="menu-table-banner">
          <div className="row" style={{ gap: 8 }}>
            <span className="menu-table-badge">
              📍 {tableInfo ? tableInfo.name : tableQuery ? `Mesa #${tableQuery}` : 'Barra / Salón General'}
            </span>
            <span className="menu-table-hint">Disponibilidad en vivo</span>
          </div>
          <button
            className={`btn btn-sm ${waiterCalled ? 'btn-success' : 'btn-primary'} menu-quick-waiter-btn`}
            onClick={handleCallWaiter}
            disabled={callingWaiter}
            title="Avisar al mesero para que se acerque a tu mesa"
          >
            <Bell size={15} className={waiterCalled ? '' : 'bell-shake'} />
            <span>{callingWaiter ? 'Enviando...' : waiterCalled ? '¡Mesero Notificado!' : 'Llamar Mesero'}</span>
          </button>
        </div>

        {/* Notificación flotante de confirmación para el cliente */}
        {callSuccessMsg && (
          <div
            style={{
              background: 'linear-gradient(135deg, hsla(45, 95%, 50%, 0.95), hsla(36, 95%, 45%, 0.95))',
              color: '#111',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              textAlign: 'center',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              animation: 'slideDownIn .3s ease-out',
            }}
          >
            <Bell size={16} className="bell-shake" />
            <span>{callSuccessMsg}</span>
          </div>
        )}
      </header>


      <main className="menu-main-content">
        {/* Hero de bienvenida con guía intuitiva rápida */}
        <section className="menu-hero">
          <h1>Nuestra Selección de <span className="grad-text">Tragos & Bebidas</span></h1>
          <p className="muted">Carta interactiva: añade tus tragos con el botón <strong>+ Pedir</strong> y muéstraselo al mesero con 1 toque.</p>
        </section>

        {/* Buscador y Filtro Rápido con botones grandes */}
        <section className="menu-search-section">
          <div className="menu-search-bar">
            <Search size={20} className="menu-search-icon" />
            <input
              type="text"
              placeholder="Buscar mojito, fernet, cerveza, trago..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="menu-search-input"
            />
            {search && (
              <button className="menu-clear-search" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
                <X size={18} />
              </button>
            )}
          </div>

          <div className="menu-filter-toggle">
            <label className="menu-checkbox-label">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
              />
              <span>Solo tragos disponibles ahora</span>
            </label>
            <span className="menu-total-count">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'opción' : 'opciones'}
            </span>
          </div>
        </section>

        {/* Categorías deslizables con botones grandes */}
        <nav className="menu-categories-scroll">
          <button
            className={`menu-cat-chip ${selectedCat === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCat('all')}
          >
            <Sparkles size={18} />
            <span>Todos</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`menu-cat-chip ${selectedCat === c.id ? 'active' : ''}`}
              onClick={() => setSelectedCat(c.id)}
            >
              <span className="menu-cat-icon">{c.icon || '🍹'}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </nav>

        {/* Mensaje de Llamado a Mesero */}
        {waiterCalled && (
          <div className="menu-toast-alert animate-pop">
            <Check size={22} className="tone-success" />
            <div>
              <div className="bold">¡Mesero notificado! 🛎️</div>
              <div className="xs muted">Enseguida se acercarán a {tableInfo ? tableInfo.name : tableQuery ? `tu Mesa #${tableQuery}` : 'tu lugar'} para tomar tu orden.</div>
            </div>
          </div>
        )}

        {/* Estado de Carga / Error */}
        {loading && (
          <div className="menu-loading">
            <div className="spinner" style={{ width: 40, height: 40 }} />
            <p className="muted mt">Cargando la carta de tragos...</p>
          </div>
        )}

        {error && (
          <div className="card menu-error-card">
            <AlertCircle size={28} className="tone-danger" />
            <div>
              <div className="bold">No se pudo cargar la carta</div>
              <div className="small muted">{error}</div>
            </div>
          </div>
        )}

        {/* Lista de Tragos por Categoría */}
        {!loading && !error && groupedByCategory.length === 0 && (
          <div className="menu-empty">
            <Wine size={48} className="menu-empty-icon" />
            <h3>No encontramos tragos</h3>
            <p className="muted small">Intenta con otro término de búsqueda o desactiva el filtro de disponibles.</p>
            {search && (
              <button className="btn btn-sm mt" onClick={() => setSearch('')}>
                Limpiar búsqueda
              </button>
            )}
          </div>
        )}

        {!loading && !error && groupedByCategory.map((group) => (
          <section key={group.category.id || group.category.name} className="menu-category-group">
            <div className="menu-group-header">
              <span className="menu-group-icon">{group.category.icon || '🍸'}</span>
              <h2>{group.category.name}</h2>
              <span className="menu-group-badge">{group.items.length}</span>
            </div>

            <div className="menu-drinks-grid">
              {group.items.map((prod) => {
                const qty = wishlist[prod.id] || 0
                const isOutOfStock = prod.track_stock && prod.stock <= 0
                const isLowStock = prod.track_stock && prod.stock > 0 && prod.stock <= prod.min_stock

                return (
                  <article
                    key={prod.id}
                    className={`menu-drink-card ${isOutOfStock ? 'out-of-stock' : ''} ${qty > 0 ? 'selected' : ''}`}
                  >
                    <div className="menu-drink-top">
                      <span className="menu-drink-icon">
                        {prod.categories?.icon || '🍹'}
                      </span>
                      {isOutOfStock ? (
                        <span className="menu-stock-tag out">Agotado hoy</span>
                      ) : isLowStock ? (
                        <span className="menu-stock-tag low">Últimas {prod.stock}</span>
                      ) : (
                        <span className="menu-stock-tag ready">Disponible</span>
                      )}
                    </div>

                    <div className="menu-drink-body">
                      <h3 className="menu-drink-name">{prod.name}</h3>
                      <div className="menu-drink-category">{prod.categories?.name || 'Trago'}</div>
                    </div>

                    <div className="menu-drink-footer">
                      <div className="menu-drink-price money">
                        {money(prod.price)}
                      </div>

                      {qty === 0 ? (
                        <button
                          type="button"
                          className="menu-btn-add"
                          onClick={() => updateWishlistQty(prod.id, 1)}
                          disabled={isOutOfStock}
                          title={`Pedir ${prod.name}`}
                        >
                          <Plus size={18} />
                          <span>Pedir</span>
                        </button>
                      ) : (
                        <div className="menu-stepper-big">
                          <button
                            type="button"
                            className="menu-step-btn minus"
                            onClick={() => updateWishlistQty(prod.id, -1)}
                            aria-label="Restar uno"
                            title="Quitar uno"
                          >
                            <Minus size={18} />
                          </button>
                          <span className="menu-step-count">{qty}</span>
                          <button
                            type="button"
                            className="menu-step-btn plus"
                            onClick={() => updateWishlistQty(prod.id, 1)}
                            disabled={prod.track_stock && qty >= prod.stock}
                            aria-label="Sumar uno"
                            title="Agregar otro"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}

        {/* Sección de Asistencia al Cliente con Botón Gigante */}
        <section className="menu-help-card">
          <div className="menu-help-left">
            <div className="menu-help-icon">
              <Bell size={26} />
            </div>
            <div>
              <div className="bold" style={{ fontSize: 16 }}>¿Listo para ordenar tus bebidas?</div>
              <div className="xs muted mt-xs">
                {tableQuery
                  ? `Indica tus tragos al mesero cuando pase por tu mesa (${tableInfo?.name || 'Mesa #' + tableQuery}).`
                  : 'Acércate a la barra o solicita atención al personal del bar.'}
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-lg menu-call-waiter-btn" onClick={handleCallWaiter}>
            <Bell size={18} /> {waiterCalled ? '¡Mesero Avisado!' : 'Llamar al Mesero'}
          </button>
        </section>
      </main>

      {/* Botón flotante grande de selección (Mi Lista) */}
      {wishlistCount > 0 && (
        <aside className="menu-float-bar">
          <div
            className="menu-float-info"
            onClick={() => setShowWishlist(true)}
            style={{ cursor: 'pointer' }}
          >
            <span className="menu-float-count">{wishlistCount}</span>
            <div>
              <div className="xs muted">Mi Selección:</div>
              <div className="money bold" style={{ fontSize: 18 }}>{money(wishlistTotal)}</div>
            </div>
          </div>
          <button
            className="btn btn-primary menu-float-action"
            onClick={() => setShowWishlist(true)}
          >
            <ShoppingBag size={18} /> Ver mi pedido ({wishlistCount}) <ChevronRight size={16} />
          </button>
        </aside>
      )}

      {/* Modal de Lista de Deseos con Botones Grandes */}
      {showWishlist && (
        <div className="overlay" onClick={() => setShowWishlist(false)}>
          <div
            className="modal menu-wishlist-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Mi Selección para Ordenar</h3>
              <button className="icon-btn sm" onClick={() => setShowWishlist(false)} aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="small muted mb">
                Muestra esta lista a tu mesero cuando tome tu pedido en <strong>{tableInfo?.name || (tableQuery ? `Mesa #${tableQuery}` : 'tu mesa')}</strong>:
              </p>

              <div className="menu-wishlist-items col gap-sm">
                {wishlistItems.map((item) => (
                  <div key={item.id} className="menu-wishlist-row">
                    <span className="menu-wishlist-emoji">{item.categories?.icon || '🍹'}</span>
                    <div className="grow">
                      <div className="bold small">{item.name}</div>
                      <div className="xs muted">{money(item.price)} c/u</div>
                    </div>
                    <div className="menu-stepper-big sm">
                      <button
                        className="menu-step-btn minus"
                        onClick={() => updateWishlistQty(item.id, -1)}
                        aria-label="Restar uno"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="menu-step-count">{item.qty}</span>
                      <button
                        className="menu-step-btn plus"
                        onClick={() => updateWishlistQty(item.id, 1)}
                        disabled={item.track_stock && item.qty >= item.stock}
                        aria-label="Sumar uno"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="money bold small right" style={{ width: 80 }}>
                      {money(item.price * item.qty)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="card mt menu-wishlist-summary">
                <div className="row-between">
                  <span className="bold">Total estimado:</span>
                  <span className="money grad-text bold" style={{ fontSize: 24 }}>
                    {money(wishlistTotal)}
                  </span>
                </div>
              </div>

              {/* Botones Grandes de Acción */}
              <div className="col gap-md mt">
                <button
                  className="btn btn-primary btn-lg btn-block"
                  onClick={() => {
                    setShowWishlist(false)
                    handleCallWaiter()
                  }}
                >
                  <Bell size={20} /> ¡Llamar al Mesero para Pedir!
                </button>
                <button
                  className="btn btn-lg btn-block"
                  onClick={() => {
                    setShowWishlist(false)
                    setShowBillboard(true)
                  }}
                  title="Modo pantalla grande para mostrar al mesero sin gritar en el bar"
                >
                  <Smartphone size={18} /> Mostrar pantalla al Mesero
                </button>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-block" onClick={() => setShowWishlist(false)}>
                Seguir viendo la carta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pantalla Gigante para Mostrar al Mesero sin esfuerzo en el bar ruidoso */}
      {showBillboard && (
        <div className="overlay" onClick={() => setShowBillboard(false)}>
          <div className="modal menu-billboard-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="row" style={{ gap: 8 }}>
                <Smartphone size={20} className="tone-primary" />
                <h3 style={{ fontSize: 18 }}>Mostrar al Mesero</h3>
              </div>
              <button className="icon-btn sm" onClick={() => setShowBillboard(false)} aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body center" style={{ padding: '24px 20px' }}>
              <div className="menu-billboard-badge">
                📍 {tableInfo ? tableInfo.name : tableQuery ? `MESA #${tableQuery}` : 'MI PEDIDO'}
              </div>
              <p className="small muted mt" style={{ marginBottom: 18 }}>
                Gira tu pantalla para que el mesero lea tu pedido directamente:
              </p>

              <div className="menu-billboard-list col gap-md">
                {wishlistItems.map((item) => (
                  <div key={item.id} className="menu-billboard-item">
                    <span className="menu-billboard-qty">{item.qty}x</span>
                    <span className="menu-billboard-name">{item.name}</span>
                    <span className="menu-billboard-sub money">{money(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>

              <div className="menu-billboard-total mt">
                <span className="small muted">Total:</span>
                <span className="money grad-text bold" style={{ fontSize: 32, display: 'block', marginTop: 4 }}>
                  {money(wishlistTotal)}
                </span>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary btn-block btn-lg" onClick={() => setShowBillboard(false)}>
                <Check size={18} /> Listo, volver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
