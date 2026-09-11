// 記録した直後に端末が落ちても、その記録が残っていることを確かめる。
//
// useGameAutoSave は 500ms のデバウンスで中断セッションへ書く。PWA は
// バックグラウンドに回った時点で OS に凍結・破棄されうるので、待ちに入ったまま
// 落とされると直前の得点が残らない。そのため visibilitychange(hidden) と
// pagehide でデバウンスを待たずに書き出している。
//
// jsdom でもイベントは模せるが、リロードで本当に発火するか・本当に間に合うかは
// 実ブラウザでしか確かめられない。

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { IN_PROGRESS_PLAYER_NAME, seedInProgressGame } from './fixtures/seedGame';

/** スコアボードの白チーム側の得点 */
const teamAScore = (page: Page) => page.locator('.team-a-block .score-display');

test('記録した直後に読み込み直しても、その1点が残っている', async ({ page }) => {
    await seedInProgressGame(page);
    await page.goto('./');

    await page.getByRole('button', { name: /試合を再開/ }).click();
    await expect(teamAScore(page)).toHaveText('0');

    // 選手カード → 2Pボタン（タップでセレクターが開く）→ 成功
    await page.getByRole('button', { name: new RegExp(IN_PROGRESS_PLAYER_NAME) }).click();
    await page.getByRole('button', { name: '2Pシュート' }).click();
    await page.getByRole('button', { name: '2P成功' }).click();

    await expect(teamAScore(page)).toHaveText('2');

    // デバウンス(500ms)が満了する前であることを、ここで明示的に確かめる。
    // 満了後にリロードすると通常の保存で通ってしまい、検証したい pagehide の
    // フラッシュ経路を一度も踏まないまま緑になる（落ちないので気付けない）
    const savedPoints = await page.evaluate(() => {
        const raw = window.localStorage.getItem('minibasket-game-session');
        if (!raw) return null;
        const session = JSON.parse(raw) as { game: { teamA: { players: { stats: { points: number } }[] } } };
        return session.game.teamA.players.reduce((sum, p) => sum + p.stats.points, 0);
    });
    expect(savedPoints).toBe(0);

    // デバウンス(500ms)の満了を待たずに読み込み直す。待ってしまうと通常の保存で
    // 通ってしまい、検証したい pagehide のフラッシュ経路を踏まない
    await page.reload();

    await page.getByRole('button', { name: /試合を再開/ }).click();
    await expect(teamAScore(page)).toHaveText('2');
});
