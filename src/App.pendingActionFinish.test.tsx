// 未解決の保留アクション（「選手がわからない」で預けた記録）を残したまま
// 試合を終えたときの扱い。
//
// 保留中の得点は解決するまで誰のスタッツにも入らないため、そのまま保存すると
// 最終スコアが実際の試合と食い違う。しかも保留自体は試合記録に残っておらず、
// セッションを消した時点で完全に消えていた。件数を必ず知らせたうえで、
// 「このまま保存」を選んだ場合でも保留の中身は記録に残す。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';
import { createPendingAction } from './types/pendingAction';

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

/** 未解決の保留アクションを持つ、試合終了直後のセッションを仕込む */
function seedFinishedSessionWithPending(pendingCount: number) {
    const game = createInitialGame();
    game.phase = 'finished';
    game.currentQuarter = 4;
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
    };
    game.pendingActions = Array.from({ length: pendingCount }, () =>
        createPendingAction('SCORE', '2P', 'teamA', 4, [
            { id: 'teamA-player-0', number: 4, name: '選手4' },
        ]),
    );
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '決勝戦', date: '2026-08-06', savedAt: new Date().toISOString(),
    }));
}

// 終了済みのセッションなので、ホームの導線は「試合を再開」ではなく
// 未保存であることを名乗る（Home.tsx / getGameSessionState）
async function openFinishedGame() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合結果を保存'));
    return screen.findByText('保存して終了');
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 1 }));
    window.history.replaceState(null, '');
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('App: 未解決の保留アクションがある状態での試合終了', () => {
    it('保存前に件数を知らせる', async () => {
        seedFinishedSessionWithPending(2);
        fireEvent.click(await openFinishedGame());

        expect(await screen.findByText('未割り当ての記録があります')).toBeTruthy();
        // 件数を出さないと「何件残っているのか」を確かめに戻れない
        expect(screen.getByText(/2件/)).toBeTruthy();
    });

    it('警告を出している間はまだ保存しない', async () => {
        seedFinishedSessionWithPending(1);
        fireEvent.click(await openFinishedGame());
        await screen.findByText('未割り当ての記録があります');

        expect(JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]')).toHaveLength(0);
        expect(localStorage.getItem('minibasket-game-session')).not.toBeNull();
    });

    it('「戻って割り当てる」で試合画面に戻り、記録は失われない', async () => {
        seedFinishedSessionWithPending(1);
        fireEvent.click(await openFinishedGame());
        await screen.findByText('未割り当ての記録があります');

        fireEvent.click(screen.getByRole('button', { name: '戻って割り当てる' }));

        expect(await screen.findByText('保存して終了')).toBeTruthy();
        expect(JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]')).toHaveLength(0);
        expect(localStorage.getItem('minibasket-game-session')).not.toBeNull();
    });

    it('「このまま保存」を選んだら、保留の中身も試合記録に残る', async () => {
        seedFinishedSessionWithPending(2);
        fireEvent.click(await openFinishedGame());
        await screen.findByText('未割り当ての記録があります');

        fireEvent.click(screen.getByRole('button', { name: 'このまま保存' }));

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
        const history = JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]');
        expect(history).toHaveLength(1);
        expect(history[0].pendingActions).toHaveLength(2);
        expect(history[0].pendingActions[0].value).toBe('2P');
    });

    it('保留が無ければ警告を挟まずそのまま保存する', async () => {
        seedFinishedSessionWithPending(0);
        fireEvent.click(await openFinishedGame());

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
        expect(JSON.parse(localStorage.getItem('minibasket-game-history') ?? '[]')).toHaveLength(1);
        expect(localStorage.getItem('minibasket-game-session')).toBeNull();
    });
});
