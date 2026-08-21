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

    it('スナックバーの外側をタップするとonDismissが即座に呼ばれる', () => {
        const onDismiss = vi.fn();
        render(
            <div>
                <button>他のボタン</button>
                <UndoSnackbar message="#4 2P成功 +2" onUndo={vi.fn()} onDismiss={onDismiss} />
            </div>,
        );
        fireEvent.pointerDown(screen.getByText('他のボタン'));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('スナックバー内側のタップではonDismissは呼ばれない', () => {
        const onDismiss = vi.fn();
        render(<UndoSnackbar message="#4 2P成功 +2" onUndo={vi.fn()} onDismiss={onDismiss} />);
        fireEvent.pointerDown(screen.getByText('取り消す'));
        expect(onDismiss).not.toHaveBeenCalled();
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

// 同じ選手が同じ種別を続けて記録するのは普通にある（#4 の 2P が2連続など）。
// リセットの判定を文言だけで見ていたため、2件目のタイマーが1件目のものを
// 引き継ぎ、取り消せる時間が短くなっていた（極端な場合はほぼ0）。
// 取り消しの対象は記録そのものなので、記録の識別子で判定する。
describe('UndoSnackbar: 同じ文言の記録が続いたとき', () => {
    it('記録が変われば文言が同じでもタイマーがリセットされる', () => {
        vi.useFakeTimers();
        const onDismiss = vi.fn();
        const { rerender } = render(
            <UndoSnackbar recordId="entry-1" message="#4 2P成功 +2" onUndo={vi.fn()} onDismiss={onDismiss} />,
        );
        act(() => {
            vi.advanceTimersByTime(4000);
        });
        rerender(
            <UndoSnackbar recordId="entry-2" message="#4 2P成功 +2" onUndo={vi.fn()} onDismiss={onDismiss} />,
        );
        act(() => {
            vi.advanceTimersByTime(4000);
        });
        expect(onDismiss).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(1100);
        });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('同じ記録のまま再描画されてもタイマーは延びない', () => {
        vi.useFakeTimers();
        const onDismiss = vi.fn();
        const { rerender } = render(
            <UndoSnackbar recordId="entry-1" message="#4 2P成功 +2" onUndo={vi.fn()} onDismiss={onDismiss} />,
        );
        act(() => {
            vi.advanceTimersByTime(4000);
        });
        rerender(
            <UndoSnackbar recordId="entry-1" message="#4 2P成功 +2" onUndo={vi.fn()} onDismiss={onDismiss} />,
        );
        act(() => {
            vi.advanceTimersByTime(1100);
        });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});
