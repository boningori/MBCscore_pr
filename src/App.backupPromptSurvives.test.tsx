// 試合を保存した直後のバックアップ督促が、出た瞬間に自分で閉じられないこと。
//
// handleGameFinished は setScreen('home') と setShowBackupPrompt(true) を続けて
// 呼ぶ。前者は useScreenHistorySync に history.back() を出させ、その popstate は
// handlePopState の closeTopModal() を通る。督促は Modal なので、back() を出して
// から popstate が届くまでの数msの間にマウントすると身代わりに閉じられる。
//
// 実測（実ブラウザ・MutationObserver）:
//   t=14509 prompt-mounted / t=14517 prompt-unmounted / t=14518 popstate {"appScreen":"home"}
// データ保全のための唯一の能動的な促しが、画面に出た瞬間に消えていた。
// jsdom では history.back() の popstate が先に届いてしまい、この競合そのものは
// 再現できない。順序を作れる層（useScreenHistorySync.test.ts）で
// 「自分で出した戻りは closeTopModal を通さない」ことを固定し、ここでは
// 督促が出ること・利用者の戻るでは閉じること・「あとで」で閉じることを見る。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';

const shareBackup = vi.hoisted(() => vi.fn(async () => true));
vi.mock('./utils/dataBackup', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./utils/dataBackup')>()),
    shareBackup,
}));

const myTeam = {
    id: 'team-1', name: 'テストチーム', coachName: 'コーチ', assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

/** 試合終了直後（保存待ち）の中断セッションを仕込む */
function seedFinishedSession() {
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
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '決勝戦', date: '2026-08-06', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    // 復元プロンプトは別の早期returnなので、出ないようにしておく
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    // 最終バックアップの記録を入れない＝督促が出る状態
    window.history.replaceState(null, '');
    shareBackup.mockClear();
    seedFinishedSession();
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** ホーム →「試合結果を保存」→「保存して終了」 */
async function saveFinishedGame() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合結果を保存'));
    fireEvent.click(await screen.findByText('保存して終了'));
}

describe('保存後のバックアップ督促', () => {
    it('利用者の戻る操作では閉じる（モーダルとしての作法は保つ）', async () => {
        await saveFinishedGame();
        expect(await screen.findByText(/バックアップしますか/)).toBeTruthy();

        // 1回目は自分で出した戻りに消費される。2回目が利用者の操作にあたる
        await act(async () => {
            window.dispatchEvent(new PopStateEvent('popstate', { state: { appScreen: 'home' } }));
            await Promise.resolve();
        });
        await act(async () => {
            window.dispatchEvent(new PopStateEvent('popstate', { state: { appScreen: 'home' } }));
            await Promise.resolve();
        });

        await waitFor(() => expect(screen.queryByText(/バックアップしますか/)).toBeNull());
    });

    it('「あとで」で閉じてホームへ戻れる', async () => {
        await saveFinishedGame();
        fireEvent.click(await screen.findByText('あとで'));

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
    });
});
