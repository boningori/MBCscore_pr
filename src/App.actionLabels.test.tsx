// 記録アクションの表示名は、同じ操作の流れの中で表記が揺れてはいけない。
//
// 「選手がわからない」で保留化するチーム選択モーダルだけが内部コードを
// そのまま出しており、直前のステータスバーが「オフェンスリバウンド」と
// 出した次の画面で「OREBを保留として記録し…」と表示されていた。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
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

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

async function openTeamSelectorForOffensiveRebound() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合を再開'));
    // 選手を選ばずにアクションを押すと「記録待ち」になる
    fireEvent.click(await screen.findByRole('button', { name: /オフェンス/ }));
    fireEvent.click(screen.getByRole('button', { name: '選手がわからない' }));
    return screen.findByText('どちらのチームですか？');
}

describe('App: 保留化のチーム選択モーダル', () => {
    it('スタッツ名を日本語で出す（内部コードを出さない）', async () => {
        await openTeamSelectorForOffensiveRebound();

        expect(screen.getByText(/オフェンスリバウンドを保留として記録し/)).toBeTruthy();
        expect(screen.queryByText(/OREBを保留として記録し/)).toBeNull();
    });
});
