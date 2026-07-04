// ローカルエラーログ（外部送信なし）
// エラーを端末内のリングバッファに記録し、設定画面から閲覧・コピーできるようにする。
// プライバシー設計維持のため自動送信は行わない。

const ERROR_LOG_KEY = 'mbc_error_log';
const MAX_ENTRIES = 50;

export interface ErrorLogEntry {
    timestamp: string;
    source: string;   // 'react' | 'window' | 'promise' など発生箇所
    message: string;
    stack?: string;
}

export function getErrorLog(): ErrorLogEntry[] {
    try {
        const data = localStorage.getItem(ERROR_LOG_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? (parsed as ErrorLogEntry[]) : [];
    } catch {
        return [];
    }
}

export function logError(source: string, message: string, stack?: string): void {
    try {
        const entries = getErrorLog();
        entries.unshift({
            timestamp: new Date().toISOString(),
            source,
            message: String(message).slice(0, 500),
            stack: stack ? String(stack).split('\n').slice(0, 6).join('\n') : undefined,
        });
        localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {
        // エラーログの保存失敗は握りつぶす（通知するとループの恐れがあるため）
    }
}

export function clearErrorLog(): void {
    try {
        localStorage.removeItem(ERROR_LOG_KEY);
    } catch {
        // 無視
    }
}

// メール送付・クリップボード用のテキスト形式
export function formatErrorLog(): string {
    const entries = getErrorLog();
    const header = [
        `MBCscore エラーレポート (v${__APP_VERSION__})`,
        `作成日時: ${new Date().toISOString()}`,
        `UserAgent: ${navigator.userAgent}`,
        `件数: ${entries.length}`,
        '---',
    ].join('\n');
    const body = entries
        .map(e => `[${e.timestamp}] (${e.source}) ${e.message}${e.stack ? '\n' + e.stack : ''}`)
        .join('\n---\n');
    return `${header}\n${body}`;
}

// グローバルエラーハンドラを登録（main.tsxで1回だけ呼ぶ）
export function installGlobalErrorHandlers(): void {
    window.addEventListener('error', (event) => {
        logError('window', event.message, event.error instanceof Error ? event.error.stack : undefined);
    });
    window.addEventListener('unhandledrejection', (event) => {
        const reason: unknown = event.reason;
        if (reason instanceof Error) {
            logError('promise', reason.message, reason.stack);
        } else {
            logError('promise', String(reason));
        }
    });
}
