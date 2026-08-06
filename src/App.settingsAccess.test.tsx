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
    game.teamA = { ...createTeam('teamA', 'テストチーム', 'コーチ'), players: [
        { ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true },
    ] };
    game.teamB = { ...createTeam('teamB', '相手チーム', '相手コーチ'), players: [
        { ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true },
    ] };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '練習試合', date: '2026-08-06', savedAt: new Date().toISOString(),
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

// 保存失敗のトーストは「設定画面からバックアップを保存してください」と案内するが、
// 設定モーダルはホーム画面のぶんしか描画されておらず、記録中は開く手段が無かった
describe('App: 記録中でもアプリ設定に辿り着ける', () => {
    async function openGame() {
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        return screen.findByLabelText('試合オプション');
    }

    it('試合オプションからアプリ設定を開ける', async () => {
        fireEvent.click(await openGame());

        fireEvent.click(await screen.findByRole('button', { name: /アプリ設定/ }));

        expect(await screen.findByText('アプリ設定')).toBeTruthy();
        expect(screen.getByText('📊 データ管理')).toBeTruthy();
    });

    it('設定を閉じると試合画面に戻る（ホームへ飛ばされない）', async () => {
        fireEvent.click(await openGame());
        fireEvent.click(await screen.findByRole('button', { name: /アプリ設定/ }));
        await screen.findByText('アプリ設定');

        fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

        expect(await screen.findByLabelText('試合オプション')).toBeTruthy();
        expect(screen.queryByText('新規試合開始')).toBeNull();
    });

    it('ホーム画面からはこれまでどおり歯車で開ける', async () => {
        render(<App />);
        fireEvent.click(await screen.findByLabelText('設定'));

        expect(await screen.findByText('アプリ設定')).toBeTruthy();
    });
});
