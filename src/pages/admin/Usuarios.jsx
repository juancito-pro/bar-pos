import { useCallback, useEffect, useState } from 'react'
import { Users, UserPlus, Shield, UserCheck, UserX, KeyRound } from 'lucide-react'
import { supabase, createIsolatedClient, toEmail, errMsg } from '../../lib/supabase'
import { ROLE_LABEL, fmtDateTime, initials } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useRealtime } from '../../hooks/useRealtime'
import { useToast } from '../../components/Toast'
import { Loader, Empty, StatusBadge } from '../../components/ui'
import Modal from '../../components/Modal'

export default function Usuarios() {
  const { profile: myProfile } = useAuth()
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', full_name: '', password: '', role: 'mesero' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['profiles'], load)

  const handleCreate = async (e) => {
    e.preventDefault()
    setBusy(true)

    try {
      const email = toEmail(newUser.username)
      const isolated = createIsolatedClient()

      // Registrar cuenta de usuario en Supabase Auth
      const { data: authData, error: authError } = await isolated.auth.signUp({
        email,
        password: newUser.password,
        options: {
          data: {
            username: newUser.username.trim().toLowerCase(),
            full_name: newUser.full_name.trim(),
          },
        },
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('No se pudo crear el usuario')

      // Darle el rol deseado y activarlo
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: newUser.full_name.trim(),
          role: newUser.role,
          active: true,
        })
        .eq('id', authData.user.id)

      if (profileError) throw profileError

      toast(`Usuario @${newUser.username} creado exitosamente`)
      setShowCreate(false)
      setNewUser({ username: '', full_name: '', password: '', role: 'mesero' })
      load()
    } catch (err) {
      toast(errMsg(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const updateRole = async (user, newRole) => {
    if (user.id === myProfile.id && newRole !== 'admin') {
      return toast('No puedes quitarte el rol de administrador a ti mismo', 'error')
    }
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', user.id)
    if (error) return toast(errMsg(error), 'error')
    toast(`Rol de @${user.username} cambiado a ${ROLE_LABEL[newRole]}`)
    load()
  }

  const toggleActive = async (user) => {
    if (user.id === myProfile.id) {
      return toast('No puedes desactivar tu propia cuenta', 'error')
    }
    const nextState = !user.active
    const { error } = await supabase.from('profiles').update({ active: nextState }).eq('id', user.id)
    if (error) return toast(errMsg(error), 'error')
    toast(nextState ? `Usuario @${user.username} activado` : `Usuario @${user.username} desactivado`)
    load()
  }

  if (loading) return <Loader />

  const counts = {
    admin: users.filter((u) => u.role === 'admin').length,
    cajero: users.filter((u) => u.role === 'cajero').length,
    mesero: users.filter((u) => u.role === 'mesero').length,
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Equipo y Permisos</h2>
          <div className="muted small">Crea usuarios para tu personal y asígnales el rol correspondiente.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <UserPlus size={16} /> Nuevo Personal
        </button>
      </div>

      <div className="grid grid-3 keep-2 mb">
        <div className="card row" style={{ padding: 14 }}>
          <div className="avatar tone-violet" style={{ background: 'var(--violet-soft)' }}>
            <Shield size={20} />
          </div>
          <div>
            <div className="bold">{counts.admin} Administradores</div>
            <div className="xs muted">Acceso total al sistema</div>
          </div>
        </div>
        <div className="card row" style={{ padding: 14 }}>
          <div className="avatar tone-info" style={{ background: 'var(--info-soft)' }}>
            <Users size={20} />
          </div>
          <div>
            <div className="bold">{counts.cajero} Cajeros</div>
            <div className="xs muted">Caja, cobros y barra</div>
          </div>
        </div>
        <div className="card row" style={{ padding: 14 }}>
          <div className="avatar tone-primary" style={{ background: 'var(--primary-soft)' }}>
            <Users size={20} />
          </div>
          <div>
            <div className="bold">{counts.mesero} Meseros</div>
            <div className="xs muted">Toman pedidos por celular</div>
          </div>
        </div>
      </div>

      <div className="card pad-0">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre Completo</th>
                <th>Rol en el Bar</th>
                <th>Estado</th>
                <th>Fecha de Alta</th>
                <th className="right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === myProfile.id
                return (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : 0.6 }}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div className="avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
                          {initials(u.full_name || u.username)}
                        </div>
                        <div>
                          <div className="bold">
                            @{u.username} {isMe && <span className="xs muted">(Tú)</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{u.full_name || <span className="muted">—</span>}</td>
                    <td>
                      <select
                        className="select"
                        style={{ height: 32, padding: '0 28px 0 10px', fontSize: 13, width: 140 }}
                        value={u.role}
                        disabled={isMe}
                        onChange={(e) => updateRole(u, e.target.value)}
                      >
                        <option value="mesero">Mesero</option>
                        <option value="cajero">Cajero</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${u.active ? 'listo' : 'cancelada'}`}>
                        <span className="dot" />
                        {u.active ? 'Activo' : 'Desactivado'}
                      </span>
                    </td>
                    <td className="muted xs">{fmtDateTime(u.created_at)}</td>
                    <td className="right">
                      {!isMe && (
                        <button
                          className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-success'}`}
                          onClick={() => toggleActive(u)}
                        >
                          {u.active ? <UserX size={14} /> : <UserCheck size={14} />}
                          {u.active ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear Usuario */}
      {showCreate && (
        <Modal
          title="Crear Nuevo Usuario"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowCreate(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" form="user-form" disabled={busy}>
                {busy ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : 'Crear Usuario'}
              </button>
            </>
          }
        >
          <form id="user-form" onSubmit={handleCreate} className="col gap-lg">
            <div className="field">
              <label>Nombre de usuario (Login) *</label>
              <input
                className="input"
                required
                autoCapitalize="none"
                placeholder="ej. juan, maria, cajero1"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                autoFocus
              />
              <span className="xs faint">Se usará para iniciar sesión en la aplicación.</span>
            </div>

            <div className="field">
              <label>Nombre y Apellido *</label>
              <input
                className="input"
                required
                placeholder="ej. Juan Pérez"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Contraseña inicial *</label>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Rol asignado</label>
              <select
                className="select"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="mesero">Mesero (Toma pedidos desde el celular)</option>
                <option value="cajero">Cajero (Caja, arqueo, cobros y ventas en barra)</option>
                <option value="admin">Administrador (Control total, reportes e inventario)</option>
              </select>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
