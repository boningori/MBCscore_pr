import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { transcribeAudio } from './audioTranscribe';

// jsdom の Blob には arrayBuffer があるが、base64化の経路を固定するためスタブする
const wav = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });

const okResponse = (text: string) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

const errorResponse = (status: number, message: string) => ({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ error: { message } }),
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('audioTranscribe: 成功時', () => {
    it('文字起こしされたテキストを返す', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(okResponse('青5シュートミス、青6リバウンド') as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(true);
        expect(result.text).toBe('青5シュートミス、青6リバウンド');
    });

    it('前後の空白を落とす', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(okResponse('  青4シュート成功\n') as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.text).toBe('青4シュート成功');
    });

    it('最速のflash-liteから試す', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(okResponse('あ') as never);
        await transcribeAudio(wav(), 'key');
        const url = vi.mocked(fetch).mock.calls[0][0] as string;
        expect(url).toContain('gemini-2.5-flash-lite');
    });

    it('APIキーをヘッダで送る（URLに載せない）', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(okResponse('あ') as never);
        await transcribeAudio(wav(), 'secret-key');
        const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
        expect(url).not.toContain('secret-key');
        expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    });
});

describe('audioTranscribe: 失敗時', () => {
    it('404なら次のモデルを試す', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(errorResponse(404, 'not found') as never)
            .mockResolvedValueOnce(okResponse('青6アシスト') as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(true);
        expect(result.text).toBe('青6アシスト');
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    it('404以外のAPIエラーは即座に返し、後続モデルを試さない', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(errorResponse(403, 'API key not valid') as never);
        const result = await transcribeAudio(wav(), 'bad-key');
        expect(result.success).toBe(false);
        expect(result.error).toContain('API key not valid');
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    it('通信そのものが落ちたら失敗を返す', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('Network error') as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('候補が空なら失敗を返す', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) } as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(false);
    });

    it('エラー応答本文がJSONでなくても（プロキシの502等）、即座に失敗を返し全モデルを回らない', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
        } as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(false);
        // 1回叩いた時点でインフラ障害と分かるはずで、5モデル分待たせてはいけない
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    // 会場のキャプティブポータル等は200 OKでHTMLのログインページを返すことがある。
    // response.okがtrueでも本文がJSONとは限らない。ここが無防備だと外側のcatchに
    // 落ちて「通信そのものが失敗した」ときと区別が付かず、base64化した音声を
    // 残りの全モデル分再送信してしまう
    it('200でも本文がJSONでない場合（キャプティブポータル等）、即座に失敗を返し全モデルを回らない', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
        } as never);
        const result = await transcribeAudio(wav(), 'key');
        expect(result.success).toBe(false);
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });
});
