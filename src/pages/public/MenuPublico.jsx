import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  Search, Wine, Sparkles, Bell, Heart, Check, X,
  AlertCircle, ChevronRight, Share2
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'

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
  const [waiterCalled, setWaiterCalled] = useState(false)

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

  const handleCallWaiter = () => {
    setWaiterCalled(true)
    setTimeout(() => setWaiterCalled(false), 5000)
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
            <button className="menu-icon-btn" onClick={handleShare} title="Compartir carta">
              <Share2 size={18} />
            </button>
            <Link to="/login" className="menu-staff-link" title="Acceso personal">
              Personal
            </Link>
          </div>
        </div>

        {/* Banner de Mesa si está presente */}
        {tableQuery && (
          <div className="menu-table-banner">
            <span className="menu-table-badge">
              📍 {tableInfo ? tableInfo.name : `Mesa #${tableQuery}`}
            </span>
            <span className="menu-table-hint">Pide tus tragos directo a tu mesero</span>
          </div>
        )}
      </header>

      <main className="menu-main-content">
        {/* Hero de bienvenida */}
        <section className="menu-hero">
          <h1>Nuestra Selección de <span className="grad-text">Tragos & Bebidas</span></h1>
          <p className="muted">Disfruta de coctelería de autor, cervezas artesanales y tragos clásicos preparados al momento.</p>
        </section>

        {/* Buscador y Filtro Rápido */}
        <section className="menu-search-section">
          <div className="menu-search-bar">
            <Search size={18} className="menu-search-icon" />
            <input
              type="text"
              placeholder="Buscar mojito, fernet, gin, cerveza..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="menu-search-input"
            />
            {search && (
              <button className="menu-clear-search" onClick={() => setSearch('')}>
                <X size={16} />
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

        {/* Categorías deslizables */}
        <nav className="menu-categories-scroll">
          <button
            className={`menu-cat-chip ${selectedCat === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCat('all')}
          >
            <Sparkles size={16} />
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
            <Check size={20} className="tone-success" />
            <div>
              <div className="bold">¡Mesero notificado!</div>
              <div className="xs muted">Enseguida se acercarán a tu mesa para tomar tu orden.</div>
            </div>
          </div>
        )}

        {/* Estado de Carga / Error */}
        {loading && (
          <div className="menu-loading">
            <div className="spinner" style={{ width: 36, height: 36 }} />
            <p className="muted mt">Preparando la carta...</p>
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
                const inWishlist = Boolean(wishlist[prod.id])
                const isOutOfStock = prod.track_stock && prod.stock <= 0
                const isLowStock = prod.track_stock && prod.stock > 0 && prod.stock <= prod.min_stock

                return (
                  <article
                    key={prod.id}
                    className={`menu-drink-card ${isOutOfStock ? 'out-of-stock' : ''}`}
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

                      <button
                        className={`menu-wish-btn ${inWishlist ? 'active' : ''}`}
                        onClick={() => toggleWishlist(prod)}
                        disabled={isOutOfStock}
                        title={inWishlist ? 'Quitar de mi lista' : 'Agregar a mi selección'}
                      >
                        <Heart size={16} fill={inWishlist ? 'currentColor' : 'none'} />
                        <span>{inWishlist ? 'En mi lista' : 'Quiero este'}</span>
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}

        {/* Sección de Asistencia al Cliente */}
        <section className="menu-help-card">
          <div className="menu-help-left">
            <div className="menu-help-icon">
              <Bell size={24} />
            </div>
            <div>
              <div className="bold">¿Listo para ordenar?</div>
              <div className="xs muted">
                {tableQuery
                  ? `Indica tus tragos al mesero cuando pase por tu mesa (${tableInfo?.name || 'Mesa #' + tableQuery}).`
                  : 'Acércate a la barra o solicita atención al personal del bar.'}
              </div>
            </div>
          </div>
          <button className="btn btn-primary menu-call-waiter-btn" onClick={handleCallWaiter}>
            <Bell size={16} /> Llamar Mesero
          </button>
        </section>
      </main>

      {/* Botón flotante de selección (Mi Lista) */}
      {wishlistCount > 0 && (
        <aside className="menu-float-bar">
          <div className="menu-float-info">
            <span className="menu-float-count">{wishlistCount}</span>
            <div>
              <div className="xs muted">Mi lista de tragos:</div>
              <div className="money bold">{money(wishlistTotal)}</div>
            </div>
          </div>
          <button
            className="btn btn-primary menu-float-action"
            onClick={() => setShowWishlist(true)}
          >
            Ver mi pedido ({wishlistCount}) <ChevronRight size={16} />
          </button>
        </aside>
      )}

      {/* Modal de Lista de Deseos / Tragos Seleccionados */}
      {showWishlist && (
        <div className="overlay" onClick={() => setShowWishlist(false)}>
          <div
            className="modal menu-wishlist-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Mi Selección para Ordenar</h3>
              <button className="icon-btn sm" onClick={() => setShowWishlist(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="small muted mb">
                Muestra esta lista a tu mesero cuando tome tu pedido en {tableInfo?.name || 'tu mesa'}:
              </p>

              <div className="menu-wishlist-items col gap-sm">
                {wishlistItems.map((item) => (
                  <div key={item.id} className="menu-wishlist-row">
                    <span className="menu-wishlist-emoji">{item.categories?.icon || '🍹'}</span>
                    <div className="grow">
                      <div className="bold small">{item.name}</div>
                      <div className="xs muted">{money(item.price)} c/u</div>
                    </div>
                    <div className="qty">
                      <button onClick={() => updateWishlistQty(item.id, -1)}>-</button>
                      <span className="qty-val">{item.qty}</span>
                      <button onClick={() => updateWishlistQty(item.id, 1)}>+</button>
                    </div>
                    <div className="money bold small right" style={{ width: 75 }}>
                      {money(item.price * item.qty)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="card mt menu-wishlist-summary">
                <div className="row-between">
                  <span className="bold">Total estimado:</span>
                  <span className="money grad-text bold" style={{ fontSize: 20 }}>
                    {money(wishlistTotal)}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowWishlist(false)}>
                Seguir explorando
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowWishlist(false)
                  handleCallWaiter()
                }}
              >
                <Bell size={16} /> ¡Llamar al Mesero!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
