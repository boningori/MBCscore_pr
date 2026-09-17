// 販促用の単独ページ（チラシ・SNSカード）が、SWを入れた端末でもそのまま開けること。
//
// これらは配布物だがアプリの一部ではないので、precache にも入れず
// （vite.config.ts の globIgnores）、SWのナビゲーションフォールバックからも
// 外してある（navigateFallbackDenylist）。外し忘れると NavigationRoute が
// index.html を返し、チラシのURLを開いてもアプリ本体が表示される。
//
// 除外の判定は「pathname + search」に対して行われる（workbox の
// NavigationRoute）。`/FLYER.html$` のように末尾を固定すると、クエリが1つでも
// 付いた瞬間に除外から外れてアプリが開く。SNSで共有すると Facebook 系が
// `?fbclid=...` を、QRや広告経由では `?utm_source=...` が自動で付くため、
// クエリ付きこそが実際に配られる形になる。クエリの有無を両方とも固定する。

import { expect, test } from '@playwright/test';

/** 単独ページと、そのページを見分けるためのタイトル */
const STANDALONE_PAGES = [
    { path: 'FLYER.html', title: 'MBCscore - ミニバス スコアシート チラシ' },
    { path: 'SNS_CARDS.html', title: 'MBCscore SNS投稿カード' },
    { path: 'SNS_CARDS_DETAIL.html', title: 'MBCscore SNS投稿カード（詳細解説シリーズ）' },
] as const;

/**
 * SWの制御下に入る。
 *
 * registerType: 'prompt' は clientsClaim を使わないため、初回読み込みでは
 * install / activate されてもそのページは制御下に入らない。読み込み直して
 * 初めて fetch がSWを通る＝ここを踏まないと素の配信を見ているだけになる
 * （offline.spec.ts と同じ手順）。
 */
async function takeControl(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
        .toBe(true);
}

for (const { path, title } of STANDALONE_PAGES) {
    test(`SWの制御下でも ${path} はそのページが開く`, async ({ page }) => {
        await takeControl(page);

        await page.goto(`./${path}`);
        await expect(page).toHaveTitle(title);
    });

    test(`SWの制御下でも ${path} にクエリが付いたページが開く`, async ({ page }) => {
        await takeControl(page);

        // SNSでの共有や QR 経由で自動的に付く形
        await page.goto(`./${path}?utm_source=qr&fbclid=abc`);
        await expect(page).toHaveTitle(title);
    });
}
