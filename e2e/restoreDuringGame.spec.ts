// 記録中に端末内の控えから戻しても、進行中の試合が消えないことを確かめる。
//
// 直していたころの実測: 復元した中断セッションが、リロードの pagehide で
// useGameAutoSave に書き戻され、無言で元へ返っていた。試合履歴やチームは
// 戻るので、利用者には区別が付かない。
//
// pagehide は jsdom では本物の遷移を伴わないため、この経路は実ブラウザで
// しか踏めない。既存の4本（オフライン起動・戻る操作・自動保存のフラッシュ・
// ミラー復元）を足したときと同じ判断で、ここにも1本置く。

import { expect, test } from '@playwright/test';
import { IN_PROGRESS_PLAYER_NAME, seedInProgressGame } from './fixtures/seedGame';

const SESSION_KEY = 'minibasket-game-session';
const TEAMS_KEY = 'minibasket-my-teams';

test('記録中に控えから戻しても、進行中の試合はそのまま続く', async ({ page }) => {
    await seedInProgressGame(page);

    // 1. 開く。起動時の控えが IndexedDB に入る（この時点の試合は0点）
    await page.goto('./');
    await expect
        .poll(() => page.evaluate(() => new Promise<number>(resolve => {
            const request = indexedDB.open('mbc-mirror-backup');
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('snapshots')) { resolve(0); db.close(); return; }
                const countRequest = db.transaction('snapshots', 'readonly').objectStore('snapshots').count();
                countRequest.onsuccess = () => { resolve(countRequest.result); db.close(); };
                countRequest.onerror = () => { resolve(0); db.close(); };
            };
            request.onerror = () => resolve(0);
        })))
        .toBeGreaterThan(0);

    // 2. 試合を再開して1本決める（控えとの差をつくる）
    await page.getByRole('button', { name: /試合を再開/ }).click();
    await page.getByRole('button', { name: new RegExp(IN_PROGRESS_PLAYER_NAME) }).click();
    await page.getByRole('button', { name: '2Pシュート' }).click();
    await page.locator('.score-selector .score-option.success').click();
    await expect(page.locator('.team-a-block .score-display')).toHaveText('2');

    // 3. マイチームを壊す（＝控えから戻したくなる状況をつくる）
    await page.evaluate((k) => window.localStorage.setItem(k, '[]'), TEAMS_KEY);

    // 4. 記録中のまま、設定 → データ管理 → 端末内の自動バックアップ から戻す
    await page.getByRole('button', { name: '試合オプション' }).click();
    await page.getByRole('button', { name: /アプリ設定・バックアップ/ }).click();
    await page.getByRole('button', { name: /データ管理/ }).click();
    await page.getByRole('button', { name: 'この時点に戻す', exact: true }).first().click();

    // 記録中は「進行中の試合はそのまま続きます」と言う
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/進行中の試合はそのまま続きます/)).toBeVisible();
    // 「この時点に戻す」も部分一致で拾うため exact にする
    await dialog.getByRole('button', { name: '戻す', exact: true }).click();

    // 5. マイチームは戻っている（＝復元そのものは効いている）
    await expect.poll(() => page.evaluate((k) => window.localStorage.getItem(k), TEAMS_KEY))
        .not.toBe('[]');

    // 6. リロードされず、試合画面に留まっている。
    //
    // ここが壊れていたコードと分かれる点である。保存されている得点だけを見ても
    // 両者は一致してしまう——旧コードでもリロードの pagehide が同じ2点を
    // 書き戻したためで、それがまさに復元を取り消していた仕組みだった。
    // 旧コードはここで必ずホームに飛ぶので、この検査だけが差を捉える。
    // ホームに飛んでいないことを先に見る。旧挙動ではここで「試合を再開」が
    // 現れるので、10秒で落ちる（あとの操作を先に置くと90秒のタイムアウトになる）
    await expect(page.getByRole('button', { name: /試合を再開/ })).toHaveCount(0);
    await page.getByRole('button', { name: '閉じる' }).first().click();
    await expect(page.locator('.team-a-block .score-display')).toHaveText('2');

    const points = await page.evaluate((k) => {
        const raw = window.localStorage.getItem(k);
        if (!raw) return null;
        const s = JSON.parse(raw) as { game: { teamA: { players: { stats: { points: number } }[] } } };
        return s.game.teamA.players.reduce((n, p) => n + p.stats.points, 0);
    }, SESSION_KEY);
    expect(points).toBe(2);
});
