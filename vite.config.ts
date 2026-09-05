import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            lib: {
              formats: ['cjs']
            },
            rollupOptions: {
              external: [
                'electron-store',
              ],
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              }
            },
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              }
            }
          }
        }
      }
    ]),
    renderer(),
  ],
})
