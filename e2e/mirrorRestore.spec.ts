// ブラウザにデータを消されても、端末内のミラーから戻せることを確かめる。
//
// mirrorBackup は localStorage のアプリデータを IndexedDB に複製し、起動時に
// localStorage が空だったら復元を促す。単体テストは fake-indexeddb で代替して
// いるので、「起動時にスナップショットを取る側」と「書き戻す側」を実物で通した
// ことがない。
//
// IndexedDB へ直接書き込む形にはしない。それでは「アプリが実際にスナップ
// ショットを取ったか」が検証されず、書き戻し側しか守れない。

import { expect, test } from '@playwright/test';
import { GAME_NAME, seedRecordedGame } from './fixtures/seedGame';

test('localStorage を消しても、復元プロンプトから試合履歴が戻る', async ({ page }) => {
    // 初回だけ注入する。毎回入れ直すと、下で消した端から書き戻されて
    // 復元プロンプトの条件（localStorage が空）が成立しない
    await seedRecordedGame(page, undefined, { once: true });

    // 1. データのある状態で開く。起動時スナップショットが IndexedDB に入る
    await page.goto('./');
    await expect(page.getByRole('button', { name: /試合履歴/ })).toBeVisible();

    // スナップショットが実際に書かれるまで待つ（saveSnapshot は非同期）
    await expect
        .poll(() => page.evaluate(() => new Promise<number>(resolve => {
            const request = indexedDB.open('mbc-mirror-backup');
            request.onsuccess = () => {
                const db = request.result;
                // アプリより先に開くと、ストアの無い DB を作ってしまうことがある。
                // その場合は「まだ無い」として 0 を返し、poll のリトライに任せる
                if (!db.objectStoreNames.contains('snapshots')) { resolve(0); db.close(); return; }
                const countRequest = db.transaction('snapshots', 'readonly')
                    .objectStore('snapshots')
                    .count();
                countRequest.onsuccess = () => { resolve(countRequest.result); db.close(); };
                countRequest.onerror = () => { resolve(0); db.close(); };
            };
            request.onerror = () => resolve(0);
        })))
        .toBeGreaterThan(0);

    // 2. ブラウザのサイトデータ消去を模す。IndexedDB は残す
    await page.evaluate(() => window.localStorage.clear());

    // 3. 開き直すと復元プロンプトが出る
    await page.reload();
    await expect(page.getByRole('heading', { name: /以前のデータが見つかりました/ })).toBeVisible();

    // 4. 復元すると履歴が戻る（復元後はアプリが自分で読み込み直す）
    await page.getByRole('button', { name: '復元する' }).click();

    await expect(page.getByRole('button', { name: /試合履歴/ })).toBeVisible();
    await page.getByRole('button', { name: /試合履歴/ }).click();
    await expect(page.getByRole('button', { name: new RegExp(GAME_NAME) })).toBeVisible();
});
