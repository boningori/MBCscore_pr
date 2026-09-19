import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { useElementExport } from './useElementExport';

const exportElement = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../utils/pdfExport', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../utils/pdfExport')>()),
    exportElement: (...args: unknown[]) => exportElement(...args),
}));

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../components/Toast/toastApi', () => ({ showToast }));

afterEach(() => {
    cleanup();
    exportElement.mockClear();
    showToast.mockClear();
});

function renderWithElement(options: { filename: string; windowWidth?: number; scale?: number; title?: string }) {
    const element = document.createElement('div');
    const ref = createRef<HTMLElement>() as { current: HTMLElement | null };
    ref.current = element;
    const { result } = renderHook(() => useElementExport(ref, options));
    return { result, element };
}

describe('useElementExport', () => {
    it('exportPdf は ref の要素を pdf として出力する', async () => {
        const { result, element } = renderWithElement({ filename: '試合_スタッツ' });

        result.current.exportPdf();

        await waitFor(() => expect(exportElement).toHaveBeenCalledTimes(1));
        expect(exportElement.mock.calls[0][0]).toBe(element);
        expect(exportElement.mock.calls[0][1]).toMatchObject({ filename: '試合_スタッツ', format: 'pdf' });
    });

    it('exportJpeg は jpeg として出力する', async () => {
        const { result, element } = renderWithElement({ filename: '試合_スタッツ' });

        result.current.exportJpeg();

        await waitFor(() => expect(exportElement).toHaveBeenCalledTimes(1));
        expect(exportElement.mock.calls[0][0]).toBe(element);
        expect(exportElement.mock.calls[0][1]).toMatchObject({ filename: '試合_スタッツ', format: 'jpeg' });
    });

    // 選手詳細は A4 幅・倍率3・タイトル付きで出す。format 以外の指定が
    // 落ちると、そこだけ既定（1280px・倍率4・タイトル無し）に化ける
    it('windowWidth・scale・title をそのまま渡す', async () => {
        const { result } = renderWithElement({
            filename: 'stats_一郎_5games', windowWidth: 827, scale: 3, title: '#4 一郎（5試合）',
        });

        result.current.exportPdf();

        await waitFor(() => expect(exportElement).toHaveBeenCalled());
        expect(exportElement.mock.calls[0][1]).toMatchObject({
            windowWidth: 827, scale: 3, title: '#4 一郎（5試合）',
        });
    });

    // 画面を離れた直後などに ref が空になりうる。null を渡すと
    // html2canvas が落ちて「出力に失敗しました」だけが出る
    it('ref が空なら何もしない', async () => {
        const ref = { current: null as HTMLElement | null };
        const { result } = renderHook(() => useElementExport(ref, { filename: 'x' }));

        result.current.exportPdf();
        result.current.exportJpeg();

        await Promise.resolve();
        expect(exportElement).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });

    it('出力中は isExporting が true になる', async () => {
        let resolveExport!: () => void;
        exportElement.mockImplementationOnce(() => new Promise<void>(res => { resolveExport = () => res(); }));
        const { result } = renderWithElement({ filename: 'x' });

        result.current.exportPdf();

        await waitFor(() => expect(result.current.isExporting).toBe(true));
        resolveExport();
        await waitFor(() => expect(result.current.isExporting).toBe(false));
    });

    // 通知の文面は「PDFを出力しました」「JPEGの出力に失敗しました」。
    // format をそのまま渡すと小文字の 'pdf' が文面に出る
    it('通知には PDF / JPEG の表示名を使う', async () => {
        const { result } = renderWithElement({ filename: 'x' });

        result.current.exportJpeg();

        await waitFor(() => expect(showToast).toHaveBeenCalled());
        expect(showToast.mock.calls[0][0]).toContain('JPEG');
    });
});
