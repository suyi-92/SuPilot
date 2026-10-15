import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve('src/main/index.ts'), engine: resolve('src/engine/index.ts') },
        external: ['electron', 'node-pty', 'node:sqlite']
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } }
    }
  },
  renderer: { plugins: [react(), tailwindcss()] }
})
