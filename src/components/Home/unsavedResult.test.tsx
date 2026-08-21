// 終了したのに保存していない試合を、ホームがそう名乗る。
//
// 試合終了の画面（保存して終了／保存せずにホームへ）はオーバーレイであって
// モーダルではないため、端末の戻る操作で素通りできる。記録はセッションに
// 残っていてホームの導線から同じ保存画面へ戻れる——つまり失われはしない——が、
// その導線が「試合を再開／中断した試合を続ける」としか名乗っていなかった。
// 保存し忘れている試合があることが、ホームからは読み取れない。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Home } from './Home';
import { saveGameSession, clearGameSession } from '../../utils/gameSessionStorage';
import { createInitialGame } from '../../types/game';
import type { Game } from '../../types/game';

function seedTeam() {
    localStorage.setItem('minibasket-my-teams', JSON.stringify([{
        id: 't1', name: 'MBCジュニア', coachName: 'C', assistantCoachName: '',
        players: [], createdAt: '', updatedAt: '',
    }]));
}

function seedSession(phase: Game['phase']) {
    saveGameSession({ ...createInitialGame(), phase }, '練習試合', '2026-08-20');
}

function renderHome(onResumeGame = vi.fn()) {
    render(
        <Home
            onStartGame={vi.fn()}
            onManageTeams={vi.fn()}
            onViewHistory={vi.fn()}
            onManageOpponents={vi.fn()}
            onViewPlayerStats={vi.fn()}
            onResumeGame={onResumeGame}
            onOpenSettings={vi.fn()}
            isFullScreen={false}
            onToggleFullScreen={vi.fn()}
        />,
    );
    return onResumeGame;
}

beforeEach(() => {
    localStorage.clear();
    seedTeam();
});
afterEach(cleanup);

describe('ホームの中断セッション導線', () => {
    it('試合中なら「試合を再開」と出す', () => {
        seedSession('playing');
        renderHome();

        expect(screen.getByText('試合を再開')).toBeTruthy();
        expect(screen.getByText('中断した試合を続ける')).toBeTruthy();
    });

    it('終了済みなら「試合結果を保存」と出す（未保存だと分かる）', () => {
        seedSession('finished');
        renderHome();

        expect(screen.getByText('試合結果を保存')).toBeTruthy();
        expect(screen.getByText('終了した試合が未保存です')).toBeTruthy();
        // 「中断した試合」ではない。まだ続きがあるように読めてしまう
        expect(screen.queryByText('中断した試合を続ける')).toBeNull();
    });

    // 文言が変わるだけで、行き先は同じ試合終了の画面
    it('どちらの文言でも同じ導線を開く', () => {
        seedSession('finished');
        const onResume = renderHome();

        fireEvent.click(screen.getByText('試合結果を保存').closest('button')!);

        expect(onResume).toHaveBeenCalled();
    });

    it('セッションが無ければ導線そのものを出さない', () => {
        clearGameSession();
        renderHome();

        expect(screen.queryByText('試合を再開')).toBeNull();
        expect(screen.queryByText('試合結果を保存')).toBeNull();
    });
});
