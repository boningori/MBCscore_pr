import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useExportAction } from './useExportAction';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../components/Toast/toastApi', () => ({ showToast }));

beforeEach(() => {
    showToast.mockReset();
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

// 遅延して解決/棄却できる操作を作る（出力中の状態を観測するため）
function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe('useExportAction', () => {
    it('初期状態では出力中ではない', () => {
        const { result } = renderHook(() => useExportAction());
        expect(result.current.isExporting).toBe(false);
    });

    it('出力中は isExporting が true になる', async () => {
        const d = deferred<void>();
        const { result } = renderHook(() => useExportAction());

        act(() => { void result.current.runExport(() => d.promise, 'PDF'); });
        await waitFor(() => expect(result.current.isExporting).toBe(true));

        await act(async () => { d.resolve(); await d.promise; });
        expect(result.current.isExporting).toBe(false);
    });

    it('成功したら完了を知らせる', async () => {
        const { result } = renderHook(() => useExportAction());

        await act(async () => { await result.current.runExport(async () => { }, 'PDF'); });

        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast.mock.calls[0][0]).toContain('PDF');
        expect(showToast.mock.calls[0][1]).toBe('success');
    });

    // iOSの共有シートを閉じただけの場合、ファイルはどこにも残っていない。
    // 例外は出ないので、以前はここを成功として「出力しました」と報告していた
    // （実測: iPadのUAで共有をキャンセルすると、ダウンロードは起きないのに
    // 成功トーストだけが出る）。利用者が自分でやめた操作なので失敗とも言わない
    it('やめた（cancelled）ときは成功も失敗も知らせない', async () => {
        const { result } = renderHook(() => useExportAction());

        await act(async () => { await result.current.runExport(async () => 'cancelled' as const, 'JPEG'); });

        expect(showToast).not.toHaveBeenCalled();
        expect(result.current.isExporting).toBe(false);
    });

    it('saved を返したときは従来どおり完了を知らせる', async () => {
        const { result } = renderHook(() => useExportAction());

        await act(async () => { await result.current.runExport(async () => 'saved' as const, 'JPEG'); });

        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast.mock.calls[0][1]).toBe('success');
    });

    it('失敗したらエラーを知らせ、出力中を解除する', async () => {
        // html2canvasはタブレットのメモリ不足で失敗しうる。
        // 握りつぶすと「押したのに何も起きない」状態になるため必ず伝える
        const { result } = renderHook(() => useExportAction());

        await act(async () => {
            await result.current.runExport(async () => { throw new Error('canvas too large'); }, 'PDF');
        });

        expect(result.current.isExporting).toBe(false);
        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast.mock.calls[0][0]).toContain('PDF');
        expect(showToast.mock.calls[0][1]).toBe('error');
    });

    it('出力中に再度呼んでも二重に実行しない', async () => {
        // 出力は数秒かかり無反応に見えるため二度押しされやすい。
        // 並行して走らせるとcanvasを二重に確保してメモリ不足を招く
        const d = deferred<void>();
        const task = vi.fn(() => d.promise);
        const { result } = renderHook(() => useExportAction());

        act(() => { void result.current.runExport(task, 'PDF'); });
        await waitFor(() => expect(result.current.isExporting).toBe(true));
        await act(async () => { await result.current.runExport(task, 'PDF'); });

        expect(task).toHaveBeenCalledTimes(1);

        await act(async () => { d.resolve(); await d.promise; });
    });

    it('アンマウント後に完了しても状態を更新しない', async () => {
        const d = deferred<void>();
        const { result, unmount } = renderHook(() => useExportAction());

        act(() => { void result.current.runExport(() => d.promise, 'PDF'); });
        await waitFor(() => expect(result.current.isExporting).toBe(true));
        unmount();

        await act(async () => { d.resolve(); await d.promise; });
        // 警告なく完走すればよい（React の act 警告が出ないこと）
        expect(showToast).toHaveBeenCalledTimes(1);
    });
});
