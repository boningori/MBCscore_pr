import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useScreenHistorySync } from './useScreenHistorySync';
import { Modal } from '../components/Modal';
import { hasOpenModal } from '../components/Modal/modalStack';

// 端末の戻る操作（Androidの戻るボタン／エッジスワイプ）は popstate として届く。
// 以前はこれを常に画面遷移として処理していたため、ファウル入力などの
// ダイアログを開いたままだと、閉じるどころか記録画面から追い出されていた。

type Screen = 'home' | 'game';

function setupSync(screen: Screen) {
    const setScreen = vi.fn();
    renderHook(() =>
        useScreenHistorySync<Screen>(screen, setScreen, {
            homeScreen: 'home',
            guardedScreens: ['game'],
            canShowGuarded: true,
        }),
    );
    return setScreen;
}

/** popstateを発火させる（jsdomのhistory.backはpopstateを同期発火しない） */
function fireBack(state: unknown = { appScreen: 'home' }) {
    act(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state }));
    });
}

beforeEach(() => {
    window.history.replaceState(null, '');
});

afterEach(() => {
    cleanup();
    // レジストリが漏れているとテスト間で干渉する
    expect(hasOpenModal()).toBe(false);
});

describe('戻る操作とモーダル', () => {
    it('モーダルが開いていれば、画面を変えずにモーダルだけ閉じる', () => {
        const setScreen = setupSync('game');
        const onClose = vi.fn();
        render(<Modal onClose={onClose} ariaLabel="ファウル入力">中身</Modal>);

        fireBack();

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(setScreen).not.toHaveBeenCalled();
    });

    it('モーダルを閉じたあと、いまの画面のエントリを積み直す', () => {
        setupSync('game');
        render(<Modal onClose={vi.fn()} ariaLabel="ファウル入力">中身</Modal>);

        fireBack();

        expect((window.history.state as { appScreen?: string } | null)?.appScreen).toBe('game');
    });

    it('モーダルが無ければ従来どおり画面遷移として扱う', () => {
        const setScreen = setupSync('game');

        fireBack({ appScreen: 'home' });

        expect(setScreen).toHaveBeenCalledWith('home');
    });

    it('重なっているときは最前面から1枚ずつ閉じる', () => {
        setupSync('game');
        const onCloseOuter = vi.fn();
        const onCloseInner = vi.fn();
        render(
            <>
                <Modal onClose={onCloseOuter} ariaLabel="外側">外</Modal>
                <Modal onClose={onCloseInner} ariaLabel="内側">内</Modal>
            </>,
        );

        fireBack();

        expect(onCloseInner).toHaveBeenCalledTimes(1);
        expect(onCloseOuter).not.toHaveBeenCalled();
    });

    it('閉じたモーダルは登録から外れ、次の戻るが画面遷移に届く', () => {
        const setScreen = setupSync('game');
        const { unmount } = render(<Modal onClose={vi.fn()} ariaLabel="ファウル入力">中身</Modal>);

        fireBack();
        expect(setScreen).not.toHaveBeenCalled();

        // 実際のアプリでは onClose の state 更新でアンマウントされる
        unmount();
        fireBack({ appScreen: 'home' });

        expect(setScreen).toHaveBeenCalledWith('home');
    });

    it('毎レンダーで作り直される onClose でも最新のものが呼ばれる', () => {
        setupSync('game');
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = render(<Modal onClose={first} ariaLabel="ダイアログ">中身</Modal>);
        rerender(<Modal onClose={second} ariaLabel="ダイアログ">中身</Modal>);

        fireBack();

        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });
});
