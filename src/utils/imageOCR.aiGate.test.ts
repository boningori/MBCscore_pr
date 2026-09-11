// 写真をAIへ送るかどうかは、APIキーの有無ではなく設定で決める。
//
// キーは音声メモと共用なので、キーの存在をそのまま「画像を送ってよい」と
// 読み替えることはできない。実際、音声メモのためにキーを入れた利用者は、
// 名簿の撮影画像——子どもの氏名とJBA登録番号が写ったもの——まで黙って
// Googleへ送る状態になっていた。音声メモ側は設定ON＋同意を要求しているのに、
// より機微の高い画像のほうが素通しだった。
//
// 標準OCR（Tesseract）は端末内で完結するので、OFFでも写真読込そのものは使える。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const recognizeMock = vi.hoisted(() => vi.fn());
const terminateMock = vi.hoisted(() => vi.fn());
vi.mock('tesseract.js', () => ({
    createWorker: vi.fn(async () => ({ recognize: recognizeMock, terminate: terminateMock })),
}));

import { recognizePlayerList } from './imageOCR';
import { setAiOcrEnabled } from './appSettings';

function imageFile(bytes = 10): File {
    return new File([new Uint8Array(bytes)], 'roster.jpg', { type: 'image/jpeg' });
}

function geminiReply(text: string) {
    return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    } as unknown as Response;
}

beforeEach(() => {
    localStorage.clear();
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

describe('AI写真読込がOFFのとき', () => {
    it('APIキーがあっても画像を送らない', async () => {
        localStorage.setItem('mbc_gemini_api_key', 'test-key');
        setAiOcrEnabled(false);
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const result = await recognizePlayerList(imageFile());

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.usedEngine).toBe('Tesseract');
    });

    // 端末内のOCRは残る。設定を切ったせいで写真読込ごと使えなくなっては困る
    it('標準OCRで読み取りは続けられる', async () => {
        localStorage.setItem('mbc_gemini_api_key', 'test-key');
        setAiOcrEnabled(false);
        vi.stubGlobal('fetch', vi.fn());

        const result = await recognizePlayerList(imageFile());

        expect(result.success).toBe(true);
        expect(result.players.map(p => p.number)).toEqual([4, 5]);
    });

    // OFFは利用者が選んだ状態であって、うまくいかなかった結果ではない。
    // 「AIに失敗したので標準OCRにしました」と出すと、直せる不具合だと思わせる
    it('フォールバックの理由は出さない', async () => {
        localStorage.setItem('mbc_gemini_api_key', 'test-key');
        setAiOcrEnabled(false);
        vi.stubGlobal('fetch', vi.fn());

        const result = await recognizePlayerList(imageFile());

        expect(result.fallbackReason).toBeFalsy();
    });
});

describe('AI写真読込がONのとき', () => {
    it('APIキーがあれば従来どおりAIへ送る', async () => {
        localStorage.setItem('mbc_gemini_api_key', 'test-key');
        setAiOcrEnabled(true);
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('[{"number": 7, "name": "七番"}]')));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Gemini');
        expect(result.players.map(p => p.number)).toEqual([7]);
    });

    it('APIキーが無ければ標準OCRのまま（設定だけでは送れない）', async () => {
        setAiOcrEnabled(true);
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const result = await recognizePlayerList(imageFile());

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.usedEngine).toBe('Tesseract');
    });
});
