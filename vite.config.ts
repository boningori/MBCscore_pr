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
        // idを固定しないと start_url から導出され、将来 start_url を変えた際に
        // 別アプリ扱いになる（インストール済みの端末で重複する）
        id: '/MBCscore_pr/',
        name: 'MBCscore - ミニバス スコアシート',
        short_name: 'MBCscore',
        description: 'ミニバスケットボール用スコアシートアプリ',
        // 既定では 'en' が入る。UIも記録内容も日本語なので明示する
        lang: 'ja',
        dir: 'ltr',
        categories: ['sports', 'utilities'],
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
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            // maskableは端末が任意の形に切り抜くため中央80%しか保証されない。
            // icon-512.pngは絵柄が端まであり円形クロップで炎とボールが欠けるので、
            // 余白を足した専用画像を使う（scripts/generate-maskable-icon.mjs）
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        // アイコン長押しメニュー。URLルーティングを持たないため、
        // start_urlにクエリを付けて src/utils/launchShortcut.ts で解釈する
        shortcuts: [
          {
            name: '新規試合開始',
            short_name: '新規試合',
            description: '試合記録をすぐに開始する',
            url: '/MBCscore_pr/?s=newGame',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: '試合履歴',
            short_name: '履歴',
            description: '過去の試合記録を見る',
            url: '/MBCscore_pr/?s=history',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: '選手スタッツ分析',
            short_name: 'スタッツ',
            description: '選手の成長を可視化する',
            url: '/MBCscore_pr/?s=playerStats',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
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
