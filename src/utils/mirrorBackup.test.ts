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
