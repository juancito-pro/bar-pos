import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download, Printer, Copy, ExternalLink, Sparkles, Check } from 'lucide-react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'

export default function QrMenuModal({ onClose, defaultTable = null }) {
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState(defaultTable ? String(defaultTable) : 'all')
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  // Cargar mesas activas
  useEffect(() => {
    async function fetchTables() {
      const { data } = await supabase.from('bar_tables').select('id, number, name').eq('active', true).order('number')
      setTables(data || [])
    }
    fetchTables()
  }, [])

  // Calcular URL destino del Menú (compatible con HashRouter y subcarpetas)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const path = typeof window !== 'undefined' ? window.location.pathname.replace(/\/$/, '') : ''
  const menuUrl = selectedTable === 'all'
    ? `${origin}${path}/#/menu`
    : `${origin}${path}/#/menu?mesa=${selectedTable}`

  // Generar QR en canvas y DataURL
  useEffect(() => {
    if (!menuUrl) return

    QRCode.toDataURL(menuUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0e0b16',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Error generando QR:', err))
  }, [menuUrl])

  const handleCopy = () => {
    navigator.clipboard.writeText(menuUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    const tableLabel = selectedTable === 'all' ? 'general' : `mesa_${selectedTable}`
    a.download = `qr_menu_${tableLabel}.png`
    a.click()
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const tableLabel = selectedTable === 'all'
      ? 'Carta Digital Bar'
      : `Mesa #${selectedTable}`

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Menú - ${tableLabel}</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
              margin: 0;
              padding: 20px;
              color: #111;
              background: #fff;
            }
            .stand {
              border: 3px solid #111;
              border-radius: 24px;
              padding: 30px;
              text-align: center;
              max-width: 360px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            }
            .brand {
              font-size: 26px;
              font-weight: 800;
              letter-spacing: -0.5px;
              margin-bottom: 6px;
            }
            .tagline {
              font-size: 13px;
              color: #555;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 20px;
            }
            .qr-img {
              width: 240px;
              height: 240px;
              border: 1px solid #eee;
              border-radius: 16px;
              margin: 10px auto;
            }
            .table-badge {
              display: inline-block;
              background: #111;
              color: #fff;
              font-weight: 700;
              font-size: 18px;
              padding: 6px 18px;
              border-radius: 30px;
              margin-top: 15px;
            }
            .instruction {
              font-size: 14px;
              color: #444;
              margin-top: 15px;
              font-weight: 500;
            }
            @media print {
              body { padding: 0; }
              .stand { box-shadow: none; border: 2px solid #000; }
            }
          </style>
        </head>
        <body>
          <div class="stand">
            <div class="brand">🍸 BarPOS</div>
            <div class="tagline">Menú Digital & Tragos</div>
            <img class="qr-img" src="${qrDataUrl}" alt="QR Menú" />
            <div class="table-badge">${tableLabel}</div>
            <div class="instruction">📱 Escanea con tu celular para ver la carta de tragos disponibles</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); }
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <Modal
      title="Código QR · Menú Digital para Clientes"
      onClose={onClose}
      size="modal-md"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cerrar
          </button>
          <a
            href={menuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            <ExternalLink size={16} /> Abrir Menú
          </a>
        </>
      }
    >
      <div className="col gap-md">
        <p className="small muted">
          Genera e imprime el código QR para colocarlo en las mesas o barra. Los clientes podrán escanearlo y consultar la disponibilidad de tragos en tiempo real.
        </p>

        {/* Selector de Mesa o Menú General */}
        <div className="field">
          <label htmlFor="qr-table-select">Asignar a:</label>
          <select
            id="qr-table-select"
            className="input select"
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
          >
            <option value="all">🍸 Menú General del Bar (Todas las mesas / Barra)</option>
            {tables.map((t) => (
              <option key={t.id} value={t.number}>
                📍 Mesa #{t.number} {t.name ? `(${t.name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Tarjeta del Código QR */}
        <div
          className="card center"
          style={{
            padding: 24,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
            border: '1px solid var(--border-strong)',
          }}
        >
          {qrDataUrl ? (
            <div
              style={{
                display: 'inline-block',
                padding: 14,
                background: '#ffffff',
                borderRadius: 18,
                boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
              }}
            >
              <img
                src={qrDataUrl}
                alt="QR Code"
                style={{ width: 210, height: 210, display: 'block' }}
              />
            </div>
          ) : (
            <div className="spinner" style={{ margin: '40px auto' }} />
          )}

          <div className="mt">
            <span className="badge listo">
              <Sparkles size={13} /> {selectedTable === 'all' ? 'Menú General' : `Mesa #${selectedTable}`}
            </span>
          </div>

          <div
            className="xs muted truncate mt"
            style={{ maxWidth: 320, margin: '8px auto 0' }}
          >
            {menuUrl}
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn grow" onClick={handleDownload} disabled={!qrDataUrl}>
            <Download size={16} /> Descargar PNG
          </button>
          <button className="btn grow" onClick={handlePrint} disabled={!qrDataUrl}>
            <Printer size={16} /> Imprimir Cartelito
          </button>
          <button className="btn" onClick={handleCopy} title="Copiar enlace">
            {copied ? <Check size={16} className="tone-success" /> : <Copy size={16} />}
            <span>{copied ? '¡Copiado!' : 'Copiar URL'}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
