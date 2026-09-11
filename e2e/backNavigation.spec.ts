// 端末の戻る操作（Androidの戻るボタン／エッジスワイプ）が、実ブラウザで
// 期待どおりの階層で効くことを確かめる。
//
// jsdom にも history はあるが popstate の挙動が実物と違う。useScreenHistorySync
// のコメントに「実測(v1.6.14・実ブラウザ)」が並ぶのはそのためで、ここは手で
// 確かめるしかなかった領域だった。過去の修正がいちばん多い場所でもある。
//
// 2本目が要点。ホームは履歴の基点でエントリを持たないため、モーダルを開いて
// いる間だけ戻る用のエントリを1つ積んでいる（modalGuard）。積まないと popstate
// 自体が起きず、モーダルが閉じるどころか PWA ごと終了していた。

import { expect, test } from '@playwright/test';
import { seedRecordedGame } from './fixtures/seedGame';

test.beforeEach(async ({ page }) => {
    await seedRecordedGame(page);
    await page.goto('./');
});

test('戻る操作で、試合履歴からホームへ帰る', async ({ page }) => {
    await page.getByRole('button', { name: /試合履歴/ }).click();
    await expect(page.getByRole('heading', { name: '試合履歴' })).toBeVisible();

    await page.goBack();

    await expect(page.getByRole('button', { name: /新規試合開始/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '試合履歴' })).toBeHidden();
});

test('ホームでモーダルを開いて戻ると、モーダルだけ閉じてホームに残る', async ({ page }) => {
    await page.getByRole('button', { name: '設定' }).click();
    const dialog = page.getByRole('dialog', { name: 'アプリ設定' });
    await expect(dialog).toBeVisible();

    await page.goBack();

    // モーダルは閉じる
    await expect(dialog).toBeHidden();
    // ホームからは出ない（ここが崩れると PWA ごと終了していた）
    await expect(page.getByRole('button', { name: /新規試合開始/ })).toBeVisible();
});
