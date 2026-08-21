// アクション先行入力の「記録待ち」での、端末の戻る操作。
//
// この状態では選手タップが「選択」ではなく「即記録」に変わる。抜ける手段は
// ステータスバーの「キャンセル」だけで、戻る操作を受け取っていなかったため、
// 記録待ちのままエッジスワイプすると記録画面ごとホームへ飛んでいた。
// しかも状態は残るので、戻ってくると次の選手タップが意図しない記録になる。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

/** 進行中の試合セッションを仕込む */
function seedPlayingSession() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.currentQuarter = 1;
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '第1節', date: '2026-08-21', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    seedPlayingSession();
    window.history.replaceState(null, '');
});

// useScreenHistorySync はアプリ内でホームへ戻るとき history.back() を使う。
// jsdomでは popstate が非同期に届くので、積み残しを流してから片付ける
afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    cleanup();
});

/** 端末の戻る操作。ブラウザは先に1段戻し、stateはホームになっている */
function pressBack() {
    fireEvent.popState(window, { state: { appScreen: 'home' } });
}

/** 試合を再開して「2P成功」を先に選び、記録待ちにする */
async function enterPendingAction() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合を再開'));
    fireEvent.click(await screen.findByLabelText('2Pシュート'));
    fireEvent.click(await screen.findByText('2P成功'));
    expect(await screen.findByText('記録待ち')).toBeTruthy();
}

const isWaiting = () => screen.queryByText('記録待ち') !== null;
const onGameScreen = () => screen.queryByText('新規試合開始') === null;

describe('端末の戻る操作: 記録待ち', () => {
    it('記録待ちを取り消すだけで、記録画面に留まる', async () => {
        await enterPendingAction();

        pressBack();

        expect(isWaiting()).toBe(false);
        expect(onGameScreen()).toBe(true);
        // 記録はされていない
        expect(screen.queryByText(/2P成功 \+2/)).toBeNull();
    });

    it('取り消したあとの戻るでホームへ抜ける', async () => {
        await enterPendingAction();

        pressBack();
        expect(isWaiting()).toBe(false);
        pressBack();

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
    });
});
