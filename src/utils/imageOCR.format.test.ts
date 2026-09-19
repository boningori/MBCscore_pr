// 様式そのものが読み取りに向いていないときの振る舞いを固定する。
//
// 1枚に複数チームが写っている写真は、端末内OCRに回しても正しい1チームは
// 出てこない。それどころか parseOcrText は行単位で拾うので、4チーム分の
// 選手が混ざった名簿がもっともらしく返り、利用者が誤りに気づけない。
// 撮り方の問題は撮り方で直してもらう。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const recognizeMock = vi.hoisted(() => vi.fn());
const terminateMock = vi.hoisted(() => vi.fn());
vi.mock('tesseract.js', () => ({
    createWorker: vi.fn(async () => ({ recognize: recognizeMock, terminate: terminateMock })),
}));

import { recognizePlayerList } from './imageOCR';
import { setAiOcrEnabled } from './appSettings';

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

describe('1枚に複数チームが写っていたとき', () => {
    const twoTeams = '{"teams":['
        + '{"teamName":"甲小","players":[{"number":4,"name":"甲太郎"}]},'
        + '{"teamName":"乙小","players":[{"number":5,"name":"乙次郎"}]}]}';

    it('Tesseractへ回さず、撮り直しを促す', async () => {
        const fetchMock = vi.fn(async () => geminiReply(twoTeams));
        vi.stubGlobal('fetch', fetchMock);

        const result = await recognizePlayerList(imageFile());

        expect(result.success).toBe(false);
        expect(result.players).toEqual([]);
        expect(result.error).toContain('複数のチーム');
        expect(result.error).toContain('1チーム');
        // 混ざった名簿を返さないことが要点。Tesseractは起動すらしない
        expect(recognizeMock).not.toHaveBeenCalled();
    });

    it('残りのモデルへ送り直さない（様式の問題はモデルを変えても直らない）', async () => {
        const fetchMock = vi.fn(async () => geminiReply(twoTeams));
        vi.stubGlobal('fetch', fetchMock);

        await recognizePlayerList(imageFile());

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('1チームだけ写っているとき', () => {
    it('そのチームの選手を取り込む', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"teamName":"甲小","players":[{"number":4,"name":"甲太郎"},{"number":5,"name":"甲次郎"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Gemini');
        expect(result.players.map(p => p.number)).toEqual([4, 5]);
    });

    it('選手が0人ならTesseractへ回す（読めなかっただけで様式の問題ではない）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply('{"teams":[{"players":[]}]}')));

        const result = await recognizePlayerList(imageFile());

        expect(result.usedEngine).toBe('Tesseract');
        expect(result.players.map(p => p.number)).toEqual([4, 5]);
    });
});
