import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipe } from './useSwipe';

function touchEvent(clientY: number) {
    return {
        touches: [{ clientY }],
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as React.TouchEvent;
}

describe('useSwipe', () => {
    it('閾値を超える上スワイプでonSwipeUpが発火する', () => {
        const up = vi.fn();
        const down = vi.fn();
        const { result } = renderHook(() => useSwipe(up, down, 30));

        act(() => result.current.onTouchStart(touchEvent(200)));
        act(() => result.current.onTouchMove(touchEvent(150))); // 50px上
        expect(result.current.swipeDirection).toBe('up');
        act(() => result.current.onTouchEnd(touchEvent(150)));

        expect(up).toHaveBeenCalledTimes(1);
        expect(down).not.toHaveBeenCalled();
        expect(result.current.swipeDirection).toBeNull();
    });

    it('閾値を超える下スワイプでonSwipeDownが発火する', () => {
        const up = vi.fn();
        const down = vi.fn();
        const { result } = renderHook(() => useSwipe(up, down, 30));

        act(() => result.current.onTouchStart(touchEvent(100)));
        act(() => result.current.onTouchMove(touchEvent(160))); // 60px下
        act(() => result.current.onTouchEnd(touchEvent(160)));

        expect(down).toHaveBeenCalledTimes(1);
        expect(up).not.toHaveBeenCalled();
    });

    it('閾値未満の移動では何も発火しない', () => {
        const up = vi.fn();
        const down = vi.fn();
        const { result } = renderHook(() => useSwipe(up, down, 30));

        act(() => result.current.onTouchStart(touchEvent(100)));
        act(() => result.current.onTouchMove(touchEvent(110))); // 10px
        expect(result.current.swipeDirection).toBeNull();
        act(() => result.current.onTouchEnd(touchEvent(110)));

        expect(up).not.toHaveBeenCalled();
        expect(down).not.toHaveBeenCalled();
    });

    it('consumeSwipeFlag: スワイプ後は1回だけtrueを返す', () => {
        const { result } = renderHook(() => useSwipe(() => {}, () => {}, 30));

        act(() => result.current.onTouchStart(touchEvent(200)));
        act(() => result.current.onTouchMove(touchEvent(150)));
        act(() => result.current.onTouchEnd(touchEvent(150)));

        expect(result.current.consumeSwipeFlag()).toBe(true);
        expect(result.current.consumeSwipeFlag()).toBe(false);
    });

    it('スワイプしていなければconsumeSwipeFlagはfalse', () => {
        const { result } = renderHook(() => useSwipe(() => {}, () => {}, 30));
        expect(result.current.consumeSwipeFlag()).toBe(false);
    });
});
