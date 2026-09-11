# ミラーバックアップの世代保持を作り直す 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スナップショットに `reason` を持たせ、定期（回転3）と区切り（保護12）の2枠に分けることで、試合中の自動保存が「試合を保存した直後」「日々の起動時」の世代を押し出さないようにする。

**Architecture:** 保持の判断は IndexedDB を触らない純関数（新規 `mirrorBackupRetention.ts`）へ出す。`mirrorBackup.ts` は IndexedDB の配管に専念し、一覧は `reason` インデックスの主キーだけを読んで `entries` を一切載せない。

**Tech Stack:** TypeScript / IndexedDB（`DB_VERSION` 1→2）/ Vitest + fake-indexeddb / React（設定画面の一覧）

## Global Constraints

- **保持数:** 定期 `MAX_PERIODIC = 3`、区切り `MAX_MILESTONES = 12`（最大15世代）
- **`reason` の値:** `'periodic' | 'gameEnd' | 'startup' | 'beforeRestore'` の4つだけ
- **`reason` 未設定（v1 が書いた世代）は `periodic` として扱う。** 値を書き直す移行はしない
- **暦日の判定は現地時刻。** `localDate.ts` の `formatInputDate` を使う（UTC で切ると朝9時前が前日になる）
- **一覧は `entries` を読まない。** `store.getAll()` を使わないこと
- IndexedDB が使えない環境では静かに無効化する既存の作りを保つ（例外を握って `console.warn`、アプリ本体は無影響）
- `MirrorBackupList` の「書き戻しに失敗したら、リロードせずに失敗を伝える」（v1.10 で追加）は**挙動を変えずに通し続けること**
- 日本語のコメント・テスト名。ファイル冒頭に「なぜこれが要るか」を書く

---

### Task 1: 保持則の純関数

**Files:**
- Create: `src/utils/mirrorBackupRetention.ts`
- Test: `src/utils/mirrorBackupRetention.test.ts`

**Interfaces:**
- Consumes: `src/utils/localDate.ts` の `formatInputDate(date: Date): string`（現地時刻の `YYYY-MM-DD`）
- Produces（後続タスクが使う）:
  - `export type SnapshotReason = 'periodic' | 'gameEnd' | 'startup' | 'beforeRestore'`
  - `export interface SnapshotMeta { timestamp: number; reason?: SnapshotReason }`
  - `export const MAX_PERIODIC = 3`
  - `export const MAX_MILESTONES = 12`
  - `export function isMilestone(reason?: SnapshotReason): boolean`
  - `export function selectExpiredSnapshots(metas: SnapshotMeta[]): number[]`
  - `export function hasStartupSnapshotToday(metas: SnapshotMeta[], now: number): boolean`

これは新規コードなので通常の TDD（RED → GREEN）が成立する。テストを先に書き、落ちることを確かめてから実装すること。

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/mirrorBackupRetention.test.ts`:

```ts
// スナップショットの保持則。
//
// 旧実装は「新しい順に10世代」だけで、しかも判断が saveSnapshot の
// IndexedDB トランザクションに埋まっていた。試合中の自動保存は最短30秒間隔で
// 走るので、1試合録るだけで全世代がその試合の最後の5分で埋まり、
// 「誤って削除した」「不正なデータを取り込んで上書きした」——気づくのが
// 数時間〜数日後になる場面——をまったく救えなかった。
//
// 枠を2つに分けるのが新しい規則の要点。ここでは IndexedDB を使わずに
// 「どの世代を残すか」だけを検査する。

import { describe, it, expect } from 'vitest';
import {
    MAX_MILESTONES,
    MAX_PERIODIC,
    hasStartupSnapshotToday,
    isMilestone,
    selectExpiredSnapshots,
} from './mirrorBackupRetention';
import type { SnapshotMeta, SnapshotReason } from './mirrorBackupRetention';

const meta = (timestamp: number, reason?: SnapshotReason): SnapshotMeta => ({ timestamp, reason });

/** 現地時刻の日付・時刻から timestamp を作る（暦日の判定は現地時刻で行うため） */
const at = (y: number, m: number, d: number, h: number, min = 0): number =>
    new Date(y, m - 1, d, h, min).getTime();

describe('isMilestone', () => {
    it('gameEnd / startup / beforeRestore は区切り', () => {
        expect(isMilestone('gameEnd')).toBe(true);
        expect(isMilestone('startup')).toBe(true);
        expect(isMilestone('beforeRestore')).toBe(true);
    });

    it('periodic は定期', () => {
        expect(isMilestone('periodic')).toBe(false);
    });

    // v1 が書いた世代は reason を持たない。旧世代は試合中の自動保存が
    // ほとんどなので、保護せず定期として回す
    it('未設定（旧世代）は定期として扱う', () => {
        expect(isMilestone(undefined)).toBe(false);
    });
});

