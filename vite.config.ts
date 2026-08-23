import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 配布はするがアプリの一部ではない単独ページ（販促用）。
// これらは2つの設定に同時に載せないと壊れる:
//   1. globIgnores        … オフラインキャッシュに載せない
//   2. navigateFallbackDenylist … SWのナビゲーションフォールバックから除外する
// 2を忘れると、SWを入れた端末では NavigationRoute が index.html を返してしまい、
// チラシのURLを開いてもアプリ本体が表示される（実際にそうなっていた）。
// 片方だけ直す事故を防ぐため、両方をこの1つの配列から導出する。
const STANDALONE_PAGES = ['FLYER.html', 'SNS_CARDS.html']

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
        // html2canvas / jspdf は manualChunks に列挙しない。
        // 明示するとエントリからの静的エッジが残り、pdfExport.ts で動的importに
        // しても index.html に modulepreload されて初回起動に乗ってしまう。
        // 列挙を外すとRollupが動的importの位置で自然に切り出す。
        manualChunks: {
          'vendor-react': ['react', 'react-dom']
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
      // includeAssets と includeManifestIcons は使わない。下の globPatterns が
      // **/*.png を拾うので、どちらも同じURLをprecache manifestへ二重に載せる
      // （実際に icon-192 / icon-512 / icon-512-maskable が各2回入っていた。
      // revisionが同じためworkboxはエラーにせず、そのまま通してしまう）
      includeManifestIcons: false,
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
        // アイコン長押しのショートカットを試合中に押しても、新しいインスタンスを
        // 開かず既存のウィンドウにフォーカスを戻す。記録中の画面から離れさせない
        launch_handler: {
          client_mode: 'focus-existing'
        },
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
        // Androidのリッチなインストール画面に出る紹介画像。
        // 同じ form_factor どうしは縦横比を揃える必要がある（Chromeの制約）。
        // 縦横比は 1:2.3〜2.3:1 の範囲内であること。
        screenshots: [
          {
            src: 'screenshots/game-wide.png',
            sizes: '1920x1291',
            type: 'image/png',
            form_factor: 'wide',
            label: 'タブレット横向きのフルモード。両チームの選手と記録ボタンを一画面に表示'
          },
          {
            src: 'screenshots/game-narrow.png',
            sizes: '971x1601',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'スマートフォンのシンプルモード。片手で押せる大きさに絞った記録画面'
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,gz}'],
        // 配布物ではあるがアプリの起動に要らないものはプリキャッシュから外す。
        // vite.svgはテンプレートの名残で参照されていない。
        // manual.htmlはホームからリンクする使用説明書なのでオフラインでも要るため残す。
        // 紹介画像(screenshots/)はインストール画面用でブラウザがオンラインで取得する。
        //
        // 起動画像(splash/)は40枚3.8MBあり、1台が使うのは自機種の縦横2枚だけ。
        // 全部プリキャッシュするのは論外だが、外しっぱなしだと起動のたびに
        // ネットワークへ出る（オフラインでは実際に取得失敗することを実測した）。
        // 下の runtimeCaching で、その端末が使う2枚だけを実際に読まれた時に持つ。
        //
        // tesseract/ を外すのが要点。workboxのプリキャッシュはオール・オア・
        // ナッシングで、1ファイルでも取得に失敗すると install ごと reject され
        // SWが破棄される。OCRアセットは5.9MB（プリキャッシュ全体の約8割）あり、
        // 体育館の細い回線で落ちると「オフラインで記録できる」という中核機能まで
        // 道連れになっていた。任意機能に本体の可用性を握らせない。
        // 代わりに下の runtimeCaching で個別にキャッシュし、
        // src/utils/ocrAssetCache.ts が起動後に裏で取りにいく（従来どおり
        // オフラインでもOCRが使える状態を保つ）。
        globIgnores: [...STANDALONE_PAGES, 'vite.svg', 'screenshots/**', 'splash/**', 'tesseract/**'],
        // 販促ページはSWのナビゲーションフォールバックの対象外にする。
        // 除外しないと index.html が返り、チラシのURLでアプリが開く。
        // pathname+search に対して評価される（workboxのNavigationRoute）
        navigateFallbackDenylist: STANDALONE_PAGES.map(
          page => new RegExp(`/${page.replace(/\./g, '\\.')}$`)
        ),
        runtimeCaching: [
          {
            // OCRアセット（worker / wasmコア / 言語データ）。
            // 一度取れば以後はキャッシュから返るのでオフラインでもOCRが動く。
            // CacheFirstなので、すでに持っていればネットワークに触らない＝
            // ocrAssetCache.ts の事前取得を何度呼んでも無駄打ちにならない。
            //
            // その裏返しで、URLが変わらないと更新が永久に届かない。worker.min.js の
            // ように固定名のままだと、tesseract.js を上げてもアプリのJSだけ新しくなり、
            // 古いworkerと組み合わさってOCRが静かに壊れる。そのため置き場所に版を
            // 入れてある（public/tesseract/<版>/ … src/utils/tesseractAssets.ts）。
            urlPattern: /\/tesseract\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mbc-ocr-assets',
              expiration: {
                // 1世代3ファイル。版を上げた直後は新旧が並ぶので、旧世代が
                // ひとつ残る余地だけ持たせ、際限なく積まないようにする
                // （古い方はLRUで落ちる）
                maxEntries: 6
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // 起動画像。読まれた1枚だけが入るので、端末あたり縦横2枚（約200KB）。
            // maxEntriesは機種変更や画面回転で少し増える余地を見た値。
            // iOSが「ホーム画面に追加」の時点で自前に控えるのか、起動のたびに
            // 取りにいくのかは端末依存なので、これは保険であって保証ではない
            urlPattern: /\/splash\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mbc-splash',
              expiration: {
                maxEntries: 4
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
