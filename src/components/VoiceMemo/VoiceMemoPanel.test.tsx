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
