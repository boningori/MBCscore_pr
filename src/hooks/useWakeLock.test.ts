import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

// WakeLockSentinel の最小実装。release() で released を立て、
// 実機同様に 'release' イベントを飛ばす
function makeSentinel() {
    const listeners: Array<() => void> = [];
    return {
        released: false,
        release: vi.fn(async function (this: { released: boolean }) {
            this.released = true;
            listeners.forEach(l => l());
        }),
        addEventListener: (_: string, l: () => void) => { listeners.push(l); },
        removeEventListener: (_: string, l: () => void) => {
            const i = listeners.indexOf(l);
            if (i >= 0) listeners.splice(i, 1);
        },
        fireRelease: () => listeners.forEach(l => l()),
    };
}

let request: ReturnType<typeof vi.fn>;

function installWakeLock() {
    request = vi.fn(async () => makeSentinel());
    Object.defineProperty(navigator, 'wakeLock', {
        value: { request }, configurable: true, writable: true,
    });
}

function removeWakeLock() {
    Object.defineProperty(navigator, 'wakeLock', {
        value: undefined, configurable: true, writable: true,
    });
}

function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

beforeEach(() => {
    installWakeLock();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('useWakeLock', () => {
    it('有効にすると画面のスリープを止める', async () => {
        renderHook(() => useWakeLock(true));
        await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    });

    it('無効なら要求しない', () => {
        renderHook(() => useWakeLock(false));
        expect(request).not.toHaveBeenCalled();
    });

    it('無効に切り替えたら解放する', async () => {
        const { rerender } = renderHook(({ on }) => useWakeLock(on), {
            initialProps: { on: true },
        });
        await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
        const sentinel = await request.mock.results[0].value;

        rerender({ on: false });
        await waitFor(() => expect(sentinel.release).toHaveBeenCalled());
    });

    it('アンマウントで解放する', async () => {
        const { unmount } = renderHook(() => useWakeLock(true));
        await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
        const sentinel = await request.mock.results[0].value;

        unmount();
        await waitFor(() => expect(sentinel.release).toHaveBeenCalled());
    });

    it('バックグラウンドから戻ったら取り直す', async () => {
        // WakeLockはタブが隠れるとブラウザ側で自動解放される。
        // 復帰時に取り直さないと、一度ホームに戻っただけで以後スリープしてしまう
        renderHook(() => useWakeLock(true));
        await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
        const sentinel = await request.mock.results[0].value;

        act(() => { sentinel.fireRelease(); });
        setVisibility('hidden');
        setVisibility('visible');

        await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    });

    it('非対応の端末でも例外を投げない', async () => {
        // iOS 16.4未満などWake Lock APIを持たない端末がある。
        // 記録そのものは続けられるので、黙って諦める
        removeWakeLock();
        expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    });

    it('要求が拒否されても例外を投げない', async () => {
        // 省電力モードのAndroidでは reject される
        request.mockRejectedValue(new Error('NotAllowedError'));
        renderHook(() => useWakeLock(true));
        await waitFor(() => expect(request).toHaveBeenCalled());
    });
});
