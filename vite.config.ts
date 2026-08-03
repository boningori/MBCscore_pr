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
      // 'autoUpdate' はデプロイを検知した瞬間に skipWaiting + clientsClaim で
      // 新SWへ切り替え、cleanupOutdatedCaches が旧プリキャッシュを消す。
      // 開いたままのページは旧ハッシュのチャンクを参照し続けるため、jspdfが
      // 実行時に動的importする assets/index.es-*.js が404になり、試合終了後の
      // PDF出力だけが失敗する（vendor-utils内の import("./index.es-*.js") ）。
      // 'prompt' なら新SWは waiting で待機し、旧キャッシュは利用者が更新を
      // 選ぶまで消えない。試合中に足元が入れ替わらないことを優先する。
      registerType: 'prompt',
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
        // 配布物ではあるがアプリの動作に不要なものはオフラインキャッシュから外す。
        // FLYER/SNS_CARDSは販促用、vite.svgはテンプレートの名残で参照されていない。
        // manual.htmlはホームからリンクする使用説明書なのでオフラインでも要るため残す。
        globIgnores: ['FLYER.html', 'SNS_CARDS.html', 'vite.svg'],
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
