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

    // beforeinstallprompt の prompt() は1イベントにつき1回しか呼べず、
    // 2回目は InvalidStateError で reject する。イベントを持ち続けていると
    // 「押しても何も起きないボタン」が画面に残る
    it('promptは二度呼ばない（案内を引っ込めて死んだボタンを残さない）', () => {
        const { result } = renderHook(() => useInstallPrompt());
        const { prompt } = fireBeforeInstallPrompt();

        act(() => { result.current.install(); });
        expect(result.current.mode).toBe('none');

        act(() => { result.current.install(); });
        expect(prompt).toHaveBeenCalledTimes(1);
    });

    it('promptが失敗しても外に投げない', async () => {
        const { result } = renderHook(() => useInstallPrompt());
        const rejected = vi.fn().mockRejectedValue(new Error('InvalidStateError'));
        const event = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void> };
        event.prompt = rejected;
        act(() => { window.dispatchEvent(event); });

        act(() => { result.current.install(); });
        await act(async () => { await Promise.resolve(); });
        expect(rejected).toHaveBeenCalled();
    });

    it('インストールが完了したら案内を消し、次回以降も出さない', () => {
        const { result, unmount } = renderHook(() => useInstallPrompt());
        fireBeforeInstallPrompt();
        expect(result.current.mode).toBe('prompt');

        // ブラウザタブ側は standalone にならないため、appinstalled を見ないと
        // インストール済みの人にカードが出続ける
        act(() => { window.dispatchEvent(new Event('appinstalled')); });
        expect(result.current.mode).toBe('none');
        unmount();

        const { result: again } = renderHook(() => useInstallPrompt());
        expect(again.current.mode).toBe('none');
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