describe('selectExpiredSnapshots', () => {
    it('世代が枠に収まっていれば何も消さない', () => {
        const metas = [meta(3, 'periodic'), meta(2, 'gameEnd'), meta(1, 'startup')];
        expect(selectExpiredSnapshots(metas)).toEqual([]);
    });

    it('定期が枠を超えたら、古い定期だけが落ちる', () => {
        const metas = [1, 2, 3, 4, 5].map(t => meta(t * 1000, 'periodic'));
        expect(selectExpiredSnapshots(metas).sort()).toEqual([1000, 2000]);
    });

    // この設計の主眼。試合中の自動保存が区切りを押し出さないこと
    it('定期をいくら積んでも、区切りは落ちない', () => {
        const milestone = meta(1, 'gameEnd');
        const periodics = Array.from({ length: 20 }, (_, i) => meta((i + 2) * 1000, 'periodic'));
        const expired = selectExpiredSnapshots([milestone, ...periodics]);
        expect(expired).not.toContain(1);
        expect(expired).toHaveLength(20 - MAX_PERIODIC);
    });

    it('区切りが枠を超えたら、古い区切りが落ちる', () => {
        const metas = Array.from({ length: MAX_MILESTONES + 2 }, (_, i) => meta((i + 1) * 1000, 'gameEnd'));
        expect(selectExpiredSnapshots(metas).sort((a, b) => a - b)).toEqual([1000, 2000]);
    });

    it('区切りをいくら積んでも、直近の定期は落ちない', () => {
        const periodic = meta(999_000, 'periodic');
        const milestones = Array.from({ length: MAX_MILESTONES + 5 }, (_, i) => meta((i + 1) * 1000, 'startup'));
        expect(selectExpiredSnapshots([periodic, ...milestones])).not.toContain(999_000);
    });

    it('未設定の旧世代は定期の枠で数える', () => {
        const metas = [1, 2, 3, 4, 5].map(t => meta(t * 1000));
        expect(selectExpiredSnapshots(metas).sort()).toEqual([1000, 2000]);
    });

    it('渡した配列の順序に関係なく、新しいものから残す', () => {
        const metas = [meta(2000, 'periodic'), meta(5000, 'periodic'), meta(1000, 'periodic'), meta(4000, 'periodic')];
        expect(selectExpiredSnapshots(metas)).toEqual([1000]);
    });

    it('入力を書き換えない', () => {
        const metas = [meta(1000, 'periodic'), meta(3000, 'periodic'), meta(2000, 'periodic')];
        selectExpiredSnapshots(metas);
        expect(metas.map(m => m.timestamp)).toEqual([1000, 3000, 2000]);
    });

    it('世代が無ければ何も消さない', () => {
        expect(selectExpiredSnapshots([])).toEqual([]);
    });
});

describe('hasStartupSnapshotToday', () => {
    it('同じ暦日の startup があれば真', () => {
        const metas = [meta(at(2026, 9, 11, 8), 'startup')];
        expect(hasStartupSnapshotToday(metas, at(2026, 9, 11, 20))).toBe(true);
    });

    it('前日の startup しか無ければ偽', () => {
        const metas = [meta(at(2026, 9, 10, 23), 'startup')];
        expect(hasStartupSnapshotToday(metas, at(2026, 9, 11, 1))).toBe(false);
    });

    it('同じ日でも startup 以外は数えない', () => {
        const metas = [meta(at(2026, 9, 11, 8), 'gameEnd'), meta(at(2026, 9, 11, 9), 'periodic')];
        expect(hasStartupSnapshotToday(metas, at(2026, 9, 11, 20))).toBe(false);
    });

    it('世代が無ければ偽', () => {
        expect(hasStartupSnapshotToday([], at(2026, 9, 11, 9))).toBe(false);
    });

    // 暦日は現地時刻で切る。UTC で切ると日本では朝9時前が前日になり、
    // 9時開始・8時台受付のミニバスでは日常的に起きる（localDate.ts の既出の理由）
    it('現地時刻の朝8時は、同じ日の朝9時と同じ暦日として扱う', () => {
        const metas = [meta(at(2026, 9, 11, 8, 30), 'startup')];
        expect(hasStartupSnapshotToday(metas, at(2026, 9, 11, 9, 0))).toBe(true);
    });
});

describe('保持数', () => {
    // 数を変えるときはここが落ちる。設計上の判断（定期は最新1件しか使わない／
    // 区切りは週2試合＋週3日起動で約2.4週間分）を明示的に固定する
    it('定期3・区切り12', () => {
        expect(MAX_PERIODIC).toBe(3);
        expect(MAX_MILESTONES).toBe(12);
    });
});
```

- [ ] **Step 2: テストを走らせ、落ちることを確かめる**

Run:
```bash
npx vitest run src/utils/mirrorBackupRetention.test.ts
```
Expected: FAIL — `Failed to resolve import "./mirrorBackupRetention"`（ファイルがまだ無い）

- [ ] **Step 3: 実装を書く**

`src/utils/mirrorBackupRetention.ts`:

```ts
// スナップショットの保持則。IndexedDB は触らない。
//
// 旧実装は「新しい順に10世代」だけで、判断が saveSnapshot の IndexedDB
// トランザクションに埋まっていた。試合中の自動保存は最短30秒間隔で走るため、
// 1試合録るだけで全世代がその試合の最後の5分で埋まり、それ以前は全部
// 押し出されていた。MirrorBackupList が自分で「誤って削除した・不正なデータを
// 取り込んで上書きした場合を救う」と書いているのに、それらは気づくのが
// 数時間〜数日後で、まったく噛み合っていなかった。
//
// 枠を2つに分けるのが要点。試合中の定期スナップショットは回転枠の中だけで
// 入れ替わり、区切り（試合を保存した直後・日々の起動・復元の直前）を
// 押し出さない。判断をここに出したので、IndexedDB 抜きで直接検査できる。

import { formatInputDate } from './localDate';

export type SnapshotReason = 'periodic' | 'gameEnd' | 'startup' | 'beforeRestore';

/** 一覧と保持の判断に要る情報。entries を読まずに得られるものだけ */
export interface SnapshotMeta {
    timestamp: number;
    /** v1 が書いた世代は持たない（未設定＝periodic 扱い） */
    reason?: SnapshotReason;
}

