const nf = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const money = (n) => `Bs ${nf.format(Number(n || 0))}`

export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })

export const fmtTime = (d) => new Date(d).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })

export const fmtDateTime = (d) => `${fmtDate(d)} ${fmtTime(d)}`

export function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'ahora'
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h ${m % 60} min`
  return fmtDate(d)
}

/** YYYY-MM-DD en hora local */
export const isoDay = (d = new Date()) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

export const startOfDay = (day) => new Date(`${day}T00:00:00`).toISOString()
export const endOfDay = (day) => new Date(`${day}T23:59:59.999`).toISOString()

export const ROLE_LABEL = { admin: 'Administrador', cajero: 'Cajero', mesero: 'Mesero' }
export const STATUS_LABEL = {
  pendiente: 'Pendiente', listo: 'Listo', entregado: 'Entregado',
  abierta: 'Abierta', por_cobrar: 'Por cobrar', pagada: 'Pagada', cancelada: 'Cancelada', cerrada: 'Cerrada',
}
export const METHOD_LABEL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', qr: 'QR / Transferencia' }

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
