import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Loader } from './components/ui'
import SetupGuide from './components/SetupGuide'
import Layout from './components/Layout'
import Login from './pages/Login'

// Vistas Mesero
import Mesas from './pages/mesero/Mesas'
import MesaPedido from './pages/mesero/MesaPedido'
import MisPedidos from './pages/mesero/MisPedidos'

// Vistas Cajero
import Caja from './pages/cajero/Caja'
import Cuentas from './pages/cajero/Cuentas'
import Barra from './pages/cajero/Barra'
import Comandas from './pages/cajero/Comandas'

// Vistas Admin
import Dashboard from './pages/admin/Dashboard'
import Reportes from './pages/admin/Reportes'
import Productos from './pages/admin/Productos'
import Inventario from './pages/admin/Inventario'
import Usuarios from './pages/admin/Usuarios'

const HOME_BY_ROLE = {
  admin: '/admin',
  cajero: '/caja',
  mesero: '/mesas',
}

function ProtectedRoute({ children, allowedRoles }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loader full />

  if (!session || !profile || !profile.active) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={HOME_BY_ROLE[profile.role] || '/login'} replace />
  }

  return children
}

export default function App() {
  const { isConfigured, session, profile, loading } = useAuth()

  if (!isConfigured) {
    return <SetupGuide />
  }

  if (loading) {
    return <Loader full />
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Redirección por defecto según rol */}
      <Route
        path="/"
        element={
          session && profile?.active ? (
            <Navigate to={HOME_BY_ROLE[profile.role] || '/login'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Rutas compartidas y por rol dentro del Layout principal */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Rutas disponibles para todos los roles (mesero, cajero, admin) */}
        <Route path="/mesas" element={<Mesas />} />
        <Route path="/mesas/:id" element={<MesaPedido />} />

        {/* Solo Mesero */}
        <Route
          path="/mis-pedidos"
          element={
            <ProtectedRoute allowedRoles={['mesero', 'admin']}>
              <MisPedidos />
            </ProtectedRoute>
          }
        />

        {/* Cajero y Admin */}
        <Route
          path="/caja"
          element={
            <ProtectedRoute allowedRoles={['cajero', 'admin']}>
              <Caja />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cuentas"
          element={
            <ProtectedRoute allowedRoles={['cajero', 'admin']}>
              <Cuentas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/barra"
          element={
            <ProtectedRoute allowedRoles={['cajero', 'admin']}>
              <Barra />
            </ProtectedRoute>
          }
        />
        <Route
          path="/comandas"
          element={
            <ProtectedRoute allowedRoles={['cajero', 'admin']}>
              <Comandas />
            </ProtectedRoute>
          }
        />

        {/* Solo Administrador */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reportes"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Reportes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/productos"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Productos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/inventario"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Inventario />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/usuarios"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Usuarios />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
