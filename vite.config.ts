import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // During development the Express API runs on port 3000.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
