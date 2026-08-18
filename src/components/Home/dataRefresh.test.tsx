// ホームは中断試合の有無とマイチーム数をマウント時に一度だけ読んでいた。
//
// アプリ設定はホームの上にモーダルで開く。バックアップを取り込んでも
// ホームは再マウントされないため、「進行中の試合: 復元」と成功メッセージが
// 出るのに「試合を再開」が現れず、リロードするまで到達できなかった。
// マイチーム数も同じ理由で古いままだった。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Home } from './Home';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const props = {
    onStartGame: vi.fn(), onManageTeams: vi.fn(), onViewHistory: vi.fn(),
    onManageOpponents: vi.fn(), onViewPlayerStats: vi.fn(), onResumeGame: vi.fn(),
    onOpenSettings: vi.fn(), isFullScreen: false, onToggleFullScreen: vi.fn(),
};

const setTeams = (n: number) => localStorage.setItem(
    'minibasket-my-teams',
    JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `チーム${i}`, players: [] }))),
);

const setSession = () => localStorage.setItem('minibasket-game-session', JSON.stringify({
    game: { teamA: { players: [] }, teamB: { players: [] } },
    gameName: 'x', date: '2026-08-18', savedAt: new Date().toISOString(),
}));

describe('Home: 開いたままデータが変わったとき', () => {
    it('取り込みで中断試合が増えたら、再描画で再開ボタンが出る', () => {
        setTeams(1);
        const { rerender } = render(<Home {...props} />);
        expect(screen.queryByText('試合を再開')).toBeNull();

        setSession();
        rerender(<Home {...props} />);

        expect(screen.queryByText('試合を再開')).not.toBeNull();
    });

    it('取り込みでマイチームが増えたら、再描画で件数が変わる', () => {
        setTeams(1);
        const { rerender } = render(<Home {...props} />);
        expect(screen.getByText('1チーム登録済み')).toBeTruthy();

        setTeams(3);
        rerender(<Home {...props} />);

        expect(screen.getByText('3チーム登録済み')).toBeTruthy();
    });

    it('中断試合が無くなったら再開ボタンも消える', () => {
        setTeams(1);
        setSession();
        const { rerender } = render(<Home {...props} />);
        expect(screen.queryByText('試合を再開')).not.toBeNull();

        localStorage.removeItem('minibasket-game-session');
        rerender(<Home {...props} />);

        expect(screen.queryByText('試合を再開')).toBeNull();
    });
});
