import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, renderHook } from '@testing-library/react';
import { UpdatePrompt } from './UpdatePrompt';
import { useAppUpdate } from './useAppUpdate';

afterEach(cleanup);

describe('UpdatePrompt', () => {
    it('更新を促すメッセージと2つの選択肢を出す', () => {
        render(<UpdatePrompt onUpdate={() => { }} onDismiss={() => { }} />);
        expect(screen.getByRole('status')).toBeTruthy();
        expect(screen.getByRole('button', { name: '更新' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '後で' })).toBeTruthy();
    });

    it('「更新」でonUpdate、「後で」でonDismissが呼ばれる', () => {
        const onUpdate = vi.fn();
        const onDismiss = vi.fn();
        render(<UpdatePrompt onUpdate={onUpdate} onDismiss={onDismiss} />);

        fireEvent.click(screen.getByRole('button', { name: '更新' }));
        expect(onUpdate).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: '後で' }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});

// useAppUpdate は watchForUpdate の通知を受けて表示可否を決める
const watchForUpdate = vi.hoisted(() => vi.fn());
const applyUpdate = vi.hoisted(() => vi.fn());
const startUpdatePolling = vi.hoisted(() => vi.fn());
vi.mock('../../utils/swUpdate', () => ({ watchForUpdate, applyUpdate, startUpdatePolling }));

describe('useAppUpdate', () => {
    beforeEach(() => {
        watchForUpdate.mockReset();
        applyUpdate.mockReset();
        startUpdatePolling.mockReset();
        watchForUpdate.mockReturnValue(() => { });
        startUpdatePolling.mockReturnValue(() => { });
    });

    /** watchForUpdate に渡されたコールバックを発火させる */
    function fireUpdateReady() {
        act(() => { watchForUpdate.mock.calls[0][0](); });
    }

    it('更新が来るまでは表示しない', () => {
        const { result } = renderHook(() => useAppUpdate(false));
        expect(result.current.show).toBe(false);
    });

    it('更新が来たら表示する', () => {
        const { result } = renderHook(() => useAppUpdate(false));
        fireUpdateReady();
        expect(result.current.show).toBe(true);
    });

    it('試合中は更新が来ても表示しない', () => {
        // 試合中にリロードを促すのは、記録作業を中断させるので避ける
        const { result } = renderHook(() => useAppUpdate(true));
        fireUpdateReady();
        expect(result.current.show).toBe(false);
    });

    it('試合が終われば保留していた更新を表示する', () => {
        const { result, rerender } = renderHook(
            ({ inGame }) => useAppUpdate(inGame),
            { initialProps: { inGame: true } },
        );
        fireUpdateReady();
        expect(result.current.show).toBe(false);

        rerender({ inGame: false });
        expect(result.current.show).toBe(true);
    });

    it('「後で」で閉じたら再表示しない', () => {
        const { result } = renderHook(() => useAppUpdate(false));
        fireUpdateReady();

        act(() => { result.current.dismiss(); });
        expect(result.current.show).toBe(false);
    });

    it('applyでapplyUpdateを呼ぶ', () => {
        const { result } = renderHook(() => useAppUpdate(false));
        fireUpdateReady();

        act(() => { result.current.apply(); });
        expect(applyUpdate).toHaveBeenCalledTimes(1);
    });

    it('アンマウント時に購読を解除する', () => {
        const unsubscribe = vi.fn();
        watchForUpdate.mockReturnValue(unsubscribe);

        const { unmount } = renderHook(() => useAppUpdate(false));
        unmount();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    // 検知（watchForUpdate）だけでは、ブラウザが新SWを探しにいかない限り何も
    // 起きない。開きっぱなしの端末でも気づけるよう、こちらから問い合わせる
    it('更新の定期問い合わせを開始し、アンマウントで止める', () => {
        const stop = vi.fn();
        startUpdatePolling.mockReturnValue(stop);

        const { unmount } = renderHook(() => useAppUpdate(false));
        expect(startUpdatePolling).toHaveBeenCalledTimes(1);

        unmount();
        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('記録中でも問い合わせは止めない（保留するのは案内の表示だけ）', () => {
        renderHook(() => useAppUpdate(true));
        expect(startUpdatePolling).toHaveBeenCalledTimes(1);
    });
});
