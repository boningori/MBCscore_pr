// 読み取りがおかしかったときに、何が返ってきたかを後から見られること。
//
// 生の応答は rawText に入っていたが、Tesseractへフォールバックすると
// rawText は Tesseract の文字列に置き換わり、Gemini が何を返したかは
// エラー文言しか残らなかった。いちばん見たい経路で消えていた。
//
// どのモデルが答えたかも残っていなかった。FALLBACK_MODELS の先頭は
// 最軽量の flash-lite なので、「flash-lite が雑に読んだ」のか
// 「pro でも間違えた」のかで打つ手が正反対になる。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const recognizeMock = vi.hoisted(() => vi.fn());
const terminateMock = vi.hoisted(() => vi.fn());
vi.mock('tesseract.js', () => ({
    createWorker: vi.fn(async () => ({ recognize: recognizeMock, terminate: terminateMock })),
}));

import { recognizePlayerList } from './imageOCR';
import { setAiOcrEnabled } from './appSettings';
import { FALLBACK_MODELS } from './geminiClient';

function geminiReply(text: string) {
    return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    } as unknown as Response;
}

function imageFile(bytes = 10): File {
    return new File([new Uint8Array(bytes)], 'roster.jpg', { type: 'image/jpeg' });
}

const ONE_TEAM = '{"teams":[{"players":[{"number":"4","name":"田中太郎"}]}]}';

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mbc_gemini_api_key', 'test-key');
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

describe('読み取りに成功したとき', () => {
    it('応答したモデル名が残る', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(ONE_TEAM)));

        const result = await recognizePlayerList(imageFile());

        expect(result.diagnostics?.geminiModel).toBe(FALLBACK_MODELS[0]);
    });

    it('1回で通ったときは試した履歴も1件だけ', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(ONE_TEAM)));

        const result = await recognizePlayerList(imageFile());

        expect(result.diagnostics?.geminiModelsTried).toEqual([FALLBACK_MODELS[0]]);
    });

    it('生の応答がそのまま残る', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(ONE_TEAM)));

        const result = await recognizePlayerList(imageFile());

        expect(result.diagnostics?.geminiRawText).toBe(ONE_TEAM);
    });
});

describe('Tesseractへフォールバックしたとき', () => {
    it('Geminiの生の応答が残る（ここが今まで消えていた）', async () => {
        const junk = '申し訳ありませんが読み取れませんでした。';
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(junk)));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.diagnostics?.geminiRawText).toBe(junk);
    });

    it('最後に試したモデル名が残る', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('読めません')));

        const result = await recognizePlayerList(imageFile());

        expect(result.diagnostics?.geminiModel).toBe(FALLBACK_MODELS[FALLBACK_MODELS.length - 1]);
    });

    it('試した全モデルが順に残る（最後の1件しか見えないと、軽いモデルの問題かプロンプトの問題か切り分けられない）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('読めません')));

        const result = await recognizePlayerList(imageFile());

        expect(result.diagnostics?.geminiModelsTried).toEqual(FALLBACK_MODELS);
    });
});

describe('複数チームで返し切ったとき', () => {
    it('診断情報が付く', async () => {
        const twoTeams = '{"teams":['
            + '{"players":[{"number":"4","name":"甲太郎"}]},'
            + '{"players":[{"number":"5","name":"乙次郎"}]}]}';
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(twoTeams)));

        const result = await recognizePlayerList(imageFile());

        expect(result.success).toBe(false);
        expect(result.diagnostics?.geminiRawText).toBe(twoTeams);
    });
});

describe('Geminiを試していないとき', () => {
    it('AI経路がOFFなら診断情報は空', async () => {
        setAiOcrEnabled(false);

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.diagnostics?.geminiRawText).toBeUndefined();
        expect(result.diagnostics?.geminiModel).toBeUndefined();
    });

    it('画像が大きすぎて送らなかったときも空', async () => {
        const result = await recognizePlayerList(imageFile(9 * 1024 * 1024));

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.diagnostics?.geminiModel).toBeUndefined();
    });
});
