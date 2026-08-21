import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UpdatePrompt, UPDATE_PROMPT_BODY_CLASS, UPDATE_PROMPT_HEIGHT_VAR } from './UpdatePrompt';
import { useAppUpdate } from './useAppUpdate';

afterEach(cleanup);

describe('UpdatePrompt', () => {
    it('更新を促すメッセージと2つの選択肢を出す', () => {
        render(<UpdatePrompt onUpdate={() => { }} onDismiss={() => { }} />);
        expect(screen.getByRole('status')).toBeTruthy();
        expect(screen.getByRole('button', { name: '更新' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '後で' })).toBeTruthy();
    });

    it('「更新」でonUpdate、「後で」でonDismissが呼ばれる', () => {
        const onUpdate = vi.fn();
        const onDismiss = vi.fn();
        render(<UpdatePrompt onUpdate={onUpdate} onDismiss={onDismiss} />);

        fireEvent.click(screen.getByRole('button', { name: '更新' }));
        expect(onUpdate).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: '後で' }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    // バーは position: fixed で最前面に浮くため、ページ側に同じ高さの逃げ場を
    // 作らないと画面下端の操作要素を覆う。375x812で実測したところ、ホーム画面の
    // 「📖 使用説明書」とチーム編集の「キャンセル」が、バーが出ている間は
    // タップ判定ごと奪われていた（どちらもページ末尾にあり、スクロールで
    // 逃がすこともできない）。
    it('表示中はページ下部に逃げ場を確保し、消えたら元に戻す', () => {
        const { unmount } = render(<UpdatePrompt onUpdate={() => { }} onDismiss={() => { }} />);

        expect(document.body.classList.contains(UPDATE_PROMPT_BODY_CLASS)).toBe(true);
        // 高さは狭い画面で縦積みになって変わるため、実測値を変数で渡す
        expect(document.documentElement.style.getPropertyValue(UPDATE_PROMPT_HEIGHT_VAR)).not.toBe('');

        unmount();

        expect(document.body.classList.contains(UPDATE_PROMPT_BODY_CLASS)).toBe(false);
        expect(document.documentElement.style.getPropertyValue(UPDATE_PROMPT_HEIGHT_VAR)).toBe('');
    });

    // 逃げ場は「TSがクラスと変数を出す」「CSSがそれを受けて余白にする」の
    // 二段構えなので、片方だけ消えても画面上は静かに元の不具合へ戻る。
    // 受け側が生きていることをここで押さえる。
    it('確保した高さを index.css が余白として受けている', () => {
        const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');

        expect(indexCss).toContain(`body.${UPDATE_PROMPT_BODY_CLASS}`);
        expect(indexCss).toContain(UPDATE_PROMPT_HEIGHT_VAR);
    });
});

// useAppUpdate は watchForUpdate の通知を受けて表示可否を決める
const watchForUpdate = vi.hoisted(() => vi.fn());
const applyUpdate = vi.hoisted(() => vi.fn());
const startUpdatePolling = vi.hoisted(() => vi.fn());
vi.mock('../../utils/swUpdate', () => ({ watchForUpdate, applyUpdate, startUpdatePolling }));

describe('useAppUpdate', () => {
    beforeEach(() => {
        watchForUpdate.mockReset();
        applyUpdate.mockReset();
        startUpdatePolling.mockReset();
        watchForUpdate.mockReturnValue(() => { });
        startUpdatePolling.mockReturnValue(() => { });
    });

    /** watchForUpdate に渡されたコールバックを発火させる */
    function fireUpdateReady() {
        act(() => { watchForUpdate.mock.calls[0][0](); });
    }

    it('更新が来るまでは表示しない', () => {
        const { result } = renderHook(() => useAppUpdate(false));
        expect(result.current.show).toBe(false);
    });

    it('更新が来たら表示する', () => {
        const { result } = renderHook(() => useAppUpdate(false));
        fireUpdateReady();
        expect(result.current.show).toBe(true);
    });

    it('試合中は更新が来ても表示しない', () => {
        // 試合中にリロードを促すのは、記録作業を中断させるので避ける
        const { result } = renderHook(() => useAppUpdate(true));
        fireUpdateReady();
        expect(result.current.show).toBe(false);
    });

    it('試合が終われば保留していた更新を表示する', () => {
        const { result, rerender } = renderHook(
            ({ inGame }) => useAppUpdate(inGame),
            { initialProps: { inGame: true } },
        );
        fireUpdateReady();
        expect(result.current.show).toBe(false);

        rerender({ inGame: false });
        expect(result.current.show).toBe(true);
    });

    it('「後で」で閉じたら再表示しない', () => {
        const { result } = renderHook(() => useAppUpdate(false));
        fireUpdateReady();

        act(() => { result.current.dismiss(); });
        expect(result.current.show).toBe(false);
    });

    it('applyでapplyUpdateを呼ぶ', () => {
        const { result } = renderHook(() => useAppUpdate(false));
        fireUpdateReady();

        act(() => { result.current.apply(); });
        expect(applyUpdate).toHaveBeenCalledTimes(1);
    });

    it('アンマウント時に購読を解除する', () => {
        const unsubscribe = vi.fn();
        watchForUpdate.mockReturnValue(unsubscribe);

        const { unmount } = renderHook(() => useAppUpdate(false));
        unmount();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    // 検知（watchForUpdate）だけでは、ブラウザが新SWを探しにいかない限り何も
    // 起きない。開きっぱなしの端末でも気づけるよう、こちらから問い合わせる
    it('更新の定期問い合わせを開始し、アンマウントで止める', () => {
        const stop = vi.fn();
        startUpdatePolling.mockReturnValue(stop);

        const { unmount } = renderHook(() => useAppUpdate(false));
        expect(startUpdatePolling).toHaveBeenCalledTimes(1);

        unmount();
        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('記録中でも問い合わせは止めない（保留するのは案内の表示だけ）', () => {
        renderHook(() => useAppUpdate(true));
        expect(startUpdatePolling).toHaveBeenCalledTimes(1);
    });
});
