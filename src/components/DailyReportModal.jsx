import { useCallback, useEffect, useState } from 'react'
import {
  Mail, Send, Copy, Download, Check, FileText
} from 'lucide-react'
import Modal from './Modal'
import { supabase, toEmail } from '../lib/supabase'
import {
  money, isoDay, startOfDay, endOfDay, fmtDate, fmtTime
} from '../lib/format'
import { useAuth } from '../context/AuthContext'

export default function DailyReportModal({ onClose, targetDate = isoDay() }) {
  const { profile } = useAuth()
  const [recipientEmail, setRecipientEmail] = useState('')
  const [userEmails, setUserEmails] = useState([])
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState(false)
  const [sentNotice, setSentNotice] = useState(false)

  // Cargar lista de usuarios / correos registrados y datos del reporte del día
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)

        // 1. Obtener perfiles de usuarios para sugerir correos/gmails
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, role')
          .eq('active', true)
          .order('role')

        const suggestedEmails = (profiles || []).map((p) => {
          const email = toEmail(p.username)
          return {
            username: p.username,
            name: p.full_name || p.username,
            role: p.role,
            email,
          }
        })
        setUserEmails(suggestedEmails)

        // Correo predeterminado: el del usuario actual o el primer admin
        const adminUser = suggestedEmails.find((u) => u.role === 'admin') || suggestedEmails[0]
        if (adminUser) {
          setRecipientEmail(adminUser.email)
        }

        // 2. Obtener datos financieros y de ventas del día
        const a = startOfDay(targetDate)
        const b = endOfDay(targetDate)

        const [ordersRes, paysRes, sessionsRes] = await Promise.all([
          supabase
            .from('orders')
            .select(`
              id, total, type, paid_at, waiter_id,
              waiter:profiles!waiter_id(full_name, username),
              order_items(product_id, product_name, quantity, unit_price, products(cost))
            `)
            .eq('status', 'pagada')
            .gte('paid_at', a)
            .lte('paid_at', b)
            .order('paid_at'),
          supabase
            .from('payments')
            .select('method, amount, created_at')
            .gte('created_at', a)
            .lte('created_at', b),
          supabase
            .from('cash_sessions')
            .select('*, cashier:profiles!cashier_id(full_name, username)')
            .gte('opened_at', a)
            .lte('opened_at', b)
            .order('opened_at', { ascending: false }),
        ])

        const orders = ordersRes.data || []
        const payments = paysRes.data || []
        const sessions = sessionsRes.data || []

        let totalRevenue = 0
        let totalCost = 0
        const byProduct = {}
        const byWaiter = {}
        const byMethod = { efectivo: 0, tarjeta: 0, qr: 0 }

        orders.forEach((o) => {
          totalRevenue += Number(o.total || 0)
          const waiterName = o.type === 'barra'
            ? 'Barra (caja directa)'
            : (o.waiter?.full_name || o.waiter?.username || 'Sin mesero')

          byWaiter[waiterName] = byWaiter[waiterName] || { count: 0, total: 0 }
          byWaiter[waiterName].count += 1
          byWaiter[waiterName].total += Number(o.total || 0)

          ;(o.order_items || []).forEach((item) => {
            const name = item.product_name
            const cost = Number(item.products?.cost || 0) * item.quantity
            const subtotal = Number(item.unit_price) * item.quantity

            byProduct[name] = byProduct[name] || { name, qty: 0, revenue: 0, cost: 0 }
            byProduct[name].qty += item.quantity
            byProduct[name].revenue += subtotal
            byProduct[name].cost += cost
            totalCost += cost
          })
        })

        payments.forEach((p) => {
          const m = p.method?.toLowerCase()
          if (byMethod[m] !== undefined) {
            byMethod[m] += Number(p.amount || 0)
          }
        })

        const topProducts = Object.values(byProduct)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 8)

        setReportData({
          date: targetDate,
          generatedAt: new Date(),
          totalRevenue,
          totalCost,
          profit: totalRevenue - totalCost,
          ordersCount: orders.length,
          byMethod,
          topProducts,
          byWaiter: Object.entries(byWaiter).map(([name, data]) => ({ name, ...data })),
          sessions,
        })
      } catch (err) {
        console.error('Error cargando informe diario:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [targetDate])

  // Formato de texto para el cuerpo del correo
  const generateEmailBody = useCallback(() => {
    if (!reportData) return ''

    const lines = [
      `🍸 ==========================================`,
      `   BARPOS - INFORME GENERAL DEL DÍA`,
      `==========================================`,
      `📅 Fecha: ${fmtDate(reportData.date + 'T12:00:00')}`,
      `⏰ Hora de generación: ${fmtTime(reportData.generatedAt)}`,
      `👤 Generado por: ${profile?.full_name || profile?.username || 'Administrador'}`,
      ``,
      `💵 RESUMEN ECONÓMICO`,
      `------------------------------------------`,
      `• Total Ventas: ${money(reportData.totalRevenue)}`,
      `• Total Costo de Insumos: ${money(reportData.totalCost)}`,
      `• Ganancia Bruta Estimada: ${money(reportData.profit)}`,
      `• Pedidos / Cuentas Cobradas: ${reportData.ordersCount}`,
      `• Ticket Promedio: ${reportData.ordersCount > 0 ? money(reportData.totalRevenue / reportData.ordersCount) : money(0)}`,
      ``,
      `💳 DESGLOSE POR MÉTODO DE PAGO`,
      `------------------------------------------`,
      `• Efectivo: ${money(reportData.byMethod.efectivo)} (${reportData.totalRevenue > 0 ? Math.round((reportData.byMethod.efectivo / reportData.totalRevenue) * 100) : 0}%)`,
      `• Tarjeta: ${money(reportData.byMethod.tarjeta)} (${reportData.totalRevenue > 0 ? Math.round((reportData.byMethod.tarjeta / reportData.totalRevenue) * 100) : 0}%)`,
      `• QR / Transferencia: ${money(reportData.byMethod.qr)} (${reportData.totalRevenue > 0 ? Math.round((reportData.byMethod.qr / reportData.totalRevenue) * 100) : 0}%)`,
      ``,
      `🍹 TRAGOS Y PRODUCTOS MÁS VENDIDOS`,
      `------------------------------------------`,
    ]

    if (reportData.topProducts.length === 0) {
      lines.push(`(No se registraron ventas en esta fecha)`)
    } else {
      reportData.topProducts.forEach((p, idx) => {
        lines.push(`${idx + 1}. ${p.name} — ${p.qty} unidades | ${money(p.revenue)}`)
      })
    }

    lines.push(``)
    lines.push(`📦 ESTADO DE CAJAS Y ARQUEO`)
    lines.push(`------------------------------------------`)
    if (reportData.sessions.length === 0) {
      lines.push(`(Sin sesiones de caja registradas hoy)`)
    } else {
      reportData.sessions.forEach((s) => {
        const estado = s.status === 'cerrada' ? 'CERRADA' : 'ABIERTA'
        const cajero = s.cashier?.full_name || s.cashier?.username || 'Cajero'
        const diffText = s.difference !== null
          ? Number(s.difference) === 0 ? 'Cuadrada ✅' : Number(s.difference) > 0 ? `+${money(s.difference)} (Sobrante)` : `${money(s.difference)} (Faltante)`
          : 'En curso'
        lines.push(`• Caja #${s.id} (${cajero}) [${estado}]:`)
        lines.push(`  - Fondo inicial: ${money(s.opening_amount)}`)
        lines.push(`  - Total cobrado: ${money(s.total_sales || 0)}`)
        if (s.status === 'cerrada') {
          lines.push(`  - Efectivo esperado: ${money(s.expected_cash)}`)
          lines.push(`  - Efectivo contado: ${money(s.counted_cash)}`)
          lines.push(`  - Arqueo: ${diffText}`)
        }
      })
    }

    if (reportData.byWaiter.length > 0) {
      lines.push(``)
      lines.push(`🧑‍💼 VENTAS POR PERSONAL`)
      lines.push(`------------------------------------------`)
      reportData.byWaiter.forEach((w) => {
        lines.push(`• ${w.name}: ${w.count} pedidos | ${money(w.total)}`)
      })
    }

    if (notes.trim()) {
      lines.push(``)
      lines.push(`📝 NOTAS DEL TURNO:`)
      lines.push(`------------------------------------------`)
      lines.push(notes.trim())
    }

    lines.push(``)
    lines.push(`==========================================`)
    lines.push(`Enviado desde el Sistema BarPOS`)
    lines.push(`==========================================`)

    return lines.join('\n')
  }, [reportData, notes, profile])

  const subject = `🍸 BarPOS - Informe General de Cierre (${targetDate})`

  // Enviar abriendo Gmail Web directamente con un solo clic
  const handleOpenGmail = () => {
    const email = recipientEmail.trim()
    if (!email) {
      alert('Por favor ingresa o selecciona el correo Gmail de destino.')
      return
    }

    const body = generateEmailBody()
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(gmailUrl, '_blank')
    setSentNotice(true)
  }

  // Enviar mediante cliente de correo local (mailto:)
  const handleMailto = () => {
    const email = recipientEmail.trim()
    if (!email) {
      alert('Por favor ingresa o selecciona un correo de destino.')
      return
    }
    const body = generateEmailBody()
    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailtoUrl
    setSentNotice(true)
  }

  // Copiar al portapapeles para WhatsApp o mensaje
  const handleCopy = () => {
    const body = generateEmailBody()
    navigator.clipboard.writeText(body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // Descargar archivo de texto
  const handleDownload = () => {
    const body = generateEmailBody()
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `informe_diario_${targetDate}.txt`
    a.click()
  }

  return (
    <Modal
      title="📧 Enviar Informe General del Día por Correo"
      onClose={onClose}
      size="modal-lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cerrar
          </button>
          <button className="btn" onClick={handleCopy}>
            {copied ? <Check size={16} className="tone-success" /> : <Copy size={16} />}
            <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
          </button>
          <button className="btn btn-primary" onClick={handleOpenGmail} disabled={loading}>
            <Send size={16} /> Abrir y Enviar en Gmail
          </button>
        </>
      }
    >
      <div className="col gap-md">
        {loading ? (
          <div className="center" style={{ padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p className="muted small mt">Calculando balance general del día...</p>
          </div>
        ) : (
          <>
            {/* Sección de Selección / Entrada de Correo (Gmail) */}
            <div
              className="card"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-strong)',
                padding: 16,
              }}
            >
              <div className="row mb">
                <Mail size={18} className="tone-primary" />
                <span className="bold small">Destinatario del Informe</span>
              </div>

              <div className="field mb">
                <label htmlFor="report-recipient-email" className="xs muted">
                  Correo Gmail / Email del Administrador:
                </label>
                <div className="input-icon">
                  <Mail size={18} />
                  <input
                    id="report-recipient-email"
                    type="email"
                    className="input"
                    placeholder="ejemplo@gmail.com o admin@bar.app"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Botones rápidos con usuarios y administradores del sistema */}
              {userEmails.length > 0 && (
                <div>
                  <div className="xs muted mb" style={{ marginBottom: 6 }}>
                    Seleccionar de usuarios registrados en el sistema:
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {userEmails.map((u) => {
                      const isSelected = recipientEmail === u.email
                      return (
                        <button
                          key={u.username}
                          type="button"
                          className={`chip ${isSelected ? 'active' : ''}`}
                          onClick={() => setRecipientEmail(u.email)}
                          style={{
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                          }}
                        >
                          {u.role === 'admin' ? '👑' : '👤'} {u.name} ({u.email})
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Campo para notas adicionales opcionales */}
              <div className="field mt">
                <label htmlFor="report-notes" className="xs muted">
                  Notas u Observaciones del Cierre (opcional):
                </label>
                <input
                  id="report-notes"
                  type="text"
                  className="input"
                  placeholder="ej. Todo en orden, noche concurrida..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Notificación de envío */}
            {sentNotice && (
              <div className="badge listo" style={{ padding: '10px 14px', borderRadius: 10 }}>
                <Check size={16} /> ¡Ventana de correo abierta! Puedes revisar y presionar Enviar.
              </div>
            )}

            {/* Vista Previa del Informe en Pantalla */}
            <div>
              <div className="row-between mb">
                <span className="bold small row">
                  <FileText size={16} className="tone-primary" /> Vista Previa del Informe ({fmtDate(targetDate + 'T12:00:00')})
                </span>
                <button className="btn btn-sm" onClick={handleDownload} title="Descargar como .txt">
                  <Download size={14} /> Guardar .txt
                </button>
              </div>

              {/* Tarjetas de Resumen Rápido */}
              <div className="grid grid-3 keep-2 mb" style={{ gap: 10 }}>
                <div className="card pad-0" style={{ padding: 12, background: 'var(--surface)' }}>
                  <div className="xs muted">Total Ventas</div>
                  <div className="money grad-text bold" style={{ fontSize: 20 }}>
                    {money(reportData?.totalRevenue)}
                  </div>
                  <div className="xs faint">{reportData?.ordersCount} pedidos</div>
                </div>

                <div className="card pad-0" style={{ padding: 12, background: 'var(--surface)' }}>
                  <div className="xs muted">Ganancia Estimada</div>
                  <div className="money tone-success bold" style={{ fontSize: 20 }}>
                    {money(reportData?.profit)}
                  </div>
                  <div className="xs faint">Costo {money(reportData?.totalCost)}</div>
                </div>

                <div className="card pad-0" style={{ padding: 12, background: 'var(--surface)' }}>
                  <div className="xs muted">Efectivo en Caja</div>
                  <div className="money tone-primary bold" style={{ fontSize: 20 }}>
                    {money(reportData?.byMethod?.efectivo)}
                  </div>
                  <div className="xs faint">QR: {money(reportData?.byMethod?.qr)}</div>
                </div>
              </div>

              {/* Caja de texto con el informe completo listo para enviar */}
              <pre
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                {generateEmailBody()}
              </pre>
            </div>

            {/* Opciones alternativas de envío */}
            <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
              <button className="btn grow" onClick={handleOpenGmail}>
                <Send size={15} /> Abrir con Gmail (Navegador)
              </button>
              <button className="btn grow" onClick={handleMailto}>
                <Mail size={15} /> Abrir con Outlook / Mail
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