/**
 * 定期（回転）の保持数。
 * 試合中の消失で実際に使うのは最新1件（RestorePrompt は getLatestSnapshot を見る）。
 * 残り2件は保険で、それ以上は枠を食うだけになる。
 */
export const MAX_PERIODIC = 3;

/**
 * 区切り（保護）の保持数。
 * 週2試合＋週3日起動で約2.4週間分にあたる。
 */
export const MAX_MILESTONES = 12;

/**
 * 区切りの世代か。
 *
 * 未設定（v1 が書いた世代）は定期として扱う。旧世代は試合中の自動保存が
 * ほとんどで、保護する意味が薄いため。
 */
export function isMilestone(reason?: SnapshotReason): boolean {
    return reason !== undefined && reason !== 'periodic';
}

/**
 * 消すべき世代の timestamp を返す。
 *
 * 定期と区切りを別々に数え、それぞれ新しいほうから枠のぶんだけ残す。
 * 渡された配列は書き換えない。
 */
export function selectExpiredSnapshots(metas: SnapshotMeta[]): number[] {
    const newestFirst = [...metas].sort((a, b) => b.timestamp - a.timestamp);

    let periodicKept = 0;
    let milestoneKept = 0;
    const expired: number[] = [];

    for (const meta of newestFirst) {
        if (isMilestone(meta.reason)) {
            if (milestoneKept < MAX_MILESTONES) milestoneKept++;
            else expired.push(meta.timestamp);
        } else {
            if (periodicKept < MAX_PERIODIC) periodicKept++;
            else expired.push(meta.timestamp);
        }
    }

    return expired;
}

/**
 * 同じ暦日の startup が既にあるか。
 *
 * アプリを1日に5回開く人の起動世代で保護枠が埋まると、古い区切りが
 * 押し出される。起動世代は1日1つに絞る。
 *
 * 暦日は現地時刻で見る。UTC で切ると日本では朝9時前が前日になり、
 * 9時開始・8時台受付のミニバスでは日常的に起きる（localDate.ts 参照）。
 */
