// 体育館のWi-Fiは「繋がっているのに外へ出られない」ことがある（キャプティブ
// ポータル・上流の断）。その状態の fetch は解決も棄却もしないまま数分居座り、
// 写真読込は「読み込み中」、接続テストは「接続テスト中...」のまま戻らない。
// どちらも中断する手段が画面に無いので、時間で打ち切る。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout, isTimeoutError, TIMEOUT_MESSAGE } from './fetchWithTimeout';

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('fetchWithTimeout', () => {
    it('期限内に返ればそのレスポンスをそのまま返す', async () => {
        const response = new Response('ok');
        const fetchSpy = vi.fn(async () => response);
        vi.stubGlobal('fetch', fetchSpy);

        await expect(fetchWithTimeout('https://example.test', {}, 1000)).resolves.toBe(response);
    });

    it('期限を過ぎたら通信を中断して、時間切れと分かる例外を投げる', async () => {
        vi.useFakeTimers();
        // 応答しない通信。中断されたときだけ棄却する（実際のfetchと同じ振る舞い）
        vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));

        const promise = fetchWithTimeout('https://example.test', {}, 1000);
        const assertion = expect(promise).rejects.toSatisfy(isTimeoutError);
        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
    });

    it('時間切れの例外は、そのまま画面に出せる日本語を持つ', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));

        const promise = fetchWithTimeout('https://example.test', {}, 1000);
        const assertion = expect(promise).rejects.toThrow(TIMEOUT_MESSAGE);
        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
    });

    // 応答が返った後もタイマーが残っていると、何度も送るうちに
    // 中断済みの通信を待つだけのタイマーが積み上がる
    it('応答が返ったらタイマーを片付ける', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', async () => new Response('ok'));

        await fetchWithTimeout('https://example.test', {}, 1000);

        expect(vi.getTimerCount()).toBe(0);
    });

    // 通信そのものの失敗（オフライン・DNS）は時間切れではない。
    // 呼び出し側が「時間切れ」と「繋がらない」を言い分けられるようにする
    it('通信が失敗した場合は、その例外をそのまま通す', async () => {
        const failure = new TypeError('Failed to fetch');
        vi.stubGlobal('fetch', async () => { throw failure; });

        await expect(fetchWithTimeout('https://example.test', {}, 1000)).rejects.toBe(failure);
    });
});
