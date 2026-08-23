import { describe, it, expect, afterEach, vi } from 'vitest';
import { canAttemptExportShare, dataUrlToBlob, shareExportFile } from './pdfExport';

// iOS（特にホーム画面から起動した状態）では a[download] が当てにならない。
// バックアップは既に共有シートを持っている（dataBackup.shareFile）のに、
// スコアシートのPDF/画像出力だけがダウンロード一本槍だった。同じ受け皿を用意する。

function stubUserAgent(ua: string, maxTouchPoints = 0) {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120';

function makeFile(): File {
    return new File(['x'], 'scoresheet.pdf', { type: 'application/pdf' });
}

afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as unknown as { share?: unknown }).share;
    delete (navigator as unknown as { canShare?: unknown }).canShare;
    stubUserAgent(ANDROID);
});

describe('shareExportFile', () => {
    it('iOSで共有できるときは共有シートに渡す', async () => {
        stubUserAgent(IPHONE);
        let payload: { files: File[]; title?: string } | undefined;
        navigator.canShare = () => true;
        navigator.share = vi.fn(async (p: { files: File[]; title?: string }) => { payload = p; });

        const result = await shareExportFile(makeFile());

        expect(result).toBe('shared');
        expect(payload?.files[0].name).toBe('scoresheet.pdf');
        expect(payload?.title).toBe('scoresheet.pdf');
    });

    it('iOS以外では共有せず unsupported を返す（従来どおりダウンロードさせる）', async () => {
        stubUserAgent(ANDROID);
        const shareSpy = vi.fn();
        navigator.canShare = () => true;
        navigator.share = shareSpy;

        const result = await shareExportFile(makeFile());

        expect(result).toBe('unsupported');
        expect(shareSpy).not.toHaveBeenCalled();
    });

    it('iOSでも共有APIが無ければ unsupported を返す', async () => {
        stubUserAgent(IPHONE);

        expect(await shareExportFile(makeFile())).toBe('unsupported');
    });

    it('canShareがファイルを拒む場合も unsupported を返す', async () => {
        stubUserAgent(IPHONE);
        const shareSpy = vi.fn();
        navigator.canShare = () => false;
        navigator.share = shareSpy;

        expect(await shareExportFile(makeFile())).toBe('unsupported');
        expect(shareSpy).not.toHaveBeenCalled();
    });

    it('利用者が共有をやめたときは cancelled を返す（ダウンロードで追い打ちしない）', async () => {
        stubUserAgent(IPHONE);
        navigator.canShare = () => true;
        navigator.share = vi.fn(async () => {
            throw new DOMException('canceled', 'AbortError');
        });

        expect(await shareExportFile(makeFile())).toBe('cancelled');
    });

    it('共有そのものが失敗したときは unsupported を返す（ダウンロードへ逃がす）', async () => {
        stubUserAgent(IPHONE);
        navigator.canShare = () => true;
        navigator.share = vi.fn(async () => { throw new Error('share failed'); });

        expect(await shareExportFile(makeFile())).toBe('unsupported');
    });
});

describe('canAttemptExportShare', () => {
    // 共有に渡すにはファイル全体をメモリに起こす必要がある（PDFで数MB）。
    // 共有しない端末でそれを作らせないための事前判定。
    it('iOSで共有APIがあるときだけ true', () => {
        stubUserAgent(IPHONE);
        navigator.share = vi.fn();
        expect(canAttemptExportShare()).toBe(true);
    });

    it('iOS以外では false（ファイルを二重に作らない）', () => {
        stubUserAgent(ANDROID);
        navigator.share = vi.fn();
        expect(canAttemptExportShare()).toBe(false);
    });

    it('共有APIが無ければ false', () => {
        stubUserAgent(IPHONE);
        expect(canAttemptExportShare()).toBe(false);
    });
});

describe('dataUrlToBlob', () => {
    it('DataURLをMIMEタイプ付きのBlobに戻す（共有シートに渡すため）', async () => {
        // "MBC" を base64 にしたもの
        const blob = dataUrlToBlob('data:image/jpeg;base64,TUJD');

        expect(blob.type).toBe('image/jpeg');
        expect(await blob.text()).toBe('MBC');
    });
});
