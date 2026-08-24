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

/** 記録中の中断セッションを仕込む */
function seedPlayingSession() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        color: 'blue',
        players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '練習試合', date: '2026-08-23', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    window.history.replaceState(null, '');
    seedPlayingSession();
});

afterEach(cleanup);

describe('試合中の統計画面', () => {
    async function openStats() {
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        fireEvent.click(await screen.findByLabelText('チーム統計'));
    }

    it('比較を上、選手別スタッツを下に出す', async () => {
        await openStats();

        const view = document.querySelector('.stats-view') as HTMLElement;
        const comparison = view.querySelector('.team-comparison') as HTMLElement;
        const panel = view.querySelector('.stats-panel') as HTMLElement;

        expect(comparison).toBeTruthy();
        expect(panel).toBeTruthy();
        // 比較のほうが先に来る（DOCUMENT_POSITION_FOLLOWING = panel が後ろにある）
        expect(comparison.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('両チームの選手別スタッツは残したまま', async () => {
        await openStats();

        expect(document.querySelectorAll('.stats-view .stats-panel').length).toBe(2);
    });

    it('試合中は出力ボタンを出さない', async () => {
        await openStats();

        expect(document.querySelector('.comparison-export')).toBeNull();
    });
});
