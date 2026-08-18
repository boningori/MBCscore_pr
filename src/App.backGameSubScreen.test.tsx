// スコアシートとスタメン選択は、画面上の「戻る」が1段だけ戻す（試合画面・試合設定へ）。
// 端末の戻る操作は画面のエントリを消費してホームへ抜けるため、同じ「戻る」で
// 行き先が食い違っていた。試合中にシートを開いてエッジスワイプすると、記録画面では
// なくホームまで飛ぶ（記録は自動保存されるので失われはしないが、そこから記録を
// 続けるには「試合を再開」を押し直すことになる）。

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
        game, gameName: '練習試合', date: '2026-08-10', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 1 }));
    window.history.replaceState(null, '');
    seedPlayingSession();
});

// アプリ内でホームへ戻ると window.history.back() が走る。jsdomでは popstate が
// 非同期に届くため、流してから片付ける（App.backSubView.test.tsx と同じ理由）
afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    cleanup();
});

/** 端末の戻る操作。ブラウザは先に1段戻し、stateはホームになっている */
function pressBack() {
    fireEvent.popState(window, { state: { appScreen: 'home' } });
}

async function resumeGame() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合を再開'));
    return screen.findByRole('button', { name: /スコアシート/ });
}

describe('端末の戻る操作: スコアシート画面', () => {
    it('スコアシートからは試合画面へ戻る（ホームまで飛ばない）', async () => {
        const scoresheetButton = await resumeGame();
        fireEvent.click(scoresheetButton);
        // 様式が開いたことは、試合画面には無い出力ボタンで確かめる
        expect(await screen.findByRole('button', { name: 'PDF出力' })).toBeTruthy();

        pressBack();

        expect(await screen.findByRole('button', { name: /スコアシート/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'PDF出力' })).toBeNull();
        expect(screen.queryByText('新規試合開始')).toBeNull();
    });

    it('試合画面まで戻ったあとの戻るでホームへ抜ける', async () => {
        const scoresheetButton = await resumeGame();
        fireEvent.click(scoresheetButton);
        await screen.findByRole('button', { name: 'PDF出力' });

        pressBack();
        await screen.findByRole('button', { name: /スコアシート/ });
        pressBack();

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
    });
});

describe('端末の戻る操作: スタメン選択画面', () => {
    it('クォーター終了後のスタメン選択からは試合画面へ戻る', async () => {
        await resumeGame();
        fireEvent.click(await screen.findByRole('button', { name: /Q1終了/ }));
        // 誤タップ防止の確認を挟んでからスタメン選択へ進む
        fireEvent.click(await screen.findByRole('button', { name: '終了する' }));
        expect(await screen.findByRole('heading', { name: 'スタメン選択' })).toBeTruthy();

        pressBack();

        expect(await screen.findByRole('button', { name: /スコアシート/ })).toBeTruthy();
        expect(screen.queryByRole('heading', { name: 'スタメン選択' })).toBeNull();
        expect(screen.queryByText('新規試合開始')).toBeNull();
    });
});
