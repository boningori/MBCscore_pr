// 端末の canvas 面積の上限に、出力の側から当たりにいかない。
//
// iOS Safari は canvas の面積に上限（広く知られている値で約16.78M px）を持つ。
// 選手詳細は scale 3 で出しており、1試合の時点で 2458×8702 = 21.4M px に達する
// （assertRenderedImage のコメントの実測値）。つまり iPhone/iPad では最初から
// 超えていて、出力は必ず失敗していた。しかも試合を重ねるほど縦に伸びるので、
// 使い込むほど悪くなる。
//
// 失敗を検知する守り（assertRenderedImage）はあったが、退避先が無かった。
// 利用者に出ていたのは「他のアプリを閉じてもう一度お試しください」で、
// 原因はメモリ不足ではなく面積上限なので、何度やっても直らない案内だった。
//
// 倍率を落として収める。紙に載せる解像度としては 2.5倍でも十分で、
// 「出ない」より「少し粗い」ほうが良い。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fitScaleToCanvasLimit, MAX_CANVAS_PIXELS } from './pdfExport';

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('html2canvas');
});

describe('fitScaleToCanvasLimit', () => {
    it('上限に収まる要素では、要求された倍率をそのまま使う', () => {
        // A4のスコアシート（794×1168）を4倍 = 14.8M px。上限の内側
        expect(fitScaleToCanvasLimit(794, 1168, 4)).toBe(4);
    });

    it('超える要素では、上限に収まる最大の倍率へ落とす', () => {
        // 選手詳細（827×2900）を3倍 = 21.6M px。上限を超える
        const scale = fitScaleToCanvasLimit(827, 2900, 3);

        expect(scale).toBeLessThan(3);
        expect(827 * scale * 2900 * scale).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    });

    it('落とすのは必要な分だけ（上限の直下まで使う）', () => {
        const scale = fitScaleToCanvasLimit(827, 2900, 3);

        // わずかに上げると超えてしまう＝上限を使い切っている
        expect(827 * (scale + 0.1) * 2900 * (scale + 0.1)).toBeGreaterThan(MAX_CANVAS_PIXELS);
    });

    it('等倍でも超えるほど大きい要素では、それ以上は落とさない（読めない画像を作らない）', () => {
        expect(fitScaleToCanvasLimit(10000, 10000, 3)).toBe(1);
    });

    it('寸法が測れない場合は要求どおりにする（jsdomや非表示要素）', () => {
        expect(fitScaleToCanvasLimit(0, 0, 4)).toBe(4);
    });
});

describe('exportElement', () => {
    /** 指定した寸法を返す要素を作る（jsdomはレイアウトしないため自分で持たせる） */
    function elementOfSize(width: number, height: number): HTMLElement {
        const el = document.createElement('div');
        Object.defineProperty(el, 'scrollWidth', { value: width, configurable: true });
        Object.defineProperty(el, 'scrollHeight', { value: height, configurable: true });
        return el;
    }

    function stubHtml2Canvas() {
        // 引数の型を明示するのは、呼ばれた倍率（第2引数）を後で読むため
        const html2canvas = vi.fn<(element: HTMLElement, options: { scale: number }) => Promise<HTMLCanvasElement>>(async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 10;
            canvas.height = 10;
            canvas.toDataURL = () => 'data:image/jpeg;base64,AAAA';
            return canvas;
        });
        vi.doMock('html2canvas', () => ({ default: html2canvas }));

        const origCreate = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...rest: unknown[]) => {
            const el = origCreate(tag, ...(rest as []));
            if (tag === 'canvas') {
                (el as HTMLCanvasElement).toDataURL = () => 'data:image/jpeg;base64,AAAA';
            }
            if (tag === 'a') (el as HTMLAnchorElement).click = () => { };
            return el;
        });
        return html2canvas;
    }

    it('上限を超える要素は、倍率を落としてから描く', async () => {
        const html2canvas = stubHtml2Canvas();
        const { exportElement } = await import('./pdfExport');

        await exportElement(elementOfSize(827, 2900), { filename: 'detail', format: 'jpeg', scale: 3 });

        const options = html2canvas.mock.calls[0][1];
        expect(options.scale).toBeLessThan(3);
        expect(827 * options.scale * 2900 * options.scale).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    });

    it('収まる要素では倍率を変えない', async () => {
        const html2canvas = stubHtml2Canvas();
        const { exportElement } = await import('./pdfExport');

        await exportElement(elementOfSize(794, 1168), { filename: 'sheet', format: 'jpeg' });

        const options = html2canvas.mock.calls[0][1];
        expect(options.scale).toBe(4);
    });
});
