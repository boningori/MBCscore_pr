import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { UndoSnackbar } from './UndoSnackbar';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('UndoSnackbar', () => {
    it('メッセージと「取り消す」ボタンを表示する', () => {
        render(<UndoSnackbar message="#4 2P成功 +2" onUndo={vi.fn()} onDismiss={vi.fn()} />);
        expect(screen.getByText('#4 2P成功 +2')).toBeTruthy();
        expect(screen.getByText('取り消す')).toBeTruthy();
    });

    it('「取り消す」を押すとonUndoが呼ばれる', () => {
        const onUndo = vi.fn();
        render(<UndoSnackbar message="#4 2P成功 +2" onUndo={onUndo} onDismiss={vi.fn()} />);
        fireEvent.click(screen.getByText('取り消す'));
        expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('5秒経過でonDismissが呼ばれる', () => {
        vi.useFakeTimers();
        const onDismiss = vi.fn();
        render(<UndoSnackbar message="#4 2P成功 +2" onUndo={vi.fn()} onDismiss={onDismiss} />);
        act(() => {
            vi.advanceTimersByTime(4900);
        });
        expect(onDismiss).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('メッセージが変わるとタイマーがリセットされる', () => {
        vi.useFakeTimers();
        const onDismiss = vi.fn();
        const { rerender } = render(
            <UndoSnackbar message="#4 2P成功 +2" onUndo={vi.fn()} onDismiss={onDismiss} />,
        );
        act(() => {
            vi.advanceTimersByTime(4000);
        });
        rerender(<UndoSnackbar message="#5 AST" onUndo={vi.fn()} onDismiss={onDismiss} />);
        act(() => {
            vi.advanceTimersByTime(4000);
        });
        expect(onDismiss).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(1100);
        });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});
