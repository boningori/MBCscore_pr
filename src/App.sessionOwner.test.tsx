// 別のタブが記録中のあいだ、このタブからは試合画面へ入れない。
//
// 再開だけを塞いでも足りない。別のタブが記録中に新規試合を始めると、同じ
// セッションのキーをその新しい試合で上書きすることになり、結果は同じである。

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { showToast } from './components/Toast/toastApi';
import { OWNER_STALE_MS } from './utils/sessionOwner';

vi.mock('./components/Toast/toastApi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./components/Toast/toastApi')>()),
    showToast: vi.fn(),
}));

const myTeam = {
    id: 'team-1', name: 'テストチーム', coachName: 'コーチ', assistantCoachName: '',
    players: Array.from({ length: 6 }, (_, i) => ({ number: i + 4, name: `選手${i + 4}`, isCaptain: i === 0 })),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

/** 別のタブが age ミリ秒前に打った印 */
function foreignOwner(age: number) {
    localStorage.setItem('minibasket-session-owner', JSON.stringify({ id: 'other-tab', at: Date.now() - age }));
}

/** 中断中の試合を置く（「試合を再開」を出すため） */
function seedSession() {
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game: { phase: 'playing' }, gameName: '第1節', date: '2026-04-10',
        savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    vi.mocked(showToast).mockClear();
});
afterEach(cleanup);

describe('別のタブが記録中のとき', () => {
    it('「試合を再開」を押しても進まず、知らせる', () => {
        seedSession();
        foreignOwner(1_000);
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /試合を再開/ }));

        // ホームに留まっている
        expect(screen.getByRole('button', { name: /新規試合開始/ })).toBeTruthy();
        expect(vi.mocked(showToast).mock.calls[0][0]).toMatch(/別のタブ/);
    });

    it('「新規試合開始」も進まない（同じキーを上書きするため）', () => {
        seedSession();
        foreignOwner(1_000);
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /新規試合開始/ }));

        expect(screen.getByRole('button', { name: /新規試合開始/ })).toBeTruthy();
        expect(vi.mocked(showToast).mock.calls[0][0]).toMatch(/別のタブ/);
    });

    it('印が時間切れなら、いつもどおり進む', () => {
        seedSession();
        foreignOwner(OWNER_STALE_MS + 1_000);
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /試合を再開/ }));

        expect(screen.queryByRole('button', { name: /新規試合開始/ })).toBeNull();
    });
});
