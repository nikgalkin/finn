import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Finn is served locally, so prefer two coarse application chunks over
    // extra requests made only to satisfy Vite's generic 500 kB threshold.
    chunkSizeWarningLimit: 700,
  },
})
