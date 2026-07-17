import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useScreenHistorySync } from './useScreenHistorySync';

type Screen = 'home' | 'screenA' | 'screenB' | 'game';
const GUARDED: readonly Screen[] = ['game'];

function setup(initialCanShow = false) {
    const setScreen = vi.fn();
    const hook = renderHook(
        ({ screen, canShow }: { screen: Screen; canShow: boolean }) =>
            useScreenHistorySync<Screen>(screen, setScreen, {
                homeScreen: 'home',
                guardedScreens: GUARDED,
                canShowGuarded: canShow,
            }),
        { initialProps: { screen: 'home' as Screen, canShow: initialCanShow } },
    );
    return { ...hook, setScreen };
}

function historyScreen(): string | undefined {
    return (window.history.state as { appScreen?: string } | null)?.appScreen;
}

beforeEach(() => {
    window.history.replaceState(null, '');
});

describe('useScreenHistorySync', () => {
    it('マウント時に現在エントリへホーム画面を記録する', () => {
        setup();
        expect(historyScreen()).toBe('home');
    });

    it('ホーム→他画面はpushStateで履歴が1段増える', () => {
        const { rerender } = setup();
        const lengthBefore = window.history.length;
        rerender({ screen: 'screenA', canShow: false });
        expect(historyScreen()).toBe('screenA');
        expect(window.history.length).toBe(lengthBefore + 1);
    });

    it('非ホーム画面同士の遷移はreplaceStateで履歴が増えない', () => {
        const { rerender } = setup();
        rerender({ screen: 'screenA', canShow: false });
        const lengthAfterPush = window.history.length;
        rerender({ screen: 'screenB', canShow: false });
        expect(historyScreen()).toBe('screenB');
        expect(window.history.length).toBe(lengthAfterPush);
    });

    it('アプリ内操作でホームへ戻ると積んだエントリをポップする', async () => {
        const { rerender } = setup();
        rerender({ screen: 'screenA', canShow: false });
        expect(historyScreen()).toBe('screenA');
        rerender({ screen: 'home', canShow: false });
        // history.back()は非同期
        await waitFor(() => expect(historyScreen()).toBe('home'));
    });

    it('popstateでガード対象画面が復元不可ならホームへ差し替え、履歴stateも書き換える', () => {
        const { setScreen } = setup(false);
        window.dispatchEvent(new PopStateEvent('popstate', { state: { appScreen: 'game' } }));
        expect(setScreen).toHaveBeenCalledWith('home');
        expect(historyScreen()).toBe('home');
    });

    it('popstateでガード対象画面が復元可能ならそのまま遷移する', () => {
        const { setScreen } = setup(true);
        window.dispatchEvent(new PopStateEvent('popstate', { state: { appScreen: 'game' } }));
        expect(setScreen).toHaveBeenCalledWith('game');
    });

    it('popstateのstateが無い場合はホームへ遷移する', () => {
        const { setScreen } = setup();
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
        expect(setScreen).toHaveBeenCalledWith('home');
    });
});
