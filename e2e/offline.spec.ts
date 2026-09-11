// 通信が切れてもアプリが起動することを、実ブラウザで確かめる。
//
// これはこのアプリの中核の約束（体育館ではほぼオフライン）だが、jsdom には
// Service Worker が存在しないため、単体テストでは一行も踏めていない。
// vite.config.ts には「1本でも落ちると SW の install ごと失敗し、オフライン
// 記録まで道連れになる」という判断が書かれているが、それが守られているかを
// 確かめる手立てが今まで無かった。
//
// registerType: 'prompt' は clientsClaim を使わない（試合中に足元のチャンクが
// 入れ替わらないようにするため）。そのため初回読み込みでは SW が install /
// activate されても、そのページは制御下に入らない。読み込み直して初めて
// 制御下に入る。この順序を踏まないと precache から返らない。

import { expect, test } from '@playwright/test';
import { GAME_NAME, seedRecordedGame } from './fixtures/seedGame';

test('通信を切っても、アプリが起動して試合履歴まで開ける', async ({ page, context }) => {
    await seedRecordedGame(page);

    // 1. 初回。SW が登録・有効化されるが、このページはまだ制御下に入らない
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    // 2. 読み込み直して制御下に入る
    await page.reload();
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
        .toBe(true);

    // 3. 通信を切る。route.abort() ではなく context 側で切るのは、
    //    SW 自身の fetch も含めて本当に届かない状態を作るため
    await context.setOffline(true);

    // 4. オフラインのまま読み込み直す
    await page.reload();

    // index.html が precache から返っている
    await expect(page.getByRole('button', { name: /新規試合開始/ })).toBeVisible();

    // JSチャンクも読めていて React が動いていること。ホームの描画だけだと
    // 「index.html が返っただけ」でも通ってしまうので、遷移まで見る
    await page.getByRole('button', { name: /試合履歴/ }).click();
    await expect(page.getByRole('heading', { name: '試合履歴' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(GAME_NAME) })).toBeVisible();
});
