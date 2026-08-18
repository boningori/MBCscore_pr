// 保留アクションの削除は取り消せないので確認を挟む。
//
// 削除ボタンは「確定」のすぐ隣にあり、一発で消えていた。得点の保留を
// 誤って消すと最終スコアが狂うのに、試合終了時の「未割り当ての記録が
// あります」警告にも掛からない（もう存在しないため）。
// 得点・スタッツの記録には UndoSnackbar があるのに、より失いやすい
// ここだけが素通しだった。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PendingActionPanel } from './PendingActionPanel';
import type { PendingAction } from '../../types/pendingAction';

afterEach(cleanup);

function makePending(over: Partial<PendingAction> = {}): PendingAction {
    return {
        id: 'pending-1',
        actionType: 'SCORE',
        value: '2P',
        teamId: 'teamA',
        quarter: 2,
        timestamp: Date.now(),
        playersOnCourt: [{ id: 'a1', number: 4, name: '選手4' }],
        ...over,
    } as PendingAction;
}

/** バッジを開いて（1件なら明細まで自動展開）削除を押す */
function openAndClickRemove(pending = makePending()) {
    const onRemove = vi.fn();
    render(
        <PendingActionPanel
            pendingActions={[pending]}
            onResolveUnknown={vi.fn()}
            onRemove={onRemove}
            onDirectResolve={vi.fn()}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: /保留/ }));
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    return { onRemove };
}

describe('保留アクションの削除確認', () => {
    it('削除ボタンだけでは消さない', () => {
        const { onRemove } = openAndClickRemove();

        expect(onRemove).not.toHaveBeenCalled();
    });

    it('何を消すのかを確認で示す', () => {
        openAndClickRemove();

        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('2P成功');
        expect(dialog.textContent).toContain('Q2');
    });

    it('得点の保留は最終スコアに響くことを伝える', () => {
        openAndClickRemove();

        expect(screen.getByRole('dialog').textContent).toContain('取り消せません');
    });

    it('確認で実行するとはじめて消える', () => {
        const { onRemove } = openAndClickRemove();

        fireEvent.click(screen.getByRole('button', { name: '削除する' }));

        expect(onRemove).toHaveBeenCalledWith('pending-1');
    });

    it('確認を取り消せば消さない', () => {
        const { onRemove } = openAndClickRemove();

        fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

        expect(onRemove).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
