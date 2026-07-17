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
        quarter: 1,
        timestamp: Date.now(),
        playersOnCourt: [
            { id: 'a1', number: 4, name: '選手4' },
            { id: 'a2', number: 5, name: '選手5' },
        ],
        candidatePlayerIds: [],
        ...over,
    } as PendingAction;
}

function renderPanel(pendings: PendingAction[] = [makePending()]) {
    const onDirectResolve = vi.fn();
    render(
        <div>
            <button>外側のボタン</button>
            <PendingActionPanel
                pendingActions={pendings}
                onResolve={vi.fn()}
                onResolveUnknown={vi.fn()}
                onRemove={vi.fn()}
                onUpdateCandidates={vi.fn()}
                onDirectResolve={onDirectResolve}
            />
        </div>,
    );
    return { onDirectResolve };
}

describe('PendingActionPanel: 折りたたみバッジ', () => {
    it('初期状態は件数バッジのみで、明細は表示しない', () => {
        renderPanel();
        expect(screen.getByText(/保留/)).toBeTruthy();
        expect(screen.getByText('1')).toBeTruthy();
        expect(screen.queryByText('2P成功')).toBeNull();
    });

    it('バッジをタップすると展開されて明細が表示される', () => {
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: /保留/ }));
        expect(screen.getByText('2P成功')).toBeTruthy();
    });

    it('展開中に外側をタップすると折りたたまれる', () => {
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: /保留/ }));
        expect(screen.getByText('2P成功')).toBeTruthy();
        fireEvent.pointerDown(screen.getByText('外側のボタン'));
        expect(screen.queryByText('2P成功')).toBeNull();
    });

    it('1件のみの場合はバッジタップで明細まで自動展開され、選手選択→確定で解決できる', () => {
        const { onDirectResolve } = renderPanel();
        fireEvent.click(screen.getByRole('button', { name: /保留/ }));
        // 1件だけなので候補選手まで自動展開されている
        fireEvent.click(screen.getByText(/#4/));
        fireEvent.click(screen.getByText('確定'));
        expect(onDirectResolve).toHaveBeenCalledWith('pending-1', 'a1');
    });

    it('複数件の場合は明細行をタップして展開→選手選択→確定で解決できる', () => {
        const { onDirectResolve } = renderPanel([
            makePending(),
            makePending({ id: 'pending-2', value: 'FT' }),
        ]);
        fireEvent.click(screen.getByRole('button', { name: /保留/ }));
        // 複数件は自動展開されない
        expect(screen.queryByText('確定')).toBeNull();
        fireEvent.click(screen.getByText('2P成功'));
        fireEvent.click(screen.getByText(/#4/));
        fireEvent.click(screen.getByText('確定'));
        expect(onDirectResolve).toHaveBeenCalledWith('pending-1', 'a1');
    });

    it('明細行はaria-expandedを持つボタンとしてキーボード操作できる', () => {
        renderPanel([
            makePending(),
            makePending({ id: 'pending-2', value: 'FT' }),
        ]);
        fireEvent.click(screen.getByRole('button', { name: /保留/ }));
        const summary = screen.getByRole('button', { name: /2P成功/ });
        expect(summary.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(summary);
        expect(summary.getAttribute('aria-expanded')).toBe('true');
    });
});
