import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, renderHook, waitFor } from '@testing-library/react';
import { useScreenHistorySync } from './useScreenHistorySync';
import { Modal } from '../components/Modal';
import { hasOpenModal } from '../components/Modal/modalStack';

// ホーム画面は履歴の基点で、エントリを積まない（他画面へ行くときだけ pushState）。
// そのためホームでモーダルを開いても、戻る操作に消費できるエントリが無く、
// popstate が発生しないままアプリごと終了していた。
// 実測: 新規タブで history.length === 1 のまま設定モーダルが開き、開いても 1 のまま。
//
// 対象はホームから開くモーダル全部——アプリ設定（APIキー・バックアップ・データ削除）、
// 「進行中の試合があります」警告、復元プロンプト、バックアップ督促。
// PWAでは「設定を開いて戻る＝アプリ終了」になっていた。

type Screen = 'home' | 'game';

function setupSync(screen: Screen) {
    const setScreen = vi.fn();
    const view = renderHook(
        ({ s }: { s: Screen }) =>
            useScreenHistorySync<Screen>(s, setScreen, {
                homeScreen: 'home',
                guardedScreens: ['game'],
                canShowGuarded: true,
            }),
        { initialProps: { s: screen } },
    );
    return { setScreen, view };
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
    expect(hasOpenModal()).toBe(false);
});

describe('ホームでモーダルを開いたときの戻る操作', () => {
    it('戻るで消費させるエントリを積む（積まないとアプリが終了する）', () => {
        setupSync('home');
        const before = window.history.length;

        render(<Modal onClose={vi.fn()} ariaLabel="アプリ設定">中身</Modal>);

        expect(window.history.length).toBe(before + 1);
    });

    it('その戻るはモーダルだけを閉じ、画面遷移にはしない', () => {
        const { setScreen } = setupSync('home');
        const onClose = vi.fn();
        render(<Modal onClose={onClose} ariaLabel="アプリ設定">中身</Modal>);

        fireBack();

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(setScreen).not.toHaveBeenCalled();
    });

    it('重ねて開いても積むのは1つ（履歴が溜まらない）', () => {
        setupSync('home');
        const before = window.history.length;

        render(
            <>
                <Modal onClose={vi.fn()} ariaLabel="外側">外</Modal>
                <Modal onClose={vi.fn()} ariaLabel="内側">内</Modal>
            </>,
        );

        expect(window.history.length).toBe(before + 1);
    });

    it('戻るで1枚閉じてもまだ開いていれば、次の戻るのぶんを積み直す', async () => {
        setupSync('home');
        const onCloseInner = vi.fn();
        const { rerender } = render(
            <>
                <Modal onClose={vi.fn()} ariaLabel="外側">外</Modal>
                <Modal onClose={onCloseInner} ariaLabel="内側">内</Modal>
            </>,
        );

        fireBack();
        expect(onCloseInner).toHaveBeenCalledTimes(1);
        // 実ブラウザではこの戻るで積んだエントリが消費されている。
        // jsdomは合成popstateでは実際にポップしないので、消費後の深さは
        // 「積み直しで1つ増えたか」で見る
        const afterBack = window.history.length;

        // 実際のアプリでは onClose の state 更新でアンマウントされる
        act(() => {
            rerender(<Modal onClose={vi.fn()} ariaLabel="外側">外</Modal>);
        });

        await waitFor(() => expect(window.history.length).toBe(afterBack + 1));
    });

    it('ホーム以外の画面では積まない（画面のエントリが既にある）', () => {
        setupSync('game');
        const before = window.history.length;

        render(<Modal onClose={vi.fn()} ariaLabel="ファウル入力">中身</Modal>);

        expect(window.history.length).toBe(before);
    });

    it('モーダルが無ければホームの戻るは従来どおり画面遷移として扱う', () => {
        const { setScreen } = setupSync('home');

        fireBack({ appScreen: 'home' });

        expect(setScreen).toHaveBeenCalledWith('home');
    });

    // 閉じるのと同時にホームから移動するモーダルがある。
    // 「進行中の試合があります」の『試合を再開する』『新規試合を開始』がそれで、
    // 中断した試合を持つ利用者はほぼ必ずここを通る。
    //
    // モーダル用に積んだエントリを取り除く戻りは、降りた先が履歴の基点＝ホーム。
    // そこへ「いまの画面」を書き込むと、ホームのエントリが遷移先の画面名で
    // 上書きされて消える。実測（本番ビルド）: 再開後に戻ると何も起きず
    // （試合画面のまま）、もう一度でPWAごと終了していた。
    it('閉じるのと同時に画面遷移しても、ホームのエントリを上書きしない', () => {
        const { view } = setupSync('home');
        const modal = render(<Modal onClose={vi.fn()} ariaLabel="進行中の試合があります">中身</Modal>);

        // 『試合を再開する』＝モーダルを閉じるのと画面遷移が同じ更新で起きる
        act(() => {
            modal.unmount();
            view.rerender({ s: 'game' });
        });

        const replaceState = vi.spyOn(window.history, 'replaceState');
        const pushState = vi.spyOn(window.history, 'pushState');
        // モーダル解除で予約された戻りの popstate が遅れて届く
        // （消費されるのは state が home のエントリ）
        fireBack({ appScreen: 'home' });

        // 基点は書き換えない。書き換えると戻るでホームへ帰れなくなる
        expect(replaceState).not.toHaveBeenCalledWith({ appScreen: 'game' }, '');
        // 代わりに、いまの画面のエントリを積み直す
        expect(pushState).toHaveBeenCalledWith({ appScreen: 'game' }, '');

        replaceState.mockRestore();
        pushState.mockRestore();
    });
});
