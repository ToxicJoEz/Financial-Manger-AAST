import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_DEMO_MODE': JSON.stringify(process.env.VERCEL === '1' ? 'true' : process.env.VITE_DEMO_MODE || 'false') },
  server: {
    port: 5175,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } },
  },
})
