import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app under /<repo>/; the workflow sets VITE_BASE. Local builds serve at /.
  base: process.env.VITE_BASE ?? '/',
  // Live builds: `python -m bushel.serve` answers /api. Without it the app runs on the pre-built fires.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  // The map chunk is MapLibre itself (~1 MB) and is loaded lazily after the order panel paints.
  build: { chunkSizeWarningLimit: 1100 },
})
