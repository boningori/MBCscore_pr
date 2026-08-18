// IndexedDBへのミラーバックアップ
// localStorageのアプリデータを世代管理付きでIndexedDBに複製し、
// ブラウザによるlocalStorage消去からの復元手段を提供する。
// IndexedDBが使えない環境（プライベートブラウズ等）では静かに無効化され、
// アプリ本体の動作には影響しない。

const DB_NAME = 'mbc-mirror-backup';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const MAX_GENERATIONS = 10;
const MIN_SNAPSHOT_INTERVAL_MS = 30_000;

// バックアップ対象のlocalStorageキーのプレフィックス
const APP_KEY_PREFIXES = ['minibasket-', 'mbc_'];

export interface MirrorSnapshot {
    timestamp: number;
    entries: Record<string, string>;
}

let lastSnapshotAt = 0;

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// アプリのlocalStorageデータを収集
export function collectAppData(): Record<string, string> {
    const entries: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && APP_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
            const value = localStorage.getItem(key);
            if (value !== null) entries[key] = value;
        }
    }
    return entries;
}

// アプリデータがlocalStorageに存在するか
export function hasAppData(): boolean {
    return Object.keys(collectAppData()).length > 0;
}

// スナップショットを保存し、古い世代を削除
export async function saveSnapshot(now: number = Date.now()): Promise<void> {
    try {
        const entries = collectAppData();
        // 空データで既存世代を潰さない
        if (Object.keys(entries).length === 0) return;

        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const snapshot: MirrorSnapshot = { timestamp: now, entries };
            store.put(snapshot);
            const keysReq = store.getAllKeys();
            keysReq.onsuccess = () => {
                const keys = (keysReq.result as number[]).sort((a, b) => b - a);
                keys.slice(MAX_GENERATIONS).forEach(key => store.delete(key));
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        lastSnapshotAt = now;
    } catch (error) {
        // IndexedDB不可の環境（プライベートブラウズ等）では機能を無効化。
        // 想定外のバグと区別できるようconsole.warnには残す（本番ビルドでもwarnは除去されない）
        console.warn('mirrorBackup: saveSnapshot failed:', error);
    }
}

// 最短間隔(30秒)を空けてスナップショット保存（連続保存のI/O負荷対策）
export async function maybeSnapshot(): Promise<void> {
    const now = Date.now();
    if (now - lastSnapshotAt < MIN_SNAPSHOT_INTERVAL_MS) return;
    await saveSnapshot(now);
}

// 全スナップショットを取得（新しい順）
export async function getAllSnapshots(): Promise<MirrorSnapshot[]> {
    try {
        const db = await openDb();
        const snapshots = await new Promise<MirrorSnapshot[]>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = () => {
                const all = req.result as MirrorSnapshot[];
                all.sort((a, b) => b.timestamp - a.timestamp);
                resolve(all);
            };
            req.onerror = () => reject(req.error);
        });
        db.close();
        return snapshots;
    } catch (error) {
        console.warn('mirrorBackup: getAllSnapshots failed:', error);
        return [];
    }
}

// 最新スナップショットを取得
export async function getLatestSnapshot(): Promise<MirrorSnapshot | null> {
    const all = await getAllSnapshots();
    return all[0] ?? null;
}

/**
 * スナップショットをlocalStorageへ書き戻す（すべて書けたら true）。
 *
 * 途中で失敗したら、書けた分を巻き戻してから false を返す。部分的に書けた
 * 状態を残すと、次回起動で hasAppData() が真になり復元プロンプト自体が
 * 二度と出ない（やり直せない）。
 *
 * このプロンプトが出るのは「データが消えた」場面で、端末の容量が逼迫して
 * いることは十分あり得る。呼び出し側は戻り値を見て、失敗を利用者に伝えること。
 */
export function restoreSnapshot(snapshot: MirrorSnapshot): boolean {
    const entries = Object.entries(snapshot.entries);
    const previous = entries.map(([key]) => [key, localStorage.getItem(key)] as const);
    const applied: string[] = [];

    try {
        for (const [key, value] of entries) {
            localStorage.setItem(key, value);
            applied.push(key);
        }
        return true;
    } catch (error) {
        console.error('mirrorBackup: restoreSnapshot failed, rolling back:', error);
        for (const key of applied) {
            try {
                localStorage.removeItem(key);
            } catch {
                // 削除にすら失敗する状況では打つ手がない。下の書き戻しに任せる
            }
        }
        for (const [key, value] of previous) {
            if (value === null || !applied.includes(key)) continue;
            try {
                localStorage.setItem(key, value);
            } catch (restoreError) {
                console.error(`mirrorBackup: failed to restore ${key}:`, restoreError);
            }
        }
        return false;
    }
}

// 永続ストレージを要求（ブラウザ都合のデータ自動削除を抑止）
export async function requestPersistentStorage(): Promise<boolean> {
    try {
        if (navigator.storage && navigator.storage.persist) {
            return await navigator.storage.persist();
        }
    } catch {
        // 未対応ブラウザは無視
    }
    return false;
}
