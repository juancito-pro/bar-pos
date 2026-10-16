import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base './' permite publicar en GitHub Pages (subcarpeta) o en Vercel/Netlify
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true }, // permite abrir desde el celular en la misma red WiFi
})
