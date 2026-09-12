// 記録中にサイトデータを消されても、開き直したときに復元を案内すること。
//
// 直していたころの実測: 消去から6.5秒後には minibasket-session-owner だけが
// 心拍で復活し、リロードすると pagehide のフラッシュが
// minibasket-game-session も書き戻していた。どちらも「アプリのキー」なので
// hasRestorableUserData() の前身（hasAppData）が真になり、IndexedDB に完全な
// 控えがあるのに復元プロンプトは出なかった。
//
// pagehide のフラッシュも心拍も jsdom では回らない。

import { expect, test } from '@playwright/test';
import { seedInProgressGame } from './fixtures/seedGame';

test('記録中にデータを消されても、開き直せば復元を案内する', async ({ page }) => {
    await seedInProgressGame(page);
    await page.goto('./');

    // 控えが IndexedDB に入るまで待つ
    await expect
        .poll(() => page.evaluate(() => new Promise<number>(resolve => {
            const request = indexedDB.open('mbc-mirror-backup');
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('snapshots')) { resolve(0); db.close(); return; }
                const c = db.transaction('snapshots', 'readonly').objectStore('snapshots').count();
                c.onsuccess = () => { resolve(c.result); db.close(); };
                c.onerror = () => { resolve(0); db.close(); };
            };
            request.onerror = () => resolve(0);
        })))
        .toBeGreaterThan(0);

    // 記録中にする（心拍が回り始める）
    await page.getByRole('button', { name: /試合を再開/ }).click();
    await page.waitForTimeout(500);

    // ブラウザのサイトデータ消去を模す（IndexedDB は残す）
    await page.evaluate(() => window.localStorage.clear());

    // 心拍（5秒）を1回またぐ。ここで minibasket-session-owner が復活する
    await page.waitForTimeout(6_500);
    expect(await page.evaluate(() => Object.keys(localStorage))).toContain('minibasket-session-owner');

    // 開き直すと復元を案内する
    await page.reload();
    await expect(page.getByRole('heading', { name: /以前のデータが見つかりました/ })).toBeVisible();
});
