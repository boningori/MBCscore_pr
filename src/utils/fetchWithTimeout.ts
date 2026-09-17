// 時間で打ち切る fetch。
//
// 体育館のWi-Fiは「繋がっているのに外へ出られない」ことがある（キャプティブ
// ポータル・上流の断）。その状態の fetch は解決も棄却もしないまま数分居座る。
// このアプリで外へ出る通信は写真読込（AI）・音声メモの文字起こし・接続テスト・
// OCRアセットの先読みの4つで、前3つは画面が「読み込み中」で固まり、しかも
// 中断する手段が無い。記録の最中にそれをやられると手が止まるので、時間で切る。
//
// AbortSignal.timeout ではなく AbortController を自前で持つのは、
// 片付け（clearTimeout）と「時間切れだったのか通信の失敗だったのか」の
// 言い分けを、呼び出し側から見える形にしておくため。

/** 時間切れのときに画面へ出す文言。呼び出し側ごとに書き分けない */
export const TIMEOUT_MESSAGE = '通信がタイムアウトしました（ネットワーク環境をご確認ください）';

/** 時間切れで打ち切ったことを表す例外 */
export class RequestTimeoutError extends Error {
    constructor() {
        super(TIMEOUT_MESSAGE);
        this.name = 'RequestTimeoutError';
    }
}

/** 時間切れの例外か（catch 節で「繋がらない」と言い分けるため） */
export function isTimeoutError(error: unknown): boolean {
    return error instanceof RequestTimeoutError;
}

/**
 * timeoutMs を過ぎたら中断する fetch。
 *
 * 中断は AbortError として fetch から返るが、呼び出し側には
 * RequestTimeoutError として渡す。利用者が自分で中断する経路はまだ無いので、
 * AbortError は「時間切れ」以外にありえない。
 */
export async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (timedOut) throw new RequestTimeoutError();
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
