import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BarChart3, Package, Boxes, Users, Wallet, Receipt, Beer,
  ChefHat, LayoutGrid, ClipboardList, LogOut, QrCode, Mail
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../hooks/useRealtime'
import { ROLE_LABEL, initials } from '../lib/format'
import QrMenuModal from './QrMenuModal'
import DailyReportModal from './DailyReportModal'
import ThemeToggle from './ThemeToggle'
import WaiterAlertBanner from './WaiterAlertBanner'

const ITEMS = {
  dashboard: { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  reportes: { to: '/admin/reportes', label: 'Reportes', icon: BarChart3 },
  productos: { to: '/admin/productos', label: 'Productos', icon: Package },
  inventario: { to: '/admin/inventario', label: 'Inventario', icon: Boxes },
  usuarios: { to: '/admin/usuarios', label: 'Usuarios', icon: Users },
  caja: { to: '/caja', label: 'Caja', icon: Wallet },
  cuentas: { to: '/cuentas', label: 'Cuentas', icon: Receipt, count: 'porCobrar' },
  barra: { to: '/barra', label: 'Venta barra', icon: Beer },
  comandas: { to: '/comandas', label: 'Comandas', icon: ChefHat, count: 'pendientes' },
  mesas: { to: '/mesas', label: 'Mesas', icon: LayoutGrid, count: 'llamadas' },
  misPedidos: { to: '/mis-pedidos', label: 'Mis pedidos', icon: ClipboardList, count: 'listos' },
}


const NAV = {
  admin: [
    { section: 'Administración', items: ['dashboard', 'reportes', 'productos', 'inventario', 'usuarios'] },
    { section: 'Operación', items: ['caja', 'cuentas', 'barra', 'comandas', 'mesas'] },
  ],
  cajero: [{ section: 'Caja', items: ['caja', 'cuentas', 'barra', 'comandas', 'mesas'] }],
  mesero: [{ section: 'Servicio', items: ['mesas', 'misPedidos'] }],
}

function useNavCounts(profile) {
  const [counts, setCounts] = useState({})
  const prevListos = useRef(0)

  const load = useCallback(async () => {
    if (!profile) return
    let llamadas = 0
    try {
      const { count: callCount } = await supabase
        .from('table_calls')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendiente')
      llamadas = callCount || 0
    } catch {}

    if (profile.role === 'mesero') {
      const { count } = await supabase
        .from('order_items')
        .select('id, orders!inner(waiter_id,status)', { count: 'exact', head: true })
        .eq('status', 'listo')
        .eq('orders.waiter_id', profile.id)
        .in('orders.status', ['abierta', 'por_cobrar'])
      const listos = count || 0
      if (listos > prevListos.current && navigator.vibrate) navigator.vibrate([120, 60, 120])
      prevListos.current = listos
      setCounts({ listos, llamadas: llamadas || undefined })
    } else {
      const [a, b] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'por_cobrar'),
        supabase
          .from('order_items')
          .select('id, orders!inner(status)', { count: 'exact', head: true })
          .eq('status', 'pendiente')
          .in('orders.status', ['abierta', 'por_cobrar']),
      ])
      setCounts({ porCobrar: a.count || 0, pendientes: b.count || 0, llamadas: llamadas || undefined })
    }
  }, [profile])

  useEffect(() => { load() }, [load])
  useRealtime(['orders', 'order_items', 'table_calls'], load, 400)

  return counts
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const counts = useNavCounts(profile)
  const [showQrModal, setShowQrModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  const groups = NAV[profile.role] || []
  const flat = groups.flatMap((g) => g.items.map((k) => ITEMS[k]))

  const current =
    [...flat].sort((a, b) => b.to.length - a.to.length).find((i) => pathname === i.to || pathname.startsWith(i.to + '/')) ||
    flat[0]

  const Count = ({ item }) => (item.count && counts[item.count] ? <span className="nav-count">{counts[item.count]}</span> : null)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="./icon.svg" alt="BarPOS" />
          <div>
            <div className="brand-name">BarPOS</div>
            <div className="brand-sub">{ROLE_LABEL[profile.role]}</div>
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.section}>
            <div className="nav-section">{g.section}</div>
            {g.items.map((k) => {
              const it = ITEMS[k]
              const Icon = it.icon
              return (
                <NavLink key={k} to={it.to} end={it.end} className="nav-link">
                  <Icon size={19} />
                  {it.label}
                  <Count item={it} />
                </NavLink>
              )
            })}
          </div>
        ))}
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initials(profile.full_name || profile.username)}</div>
            <div className="grow">
              <div className="bold truncate small">{profile.full_name || profile.username}</div>
              <div className="xs muted">@{profile.username}</div>
            </div>
            <ThemeToggle size="sm" title="Cambiar tema (Marfil / Oscuro)" />
            <button className="icon-btn sm" onClick={signOut} title="Cerrar sesión" id="logout-desktop">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{current?.label}</h1>
            <div className="sub">
              {new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <ThemeToggle size="sm" showLabel />
            <button
              className="btn btn-sm"
              onClick={() => setShowQrModal(true)}
              title="Ver o imprimir código QR para clientes"
            >
              <QrCode size={15} /> Menú QR
            </button>
            {profile.role === 'admin' && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setShowReportModal(true)}
                title="Mandar informe general del día al correo"
              >
                <Mail size={15} /> Mandar Reporte
              </button>
            )}
            <span className="badge live listo">
              <span className="dot" /> En línea
            </span>
          </div>
        </header>

        <header className="mobile-header">
          <div className="row">
            <div className="avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
              {initials(profile.full_name || profile.username)}
            </div>
            <div>
              <h1>{current?.label}</h1>
              <div className="xs muted">{profile.full_name || profile.username} · {ROLE_LABEL[profile.role]}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <ThemeToggle size="sm" />
            <button
              className="icon-btn"
              onClick={() => setShowQrModal(true)}
              aria-label="Menú QR"
              title="Menú QR"
            >
              <QrCode size={17} />
            </button>
            {profile.role === 'admin' && (
              <button
                className="icon-btn"
                onClick={() => setShowReportModal(true)}
                aria-label="Reporte del día"
                title="Reporte del día"
              >
                <Mail size={17} />
              </button>
            )}
            <button className="icon-btn" onClick={signOut} aria-label="Cerrar sesión" id="logout-mobile">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <WaiterAlertBanner />
        <main className="content" key={pathname}>
          <Outlet />
        </main>

      </div>

      <nav className="bottom-nav">
        {flat.map((it) => {
          const Icon = it.icon
          return (
            <NavLink key={it.to} to={it.to} end={it.end} className="bn-link">
              <Icon size={22} />
              {it.label}
              <Count item={it} />
            </NavLink>
          )
        })}
      </nav>

      {/* Modales globales de Menú QR y Reporte Diario */}
      {showQrModal && (
        <QrMenuModal onClose={() => setShowQrModal(false)} />
      )}

      {showReportModal && (
        <DailyReportModal onClose={() => setShowReportModal(false)} />
      )}
    </div>
  )
}
