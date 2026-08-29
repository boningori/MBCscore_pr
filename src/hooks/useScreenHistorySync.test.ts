import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useScreenHistorySync } from './useScreenHistorySync';
import { registerModal, unregisterModal } from '../components/Modal/modalStack';

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

// 各テストのフックを片付ける。popstate のリスナーはマウント中ずっと生きており、
// 残したままだと次のテストで同じ popstate が複数のフックへ配られる
// （モーダルを閉じた回数を数えるテストが、前のテストのぶんまで拾ってしまう）
afterEach(cleanup);

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

// ホームへ戻るために自分で呼んだ history.back() の popstate は、
// 「利用者が戻った」ではないので closeTopModal() へ進ませてはいけない。
//
// 実測（実ブラウザ）: 試合を保存すると setScreen('home') と
// setShowBackupPrompt(true) が続けて走る。back() を出してから popstate が
// 届くまでの数msの間にバックアップ督促がマウントされ、身代わりに閉じられていた
// （mount の 8ms 後に unmount → 直後に popstate {"appScreen":"home"}）。
// データ保全のための唯一の能動的な促しが、画面に出た瞬間に消えていた。
describe('自分で出したホームへの戻り', () => {
    it('その popstate では最前面のモーダルを閉じない', async () => {
        const { rerender } = setup();
        rerender({ screen: 'screenA', canShow: false });

        // ホームへ戻す（内部で history.back() が出る）
        rerender({ screen: 'home', canShow: false });

        // back() の popstate が届く前にモーダルが開いた、という順序を作る
        const close = vi.fn();
        const id = registerModal(close);
        window.dispatchEvent(new PopStateEvent('popstate', { state: { appScreen: 'home' } }));

        expect(close).not.toHaveBeenCalled();
        unregisterModal(id);
        await waitFor(() => expect(historyScreen()).toBe('home'));
    });

    it('その次の popstate は従来どおりモーダルを閉じる（利用者の操作）', () => {
        const { rerender } = setup();
        rerender({ screen: 'screenA', canShow: false });
        rerender({ screen: 'home', canShow: false });

        const close = vi.fn();
        const id = registerModal(close);
        // 1回目は自分で出した戻りに消費される
        window.dispatchEvent(new PopStateEvent('popstate', { state: { appScreen: 'home' } }));
        // 2回目が利用者の戻る操作
        window.dispatchEvent(new PopStateEvent('popstate', { state: { appScreen: 'home' } }));

        expect(close).toHaveBeenCalledTimes(1);
        unregisterModal(id);
    });
});