export function hasStartupSnapshotToday(metas: SnapshotMeta[], now: number): boolean {
    const today = formatInputDate(new Date(now));
    return metas.some(
        meta => meta.reason === 'startup' && formatInputDate(new Date(meta.timestamp)) === today,
    );
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run:
```bash
npx vitest run src/utils/mirrorBackupRetention.test.ts
```
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add src/utils/mirrorBackupRetention.ts src/utils/mirrorBackupRetention.test.ts
git commit -m "feat(mirror): 世代の保持則を、定期と区切りの2枠に分ける純関数として切り出す"
```

---

### Task 2: `mirrorBackup.ts` を新しい保持則に載せ替える

**Files:**
- Modify: `src/utils/mirrorBackup.ts`
- Modify: `src/utils/mirrorBackup.test.ts`

**Interfaces:**
- Consumes: Task 1 の `SnapshotReason` / `SnapshotMeta` / `MAX_PERIODIC` / `MAX_MILESTONES` / `selectExpiredSnapshots` / `hasStartupSnapshotToday`
- Produces（後続タスクが使う）:
  - `export type { SnapshotReason, SnapshotMeta }`（再エクスポート）
  - `export interface MirrorSnapshot extends SnapshotMeta { entries: Record<string, string> }`
  - `export async function saveSnapshot(reason: SnapshotReason, now?: number): Promise<void>`（**第1引数が `reason` に変わる**）
  - `export async function getSnapshotMetas(): Promise<SnapshotMeta[]>`（新しい順）
  - `export async function getSnapshot(timestamp: number): Promise<MirrorSnapshot | null>`
  - `getLatestSnapshot()` / `maybeSnapshot()` / `restoreSnapshot()` / `collectAppData()` / `hasAppData()` / `requestPersistentStorage()` はシグネチャ据え置き
  - `getAllSnapshots()` は**削除**

**IndexedDB の注意（実装者向け）:** トランザクションは、保留中のリクエストが無い状態でマイクロタスクキューが空になると自動で閉じる。`await` を挟んでから次のリクエストを出すと `InvalidStateError` になる。**リクエストは全部同じタスクで出してから `await` すること**（下の `readMetas` がその形になっている）。

- [ ] **Step 1: 型・スキーマ・保存を書き換える**

`src/utils/mirrorBackup.ts` の冒頭の定数とインタフェースを差し替える。

差し替え前:
```ts
const DB_NAME = 'mbc-mirror-backup';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const MAX_GENERATIONS = 10;
const MIN_SNAPSHOT_INTERVAL_MS = 30_000;
```

差し替え後:
```ts
const DB_NAME = 'mbc-mirror-backup';
// v2 で reason のインデックスを足した。一覧が entries を読まずに
// 日時と理由を引くために要る
const DB_VERSION = 2;
const STORE_NAME = 'snapshots';
const REASON_INDEX = 'reason';
const MIN_SNAPSHOT_INTERVAL_MS = 30_000;

/** reason ごとに主キーを引くための一覧。値が増えたらここにも足す */
const REASONS: readonly SnapshotReason[] = ['periodic', 'gameEnd', 'startup', 'beforeRestore'];
```

import を足す（既存の import の下）:
```ts
import {
    hasStartupSnapshotToday,
    selectExpiredSnapshots,
} from './mirrorBackupRetention';
import type { SnapshotMeta, SnapshotReason } from './mirrorBackupRetention';

export type { SnapshotMeta, SnapshotReason } from './mirrorBackupRetention';
```

`MirrorSnapshot` を差し替える。

差し替え前:
```ts
export interface MirrorSnapshot {
    timestamp: number;
    entries: Record<string, string>;
}
```

差し替え後:
```ts
export interface MirrorSnapshot extends SnapshotMeta {
    entries: Record<string, string>;
}
```

`openDb` を差し替える。

差し替え後:
```ts
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
```

`saveSnapshot` を差し替える。

差し替え後:
```ts
/**
 * スナップショットを保存し、枠を超えた世代を削除する。
 *
 * reason で枠が分かれる（mirrorBackupRetention）。試合中の定期スナップショットが
 * 「試合を保存した直後」「日々の起動時」を押し出さないための区別である。
 *
 * @param now テストのための引数。省略すると現在時刻
 */
export async function saveSnapshot(reason: SnapshotReason, now: number = Date.now()): Promise<void> {
    try {
        const entries = collectAppData();
        // 空データで既存世代を潰さない
        if (Object.keys(entries).length === 0) return;

        const db = await openDb();
        const metas = await readMetas(db);

        // 起動世代は1日1つまで。1日に何度も開く人の起動世代で保護枠が埋まると、
        // 古い区切りが押し出される
        if (reason === 'startup' && hasStartupSnapshotToday(metas, now)) {
            db.close();
            return;
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
    } catch (error) {
        // IndexedDB不可の環境（プライベートブラウズ等）では機能を無効化。
        // 想定外のバグと区別できるようconsole.warnには残す（本番ビルドでもwarnは除去されない）
        console.warn('mirrorBackup: saveSnapshot failed:', error);
    }
}
```

`maybeSnapshot` を差し替える。

差し替え後:
```ts
// 最短間隔(30秒)を空けてスナップショット保存（連続保存のI/O負荷対策）。
// 試合中の自動保存から呼ばれるので、必ず定期枠に入れる
export async function maybeSnapshot(): Promise<void> {
    const now = Date.now();
    if (now - lastSnapshotAt < MIN_SNAPSHOT_INTERVAL_MS) return;
    await saveSnapshot('periodic', now);
}
```

- [ ] **Step 2: 読み出しを差し替える**

`getAllSnapshots` と `getLatestSnapshot` を、次の3つに置き換える（`getAllSnapshots` は削除）。

```ts
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
```

- [ ] **Step 3: 既存テストを新しい約束へ直す**

`src/utils/mirrorBackup.test.ts` で、`saveSnapshot` の呼び出しを新シグネチャへ直す。

- `await m.saveSnapshot(1000)` → `await m.saveSnapshot('periodic', 1000)`（同様に 2000 も）
- 「10世代を超えた古いスナップショットは削除される」のテスト全体を、次へ差し替える:

```ts
    it('定期スナップショットは枠(3)を超えると古いものから消える', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        for (let i = 1; i <= 6; i++) {
            await m.saveSnapshot('periodic', i * 1000);
        }

        const metas = await m.getSnapshotMetas();
        expect(metas.map(s => s.timestamp)).toEqual([6000, 5000, 4000]);
    });

    // この作り替えの主眼。試合中の自動保存が「試合を保存した直後」を押し出さない
    it('試合中の定期スナップショットを積んでも、区切りの世代は残る', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        await m.saveSnapshot('gameEnd', 1000);
        for (let i = 2; i <= 21; i++) {
            await m.saveSnapshot('periodic', i * 1000);
        }

        const metas = await m.getSnapshotMetas();
        expect(metas.some(s => s.timestamp === 1000 && s.reason === 'gameEnd')).toBe(true);
    });

    it('起動世代は同じ暦日に1つしか作らない', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        const morning = new Date(2026, 8, 11, 8, 30).getTime();
        const evening = new Date(2026, 8, 11, 20, 0).getTime();
        await m.saveSnapshot('startup', morning);
        await m.saveSnapshot('startup', evening);

        const metas = await m.getSnapshotMetas();
        expect(metas.filter(s => s.reason === 'startup')).toHaveLength(1);
    });

    it('翌日の起動世代は作る', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        await m.saveSnapshot('startup', new Date(2026, 8, 11, 9).getTime());
        await m.saveSnapshot('startup', new Date(2026, 8, 12, 9).getTime());

        const metas = await m.getSnapshotMetas();
        expect(metas.filter(s => s.reason === 'startup')).toHaveLength(2);
    });

    // v1 が書いた世代は reason を持たない。読めること、定期として数えられることを見る
    it('reason を持たない旧世代も読めて、定期の枠で数える', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');

        // まず本体にDBを作らせる（スキーマ生成をテスト側で書き写さないため。
        // 書き写すと、本物の openDb を変えてもここが古いまま通ってしまう）
        await m.saveSnapshot('periodic', 1000);

        // その上に、reason を持たない旧スキーマの世代を1件流し込む
        await new Promise<void>((resolve, reject) => {
            const open = indexedDB.open('mbc-mirror-backup');
            open.onsuccess = () => {
                const db = open.result;
                const tx = db.transaction('snapshots', 'readwrite');
                tx.objectStore('snapshots').put({ timestamp: 500, entries: { 'minibasket-my-teams': '["old"]' } });
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => reject(tx.error);
            };
            open.onerror = () => reject(open.error);
        });

        const metas = await m.getSnapshotMetas();
        expect(metas.find(s => s.timestamp === 500)?.reason).toBeUndefined();

        const old = await m.getSnapshot(500);
        expect(old?.entries['minibasket-my-teams']).toBe('["old"]');
    });
