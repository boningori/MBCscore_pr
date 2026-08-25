import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { VoiceMemo } from '../../utils/voiceMemo';
import { VoiceMemoStrip } from './VoiceMemoStrip';

afterEach(cleanup);

const memo = (over: Partial<VoiceMemo> = {}): VoiceMemo => ({
    id: 'm1',
    quarter: 2,
    createdAt: 1000,
    status: 'done',
    text: '青5シュートミス、青6リバウンド、青6アシスト、青4シュート成功',
    ...over,
});

const setup = (
    over: Partial<VoiceMemo> = {},
    extra: Partial<{ canRetry: boolean; total: number; position: number; undoMemo: VoiceMemo | null }> = {},
) => {
    const onRetry = vi.fn();
    const onDone = vi.fn();
    const onUndo = vi.fn();
    const onCollapse = vi.fn();
    const onOpenList = vi.fn();
    render(
        <VoiceMemoStrip
            memo={memo(over)}
            total={extra.total ?? 2}
            position={extra.position ?? 1}
            canRetry={extra.canRetry ?? false}
            undoMemo={extra.undoMemo ?? null}
            onRetry={onRetry}
            onDone={onDone}
            onUndo={onUndo}
            onCollapse={onCollapse}
            onOpenList={onOpenList}
        />,
    );
    return { onRetry, onDone, onUndo, onCollapse, onOpenList };
};

describe('VoiceMemoStrip: 状態ごとの表示', () => {
    it('done は文字起こし本文を出す', () => {
        setup();
        expect(screen.getByText(/青5シュートミス、青6リバウンド/)).toBeTruthy();
    });

    it('sending は文字起こし中と分かる', () => {
        setup({ status: 'sending', text: undefined });
        expect(screen.getByText(/文字起こし中/)).toBeTruthy();
    });

    it('failed は理由を出す', () => {
        setup({ status: 'failed', text: undefined, error: '通信エラー' });
        expect(screen.getByText(/通信エラー/)).toBeTruthy();
    });

    it('何件目 / 全何件 が分かる', () => {
        setup({}, { total: 3, position: 2 });
        expect(screen.getByText(/2件目/)).toBeTruthy();
        expect(screen.getByText(/全3件/)).toBeTruthy();
    });

    it('クォーターを出す', () => {
        setup({ quarter: 4 });
        expect(screen.getByText(/Q4/)).toBeTruthy();
    });
});

describe('VoiceMemoStrip: 再送', () => {
    it('failed かつ canRetry なら再送ボタンが出る', () => {
        const { onRetry } = setup({ status: 'failed', text: undefined, error: '通信エラー' }, { canRetry: true });
        fireEvent.click(screen.getByRole('button', { name: /再送/ }));
        expect(onRetry).toHaveBeenCalledWith('m1');
    });

    it('failed でも canRetry が false なら再送ボタンを出さない', () => {
        setup({ status: 'failed', text: undefined, error: '通信エラー' }, { canRetry: false });
        expect(screen.queryByRole('button', { name: /再送/ })).toBeNull();
    });

    it('done には再送ボタンを出さない', () => {
        setup({}, { canRetry: true });
        expect(screen.queryByRole('button', { name: /再送/ })).toBeNull();
    });
});

describe('VoiceMemoStrip: 済にする と Undo', () => {
    it('済にすると onDone がそのIDで呼ばれる', () => {
        const { onDone } = setup();
        fireEvent.click(screen.getByRole('button', { name: /済にする/ }));
        expect(onDone).toHaveBeenCalledWith('m1');
    });

    it('undoMemo が渡ると本文の代わりに「元に戻す」が出る', () => {
        setup({}, { undoMemo: memo() });
        expect(screen.queryByText(/青5シュートミス、青6リバウンド/)).toBeNull();
        expect(screen.getByText(/済にしました/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /元に戻す/ })).toBeTruthy();
    });

    it('undoMemo が無ければ「元に戻す」は出ない', () => {
        setup();
        expect(screen.queryByRole('button', { name: /元に戻す/ })).toBeNull();
    });

    it('元に戻すで onUndo が呼ばれる', () => {
        const { onUndo } = setup({}, { undoMemo: memo() });
        fireEvent.click(screen.getByRole('button', { name: /元に戻す/ }));
        expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('Undo 表示中は済にする・再送を出さない（二重操作を防ぐ）', () => {
        setup({ status: 'failed', text: undefined, error: '通信エラー' }, { undoMemo: memo(), canRetry: true });
        expect(screen.queryByRole('button', { name: /済にする/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /再送/ })).toBeNull();
    });
});

describe('VoiceMemoStrip: たたむ と 一覧', () => {
    it('たたむで onCollapse が呼ばれ、onDone は呼ばれない', () => {
        const { onCollapse, onDone } = setup();
        fireEvent.click(screen.getByRole('button', { name: /たたむ/ }));
        expect(onCollapse).toHaveBeenCalledTimes(1);
        expect(onDone).not.toHaveBeenCalled();
    });

    it('一覧で onOpenList が呼ばれる', () => {
        const { onOpenList } = setup();
        fireEvent.click(screen.getByRole('button', { name: /一覧/ }));
        expect(onOpenList).toHaveBeenCalledTimes(1);
    });
});
