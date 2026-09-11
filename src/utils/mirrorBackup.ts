// IndexedDBへのミラーバックアップ
// localStorageのアプリデータを世代管理付きでIndexedDBに複製し、
// ブラウザによるlocalStorage消去からの復元手段を提供する。
// IndexedDBが使えない環境（プライベートブラウズ等）では静かに無効化され、
// アプリ本体の動作には影響しない。

import {
    hasStartupSnapshotToday,
    selectExpiredSnapshots,
} from './mirrorBackupRetention';
import type { SnapshotMeta, SnapshotReason } from './mirrorBackupRetention';

export type { SnapshotMeta, SnapshotReason } from './mirrorBackupRetention';

const DB_NAME = 'mbc-mirror-backup';
// v2 で reason のインデックスを足した。一覧が entries を読まずに
// 日時と理由を引くために要る
const DB_VERSION = 2;
const STORE_NAME = 'snapshots';
const REASON_INDEX = 'reason';
const MIN_SNAPSHOT_INTERVAL_MS = 30_000;

/** reason ごとに主キーを引くための一覧。値が増えたらここにも足す */
const REASONS: readonly SnapshotReason[] = ['periodic', 'gameEnd', 'startup', 'beforeRestore'];

// バックアップ対象のlocalStorageキーのプレフィックス。
// storageUsage.ts の同名定数と必ず揃えること。片方にしか無いプレフィックスが
// あると「使用量には数えるのに、端末内バックアップからは漏れる」キーが生まれる
// （'mbc-' が実際にそうなっていた）。
const APP_KEY_PREFIXES = ['minibasket-', 'mbc_', 'mbc-'];

export interface MirrorSnapshot extends SnapshotMeta {
    entries: Record<string, string>;
}

let lastSnapshotAt = 0;

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            const store = db.objectStoreNames.contains(STORE_NAME)
                ? request.transaction!.objectStore(STORE_NAME)
                : db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
            // reason ごとの主キーを、レコード本体を読まずに引くためのインデックス。
            // v1 が書いた世代は reason を持たず、IndexedDB は値が undefined の
            // レコードをインデックスに載せない。それがそのまま「旧世代」の判別になる
            if (!store.indexNames.contains(REASON_INDEX)) {
                store.createIndex(REASON_INDEX, REASON_INDEX);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** IDBRequest を Promise にする小道具 */
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 主キーと reason だけを読む（entries は読まない）。
 *
 * リクエストは全部同じタスクで出してから await する。await を挟んでから
 * 次のリクエストを出すと、トランザクションが先に閉じて InvalidStateError になる。
 */
async function readMetas(db: IDBDatabase): Promise<SnapshotMeta[]> {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index(REASON_INDEX);

    const allKeysRequest = store.getAllKeys();
    const byReasonRequests = REASONS.map(reason => [reason, index.getAllKeys(reason)] as const);

    const allKeys = (await requestResult(allKeysRequest)) as number[];
    const byReason = new Map<number, SnapshotReason>();
    for (const [reason, request] of byReasonRequests) {
        for (const key of (await requestResult(request)) as number[]) {
            byReason.set(key, reason);
        }
    }

    return allKeys.map(timestamp => ({ timestamp, reason: byReason.get(timestamp) }));
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

/**
 * スナップショットを保存し、枠を超えた世代を削除する。
 *
 * 戻り値を返すのは、呼び出し側が「書けたか」で分岐できないと、退避が
 * 取れていないのに書き戻しへ進む、という取り返しのつかない順序を書けて
 * しまうため（MirrorBackupList の handleRestore が実際にそうだった。
 * beforeRestore の退避に失敗しても Promise<void> は例外なく解決するので、
 * IndexedDB が書けない＝端末の空き容量が乏しい、まさにその状況で
 * restoreSnapshot が現在のデータを無言で上書きしていた）。createStorage.save
 * と同じ理由・同じ形。
 *
 * reason で枠が分かれる（mirrorBackupRetention）。試合中の定期スナップショットが
 * 「試合を保存した直後」「日々の起動時」を押し出さないための区別である。
 *
 * @param now テストのための引数。省略すると現在時刻
 */
export async function saveSnapshot(reason: SnapshotReason, now: number = Date.now()): Promise<boolean> {
    try {
        const entries = collectAppData();
        // 空データで既存世代を潰さない。何も書かなかっただけで失敗ではないので true。
        // ここを false にすると、呼び出し側は「書き込みに失敗した」と「データが
        // 元々無かったので何もしていない」を区別できなくなる
        if (Object.keys(entries).length === 0) return true;

        const db = await openDb();
        const metas = await readMetas(db);

        // 起動世代は1日1つまで。1日に何度も開く人の起動世代で保護枠が埋まると、
        // 古い区切りが押し出される。これも意図どおりのスキップであって失敗では
        // ないので true（理由は上と同じ）
        if (reason === 'startup' && hasStartupSnapshotToday(metas, now)) {
            db.close();
            return true;
        }

        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const snapshot: MirrorSnapshot = { timestamp: now, entries, reason };
            store.put(snapshot);
            for (const expired of selectExpiredSnapshots([...metas, { timestamp: now, reason }])) {
                store.delete(expired);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        lastSnapshotAt = now;
        return true;
    } catch (error) {
        // IndexedDB不可の環境（プライベートブラウズ等）では機能を無効化。
        // 想定外のバグと区別できるようconsole.warnには残す（本番ビルドでもwarnは除去されない）
        console.warn('mirrorBackup: saveSnapshot failed:', error);
        return false;
    }
}

// 最短間隔(30秒)を空けてスナップショット保存（連続保存のI/O負荷対策）。
// 試合中の自動保存から呼ばれるので、必ず定期枠に入れる。
// 呼び出し側（useGameAutoSave）は成否を見ないので、戻り値は返さずvoidのままにする
export async function maybeSnapshot(): Promise<void> {
    const now = Date.now();
    if (now - lastSnapshotAt < MIN_SNAPSHOT_INTERVAL_MS) return;
    await saveSnapshot('periodic', now);
}

/**
 * 世代の一覧を新しい順に返す（entries は読まない）。
 *
 * 旧実装は store.getAll() で全世代の entries をメモリへ載せていた。一覧が使うのは
 * 日時と理由だけで、履歴が 3MB ある利用者なら 10世代で 30MB を読むことになる。
 */
export async function getSnapshotMetas(): Promise<SnapshotMeta[]> {
    try {
        const db = await openDb();
        const metas = await readMetas(db);
        db.close();
        return metas.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
        console.warn('mirrorBackup: getSnapshotMetas failed:', error);
        return [];
    }
}

/** 1件だけ読む（復元するときに使う） */
export async function getSnapshot(timestamp: number): Promise<MirrorSnapshot | null> {
    try {
        const db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const snapshot = await requestResult(tx.objectStore(STORE_NAME).get(timestamp));
        db.close();
        return (snapshot as MirrorSnapshot | undefined) ?? null;
    } catch (error) {
        console.warn('mirrorBackup: getSnapshot failed:', error);
        return null;
    }
}

// 最新スナップショットを取得（RestorePrompt が項目数を出し restoreSnapshot へ渡すので、
// ここは entries を含む完全な世代を返す）
export async function getLatestSnapshot(): Promise<MirrorSnapshot | null> {
    const metas = await getSnapshotMetas();
    const newest = metas[0];
    return newest ? await getSnapshot(newest.timestamp) : null;
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
