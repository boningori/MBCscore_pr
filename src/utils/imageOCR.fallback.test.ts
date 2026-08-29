// Gemini を使うときの取りこぼしを固定する。
//
// APIキーは「読み取り精度を上げる任意設定」であって、入れたせいで読めなくなる
// ことがあってはいけない。実測で2つの穴があった:
//   - Gemini が JSON 以外を返すと、throw ではなく success:false を return して
//     いたため Tesseract を一度も試さずに失敗が返る（キー無しなら読めた写真で
//     キー有りの利用者だけが失敗する）
//   - Gemini が返した背番号を検証しておらず、999 や -3 がそのまま名簿に入り、
//     文字列の "0" は index+1（別番号）へ化けていた

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const recognizeMock = vi.hoisted(() => vi.fn());
const terminateMock = vi.hoisted(() => vi.fn());
vi.mock('tesseract.js', () => ({
    createWorker: vi.fn(async () => ({ recognize: recognizeMock, terminate: terminateMock })),
}));

import { recognizePlayerList } from './imageOCR';
import { DOUBLE_ZERO_INTERNAL } from './playerNumber';

function geminiReply(text: string) {
    return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    } as unknown as Response;
}

/** size を指定できる File（jsdom の File は size を計算してくれる） */
function imageFile(bytes = 10): File {
    return new File([new Uint8Array(bytes)], 'roster.jpg', { type: 'image/jpeg' });
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mbc_gemini_api_key', 'test-key');
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

describe('GeminiがJSONを返さなかったとき', () => {
    it('Tesseractへフォールバックして読み取る', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('申し訳ありませんが読み取れませんでした。')));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.success).toBe(true);
        expect(result.players.map(p => p.number)).toEqual([4, 5]);
        // なぜ標準OCRになったのかを画面で説明できるよう理由を残す
        expect(result.fallbackReason).toContain('応答形式');
    });

    it('有効な選手が1人も取れなかったときもフォールバックする', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('[{"number": 999, "name": "範囲外"}]')));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.players.map(p => p.number)).toEqual([4, 5]);
    });
});

describe('Geminiが返した背番号の検証', () => {
    it('範囲外・負数は取り込まず、有効な番号だけ残す', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '[{"number": 999, "name": "範囲外"}, {"number": 7, "name": "正常"}, {"number": -3, "name": "負数"}]',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Gemini');
        expect(result.players.map(p => ({ n: p.number, name: p.name })))
            .toEqual([{ n: 7, name: '正常' }]);
    });

    it('文字列の "0" が別番号に化けない', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '[{"number": "0", "name": "ゼロ番"}, {"number": "12", "name": "十二番"}]',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players.map(p => p.number)).toEqual([0, 12]);
    });

    it('文字列の "00" は 0 と別の背番号として扱う', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('[{"number": "00", "name": "ダブルゼロ"}]')));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].number).toBe(DOUBLE_ZERO_INTERNAL);
    });

    it('小数や不正な型は取り込まない', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '[{"number": 4.5, "name": "小数"}, {"number": null, "name": "null"}, {"number": 9, "name": "正常"}]',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players.map(p => p.number)).toEqual([9]);
    });
});

describe('大きすぎる画像', () => {
    it('AIへは送らず標準OCRで読み取る（写真読込自体は使える）', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const result = await recognizePlayerList(imageFile(9 * 1024 * 1024));

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.usedEngine).toBe('Tesseract');
        expect(result.success).toBe(true);
        expect(result.fallbackReason).toContain('大き');
    });

    it('上限以下ならこれまでどおりAIへ送る', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('[{"number": 4, "name": "田中"}]')));

        const result = await recognizePlayerList(imageFile(1024));

        expect(result.usedEngine).toBe('Gemini');
    });
});
