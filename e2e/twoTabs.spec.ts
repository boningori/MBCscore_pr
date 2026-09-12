// 同じ端末の2つのタブで同じ試合を記録できないことを確かめる。
//
// 直していたころの実測: tab1 が2点、tab2 が2点、tab1 がさらに2点を入れると、
// 保存されるのは4点（2本）だった。tab1 は tab2 の得点を知らないまま自分の版で
// 上書きする。両方のタブが同じ数字を表示し、スコアシートの辻褄も合うので、
// 1本足りないことに気づく手がかりが無い。
//
// 同じ localStorage を共有する2つのタブは jsdom では作れない。実ブラウザの
// 同一 context に2ページ開いて確かめる。

import { expect, test } from '@playwright/test';
import { IN_PROGRESS_PLAYER_NAME, seedInProgressGame } from './fixtures/seedGame';

test('別のタブが記録中なら、2つ目のタブは試合に入れない', async ({ page, context }) => {
    await seedInProgressGame(page);
    await page.goto('./');
    await page.getByRole('button', { name: /試合を再開/ }).click();

    // タブ1 で1本決めて、記録中であることをはっきりさせる
    await page.getByRole('button', { name: new RegExp(IN_PROGRESS_PLAYER_NAME) }).click();
    await page.getByRole('button', { name: '2Pシュート' }).click();
    await page.locator('.score-selector .score-option.success').click();
    await expect(page.locator('.team-a-block .score-display')).toHaveText('2');

    // タブ2 を開く。再開も新規開始も断られる
    const page2 = await context.newPage();
    await page2.goto('./');

    await page2.getByRole('button', { name: /試合を再開/ }).click();
    await expect(page2.getByText(/別のタブでこの試合を記録中です/)).toBeVisible();
    await expect(page2.getByRole('button', { name: /新規試合開始/ })).toBeVisible();

    await page2.getByRole('button', { name: /新規試合開始/ }).click();
    await expect(page2.getByRole('button', { name: /新規試合開始/ })).toBeVisible();

    // タブ1 は影響を受けない
    await expect(page.locator('.team-a-block .score-display')).toHaveText('2');
});
