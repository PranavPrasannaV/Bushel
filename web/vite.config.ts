import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Live builds: `python -m bushel.serve` answers /api. Without it the app runs on the pre-built fires.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})
