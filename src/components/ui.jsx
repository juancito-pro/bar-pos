import { Inbox } from 'lucide-react'

export function Loader({ full = true }) {
  return (
    <div className={full ? 'loader-full' : 'center'} style={full ? undefined : { padding: 30 }}>
      <div className="spinner" style={{ margin: '0 auto' }} />
    </div>
  )
}

export function Empty({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} />
      </div>
      <div className="bold" style={{ color: 'var(--text)' }}>{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  )
}

export function Stat({ icon: Icon, label, value, tone = 'primary', hint }) {
  return (
    <div className={`card stat tone-${tone}`}>
      <div className={`stat-icon bg-${tone}`}>
        <Icon size={20} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: 'var(--text)' }}>{value}</div>
      {hint && <div className="xs faint" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export function StatusBadge({ status, label }) {
  return (
    <span className={`badge ${status}`}>
      <span className="dot" />
      {label}
    </span>
  )
}
