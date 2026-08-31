import { defineConfig, devices } from '@playwright/test';

// vite.config.ts の base と揃える。preview はこのパス配下で配信する
const BASE_PATH = '/MBCscore_pr/';
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;

/**
 * E2E は dev サーバではなく `npm run preview`（= ビルド済みの dist）に対して回す。
 *
 * このアプリは PDF出力で jspdf / html2canvas を動的importし、PWAのSWがそれを
 * プリキャッシュする。dev サーバではチャンク分割もSWも入らないため、実際に
 * 配られる形とは別物を検査することになる。CI でも dist をダウンロードして
 * これに食わせるので、「テストが通ったもの」と「公開されるもの」が一致する
 * （ci.yml の同趣旨のコメントを参照）。
 */
export default defineConfig({
    testDir: './e2e',
    // 出力は端末によっては十数秒かかる（RunningScoresheet のツールバー参照）。
    // html2canvas がスコアシート全体を描くぶん、既定の30秒では足りない
    timeout: 90_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            // hasTouch: 得点ボタンは TouchEvent でしかフリックを判定しない
            // （useSwipe.ts）。フリックのテストを足すときにここが要る
            use: { ...devices['Desktop Chrome'], hasTouch: true },
        },
    ],
    webServer: {
        command: `npm run preview -- --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
