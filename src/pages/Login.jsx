import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { User, Lock, Eye, EyeOff, Crown, Wallet, Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'

export const HOME = { admin: '/admin', cajero: '/caja', mesero: '/mesas' }

export default function Login() {
  const { signIn, profile, session } = useAuth()
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session && profile?.active) return <Navigate to={HOME[profile.role]} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(user, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page" style={{ position: 'relative' }}>
      <ThemeToggle showLabel className="login-theme-btn" />
      <section className="login-hero">
        <div className="hero-orb" style={{ width: 220, height: 220, top: '12%', right: '14%', background: 'radial-gradient(circle at 30% 30%, #ffd27a, #ff5fa2 70%)' }} />
        <div className="hero-orb" style={{ width: 90, height: 90, top: '42%', left: '12%', background: 'radial-gradient(circle at 30% 30%, #b18cff, #5b2fd6)', animationDelay: '-3s' }} />
        <img src="./icon.svg" alt="" width="64" height="64" style={{ marginBottom: 24 }} />
        <h1>
          Tu bar, <span className="grad-text">bajo control</span> desde cualquier lugar.
        </h1>
        <p>Pedidos desde el celular del mesero, caja con arqueo, inventario y reportes en tiempo real.</p>
        <div className="hero-roles">
          <div className="hero-role"><Crown size={16} className="tone-violet" /> Administrador</div>
          <div className="hero-role"><Wallet size={16} className="tone-info" /> Cajero</div>
          <div className="hero-role"><Smartphone size={16} className="tone-primary" /> Mesero</div>
        </div>
      </section>

      <section className="login-form-wrap">
        <form className="login-card col gap-lg" onSubmit={submit}>
          <div>
            <img src="./icon.svg" alt="" width="52" height="52" style={{ marginBottom: 18 }} />
            <h2>Bienvenido 👋</h2>
            <p className="muted">Ingresa con tu usuario para comenzar el turno.</p>
          </div>

          <div className="field">
            <label htmlFor="login-user">Usuario</label>
            <div className="input-icon">
              <User size={18} />
              <input id="login-user" className="input" placeholder="ej. juan" autoComplete="username"
                autoCapitalize="none" value={user} onChange={(e) => setUser(e.target.value)} required />
            </div>
          </div>

          <div className="field">
            <label htmlFor="login-pass">Contraseña</label>
            <div className="input-icon" style={{ position: 'relative' }}>
              <Lock size={18} />
              <input id="login-pass" className="input" type={show ? 'text' : 'password'} placeholder="••••••••"
                autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="icon-btn sm" onClick={() => setShow(!show)}
                style={{ position: 'absolute', right: 7, top: 7 }} aria-label="Mostrar contraseña">
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && <div className="badge cancelada" style={{ padding: '10px 14px', borderRadius: 12, whiteSpace: 'normal', color: 'var(--danger)', background: 'var(--danger-soft)' }}>{error}</div>}

          <button id="login-submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : 'Ingresar'}
          </button>
          <p className="xs faint center">El sistema te mostrará la vista según tu rol.</p>
        </form>
      </section>
    </div>
  )
}
