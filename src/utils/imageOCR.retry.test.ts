// Gemini が失敗したとき、どこまでモデルを変えて粘るか。
//
// FALLBACK_MODELS は5つある。404（そのモデルが無い）なら次を試す意味があるが、
// キー不正・権限・課金・レート制限は全モデルで同じ結果になる。にもかかわらず
// recognizeWithGemini は「これ以上試さない」つもりの throw を自分のループの
// catch で拾い直していて、最大8MBの画像を base64 にしたまま5回アップロードして
// から諦めていた。体育館の細い回線では、その待ち時間がそのまま記録者の手を止める。
//
// 同じ失敗モードは audioTranscribe.ts で先に見つけて直してあり、あちらのコメントは
// 「全モデルを律儀に試して記録者を待たせてしまう」と書いている。OCR側に反映が
// 漏れていたので揃える。
//
// 500/502 の本文がHTMLというケース（会場のキャプティブポータル、プロキシ障害）も
// 同じ。response.json() が投げてループの catch に落ちるため、やはり5回送っていた。
//
// どの経路でも最終的に Tesseract へ落ちること自体は変わらない。変わるのは
// 「そこへ着くまでに何回送るか」。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const recognizeMock = vi.hoisted(() => vi.fn());
const terminateMock = vi.hoisted(() => vi.fn());
vi.mock('tesseract.js', () => ({
    createWorker: vi.fn(async () => ({ recognize: recognizeMock, terminate: terminateMock })),
}));

import { recognizePlayerList } from './imageOCR';
import { setAiOcrEnabled } from './appSettings';
import { FALLBACK_MODELS } from './geminiClient';

function imageFile(bytes = 10): File {
    return new File([new Uint8Array(bytes)], 'roster.jpg', { type: 'image/jpeg' });
}

/** エラー本文がJSONで返る応答（Geminiの通常のエラー形式） */
function jsonError(status: number, message: string) {
    return {
        ok: false,
        status,
        statusText: 'Error',
        json: async () => ({ error: { message } }),
    } as unknown as Response;
}

/** エラー本文がHTMLで返る応答（プロキシ・キャプティブポータル） */
function htmlError(status: number) {
    return {
        ok: false,
        status,
        statusText: 'Bad Gateway',
        json: async () => { throw new SyntaxError('Unexpected token <'); },
    } as unknown as Response;
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mbc_gemini_api_key', 'test-key');
    // AI経路はキーの有無ではなく設定で決まる（imageOCR.aiGate.test.ts）。
    // ここはGemini側の挙動を見るテストなので、明示的にONにする
    setAiOcrEnabled(true);
    recognizeMock.mockReset();
    recognizeMock.mockResolvedValue({ data: { text: '4 田中太郎\n5 佐藤花子' } });
    vi.stubGlobal('FileReader', class {
        result = 'data:image/jpeg;base64,AAAA';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() { setTimeout(() => this.onload?.(), 0); }
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('全モデルで同じ結果になるエラー', () => {
    it('APIキーが不正なら、1回だけ送って標準OCRへ回す', async () => {
        const fetchSpy = vi.fn(async () => jsonError(400, 'API key not valid'));
        vi.stubGlobal('fetch', fetchSpy);

        const result = await recognizePlayerList(imageFile());

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(result.usedEngine).toBe('Tesseract');
        expect(result.success).toBe(true);
        expect(result.fallbackReason).toContain('API key not valid');
    });

    it('権限エラーでも送り直さない', async () => {
        const fetchSpy = vi.fn(async () => jsonError(403, 'Permission denied'));
        vi.stubGlobal('fetch', fetchSpy);

        await recognizePlayerList(imageFile());

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('レート制限でも送り直さない（送るほど詰まるため）', async () => {
        const fetchSpy = vi.fn(async () => jsonError(429, 'Quota exceeded'));
        vi.stubGlobal('fetch', fetchSpy);

        await recognizePlayerList(imageFile());

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('エラー本文がJSONでないとき（プロキシ障害）も送り直さない', async () => {
        const fetchSpy = vi.fn(async () => htmlError(502));
        vi.stubGlobal('fetch', fetchSpy);

        const result = await recognizePlayerList(imageFile());

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(result.usedEngine).toBe('Tesseract');
    });
});

describe('モデルを変える価値があるエラー', () => {
    it('404は次のモデルを試す', async () => {
        const fetchSpy = vi.fn(async () => jsonError(404, 'models/x is not found'));
        vi.stubGlobal('fetch', fetchSpy);

        const result = await recognizePlayerList(imageFile());

        expect(fetchSpy).toHaveBeenCalledTimes(FALLBACK_MODELS.length);
        expect(result.usedEngine).toBe('Tesseract');
    });

    it('404のあとで通ったモデルがあれば、そこで読み取る', async () => {
        let call = 0;
        const fetchSpy = vi.fn(async () => {
            call++;
            if (call === 1) return jsonError(404, 'not found');
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    candidates: [{ content: { parts: [{ text: '[{"number": 7, "name": "七番"}]' }] } }],
                }),
            } as unknown as Response;
        });
        vi.stubGlobal('fetch', fetchSpy);

        const result = await recognizePlayerList(imageFile());

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(result.usedEngine).toBe('Gemini');
        expect(result.players.map(p => p.number)).toEqual([7]);
    });
});
