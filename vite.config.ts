import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/MBCscore_pr/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  esbuild: {
    // 本番ビルドでデバッグ用consoleを除去（warn/errorは診断用に残す）
    pure: ['console.log', 'console.debug', 'console.info'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-utils': ['html2canvas', 'jspdf']
        }
      }
    },
    chunkSizeWarningLimit: 600
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-512.png'],
      manifest: {
        name: 'MBCscore - ミニバス スコアシート',
        short_name: 'MBCscore',
        description: 'ミニバスケットボール用スコアシートアプリ',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        // タブレット横向き(フルモード3カラム)を推奨しているため向きは固定しない
        orientation: 'any',
        start_url: '/MBCscore_pr/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Tesseractのwasmコア(.wasm.js)・言語データ(.gz)も含めてプリキャッシュし完全オフライン動作を保証
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,gz}'],
        // wasmコア(.wasm.js)は約3.9MBあり、既定の2MB上限では除外されてしまうため引き上げる
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
})