```

- 「空のlocalStorageではスナップショットを作らない」と「maybeSnapshot: 30秒以内の…」のテストは、`saveSnapshot` の呼び出しを新シグネチャへ直すだけ（`'periodic'` を渡す）
- `restoreSnapshot` のテストは引数が `MirrorSnapshot` のリテラルなので、そのままで型が通る（`reason` は任意）
- `mirrorBackup.restore.test.ts` と `mirrorBackup.prefix.test.ts` は `saveSnapshot` / `getAllSnapshots` / `getLatestSnapshot` のいずれも呼んでいない（確認済み）。**触らないこと**

さらに、読み出しが中身を載せないことを固定するテストを足す。これがこの作り替えの約束そのもので、うっかり `getAll()` へ戻しても誰も気づけない:

```ts
    it('一覧の読み出しは、世代の中身を載せない（getAll を使わない）', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        await m.saveSnapshot('periodic', 1000);

        // fake-indexeddb の IDBObjectStore は global にある。
        // getAll はレコード本体を返すので、一覧の経路で呼ばれてはいけない
        const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll');
        try {
            const metas = await m.getSnapshotMetas();
            expect(metas).toHaveLength(1);
            expect(getAll).not.toHaveBeenCalled();
        } finally {
            getAll.mockRestore();
        }
    });
```

- [ ] **Step 4: テストを走らせる**

Run:
```bash
npx vitest run src/utils/mirrorBackup
```
Expected: PASS（`mirrorBackup.test.ts` / `.restore.test.ts` / `.prefix.test.ts` / `mirrorBackupRetention.test.ts`）

`.restore.test.ts` と `.prefix.test.ts` が `saveSnapshot` を呼んでいれば、そこも新シグネチャへ直すこと。

- [ ] **Step 5: 型検査を通す**

Run:
```bash
npx tsc -b && npm run typecheck:test
```
Expected: どちらも無出力

この時点では `src/App.tsx` と `src/components/Settings/MirrorBackupList.tsx` がまだ旧シグネチャ・旧APIを使っているため**型エラーが出る**。出たエラーは Task 3 / Task 4 で直す対象なので、**エラーの一覧を控えてから次へ進むこと**。ここで App や MirrorBackupList を直してはいけない（タスクの境界を越える）。

- [ ] **Step 6: コミット**

```bash
git add src/utils/mirrorBackup.ts src/utils/mirrorBackup.test.ts
git commit -m "feat(mirror): 世代に reason を持たせ、一覧が entries を読まないようにする"
```

---

### Task 3: 呼び出し元に `reason` を渡し、`gameEnd` を保存直後で取る

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.mirrorSnapshotReason.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 2 の `saveSnapshot(reason, now?)`
- Produces: なし

**背景（実装者向け）:** いまの「試合終了時」スナップショット（`phase === 'finished'` の effect）が写すのは**まだ履歴に保存していない状態**。「試合単位で戻る」が欲しいのは*履歴に入った直後*なので、そこに `gameEnd` を足す。既存の effect は `periodic`（進行中データの保護）に位置づけ直す。

`useGameAutoSave` は `maybeSnapshot()` を呼ぶだけで、`reason` は `maybeSnapshot` の中で `'periodic'` が入る。**`useGameAutoSave.ts` は変更しない。**

- [ ] **Step 1: 失敗するテストを書く**

`src/App.mirrorSnapshotReason.test.tsx`:

```tsx
// ミラーバックアップの世代に、正しい「理由」が付くこと。
//
// 区切り（保護枠）と定期（回転枠）の振り分けは reason で決まる
// （mirrorBackupRetention）。呼び出し元が渡す値を間違えると、保護すべき世代が
// 試合中の自動保存に押し出される——しかも黙って。ここで固定する。
//
// とくに gameEnd は「履歴に保存できた直後」でなければならない。
// phase === 'finished' の時点ではまだ保存しておらず、その状態を写しても
// 「試合単位で戻る」には使えない。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const saveSnapshot = vi.hoisted(() => vi.fn());
vi.mock('./utils/mirrorBackup', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./utils/mirrorBackup')>()),
    saveSnapshot,
    // 復元プロンプトを出さないため、常に「世代なし」にする
    getLatestSnapshot: vi.fn(async () => null),
}));

import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

/** 第4Q進行中・0-0 のセッションを仕込む */
function seedPlayingQ4() {
    const game = createInitialGame();
    game.phase = 'playing';
    game.currentQuarter = 4;
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '決勝戦', date: '2026-09-11', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    saveSnapshot.mockReset();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 1 }));
    window.history.replaceState(null, '');
});

afterEach(cleanup);

/** saveSnapshot が呼ばれた reason の一覧 */
const reasons = () => saveSnapshot.mock.calls.map(call => call[0] as string);

describe('起動時の世代', () => {
    it('起動時は startup として取る', async () => {
        render(<App />);
        await waitFor(() => expect(reasons()).toContain('startup'));
    });
});

describe('試合終了まわりの世代', () => {
    it('試合終了の画面が出た時点では periodic（まだ履歴に保存していない）', async () => {
        seedPlayingQ4();
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        fireEvent.click(await screen.findByText(/第4Q終了|Q4終了/));
        fireEvent.click(await screen.findByText('試合を終了する'));

        await screen.findByText('保存して終了');
        expect(reasons()).toContain('periodic');
        expect(reasons()).not.toContain('gameEnd');
    });

    it('履歴に保存できた直後に gameEnd を取る', async () => {
        seedPlayingQ4();
        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        fireEvent.click(await screen.findByText(/第4Q終了|Q4終了/));
        fireEvent.click(await screen.findByText('試合を終了する'));
        fireEvent.click(await screen.findByText('保存して終了'));

        await waitFor(() => expect(reasons()).toContain('gameEnd'));
    });
});
```

- [ ] **Step 2: テストを走らせ、落ちることを確かめる**

Run:
```bash
npx vitest run src/App.mirrorSnapshotReason.test.tsx
```
Expected: FAIL — `saveSnapshot` が引数なしで呼ばれているため `reasons()` が `[undefined]` になり、`toContain('startup')` などが落ちる。「履歴に保存できた直後に gameEnd を取る」は呼び出し自体が無いので落ちる

- [ ] **Step 3: `App.tsx` の呼び出しに `reason` を渡す**

3か所を直す。

起動時の effect（`hasAppData()` を見ている `useEffect` の中）:
```ts
      saveSnapshot();
