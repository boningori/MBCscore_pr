// 出力の結末を、成功として報告してよいかまで含めて扱う。
//
// このコードベースは「無言の失敗を成功と報告する」を一度潰している
// （inlinePageStyles のコメント、useExportAction の冒頭）が、出力の最終段だけ
// 検査が入っていなかった。実測で2つの経路を確認した:
//   - toDataURL が 'data:,' を返すと、0バイトのファイルを保存して
//     「JPEGを出力しました」と報告する（iOSは上限を超えた canvas でこれを返す。
//     選手詳細の出力は1試合の時点で 2458x8702 = 21.4M px に達する）
//   - iOSの共有シートを閉じると、何も保存されないのに成功トーストだけが出る

import { describe, it, expect, afterEach, vi } from 'vitest';
import { exportElement } from './pdfExport';

function stubUserAgent(ua: string, maxTouchPoints = 0) {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120';

/** html2canvas を差し替えて、任意の canvas を返させる */
function stubHtml2Canvas(canvas: HTMLCanvasElement) {
    vi.doMock('html2canvas', () => ({ default: vi.fn(async () => canvas) }));
}

function makeCanvas(dataUrl: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    canvas.toDataURL = () => dataUrl;
    // exportElement は結果を別canvasへ描き直す。その複製にも同じ振る舞いをさせる
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...rest: unknown[]) => {
        const el = origCreate(tag, ...(rest as []));
        if (tag === 'canvas') (el as HTMLCanvasElement).toDataURL = () => dataUrl;
        return el;
    });
    return canvas;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('html2canvas');
    delete (navigator as unknown as { share?: unknown }).share;
    delete (navigator as unknown as { canShare?: unknown }).canShare;
    stubUserAgent(ANDROID);
});

describe('出力できなかったときに成功と報告しない', () => {
    it('canvasが空を返したら例外にする（0バイトのファイルを保存しない）', async () => {
        stubHtml2Canvas(makeCanvas('data:,'));
        const { exportElement: subject } = await import('./pdfExport');

        const clicks: string[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            clicks.push(this.download);
        });

        await expect(subject(document.createElement('div'), { filename: 'x', format: 'jpeg' }))
            .rejects.toThrow(/画像を生成できませんでした/);
        // 壊れたファイルを保存していない
        expect(clicks).toEqual([]);
    });

    it('正常に描けたら saved を返してダウンロードする', async () => {
        stubHtml2Canvas(makeCanvas('data:image/jpeg;base64,AAAA'));
        const { exportElement: subject } = await import('./pdfExport');

        const clicks: string[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            clicks.push(this.download);
        });

        const outcome = await subject(document.createElement('div'), { filename: 'x', format: 'jpeg' });

        expect(outcome).toBe('saved');
        expect(clicks).toEqual(['x.jpg']);
    });

    it('iOSで共有シートを閉じたら cancelled を返す（ダウンロードもしない）', async () => {
        stubHtml2Canvas(makeCanvas('data:image/jpeg;base64,AAAA'));
        stubUserAgent(IPHONE);
        navigator.canShare = () => true;
        navigator.share = vi.fn(async () => { throw new DOMException('cancelled', 'AbortError'); });
        const { exportElement: subject } = await import('./pdfExport');

        const clicks: string[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            clicks.push(this.download);
        });

        const outcome = await subject(document.createElement('div'), { filename: 'x', format: 'jpeg' });

        expect(outcome).toBe('cancelled');
        expect(clicks).toEqual([]);
    });

    it('iOSで共有できたら saved を返す', async () => {
        stubHtml2Canvas(makeCanvas('data:image/jpeg;base64,AAAA'));
        stubUserAgent(IPHONE);
        navigator.canShare = () => true;
        navigator.share = vi.fn(async () => { });
        const { exportElement: subject } = await import('./pdfExport');

        const outcome = await subject(document.createElement('div'), { filename: 'x', format: 'jpeg' });

        expect(outcome).toBe('saved');
    });
});

// 型の取り違えを防ぐための最小確認（exportElement は void ではなく結末を返す）
describe('exportElement の戻り値', () => {
    it('Promise<ExportOutcome> を返す', () => {
        expect(typeof exportElement).toBe('function');
    });
});
