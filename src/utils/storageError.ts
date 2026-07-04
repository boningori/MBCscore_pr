// localStorage保存失敗をアプリ全体へ通知するためのイベント機構
// 保存関数のcatch節から呼び出し、App側でリッスンしてToast表示する

export const STORAGE_ERROR_EVENT = 'mbc-storage-error';

export function notifyStorageError(context: string, error: unknown): void {
    console.error(`Failed to save ${context}:`, error);
    try {
        window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { context } }));
    } catch {
        // イベント発火の失敗は無視（保存失敗自体はconsoleに残っている）
    }
}
