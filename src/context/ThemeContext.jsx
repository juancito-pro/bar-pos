import { createContext, useContext, useEffect, useState } from 'react'

const THEME_KEY = 'barpos_theme'

const ThemeContext = createContext({
  theme: 'dark',
  isIvory: false,
  setTheme: () => {},
  toggleTheme: () => {},
})

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'ivory' || saved === 'dark') return saved
    } catch {
      // ignore
    }
    return 'dark'
  })

  const isIvory = theme === 'ivory'

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // ignore
    }

    // Actualizar meta theme-color para la barra del navegador móvil
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) {
      metaTheme.setAttribute('content', isIvory ? '#f7f4ed' : '#0b0a10')
    }
  }, [theme, isIvory])

  const setTheme = (nextTheme) => {
    if (nextTheme === 'ivory' || nextTheme === 'dark') {
      setThemeState(nextTheme)
    }
  }

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'ivory' ? 'dark' : 'ivory'))
  }

  return (
    <ThemeContext.Provider value={{ theme, isIvory, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
