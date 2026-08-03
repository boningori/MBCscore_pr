import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInstallPrompt } from './useInstallPrompt';

const isStandalone = vi.hoisted(() => vi.fn());
const isIos = vi.hoisted(() => vi.fn());
vi.mock('../../utils/installState', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../utils/installState')>()),
    isStandalone,
    isIos,
}));

/** Chromeが投げる beforeinstallprompt を模したイベント */
function fireBeforeInstallPrompt() {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void> };
    event.prompt = prompt;
    event.preventDefault = vi.fn();
    act(() => { window.dispatchEvent(event); });
    return { prompt, preventDefault: event.preventDefault };
}

beforeEach(() => {
    localStorage.clear();
    isStandalone.mockReturnValue(false);
    isIos.mockReturnValue(false);
});

afterEach(() => vi.clearAllMocks());

describe('useInstallPrompt', () => {
    it('イベントが来るまでは何も出さない', () => {
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.mode).toBe('none');
    });

    it('beforeinstallpromptを受け取ったらインストールボタンを出す', () => {
        const { result } = renderHook(() => useInstallPrompt());
        fireBeforeInstallPrompt();
        expect(result.current.mode).toBe('prompt');
    });

    it('ブラウザ既定のミニバーは抑止する（自前の導線に一本化する）', () => {
        renderHook(() => useInstallPrompt());
        const { preventDefault } = fireBeforeInstallPrompt();
        expect(preventDefault).toHaveBeenCalled();
    });

    it('installでブラウザのインストールダイアログを出す', () => {
        const { result } = renderHook(() => useInstallPrompt());
        const { prompt } = fireBeforeInstallPrompt();
        act(() => { result.current.install(); });
        expect(prompt).toHaveBeenCalledTimes(1);
    });

    it('iOSはbeforeinstallpromptが無いので手順案内を出す', () => {
        isIos.mockReturnValue(true);
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.mode).toBe('manual');
    });

    it('インストール済み（standalone起動）なら出さない', () => {
        isStandalone.mockReturnValue(true);
        isIos.mockReturnValue(true);
        const { result } = renderHook(() => useInstallPrompt());
        expect(result.current.mode).toBe('none');
    });

    it('一度閉じたら次回以降は出さない', () => {
        isIos.mockReturnValue(true);
        const { result, unmount } = renderHook(() => useInstallPrompt());
        expect(result.current.mode).toBe('manual');

        act(() => { result.current.dismiss(); });
        expect(result.current.mode).toBe('none');
        unmount();

        // 再起動しても出ない
        const { result: again } = renderHook(() => useInstallPrompt());
        expect(again.current.mode).toBe('none');
    });
});
