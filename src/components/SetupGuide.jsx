import { useState } from 'react'
import { Database, Key, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react'
import { saveLocalConfig } from '../lib/supabase'

export default function SetupGuide() {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')

  const handleSave = (e) => {
    e.preventDefault()
    if (!url.startsWith('https://') || !key) {
      alert('Por favor ingresa una URL válida de Supabase (https://...) y tu Anon Key.')
      return
    }
    saveLocalConfig(url, key)
  }

  return (
    <div className="login-page">
      <div className="login-hero" style={{ justifyContent: 'center' }}>
        <img src="./icon.svg" alt="BarPOS" width="70" height="70" style={{ marginBottom: 20 }} />
        <h1>
          Conecta tu base de datos <span className="grad-text">en la nube</span>.
        </h1>
        <p>
          BarPOS funciona 100% en tiempo real utilizando <b>Supabase</b>. Sigue estos 3 pasos rápidos para ponerlo en marcha.
        </p>

        <div className="col gap-lg mt" style={{ marginTop: 30 }}>
          <div className="hero-role" style={{ alignItems: 'flex-start' }}>
            <span className="avatar tone-primary" style={{ width: 28, height: 28, fontSize: 13, flexShrink: 0 }}>
              1
            </span>
            <div>
              <div className="bold">Crea tu proyecto gratis en Supabase</div>
              <div className="xs muted">Entra a supabase.com, regístrate y crea un nuevo proyecto.</div>
            </div>
          </div>

          <div className="hero-role" style={{ alignItems: 'flex-start' }}>
            <span className="avatar tone-accent" style={{ width: 28, height: 28, fontSize: 13, flexShrink: 0 }}>
              2
            </span>
            <div>
              <div className="bold">Ejecuta el script SQL</div>
              <div className="xs muted">
                En Supabase entra a <b>SQL Editor</b>, copia y pega el contenido del archivo <code>supabase/schema.sql</code> y dale a <b>Run</b>.
              </div>
            </div>
          </div>

          <div className="hero-role" style={{ alignItems: 'flex-start' }}>
            <span className="avatar tone-success" style={{ width: 28, height: 28, fontSize: 13, flexShrink: 0 }}>
              3
            </span>
            <div>
              <div className="bold">Pega tus credenciales aquí a la derecha</div>
              <div className="xs muted">
                Encuéntralas en Supabase: <b>Project Settings → API</b> (Project URL y anon / public key).
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="login-form-wrap">
        <form className="login-card col gap-lg" onSubmit={handleSave}>
          <div>
            <div className="badge listo mb">
              <Sparkles size={13} /> Configuración Inicial
            </div>
            <h2>Conectar Supabase</h2>
            <p className="muted small">
              Ingresa los datos de tu proyecto para conectar la base de datos con el sistema del bar.
            </p>
          </div>

          <div className="field">
            <label htmlFor="setup-url">Project URL de Supabase</label>
            <div className="input-icon">
              <Database size={18} />
              <input
                id="setup-url"
                className="input"
                type="url"
                required
                placeholder="https://xyzabcdefg.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="setup-key">Anon / Public Key</label>
            <div className="input-icon">
              <Key size={18} />
              <input
                id="setup-key"
                className="input"
                type="text"
                required
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </div>
          </div>

          <button className="btn btn-primary btn-lg btn-block" type="submit">
            Conectar y Continuar <ArrowRight size={18} />
          </button>

          <div className="card pad-0" style={{ padding: 14, background: 'var(--surface-2)' }}>
            <div className="small bold mb" style={{ marginBottom: 6 }}>
              💡 También puedes usar el archivo .env
            </div>
            <div className="xs muted">
              Copia <code>.env.example</code> a <code>.env</code> en la raíz del proyecto con tus credenciales.
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
