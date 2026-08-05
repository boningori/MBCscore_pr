import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('Modal: 開いたときのフォーカス', () => {
    it('既定では最初の操作要素にフォーカスする', () => {
        render(
            <Modal onClose={() => { }} ariaLabel="テスト">
                <button>ひとつめ</button>
                <button>ふたつめ</button>
            </Modal>
        );

        expect(document.activeElement?.textContent).toBe('ひとつめ');
    });

    it('data-autofocus を付けた要素があればそちらを優先する', () => {
        // 「終了する」「削除する」のような取り返しのつかない操作が先頭にある確認ダイアログで、
        // 開いた直後のEnterがそのまま実行に繋がらないようにするための逃がし口
        render(
            <Modal onClose={() => { }} ariaLabel="テスト">
                <button>終了する</button>
                <button data-autofocus>キャンセル</button>
            </Modal>
        );

        expect(document.activeElement?.textContent).toBe('キャンセル');
    });

    it('閉じたら開く前の要素へフォーカスを戻す', () => {
        const opener = document.createElement('button');
        opener.textContent = '開く';
        document.body.appendChild(opener);
        opener.focus();

        const { unmount } = render(
            <Modal onClose={() => { }} ariaLabel="テスト">
                <button>ひとつめ</button>
            </Modal>
        );
        expect(document.activeElement?.textContent).toBe('ひとつめ');

        unmount();
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });
});

describe('Modal: 閉じる操作', () => {
    it('Escapeで閉じる', () => {
        const onClose = vi.fn();
        render(
            <Modal onClose={onClose} ariaLabel="テスト">
                <button>ひとつめ</button>
            </Modal>
        );

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closeOnEsc=false ならEscapeで閉じない', () => {
        const onClose = vi.fn();
        render(
            <Modal onClose={onClose} ariaLabel="テスト" closeOnEsc={false}>
                <button>ひとつめ</button>
            </Modal>
        );

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });
});
