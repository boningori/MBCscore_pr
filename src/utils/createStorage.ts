// localStorageへのJSON保存の共通実装
// 各ストレージモジュール（teamStorage等）はこれを内部で使い、公開関数のシグネチャは変えない

import { notifyStorageError } from './storageError';

export interface JsonStorage<T> {
    load(): T;
    /**
     * 保存できたら true。失敗したら false（通知イベントも飛ばす）。
     *
     * 戻り値を返すのは、呼び出し側が「保存できたか」で分岐できないと
     * 保存に失敗したのに元データを消す、という取り返しのつかない順序を
     * 書けてしまうため（試合終了時の履歴保存→セッション削除が実際にそうだった）。
     * 戻り値を無視する既存の呼び出しはそのままでよい。
     */
    save(value: T): boolean;
    clear(): void;
}

/**
 * @param isValid 読み込んだ値の形を検査する。JSONとして読めても中身が別物という
 *   ことは起きる（旧バージョンの形・他アプリとのキー衝突・手で編集したバックアップ）。
 *   そのまま通すと描画時にundefinedを触って落ちるため、読み込みの時点で捨てる。
 *   省略すると従来どおり素通しする。
 */
export function createJsonStorage<T>(
    key: string,
    fallback: T,
    errorContext?: string,
    isValid?: (value: unknown) => value is T,
): JsonStorage<T> {
    const context = errorContext ?? key;
    return {
        load(): T {
            try {
                const data = localStorage.getItem(key);
                if (!data) return structuredClone(fallback);
                const parsed: unknown = JSON.parse(data);
                if (isValid && !isValid(parsed)) {
                    console.warn(`Discarded malformed ${context} in localStorage`);
                    return structuredClone(fallback);
                }
                return parsed as T;
            } catch (error) {
                console.error(`Failed to load ${context}:`, error);
                return structuredClone(fallback);
            }
        },
        save(value: T): boolean {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                notifyStorageError(context, error);
                return false;
            }
        },
        clear(): void {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.error(`Failed to clear ${context}:`, error);
            }
        },
    };
}
