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

describe('licenseNoの桁数検証', () => {
    it('1〜2桁は誤読として捨てる（背番号・通し番号・学年が入り込む）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":['
            + '{"number":4,"name":"学年混入","licenseNo":"6"},'
            + '{"number":5,"name":"背番号混入","licenseNo":"12"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players.map(p => p.licenseNo)).toEqual([undefined, undefined]);
        // 選手そのものは残す。捨てるのは誤読したライセンスNo.だけ
        expect(result.players.map(p => p.number)).toEqual([4, 5]);
    });

    it('3桁（下3桁）と10桁（JBA登録番号）はどちらも残す', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":['
            + '{"number":4,"name":"下3桁","licenseNo":"567"},'
            + '{"number":5,"name":"十桁","licenseNo":"ABC1234567"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players.map(p => p.licenseNo)).toEqual(['567', 'ABC1234567']);
    });

    it('記号を除いた結果が2桁以下なら捨てる', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"記号混じり","licenseNo":"1-2"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].licenseNo).toBeUndefined();
    });

    it('nullや空文字は未設定として扱う', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"欄なし","licenseNo":null}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].licenseNo).toBeUndefined();
    });
});

describe('背番号を読み取れなかった選手', () => {
    it('捨てた件数を返す（黙って消さない）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":['
            + '{"number":567,"name":"ライセンス誤読"},'
            + '{"number":7,"name":"正常"},'
            + '{"number":-3,"name":"負数"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players.map(p => p.name)).toEqual(['正常']);
        expect(result.invalidNumberCount).toBe(2);
    });

    it('全員読めていれば0', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"甲"},{"number":5,"name":"乙"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.invalidNumberCount).toBe(0);
    });
});

describe('氏名の空白', () => {
    it('均等割付の字間スペースを取り除く', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"加 藤　旺 介"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].name).toBe('加藤旺介');
    });

    it('姓名の区切りスペースも取り除く（識別キーを揃えるため）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"田中 太郎"}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].name).toBe('田中太郎');
    });

    it('空白だけの氏名は連番で補う（既存の挙動を保つ）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"　 "}]}]}',
        )));

        const result = await recognizePlayerList(imageFile());

        expect(result.players[0].name).toBe('選手1');
    });
});

/** fetchに渡されたリクエスト本文を取り出す */
function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return JSON.parse(init.body as string);
}

describe('Geminiへ送る内容', () => {
    async function capture() {
        const fetchMock = vi.fn(async () => geminiReply(
            '{"teams":[{"players":[{"number":4,"name":"甲"}]}]}',
        ));
        vi.stubGlobal('fetch', fetchMock);
        await recognizePlayerList(imageFile());
        return sentBody(fetchMock);
    }

    it('JSONスキーマで応答形式を固定する', async () => {
        const body = await capture();
        const config = body.generationConfig as Record<string, unknown>;

        expect(config.responseMimeType).toBe('application/json');
        expect(config.responseSchema).toBeDefined();
    });

    it('捏造を促す指示を含まない', async () => {
        const body = await capture();
        const prompt = JSON.stringify(body.contents);

        // 「読めなければ0」は監督・コーチ行を背番号0の選手に変えてしまう
        expect(prompt).not.toContain('読み取れない場合は0');
        expect(prompt).not.toContain('省略可');
    });

    it('背番号とライセンスNo.の見分け方を渡す', async () => {
        const body = await capture();
        const prompt = JSON.stringify(body.contents);

        // 公式様式は見出し「No.」の列が2つある（通し番号と背番号）
        expect(prompt).toContain('通し番号');
        // 桁数の不変条件が判別の土台
        expect(prompt).toContain('0〜99');
        expect(prompt).toContain('3桁');
        expect(prompt).toContain('10桁');
    });

    it('選手以外の行を除外するよう指示する', async () => {
        const body = await capture();
        const prompt = JSON.stringify(body.contents);

        expect(prompt).toContain('監督');
        expect(prompt).toContain('帯同審判');
    });
});
