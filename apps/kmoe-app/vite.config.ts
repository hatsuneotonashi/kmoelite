import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const mobileDevHost = process.env.TAURI_DEV_HOST

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: mobileDevHost ?? '127.0.0.1',
    port: 5173,
    strictPort: false,
    hmr: mobileDevHost
      ? {
          host: mobileDevHost
        }
      : undefined
  },
  clearScreen: false
})
