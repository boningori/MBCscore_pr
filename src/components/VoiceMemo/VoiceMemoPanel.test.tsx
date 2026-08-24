import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { VoiceMemo } from '../../utils/voiceMemo';
import { VoiceMemoPanel } from './VoiceMemoPanel';

afterEach(cleanup);

const memo = (over: Partial<VoiceMemo> = {}): VoiceMemo => ({
    id: 'a',
    quarter: 2,
    createdAt: 1000,
    status: 'done',
    text: '青5シュートミス、青6リバウンド',
    ...over,
});

const setup = (memos: VoiceMemo[]) => {
    const onClose = vi.fn();
    const onRetry = vi.fn();
    const onRemove = vi.fn();
    render(<VoiceMemoPanel memos={memos} onClose={onClose} onRetry={onRetry} onRemove={onRemove} />);
    return { onClose, onRetry, onRemove };
};

describe('VoiceMemoPanel: 表示', () => {
    it('文字起こし結果を表示する', () => {
        setup([memo()]);
        expect(screen.getByText('青5シュートミス、青6リバウンド')).toBeTruthy();
    });

    it('クォーターを表示する', () => {
        setup([memo({ quarter: 3 })]);
        expect(screen.getByText(/Q3/)).toBeTruthy();
    });

    it('発話順（createdAt昇順）に並ぶ', () => {
        setup([
            memo({ id: 'a', createdAt: 100, text: '先に喋った' }),
            memo({ id: 'b', createdAt: 200, text: '後に喋った' }),
        ]);
        const texts = screen.getAllByText(/喋った/).map(el => el.textContent);
        expect(texts).toEqual(['先に喋った', '後に喋った']);
    });

    it('送信中は進行中と分かる表示になる', () => {
        setup([memo({ status: 'sending', text: undefined })]);
        expect(screen.getByText(/文字起こし中/)).toBeTruthy();
    });

    it('1件も無ければ案内を出す', () => {
        setup([]);
        expect(screen.getByText(/まだありません/)).toBeTruthy();
    });
});

describe('VoiceMemoPanel: 操作', () => {
    it('失敗したメモには再送ボタンが出る', () => {
        const { onRetry } = setup([memo({ status: 'failed', text: undefined, error: '通信エラー' })]);
        fireEvent.click(screen.getByRole('button', { name: /再送/ }));
        expect(onRetry).toHaveBeenCalledWith('a');
    });

    it('成功したメモには再送ボタンを出さない', () => {
        setup([memo()]);
        expect(screen.queryByRole('button', { name: /再送/ })).toBeNull();
    });

    it('削除できる', () => {
        const { onRemove } = setup([memo()]);
        fireEvent.click(screen.getByRole('button', { name: /削除/ }));
        expect(onRemove).toHaveBeenCalledWith('a');
    });

    it('失敗の理由が読める', () => {
        setup([memo({ status: 'failed', text: undefined, error: '通信エラー' })]);
        expect(screen.getByText(/通信エラー/)).toBeTruthy();
    });
});

describe('VoiceMemoPanel: 複数件でのボタン配線', () => {
    it('3件表示時、真ん中の行の削除は真ん中のidで呼ばれる（先頭・末尾のidでは呼ばれない）', () => {
        const { onRemove } = setup([
            memo({ id: 'first', createdAt: 100, text: '1件目' }),
            memo({ id: 'middle', createdAt: 200, text: '2件目' }),
            memo({ id: 'last', createdAt: 300, text: '3件目' }),
        ]);
        const buttons = screen.getAllByRole('button', { name: /削除/ });
        expect(buttons.length).toBe(3);
        fireEvent.click(buttons[1]);
        expect(onRemove).toHaveBeenCalledWith('middle');
        expect(onRemove).not.toHaveBeenCalledWith('first');
        expect(onRemove).not.toHaveBeenCalledWith('last');
    });

    it('3件（すべて失敗）表示時、真ん中の行の再送は真ん中のidで呼ばれる（先頭・末尾のidでは呼ばれない）', () => {
        const { onRetry } = setup([
            memo({ id: 'first', createdAt: 100, status: 'failed', text: undefined, error: '通信エラー' }),
            memo({ id: 'middle', createdAt: 200, status: 'failed', text: undefined, error: '通信エラー' }),
            memo({ id: 'last', createdAt: 300, status: 'failed', text: undefined, error: '通信エラー' }),
        ]);
        const buttons = screen.getAllByRole('button', { name: /再送/ });
        expect(buttons.length).toBe(3);
        fireEvent.click(buttons[1]);
        expect(onRetry).toHaveBeenCalledWith('middle');
        expect(onRetry).not.toHaveBeenCalledWith('first');
        expect(onRetry).not.toHaveBeenCalledWith('last');
    });
});

describe('VoiceMemoPanel: 削除・再送ボタンのアクセシブルネームの一意性', () => {
    it('同じクォーター・同じ分（分単位までしか出ない時刻）に完了済みメモが複数あっても、削除ボタンの名前は別々になる', () => {
        setup([
            memo({ id: 'a', createdAt: 1000, quarter: 2, text: '青5シュートミス' }),
            memo({ id: 'b', createdAt: 1030, quarter: 2, text: '青6リバウンド' }),
        ]);
        const buttons = screen.getAllByRole('button', { name: /削除/ });
        expect(buttons.length).toBe(2);
        const names = buttons.map(b => b.getAttribute('aria-label'));
        expect(new Set(names).size).toBe(2);
    });

    it('文字起こし中でテキストが無い状態が同じクォーター・同じ分に複数あっても、削除ボタンの名前は別々になる', () => {
        setup([
            memo({ id: 'a', createdAt: 1000, quarter: 2, status: 'sending', text: undefined }),
            memo({ id: 'b', createdAt: 1000, quarter: 2, status: 'sending', text: undefined }),
        ]);
        const buttons = screen.getAllByRole('button', { name: /削除/ });
        expect(buttons.length).toBe(2);
        const names = buttons.map(b => b.getAttribute('aria-label'));
        expect(new Set(names).size).toBe(2);
    });

    it('同じクォーター・同じ分・同じエラー内容の失敗メモが複数あっても、削除ボタンと再送ボタンの名前はそれぞれ別々になる', () => {
        setup([
            memo({ id: 'a', createdAt: 1000, quarter: 2, status: 'failed', text: undefined, error: '通信エラー' }),
            memo({ id: 'b', createdAt: 1030, quarter: 2, status: 'failed', text: undefined, error: '通信エラー' }),
        ]);
        const removeButtons = screen.getAllByRole('button', { name: /削除/ });
        const removeNames = removeButtons.map(b => b.getAttribute('aria-label'));
        expect(new Set(removeNames).size).toBe(2);

        const retryButtons = screen.getAllByRole('button', { name: /再送/ });
        const retryNames = retryButtons.map(b => b.getAttribute('aria-label'));
        expect(new Set(retryNames).size).toBe(2);
    });
});
