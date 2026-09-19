import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ExportButtons } from './ExportButtons';

afterEach(cleanup);

function renderButtons(isExporting = false) {
    const onExportPdf = vi.fn();
    const onExportJpeg = vi.fn();
    render(
        <ExportButtons
            isExporting={isExporting}
            onExportPdf={onExportPdf}
            onExportJpeg={onExportJpeg}
        />,
    );
    return { onExportPdf, onExportJpeg };
}

describe('出力ボタン', () => {
    it('PDF出力・JPEG出力の順で並ぶ', () => {
        renderButtons();

        const labels = screen.getAllByRole('button').map(b => b.textContent);
        expect(labels).toEqual(['PDF出力', 'JPEG出力']);
    });

    it('PDF出力を押すとPDFのハンドラを呼ぶ', () => {
        const { onExportPdf, onExportJpeg } = renderButtons();

        fireEvent.click(screen.getByRole('button', { name: 'PDF出力' }));

        expect(onExportPdf).toHaveBeenCalledTimes(1);
        expect(onExportJpeg).not.toHaveBeenCalled();
    });

    it('JPEG出力を押すとJPEGのハンドラを呼ぶ', () => {
        const { onExportPdf, onExportJpeg } = renderButtons();

        fireEvent.click(screen.getByRole('button', { name: 'JPEG出力' }));

        expect(onExportJpeg).toHaveBeenCalledTimes(1);
        expect(onExportPdf).not.toHaveBeenCalled();
    });

    it('出力中は両方のボタンを押せなくする', () => {
        renderButtons(true);

        for (const button of screen.getAllByRole('button')) {
            expect((button as HTMLButtonElement).disabled).toBe(true);
        }
    });

    // ラベルを「出力中…」に差し替えると読み上げ名（PDF出力/JPEG出力）が
    // 変わってしまう。知らせるのは別領域の役目
    it('出力中でもボタンのラベルは変わらない', () => {
        renderButtons(true);

        expect(screen.getByRole('button', { name: 'PDF出力' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'JPEG出力' })).toBeTruthy();
    });

    it('出力中は待つよう読み上げ領域で知らせる', () => {
        renderButtons(true);

        expect(screen.getByRole('status').textContent).toBe('出力中… そのままお待ちください');
    });

    // 空のときに文字が残ると、押していないのに出力中に見える。
    // 高さを持たせないのはCSS（:not(:empty)）の役目なので、中身は空にする
    it('出力中でなければ読み上げ領域は空', () => {
        renderButtons(false);

        expect(screen.getByRole('status').textContent).toBe('');
    });
});
