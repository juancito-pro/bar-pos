import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle({
  className = '',
  size = 'md', // 'sm' | 'md'
  showLabel = false,
  title,
}) {
  const { theme, isIvory, toggleTheme } = useTheme()

  const tooltip =
    title || (isIvory ? 'Cambiar a modo oscuro' : 'Cambiar a modo marfil (claro)')

  return (
    <button
      type="button"
      className={`theme-toggle-btn ${size === 'sm' ? 'sm' : ''} ${className}`}
      onClick={toggleTheme}
      title={tooltip}
      aria-label={tooltip}
      data-current-theme={theme}
    >
      <span className="theme-toggle-icon">
        {isIvory ? (
          <Sun size={size === 'sm' ? 15 : 18} className="theme-icon-sun" />
        ) : (
          <Moon size={size === 'sm' ? 15 : 18} className="theme-icon-moon" />
        )}
      </span>
      {showLabel && (
        <span className="theme-toggle-label">
          {isIvory ? 'Modo Marfil' : 'Modo Oscuro'}
        </span>
      )}
    </button>
  )
}
