import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useOfflineToast } from './useOfflineToast';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../components/Toast/toastApi', () => ({ showToast }));

function setOnline(online: boolean) {
    Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
    act(() => { window.dispatchEvent(new Event(online ? 'online' : 'offline')); });
}

beforeEach(() => {
    showToast.mockReset();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
    // 自動クリーンアップが有効でないため明示的に外す。
    // 残したままだと前のテストのリスナーも発火して呼び出し回数がずれる。
    cleanup();
    vi.clearAllMocks();
});

describe('useOfflineToast', () => {
    it('オンラインのままなら何も出さない', () => {
        renderHook(() => useOfflineToast());
        expect(showToast).not.toHaveBeenCalled();
    });

    it('オフラインになった瞬間に、記録を続けられることを伝える', () => {
        renderHook(() => useOfflineToast());
        setOnline(false);

        expect(showToast).toHaveBeenCalledTimes(1);
        // 全機能オフラインで動くので、警告ではなく安心材料として伝える
        expect(showToast.mock.calls[0][0]).toContain('記録は続けられます');
        expect(showToast.mock.calls[0][1]).toBe('success');
    });

    it('復帰したら知らせる', () => {
        renderHook(() => useOfflineToast());
        setOnline(false);
        showToast.mockReset();

        setOnline(true);
        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast.mock.calls[0][0]).toContain('オンライン');
    });

    it('最初からオフラインでも起動時には出さない', () => {
        // 体育館では常時オフラインになりうる。起動のたびに出すと煩わしく、
        // ホーム画面のフッターに「オフライン動作」と常時表示もある。
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        renderHook(() => useOfflineToast());
        expect(showToast).not.toHaveBeenCalled();
    });

    it('アンマウント後は反応しない', () => {
        const { unmount } = renderHook(() => useOfflineToast());
        unmount();
        setOnline(false);
        expect(showToast).not.toHaveBeenCalled();
    });
});