```
→
```ts
      saveSnapshot('startup');
```

`phase === 'finished'` の effect:
```ts
  // 試合終了時は即座にミラーバックアップ
  useEffect(() => {
    if (phase === 'finished') {
      saveSnapshot();
    }
  }, [phase]);
```
→
```ts
  // 試合終了の画面が出た時点で即座にミラーバックアップ。
  // ここで写るのは「まだ履歴に保存していない試合」なので、区切りではなく
  // 進行中データの保護＝定期枠に入れる。「試合単位で戻る」ための世代は
  // 保存できた直後に別途取る（handleGameFinished）
  useEffect(() => {
    if (phase === 'finished') {
      saveSnapshot('periodic');
    }
  }, [phase]);
```

`RestorePrompt` の `onDismiss`:
```ts
          saveSnapshot();
```
→
```ts
          saveSnapshot('startup');
```

- [ ] **Step 4: `gameEnd` を保存できた直後に足す**

`handleGameFinished` の中、`clearGameSession()` の直後に1行足す。

差し替え前:
```ts
    clearGameSession();
    // 音声メモは手入力のための下書きなので、試合が終われば役目は終わり
    voiceMemo.clearAll();
    setScreen('home');
```

差し替え後:
```ts
    clearGameSession();
    // 「あの試合を保存した直後」へ戻れるようにする。ここが区切りの世代で、
    // 試合中の自動保存には押し出されない（mirrorBackupRetention）。
    // phase === 'finished' の世代はまだ保存前の状態なので別物
    saveSnapshot('gameEnd');
    // 音声メモは手入力のための下書きなので、試合が終われば役目は終わり
    voiceMemo.clearAll();
    setScreen('home');
```

- [ ] **Step 5: テストが通ることを確かめる**

Run:
```bash
npx vitest run src/App.mirrorSnapshotReason.test.tsx
```
Expected: PASS（3件）

- [ ] **Step 6: App の既存テストが壊れていないことを確かめる**

Run:
```bash
npx vitest run src/App
```
Expected: PASS（全件）

- [ ] **Step 7: コミット**

```bash
git add src/App.tsx src/App.mirrorSnapshotReason.test.tsx
git commit -m "feat(mirror): 世代の理由を呼び出し元から渡し、履歴に保存できた直後を区切りにする"
```

---

### Task 4: 一覧を meta ベースにし、理由ラベルと `beforeRestore` を入れる

**Files:**
- Modify: `src/components/Settings/MirrorBackupList.tsx`
- Modify: `src/components/Settings/MirrorBackupList.test.tsx`
- Modify: `src/components/Settings/AppSettingsModal.css`（クラス名の改称1つ）

**Interfaces:**
- Consumes: Task 2 の `getSnapshotMetas()` / `getSnapshot(timestamp)` / `saveSnapshot(reason, now?)`、既存の `restoreSnapshot(snapshot)`
- Produces: なし

**背景（実装者向け）:** いまの一覧は `getAllSnapshots()` で全世代の `entries` をメモリへ載せている。また復元は `restoreSnapshot(pending)` をいきなり呼ぶので、**誤った世代を選ぶと現在のデータが上書きされて戻る手段が無い**。一覧に理由が出て選びやすくなるぶん復元の敷居は下がるので、その手前に `beforeRestore` を置く。

v1.10 で入れた「書き戻しに失敗したら、リロードせずに失敗を伝える」の2件は**挙動を変えずに通し続けること**。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Settings/MirrorBackupList.test.tsx` を差し替える。冒頭のモックを次へ:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MirrorBackupList } from './MirrorBackupList';
import type { MirrorSnapshot, SnapshotMeta, SnapshotReason } from '../../utils/mirrorBackup';

const getSnapshotMetas = vi.hoisted(() => vi.fn());
const getSnapshot = vi.hoisted(() => vi.fn());
const restoreSnapshot = vi.hoisted(() => vi.fn());
const saveSnapshot = vi.hoisted(() => vi.fn());
vi.mock('../../utils/mirrorBackup', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../utils/mirrorBackup')>()),
    getSnapshotMetas,
    getSnapshot,
    restoreSnapshot,
    saveSnapshot,
}));

function metaOf(timestamp: number, reason?: SnapshotReason): SnapshotMeta {
    return { timestamp, reason };
}

function snapshotOf(timestamp: number, keys: string[], reason?: SnapshotReason): MirrorSnapshot {
    return { timestamp, reason, entries: Object.fromEntries(keys.map(k => [k, '[]'])) };
}

const RELOAD = vi.fn();

beforeEach(() => {
    getSnapshotMetas.mockReset();
    getSnapshot.mockReset();
    restoreSnapshot.mockReset();
    saveSnapshot.mockReset();
    // 本物は「全部書けたら true」を返す（mirrorBackup.restoreSnapshot）
    restoreSnapshot.mockReturnValue(true);
    saveSnapshot.mockResolvedValue(undefined);
    RELOAD.mockReset();
});

