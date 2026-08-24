// 未割り当てのまま保存した保留記録は、GameRecord.pendingActions に残っている。
//
// 「何が未割り当てだったか を残さないと後から追えない」という意図で保存して
// いるのに、読み出す画面が1つも無かった（recordToGame が [] に落としていた）。
// 試合終了時に「このまま保存」を選ぶと、その中身は事実上失われていた。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { History } from './History';
import { createPendingAction } from '../../types/pendingAction';
import type { PendingAction } from '../../types/pendingAction';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

function seed(pendingActions?: PendingAction[]) {
    const team = (name: string) => ({
        id: name, name, coachName: 'C', assistantCoachName: '',
        players: [], timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [], color: 'white',
    });
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: 'g1', date: new Date(Date.UTC(2026, 5, 5)).toISOString(), gameName: '第1節',
        teamA: team('レッドミニバス'), teamB: team('ブルーミニバス'),
        finalScore: { teamA: 30, teamB: 20 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        ...(pendingActions ? { pendingActions } : {}),
        createdAt: new Date().toISOString(),
    }]));
}

function openDetail() {
    render(<History onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /第1節/ }));
    // 未割り当てセクションは「スタッツ（画面表示）」タブの中身。既定タブが
    // 「チーム比較」に変わったため、切り替えないと本題のアサーションに届かない
    fireEvent.click(screen.getByRole('button', { name: 'スタッツ（画面表示）' }));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('試合履歴の未割り当ての記録', () => {
    it('件数と中身を出す', () => {
        seed([
            createPendingAction('SCORE', '2P', 'teamA', 2, []),
            createPendingAction('STAT', 'TO:DD', 'teamB', 3, []),
        ]);
        openDetail();

        expect(screen.getByText(/未割り当ての記録/)).toBeTruthy();
        expect(screen.getByText(/2件/)).toBeTruthy();
        expect(screen.getByText(/2P成功/)).toBeTruthy();
        // 内部コードのままにしない
        expect(screen.getByText(/ターンオーバー\(ダブドリ\)/)).toBeTruthy();
    });

    it('どちらのチームの記録かが分かる', () => {
        seed([createPendingAction('SCORE', '2P', 'teamB', 1, [])]);
        openDetail();

        const section = document.querySelector('.history-pending-section') as HTMLElement;
        expect(section).toBeTruthy();
        expect(within(section).getByText(/ブルーミニバス/)).toBeTruthy();
    });

    it('未割り当てが無ければ何も出さない', () => {
        seed();
        openDetail();

        expect(screen.queryByText(/未割り当ての記録/)).toBeNull();
    });

    // 延長は quarter 5,6,… で入る。まとめて「OT」と出すと、
    // 2回目の延長で記録した分がどのピリオドのものか分からなくなる
    it('2回目の延長は OT2 と出す', () => {
        seed([createPendingAction('SCORE', '2P', 'teamA', 6, [])]);
        openDetail();

        const section = document.querySelector('.history-pending-section') as HTMLElement;
        expect(within(section).getByText('OT2')).toBeTruthy();
    });

    it('最初の延長は OT と出す', () => {
        seed([createPendingAction('SCORE', '2P', 'teamA', 5, [])]);
        openDetail();

        const section = document.querySelector('.history-pending-section') as HTMLElement;
        expect(within(section).getByText('OT')).toBeTruthy();
    });
});
