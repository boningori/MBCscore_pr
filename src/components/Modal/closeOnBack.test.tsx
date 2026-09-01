import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Modal } from './Modal';
import { closeTopModal, hasOpenModal } from './modalStack';

// Modal は closeOnEsc / closeOnOverlayClick を無視して常に modalStack に載っていた。
// そのため「うっかりでは閉じない」ことを狙って Escape とオーバーレイを塞いだ
// ダイアログ（復元プロンプト）が、端末の戻る操作では閉じてしまう。
// タブレットに Escape キーは無く、エッジスワイプはいちばん誤爆しやすい操作なので、
// 塞いだつもりの経路が実質いちばん開いていたことになる。
//
// 復元プロンプトを閉じると sessionStorage に「見送った」印が付き、
// そのセッション中は二度と出ない（＝消えたデータの復旧を1回で取り逃がす）。

afterEach(() => {
    cleanup();
    expect(hasOpenModal()).toBe(false);
});

describe('戻る操作で閉じるか（closeOnBack）', () => {
    it('既定では戻るで閉じる', () => {
        const onClose = vi.fn();
        render(<Modal onClose={onClose} ariaLabel="ダイアログ">中身</Modal>);

        expect(closeTopModal()).toBe('closed');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('閉じるものが無ければ null', () => {
        expect(closeTopModal()).toBe(null);
    });

    it('closeOnBack={false} なら戻るで閉じない', () => {
        const onClose = vi.fn();
        render(<Modal onClose={onClose} closeOnBack={false} ariaLabel="復元の確認">中身</Modal>);

        closeTopModal();

        expect(onClose).not.toHaveBeenCalled();
    });

    it('閉じないだけで戻るは受け取る（下の画面へ通さない）', () => {
        render(<Modal onClose={vi.fn()} closeOnBack={false} ariaLabel="復元の確認">中身</Modal>);

        // null を返すと useScreenHistorySync が画面遷移として扱い、
        // ダイアログを開いたままホームへ飛ぶ。
        // 'closed' と区別できないと、こんどはホームで積んだ戻る用の
        // エントリが積み直されず、次の戻るでアプリごと終了する
        // （useScreenHistorySync の handlePopState）
        expect(closeTopModal()).toBe('received');
    });

    it('重なりの判定には従来どおり参加する（最前面が閉じない作りでも下は閉じない）', () => {
        const onCloseOuter = vi.fn();
        render(
            <>
                <Modal onClose={onCloseOuter} ariaLabel="外側">外</Modal>
                <Modal onClose={vi.fn()} closeOnBack={false} ariaLabel="内側">内</Modal>
            </>,
        );

        closeTopModal();

        expect(onCloseOuter).not.toHaveBeenCalled();
    });
});
