// ミラーバックアップの世代に、正しい「理由」が付くこと。
//
// 区切り（保護枠）と定期（回転枠）の振り分けは reason で決まる
// （mirrorBackupRetention）。呼び出し元が渡す値を間違えると、保護すべき世代が
// 試合中の自動保存に押し出される——しかも黙って。ここで固定する。
//
// とくに gameEnd は「履歴に保存できた直後」でなければならない。
// phase === 'finished' の時点ではまだ保存しておらず、その状態を写しても
// 「試合単位で戻る」には使えない。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const saveSnapshot = vi.hoisted(() => vi.fn());
vi.mock('./utils/mirrorBackup', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./utils/mirrorBackup')>()),
    saveSnapshot,
    // 復元プロンプトを出さないため、常に「世代なし」にする
    getLatestSnapshot: vi.fn(async () => null),
}));

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

/** 第4Q進行中・0-0 のセッションを仕込む */
function seedPlayingQ4() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.currentQuarter = 4;
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '決勝戦', date: '2026-09-11', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    saveSnapshot.mockReset();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 1 }));
    window.history.replaceState(null, '');
});

afterEach(cleanup);

/** saveSnapshot が呼ばれた reason の一覧 */
const reasons = () => saveSnapshot.mock.calls.map(call => call[0] as string);

describe('起動時の世代', () => {
    it('起動時は startup として取る', async () => {
        render(<App />);
        await waitFor(() => expect(reasons()).toContain('startup'));
    });
});

describe('試合終了まわりの世代', () => {
    it('試合終了の画面が出た時点では periodic（まだ履歴に保存していない）', async () => {
        seedPlayingQ4();
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        fireEvent.click(await screen.findByText(/第4Q終了|Q4終了/));
        fireEvent.click(await screen.findByText('試合を終了する'));

        await screen.findByText('保存して終了');
        expect(reasons()).toContain('periodic');
        expect(reasons()).not.toContain('gameEnd');
    });

    it('履歴に保存できた直後に gameEnd を取る', async () => {
        seedPlayingQ4();
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        fireEvent.click(await screen.findByText(/第4Q終了|Q4終了/));
        fireEvent.click(await screen.findByText('試合を終了する'));
        fireEvent.click(await screen.findByText('保存して終了'));

        await waitFor(() => expect(reasons()).toContain('gameEnd'));
    });
});