afterEach(cleanup);
```

既存の各テストを、`getAllSnapshots.mockResolvedValue([...])` → `getSnapshotMetas.mockResolvedValue([...])`（`metaOf` を使う）へ置き換える。復元を実行するテストでは `getSnapshot.mockResolvedValue(snapshotOf(...))` も必要。

そのうえで、次のテストを足す:

```tsx
describe('MirrorBackupList: 世代の理由', () => {
    it('理由ごとのラベルを出す', async () => {
        getSnapshotMetas.mockResolvedValue([
            metaOf(new Date('2026-09-11T10:00:00').getTime(), 'gameEnd'),
            metaOf(new Date('2026-09-10T09:00:00').getTime(), 'startup'),
            metaOf(new Date('2026-09-09T09:00:00').getTime(), 'beforeRestore'),
            metaOf(new Date('2026-09-08T09:00:00').getTime(), 'periodic'),
        ]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        const items = await screen.findAllByRole('listitem');
        expect(items[0].textContent).toContain('試合を保存した直後');
        expect(items[1].textContent).toContain('アプリを開いたとき');
        expect(items[2].textContent).toContain('復元を実行する直前');
        expect(items[3].textContent).toContain('記録中の自動保存');
    });

    // v1 が書いた世代は reason を持たない。空欄にせず定期と同じ扱いで見せる
    it('理由を持たない旧世代も、記録中の自動保存として見せる', async () => {
        getSnapshotMetas.mockResolvedValue([metaOf(new Date('2026-09-08T09:00:00').getTime())]);

        render(<MirrorBackupList onRestored={RELOAD} />);

        const items = await screen.findAllByRole('listitem');
        expect(items[0].textContent).toContain('記録中の自動保存');
    });
});

describe('MirrorBackupList: 復元の前に退避する', () => {
    const snap = snapshotOf(new Date('2026-09-11T10:00:00').getTime(), ['minibasket-game-history'], 'gameEnd');

    beforeEach(() => {
        getSnapshotMetas.mockResolvedValue([metaOf(snap.timestamp, 'gameEnd')]);
        getSnapshot.mockResolvedValue(snap);
    });

    // 誤った世代を選ぶと現在のデータが上書きされる。戻る道を先に作っておく
    it('書き戻す前に beforeRestore の世代を取る', async () => {
        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
        fireEvent.click(await screen.findByRole('button', { name: '戻す' }));

        await waitFor(() => expect(restoreSnapshot).toHaveBeenCalled());
        expect(saveSnapshot).toHaveBeenCalledWith('beforeRestore');
        // 退避が先。あとだと上書き後のデータを写してしまい、意味がない
        expect(saveSnapshot.mock.invocationCallOrder[0])
            .toBeLessThan(restoreSnapshot.mock.invocationCallOrder[0]);
    });

    it('確認ダイアログに、その世代の理由を出す', async () => {
        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));

        expect(await screen.findByText(/試合を保存した直後/)).toBeTruthy();
    });

    it('読み込めなかった世代は書き戻さず、失敗を伝える', async () => {
        getSnapshot.mockResolvedValue(null);

        render(<MirrorBackupList onRestored={RELOAD} />);
        fireEvent.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
        fireEvent.click(await screen.findByRole('button', { name: '戻す' }));

        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
        expect(restoreSnapshot).not.toHaveBeenCalled();
        expect(RELOAD).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: テストを走らせ、落ちることを確かめる**

Run:
```bash
npx vitest run src/components/Settings/MirrorBackupList.test.tsx
```
Expected: FAIL — `getSnapshotMetas` を呼んでいないため一覧が出ず、`findAllByRole('listitem')` などがタイムアウトする

- [ ] **Step 3: `MirrorBackupList` を書き換える**

`src/components/Settings/MirrorBackupList.tsx` を次の内容へ差し替える:

```tsx
import { useEffect, useState } from 'react';
import { getSnapshot, getSnapshotMetas, restoreSnapshot, saveSnapshot } from '../../utils/mirrorBackup';
import type { SnapshotMeta, SnapshotReason } from '../../utils/mirrorBackup';
import { ConfirmModal } from '../Modal';

interface MirrorBackupListProps {
    /** 書き戻しが完了したときに呼ばれる（呼び出し側でリロードする） */
    onRestored: () => void;
}

/**
 * 世代が何の時点かを表す短い文。
 *
 * 時刻だけを出していた頃は、記録者が「あの試合の直後はどれか」を推測する
 * しかなかった。理由が出れば時刻を数えずに選べる。
 * 理由を持たない世代（v1 が書いたもの）は、実態がほぼ試合中の自動保存なので
 * 定期と同じ扱いで見せる。
 */
const REASON_LABEL: Record<SnapshotReason, string> = {
    gameEnd: '試合を保存した直後',
    startup: 'アプリを開いたとき',
    beforeRestore: '復元を実行する直前',
    periodic: '記録中の自動保存',
};

function reasonLabel(reason?: SnapshotReason): string {
    return REASON_LABEL[reason ?? 'periodic'];
}

/**
 * IndexedDBに溜めている自動バックアップの世代一覧。
 *
 * 一覧は日時と理由だけを読む（getSnapshotMetas）。全世代の中身を載せていた頃は、
 * 履歴が 3MB ある利用者で 10世代 30MB をメモリへ読んでいた。
 *
 * 書き戻しは全キーの上書きなので、必ず確認を挟む。さらに実行の直前に
 * 現在の状態を beforeRestore として退避する —— 誤った世代を選んだときに
 * 戻る道が無いため。
 */
export function MirrorBackupList({ onRestored }: MirrorBackupListProps) {
    const [metas, setMetas] = useState<SnapshotMeta[] | null>(null);
    const [pending, setPending] = useState<SnapshotMeta | null>(null);
    // 書き戻しに失敗した（restoreSnapshot が false を返した、または世代を読めなかった）。
    // 握って onRestored を呼ぶと、データは元のままなのにリロードだけが走り、
    // 利用者は「戻せた」と思い込む。RestorePrompt と同じ扱いにそろえる
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        // getSnapshotMetas は内部で例外を握って [] を返すため、ここでは待つだけでよい
        getSnapshotMetas().then(list => {
            if (alive) setMetas(list);
        });
        return () => { alive = false; };
    }, []);

    if (metas === null) {
        return <p className="section-description">読み込み中…</p>;
    }

    if (metas.length === 0) {
        return (
            <p className="section-description">
                自動バックアップはまだありません。試合を記録すると自動で作られます。
            </p>
        );
    }

    const handleRestore = async (target: SnapshotMeta) => {
        setPending(null);

        const snapshot = await getSnapshot(target.timestamp);
        if (!snapshot) {
            setFailed(true);
            return;
        }

        // 退避が先。あとだと上書き後のデータを写すことになり、戻る道にならない
        await saveSnapshot('beforeRestore');

        if (!restoreSnapshot(snapshot)) {
            setFailed(true);
            return;
        }
        onRestored();
    };

    return (
        <>
            {failed && (
                <p className="status-message error" role="alert">
                    この時点に戻せませんでした。端末の空き容量が足りない可能性があります。
                    空きを作ってからもう一度お試しください（データは元のままです）。
                </p>
            )}
            <ul className="mirror-backup-list">
                {metas.map(meta => (
                    <li key={meta.timestamp} className="mirror-backup-item">
                        <span className="mirror-backup-when">
                            {new Date(meta.timestamp).toLocaleString('ja-JP')}
                        </span>
                        <span className="mirror-backup-reason">
                            {reasonLabel(meta.reason)}
                        </span>
                        <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => { setFailed(false); setPending(meta); }}
                        >
                            この時点に戻す
                        </button>
                    </li>
                ))}
            </ul>

            {pending && (
                <ConfirmModal
                    title="この時点に戻しますか？"
                    message={
                        `${new Date(pending.timestamp).toLocaleString('ja-JP')}（${reasonLabel(pending.reason)}）の状態に戻します。\n` +
                        '現在のチーム・試合履歴・設定は、この時点の内容で上書きされます。\n' +
                        '戻したあとアプリを再読み込みします。'
                    }
                    note="いまの状態は、戻す直前に自動で控えを取ります。選び間違えたときはその世代から戻せます。"
                    confirmLabel="戻す"
                    cancelLabel="キャンセル"
                    onConfirm={() => { void handleRestore(pending); }}
                    onCancel={() => setPending(null)}
                />
            )}
        </>
    );
}
```

- [ ] **Step 4: CSS のクラス名を実態に合わせる**

`.mirror-backup-count` は「N項目」を出すための名前だった。いまそこに入るのは理由なので改称する（`white-space: nowrap` は短い語が途中で折れないように残す）。

`src/components/Settings/AppSettingsModal.css` の次を差し替える:

```css
.app-settings-modal .mirror-backup-count {
    color: var(--text-secondary);
    white-space: nowrap;
}
```

```css
.app-settings-modal .mirror-backup-reason {
    color: var(--text-secondary);
    white-space: nowrap;
}
```

`.mirror-backup-count` は他から使われていないことを確かめてから消すこと:

```bash
grep -rn "mirror-backup-count" src
```
Expected: 無出力（改称後）

- [ ] **Step 5: テストが通ることを確かめる**

Run:
```bash
npx vitest run src/components/Settings/MirrorBackupList.test.tsx
```
Expected: PASS（既存の失敗系2件を含め全件）

- [ ] **Step 6: 全体を通す**

Run:
```bash
npm run lint && npx tsc -b && npm run typecheck:test && npm test
```
Expected: lint / tsc いずれも無出力、単体テストは全件 PASS

- [ ] **Step 7: コミット**

```bash
git add src/components/Settings/MirrorBackupList.tsx src/components/Settings/MirrorBackupList.test.tsx src/components/Settings/AppSettingsModal.css
git commit -m "feat(mirror): 世代一覧に理由を出し、復元の直前に現在の状態を退避する"
```

---

## 完了時の確認

- [ ] **全体を通す**

Run:
```bash
npm run lint && npx tsc -b && npm run typecheck:test && npm test && npm run build && npm run test:e2e
```
Expected: lint / tsc いずれも無出力、単体テスト全件 PASS、ビルド成功、e2e 8件 PASS

e2e の `mirrorRestore.spec.ts` は「アプリにスナップショットを取らせて、localStorage を消して、復元プロンプトから戻す」流れを実ブラウザで通す。スキーマを v2 へ上げたので、**ここが通ることがスキーマ変更の実地確認になる**。

- [ ] **実ブラウザで一覧を見る**

`npm run dev` で開き、設定 → データ管理の世代一覧を確認する。

- 日時の隣に理由（「記録中の自動保存」など）が出ていること
- 「この時点に戻す」→ 確認ダイアログに理由と、退避の案内が出ていること
- ブラウザの開発者ツールで IndexedDB `mbc-mirror-backup` を開き、`snapshots` に `reason` インデックスがあること
