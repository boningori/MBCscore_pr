// 保留の一覧が延長を「Q5」と出していた。
//
// スコアボード・スタメン選択・タイムアウト入力はすべて OT と表示するのに、
// ここだけ内部表現がそのまま漏れていた。同じ試合の同じピリオドが
// 画面によって違う名前で出ることになる。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PendingActionPanel } from './PendingActionPanel';
import type { PendingAction } from '../../types/pendingAction';

afterEach(cleanup);

function makePending(quarter: number): PendingAction {
    return {
        id: 'pending-1', actionType: 'SCORE', value: '2P', teamId: 'teamA',
        quarter, timestamp: Date.now(),
        playersOnCourt: [{ id: 'a1', number: 4, name: '選手4' }],
    } as PendingAction;
}

function openPanel(quarter: number) {
    render(
        <PendingActionPanel
            pendingActions={[makePending(quarter)]}
            onResolveUnknown={vi.fn()} onRemove={vi.fn()} onDirectResolve={vi.fn()}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: /保留/ }));
}

describe('保留の延長表示', () => {
    it('保留一覧は延長を OT と出す', () => {
        openPanel(5);
        expect(screen.getByText('OT')).toBeTruthy();
        expect(screen.queryByText('Q5')).toBeNull();
    });

    it('保留一覧は2回目の延長を OT2 と出す', () => {
        openPanel(6);
        expect(screen.getByText('OT2')).toBeTruthy();
    });

    it('保留一覧の通常クォーターは従来どおり', () => {
        openPanel(3);
        expect(screen.getByText('Q3')).toBeTruthy();
    });

    it('削除確認も延長を OT と出す', () => {
        openPanel(5);
        fireEvent.click(screen.getByRole('button', { name: '削除' }));
        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('OT');
        expect(dialog.textContent).not.toContain('Q5');
    });
});
