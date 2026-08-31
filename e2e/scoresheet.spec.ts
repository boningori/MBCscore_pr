import { stat } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { FINISHED_GAME, GAME_NAME, TEAM_A_NAME, TEAM_B_NAME, seedRecordedGame } from './fixtures/seedGame';

/**
 * 履歴からスコアシートを開き、PDF/JPEGとして出せるところまでを実ブラウザで確かめる。
 *
 * 単体テストが jsdom で見ているのは「Reactが何を描いたか」まで。スコアシートの
 * 出力は html2canvas が実際のレイアウトを描き、jspdf が画像をページに割って
 * a[download] を叩く経路で、レイアウトを持たない jsdom では踏めない。
 * ここが手動確認に残っていた部分。
 *
 * 見た目のピクセル比較はしない。手元(Windows)とCI(Linux)でフォントが違い、
 * 基準画像が必ず食い違うため。中身が空でないことは pdfExport の
 * assertRenderedImage が出力側で見ていて、空なら例外になりダウンロードが
 * 発生しないので、ここではその結果を受け取れば足りる。
 */

const EXPECTED = {
    finalScoreA: 15,
    finalScoreB: 13,
    // scoreHistory から数え直される Q別得点（フィクスチャの並びと対応）
    byQuarter: [
        { a: 4, b: 2 },
        { a: 4, b: 4 },
        { a: 2, b: 5 },
        { a: 5, b: 2 },
    ],
};

test.beforeEach(async ({ page }) => {
    await seedRecordedGame(page);
    await page.goto('./');
});

/** 保存されたファイルの大きさ（バイト） */
async function fileSize(download: Download): Promise<number> {
    const path = await download.path();
    return (await stat(path)).size;
}

/** ホーム → 試合履歴 → 記録を開く → スコアシートタブ */
async function openScoresheet(page: Page) {
    await page.getByRole('button', { name: /試合履歴/ }).click();
    await page.getByRole('button', { name: new RegExp(GAME_NAME) }).click();
    await page.getByRole('button', { name: /スコアシート/ }).click();
    await expect(page.getByRole('button', { name: 'PDF出力' })).toBeVisible();
}

test('履歴から開いたスコアシートに、記録どおりの得点とファウルが出る', async ({ page }) => {
    await openScoresheet(page);

    const sheet = page.locator('.running-scoresheet');
    await expect(sheet).toContainText(TEAM_A_NAME);
    await expect(sheet).toContainText(TEAM_B_NAME);

    // 合計得点（選手スタッツの合計から出る経路）
    const totals = sheet.locator('.rs-ts-score-val');
    await expect(totals.first()).toHaveText(String(EXPECTED.finalScoreA));
    await expect(totals.last()).toHaveText(String(EXPECTED.finalScoreB));

    // Q別得点（scoreHistory から数え直される別経路）。両者が食い違えば
    // どちらかの集計が壊れている
    const rows = sheet.locator('.rs-score-breakdown .rs-sb-row');
    for (const [i, expected] of EXPECTED.byQuarter.entries()) {
        const values = rows.nth(i).locator('.val');
        await expect(values.first()).toHaveText(String(expected.a));
        await expect(values.last()).toHaveText(String(expected.b));
    }

    // 延長はしていないので空欄のまま
    const otValues = rows.nth(4).locator('.val');
    await expect(otValues.first()).toHaveText('0');

    // #4 は Q1 と Q3 にファウル1つずつ。様式のファウル欄に2つ並ぶ
    const captain = sheet.locator('tr', { hasText: FINISHED_GAME.teamA.players[0].name }).first();
    await expect(captain).toContainText('P');
});

test('スコアシートをPDFとして保存できる', async ({ page }) => {
    await openScoresheet(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF出力' }).click();

    const file = await download;
    expect(file.suggestedFilename()).toContain(TEAM_A_NAME);
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);

    // 中身が空のPDFを「出力しました」と言わない約束（pdfExport の
    // assertRenderedImage）。空canvasなら例外になってダウンロード自体が
    // 起きないが、ファイルの大きさも見ておく。真っ白な1ページのPDFは
    // 数KBにしかならないので、様式が描かれていればここを下回らない
    expect(await fileSize(file)).toBeGreaterThan(50_000);

    // 出力中の表示が終わり、ボタンが戻る
    await expect(page.getByRole('button', { name: 'PDF出力' })).toBeEnabled();
});

test('スコアシートをJPEGとして保存できる', async ({ page }) => {
    await openScoresheet(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JPEG出力' }).click();

    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.jpg$/);
    expect(await fileSize(file)).toBeGreaterThan(50_000);
});
