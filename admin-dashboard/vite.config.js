import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Dev mirrors the Vercel rewrite: /api is proxied to the backend so the browser
// only ever talks to this origin, which keeps the admin auth cookie first-party
// (not a cross-site cookie that Brave/Safari would block).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://visionfit-backend-cwxi.onrender.com',
        changeOrigin: true,
      },
    },
  },
})
