// 履歴の削除が保存できなかったとき、黙って元に戻さないこと。
//
// deleteGameRecord だけが void だった。同じモジュールの他の更新系
// （saveGameHistory / updateGameRecordGameInfo / updateGameRecordEndTime）は
// 全部 boolean を返す。呼び出し側が書けたかどうかを確かめられるようにするため
// で、createStorage.ts に約束として書いてある。
//
// 削除だけ戻り値が無いので、書き込みに失敗しても呼び出し側は気づけない。
// confirmDelete は直後に loadGameHistory() を読み直すため、消えなかった
// カードはその場で戻ってくる——理由の説明は一切無しに。利用者から見ると
// 「削除を押したのに消えない」だけが起き、端末の空き容量が尽きている
// という本当の原因は伝わらない。
//
// 履歴の後編集の失敗（gameInfoSaveFailure.test.tsx）と同じ扱いに揃える。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { History } from './History';
import { showToast } from '../Toast/toastApi';
import { loadGameHistory } from '../../utils/gameHistoryStorage';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

const GAME_ID = 'g1';

function seed() {
    const team = (id: string, name: string, color: 'white' | 'blue') => ({
        id, name, coachName: 'コーチ', assistantCoachName: '', color,
        players: [], timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [],
    });
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: GAME_ID, date: new Date(Date.UTC(2026, 3, 10)).toISOString(), gameName: '第1節',
        teamA: team('teamA', '6年生チーム', 'white'), teamB: team('teamB', '相手', 'blue'),
        finalScore: { teamA: 0, teamB: 0 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        quarterMinutes: 6, showThreePoint: false, createdAt: new Date().toISOString(),
    }]));
}

/** localStorage への書き込みを失敗させる（seed のあとに呼ぶこと） */
function failStorageWrites() {
    vi.spyOn(console, 'error').mockImplementation(() => { });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
    });
}

const errorToasts = () =>
    vi.mocked(showToast).mock.calls.filter(([, type]) => type === 'error');

beforeEach(() => {
    localStorage.clear();
    seed();
    vi.mocked(showToast).mockClear();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('履歴の削除: 保存に失敗したとき', () => {
    it('消せなかったことを知らせる', () => {
        render(<History onBack={() => { }} />);
        fireEvent.click(screen.getByRole('button', { name: '削除' }));
        failStorageWrites();
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
        vi.restoreAllMocks();

        expect(errorToasts().length).toBe(1);
        // 記録は残っている（画面にも、保存先にも）
        expect(screen.getByText('第1節')).toBeTruthy();
        expect(loadGameHistory().map(r => r.id)).toEqual([GAME_ID]);
    });

    it('消せたときは知らせない', () => {
        render(<History onBack={() => { }} />);
        fireEvent.click(screen.getByRole('button', { name: '削除' }));
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));

        expect(errorToasts()).toEqual([]);
        expect(screen.queryByText('第1節')).toBeNull();
        expect(loadGameHistory()).toEqual([]);
    });
});
