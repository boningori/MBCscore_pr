// localStorageへのJSON保存の共通実装
// 各ストレージモジュール（teamStorage等）はこれを内部で使い、公開関数のシグネチャは変えない

import { notifyStorageError } from './storageError';

export interface JsonStorage<T> {
    load(): T;
    save(value: T): void;
    clear(): void;
}

export function createJsonStorage<T>(key: string, fallback: T, errorContext?: string): JsonStorage<T> {
    const context = errorContext ?? key;
    return {
        load(): T {
            try {
                const data = localStorage.getItem(key);
                if (!data) return fallback;
                return JSON.parse(data) as T;
            } catch (error) {
                console.error(`Failed to load ${context}:`, error);
                return fallback;
            }
        },
        save(value: T): void {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                notifyStorageError(context, error);
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
