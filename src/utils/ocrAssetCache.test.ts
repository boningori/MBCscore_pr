import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OCR_ASSET_URLS, warmOcrAssetCache, startOcrAssetWarmup } from './ocrAssetCache';
import { TESSERACT_PATHS } from './tesseractAssets';

// fetch は SW（CacheFirst）に拾われて 'mbc-ocr-assets' に入る前提。
// ここでは「どの条件のときに何本取りにいくか」だけを検証する。
function stubFetch(impl?: (url: string) => Promise<Response>) {
    const fetchMock = vi.fn(impl ?? (() => Promise.resolve(new Response(new ArrayBuffer(8)))));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

/** すでにキャッシュに入っているURLの集合を差し込む */
function stubCaches(present: readonly string[] = []) {
    const match = vi.fn((url: string) =>
        Promise.resolve(present.includes(url) ? new Response('cached') : undefined));
    vi.stubGlobal('caches', { match });
    return match;
}

function setEnvironment({
    online = true,
    controlled = true,
    saveData = false,
}: { online?: boolean; controlled?: boolean; saveData?: boolean } = {}) {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
    Object.defineProperty(navigator, 'serviceWorker', {
        value: { controller: controlled ? {} : null },
        configurable: true,
        writable: true,
    });
    Object.defineProperty(navigator, 'connection', {
        value: { saveData },
        configurable: true,
        writable: true,
    });
}

beforeEach(() => {
    setEnvironment();
    stubCaches();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(navigator, 'connection');
});

describe('OCRアセットのURL', () => {
    it('worker・wasmコア・言語データの3本を対象にする', () => {
        expect(OCR_ASSET_URLS).toHaveLength(3);
    });

    it('言語データは tesseract.js が実際に要求するパスと一致する', () => {
        // tesseract.js は `${langPath}/${lang}.traineddata${gzip ? '.gz' : ''}` を引く
        // （node_modules/tesseract.js/src/worker-script/index.js）。
        // ここがずれると事前取得しても本番のOCRは別URLを叩いてキャッシュを外す
        // 置き場所には版が入る（tesseractAssets.ts）ので、langPath から組み立てて比べる
        expect(OCR_ASSET_URLS).toContain(`${TESSERACT_PATHS.langPath}/jpn.traineddata.gz`);
        expect(TESSERACT_PATHS.langPath).toMatch(/\/tesseract\/[^/]+\/tessdata$/);
    });

    it('すべて tesseract/ 配下（SWのruntimeCachingの対象）に載る', () => {
        for (const url of OCR_ASSET_URLS) expect(url).toContain('/tesseract/');
    });
});

describe('warmOcrAssetCache', () => {
    it('条件がそろえば全アセットを取りにいく', async () => {
        const fetchMock = stubFetch();
        await expect(warmOcrAssetCache()).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(OCR_ASSET_URLS.length);
    });

    it('オフラインなら何も取りにいかない', async () => {
        setEnvironment({ online: false });
        const fetchMock = stubFetch();
        await expect(warmOcrAssetCache()).resolves.toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('SWにまだ制御されていなければ取りにいかない（キャッシュに入らず無駄になるため）', async () => {
        setEnvironment({ controlled: false });
        const fetchMock = stubFetch();
        await expect(warmOcrAssetCache()).resolves.toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('データセーバーが有効なら取りにいかない', async () => {
        setEnvironment({ saveData: true });
        const fetchMock = stubFetch();
        await expect(warmOcrAssetCache()).resolves.toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('1本でも失敗したら false を返し、以降を打ち切る', async () => {
        const fetchMock = stubFetch(() => Promise.reject(new Error('network')));
        await expect(warmOcrAssetCache()).resolves.toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('HTTPエラーも失敗として扱う（404のHTMLをキャッシュさせない）', async () => {
        const fetchMock = stubFetch(() => Promise.resolve(new Response('nope', { status: 404 })));
        await expect(warmOcrAssetCache()).resolves.toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('例外を外に投げない（失敗しても記録機能に影響させない）', async () => {
        vi.stubGlobal('fetch', () => { throw new Error('boom'); });
        await expect(warmOcrAssetCache()).resolves.toBe(false);
    });

    // fetch はSWのCacheFirstに拾われるので通信は起きないが、3.8MBのwasmを
    // 毎起動でArrayBufferに読み出すことになる。持っているかは先に確かめる
    it('すでにキャッシュにあるものは取り直さない', async () => {
        stubCaches(OCR_ASSET_URLS);
        const fetchMock = stubFetch();
        await expect(warmOcrAssetCache()).resolves.toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('足りない分だけ取りにいく', async () => {
        stubCaches([OCR_ASSET_URLS[0]]);
        const fetchMock = stubFetch();
        await expect(warmOcrAssetCache()).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(OCR_ASSET_URLS.length - 1);
        expect(fetchMock).not.toHaveBeenCalledWith(OCR_ASSET_URLS[0]);
    });
});

describe('startOcrAssetWarmup', () => {
    it('一度成功したら二度と取りにいかない', async () => {
        const fetchMock = stubFetch();
        const stop = startOcrAssetWarmup(0);
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(OCR_ASSET_URLS.length));

        window.dispatchEvent(new Event('online'));
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(OCR_ASSET_URLS.length);
        stop();
    });

    it('失敗したらオンライン復帰で取り直す', async () => {
        setEnvironment({ online: false });
        const fetchMock = stubFetch();
        const stop = startOcrAssetWarmup(0);
        await vi.waitFor(() => expect(fetchMock).not.toHaveBeenCalled());

        setEnvironment({ online: true });
        window.dispatchEvent(new Event('online'));
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(OCR_ASSET_URLS.length));
        stop();
    });

    it('停止後はオンライン復帰で取りにいかない', async () => {
        setEnvironment({ online: false });
        const fetchMock = stubFetch();
        const stop = startOcrAssetWarmup(0);
        stop();

        setEnvironment({ online: true });
        window.dispatchEvent(new Event('online'));
        await Promise.resolve();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
