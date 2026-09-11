import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// モジュール内部のスロットル状態をテストごとにリセットするため動的import
async function freshModule() {
    vi.resetModules();
    return await import('./mirrorBackup');
}

describe('mirrorBackup', () => {
    beforeEach(() => {
        localStorage.clear();
        indexedDB.deleteDatabase('mbc-mirror-backup');
    });

    it('collectAppData: アプリのキーのみ収集する', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        localStorage.setItem('mbc_gemini_api_key', 'k');
        localStorage.setItem('unrelated-key', 'x');
        const data = m.collectAppData();
        expect(Object.keys(data).sort()).toEqual(['mbc_gemini_api_key', 'minibasket-my-teams']);
        expect(m.hasAppData()).toBe(true);
    });

    it('saveSnapshot→getLatestSnapshotで最新世代が取得できる', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await m.saveSnapshot('periodic', 1000);
        localStorage.setItem('minibasket-my-teams', '["v2"]');
        await m.saveSnapshot('periodic', 2000);

        const latest = await m.getLatestSnapshot();
        expect(latest).not.toBeNull();
        expect(latest!.timestamp).toBe(2000);
        expect(latest!.entries['minibasket-my-teams']).toBe('["v2"]');
    });

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

    // レビュー指摘(Important)。saveSnapshotはput直後に「いま書いた世代(now)も
    // 含めた」配列でselectExpiredSnapshotsを呼んでいた。既存レコードとnowが
    // 同じtimestampで衝突すると、安定ソートで既存側が先に数えられ、枠が
    // 満ちていれば新しい（＝いま書いた）ほうがexpiredに落ちる。put直後に
    // 消えるので、saveSnapshotはtrueを返すのに実際は何も残らない
    it('既存世代と同じtimestampで保存しても、書いた世代は残る（衝突しても消えない）', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        // 定期3枠(MAX_PERIODIC)をちょうど埋める。最も古いのが1000
        await m.saveSnapshot('periodic', 1000);
        await m.saveSnapshot('periodic', 2000);
        await m.saveSnapshot('periodic', 3000);

        // 最も古い世代(1000)と同じtimestampで再保存する
        // （端末の時計が巻き戻った、あるいは同一ミリ秒に2回書いた状況を模す）
        localStorage.setItem('minibasket-my-teams', '["overwritten"]');
        await expect(m.saveSnapshot('periodic', 1000)).resolves.toBe(true);

        const metas = await m.getSnapshotMetas();
        expect(metas.map(s => s.timestamp).sort((a, b) => a - b)).toEqual([1000, 2000, 3000]);
        const overwritten = await m.getSnapshot(1000);
        expect(overwritten?.entries['minibasket-my-teams']).toBe('["overwritten"]');
    });

    // レビュー指摘(Important)。端末の時計が未来へずれてから戻った場合、未来の
    // timestampを持つ定期世代が枠(3)を満たしているだけで、以後の（正常な時刻の）
    // 定期スナップショットは毎回「put直後にnow自身がexpired扱いされて消える」を
    // 繰り返す。saveSnapshotはtrueを返し続けるので、定期バックアップが恒久的に
    // 沈黙していることに誰も気づけない
    it('未来timestampの定期世代が枠を満たしていても、新しい定期世代は残る', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '[]');
        const future = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1年後
        await m.saveSnapshot('periodic', future);
        await m.saveSnapshot('periodic', future + 1000);
        await m.saveSnapshot('periodic', future + 2000);

        // 時計が正常な現在時刻に戻った状態を模す（3つの未来世代より古い）
        const now = Date.now();
        localStorage.setItem('minibasket-my-teams', '["after-clock-fix"]');
        await expect(m.saveSnapshot('periodic', now)).resolves.toBe(true);

        const saved = await m.getSnapshot(now);
        expect(saved?.entries['minibasket-my-teams']).toBe('["after-clock-fix"]');
    });

    // Minor指摘。既存の旧世代テストは先にsaveSnapshotでv2のDBを作ってから
    // reason無しレコードを流し込んでいたため、onupgradeneededの
    // 「ストアはあるがインデックスが無い」分岐（v1→v2への昇格）を踏んでいなかった。
    // v1相当のスキーマ（snapshotsストアのみ・インデックス無し・version 1）を
    // 手で作ってから本体に開かせ、インデックスが張られて読めることを確かめる
    it('v1相当のDB（ストアのみ・インデックス無し）を開くと、インデックスが張られて読める', async () => {
        await new Promise<void>((resolve, reject) => {
            const open = indexedDB.open('mbc-mirror-backup', 1);
            open.onupgradeneeded = () => {
                open.result.createObjectStore('snapshots', { keyPath: 'timestamp' });
            };
            open.onsuccess = () => {
                const db = open.result;
                const tx = db.transaction('snapshots', 'readwrite');
                tx.objectStore('snapshots').put({ timestamp: 500, entries: { 'minibasket-my-teams': '["v1"]' } });
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => reject(tx.error);
            };
            open.onerror = () => reject(open.error);
        });

        const m = await freshModule();
        const metas = await m.getSnapshotMetas();
        expect(metas).toEqual([{ timestamp: 500, reason: undefined }]);

        const snapshot = await m.getSnapshot(500);
        expect(snapshot?.entries['minibasket-my-teams']).toBe('["v1"]');
    });

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

    it('空のlocalStorageではスナップショットを作らない（既存世代を守る）', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await m.saveSnapshot('periodic', 1000);
        localStorage.clear();
        await m.saveSnapshot('periodic', 2000);
        const latest = await m.getLatestSnapshot();
        expect(latest!.timestamp).toBe(1000);
    });

    it('restoreSnapshot: エントリをlocalStorageへ書き戻す', async () => {
        const m = await freshModule();
        m.restoreSnapshot({ timestamp: 1, entries: { 'minibasket-my-teams': '["restored"]' } });
        expect(localStorage.getItem('minibasket-my-teams')).toBe('["restored"]');
    });

    // レビュー指摘: saveSnapshot は Promise<void> だったため、IndexedDB書き込みが
    // 失敗してもawaitは成功扱いで通過していた（beforeRestoreの退避がまさにこれで、
    // 退避が取れていないのに書き戻しが走ってしまう）。戻り値で書けたかを判別できる
    // ようにする
    it('saveSnapshot: 書き込めたら true を返す', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await expect(m.saveSnapshot('periodic', 1000)).resolves.toBe(true);
    });

    it('saveSnapshot: IndexedDBが使えない環境では false を返す', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        // openDb内部のindexedDB.openが例外を投げる状況（プライベートブラウズ等）を再現
        const openSpy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
            throw new Error('IndexedDB unavailable');
        });
        try {
            await expect(m.saveSnapshot('periodic', 1000)).resolves.toBe(false);
        } finally {
            openSpy.mockRestore();
        }
    });

    // getSnapshotMetasも同じ形で例外を握って無効化する。一覧表示（MirrorBackupList）が
    // 例外で落ちないのはこの契約に依っている
    it('getSnapshotMetas: IndexedDBが使えない環境では空配列を返す', async () => {
        const m = await freshModule();
        const openSpy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
            throw new Error('IndexedDB unavailable');
        });
        try {
            await expect(m.getSnapshotMetas()).resolves.toEqual([]);
        } finally {
            openSpy.mockRestore();
        }
    });

    // 「空データなので何もしない」「起動世代は今日すでにある」の2つの早期returnは、
    // 書き込みの失敗ではなく意図どおりの不実行なので true を返す。ここを false に
    // すると、呼び出し側（handleRestore）が正常な不実行を書き込み失敗と誤認する
    it('saveSnapshot: 空データによる早期returnは true を返す（失敗ではない）', async () => {
        const m = await freshModule();
        // localStorageは空のまま
        await expect(m.saveSnapshot('periodic', 1000)).resolves.toBe(true);
    });

    it('saveSnapshot: 起動世代が今日すでにある早期returnは true を返す（失敗ではない）', async () => {
        const m = await freshModule();
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        const morning = new Date(2026, 8, 11, 8, 30).getTime();
        const evening = new Date(2026, 8, 11, 20, 0).getTime();
        await expect(m.saveSnapshot('startup', morning)).resolves.toBe(true);
        await expect(m.saveSnapshot('startup', evening)).resolves.toBe(true);
    });

    it('maybeSnapshot: 30秒以内の連続呼び出しはスキップされる', async () => {
        const m = await freshModule();
        // Dateのみ偽装する（setTimeoutまで偽装するとfake-indexeddbの内部処理が止まる）
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-07-04T10:00:00Z'));
        localStorage.setItem('minibasket-my-teams', '["v1"]');
        await m.maybeSnapshot();
        localStorage.setItem('minibasket-my-teams', '["v2"]');
        await m.maybeSnapshot(); // 30秒未満なのでスキップ
        const latest = await m.getLatestSnapshot();
        expect(latest!.entries['minibasket-my-teams']).toBe('["v1"]');

        vi.setSystemTime(new Date('2026-07-04T10:00:31Z'));
        await m.maybeSnapshot();
        const latest2 = await m.getLatestSnapshot();
        expect(latest2!.entries['minibasket-my-teams']).toBe('["v2"]');
        vi.useRealTimers();
    });
});
