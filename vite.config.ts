import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  css: { transformer: 'postcss' },
  build: { cssMinify: 'esbuild' },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/dist', '**/dist/**', '**/release', '**/release/**'],
    },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: {
    maxWorkers: 2,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
